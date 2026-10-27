import { describe, expect, it } from 'vitest';

import {
  GLOBAL_REGION,
  REGION_OPTIONS,
  applyRegionSettingsPatch,
  assessRegion,
  countryFromPhone,
  isRegionCode,
  mergeRegionSettings,
  parseRegionParam,
  regionCycleKey,
  regionLabel,
  resolvePricingRegion,
  sanitizeRegionSettings,
  validateRegionEnable,
  type ChargeContext,
  type PricingRegionRow,
  type RegionCatalogue,
  type ResolvePricingInput,
} from './regions';

const PLAN = 'plan-1';

function catalogue(extra: Partial<RegionCatalogue> = {}): RegionCatalogue {
  return {
    cycles: [
      {
        id: 'g-30',
        region: 'global',
        label: 'Monthly',
        durationDays: 30,
        months: 1,
        visible: true,
      },
      {
        id: 'us-30',
        region: 'US',
        label: 'Monthly',
        durationDays: 30,
        months: 1,
        visible: true,
      },
      {
        id: 'in-30',
        region: 'IN',
        label: 'Monthly',
        durationDays: 30,
        months: 1,
        visible: true,
      },
    ],
    prices: [
      { planId: PLAN, cycleId: 'g-30', amount: 990, isVisible: true },
      { planId: PLAN, cycleId: 'us-30', amount: 60, isVisible: true },
      { planId: PLAN, cycleId: 'in-30', amount: 800, isVisible: true },
    ],
    visiblePlanIds: new Set([PLAN]),
    ...extra,
  };
}

const US_ENABLED: PricingRegionRow = {
  code: 'US',
  currency: 'USD',
  is_enabled: true,
  settings: {},
};
const IN_ENABLED: PricingRegionRow = {
  code: 'IN',
  currency: 'INR',
  is_enabled: true,
  settings: {},
};

const CHARGE_USD: ChargeContext = {
  razorpayConfigured: true,
  chargeCurrencies: new Set(['INR', 'USD']),
};
const CHARGE_INR: ChargeContext = {
  razorpayConfigured: true,
  chargeCurrencies: new Set(['INR']),
};

function input(over: Partial<ResolvePricingInput> = {}): ResolvePricingInput {
  return {
    ownerPhone: '+14155550100',
    regions: new Map([['US', US_ENABLED]]),
    catalogue: catalogue(),
    provider: 'razorpay',
    ctx: CHARGE_USD,
    globalCurrency: 'INR',
    mandate: null,
    ...over,
  };
}

describe('countryFromPhone', () => {
  it.each([
    ['+919876543210', 'IN'],
    ['+14155550100', 'US'],
    ['+16135550100', 'US'], // Canada shares +1 and has no 4-digit entry
    ['+18765550100', 'JM'], // longest prefix +1876 wins
    ['+971501234567', 'AE'],
    ['+77011234567', 'RU'], // +7 is shared with Kazakhstan
    ['+91 98765 43210', 'IN'],
  ])('%s -> %s', (phone, code) => {
    expect(countryFromPhone(phone)).toBe(code);
  });

  it.each([[null], [''], ['9876543210'], ['+'], ['+0123456']])(
    'returns null for %s',
    (phone) => {
      expect(countryFromPhone(phone)).toBeNull();
    }
  );

  it('returns null for an unknown dialing code', () => {
    expect(countryFromPhone('+999123')).toBeNull();
  });
});

