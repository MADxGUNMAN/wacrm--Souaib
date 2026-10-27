import { describe, expect, it } from 'vitest';

import {
  canonicalPaymentsQuery,
  DEFAULT_VIEW,
  isBillingSubscriptionId,
  LEGACY_TAB_IDS,
  LEGACY_TAB_MAP,
  locationLabel,
  manualSectionLabel,
  PAYMENTS_SECTIONS,
  paymentsHref,
  paymentsSearchParams,
  resolvePaymentsLocation,
  viewsFor,
} from './payments-nav';

/**
 * /super-admin/payments went from nine tabs to five sections with
 * sub-views. Every old `?tab=` id and `?sub=` link must still open the
 * same place, and the page rewrites them once to the canonical form.
 */

const SUB = '11111111-2222-4333-8444-555555555555';

function at(query: string) {
  return resolvePaymentsLocation(new URLSearchParams(query));
}

describe('resolvePaymentsLocation', () => {
  it('opens Overview with no params', () => {
    expect(at('')).toEqual({ section: 'overview', view: null, sub: null });
  });

  it.each(LEGACY_TAB_IDS)('maps the old %s tab per LEGACY_TAB_MAP', (id) => {
    const loc = at(`tab=${id}`);
    expect({ section: loc.section, view: loc.view }).toEqual(
      LEGACY_TAB_MAP[id]
    );
    expect(loc.sub).toBeNull();
  });

  it.each([
    ['overview', 'overview', null],
    ['subscriptions', 'subscriptions', 'autopay'],
    ['transactions', 'payments', 'transactions'],
    ['invoices', 'payments', 'invoices'],
    ['refunds', 'payments', 'refunds'],
    ['webhooks', 'activity', 'webhooks'],
    ['subscribers', 'subscriptions', 'workspaces'],
    ['activity', 'activity', 'log'],
    ['manual', 'manual', null],
  ])('old ?tab=%s lands on %s / %s', (tab, section, view) => {
    expect(at(`tab=${tab}`)).toEqual({ section, view, sub: null });
  });

  it.each([
    ['tab=subscriptions&view=workspaces', 'subscriptions', 'workspaces'],
    ['tab=payments&view=ledger', 'payments', 'ledger'],
    ['tab=payments&view=transactions', 'payments', 'transactions'],
    ['tab=payments&view=invoices', 'payments', 'invoices'],
    ['tab=payments&view=refunds', 'payments', 'refunds'],
    ['tab=activity&view=webhooks', 'activity', 'webhooks'],
    ['tab=activity&view=reconciliation', 'activity', 'reconciliation'],
  ])('honours a valid view: %s', (query, section, view) => {
    expect(at(query)).toEqual({ section, view, sub: null });
  });

  it('falls back to the default view for an invalid view', () => {
    expect(at('tab=payments&view=nope').view).toBe('ledger');
    expect(at('tab=payments').view).toBe('ledger');
    expect(at('tab=activity&view=').view).toBe('log');
  });

  it('falls back to the default view for a view of another section', () => {
    expect(at('tab=payments&view=webhooks')).toEqual({
      section: 'payments',
      view: 'ledger',
      sub: null,
    });
    expect(at('tab=subscriptions&view=log').view).toBe('autopay');
  });

  it('ignores view next to an old id that names one exact view', () => {
    expect(at('tab=transactions&view=invoices').view).toBe('transactions');
    expect(at('tab=webhooks&view=log').view).toBe('webhooks');
    expect(at('tab=subscribers&view=autopay').view).toBe('workspaces');
  });

  it('drops view for Overview and Manual UPI', () => {
    expect(at('tab=overview&view=log').view).toBeNull();
    expect(at('tab=manual&view=transactions').view).toBeNull();
  });

  it('opens Overview for an unknown tab', () => {
    expect(at('tab=bogus')).toEqual({
      section: 'overview',
      view: null,
      sub: null,
    });
  });

  it('opens AutoPay mandates with the drawer for a sub without a tab', () => {
    expect(at(`sub=${SUB}`)).toEqual({
      section: 'subscriptions',
      view: 'autopay',
      sub: SUB,
    });
    expect(at(`tab=bogus&sub=${SUB}`).section).toBe('subscriptions');
  });

  it.each([
    [`tab=subscriptions&sub=${SUB}`, 'subscriptions', 'autopay'],
    [`tab=subscribers&sub=${SUB}`, 'subscriptions', 'workspaces'],
    [`tab=payments&view=invoices&sub=${SUB}`, 'payments', 'invoices'],
    [`tab=transactions&sub=${SUB}`, 'payments', 'transactions'],
  ])('keeps a valid sub on %s', (query, section, view) => {
    expect(at(query)).toEqual({ section, view, sub: SUB });
  });

  it('drops an invalid sub and accepts an uppercase uuid', () => {
    expect(at('tab=subscriptions&sub=not-a-uuid').sub).toBeNull();
    expect(at('sub=123').section).toBe('overview');
    expect(at(`tab=subscriptions&sub=${SUB.toUpperCase()}`).sub).toBe(
      SUB.toUpperCase()
    );
  });
});

describe('isBillingSubscriptionId', () => {
  it('accepts uuids only', () => {
    expect(isBillingSubscriptionId(SUB)).toBe(true);
    expect(isBillingSubscriptionId(SUB.toUpperCase())).toBe(true);
    expect(isBillingSubscriptionId('sub_TqTtwUDRjijZys')).toBe(false);
    expect(isBillingSubscriptionId(`${SUB}x`)).toBe(false);
    expect(isBillingSubscriptionId(null)).toBe(false);
    expect(isBillingSubscriptionId(undefined)).toBe(false);
  });
});

