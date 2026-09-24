/**
 * schedule.js — WHEN a Time-Based Reminder rule runs.
 *
 * PURE. No SpreadsheetApp, no PropertiesService, no `new Date()` without
 * being handed one. Unit-tested, because a reminder that fires on the
 * wrong day — or silently never fires — is invisible until a customer
 * asks why they were not messaged.
 *
 * ─── Why the schedule lives here and not in the trigger ───────────
 *
 * The obvious build is one time-based trigger per rule, at that rule's
 * hour. It cannot be done: installable triggers are capped at 20 per user
 * per script, shared across every spreadsheet that user has the add-on
 * in, so a trigger per rule exhausts the budget after a handful of rules
 * and then fails on the next save in a way nobody can diagnose.
 *
 * The previous design took the other extreme — ONE trigger at ONE hour
 * for the whole document, which is why a rule had no time of its own and
 * "Daily" was the only frequency there could be.
 *
 * So: a single hourly sweep asks each rule whether it is due, and every
 * scheduling decision happens in this file. One trigger, any number of
 * rules, each with its own time, and weekly and monthly become possible
 * without asking Google for anything extra.
 *
 * ─── How precise the time can actually be ────────────────────────
 *
 * One hour. Not minutes, and certainly not seconds. This is a platform
 * ceiling, not a design choice, and it was established the hard way.
 *
 * An every-minute sweep was built and Google refused to install it:
 *
 *   "The recurrence interval for an Add-on trigger must be at least one
 *    hour."
 *
 * That limit is specific to editor add-ons — `everyMinutes(1)` works in a
 * container-bound script, which is why the general `everyMinutes()`
 * documentation says nothing about it. And the failure is total rather
 * than graceful: `create()` throws, no trigger exists, and every reminder
 * rule reads "Not armed" until someone notices.
 *
 * On top of that, Google schedules recurring triggers with a tolerance
 * rather than to the instant ("if you create a recurring 9 a.m. trigger,
 * Apps Script chooses a time between 9 a.m. and 10 a.m."), so even the
 * hourly sweep does not land on the hour.
 *
 * So: the sweep runs hourly, a rule stores an hour, and everything the
 * operator reads says "around". A `minute` field is still carried through
 * this module — rules saved during the every-minute attempt have one, and
 * it must keep working — but the wizard no longer offers minutes, because
 * a control that cannot affect the outcome is worse than no control.
 */
