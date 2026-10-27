import { describe, expect, it } from 'vitest';

import { findDueReminders, loadAutopayAccountIds } from './reminders';
import type { AutoEmailRule } from './types';

type Admin = Parameters<typeof findDueReminders>[0];

// Plan F5: AutoPay accounts renew automatically, so the "your plan ends,
// act now" reminder is untrue for them and must not be sent.

const NOW = new Date('2026-10-21T06:00:00.000Z');
const inTwoDays = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();

type Rows = Record<string, unknown[]>;

/** Minimal chainable stand-in for the service-role client. */
function fakeAdmin(
  rows: Rows,
  calls: { table: string; filters: unknown[][] }[] = []
) {
  return {
    from(table: string) {
      const entry = { table, filters: [] as unknown[][] };
      calls.push(entry);
      const builder: Record<string, unknown> = {};
      const chain =
        (name: string) =>
        (...args: unknown[]) => {
          entry.filters.push([name, ...args]);
          return builder;
        };
      for (const m of [
        'select',
        'eq',
        'in',
        'or',
        'order',
        'limit',
        'not',
        'is',
      ])
        builder[m] = chain(m);
      builder.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok);
      return builder;
    },
  };
}

const rule = (segment: 'trial' | 'paid'): AutoEmailRule => ({
  id: segment,
  segment,
  is_enabled: true,
  offsets_days: [3],
  subject_template: 's',
  heading_template: 'h',
  body_template: 'b',
  cta_label: 'Renew',
  cta_path: '/upgrade-plan',
  footer_note: null,
});

const accounts = [
  {
    id: 'acc-autopay',
    name: 'Has AutoPay',
    is_banned: false,
    auto_email_opted_out: false,
    subscription_status: 'active',
    trial_ends_at: null,
    subscription_ends_at: inTwoDays,
    subscription_plan_name: 'Replai',
    selected_plan_id: null,
  },
  {
    id: 'acc-manual',
    name: 'Manual UPI',
    is_banned: false,
    auto_email_opted_out: false,
    subscription_status: 'active',
    trial_ends_at: null,
    subscription_ends_at: inTwoDays,
    subscription_plan_name: 'Replai',
    selected_plan_id: null,
  },
];

describe('findDueReminders and AutoPay', () => {
  const rules = { trial: rule('trial'), paid: rule('paid') };

  it('skips accounts with a working AutoPay in this deployment’s mode', async () => {
    const calls: { table: string; filters: unknown[][] }[] = [];
    const admin = fakeAdmin(
      { accounts, billing_subscriptions: [{ account_id: 'acc-autopay' }] },
      calls
    );
    const due = await findDueReminders(admin as unknown as Admin, {
      rules,
      now: NOW,
      autopayMode: 'test',
    });

    expect(due.map((d) => d.accountId)).toEqual(['acc-manual']);
    const lookup = calls.find((c) => c.table === 'billing_subscriptions');
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'mode', 'test'],
        ['in', 'status', ['authenticated', 'active', 'pending']],
        ['eq', 'cancel_at_cycle_end', false],
      ])
    );
  });

  it('where Razorpay is not configured, nothing changes (production today)', async () => {
    const calls: { table: string; filters: unknown[][] }[] = [];
    const admin = fakeAdmin(
      { accounts, billing_subscriptions: [{ account_id: 'acc-autopay' }] },
      calls
    );
    const due = await findDueReminders(admin as unknown as Admin, {
      rules,
      now: NOW,
      autopayMode: null,
    });

    expect(due.map((d) => d.accountId).sort()).toEqual([
      'acc-autopay',
      'acc-manual',
    ]);
    expect(calls.some((c) => c.table === 'billing_subscriptions')).toBe(false);
  });
});

describe('loadAutopayAccountIds', () => {
  it('asks for nothing when there are no candidates', async () => {
    const calls: { table: string; filters: unknown[][] }[] = [];
    expect(
      await loadAutopayAccountIds(
        fakeAdmin({}, calls) as unknown as Admin,
        [],
        'live'
      )
    ).toEqual(new Set());
    expect(calls).toHaveLength(0);
  });
});
