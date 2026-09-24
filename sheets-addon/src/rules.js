/**
 * rules.js — what a rule is, and where rules live.
 *
 * Two namespaces, split by testability:
 *
 *   ReplaiRuleSchema — PURE. Normalises and validates a draft coming
 *     from the wizard. Unit-tested, because "this rule looked saved but
 *     was missing its phone column" is a silent failure that only shows
 *     up when a send does not happen.
 *
 *   ReplaiRules — the DocumentProperties store. Per-document on purpose:
 *     rules describe THIS spreadsheet's columns, so they belong to the
 *     file and stay working when it is shared. (The API key is the
 *     opposite — per user, never in the document. See auth.js.)
 *
 * STORAGE SHAPE: ONE PROPERTY PER RULE, PLUS AN INDEX
 * A property value is capped at 9 kB and a whole store at 500 kB. One
 * JSON array of every rule would fit roughly ten rules before writes
 * started failing, and it would fail by silently rejecting the eleventh.
 * So each rule gets `replai.rule.<id>` and `replai.ruleIndex.v1` holds
 * the id order — which also means saving one rule cannot corrupt another.
 */
const ReplaiRuleSchema = {
  VERSION: 1,

  TRIGGER_TYPES: [
    {
      id: 'new_row',
      label: 'New Row Added',
      hint: 'Fires on rows added after this rule is saved, including from a linked Google Form. Rows already in the sheet are never treated as new.',
      requiresCondition: false,
    },
    {
      id: 'on_change',
      label: 'On Change',
      hint: 'Fires when someone edits a row and it matches. Each row sends once, ever. A value changed by a formula, an import or another script is not detected — use a Time-Based Reminder for those.',
      requiresCondition: true,
    },
    {
      id: 'reminder',
      label: 'Time-Based Reminder',
      hint: 'Checked on the schedule you set below. Use the date conditions for birthdays, renewals and due dates.',
      requiresCondition: true,
      /** The only trigger type that carries a schedule. */
      usesSchedule: true,
    },
  ],

  MEDIA_TYPES: [
    { id: 'none', label: 'None' },
    { id: 'image', label: 'Image' },
    { id: 'document', label: 'Document' },
    { id: 'video', label: 'Video' },
  ],

  NAME_MAX: 80,

  /** Country code as typed: 1-4 digits, optional leading +. */
  COUNTRY_CODE_RE: /^\+?\d{1,4}$/,

  findTrigger: function (id) {
    for (let i = 0; i < ReplaiRuleSchema.TRIGGER_TYPES.length; i++) {
      if (ReplaiRuleSchema.TRIGGER_TYPES[i].id === id) {
        return ReplaiRuleSchema.TRIGGER_TYPES[i];
      }
    }
    return null;
  },

  /**
   * Coerce a draft from the sidebar into the stored shape. Unknown keys
   * are dropped rather than merged: the draft arrives from the client,
   * and a rule record is later used to build a paid send.
   */
  normalise: function (draft) {
    const input = draft || {};
    const campaign = input.campaign || {};
    const media = input.media || {};

    return {
      schemaVersion: ReplaiRuleSchema.VERSION,
      id: ReplaiRuleSchema.str_(input.id),
      name: ReplaiRuleSchema.str_(input.name).slice(
        0,
        ReplaiRuleSchema.NAME_MAX
      ),
      enabled: input.enabled !== false,
      sheetName: ReplaiRuleSchema.str_(input.sheetName),
      triggerType: ReplaiRuleSchema.str_(input.triggerType),
      conditions: ReplaiRuleSchema.normaliseConditions_(input.conditions),
      // Stored for every rule so the field is never absent, but only
      // consulted for `reminder`. See schedule.js for why the timing lives
      // on the rule rather than in the trigger.
      schedule: ReplaiSchedule.normalise(input.schedule),
      campaign: {
        id: ReplaiRuleSchema.str_(campaign.id),
        name: ReplaiRuleSchema.str_(campaign.name),
        templateName: ReplaiRuleSchema.str_(campaign.templateName),
        templateLanguage: ReplaiRuleSchema.str_(campaign.templateLanguage),
        variableCount: ReplaiRuleSchema.int_(campaign.variableCount, 0),
        // Reported by the CRM from the template's header. Stored so the
        // wizard can require a file on edit without re-fetching, and so
        // validation below can refuse a rule Meta would reject for every
        // single recipient.
        mediaRequired: campaign.mediaRequired === true,
      },
      phoneColumn: ReplaiRuleSchema.str_(input.phoneColumn),
      nameColumn: ReplaiRuleSchema.str_(input.nameColumn),
      countryCode: ReplaiRuleSchema.normaliseCountryCode_(input.countryCode),
      variables: ReplaiRuleSchema.normaliseVariables_(input.variables),
      media: {
        type: ReplaiRuleSchema.str_(media.type) || 'none',
        source: ReplaiRuleSchema.str_(media.source) || 'url',
        column: ReplaiRuleSchema.str_(media.column),
        url: ReplaiRuleSchema.str_(media.url),
      },
      owner: {
        email: ReplaiRuleSchema.str_((input.owner || {}).email),
      },
      createdAt: ReplaiRuleSchema.str_(input.createdAt),
      updatedAt: ReplaiRuleSchema.str_(input.updatedAt),
    };
    // Note what is deliberately absent: baselineRow, lastRun and the
    // needs-attention flags. Those are written by the engine, not by the
    // wizard, and a draft round-tripping through the client must not be
    // able to reset them. ReplaiRules.save merges them back from the
    // stored record.
  },

  /**
   * @returns {{ok: boolean, errors: Object, rule: Object}} `errors` is
   *   keyed by field so the wizard can render each message against the
   *   control that caused it. A single "check your input" banner makes
   *   the user hunt.
   */
  validate: function (draft) {
    const rule = ReplaiRuleSchema.normalise(draft);
    const errors = {};

    // ---- step 1 ----
    if (!rule.name) errors.name = 'Give the rule a name.';
    if (!rule.sheetName) errors.sheetName = 'Choose which sheet to watch.';

    const trigger = ReplaiRuleSchema.findTrigger(rule.triggerType);
    if (!trigger) errors.triggerType = 'Choose when this rule should run.';

    const conditionErrors = {};
    for (let i = 0; i < rule.conditions.length; i++) {
      const problem = ReplaiRuleSchema.conditionProblem_(rule.conditions[i]);
      if (problem) conditionErrors[i] = problem;
    }
    if (Object.keys(conditionErrors).length > 0) {
      errors.conditions = conditionErrors;
    }

    // `New Row Added` with no conditions is legitimate — "every new row".
    // The other two would mean "send to every row in the sheet, today",
    // which is never what someone meant to build.
    if (trigger && trigger.requiresCondition && rule.conditions.length === 0) {
      errors.conditionsMissing =
        'Add at least one condition, otherwise this rule would match every row.';
    }

    // Validated against the RAW draft, not the normalised plan: normalise
    // rounds anything unusable into a legal default, so checking the plan
    // would silently accept "hour 25" as 09:00.
    if (trigger && trigger.usesSchedule) {
      const scheduleProblem = ReplaiSchedule.problem(
        (draft || {}).schedule || {}
      );
      if (scheduleProblem) errors.schedule = scheduleProblem;
    }

    // ---- step 2 ----
    if (!rule.campaign.id) errors.campaign = 'Choose a campaign to send.';
    if (!rule.phoneColumn) {
      errors.phoneColumn = 'Choose the column holding the WhatsApp number.';
    }
    if (rule.countryCode === null) {
      errors.countryCode = 'Use a dialling code like +91.';
      rule.countryCode = '';
    }

    for (let v = 0; v < rule.variables.length; v++) {
      const variable = rule.variables[v];
      if (variable.source === 'column' && !variable.column) {
        errors['variable.' + v] = 'Pick a column or switch to a fixed value.';
      } else if (variable.source === 'literal' && !variable.value) {
        errors['variable.' + v] = 'Enter the fixed value to send.';
      }
    }

    if (rule.variables.length !== rule.campaign.variableCount) {
      // Reachable if the campaign's template was edited in the CRM after
      // the wizard loaded it. Sending the wrong number of variables is
      // rejected by Meta per recipient, so it is caught here instead.
      errors.variables =
        'This campaign now expects ' +
        rule.campaign.variableCount +
        ' variable(s). Reselect the campaign to refresh the list.';
    }

    if (rule.campaign.mediaRequired && rule.media.type === 'none') {
      errors.media =
        'This campaign\u2019s template has a media header, so a file is required.';
    } else if (rule.media.type !== 'none') {
      if (rule.media.source === 'column' && !rule.media.column) {
        errors.media = 'Choose the column holding the file URL.';
      } else if (rule.media.source === 'url') {
        if (!rule.media.url) {
          errors.media = 'Enter the file URL to attach.';
        } else if (!/^https:\/\/.+/i.test(rule.media.url)) {
          // http:// is rejected by Meta when it fetches the asset, so
          // there is no value in storing one.
          errors.media = 'The file URL must start with https://';
        }
      }
    }

    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      rule: rule,
    };
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  /** @returns {?string} a message, or null when the condition is usable. */
  conditionProblem_: function (condition) {
    if (!condition.column) return 'Choose a column.';

    const operator = ReplaiConditions.find(condition.operator);
    if (!operator) return 'Choose a condition.';

    if (operator.valueKind === 'none') return null;

    if (condition.value === '') {
      return operator.valueKind === 'days'
        ? 'Enter a number of days.'
        : 'Enter a value to compare against.';
    }

    if (operator.valueKind === 'days') {
      if (!/^\d+$/.test(condition.value)) {
        return 'Days must be a whole number, 0 or more.';
      }
    }

    if (
      operator.valueKind === 'number' &&
      ReplaiRuleSchema.notNumber_(condition.value)
    ) {
      return 'Enter a number to compare against.';
    }

    return null;
  },

  notNumber_: function (value) {
    return !/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(String(value).trim());
  },

  normaliseConditions_: function (conditions) {
    if (!conditions || !conditions.length) return [];
    const out = [];
    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i] || {};
      const operator = ReplaiRuleSchema.str_(condition.operator);
      const meta = ReplaiConditions.find(operator);
      out.push({
        column: ReplaiRuleSchema.str_(condition.column),
        operator: operator,
        // Operators that take no value must not carry a stale one: it
        // would reappear in the wizard on edit and read as meaningful.
        value:
          meta && meta.valueKind === 'none'
            ? ''
            : ReplaiRuleSchema.str_(condition.value),
      });
    }
    return out;
  },

  normaliseVariables_: function (variables) {
    if (!variables || !variables.length) return [];
    const out = [];
    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i] || {};
      const source =
        ReplaiRuleSchema.str_(variable.source) === 'literal'
          ? 'literal'
          : 'column';
      out.push({
        source: source,
        column:
          source === 'column' ? ReplaiRuleSchema.str_(variable.column) : '',
        value:
          source === 'literal' ? ReplaiRuleSchema.str_(variable.value) : '',
      });
    }
    return out;
  },

  /** '' when absent, '+NN' when valid, null when unusable. */
  normaliseCountryCode_: function (value) {
    const raw = ReplaiRuleSchema.str_(value).replace(/[\s-]/g, '');
    if (!raw) return '';
    if (!ReplaiRuleSchema.COUNTRY_CODE_RE.test(raw)) return null;
    return raw.charAt(0) === '+' ? raw : '+' + raw;
  },

  str_: function (value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  },

  int_: function (value, fallback) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) || parsed < 0 ? fallback : parsed;
  },
};

