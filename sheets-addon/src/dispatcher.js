/**
 * dispatcher.js — what actually happens when a trigger fires.
 *
 * Two entry points, both of which must survive anything the sheet throws
 * at them: a trigger that throws leaves no visible error anywhere the
 * operator will look, so every failure has to end up in a status cell or
 * on the rule card instead.
 *
 * WHICH ROWS A RUN IS ALLOWED TO TOUCH
 * This is the whole safety story, and it is worth reading before
 * changing anything here. `onChange` reports a coarse change type and
 * does not say which cells changed, so the naive implementation
 * re-evaluates the entire sheet on every edit. On a sheet that already
 * holds 500 matching rows, the first edit anyone makes then sends 500
 * paid messages to real people. Three separate limits prevent that:
 *
 *   1. On Change looks ONLY at the rows the change actually touched
 *      (the active range). No active range means no candidates.
 *   2. New Row Added looks only at rows past the watermark recorded when
 *      the rule was saved, so pre-existing rows are never "new".
 *   3. Every send carries a per-row idempotency key, so even if 1 and 2
 *      were wrong, the CRM's UNIQUE constraint refuses the second send
 *      for a row rather than merely making it unlikely.
 *
 * Only the daily reminder sweep looks at every row, which is the entire
 * point of a daily reminder sweep.
 */
