/**
 * Code.js — Apps Script entry points.
 *
 * Author: Souaib Ansari <https://ansarisouaib.in>, for Junkies Coder.
 *
 * Everything Google or the UI calls by name lives here as a bare global
 * function; the logic sits in the ReplaiX namespaces. Two hard rules:
 *
 * 1. `onOpen` runs in AuthMode.NONE the first time a document is opened,
 *    where PropertiesService, UrlFetchApp and Session are all
 *    unavailable. Touching any of them there throws and the add-on menu
 *    never appears at all. So onOpen only builds a static menu.
 *
 * 2. Functions reachable from the client (`google.script.run`) must
 *    return JSON-serialisable values and must not throw for expected
 *    failures — a throw arrives at the browser as a generic error and
 *    the real reason is lost. They return result objects instead.
 */

/**
 * The trigger engine is live as of phase 6: saved rules install real
 * triggers and send real messages. The sidebar reads this to decide
 * whether to warn that rules are inert.
 */
const ENGINE_READY = true;

/**
 * Runs on document open (add-on installed or not). AuthMode.NONE-safe.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Open Replai', 'showSidebar')
    .addItem('Set up API key', 'showApiKeyDialog')
    .addSeparator()
    // "Reinstall automatic triggers" and "Disconnect this account" used
    // to sit here as two loose entries. They now live inside this one
    // dialog, under headings that say what they do, next to the support
    // routes and the reset. Two destructive-looking verbs in a dropdown
    // with no explanation was the worst place for them.
    //
    // The menu label itself is NOT operator-editable, unlike everything
    // inside the dialog: onOpen runs in AuthMode.NONE where
    // PropertiesService and UrlFetchApp both throw, so a label fetched
    // from the CRM would mean no add-on menu at all on first open.
    .addItem('Help & Support', 'showHelpDialog')
    .addToUi();
}

/**
 * Runs once, immediately after install, in AuthMode.FULL. Opening the
 * sidebar here is what makes the add-on visibly do something — without
 * it a new user has to go hunting through the Extensions menu.
 */
function onInstall(e) {
  onOpen(e);
  showSidebar();
}