describe('labels, options and keys', () => {
  it('lists Global first and every country as Name (+dial)', () => {
    expect(REGION_OPTIONS[0]).toMatchObject({
      code: GLOBAL_REGION,
      label: 'Global (Universal)',
    });
    const labels = REGION_OPTIONS.map((o) => o.label);
    expect(labels).toContain('India (+91)');
    expect(labels).toContain('United States (+1)');
    expect(labels).toContain('United Arab Emirates (+971)');
    const names = REGION_OPTIONS.slice(1).map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('labels regions', () => {
    expect(regionLabel('global')).toBe('Global (Universal)');
    expect(regionLabel('US')).toBe('United States (+1)');
  });

  it('validates region codes and query params', () => {
    expect(isRegionCode('global')).toBe(true);
    expect(isRegionCode('US')).toBe(true);
    expect(isRegionCode('XX')).toBe(false);
    expect(isRegionCode('us')).toBe(false);
    expect(parseRegionParam(null)).toBe('global');
    expect(parseRegionParam('us')).toBe('US');
    expect(parseRegionParam('XX')).toBeNull();
    expect(parseRegionParam('../')).toBeNull();
  });

  it('prefixes country cycle keys once', () => {
    expect(regionCycleKey('global', 'monthly')).toBe('monthly');
    expect(regionCycleKey('US', 'monthly')).toBe('us-monthly');
    expect(regionCycleKey('US', 'us-monthly')).toBe('us-monthly');
  });
});

describe('resolvePricingRegion', () => {
  it('uses an enabled, complete, chargeable country plan', () => {
    expect(resolvePricingRegion(input())).toEqual({
      region: 'US',
      currency: 'USD',
      countryCode: 'US',
      source: 'phone',
      reason: 'phone_match',
    });
  });

  it.each([[null], [''], ['9876543210']])(
    'falls back to Global with no_phone for %s',
    (phone) => {
      expect(resolvePricingRegion(input({ ownerPhone: phone }))).toMatchObject({
        region: 'global',
        currency: 'INR',
        reason: 'no_phone',
      });
    }
  );

  it('falls back for an unknown dialing code', () => {
    expect(
      resolvePricingRegion(input({ ownerPhone: '+999123' }))
    ).toMatchObject({ region: 'global', reason: 'unknown_dial_code' });
  });

  it('falls back when the country has no plan', () => {
    expect(
      resolvePricingRegion(input({ ownerPhone: '+971501234567' }))
    ).toMatchObject({
      region: 'global',
      countryCode: 'AE',
      reason: 'region_not_configured',
    });
  });

  it('falls back when the country is disabled', () => {
    const regions = new Map([['US', { ...US_ENABLED, is_enabled: false }]]);
    expect(resolvePricingRegion(input({ regions }))).toMatchObject({
      region: 'global',
      currency: 'INR',
      reason: 'region_disabled',
    });
  });

  it('falls back when the country has no priced visible cycle', () => {
    const cat = catalogue();
    cat.prices = cat.prices.filter((p) => p.cycleId !== 'us-30');
    expect(resolvePricingRegion(input({ catalogue: cat }))).toMatchObject({
      region: 'global',
      reason: 'region_incomplete',
    });
  });

  it('falls back when USD cannot be charged here', () => {
    expect(resolvePricingRegion(input({ ctx: CHARGE_INR }))).toMatchObject({
      region: 'global',
      reason: 'currency_not_chargeable',
    });
  });

  it('never gives a non-INR region to a manual UPI account', () => {
    expect(
      resolvePricingRegion(input({ provider: 'manual_upi' }))
    ).toMatchObject({ region: 'global', reason: 'manual_upi_inr_only' });
  });

  it('gives an INR country to a manual UPI account', () => {
    expect(
      resolvePricingRegion(
        input({
          ownerPhone: '+919876543210',
          regions: new Map([['IN', IN_ENABLED]]),
          provider: 'manual_upi',
          ctx: {
            razorpayConfigured: false,
            chargeCurrencies: new Set(['INR']),
          },
        })
      )
    ).toMatchObject({ region: 'IN', currency: 'INR', reason: 'phone_match' });
  });

  it('keeps a live Global mandate on Global even with a US phone', () => {
    expect(
      resolvePricingRegion(
        input({ mandate: { cycleRegion: 'global', currency: 'INR' } })
      )
    ).toMatchObject({
      region: 'global',
      currency: 'INR',
      source: 'subscription',
      reason: 'live_mandate',
    });
  });

  it('a live Global mandate reports the mandate currency after a Global currency change', () => {
    expect(
      resolvePricingRegion(
        input({
          globalCurrency: 'USD',
          mandate: { cycleRegion: 'global', currency: 'INR' },
        })
      )
    ).toEqual({
      region: 'global',
      currency: 'USD',
      countryCode: 'US',
      source: 'subscription',
      reason: 'live_mandate',
      mandateCurrency: 'INR',
    });
  });

  it('keeps a live US mandate on US after the phone changes to +91', () => {
    expect(
      resolvePricingRegion(
        input({
          ownerPhone: '+919876543210',
          mandate: { cycleRegion: 'US', currency: 'USD' },
        })
      )
    ).toMatchObject({
      region: 'US',
      currency: 'USD',
      source: 'subscription',
    });
  });

  it('treats a mandate whose cycle is gone and charged INR as Global', () => {
    expect(
      resolvePricingRegion(
        input({ mandate: { cycleRegion: null, currency: 'INR' } })
      )
    ).toMatchObject({ region: 'global', source: 'subscription' });
  });

  it('falls through to the phone rule when the mandate region is disabled', () => {
    const regions = new Map([
      ['US', { ...US_ENABLED, is_enabled: false }],
      ['IN', IN_ENABLED],
    ]);
    expect(
      resolvePricingRegion(
        input({
          ownerPhone: '+919876543210',
          regions,
          mandate: { cycleRegion: 'US', currency: 'USD' },
        })
      )
    ).toMatchObject({ region: 'IN', source: 'phone' });
  });
});

describe('validateRegionEnable', () => {
  const ok = (row: PricingRegionRow, cat = catalogue(), ctx = CHARGE_USD) =>
    validateRegionEnable({ row, catalogue: cat, ctx });

  it('accepts a complete USD plan when USD is chargeable', () => {
    expect(ok(US_ENABLED)).toEqual([]);
  });

  it('accepts INR without any Razorpay currency setting', () => {
    expect(
      ok(IN_ENABLED, catalogue(), {
        razorpayConfigured: false,
        chargeCurrencies: new Set(['INR']),
      })
    ).toEqual([]);
  });

  it('requires a currency', () => {
    expect(ok({ ...US_ENABLED, currency: null })).toEqual([
      'Choose the currency this country is charged in.',
    ]);
  });

  it('rejects an unknown currency code', () => {
    expect(ok({ ...US_ENABLED, currency: 'ZZZ' })[0]).toContain(
      'not a recognised ISO 4217'
    );
  });

  it('requires a priced visible cycle', () => {
    const cat = catalogue();
    cat.cycles = cat.cycles.map((c) =>
      c.id === 'us-30' ? { ...c, visible: false } : c
    );
    expect(ok(US_ENABLED, cat)).toEqual([
      'Add at least one visible billing cycle with a price above zero.',
    ]);
  });

  it('rejects a cycle shorter than 7 days', () => {
    const cat = catalogue();
    cat.cycles = cat.cycles.map((c) =>
      c.id === 'us-30' ? { ...c, durationDays: 5 } : c
    );
    expect(ok(US_ENABLED, cat)).toEqual([
      'The Monthly cycle must be at least 7 whole days for AutoPay.',
    ]);
  });

  it('rejects an amount that is not whole minor units', () => {
    const cat = catalogue();
    cat.prices = cat.prices.map((p) =>
      p.cycleId === 'us-30' ? { ...p, amount: 60.005 } : p
    );
    expect(ok(US_ENABLED, cat)[0]).toContain('not a whole number');
  });

  it('refuses a currency not listed for charging', () => {
    expect(ok(US_ENABLED, catalogue(), CHARGE_INR)[0]).toContain(
      'RAZORPAY_CHARGE_CURRENCIES'
    );
  });

  it('refuses non-INR when Razorpay is not configured', () => {
    expect(
      ok(US_ENABLED, catalogue(), {
        razorpayConfigured: false,
        chargeCurrencies: new Set(['INR', 'USD']),
      })[0]
    ).toContain('Razorpay is not configured');
  });

  it('assessRegion reports completeness and chargeability', () => {
    expect(assessRegion(US_ENABLED, catalogue(), CHARGE_INR)).toMatchObject({
      complete: true,
      chargeable: false,
    });
    expect(assessRegion(null, catalogue(), CHARGE_USD).complete).toBe(false);
  });
});

describe('region settings', () => {
  it('refuses platform-wide keys', () => {
    expect(() => sanitizeRegionSettings({ trial_days: 7 }, 'USD')).toThrow(
      /Global/
    );
    expect(() => sanitizeRegionSettings({ currency: 'USD' }, 'USD')).toThrow();
  });

  it('keeps copy, clears blanks and drops UPI for non-INR', () => {
    expect(
      sanitizeRegionSettings(
        {
          page_heading: '  Pricing  ',
          page_subheading: '',
          upi_id: 'x@bank',
          show_custom_plan: true,
          id: 'nope',
        },
        'USD'
      )
    ).toEqual({
      page_heading: 'Pricing',
      page_subheading: null,
      show_custom_plan: true,
    });
    expect(sanitizeRegionSettings({ upi_id: 'x@bank' }, 'INR')).toEqual({
      upi_id: 'x@bank',
    });
  });

  it('applies a patch and merges over Global', () => {
    const stored = applyRegionSettingsPatch(
      { page_heading: 'Old', cycle_hint: 'Hint' },
      { page_heading: 'New', cycle_hint: null }
    );
    expect(stored).toEqual({ page_heading: 'New' });
    const merged = mergeRegionSettings(
      {
        currency: 'INR',
        page_heading: 'Choose',
        cycle_hint: 'G hint',
        upi_id: 'pay@bank',
        upi_payee_name: 'Payee',
      },
      { ...stored, cycle_hint: '' },
      'usd'
    );
    expect(merged).toEqual({
      currency: 'USD',
      page_heading: 'New',
      cycle_hint: 'G hint',
      upi_id: null,
      upi_payee_name: null,
    });
  });
});