const ReplaiDispatcher = {
  /**
   * Sends attempted in one run. One API call per row (see send.js), each
   * subject to the CRM's 120-per-minute per-key rate limit, inside Apps
   * Script's 6-minute execution ceiling. 100 leaves room for the reads,
   * the writes and a few retries; anything left over is picked up by the
   * next run, which for a reminder is tomorrow and for a change is the
   * next edit.
   */
  MAX_SENDS_PER_RUN: 100,

  /** Stop before Apps Script kills the run mid-write. */
  TIME_BUDGET_MS: 4.5 * 60 * 1000,

  /** Rows examined per rule per run. Reading is cheap; this is a backstop. */
  MAX_ROWS_SCANNED: 5000,

  /** Reasons shown on a rule card after a preview. */
  MAX_REASONS_REPORTED: 5,

  // ----------------------------------------------------------------
  // entry points
  // ----------------------------------------------------------------

  /** How long to wait for a run already in progress before giving up. */
  LOCK_WAIT_MS: 5000,

  /**
   * Installed Edit trigger: serves New Row Added and On Change.
   *
   * `e.range` is the whole reason this is an Edit trigger and not a Change
   * trigger — it is the only event that says which cells the user
   * actually changed. See the header of triggers.js.
   */
  onEdit: function (event) {
    // Before anything that could fail or bail: this is the only evidence
    // that Google actually invoked us, and the sidebar needs it to tell
    // "armed" apart from "armed on paper".
    ReplaiTriggers.recordHeartbeat();
    ReplaiDispatcher.serialised_(function () {
      const rules = ReplaiRules.activeByTrigger(['new_row', 'on_change']);
      for (let i = 0; i < rules.length; i++) {
        ReplaiDispatcher.safeRun_(rules[i], { event: event, source: 'edit' });
      }
    });
  },

  /**
   * Installed form-submit trigger: a linked Google Form added a row.
   *
   * An Edit trigger does not fire for a form submission, so without this
   * a New Row Added rule would miss the case its own description
   * promises. The event carries `e.range` for the new row.
   */
  onFormSubmit: function (event) {
    ReplaiTriggers.recordHeartbeat();
    ReplaiDispatcher.serialised_(function () {
      const rules = ReplaiRules.activeByTrigger(['new_row', 'on_change']);
      for (let i = 0; i < rules.length; i++) {
        ReplaiDispatcher.safeRun_(rules[i], { event: event, source: 'form' });
      }
    });
  },

  /**
   * The reminder sweep. Runs hourly; sends only what is due this hour.
   *
   * The trigger deliberately knows nothing about when any rule wants to
   * run — it just wakes up every hour and asks. That is what lets each
   * rule keep its own time, weekday or date without needing a trigger of
   * its own, which Google's 20-per-user cap would not allow. See the
   * header of schedule.js.
   */
  onDaily: function () {
    ReplaiTriggers.recordHeartbeat();
    ReplaiDispatcher.serialised_(function () {
      const now = ReplaiSheets.nowParts();
      // No clock means no safe decision. Skipping one sweep costs at most
      // an hour; guessing could fire every rule on the wrong day.
      if (!now) {
        console.error('[replai] reminder sweep skipped: no readable clock');
        return;
      }

      const today = ReplaiSchedule.isoOf(now);
      // The document's old single hour, for rules saved before schedules
      // existed. Read once rather than per rule.
      const fallbackHour = ReplaiRules.getSettings().reminderHour;
      const rules = ReplaiRules.activeByTrigger(['reminder']);

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (
          !ReplaiSchedule.isDue(
            rule.schedule,
            now,
            rule.lastFiredOn,
            fallbackHour
          )
        ) {
          continue;
        }

        ReplaiDispatcher.safeRun_(rule, {});
        // Marked after the attempt, not after a success: "checked today"
        // is the claim. safeRun_ already swallows and records failures,
        // and retrying hourly for the rest of the day would re-scan the
        // sheet 20-odd times for a rule that is simply failing.
        ReplaiRules.recordReminderFired(rule.id, today);
      }
    });
  },

  /**
   * One run at a time per document.
   *
   * Two things make overlapping runs likely rather than theoretical.
   * Writing the status column is itself a change to the spreadsheet, so
   * it can re-fire the onChange trigger; and a fast typist generates
   * several change events inside one run. Neither can produce a duplicate
   * message — the per-row idempotency key is enforced by the CRM — but
   * both waste the account's API budget re-checking rows that are already
   * done, and a bailing second run is cheaper than a redundant one.
   *
   * If the lock cannot be taken the run is abandoned, not queued: the
   * work is not lost, because whichever run holds the lock is doing it.
   */
  serialised_: function (body) {
    let lock = null;
    try {
      lock = LockService.getDocumentLock();
      if (!lock.tryLock(ReplaiDispatcher.LOCK_WAIT_MS)) {
        console.log('[replai] a run is already in progress; skipping this one');
        return;
      }
    } catch (err) {
      // Never let lock trouble stop real work. Without the lock the run
      // is merely less efficient, not incorrect.
      console.warn('[replai] could not take the document lock: ' + err);
      lock = null;
    }

    try {
      body();
    } finally {
      if (lock) {
        try {
          lock.releaseLock();
        } catch (err) {
          console.warn('[replai] could not release the lock: ' + err);
        }
      }
    }
  },

  /**
   * Run a rule against ONE named row, for real, on demand.
   *
   * This exists because of a hard platform limitation, not as a
   * convenience. Google's docs on testing editor add-ons state plainly
   * that **installable triggers aren't supported in a test deployment** —
   * they are created and then left permanently disabled. So while an
   * add-on is unpublished there is no way for an edit to fire the engine
   * at all, and the whole send path would be untestable without this.
   *
   * It is also the right feature to have permanently: "does this rule
   * work?" is otherwise only answerable by waiting for a real trigger and
   * reading the result off someone's phone.
   *
   * Deliberately one row, named by the caller. Everything else about the
   * run is identical to a triggered one — same conditions, same mapping,
   * same idempotency key, same status write-back — so a test send and a
   * later real run for that row de-duplicate, which is correct: the row
   * genuinely did get its message.
   */
  runRow: function (ruleId, rowNumber) {
    const rule = ReplaiRules.get(ruleId);
    if (!rule) return { ok: false, message: 'That rule no longer exists.' };

    if (!ReplaiAuth.hasKey()) {
      return {
        ok: false,
        message:
          'Connect your Replai API key first — this sends a real message and needs a key to send it with.',
      };
    }

    const row = parseInt(rowNumber, 10);
    if (isNaN(row) || row < ReplaiSheets.FIRST_DATA_ROW) {
      return {
        ok: false,
        message:
          'Enter a row number from ' +
          ReplaiSheets.FIRST_DATA_ROW +
          ' downwards. Row 1 holds the column names.',
      };
    }

    let summary = null;
    ReplaiDispatcher.serialised_(function () {
      summary = ReplaiDispatcher.run_(rule, { rows: [row] });
    });

    if (!summary) {
      return {
        ok: false,
        message:
          'Another run is in progress for this spreadsheet. Try again in a moment.',
      };
    }

    return {
      ok: true,
      sent: summary.sent,
      duplicate: summary.duplicate,
      skipped: summary.skipped,
      failed: summary.failed,
      matched: summary.matched,
      scanned: summary.scanned,
      reasons: summary.reasons,
      message: ReplaiDispatcher.describeRow_(summary, row),
    };
  },

  /** Plain-language outcome for a single deliberate row send. */
  describeRow_: function (summary, row) {
    if (summary.sent > 0) {
      // Not "delivered": the CRM fans out to Meta after answering, so
      // this add-on cannot see the delivery. The Inbox can.
      return (
        'Row ' + row + ' sent. Check the Replai Inbox to confirm delivery.'
      );
    }
    if (summary.duplicate > 0) {
      return (
        'Row ' +
        row +
        ' has already been sent by this rule, so nothing was sent again.'
      );
    }
    if (summary.skipped > 0 || summary.failed > 0) {
      return summary.reasons.length
        ? summary.reasons[0]
        : 'Row ' + row + ' could not be sent. Check its status cell.';
    }
    if (summary.scanned === 0) {
      return 'Row ' + row + ' is empty or past the end of the sheet.';
    }
    return 'Row ' + row + " does not match this rule's conditions.";
  },

  /**
   * Evaluate a rule and report what WOULD happen, sending nothing.
   *
   * Worth having for its own sake: the alternative way to find out
   * whether a rule's conditions are right is to let it send real
   * messages and read the results off people's phones.
   */
  preview: function (ruleId) {
    const rule = ReplaiRules.get(ruleId);
    if (!rule) return { ok: false, message: 'That rule no longer exists.' };

    const summary = ReplaiDispatcher.run_(rule, { preview: true });
    return {
      ok: true,
      matched: summary.matched,
      sendable: summary.sendable,
      skipped: summary.skipped,
      scanned: summary.scanned,
      reasons: summary.reasons,
      message: summary.message,
    };
  },

  // ----------------------------------------------------------------
  // the run
  // ----------------------------------------------------------------

  /**
   * A rule that throws must not stop the rules after it. Triggers run
   * unattended, so an uncaught error would silently disable every later
   * rule in the document with nothing to show the operator.
   */
  safeRun_: function (rule, options) {
    try {
      ReplaiDispatcher.run_(rule, options);
    } catch (err) {
      console.error('[replai] rule ' + rule.id + ' failed: ' + err);
      ReplaiRules.recordRun(rule.id, {
        message: 'Run failed: ' + String(err),
      });
    }
  },

  run_: function (rule, options) {
    const opts = options || {};
    const preview = opts.preview === true;
    const started = Date.now();

    const summary = {
      matched: 0,
      sendable: 0,
      sent: 0,
      duplicate: 0,
      failed: 0,
      skipped: 0,
      scanned: 0,
      reasons: [],
      message: '',
    };

    // ---- the key, before anything expensive ----
    // A trigger runs as whoever installed it. If that person's key is
    // gone or dead, no row in this rule can send, and the rule is flagged
    // so someone can take it over instead of wondering why messages
    // stopped (plan §14.5).
    if (!preview && !ReplaiAuth.hasKey()) {
      const reason =
        'No Replai API key is saved for ' +
        (ReplaiAuth.getUserEmail() || 'this account') +
        '. Open the Replai sidebar and reconnect, or take the rule over from another account.';
      ReplaiRules.flagAttention(rule.id, reason);
      summary.message = reason;
      ReplaiRules.recordRun(rule.id, summary);
      return summary;
    }

    // ---- read the sheet once ----
    const sheet = ReplaiSheets.readRows(rule.sheetName);
    if (!sheet.ok) {
      summary.message = sheet.message;
      if (!preview) ReplaiRules.recordRun(rule.id, summary);
      return summary;
    }

    const candidates = ReplaiDispatcher.candidateRows_(rule, sheet, opts);
    if (!candidates.length) {
      summary.message = preview
        ? 'No rows to check yet.'
        : 'Nothing new to check.';
      if (!preview) ReplaiRules.recordRun(rule.id, summary);
      return summary;
    }

    const ctx = {
      today: ReplaiSheets.today(),
      dateOrder: ReplaiSheets.getDateOrder(),
    };

    const statuses = {};
    let fatal = '';

    for (let i = 0; i < candidates.length; i++) {
      if (Date.now() - started > ReplaiDispatcher.TIME_BUDGET_MS) {
        summary.message =
          'Stopped early to stay inside Google\u2019s time limit. The rest will be picked up on the next run.';
        break;
      }
      if (!preview && summary.sent >= ReplaiDispatcher.MAX_SENDS_PER_RUN) {
        summary.message =
          'Reached this run\u2019s limit of ' +
          ReplaiDispatcher.MAX_SENDS_PER_RUN +
          ' messages. The rest will be picked up on the next run.';
        break;
      }

      const rowNumber = candidates[i];
      const offset = rowNumber - sheet.firstRow;
      const values = sheet.values[offset];
      if (!values) continue;
      const display = sheet.display[offset] || values;
      summary.scanned++;

      // ---- conditions ----
      const getCell = function (columnName) {
        return ReplaiRowMap.cell(values, sheet.headerIndex, columnName);
      };
      if (!ReplaiConditions.evaluateAll(rule.conditions, getCell, ctx)) {
        continue;
      }
      summary.matched++;

      // ---- payload ----
      const built = ReplaiRowMap.buildRecipient(
        rule,
        values,
        display,
        sheet.headerIndex
      );
      if (!built.ok) {
        summary.skipped++;
        ReplaiDispatcher.noteReason_(summary, rowNumber, built.reason);
        if (!preview) {
          statuses[rowNumber] =
            'Skipped · ' + built.reason + ' · ' + ReplaiSheets.stamp();
        }
        continue;
      }
      summary.sendable++;

      if (preview) continue;

      // ---- send ----
      const keySource = ReplaiRowMap.keySource({
        spreadsheetId: ReplaiSheets.spreadsheetId(),
        sheetName: rule.sheetName,
        ruleId: rule.id,
        phone: built.recipient.to,
        rowNumber: rowNumber,
        fireDate: ReplaiRowMap.usesFireDate(rule.triggerType) ? ctx.today : '',
      });

      const result = ReplaiSend.sendRow(
        rule,
        built.recipient,
        ReplaiSend.keyFor(keySource),
        {
          kind: 'google_sheets',
          spreadsheet_id: ReplaiSheets.spreadsheetId(),
          sheet: rule.sheetName,
          rule_id: rule.id,
          row: rowNumber,
        }
      );

      if (result.outcome === 'sent') {
        summary.sent++;
        statuses[rowNumber] = result.status;
      } else if (result.outcome === 'duplicate') {
        // Already sent for this row under this key. Deliberately does NOT
        // overwrite the status cell: the original "Sending · <time>" is
        // more useful than "we checked again and did nothing".
        summary.duplicate++;
      } else {
        summary.failed++;
        statuses[rowNumber] = result.status;
        ReplaiDispatcher.noteReason_(summary, rowNumber, result.message);

        if (ReplaiSend.isFatal(result.outcome)) {
          fatal = result.message;
          if (result.outcome === 'unauthorised') {
            ReplaiRules.flagAttention(rule.id, result.message);
          }
          break;
        }
      }
    }

    if (!preview) {
      ReplaiSheets.writeStatuses(rule.sheetName, statuses);

      // The watermark is NOT advanced here, and that is deliberate. It
      // only ever means "rows that existed before this rule did", and it
      // is set when the rule is saved or resumed.
      //
      // An earlier version advanced it to the end of the sheet after every
      // run, which broke the commonest way anyone adds a row: someone
      // types the name, the trigger fires, nothing matches yet because the
      // status column is still empty — and the watermark moves past the
      // row, so when they finish filling it in the rule ignores it
      // forever. Leaving the watermark alone costs nothing: a row that
      // already sent is refused by the CRM's per-row idempotency key.

      if (fatal) {
        summary.message = fatal;
      } else if (!summary.message) {
        summary.message = ReplaiDispatcher.describe_(summary);
        if (summary.sent > 0) ReplaiRules.clearAttention(rule.id);
      }

      ReplaiRules.recordRun(rule.id, summary);
    } else if (!summary.message) {
      summary.message =
        summary.sendable +
        ' of ' +
        summary.scanned +
        ' row(s) checked would send right now.';
    }

    return summary;
  },

  // ----------------------------------------------------------------
  // candidate selection
  // ----------------------------------------------------------------

  candidateRows_: function (rule, sheet, opts) {
    const preview = opts.preview === true;
    const lastRow = sheet.firstRow + sheet.values.length - 1;

    // An explicitly named row (runRow) overrides every selection rule
    // below, including the New Row watermark: the operator asked for this
    // exact row, and second-guessing that would make the action useless
    // for the case it exists to serve.
    if (opts.rows) {
      return ReplaiDispatcher.clamp_(opts.rows, sheet.firstRow, lastRow);
    }

    if (rule.triggerType === 'reminder') {
      return ReplaiDispatcher.range_(sheet.firstRow, lastRow);
    }

    // A preview has no event at all, so it answers the question the
    // person clicking it is actually asking: which rows match right now.
    // For New Row that means everything past the watermark; for On Change,
    // the whole sheet.
    if (preview) {
      if (rule.triggerType === 'new_row') {
        const baseline =
          typeof rule.baselineRow === 'number' ? rule.baselineRow : lastRow;
        return ReplaiDispatcher.range_(
          Math.max(sheet.firstRow, baseline + 1),
          lastRow
        );
      }
      return ReplaiDispatcher.range_(sheet.firstRow, lastRow);
    }

    // The rows the user actually changed, straight from `e.range`.
    const edited = ReplaiDispatcher.clamp_(
      ReplaiSheets.rowsFromEvent(opts.event, rule.sheetName),
      sheet.firstRow,
      lastRow
    );

    if (rule.triggerType === 'on_change') {
      // Only the edited rows, ever. An empty result means the event
      // carried no usable range, and doing nothing is the safe reading:
      // sweeping the sheet here is what would message every existing row.
      return edited;
    }

    // new_row: an edited row still has to be past the watermark, or
    // correcting a typo in an old row would look like a brand-new one.
    const baseline =
      typeof rule.baselineRow === 'number' ? rule.baselineRow : lastRow;

    if (edited.length) {
      return ReplaiDispatcher.clamp_(edited, baseline + 1, lastRow);
    }

    // No range on the event. Everything past the watermark is by
    // definition new, which is exactly what the watermark is for.
    return ReplaiDispatcher.range_(
      Math.max(sheet.firstRow, baseline + 1),
      lastRow
    );
  },

  range_: function (from, to) {
    const rows = [];
    const start = Math.max(from, ReplaiSheets.FIRST_DATA_ROW);
    const end = Math.min(to, start + ReplaiDispatcher.MAX_ROWS_SCANNED - 1);
    for (let row = start; row <= end; row++) rows.push(row);
    return rows;
  },

  clamp_: function (rows, from, to) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] >= from && rows[i] <= to) out.push(rows[i]);
    }
    return out;
  },

  // ----------------------------------------------------------------
  // reporting
  // ----------------------------------------------------------------

  noteReason_: function (summary, rowNumber, reason) {
    if (!reason) return;
    if (summary.reasons.length >= ReplaiDispatcher.MAX_REASONS_REPORTED) return;
    summary.reasons.push('Row ' + rowNumber + ': ' + reason);
  },

  /** One sentence for the rule card. Plain counts, no jargon. */
  describe_: function (summary) {
    if (summary.sent === 0 && summary.failed === 0 && summary.skipped === 0) {
      return summary.duplicate > 0
        ? 'Checked ' + summary.scanned + ' row(s); all already sent.'
        : 'Checked ' + summary.scanned + ' row(s); none matched.';
    }

    const parts = [];
    if (summary.sent) parts.push(summary.sent + ' sent');
    if (summary.duplicate) parts.push(summary.duplicate + ' already sent');
    if (summary.skipped) parts.push(summary.skipped + ' skipped');
    if (summary.failed) parts.push(summary.failed + ' failed');
    return 'Checked ' + summary.scanned + ' row(s): ' + parts.join(', ') + '.';
  },
};
