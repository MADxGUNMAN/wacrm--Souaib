/**
 * triggers.js — installs only the triggers the current rules need.
 *
 * WHICH TRIGGERS, AND WHY THESE
 * Editor add-ons may create Edit, Change, Form-submit and time-driven
 * installable triggers. Three are used, and the choice is the fix for a
 * real bug rather than a preference:
 *
 *   onEditDispatch       Edit trigger. Carries `e.range` — the cells the
 *                        user actually changed. This is the ONLY reliable
 *                        way to know which row changed.
 *   onFormSubmitDispatch Form-submit trigger. Also carries `e.range`, and
 *                        is the only thing that fires when a linked Google
 *                        Form adds a row (an Edit trigger does not).
 *   onDailyDispatch      Time-driven. The reminder sweep.
 *
 * The **Change** trigger is deliberately NOT used any more. It fires for
 * more kinds of change, but its event object carries no range, so a rule
 * driven by it cannot tell which row to look at. The first version of
 * this file used it and fell back to `getActiveRange()`; in a background
 * trigger that is usually null, so On Change rules silently never fired.
 * Any Change trigger left over from that version is removed by `sync()`.
 *
 * WHY NOT ONE TRIGGER PER RULE
 * Installable triggers are capped per user per script (20), shared across
 * every spreadsheet that user has the add-on in. One trigger per rule
 * exhausts it after a handful of rules and then fails on the next save,
 * in a way the user cannot diagnose. One Edit trigger serves every New
 * Row and On Change rule in the document.
 *
 * WHO OWNS THEM
 * A trigger belongs to the user who installed it and runs as that user,
 * with that user's API key. `ScriptApp.getProjectTriggers()` only ever
 * returns the current user's, so one person's rules cannot start sending
 * with another's key. The consequence is that ownership must be visible
 * and transferable, which is what the "Runs as" line and Take over do
 * (plan §14.5).
 *
 * WHICH DOCUMENT THEY BELONG TO — AND WHY THAT NEEDED FIXING
 * `getProjectTriggers()` returns the user's triggers for this SCRIPT, not
 * for this spreadsheet. Matching them by handler function alone therefore
 * pooled every spreadsheet's triggers together, and a user with rules in
 * two sheets hit all three of these at once:
 *
 *   - the second sheet saw the first sheet's trigger, concluded it was
 *     already armed, and installed nothing,
 *   - `status()` then reported that sheet as armed while none of its rules
 *     could ever fire,
 *   - and the duplicate-pruning branch treated the other sheet's trigger
 *     as a stray and deleted it, breaking the sheet that DID work.
 *
 * Scoping is now explicit, and differs by trigger kind because Google
 * exposes different things:
 *
 *   edit / form  `getTriggerSourceId()` is the spreadsheet's file id, so
 *                these can be attributed directly and reliably.
 *   time-driven  reports NO source document — there is nothing on the
 *                Trigger object that says which sheet it was created for.
 *                So the unique id is recorded per (user, document) in
 *                UserProperties at creation time, and a clock trigger is
 *                only treated as this document's if its id matches.
 *
 * A clock trigger whose id no claim matches is a stray — an orphan from
 * the pooled-trigger era, or one whose record was lost — and is deleted,
 * because it fires a sweep that nothing is managing.
 */
