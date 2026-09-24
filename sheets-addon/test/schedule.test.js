import { describe, expect, it } from 'vitest';

import { ReplaiSchedule } from '../src/schedule.js';

/*
  Scheduling is the other half of the "wrong without anyone noticing"
  problem that dates.test.js guards. A reminder that fires a day early, or
  skips seven months a year, or fires twenty-four times because the sweep
  is hourly, all look like nothing at all from inside the product.

  `now` is always the moment in the SPREADSHEET's timezone.
*/

const at = (y, m, d, hour, minute) => ({ y, m, d, hour, minute: minute || 0 });

// 2026-09-22 is a Tuesday. Used throughout so weekday maths is checkable.
const TUE = (hour) => at(2026, 9, 22, hour);

describe('normalise', () => {
  it('defaults an absent schedule to daily at 09:00', () => {
    expect(ReplaiSchedule.normalise(undefined)).toEqual({
      frequency: 'daily',
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      dayOfMonth: 1,
    });
  });

  it('keeps the minute the time picker sent', () => {
    expect(ReplaiSchedule.normalise({ hour: '14', minute: '45' })).toEqual({
      frequency: 'daily',
      hour: 14,
      minute: 45,
      dayOfWeek: 1,
      dayOfMonth: 1,
    });
  });

  it("adopts the document's old single hour when migrating", () => {
    // Rules saved before schedules existed ran at one document-wide hour.
    // Ignoring it would silently move every existing reminder to 09:00.
    expect(ReplaiSchedule.normalise(undefined, 17).hour).toBe(17);
    expect(ReplaiSchedule.normalise({ frequency: 'weekly' }, 17).hour).toBe(17);
  });

  it('prefers the rule\u2019s own hour over the migration fallback', () => {
    expect(ReplaiSchedule.normalise({ hour: 6 }, 17).hour).toBe(6);
  });

  it('accepts numeric strings from the wizard', () => {
    const plan = ReplaiSchedule.normalise({
      frequency: 'weekly',
      hour: '18',
      minute: '30',
      dayOfWeek: '5',
      dayOfMonth: '28',
    });
    expect(plan).toEqual({
      frequency: 'weekly',
      hour: 18,
      minute: 30,
      dayOfWeek: 5,
      dayOfMonth: 28,
    });
  });

  it('falls back rather than throwing on rubbish', () => {
    const plan = ReplaiSchedule.normalise({
      frequency: 'fortnightly',
      hour: 99,
      minute: 61,
      dayOfWeek: 0,
      dayOfMonth: 32,
    });
    expect(plan).toEqual({
      frequency: 'daily',
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      dayOfMonth: 1,
    });
  });

  it('keeps hour 0, which is a real time and not a missing value', () => {
    expect(ReplaiSchedule.normalise({ hour: 0 }, 17).hour).toBe(0);
  });
});

describe('problem', () => {
  const ok = { frequency: 'daily', hour: 9 };

  it('passes a usable schedule', () => {
    expect(ReplaiSchedule.problem(ok)).toBeNull();
    expect(
      ReplaiSchedule.problem({ frequency: 'weekly', hour: 9, dayOfWeek: 3 })
    ).toBeNull();
    expect(
      ReplaiSchedule.problem({ frequency: 'monthly', hour: 9, dayOfMonth: 15 })
    ).toBeNull();
  });

  it('accepts an absent schedule, so old rules stay editable', () => {
    // Rules saved before schedules existed carry none at all. Refusing
    // those would mean an operator could no longer save an edit to their
    // own oldest rules.
    expect(ReplaiSchedule.problem({})).toBeNull();
    expect(ReplaiSchedule.problem(undefined)).toBeNull();
    expect(ReplaiSchedule.problem({ frequency: 'daily' })).toBeNull();
  });

  it('rejects a frequency it does not implement', () => {
    expect(ReplaiSchedule.problem({ frequency: 'hourly' })).toMatch(
      /how often/i
    );
  });

  it('checks a weekday only when one was sent, and only for weekly', () => {
    expect(
      ReplaiSchedule.problem({ frequency: 'weekly', hour: 9, dayOfWeek: 9 })
    ).toMatch(/day of the week/i);
    // Absent: defaults to Monday rather than blocking the save.
    expect(ReplaiSchedule.problem({ frequency: 'weekly', hour: 9 })).toBeNull();
    // A daily rule carries a dayOfWeek it does not use; that is not an error.
    expect(ReplaiSchedule.problem(ok)).toBeNull();
  });

  it('always demands a valid date for a monthly rule', () => {
    // The one field typed freely rather than picked from a list, so a slip
    // is likely Ã¢â‚¬â€ and defaulting it to the 1st would retime the rule
    // without saying so.
    expect(ReplaiSchedule.problem({ frequency: 'monthly', hour: 9 })).toMatch(
      /between 1 and 31/i
    );
    expect(
      ReplaiSchedule.problem({ frequency: 'monthly', hour: 9, dayOfMonth: 0 })
    ).toMatch(/between 1 and 31/i);
    expect(
      ReplaiSchedule.problem({ frequency: 'monthly', hour: 9, dayOfMonth: 32 })
    ).toMatch(/between 1 and 31/i);
    expect(
      ReplaiSchedule.problem({
        frequency: 'monthly',
        hour: 9,
        dayOfMonth: '1.5',
      })
    ).toMatch(/between 1 and 31/i);
  });

  it('rejects a typo instead of rounding it into something legal', () => {
    // normalise() would turn 25 into 9; problem() must not.
    expect(ReplaiSchedule.problem({ frequency: 'daily', hour: 25 })).toMatch(
      /time of day/i
    );
  });
});