/**
 * The store. Not pure — talks to DocumentProperties.
 */
const ReplaiRules = {
  INDEX_PROP: 'replai.ruleIndex.v1',
  RULE_PREFIX: 'replai.rule.',
  SETTINGS_PROP: 'replai.settings.v1',

  /** Apps Script rejects a property value over 9 kB. Leave headroom. */
  MAX_RULE_BYTES: 8000,

  DEFAULT_REMINDER_HOUR: 9,

  props_: function () {
    return PropertiesService.getDocumentProperties();
  },

  /**
   * Every rule, in saved order. Self-heals: an id in the index whose
   * rule is missing or unparseable is dropped from the index rather than
   * left to break the list forever.
   */
  list: function () {
    const props = ReplaiRules.props_();
    const ids = ReplaiRules.readIndex_(props);
    const rules = [];
    const survivors = [];

    for (let i = 0; i < ids.length; i++) {
      const raw = props.getProperty(ReplaiRules.RULE_PREFIX + ids[i]);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        parsed.id = ids[i];
        rules.push(parsed);
        survivors.push(ids[i]);
      } catch (err) {
        console.error(
          '[replai] dropping unreadable rule ' + ids[i] + ': ' + err
        );
      }
    }

    if (survivors.length !== ids.length) {
      ReplaiRules.writeIndex_(props, survivors);
    }

    return rules;
  },

  count: function () {
    return ReplaiRules.readIndex_(ReplaiRules.props_()).length;
  },

  get: function (id) {
    if (!id) return null;
    const raw = ReplaiRules.props_().getProperty(ReplaiRules.RULE_PREFIX + id);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      parsed.id = id;
      return parsed;
    } catch (err) {
      console.error('[replai] unreadable rule ' + id + ': ' + err);
      return null;
    }
  },

  /**
   * Create or update. Validates first, so an unusable rule never reaches
   * storage — a half-saved rule is worse than a rejected one, because it
   * looks finished in the list.
   *
   * @param {Object} draft
   * @param {string} ownerEmail  Whose API key this rule will send with.
   * @returns {{ok: boolean, errors: Object, rule: Object, message: string}}
   */
  save: function (draft, ownerEmail) {
    const check = ReplaiRuleSchema.validate(draft);
    if (!check.ok) {
      return {
        ok: false,
        errors: check.errors,
        message: 'Some details still need fixing.',
      };
    }

    const props = ReplaiRules.props_();
    const rule = check.rule;
    const now = new Date().toISOString();
    const isNew =
      !rule.id || !props.getProperty(ReplaiRules.RULE_PREFIX + rule.id);

    if (isNew) {
      rule.id = ReplaiRules.newId_();
      rule.createdAt = now;
      // A rule sends under the key of whoever created it; recording that
      // is what lets the sidebar say "Runs as …" and lets a colleague
      // take it over later (plan §14.5).
      rule.owner = { email: ReplaiRuleSchema.str_(ownerEmail) };
      rule.baselineRow = ReplaiRules.baselineFor_(rule);
      rule.lastRun = null;
      rule.lastFiredOn = '';
      rule.needsAttention = false;
      rule.attentionReason = '';
    } else {
      const existing = ReplaiRules.get(rule.id) || {};
      rule.createdAt = existing.createdAt || now;
      rule.owner = {
        email:
          (existing.owner && existing.owner.email) ||
          ReplaiRuleSchema.str_(ownerEmail),
      };
      // Engine-owned state survives an edit. Re-baseline only when the
      // rule is pointed at a different sheet, where the old row count
      // means nothing — otherwise editing a rule's name would make a
      // New Row rule treat every existing row as new.
      rule.baselineRow =
        existing.sheetName === rule.sheetName &&
        typeof existing.baselineRow === 'number'
          ? existing.baselineRow
          : ReplaiRules.baselineFor_(rule);
      rule.lastRun = existing.lastRun || null;
      // Engine-owned, like lastRun. Deliberately NOT cleared on edit: if
      // today's reminder already went out, changing the rule's name must
      // not make it send to everyone a second time.
      rule.lastFiredOn = existing.lastFiredOn || '';
      rule.needsAttention = existing.needsAttention === true;
      rule.attentionReason = existing.attentionReason || '';
    }
    rule.updatedAt = now;

    const serialised = JSON.stringify(rule);
    if (serialised.length > ReplaiRules.MAX_RULE_BYTES) {
      return {
        ok: false,
        errors: {},
        message:
          'This rule is too large to store. Shorten the fixed values or the rule name.',
      };
    }

    props.setProperty(ReplaiRules.RULE_PREFIX + rule.id, serialised);

    if (isNew) {
      const ids = ReplaiRules.readIndex_(props);
      ids.push(rule.id);
      ReplaiRules.writeIndex_(props, ids);
    }

    return {
      ok: true,
      errors: {},
      rule: rule,
      message: isNew ? 'Rule created.' : 'Rule updated.',
    };
  },

  remove: function (id) {
    if (!id) return false;
    const props = ReplaiRules.props_();
    props.deleteProperty(ReplaiRules.RULE_PREFIX + id);
    const ids = ReplaiRules.readIndex_(props).filter(function (candidate) {
      return candidate !== id;
    });
    ReplaiRules.writeIndex_(props, ids);
    return true;
  },

  setEnabled: function (id, enabled) {
    const rule = ReplaiRules.get(id);
    if (!rule) return false;
    rule.enabled = !!enabled;
    // Resuming re-baselines a New Row rule. While it was paused the
    // sheet kept growing, and firing on that backlog is not what "resume"
    // means to anyone.
    if (enabled && rule.triggerType === 'new_row') {
      rule.baselineRow = ReplaiRules.baselineFor_(rule);
    }
    rule.updatedAt = new Date().toISOString();
    ReplaiRules.write_(id, rule);
    return true;
  },

  /** Rules the engine should consider: saved, enabled, right trigger. */
  activeByTrigger: function (triggerTypes) {
    const all = ReplaiRules.list();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const rule = all[i];
      if (rule.enabled === false) continue;
      if (triggerTypes.indexOf(rule.triggerType) === -1) continue;
      out.push(rule);
    }
    return out;
  },

  /**
   * The row number a `New Row Added` rule treats as "already there".
   *
   * This is the single most important safeguard in the engine. Without
   * it, saving a New Row rule against a sheet that already holds 500
   * rows would treat all 500 as new the first time anything changed, and
   * send 500 paid messages to real people. The watermark is taken at
   * save time, so a rule can only ever fire on rows added AFTER it was
   * created.
   *
   * Only meaningful for `new_row`; stored for every rule so the field is
   * never absent.
   */
  baselineFor_: function (rule) {
    try {
      return ReplaiSheets.lastRow(rule.sheetName);
    } catch (err) {
      // If the sheet cannot be read, the safe baseline is "everything
      // that exists is old". A missed send is recoverable; 500
      // unintended ones are not.
      console.warn('[replai] could not read a baseline row: ' + err);
      return Number.MAX_SAFE_INTEGER;
    }
  },

  /** Records what a run did, for the rule card. */
  recordRun: function (id, summary) {
    const rule = ReplaiRules.get(id);
    if (!rule) return false;
    rule.lastRun = {
      at: new Date().toISOString(),
      matched: summary.matched || 0,
      sent: summary.sent || 0,
      failed: summary.failed || 0,
      skipped: summary.skipped || 0,
      duplicate: summary.duplicate || 0,
      message: ReplaiRuleSchema.str_(summary.message).slice(0, 300),
    };
    if (typeof summary.baselineRow === 'number') {
      rule.baselineRow = summary.baselineRow;
    }
    ReplaiRules.write_(id, rule);
    return true;
  },

  /**
   * Marks a reminder rule as handled for a given calendar day.
   *
   * The sweep runs hourly, so without this marker a rule due at 09:00
   * would be re-examined at 10:00, 11:00 and every hour until midnight.
   * Written whether or not the run sent anything: "checked today" is the
   * claim, not "sent today". A same-day retry would be harmless anyway —
   * a reminder's idempotency key includes the fire date, so the CRM
   * refuses a second send for the same row on the same day — but doing
   * the work twenty-four times would still burn the account's API budget.
   *
   * @param {string} id
   * @param {string} isoDate 'yyyy-mm-dd' in the spreadsheet's timezone.
   */
  recordReminderFired: function (id, isoDate) {
    const rule = ReplaiRules.get(id);
    if (!rule) return false;
    rule.lastFiredOn = ReplaiRuleSchema.str_(isoDate);
    ReplaiRules.write_(id, rule);
    return true;
  },

  /**
   * Flags a rule whose owner's key no longer works. Per plan §14.5 the
   * rule is marked rather than silently failing, so someone can take it
   * over instead of wondering why messages stopped.
   */
  flagAttention: function (id, reason) {
    const rule = ReplaiRules.get(id);
    if (!rule) return false;
    rule.needsAttention = true;
    rule.attentionReason = ReplaiRuleSchema.str_(reason).slice(0, 300);
    ReplaiRules.write_(id, rule);
    return true;
  },

  clearAttention: function (id) {
    const rule = ReplaiRules.get(id);
    if (!rule || !rule.needsAttention) return false;
    rule.needsAttention = false;
    rule.attentionReason = '';
    ReplaiRules.write_(id, rule);
    return true;
  },

  /**
   * Hands a rule to the current user, so it sends with their key from
   * now on. The caller re-installs the triggers afterwards — a trigger
   * belongs to the user who created it, so ownership without
   * re-installation would change the label and nothing else.
   */
  takeOver: function (id, email) {
    const rule = ReplaiRules.get(id);
    if (!rule) return false;
    rule.owner = { email: ReplaiRuleSchema.str_(email) };
    rule.needsAttention = false;
    rule.attentionReason = '';
    rule.updatedAt = new Date().toISOString();
    ReplaiRules.write_(id, rule);
    return true;
  },

  /** True when any rule needs the reminder sweep. */
  hasReminderRule: function () {
    const rules = ReplaiRules.list();
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].triggerType === 'reminder') return true;
    }
    return false;
  },

  // ---- per-document settings ----

  getSettings: function () {
    const raw = ReplaiRules.props_().getProperty(ReplaiRules.SETTINGS_PROP);
    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) || {};
      } catch (err) {
        console.error('[replai] unreadable settings, using defaults: ' + err);
      }
    }
    return {
      reminderHour: ReplaiRules.clampHour_(parsed.reminderHour),
    };
  },

  /*
    `setReminderHour` used to live here, behind a single "Daily reminders
    run around HH:00" control in the rules list. Each rule now carries its
    own schedule (see schedule.js), so there is nothing document-wide left
    to set.

    `reminderHour` itself is KEPT, read-only, as the migration default:
    rules saved before schedules existed have no hour of their own, and
    reading this one means they keep firing at the time the operator
    originally chose instead of all jumping to 09:00.
  */

  clampHour_: function (hour) {
    const parsed = parseInt(hour, 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 23) {
      return ReplaiRules.DEFAULT_REMINDER_HOUR;
    }
    return parsed;
  },

  // ---- internals ----

  readIndex_: function (props) {
    const raw = props.getProperty(ReplaiRules.INDEX_PROP);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[replai] unreadable rule index: ' + err);
      return [];
    }
  },

  writeIndex_: function (props, ids) {
    props.setProperty(ReplaiRules.INDEX_PROP, JSON.stringify(ids));
  },

  /**
   * Single write path for an existing rule, so the 9 kB property ceiling
   * is checked in one place. An engine update that silently exceeded it
   * would leave the index pointing at a rule that can no longer be read.
   */
  write_: function (id, rule) {
    const serialised = JSON.stringify(rule);
    if (serialised.length > ReplaiRules.MAX_RULE_BYTES) {
      console.error(
        '[replai] refusing to write rule ' +
          id +
          ': ' +
          serialised.length +
          ' bytes'
      );
      return false;
    }
    ReplaiRules.props_().setProperty(ReplaiRules.RULE_PREFIX + id, serialised);
    return true;
  },

  newId_: function () {
    return 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  },
};

