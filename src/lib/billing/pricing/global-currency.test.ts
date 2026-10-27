import { describe, expect, it } from 'vitest';

import {
  GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE,
  allowedGlobalCurrencies,
  checkGlobalCurrencyChange,
  globalCurrencyRefusal,
  globalPriceRowLabel,
  parseMoneyInput,
  validateGlobalPriceInputs,
  type GlobalCurrencyContext,
  type GlobalPriceRow,
} from './global-currency';

const RETIRED_USD: GlobalCurrencyContext = {
  ctx: { razorpayConfigured: true, chargeCurrencies: new Set(['INR', 'USD']) },
  settingsProvider: 'razorpay',
  manualIntake: 'retired',
};

function row(over: Partial<GlobalPriceRow> = {}): GlobalPriceRow {
  return {
    planId: 'plan-1',
    planName: 'Replai',
    planVisible: true,
    cycleId: 'g-30',
    cycleLabel: 'Monthly',
    cycleVisible: true,
    durationDays: 30,
    months: 1,
    amount: 990,
    perDayAmount: null,
    compareAtAmount: null,
    priceVisible: true,
    ...over,
  };
}

const ROWS = [
  row(),
  row({ cycleId: 'g-360', cycleLabel: 'Yearly', durationDays: 360 }),
];

describe('checkGlobalCurrencyChange', () => {
  it.each(['US', 'ZZZ', '', 'usd1'])('refuses the code %j', (next) => {
    expect(
      checkGlobalCurrencyChange({ current: 'INR', next, ...RETIRED_USD })
    ).toMatchObject({ code: 'invalid_currency', status: 400 });
  });

  it('accepts a lower-case code once upper-cased', () => {
    expect(
      checkGlobalCurrencyChange({ current: 'INR', next: 'usd', ...RETIRED_USD })
    ).toBeNull();
  });

  it('refuses the current currency as unchanged', () => {
    expect(
      checkGlobalCurrencyChange({ current: 'INR', next: 'INR', ...RETIRED_USD })
    ).toMatchObject({
      code: 'unchanged',
      message: 'The Global currency is already INR.',
    });
  });
});

describe('globalCurrencyRefusal', () => {
  it('always allows INR, even with no Razorpay and partial intake', () => {
    expect(
      globalCurrencyRefusal('INR', {
        ctx: { razorpayConfigured: false, chargeCurrencies: new Set(['INR']) },
        settingsProvider: 'manual_upi',
        manualIntake: 'partial',
      })
    ).toBeNull();
  });

  it('refuses USD when the DB flag is manual UPI', () => {
    expect(
      globalCurrencyRefusal('USD', {
        ...RETIRED_USD,
        settingsProvider: 'manual_upi',
      })
    ).toMatchObject({ code: 'manual_upi_inr_only', status: 409 });
  });

  it('refuses USD while every workspace is on manual UPI', () => {
    const r = globalCurrencyRefusal('USD', {
      ...RETIRED_USD,
      manualIntake: 'open',
    });
    expect(r?.code).toBe('manual_upi_inr_only');
    expect(r?.message).toContain('pay by manual UPI, which accepts INR only');
  });

  it('refuses USD in test mode or with a pilot list (partial)', () => {
    const r = globalCurrencyRefusal('USD', {
      ...RETIRED_USD,
      manualIntake: 'partial',
    });
    expect(r?.code).toBe('manual_upi_inr_only');
    expect(r?.message).toContain('Some workspaces on this deployment');
  });

  it('refuses a currency missing from RAZORPAY_CHARGE_CURRENCIES', () => {
    const r = globalCurrencyRefusal('USD', {
      ...RETIRED_USD,
      ctx: { razorpayConfigured: true, chargeCurrencies: new Set(['INR']) },
    });
    expect(r?.code).toBe('currency_not_chargeable');
    expect(r?.message).toContain('RAZORPAY_CHARGE_CURRENCIES');
  });

  it('refuses when Razorpay is not configured', () => {
    const r = globalCurrencyRefusal('USD', {
      ...RETIRED_USD,
      ctx: { razorpayConfigured: false, chargeCurrencies: new Set(['INR']) },
    });
    expect(r?.message).toContain('Razorpay is not configured');
  });

  it('allows USD when every workspace pays by AutoPay and USD is chargeable', () => {
    expect(globalCurrencyRefusal('USD', RETIRED_USD)).toBeNull();
  });
});