describe('isDue \u2014 daily', () => {
  const daily = { frequency: 'daily', hour: 9 };

  it('fires once the scheduled hour has arrived', () => {
    expect(ReplaiSchedule.isDue(daily, TUE(9), '')).toBe(true);
  });

  it('does not fire before the scheduled hour', () => {
    expect(ReplaiSchedule.isDue(daily, TUE(8), '')).toBe(false);
  });

  it('catches up later the same day when a sweep was missed', () => {
    // Google can skip or delay an hourly trigger. Exact-hour matching
    // would drop that day's run entirely; `>=` recovers it.
    expect(ReplaiSchedule.isDue(daily, TUE(14), '')).toBe(true);
  });

  it('fires only once a day, however many sweeps run', () => {
    expect(ReplaiSchedule.isDue(daily, TUE(10), '2026-09-22')).toBe(false);
  });

  it('fires again the next day', () => {
    expect(ReplaiSchedule.isDue(daily, at(2026, 9, 23, 9), '2026-09-22')).toBe(
      true
    );
  });

  it('treats midnight as a real scheduled hour', () => {
    expect(
      ReplaiSchedule.isDue({ frequency: 'daily', hour: 0 }, TUE(0), '')
    ).toBe(true);
  });
});

describe('isDue \u2014 minutes on stored rules', () => {
  /*
    The wizard only offers whole hours, because Google refuses any add-on
    time trigger more frequent than hourly. But rules saved while an
    every-minute sweep was being attempted DO carry a minute, so the
    comparison has to keep honouring it — such a rule fires on the first
    hourly sweep at or after its time, not an hour early.
  */
  const at0930 = { frequency: 'daily', hour: 9, minute: 30 };

  it('does not fire before the stored minute', () => {
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 9, 0), '')).toBe(false);
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 9, 29), '')).toBe(
      false
    );
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 9, 30), '')).toBe(true);
  });

  it('fires on the first sweep at or after it', () => {
    // Google picks the minute within each hour, so the sweep that catches
    // a 09:30 rule could land anywhere from 09:30 to the next hour.
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 9, 41), '')).toBe(true);
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 23, 59), '')).toBe(
      true
    );
  });

  it('compares across the hour boundary correctly', () => {
    // 10:05 is later than 09:30 despite 5 < 30.
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 10, 5), '')).toBe(true);
    // 08:59 is earlier than 09:30 despite 59 > 30.
    expect(ReplaiSchedule.isDue(at0930, at(2026, 9, 22, 8, 59), '')).toBe(
      false
    );
  });

  it('treats a clock with no minute as :00', () => {
    // nowParts always supplies one, but a stored rule from before minutes
    // existed does not, and that must mean "on the hour".
    expect(
      ReplaiSchedule.isDue(
        { frequency: 'daily', hour: 9 },
        { y: 2026, m: 9, d: 22, hour: 9 },
        ''
      )
    ).toBe(true);
  });

  it('exposes the time as HH:MM for the picker', () => {
    expect(ReplaiSchedule.clockOf({ hour: 9, minute: 5 })).toBe('09:05');
    expect(ReplaiSchedule.clockOf({ hour: 18, minute: 45 })).toBe('18:45');
    expect(ReplaiSchedule.clockOf({ hour: 0, minute: 0 })).toBe('00:00');
  });
});

describe('isDue \u2014 weekly', () => {
  const tuesdays = { frequency: 'weekly', hour: 9, dayOfWeek: 2 };

  it('fires on its weekday', () => {
    expect(ReplaiSchedule.isDue(tuesdays, TUE(9), '')).toBe(true);
  });

  it('stays silent on every other weekday', () => {
    // 23 Sep 2026 is the Wednesday after.
    expect(ReplaiSchedule.isDue(tuesdays, at(2026, 9, 23, 9), '')).toBe(false);
  });

  it('handles Sunday as 7, not 0', () => {
    const sundays = { frequency: 'weekly', hour: 9, dayOfWeek: 7 };
    // 27 Sep 2026 is a Sunday.
    expect(ReplaiSchedule.isDue(sundays, at(2026, 9, 27, 9), '')).toBe(true);
    expect(ReplaiSchedule.isDue(sundays, at(2026, 9, 28, 9), '')).toBe(false);
  });
});