/**
 * Which DocumentProperties keys hold this add-on's rule state.
 *
 * Pure, and separated out so it can be unit tested — the reset it backs
 * is destructive and irreversible, so "does it delete exactly the right
 * keys" is worth proving rather than assuming.
 *
 * WHY THIS SCANS KEYS INSTEAD OF WALKING THE RULE INDEX
 * `ReplaiRules.list()` self-heals: an id whose rule is missing or
 * unparseable is dropped from the index. That leaves the orphaned
 * `replai.rule.<id>` property behind. A reset driven by the index alone
 * would walk straight past those and leave junk in a spreadsheet the
 * user was told had been wiped.
 *
 * Equally important is what it does NOT match: anything outside the
 * `replai.` namespace. A spreadsheet may carry document properties from
 * other add-ons, and this must never touch them.
 *
 * @param {string[]} allKeys Every key currently in DocumentProperties.
 * @returns {string[]} The subset to delete.
 */
function replaiRuleStateKeys(allKeys) {
  const keys = allKeys || [];
  const out = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof key !== 'string') continue;

    const isRule = key.indexOf(ReplaiRules.RULE_PREFIX) === 0;
    const isIndex = key === ReplaiRules.INDEX_PROP;
    const isSettings = key === ReplaiRules.SETTINGS_PROP;

    if (isRule || isIndex || isSettings) out.push(key);
  }

  return out;
}

/**
 * Delete every rule, the index, and the document settings.
 *
 * Backs "Reset Everything". Returns the number of RULES removed (not
 * keys), because that is the number the confirmation prompt quotes and
 * the user recognises.
 */
ReplaiRules.deleteAll = function () {
  const props = ReplaiRules.props_();
  let all = {};
  try {
    all = props.getProperties() || {};
  } catch (err) {
    console.error('[replai] could not enumerate document properties: ' + err);
    return 0;
  }

  const keys = replaiRuleStateKeys(Object.keys(all));
  let ruleCount = 0;

  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(ReplaiRules.RULE_PREFIX) === 0) ruleCount++;
    try {
      props.deleteProperty(keys[i]);
    } catch (err) {
      // Keep going: a half-cleared reset is still better than stopping
      // at the first stubborn key and leaving the rest behind.
      console.warn('[replai] could not delete ' + keys[i] + ': ' + err);
    }
  }

  return ruleCount;
};

/* Node/vitest only — see the note at the foot of dates.js. Only the pure
   half is exported; ReplaiRules needs DocumentProperties and is covered
   by manual testing in a real sheet instead. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReplaiRuleSchema: ReplaiRuleSchema,
    replaiRuleStateKeys: replaiRuleStateKeys,
  };
}