describe('allowedGlobalCurrencies', () => {
  it('lists INR first, then the chargeable currencies', () => {
    expect(
      allowedGlobalCurrencies({
        ...RETIRED_USD,
        ctx: {
          razorpayConfigured: true,
          chargeCurrencies: new Set(['USD', 'INR', 'AED']),
        },
      })
    ).toEqual(['INR', 'AED', 'USD']);
  });

  it('is INR only in test mode or on manual UPI', () => {
    expect(
      allowedGlobalCurrencies({ ...RETIRED_USD, manualIntake: 'partial' })
    ).toEqual(['INR']);
    expect(
      allowedGlobalCurrencies({
        ...RETIRED_USD,
        settingsProvider: 'manual_upi',
      })
    ).toEqual(['INR']);
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['₹1,200', 1200],
    ['12.345', 12.35],
    [12, 12],
    ['', null],
    ['  ', null],
    [null, null],
    ['abc', null],
  ])('%j -> %j', (input, out) => {
    expect(parseMoneyInput(input)).toBe(out);
  });
});

describe('globalPriceRowLabel', () => {
  it('prefixes the plan name only for a plan that is not sold', () => {
    expect(globalPriceRowLabel(row(), 'plan-1')).toBe('Monthly');
    expect(
      globalPriceRowLabel(row({ planId: 'p2', planName: 'Old' }), 'plan-1')
    ).toBe('Old · Monthly');
  });
});

describe('validateGlobalPriceInputs', () => {
  const both = (a: unknown, b: unknown, perDay: unknown = null) => [
    { plan_id: 'plan-1', cycle_id: 'g-30', amount: a, per_day_amount: perDay },
    { plan_id: 'plan-1', cycle_id: 'g-360', amount: b, per_day_amount: null },
  ];

  it('accepts a full set and normalises the values', () => {
    expect(validateGlobalPriceInputs(ROWS, both('12', 120, ''), 'USD')).toEqual(
      {
        ok: true,
        prices: [
          {
            plan_id: 'plan-1',
            cycle_id: 'g-30',
            amount: 12,
            per_day_amount: null,
          },
          {
            plan_id: 'plan-1',
            cycle_id: 'g-360',
            amount: 120,
            per_day_amount: null,
          },
        ],
      }
    );
  });

  it('names a missing row', () => {
    const r = validateGlobalPriceInputs(ROWS, both(12, '').slice(0, 1), 'USD');
    expect(r).toEqual({
      ok: false,
      problems: ['Enter the new Yearly price in USD.'],
    });
  });

  it('treats a missing prices field as nothing entered', () => {
    const r = validateGlobalPriceInputs(ROWS, undefined, 'USD');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems).toHaveLength(2);
  });

  it('refuses duplicate and unknown rows', () => {
    const dup = [...both(12, 120), both(12, 120)[0]];
    const r1 = validateGlobalPriceInputs(ROWS, dup, 'USD');
    expect(r1).toMatchObject({
      ok: false,
      problems: [GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE],
    });
    const unknown = [
      ...both(12, 120),
      { plan_id: 'plan-1', cycle_id: 'us-30', amount: 5 },
    ];
    expect(validateGlobalPriceInputs(ROWS, unknown, 'USD')).toMatchObject({
      ok: false,
      problems: [GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE],
    });
    expect(validateGlobalPriceInputs(ROWS, 'x', 'USD').ok).toBe(false);
  });

  it('refuses zero and non-numbers', () => {
    const r = validateGlobalPriceInputs(ROWS, both(0, 'abc'), 'USD');
    expect(r).toEqual({
      ok: false,
      problems: [
        'The new Monthly price must be a number above zero.',
        'The new Yearly price must be a number above zero.',
      ],
    });
  });

  it('checks minor units of the new currency', () => {
    expect(validateGlobalPriceInputs(ROWS, both(12.5, 120), 'JPY')).toEqual({
      ok: false,
      problems: [
        '12.5 JPY on the Monthly cycle is not a whole number of JPY minor units.',
      ],
    });
    expect(validateGlobalPriceInputs(ROWS, both(12.5, 120), 'USD').ok).toBe(
      true
    );
  });

  it('refuses a daily rate above the total', () => {
    expect(validateGlobalPriceInputs(ROWS, both(12, 120, 13), 'USD')).toEqual({
      ok: false,
      problems: [
        'The Monthly daily rate must be above zero and no more than the total, or left blank.',
      ],
    });
    expect(
      validateGlobalPriceInputs(ROWS, both(60, 360, '2'), 'USD')
    ).toMatchObject({
      ok: true,
      prices: [
        expect.objectContaining({ per_day_amount: 2 }),
        expect.anything(),
      ],
    });
  });

  it('collects every problem', () => {
    const r = validateGlobalPriceInputs(
      ROWS,
      [{ plan_id: 'x', cycle_id: 'y', amount: 1 }],
      'USD'
    );
    expect(r).toEqual({
      ok: false,
      problems: [
        GLOBAL_PRICE_UNKNOWN_ROW_MESSAGE,
        'Enter the new Monthly price in USD.',
        'Enter the new Yearly price in USD.',
      ],
    });
  });

  it('needs nothing when there is no Global price', () => {
    expect(validateGlobalPriceInputs([], [], 'USD')).toEqual({
      ok: true,
      prices: [],
    });
  });
});