/** Opens (or replaces) the sidebar. */
function showSidebar() {
  const html = HtmlService.createTemplateFromFile('ui/Sidebar')
    .evaluate()
    // ─── The name lives HERE, and only here ──────────────────────
    //
    // Sheets renders this beside the panel's close button, in chrome that
    // sits OUTSIDE our iframe. That has two consequences worth writing
    // down, because both were tried:
    //
    //   • We cannot add to that row. No logo, no button — there is no API
    //     for it, and iframe content cannot escape its own box. So "put
    //     the icon and reload up next to the X" is not buildable.
    //   • Blanking it to take the name over ourselves works, but Sheets
    //     still draws the empty bar, so it costs a wasted strip above the
    //     panel for no gain.
    //
    // Hence: Sheets owns the title row, and ui/Sidebar renders no header
    // of its own. Reload moved into the workspace card instead, where it
    // needs no extra row.
    .setTitle(ReplaiConfig.PRODUCT_NAME + ' · ' + ReplaiConfig.ADDON_NAME);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Opens the API key modal. Also called from the sidebar's connect button. */
function showApiKeyDialog() {
  const html = HtmlService.createTemplateFromFile('ui/ApiKeyDialog')
    .evaluate()
    .setWidth(460)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(
    html,
    ReplaiConfig.PRODUCT_NAME + ' API setup'
  );
}

/**
 * Opens the Help & Support modal.
 *
 * Taller than the API setup dialog because it carries six sections and
 * scrolling a support screen to find the phone number defeats the point.
 */
function showHelpDialog() {
  const html = HtmlService.createTemplateFromFile('ui/HelpDialog')
    .evaluate()
    .setWidth(480)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Help & Support');
}

/**
 * Templating helper for the .html partials: `<?!= include('ui/X') ?>`.
 * Inlines CSS/JS because an HtmlService sandbox cannot reference a
 * sibling project file the way a web page references a static asset.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ------------------------------------------------------------------
// Trigger handlers
//
// Named here because a trigger is created by handler NAME, and renaming
// one of these silently orphans every trigger already installed in every
// user's spreadsheet — they keep firing and fail to resolve the handler.
// If either name must change, ReplaiTriggers has to delete the old
// trigger before installing the new one.
// ------------------------------------------------------------------

/** Installed Edit trigger: New Row Added + On Change rules. */
function onEditDispatch(event) {
  ReplaiDispatcher.onEdit(event);
}

/** Installed form-submit trigger: a linked Google Form added a row. */
function onFormSubmitDispatch(event) {
  ReplaiDispatcher.onFormSubmit(event);
}

/** Installed daily trigger: Time-Based Reminder rules. */
function onDailyDispatch() {
  ReplaiDispatcher.onDaily();
}

/**
 * Retired handler, kept as a deliberate no-op.
 *
 * Earlier builds installed a Change trigger pointing here. Deleting the
 * function while those triggers still exist in users' spreadsheets would
 * make every edit fail with "script function not found". ReplaiTriggers
 * removes them on the next sync; until then they land here and do
 * nothing. Safe to delete once no installation can still hold one.
 */
function onChangeDispatch() {
  console.log('[replai] ignoring a legacy Change trigger; it will be removed');
}

// ------------------------------------------------------------------
// Client-callable API (google.script.run)
// ------------------------------------------------------------------

/**
 * Single round trip that tells the sidebar everything it needs to pick a
 * screen AND render the rules list. One call rather than four, because
 * each `google.script.run` hop costs a visible fraction of a second in a
 * sidebar.
 *
 * @returns {{state: string, ...}} state is one of:
 *   needs_key    — nothing stored yet
 *   key_invalid  — stored key rejected (401) or lacks broadcasts:send
 *   offline      — CRM unreachable; stored rules still listed
 *   empty        — connected, zero rules
 *   list         — connected, at least one rule
 */
function getBootstrap() {
  const base = {
    productName: ReplaiConfig.PRODUCT_NAME,
    addonName: ReplaiConfig.ADDON_NAME,
    apiKeysUrl: ReplaiConfig.url(ReplaiConfig.API_KEYS_PATH),
    homepageUrl: ReplaiConfig.HOMEPAGE_ENABLED
      ? ReplaiConfig.url(ReplaiConfig.HOMEPAGE_PATH)
      : '',
    engineReady: ENGINE_READY,
    rules: [],
    ruleCount: 0,
    hasReminderRule: false,
    timezone: '',
    email: '',
    accountName: '',
    keyMasked: '',
    message: '',
    statusColumn: ReplaiSheets.STATUS_COLUMN,
    triggersArmed: false,
    triggerWarning: '',
    // Shown in the footer so "is this spreadsheet running the code I just
    // pushed?" is answerable without opening the script editor. The dev
    // suffix answers the follow-up — "and which CRM is it talking to?" —
    // which matters once the same code can point at either host. A
    // published build has IS_DEV false and renders the version alone.
    version: ReplaiConfig.VERSION + (ReplaiConfig.IS_DEV ? ' · dev' : ''),
    // What is actually installed for this user, named individually. A
    // single "armed" boolean cannot distinguish "no trigger at all" from
    // "the edit trigger is there but the daily one failed", and those
    // need different actions.
    triggerDetail: { edit: false, form: false, daily: false },
    triggerLastFired: '',
    triggersProven: false,
  };

  if (!ReplaiAuth.hasKey()) {
    base.state = 'needs_key';
    return base;
  }

  base.email = ReplaiAuth.getUserEmail();
  base.keyMasked = ReplaiAuth.maskKey(ReplaiAuth.getKey());

  // Read rules before validating the key: if the CRM is unreachable the
  // user should still see what they built, not an empty sidebar.
  const rules = ReplaiRules.list();
  base.rules = rules.map(summariseRule_);
  base.ruleCount = rules.length;
  base.hasReminderRule = ReplaiRules.hasReminderRule();
  base.timezone = ReplaiSheets.getTimezone();

  // ---- self-heal the triggers ----
  //
  // Opening the sidebar repairs the engine. This is not belt-and-braces:
  // a rule saved by a build that had no trigger engine, or saved while the
  // trigger quota was full, or created by a colleague, is otherwise inert
  // forever with no way for the user to know why. Telling someone "re-save
  // your rule to make it work" is not a fix.
  //
  // Only for the rules' owner, and only when a key exists — a trigger
  // installed under an account with no key would just fail on every run.
  if (rules.length > 0 && ReplaiAuth.hasKey()) {
    const ownsAny = rules.some(function (rule) {
      return rule.owner && rule.owner.email === base.email;
    });

    if (ownsAny) {
      const synced = ReplaiTriggers.sync();
      if (!synced.ok) base.triggerWarning = synced.message;
    }

    // Triggers are per user, so "are there rules?" and "will they fire for
    // ME?" are different questions. A collaborator who opens a shared
    // sheet sees every rule and has installed nothing.
    const triggers = ReplaiTriggers.status();
    base.triggersArmed = triggers.armed;
    base.triggerDetail = {
      edit: !!triggers.edit,
      form: !!triggers.form,
      daily: !!triggers.daily,
    };

    // Installed is not the same as working. A trigger left Disabled by a
    // test deployment, or orphaned to the context that existed before the
    // add-on was installed properly, appears in Google's trigger list and
    // never fires. The heartbeat is the only evidence either way.
    const heartbeat = ReplaiTriggers.heartbeat();
    base.triggerLastFired = heartbeat ? ReplaiSheets.formatIso(heartbeat) : '';
    base.triggersProven = heartbeat !== '';

    if (base.triggersArmed && !base.triggersProven && !base.triggerWarning) {
      base.triggerWarning =
        'Triggers are installed but have never actually run. That usually means they were created before the add-on was installed properly. Use “Reinstall triggers” below, then edit a matching row.';
    }

    if (!base.triggersArmed && !base.triggerWarning) {
      base.triggerWarning = ownsAny
        ? 'These rules could not be armed automatically. Reload the sidebar, or re-save a rule.'
        : 'These rules were set up by someone else and run on their account. Use “Take over” on a rule to run it on yours.';
    }

    // Per rule, because a document can hold both kinds and only one of
    // the two triggers may have installed.
    base.rules.forEach(function (summary) {
      summary.armed = ReplaiTriggers.armedFor(summary.triggerType, triggers);
    });
  }

  const check = ReplaiAuth.validate();

  if (!check.ok) {
    // A dead key and a dead network need different screens: one asks for
    // a new key, the other asks the user to retry. Conflating them sends
    // people off to regenerate a key that was never the problem.
    const transient =
      check.code === 'network_error' ||
      check.code === 'invalid_response' ||
      check.code === 'rate_limited' ||
      check.status >= 500;

    base.state = transient ? 'offline' : 'key_invalid';
    base.message = ReplaiAuth.explain_(check);
    return base;
  }

  base.accountName = check.accountName;

  if (!check.hasSendScope) {
    base.state = 'key_invalid';
    base.message =
      'This key is valid but is missing the "' +
      ReplaiConfig.REQUIRED_SCOPE +
      '" permission, so it cannot send messages. Edit the key in Replai (Settings → API) or create a new one with that permission enabled.';
    return base;
  }

  base.state = base.ruleCount > 0 ? 'list' : 'empty';
  return base;
}

/**
 * Static choices the wizard needs, plus this workbook's tabs. Fetched
 * once when the wizard opens rather than baked into the HTML, so the
 * operator list has exactly one definition (conditions.js).
 */
function getWizardContext() {
  return {
    sheetNames: ReplaiSheets.listSheetNames(),
    triggerTypes: ReplaiRuleSchema.TRIGGER_TYPES,
    operators: ReplaiConditions.OPERATORS,
    mediaTypes: ReplaiRuleSchema.MEDIA_TYPES,
    timezone: ReplaiSheets.getTimezone(),
    dateOrder: ReplaiSheets.getDateOrder(),
    // Reminder scheduling. The frequency and weekday lists come from
    // schedule.js so the wizard cannot drift from what the engine accepts.
    frequencies: ReplaiSchedule.FREQUENCIES,
    daysOfWeek: ReplaiSchedule.DAYS_OF_WEEK,
    // Pre-filled into a new rule, and used for rules saved before
    // schedules existed so editing one does not move its time.
    defaultSchedule: ReplaiSchedule.normalise(
      null,
      ReplaiRules.getSettings().reminderHour
    ),
  };
}

/** Header row of one tab, for the column pickers. */
function getSheetColumns(sheetName) {
  return ReplaiSheets.readHeaders(sheetName);
}

/**
 * Add a correctly-shaped starter sheet. Never touches an existing tab —
 * see ReplaiTemplate.uniqueName.
 */
function createStarterSheet() {
  try {
    return ReplaiTemplate.build();
  } catch (err) {
    console.error('[replai] could not create the starter sheet: ' + err);
    return {
      ok: false,
      sheetName: '',
      message: 'Could not create the sheet: ' + String(err),
    };
  }
}

/** Campaigns the saved key can send through. */
function listCampaigns() {
  return ReplaiCampaigns.list();
}

/** One campaign plus its template's variable count and media needs. */
function getCampaignDetail(campaignId) {
  return ReplaiCampaigns.get(campaignId);
}

/** Full stored rule, for the wizard's edit mode. */
function getRule(ruleId) {
  return ReplaiRules.get(ruleId);
}

/**
 * Create or update. Returns field-keyed errors on rejection so the
 * wizard can mark the offending control rather than showing one vague
 * banner.
 *
 * Every write path calls ReplaiTriggers.sync afterwards, because a saved
 * rule with no trigger behind it is the exact failure phase 5 had to warn
 * about. Sync is idempotent, so calling it more often than strictly
 * needed costs nothing and forgetting it once costs the feature.
 */
function saveRule(draft) {
  const result = ReplaiRules.save(draft, ReplaiAuth.getUserEmail());
  if (!result.ok) return result;

  result.rule = summariseRule_(result.rule);
  const triggers = ReplaiTriggers.sync();
  if (!triggers.ok) result.warning = triggers.message;
  return result;
}

function deleteRule(ruleId) {
  const removed = ReplaiRules.remove(ruleId);
  // Removing the last rule removes the triggers with it. Leaving them
  // installed would keep waking the add-on on every edit of a
  // spreadsheet it has nothing left to do in.
  ReplaiTriggers.sync();
  return { ok: removed };
}

function setRuleEnabled(ruleId, enabled) {
  const changed = ReplaiRules.setEnabled(ruleId, enabled);
  const triggers = ReplaiTriggers.sync();
  return { ok: changed, warning: triggers.ok ? '' : triggers.message };
}

// `setReminderHour` used to live here, behind one "Daily reminders run
// around HH:00" control that applied to the whole spreadsheet. Every rule
// now carries its own frequency, time and day, set in the wizard, so there
// is no document-wide hour left to change. The old stored value is still
// read as the migration default — see the note in rules.js.

/**
 * Evaluate a rule against the sheet as it stands and report what would
 * happen — without sending anything.
 *
 * The only other way to check whether a rule's conditions are right is to
 * let it send real messages and read the results off people's phones.
 */
function previewRule(ruleId) {
  return ReplaiDispatcher.preview(ruleId);
}

// `runRuleForRow` used to live here: a "send row N now" control under the
// preview result, added because Google does not support installable
// triggers in a test deployment. It is gone from the sidebar deliberately.
// A button that spends money and reaches a real person on one click is the
// wrong thing to leave in a shipped product, and Preview already answers
// the question it existed for — which rows match — without sending.
// ReplaiDispatcher.runRow is still there for a named-row send if a future
// caller needs one; nothing reaches it from the UI.

/**
 * Throw the triggers away and build fresh ones.
 *
 * The fix for a trigger that exists but never fires, which Google's own
 * trigger list cannot distinguish from a working one. Two ways to get
 * there: a trigger created in a test deployment (Google leaves those
 * permanently Disabled), or one created before the add-on was installed
 * from the Marketplace (it belongs to the old context). In both cases the
 * list looks correct and nothing runs, and only recreation fixes it.
 */
function reinstallTriggers() {
  if (!ReplaiAuth.hasKey()) {
    return {
      ok: false,
      message: 'Connect your Replai API key first.',
    };
  }

  const result = ReplaiTriggers.forceReinstall();
  if (!result.ok) return { ok: false, message: result.message };

  const parts = [];
  if (result.edit) parts.push('sheet edits');
  if (result.form) parts.push('form submissions');
  if (result.daily) parts.push('the reminder sweep');

  return {
    ok: true,
    message: parts.length
      ? 'Reinstalled. Now watching for ' +
        parts.join(', ') +
        '. Edit a matching row to confirm it fires.'
      : 'Nothing to install — no active rules need a trigger.',
  };
}

// `reinstallTriggersFromMenu` used to live here: a menu-item wrapper that
// reported through SpreadsheetApp.getUi().alert() because a menu click has
// no sidebar to render into. The menu item is gone — the action is in the
// Help & Support dialog now, which can show its own result inline — so the
// alert wrapper has nothing left to wrap. `reinstallTriggers()` above is
// unchanged and is what both the sidebar and the dialog call.

/**
 * Move a rule onto the current user's API key (plan §14.5).
 *
 * Triggers belong to whoever installed them, so ownership alone would
 * change the label and nothing else — the sync afterwards is what
 * actually makes the rule run as this person.
 */
function takeOverRule(ruleId) {
  if (!ReplaiAuth.hasKey()) {
    return {
      ok: false,
      message:
        'Connect your own Replai API key first — a rule can only run on a key this account has saved.',
    };
  }

  const email = ReplaiAuth.getUserEmail();
  if (!ReplaiRules.takeOver(ruleId, email)) {
    return { ok: false, message: 'That rule no longer exists.' };
  }

  const triggers = ReplaiTriggers.sync();
  return {
    ok: true,
    message: triggers.ok
      ? 'This rule now runs as ' + (email || 'you') + '.'
      : triggers.message,
  };
}

/**
 * Called by the setup dialog. Validates against the CRM and stores the
 * key only if it works. See ReplaiAuth.saveKey.
 */
function saveApiKey(candidate) {
  return ReplaiAuth.saveKey(candidate);
}

/** Forgets the key for the current user only. Rules are left untouched. */
function disconnectAccount() {
  ReplaiAuth.clearKey();
  showSidebar();
}

// ------------------------------------------------------------------
// Help & Support
//
// Every string the dialog renders comes from the CRM. There is
// deliberately no fallback copy anywhere in this file or in
// ui/HelpDialog.html: a hardcoded default would silently override
// whatever an operator typed in Super Admin, and nothing in the
// rendered dialog would reveal which of the two was showing. A fetch
// failure therefore has to LOOK like a failure, which is why
// getHelpContent returns ok:false rather than a usable default.
// ------------------------------------------------------------------

/**
 * Fetch the dialog's content.
 *
 * Unauthenticated on purpose. The person most likely to open Help &
 * Support is the one whose API key will not validate, so requiring a
 * working key here would lock them out of the only screen that tells
 * them how to reach a human.
 *
 * `ruleCount` is read locally, not from the CRM: rules live in this
 * spreadsheet's DocumentProperties. The reset confirmation quotes it so
 * the user sees how much they are about to destroy at the moment they
 * commit, which is the whole reason the confirm step exists.
 *
 * @returns {{ok: boolean, content: Object, ruleCount: number,
 *            message: string}}
 */
function getHelpContent() {
  let ruleCount = 0;
  try {
    ruleCount = ReplaiRules.list().length;
  } catch (err) {
    // A dialog that will not open because a rule would not parse is a
    // worse failure than a confirm button missing its count.
    console.warn('[replai] could not count rules for the help dialog: ' + err);
  }

  const result = ReplaiApi.public_('get', '/api/public/sheets-addon/help');

  if (!result.ok) {
    return {
      ok: false,
      content: null,
      ruleCount: ruleCount,
      message: helpFailureMessage_(result),
    };
  }

  const help = result.data && result.data.help ? result.data.help : null;
  if (!help || !help.settings) {
    return {
      ok: false,
      content: null,
      ruleCount: ruleCount,
      message:
        'Support content has not been set up yet. Please contact your Replai administrator.',
    };
  }

  return { ok: true, content: help, ruleCount: ruleCount, message: '' };
}

/**
 * Send an issue report.
 *
 * Attaches the context that makes a report actionable and that the user
 * should not have to type: which spreadsheet, which add-on version, and
 * the Google account in use. The stored API key rides along when there
 * is one so the CRM can attribute the report to an account, but its
 * absence never blocks the submission.
 *
 * @param {string} message What the user typed.
 * @returns {{ok: boolean, message: string}}
 */
function submitIssueReport(message) {
  const text = String(message || '').trim();
  if (!text) {
    return { ok: false, message: 'Describe the problem before submitting.' };
  }

  let spreadsheetName = '';
  let spreadsheetId = '';
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    spreadsheetName = sheet.getName();
    spreadsheetId = sheet.getId();
  } catch (err) {
    // Metadata is a nicety; losing the report over it would not be.
    console.warn('[replai] could not read spreadsheet identity: ' + err);
  }

  const result = ReplaiApi.public_(
    'post',
    '/api/public/sheets-addon/report',
    {
      message: text,
      spreadsheetId: spreadsheetId,
      spreadsheetName: spreadsheetName,
      addonVersion: ReplaiConfig.VERSION,
      reporterEmail: ReplaiAuth.getUserEmail(),
    },
    // Lets the server attribute the report to an account without making
    // this an authenticated endpoint. A missing, expired or revoked key
    // is fine — the report is simply filed unattributed.
    { apiKey: ReplaiAuth.getKey() }
  );

  if (!result.ok) {
    if (result.status === 429) {
      return {
        ok: false,
        message:
          'Too many reports from this connection in the last hour. Please email support instead.',
      };
    }
    return { ok: false, message: helpFailureMessage_(result) };
  }

  // The success wording is operator-authored, so the dialog supplies it
  // from the content it already has rather than this function inventing
  // one.
  return { ok: true, message: '' };
}