const ReplaiSchedule = {
  FREQUENCIES: [
    {
      id: 'daily',
      label: 'Daily',
      hint: 'Checked every day at about this time.',
    },
    {
      id: 'weekly',
      label: 'Weekly',
      hint: 'Checked once a week, on the day you choose.',
    },
    {
      id: 'monthly',
      label: 'Monthly',
      hint: 'Checked once a month, on the date you choose.',
    },
  ],

  /** ISO weekday numbering: 1 = Monday … 7 = Sunday. */
  DAYS_OF_WEEK: [
    { id: 1, label: 'Monday' },
    { id: 2, label: 'Tuesday' },
    { id: 3, label: 'Wednesday' },
    { id: 4, label: 'Thursday' },
    { id: 5, label: 'Friday' },
    { id: 6, label: 'Saturday' },
    { id: 7, label: 'Sunday' },
  ],

  DEFAULT_FREQUENCY: 'daily',
  DEFAULT_HOUR: 9,
  DEFAULT_MINUTE: 0,
  DEFAULT_DAY_OF_WEEK: 1,
  DEFAULT_DAY_OF_MONTH: 1,

  /**
   * Coerce whatever the wizard sent into a usable plan.
   *
   * Never returns null and never throws: a rule with an unreadable
   * schedule must fall back to a sane time, not stop firing.
   *
   * @param {Object} input
   * @param {number} [fallbackHour] The document's old single reminder
   *   hour. Used for rules saved before schedules existed, so migrating
   *   does not silently move everyone's reminders to 09:00.
   */
  normalise: function (input, fallbackHour) {
    const source = input || {};
    const base =
      typeof fallbackHour === 'number'
        ? ReplaiSchedule.clampHour_(fallbackHour)
        : ReplaiSchedule.DEFAULT_HOUR;

    return {
      frequency: ReplaiSchedule.clampFrequency_(source.frequency),
      hour: ReplaiSchedule.clampHour_(
        ReplaiSchedule.isPresent_(source.hour) ? source.hour : base
      ),
      minute: ReplaiSchedule.clampInt_(
        source.minute,
        0,
        59,
        ReplaiSchedule.DEFAULT_MINUTE
      ),
      dayOfWeek: ReplaiSchedule.clampInt_(
        source.dayOfWeek,
        1,
        7,
        ReplaiSchedule.DEFAULT_DAY_OF_WEEK
      ),
      dayOfMonth: ReplaiSchedule.clampInt_(
        source.dayOfMonth,
        1,
        31,
        ReplaiSchedule.DEFAULT_DAY_OF_MONTH
      ),
    };
  },

  /**
   * @returns {?string} A message for the wizard, or null when usable.
   *
   * ─── What is checked, and what is allowed to be absent ──────────
   *
   * Validates the RAW input rather than a normalised plan, so a typo is
   * reported instead of being quietly rounded into something legal:
   * `normalise` turns hour 25 into 09:00, and accepting that silently
   * would move a reminder by a whole working day.
   *
   * An ABSENT field is not an error. A rule saved before schedules existed
   * carries no schedule at all, and refusing to save it would mean an
   * operator could no longer edit their own oldest rules — so a missing
   * value means "use the default" and only a present-but-wrong value is
   * reported.
   *
   * The exception is a monthly rule's date. It is the one field typed
   * freely rather than picked from a list, so it is the one field where a
   * slip is likely, and defaulting `dayOfMonth` to the 1st would retime
   * the rule without saying so.
   */
  problem: function (input) {
    const source = input || {};

    if (
      ReplaiSchedule.isPresent_(source.frequency) &&
      !ReplaiSchedule.findFrequency(source.frequency)
    ) {
      return 'Choose how often this rule should check.';
    }
    if (
      ReplaiSchedule.isPresent_(source.hour) &&
      !ReplaiSchedule.isWholeNumberInRange_(source.hour, 0, 23)
    ) {
      return 'Choose the time of day to check.';
    }
    if (
      ReplaiSchedule.isPresent_(source.minute) &&
      !ReplaiSchedule.isWholeNumberInRange_(source.minute, 0, 59)
    ) {
      return 'Choose the time of day to check.';
    }
    if (
      source.frequency === 'weekly' &&
      ReplaiSchedule.isPresent_(source.dayOfWeek) &&
      !ReplaiSchedule.isWholeNumberInRange_(source.dayOfWeek, 1, 7)
    ) {
      return 'Choose which day of the week to check.';
    }
    if (
      source.frequency === 'monthly' &&
      !ReplaiSchedule.isWholeNumberInRange_(source.dayOfMonth, 1, 31)
    ) {
      return 'Enter a day of the month between 1 and 31.';
    }
    return null;
  },

  findFrequency: function (id) {
    for (let i = 0; i < ReplaiSchedule.FREQUENCIES.length; i++) {
      if (ReplaiSchedule.FREQUENCIES[i].id === id) {
        return ReplaiSchedule.FREQUENCIES[i];
      }
    }
    return null;
  },

  dayOfWeekLabel: function (id) {
    for (let i = 0; i < ReplaiSchedule.DAYS_OF_WEEK.length; i++) {
      if (ReplaiSchedule.DAYS_OF_WEEK[i].id === id) {
        return ReplaiSchedule.DAYS_OF_WEEK[i].label;
      }
    }
    return '';
  },

  /**
   * 'Every Monday at around 09:00' — shown on the rule card.
   *
   * "around" is load-bearing. The sweep is hourly and Google picks the
   * minute within each hour, so a card promising an exact time would be
   * wrong by up to an hour on every single run.
   */
  describe: function (input, fallbackHour) {
    const plan = ReplaiSchedule.normalise(input, fallbackHour);
    const at = 'around ' + ReplaiSchedule.clockOf(plan);

    if (plan.frequency === 'weekly') {
      return (
        'Every ' + ReplaiSchedule.dayOfWeekLabel(plan.dayOfWeek) + ' at ' + at
      );
    }
    if (plan.frequency === 'monthly') {
      return (
        'Day ' +
        plan.dayOfMonth +
        ' of each month at ' +
        at +
        (plan.dayOfMonth > 28 ? ' (or the last day, in shorter months)' : '')
      );
    }
    return 'Every day at ' + at;
  },

  /** 'HH:MM' — also the value an <input type="time"> expects. */
  clockOf: function (input, fallbackHour) {
    const plan = ReplaiSchedule.normalise(input, fallbackHour);
    return (
      ReplaiSchedule.pad_(plan.hour) + ':' + ReplaiSchedule.pad_(plan.minute)
    );
  },

  /** Minutes since midnight, so a time is one comparable number. */
  minutesOf: function (parts) {
    if (!parts || typeof parts.hour !== 'number') return null;
    const minute = typeof parts.minute === 'number' ? parts.minute : 0;
    return parts.hour * 60 + minute;
  },

  /**
   * Should this rule run on this sweep?
   *
   * @param {Object} input     The rule's schedule.
   * @param {{y: number, m: number, d: number, hour: number,
   *           minute: number}} now
   *   The current moment in the SPREADSHEET's timezone. Never the
   *   script's and never UTC — "today" in Asia/Kolkata is not "today" in
   *   UTC for five and a half hours a day, and a reminder that fires a
   *   day early is a visible failure nobody can explain.
   * @param {string} [lastFiredOn] 'yyyy-mm-dd' of the last run.
   * @param {number} [fallbackHour]
   */
  isDue: function (input, now, lastFiredOn, fallbackHour) {
    if (!now || typeof now.hour !== 'number') return false;

    const today = ReplaiSchedule.isoOf(now);
    if (!today) return false;

    // Once per scheduled day, however many times the sweep runs. The
    // sweep is hourly, so without this a due rule would be re-examined
    // every hour until midnight.
    if (lastFiredOn && String(lastFiredOn) === today) return false;

    const plan = ReplaiSchedule.normalise(input, fallbackHour);

    // `>=`, not `===`. The sweep is hourly and Google picks the minute
    // within each hour, so the run that catches a rule almost never lands
    // on its exact time. Google can also skip or delay a run, and exact
    // matching would then drop that day's reminder
    // altogether — so a missed 09:30 is picked up by the next sweep that
    // does happen, still on the right day. A late reminder is recoverable;
    // a silently missing one is the failure operators cannot see.
    if (ReplaiSchedule.minutesOf(now) < ReplaiSchedule.minutesOf(plan)) {
      return false;
    }

    if (plan.frequency === 'weekly') {
      return ReplaiSchedule.dowOf(now) === plan.dayOfWeek;
    }
    if (plan.frequency === 'monthly') {
      return now.d === ReplaiSchedule.effectiveDayOfMonth(plan.dayOfMonth, now);
    }
    return true;
  },

  /**
   * The day a monthly rule actually lands on this month.
   *
   * Clamped to the month's length, so "the 31st" fires on 30 April and 28
   * February rather than skipping those months entirely — which is what a
   * naive `now.d === dayOfMonth` does, silently, for seven months a year.
   */
  effectiveDayOfMonth: function (dayOfMonth, now) {
    const wanted = ReplaiSchedule.clampInt_(
      dayOfMonth,
      1,
      31,
      ReplaiSchedule.DEFAULT_DAY_OF_MONTH
    );
    const length = ReplaiSchedule.daysInMonth(now.y, now.m);
    return Math.min(wanted, length);
  },

  daysInMonth: function (year, month) {
    // Day 0 of the next month is the last day of this one.
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  },

  /**
   * ISO weekday (1 = Monday … 7 = Sunday) for a calendar date.
   *
   * Computed from y/m/d in UTC deliberately: once the calendar date is
   * known, its weekday is the same in every timezone, so this stays pure
   * and cannot drift with the script's locale.
   */
  dowOf: function (parts) {
    if (!parts) return 0;
    const day = new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
    return day === 0 ? 7 : day;
  },

  /** 'yyyy-mm-dd'. Used as the once-per-day marker, so padding matters. */
  isoOf: function (parts) {
    if (!parts || !parts.y || !parts.m || !parts.d) return '';
    return (
      parts.y +
      '-' +
      ReplaiSchedule.pad_(parts.m) +
      '-' +
      ReplaiSchedule.pad_(parts.d)
    );
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  clampFrequency_: function (value) {
    return ReplaiSchedule.findFrequency(value)
      ? value
      : ReplaiSchedule.DEFAULT_FREQUENCY;
  },

  clampHour_: function (value) {
    return ReplaiSchedule.clampInt_(value, 0, 23, ReplaiSchedule.DEFAULT_HOUR);
  },

  clampInt_: function (value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) return fallback;
    return parsed;
  },

  /** Distinguishes "not sent" from "sent as 0", which is a real hour. */
  isPresent_: function (value) {
    return value !== undefined && value !== null && value !== '';
  },

  isWholeNumberInRange_: function (value, min, max) {
    if (value === null || value === undefined || value === '') return false;
    if (!/^\d+$/.test(String(value).trim())) return false;
    const parsed = parseInt(value, 10);
    return parsed >= min && parsed <= max;
  },

  pad_: function (n) {
    return (n < 10 ? '0' : '') + n;
  },
};

/* Node/vitest only — see the note at the foot of dates.js. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplaiSchedule: ReplaiSchedule };
}