describe('paymentsSearchParams', () => {
  it('keeps unrelated params and writes tab, view and sub last', () => {
    const params = paymentsSearchParams(
      { section: 'payments', view: 'invoices', sub: SUB },
      'sub=old&foo=1&tab=overview&bar=2&view=log'
    );
    expect(params.toString()).toBe(
      `foo=1&bar=2&tab=payments&view=invoices&sub=${SUB}`
    );
  });

  it('accepts a URLSearchParams base', () => {
    const base = new URLSearchParams('foo=1');
    expect(paymentsSearchParams({ section: 'overview' }, base).toString()).toBe(
      'foo=1&tab=overview'
    );
    expect(base.toString()).toBe('foo=1');
  });

  it('drops view for sections without views', () => {
    expect(
      paymentsSearchParams({ section: 'overview', view: 'log' }).toString()
    ).toBe('tab=overview');
    expect(
      paymentsSearchParams({ section: 'manual', view: 'invoices' }).toString()
    ).toBe('tab=manual');
  });

  it('writes the default view when omitted or invalid', () => {
    expect(paymentsSearchParams({ section: 'activity' }).toString()).toBe(
      'tab=activity&view=log'
    );
    expect(
      paymentsSearchParams({
        section: 'subscriptions',
        view: 'transactions',
      }).toString()
    ).toBe('tab=subscriptions&view=autopay');
  });

  it('drops sub when null or invalid', () => {
    expect(
      paymentsSearchParams(
        { section: 'subscriptions', view: 'autopay', sub: null },
        `sub=${SUB}`
      ).toString()
    ).toBe('tab=subscriptions&view=autopay');
    expect(
      paymentsSearchParams({ section: 'payments', sub: 'nope' }).toString()
    ).toBe('tab=payments&view=ledger');
  });
});

describe('paymentsHref', () => {
  it('builds a query-only link', () => {
    expect(
      paymentsHref({ section: 'subscriptions', view: 'autopay', sub: SUB })
    ).toBe(`?tab=subscriptions&view=autopay&sub=${SUB}`);
    expect(paymentsHref({ section: 'manual' })).toBe('?tab=manual');
  });
});

describe('canonicalPaymentsQuery', () => {
  const canon = (q: string) => canonicalPaymentsQuery(new URLSearchParams(q));

  it('rewrites old ids', () => {
    expect(canon('tab=transactions')).toBe('tab=payments&view=transactions');
    expect(canon('tab=webhooks')).toBe('tab=activity&view=webhooks');
    expect(canon('tab=subscribers')).toBe('tab=subscriptions&view=workspaces');
    expect(canon(`tab=subscriptions&sub=${SUB}`)).toBe(
      `tab=subscriptions&view=autopay&sub=${SUB}`
    );
  });

  it('returns null for a canonical query', () => {
    expect(canon('tab=overview')).toBeNull();
    expect(canon('tab=manual')).toBeNull();
    expect(canon('tab=payments&view=invoices')).toBeNull();
    expect(canon('tab=payments&view=ledger')).toBeNull();
    expect(canon('tab=payments&view=transactions')).toBeNull();
    expect(canon(`tab=subscriptions&view=autopay&sub=${SUB}`)).toBeNull();
  });

  it('returns null for a bare URL', () => {
    expect(canon('')).toBeNull();
    expect(canon('foo=1')).toBeNull();
  });

  it('adds a missing view and removes an invalid sub', () => {
    expect(canon('tab=payments')).toBe('tab=payments&view=ledger');
    expect(canon('tab=payments&view=invoices&sub=bad')).toBe(
      'tab=payments&view=invoices'
    );
    expect(canon(`sub=${SUB}`)).toBe(
      `tab=subscriptions&view=autopay&sub=${SUB}`
    );
  });
});

describe('labels', () => {
  it('locationLabel names the section and view', () => {
    expect(locationLabel({ section: 'overview' })).toBe('Overview');
    expect(locationLabel({ section: 'manual', view: null })).toBe('Manual UPI');
    expect(locationLabel({ section: 'subscriptions', view: 'autopay' })).toBe(
      'Subscriptions › AutoPay mandates'
    );
    expect(locationLabel({ section: 'payments', view: 'refunds' })).toBe(
      'Payments › Refunds & disputes'
    );
    expect(locationLabel({ section: 'activity', view: 'webhooks' })).toBe(
      'Activity & health › Webhooks'
    );
  });

  it('manualSectionLabel marks history once intake is not open', () => {
    expect(manualSectionLabel(null)).toBe('Manual UPI');
    expect(manualSectionLabel('open')).toBe('Manual UPI');
    expect(manualSectionLabel('partial')).toBe('Manual UPI (history)');
    expect(manualSectionLabel('retired')).toBe('Manual UPI (history)');
  });
});

describe('section definitions', () => {
  it('has five sections with unique ids, Manual UPI second', () => {
    const ids = PAYMENTS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      'overview',
      'manual',
      'subscriptions',
      'payments',
      'activity',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every default view belongs to its section', () => {
    for (const s of PAYMENTS_SECTIONS) {
      const def = DEFAULT_VIEW[s.id];
      if (s.views.length === 0) expect(def).toBeNull();
      else expect(viewsFor(s.id).map((v) => v.id)).toContain(def);
    }
  });

  it('every view id is unique across sections', () => {
    const views = PAYMENTS_SECTIONS.flatMap((s) => s.views.map((v) => v.id));
    expect(new Set(views).size).toBe(views.length);
  });

  it('every old tab id is covered', () => {
    expect(LEGACY_TAB_IDS).toHaveLength(9);
    expect(Object.keys(LEGACY_TAB_MAP).sort()).toEqual(
      [...LEGACY_TAB_IDS].sort()
    );
  });
});