/**
 * Clear everything this add-on stores for this spreadsheet.
 *
 * ORDER MATTERS. Triggers go first: a sweep that fired between deleting
 * the rules and deleting the triggers would run against half-erased
 * state and write nonsense into the status column.
 *
 * Scope is one spreadsheet and one user. A reset here must not disarm
 * the same person's other sheets.
 *
 * @returns {{ok: boolean, clearedRules: number, message: string}}
 */
function resetEverything() {
  // Counted before anything is destroyed, so the result can say what it
  // actually removed.
  let ruleCount = 0;
  try {
    ruleCount = ReplaiRules.list().length;
  } catch (err) {
    console.warn('[replai] could not count rules before reset: ' + err);
  }

  try {
    ReplaiTriggers.purgeState();
  } catch (err) {
    // Reported but not fatal: leaving the key and rules behind because a
    // trigger would not delete is the worse outcome, and a trigger whose
    // rules are gone is inert anyway.
    console.error('[replai] could not remove triggers during reset: ' + err);
  }

  const deleted = ReplaiRules.deleteAll();
  ReplaiAuth.clearKey();

  showSidebar();

  return {
    ok: true,
    clearedRules: deleted || ruleCount,
    message: '',
  };
}

/**
 * Turn a public-endpoint failure into something a user can act on.
 *
 * Mirrors ReplaiAuth.explain_ for the keyless path. The raw server
 * message survives for anything not special-cased, because a vague
 * "something went wrong" is what generates support tickets — which is
 * a particularly bad outcome inside the support dialog itself.
 */