const ReplaiTriggers = {
  EDIT_HANDLER: 'onEditDispatch',
  FORM_HANDLER: 'onFormSubmitDispatch',
  DAILY_HANDLER: 'onDailyDispatch',

  /** Removed on sight. See the header note. */
  LEGACY_HANDLERS: ['onChangeDispatch'],

  /**
   * Which shape the reminder trigger was installed in, per user.
   *
   * A Trigger object exposes its handler and event type but NOT how it was
   * built, so Google cannot be asked whether the installed one is the
   * fixed-hour kind or the hourly sweep. Without this marker the migration
   * below could not tell, and everyone who upgraded would keep a
   * once-a-day trigger while the rules expected an hourly one — every
   * reminder outside that one hour would silently never fire.
   *
   * The old key (`replai.dailyHour`, which stored the installed hour) is
   * deleted on sight for the same reason: a leftover value would make a
   * later version think the hour still mattered.
   */
  /**
   * Per (user, document) records for the time-driven sweep. The document
   * id is appended, which is what makes them per-document: UserProperties
   * is already per user, and a clock trigger cannot be attributed any
   * other way.
   */
  SWEEP_ID_PREFIX: 'replai.sweepTrigger.',
  SWEEP_MODE_PREFIX: 'replai.sweepMode.',
  SWEEP_MODE: 'hourly.v2',

  /**
   * Un-keyed properties written by versions that assumed one sweep per
   * user. Deleted on sight: left in place they would make a later version
   * think a shared trigger is still authoritative.
   */
  LEGACY_SWEEP_PROP: 'replai.sweepMode',
  LEGACY_HOUR_PROP: 'replai.dailyHour',

  /**
   * How often the reminder sweep runs, in hours.
   *
   * ─── One hour is a HARD FLOOR for add-ons ────────────────────────
   *
   * `everyMinutes(1)` was tried and Google rejected the trigger outright:
   *
   *   "The recurrence interval for an Add-on trigger must be at least one
   *    hour."
   *
   * That restriction applies to editor add-ons specifically — the same
   * call succeeds in a container-bound script, which is why the general
   * `everyMinutes()` documentation does not mention it. The consequence is
   * not a slower sweep but NO sweep: `create()` throws, nothing is
   * installed, and every reminder rule sits at "Not armed".
   *
   * So hourly it is, and the scheduling UI must not offer a precision
   * this cannot honour. See the note on precision in schedule.js.
   */
  SWEEP_HOURS: 1,

  /** Trigger types the row-driven rules need. */
  ROW_TRIGGERS: ['new_row', 'on_change'],

  /**
   * When one of our triggers last actually ran, per user.
   *
   * This exists because `ScriptApp.getProjectTriggers()` cannot tell a
   * working trigger from a dead one, and dead ones are common:
   *
   *   - A trigger created in a test deployment is left permanently
   *     Disabled by Google, and still appears in the list.
   *   - A trigger created before the add-on was installed from the
   *     Marketplace belongs to the old context and does not fire for the
   *     installed add-on, and still appears in the list.
   *
   * `sync()` treated "a trigger with this handler exists" as proof the
   * engine was armed, so a stale trigger blocked a good one from ever
   * being created. The heartbeat is the missing evidence: it is written
   * every time a dispatch actually starts, so the sidebar can say
   * "installed, but never observed running" instead of "Active".
   */
  HEARTBEAT_PROP: 'replai.triggerRanAt',

  /**
   * Bring the installed triggers in line with the current rules.
   *
   * Idempotent, and called from everywhere that could leave them stale:
   * every rule write, the reminder-hour change, and — importantly —
   * opening the sidebar. That last one is what makes a rule created by an
   * older version of the add-on arm itself instead of sitting inert
   * forever waiting to be re-saved.
   *
   * @returns {{ok: boolean, edit: boolean, form: boolean, daily: boolean,
   *            message: string}}
   */
  sync: function () {
    const needRows =
      ReplaiRules.activeByTrigger(ReplaiTriggers.ROW_TRIGGERS).length > 0;
    const needDaily = ReplaiRules.activeByTrigger(['reminder']).length > 0;

    try {
      const existing = ReplaiTriggers.mine_();

      // Left over from the Change-trigger version: firing it wastes a
      // run, and leaving it in place wastes one of the user's 20 slots.
      for (let i = 0; i < existing.legacy.length; i++) {
        ScriptApp.deleteTrigger(existing.legacy[i]);
      }

      // Unclaimed clock triggers: orphans from the version that pooled one
      // sweep across every spreadsheet, or ones whose record was lost.
      // Each one runs a sweep nothing manages, so it burns trigger runtime
      // quota — and on a shared script that quota is the user's, not this
      // document's. A sibling sheet's live sweep is never in here; it is
      // claimed, and claims are checked across all documents.
      for (let s = 0; s < existing.strays.length; s++) {
        ScriptApp.deleteTrigger(existing.strays[s]);
      }

      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

      // ---- edit ----
      if (needRows && !existing.edit) {
        ScriptApp.newTrigger(ReplaiTriggers.EDIT_HANDLER)
          .forSpreadsheet(spreadsheet)
          .onEdit()
          .create();
      } else if (!needRows && existing.edit) {
        ScriptApp.deleteTrigger(existing.edit);
      }

      // ---- form submit ----
      // An Edit trigger does not fire for a Google Form submission, so
      // without this a "New Row Added" rule would miss exactly the case
      // its own description promises.
      if (needRows && !existing.form) {
        ScriptApp.newTrigger(ReplaiTriggers.FORM_HANDLER)
          .forSpreadsheet(spreadsheet)
          .onFormSubmit()
          .create();
      } else if (!needRows && existing.form) {
        ScriptApp.deleteTrigger(existing.form);
      }

      // ---- reminder sweep ----
      //
      // One recurring trigger, not one per rule. Which rules are due is
      // decided in code, by ReplaiSchedule.isDue — see the header of
      // schedule.js for why that is the only arrangement that fits inside
      // Google's 20-trigger-per-user cap.
      const staleShape =
        ReplaiTriggers.installedSweepMode_() !== ReplaiTriggers.SWEEP_MODE;

      if (needDaily && (!existing.daily || staleShape)) {
        // A trigger built by an earlier version has the right handler name
        // but the wrong shape — once a day at a fixed hour, or hourly.
        // `existing.daily` would be truthy either way, so without this
        // check nothing would replace it and every rule scheduled at a
        // minute the old trigger never visits would stay silent forever.
        if (existing.daily) ScriptApp.deleteTrigger(existing.daily);
        const sweep = ScriptApp.newTrigger(ReplaiTriggers.DAILY_HANDLER)
          .timeBased()
          .everyHours(ReplaiTriggers.SWEEP_HOURS)
          .create();
        // Claimed immediately: an unrecorded sweep is indistinguishable
        // from an orphan and would be pruned on the next sync.
        ReplaiTriggers.rememberSweep_(sweep);
      } else if (!needDaily && existing.daily) {
        ScriptApp.deleteTrigger(existing.daily);
        ReplaiTriggers.forgetSweep_();
      }
    } catch (err) {
      // ─── Lead with Google's reason, not with a guess ──────────────
      //
      // This used to assert the 20-trigger cap as the cause and append
      // Google's text in brackets. When the real failure was "The
      // recurrence interval for an Add-on trigger must be at least one
      // hour", the operator was told to go and delete triggers from other
      // spreadsheets — busywork that could not possibly fix it, while the
      // actual explanation sat in a parenthetical after two sentences of
      // misdirection.
      //
      // So: Google's own sentence first, and the cap offered as a
      // possibility rather than a diagnosis.
      console.error('[replai] could not sync triggers: ' + err);
      const reason = String((err && err.message) || err).trim();
      return {
        ok: false,
        edit: false,
        form: false,
        daily: false,
        message:
          'Rules are saved, but Google refused to install this add-on\u2019s automatic trigger. ' +
          'Google said: ' +
          reason +
          ' \u2014 if that mentions a limit, the 20-trigger cap for your Google account is ' +
          'likely full: remove triggers from spreadsheets you no longer use, then reopen ' +
          'this sidebar.',
      };
    }

    const after = ReplaiTriggers.mine_();
    return {
      ok: true,
      edit: !!after.edit,
      form: !!after.form,
      daily: !!after.daily,
      message: '',
    };
  },

  /**
   * Throw away every trigger and build fresh ones.
   *
   * The recovery action for a trigger that exists but does not work.
   * `sync()` cannot do this on its own: it has no way to distinguish a
   * live trigger from a disabled or orphaned one, so it would keep
   * trusting the broken one forever. Recreating is cheap and idempotent,
   * and it is the only fix for the two cases above.
   */
  forceReinstall: function () {
    ReplaiTriggers.removeAll();
    const result = ReplaiTriggers.sync();

    // The heartbeat describes the OLD triggers, which no longer exist.
    // Keeping it would let the sidebar claim the new ones are proven.
    ReplaiTriggers.clearHeartbeat_();

    return result;
  },

  /** Called at the start of every dispatch. Proof the trigger fired. */
  recordHeartbeat: function () {
    try {
      PropertiesService.getUserProperties().setProperty(
        ReplaiTriggers.HEARTBEAT_PROP,
        new Date().toISOString()
      );
    } catch (err) {
      // A failed heartbeat must never stop a run that is already working.
      console.warn('[replai] could not record a trigger heartbeat: ' + err);
    }
  },

  /** ISO string of the last observed trigger run, or '' if never. */
  heartbeat: function () {
    return (
      PropertiesService.getUserProperties().getProperty(
        ReplaiTriggers.HEARTBEAT_PROP
      ) || ''
    );
  },

  clearHeartbeat_: function () {
    try {
      PropertiesService.getUserProperties().deleteProperty(
        ReplaiTriggers.HEARTBEAT_PROP
      );
    } catch (err) {
      console.warn('[replai] could not clear the heartbeat: ' + err);
    }
  },

  /**
   * Removes the triggers this add-on owns for the current user IN THIS
   * SPREADSHEET.
   *
   * Scoped deliberately: this backs the "Reinstall triggers" button, and
   * an operator repairing one sheet must not silently disarm the rules in
   * another sheet they happen to own. Strays go too — they belong to no
   * document by definition.
   */
  removeAll: function () {
    try {
      const existing = ReplaiTriggers.mine_();
      ['edit', 'form', 'daily'].forEach(function (role) {
        if (existing[role]) ScriptApp.deleteTrigger(existing[role]);
      });
      for (let i = 0; i < existing.legacy.length; i++) {
        ScriptApp.deleteTrigger(existing.legacy[i]);
      }
      for (let s = 0; s < existing.strays.length; s++) {
        ScriptApp.deleteTrigger(existing.strays[s]);
      }
      ReplaiTriggers.forgetSweep_();
      return true;
    } catch (err) {
      console.error('[replai] could not remove triggers: ' + err);
      return false;
    }
  },

  /**
   * Is the engine actually armed for this user, given these rules?
   *
   * "Are there rules?" and "will they fire for me?" are different
   * questions, because triggers are per user. A collaborator opening a
   * shared sheet sees every rule and has installed nothing.
   */
  status: function () {
    try {
      const existing = ReplaiTriggers.mine_();
      const needRows =
        ReplaiRules.activeByTrigger(ReplaiTriggers.ROW_TRIGGERS).length > 0;
      const needDaily = ReplaiRules.activeByTrigger(['reminder']).length > 0;

      return {
        edit: !!existing.edit,
        form: !!existing.form,
        daily: !!existing.daily,
        /** Each rule owns its own hour; the sweep itself runs hourly. */
        sweepMode: ReplaiTriggers.installedSweepMode_(),
        armed:
          (!needRows || !!existing.edit) && (!needDaily || !!existing.daily),
      };
    } catch (err) {
      console.warn('[replai] could not read triggers: ' + err);
      return {
        edit: false,
        form: false,
        daily: false,
        hour: null,
        armed: false,
      };
    }
  },

  /** True when this rule's kind of trigger is installed for this user. */
  armedFor: function (triggerType, status) {
    if (triggerType === 'reminder') return status.daily;
    return status.edit;
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  /**
   * The current user's triggers for this project, keyed by role. Also
   * collects duplicates for deletion: an interrupted install can leave
   * two triggers on one handler, and then every edit runs the dispatcher
   * twice.
   */
  mine_: function () {
    const all = ScriptApp.getProjectTriggers();
    const docId = ReplaiSheets.spreadsheetId();
    const ourSweepId = ReplaiTriggers.recordedSweepId_(docId);
    const claimedSweepIds = ReplaiTriggers.allRecordedSweepIds_();

    const found = {
      edit: null,
      form: null,
      daily: null,
      legacy: [],
      /** Clock triggers on our handler that no document claims. */
      strays: [],
    };

    const roleOf = {};
    roleOf[ReplaiTriggers.EDIT_HANDLER] = 'edit';
    roleOf[ReplaiTriggers.FORM_HANDLER] = 'form';
    roleOf[ReplaiTriggers.DAILY_HANDLER] = 'daily';

    for (let i = 0; i < all.length; i++) {
      const trigger = all[i];
      const handler = trigger.getHandlerFunction();

      if (ReplaiTriggers.LEGACY_HANDLERS.indexOf(handler) !== -1) {
        // Another spreadsheet's leftover is that spreadsheet's business.
        if (trigger.getTriggerSourceId() === docId) found.legacy.push(trigger);
        continue;
      }

      const role = roleOf[handler];
      if (!role) continue;

      if (role === 'daily') {
        // No source document to compare against — see the header. The
        // recorded unique id is the only link between a clock trigger and
        // the sheet it serves.
        const uniqueId = trigger.getUniqueId();
        if (ourSweepId && uniqueId === ourSweepId) {
          found.daily = trigger;
        } else if (
          claimedSweepIds &&
          claimedSweepIds.indexOf(uniqueId) === -1
        ) {
          // `claimedSweepIds === null` means the claims could not be read,
          // in which case nothing is safe to call an orphan.
          found.strays.push(trigger);
        }
        continue;
      }

      // Edit and form triggers carry the file they were created for.
      if (trigger.getTriggerSourceId() !== docId) continue;

      // Same-document duplicates are real: an interrupted install leaves
      // two on one handler and then every edit dispatches twice.
      if (found[role]) {
        ScriptApp.deleteTrigger(trigger);
      } else {
        found[role] = trigger;
      }
    }

    return found;
  },

  sweepIdKey_: function (docId) {
    return ReplaiTriggers.SWEEP_ID_PREFIX + docId;
  },

  sweepModeKey_: function (docId) {
    return ReplaiTriggers.SWEEP_MODE_PREFIX + docId;
  },

  recordedSweepId_: function (docId) {
    return (
      PropertiesService.getUserProperties().getProperty(
        ReplaiTriggers.sweepIdKey_(docId)
      ) || ''
    );
  },

  /**
   * Every sweep id this user has claimed, for any document.
   *
   * Used to tell a stray clock trigger from another spreadsheet's live
   * one. Without it, pruning orphans would delete a working sibling —
   * which is exactly the bug this scoping replaced.
   */
  allRecordedSweepIds_: function () {
    try {
      const all = PropertiesService.getUserProperties().getProperties();
      const out = [];
      for (const key in all) {
        if (
          key.indexOf(ReplaiTriggers.SWEEP_ID_PREFIX) === 0 &&
          all[key] &&
          out.indexOf(all[key]) === -1
        ) {
          out.push(all[key]);
        }
      }
      return out;
    } catch (err) {
      // NULL, not []. An empty list is a real answer meaning "nothing is
      // claimed, so every clock trigger is an orphan"; a failed read is
      // not, and treating it as one would delete a sibling spreadsheet's
      // working sweep. Null tells the caller it cannot judge strays and
      // must leave them alone — the cost is an orphan surviving until the
      // next sync, against silently disarming a sheet that was fine.
      console.warn('[replai] could not read sweep claims: ' + err);
      return null;
    }
  },

  installedSweepMode_: function () {
    return (
      PropertiesService.getUserProperties().getProperty(
        ReplaiTriggers.sweepModeKey_(ReplaiSheets.spreadsheetId())
      ) || ''
    );
  },

  /** Claims a freshly created sweep for THIS document. */
  rememberSweep_: function (trigger) {
    const props = PropertiesService.getUserProperties();
    const docId = ReplaiSheets.spreadsheetId();
    props.setProperty(ReplaiTriggers.sweepIdKey_(docId), trigger.getUniqueId());
    props.setProperty(
      ReplaiTriggers.sweepModeKey_(docId),
      ReplaiTriggers.SWEEP_MODE
    );
    // Written when a single sweep was assumed to serve every document.
    props.deleteProperty(ReplaiTriggers.LEGACY_SWEEP_PROP);
    props.deleteProperty(ReplaiTriggers.LEGACY_HOUR_PROP);
  },

  forgetSweep_: function () {
    const props = PropertiesService.getUserProperties();
    const docId = ReplaiSheets.spreadsheetId();
    props.deleteProperty(ReplaiTriggers.sweepIdKey_(docId));
    props.deleteProperty(ReplaiTriggers.sweepModeKey_(docId));
    props.deleteProperty(ReplaiTriggers.LEGACY_SWEEP_PROP);
    props.deleteProperty(ReplaiTriggers.LEGACY_HOUR_PROP);
  },

  /**
   * Tear down everything this add-on installed for this user in THIS
   * spreadsheet, leaving nothing to rebuild from.
   *
   * Distinct from `forceReinstall`, which removes and then recreates.
   * This one backs "Reset Everything" and deliberately does not sync
   * afterwards — the rules that would justify a trigger are about to be
   * deleted too.
   *
   * Still scoped per document: a reset in one spreadsheet must not
   * disarm the user's other sheets, which is the bug the per-document
   * sweep claims were introduced to fix.
   */
  purgeState: function () {
    ReplaiTriggers.removeAll();
    // The heartbeat describes triggers that no longer exist. Left behind,
    // a fresh setup would inherit it and claim the new triggers were
    // already proven to fire.
    ReplaiTriggers.clearHeartbeat_();
  },
};