describe('isDue \u2014 monthly', () => {
  it('fires on its date', () => {
    const plan = { frequency: 'monthly', hour: 9, dayOfMonth: 22 };
    expect(ReplaiSchedule.isDue(plan, TUE(9), '')).toBe(true);
    expect(ReplaiSchedule.isDue(plan, at(2026, 9, 21, 9), '')).toBe(false);
  });

  it('fires on the last day of a short month instead of skipping it', () => {
    // THE BUG this guards: `now.d === 31` never matches in April, June,
    // September or November, and never in February Ã¢â‚¬â€ so a "31st of the
    // month" rule would silently miss seven months a year.
    const plan = { frequency: 'monthly', hour: 9, dayOfMonth: 31 };
    expect(ReplaiSchedule.isDue(plan, at(2026, 4, 30, 9), '')).toBe(true);
    expect(ReplaiSchedule.isDue(plan, at(2026, 4, 29, 9), '')).toBe(false);
    expect(ReplaiSchedule.isDue(plan, at(2026, 2, 28, 9), '')).toBe(true);
  });

  it('handles February in a leap year', () => {
    const plan = { frequency: 'monthly', hour: 9, dayOfMonth: 30 };
    // 2028 is a leap year, so the 29th is the last day.
    expect(ReplaiSchedule.isDue(plan, at(2028, 2, 29, 9), '')).toBe(true);
    expect(ReplaiSchedule.isDue(plan, at(2028, 2, 28, 9), '')).toBe(false);
  });

  it('does not clamp in a month long enough to hold the date', () => {
    const plan = { frequency: 'monthly', hour: 9, dayOfMonth: 31 };
    expect(ReplaiSchedule.isDue(plan, at(2026, 5, 31, 9), '')).toBe(true);
    expect(ReplaiSchedule.isDue(plan, at(2026, 5, 30, 9), '')).toBe(false);
  });
});

describe('isDue \u2014 refusing to guess', () => {
  it('never fires without a usable clock', () => {
    expect(
      ReplaiSchedule.isDue({ frequency: 'daily', hour: 9 }, null, '')
    ).toBe(false);
    expect(
      ReplaiSchedule.isDue(
        { frequency: 'daily', hour: 9 },
        { y: 2026, m: 9, d: 22 },
        ''
      )
    ).toBe(false);
  });

  it('still fires a rule whose schedule is unreadable', () => {
    // Falling back beats going permanently silent: the operator asked for
    // a reminder, and a corrupt field is not a reason to stop sending.
    expect(ReplaiSchedule.isDue({ frequency: 'nonsense' }, TUE(9), '')).toBe(
      true
    );
  });
});

describe('daysInMonth', () => {
  it('knows the calendar', () => {
    expect(ReplaiSchedule.daysInMonth(2026, 1)).toBe(31);
    expect(ReplaiSchedule.daysInMonth(2026, 2)).toBe(28);
    expect(ReplaiSchedule.daysInMonth(2028, 2)).toBe(29);
    expect(ReplaiSchedule.daysInMonth(2026, 4)).toBe(30);
    expect(ReplaiSchedule.daysInMonth(2026, 12)).toBe(31);
  });
});

describe('dowOf', () => {
  it('returns ISO weekdays, Monday first', () => {
    expect(ReplaiSchedule.dowOf({ y: 2026, m: 9, d: 21 })).toBe(1); // Monday
    expect(ReplaiSchedule.dowOf({ y: 2026, m: 9, d: 22 })).toBe(2);
    expect(ReplaiSchedule.dowOf({ y: 2026, m: 9, d: 27 })).toBe(7); // Sunday
  });
});

describe('describe', () => {
  it('reads as a sentence on the rule card', () => {
    expect(ReplaiSchedule.describe({ frequency: 'daily', hour: 9 })).toBe(
      'Every day at around 09:00'
    );
    expect(
      ReplaiSchedule.describe({ frequency: 'weekly', hour: 18, dayOfWeek: 5 })
    ).toBe('Every Friday at around 18:00');
    expect(
      ReplaiSchedule.describe({ frequency: 'monthly', hour: 7, dayOfMonth: 15 })
    ).toBe('Day 15 of each month at around 07:00');
  });

  it('shows the minute, so 09:30 does not read as 09:00', () => {
    expect(
      ReplaiSchedule.describe({ frequency: 'daily', hour: 9, minute: 30 })
    ).toBe('Every day at around 09:30');
  });

  it('warns on the card when a monthly date will be clamped', () => {
    expect(
      ReplaiSchedule.describe({ frequency: 'monthly', hour: 9, dayOfMonth: 31 })
    ).toMatch(/last day/i);
  });
});

describe('isoOf', () => {
  it('zero-pads, because it is compared as a string', () => {
    expect(ReplaiSchedule.isoOf({ y: 2026, m: 1, d: 5 })).toBe('2026-01-05');
  });

  it('is empty for an unusable date', () => {
    expect(ReplaiSchedule.isoOf(null)).toBe('');
  });
});