function helpFailureMessage_(result) {
  switch (result.code) {
    case 'network_error':
      return 'Could not reach Replai. Check your connection and try again.';
    case 'invalid_response':
      return 'Replai returned an unexpected response. It may be mid-deploy — try again in a moment.';
    case 'rate_limited':
      return 'Too many requests right now. Wait a moment and try again.';
    default:
      return (
        result.message || 'Could not reach Replai. Please try again shortly.'
      );
  }
}

/**
 * Reopens the sidebar so it re-runs getBootstrap. The dialog calls this
 * after a successful save: a modal cannot reach into the sidebar's DOM,
 * and re-rendering server-side is more reliable than polling for a state
 * change from the client.
 */
function refreshSidebar() {
  showSidebar();
}

// ------------------------------------------------------------------
// internals
// ------------------------------------------------------------------

/**
 * Trims a stored rule to what a card needs. The full record carries
 * every column mapping and fixed value; sending all of that for every
 * rule on every sidebar open would be wasted payload, and the wizard
 * fetches the whole record when it actually opens one for editing.
 */
function summariseRule_(rule) {
  const trigger = ReplaiRuleSchema.findTrigger(rule.triggerType);
  const lastRun = rule.lastRun || null;

  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled !== false,
    sheetName: rule.sheetName,
    triggerType: rule.triggerType,
    triggerLabel: trigger ? trigger.label : rule.triggerType,
    campaignName: (rule.campaign && rule.campaign.name) || '',
    conditionCount: (rule.conditions || []).length,
    ownerEmail: (rule.owner && rule.owner.email) || '',
    needsAttention: rule.needsAttention === true,
    attentionReason: rule.attentionReason || '',
    // Overwritten with the real trigger state in getBootstrap. Defaults
    // to true so a code path that never checks cannot raise a false alarm
    // about a rule that is fine.
    armed: true,
    // Pre-formatted here rather than in the sidebar: only the server
    // knows the spreadsheet's timezone, and a run stamped in the
    // viewer's timezone would disagree with the status cells.
    lastRunAt: lastRun ? ReplaiSheets.formatIso(lastRun.at) : '',
    lastRunMessage: lastRun ? lastRun.message : '',
    lastRunSent: lastRun ? lastRun.sent || 0 : 0,
    // 'Every Monday at around 09:00'. Empty for the row-driven triggers,
    // which have no schedule to describe. Built here because the fallback
    // hour for pre-schedule rules lives in document settings.
    scheduleLabel:
      trigger && trigger.usesSchedule
        ? ReplaiSchedule.describe(
            rule.schedule,
            ReplaiRules.getSettings().reminderHour
          )
        : '',
  };
}
