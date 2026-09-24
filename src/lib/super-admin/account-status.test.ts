import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_ACTIVITY_LABEL,
  accountActivityTooltip,
  deriveAccountActivity,
  isWhatsAppConnected,
} from './account-status';

/**
 * This suite is the contract the accounts list, the deep-dive header AND
 * the PostgREST filter in queries.ts all owe.
 *
 * The bug it pins: filtering the list by "Inactive" and opening a row
 * showed "Active" in the header, because the header was reporting
 * `!is_banned` under the same word. Activity and access are separate
 * facts and must never be collapsed again.
 */

describe('isWhatsAppConnected', () => {
  it('accepts only the literal connected status', () => {
    expect(isWhatsAppConnected('connected')).toBe(true);
  });

  it('rejects a config row that exists but is disconnected', () => {
    // The deep-dive header used to test for the row's EXISTENCE, which
    // reported "WA Connected" for exactly this case.
    expect(isWhatsAppConnected('disconnected')).toBe(false);
  });

  it('treats a missing status as not connected', () => {
    expect(isWhatsAppConnected(null)).toBe(false);
    expect(isWhatsAppConnected(undefined)).toBe(false);
    expect(isWhatsAppConnected('')).toBe(false);
  });

  it('is exact, not fuzzy', () => {
    expect(isWhatsAppConnected('Connected')).toBe(false);
    expect(isWhatsAppConnected('reconnecting')).toBe(false);
  });
});

describe('deriveAccountActivity', () => {
  it('is active when WhatsApp is connected, even with no recent messages', () => {
    expect(
      deriveAccountActivity({ whatsappStatus: 'connected', messages30d: 0 })
    ).toBe('active');
  });

  it('is active on recent messages alone, with no WhatsApp connection', () => {
    // A real row in the live data looks exactly like this.
    expect(
      deriveAccountActivity({ whatsappStatus: null, messages30d: 2 })
    ).toBe('active');
  });

  it('is inactive for a brand-new workspace with nothing set up', () => {
    expect(
      deriveAccountActivity({ whatsappStatus: null, messages30d: 0 })
    ).toBe('inactive');
  });

  it('is inactive when a disconnected config has no recent messages', () => {
    expect(
      deriveAccountActivity({
        whatsappStatus: 'disconnected',
        messages30d: 0,
      })
    ).toBe('inactive');
  });

  it('treats a null/undefined message count as zero', () => {
    // The view can hand back null; `null > 0` is false in JS but the
    // intent should not rely on coercion luck.
    expect(
      deriveAccountActivity({ whatsappStatus: null, messages30d: null })
    ).toBe('inactive');
    expect(
      deriveAccountActivity({
        whatsappStatus: undefined,
        messages30d: undefined,
      })
    ).toBe('inactive');
  });

  it('never consults a banned flag — activity and access are separate', () => {
    // There is deliberately no `isBanned` input. If this signature ever
    // grows one, the original bug is back.
    const input = { whatsappStatus: null, messages30d: 0 } as const;
    expect(Object.keys(input)).toEqual(['whatsappStatus', 'messages30d']);
    expect(deriveAccountActivity(input)).toBe('inactive');
  });
});

describe('labels', () => {
  it('words both states once, for every surface', () => {
    expect(ACCOUNT_ACTIVITY_LABEL.active).toBe('Active');
    expect(ACCOUNT_ACTIVITY_LABEL.inactive).toBe('Inactive');
  });
});

describe('accountActivityTooltip', () => {
  it('explains an inactive account and separates usage from access', () => {
    const tip = accountActivityTooltip({
      whatsappStatus: null,
      messages30d: 0,
    });
    expect(tip).toContain('no WhatsApp connection');
    expect(tip).toContain('no messages in the last 30 days');
    // The sentence that stops someone reading this as "not banned".
    expect(tip).toContain('usage, not access');
  });

  it('names the WhatsApp connection as the reason', () => {
    const tip = accountActivityTooltip({
      whatsappStatus: 'connected',
      messages30d: 0,
    });
    expect(tip).toContain('WhatsApp is connected');
    expect(tip).not.toContain('messages in the last 30 days.');
  });

  it('names the message count as the reason, singular and plural', () => {
    expect(
      accountActivityTooltip({ whatsappStatus: null, messages30d: 1 })
    ).toContain('1 message in the last 30 days');
    expect(
      accountActivityTooltip({ whatsappStatus: null, messages30d: 7 })
    ).toContain('7 messages in the last 30 days');
  });

  it('names both reasons when both hold', () => {
    const tip = accountActivityTooltip({
      whatsappStatus: 'connected',
      messages30d: 128,
    });
    expect(tip).toContain('WhatsApp is connected');
    expect(tip).toContain('128 messages');
    expect(tip).toContain(' and ');
  });
});

describe('the live rows that exposed the bug', () => {
  // Straight from v_platform_accounts_summary at the time of the report.
  const liveRows = [
    {
      name: 'Souaib',
      whatsappStatus: null,
      messages30d: 0,
      expected: 'inactive',
    },
    {
      name: 'Sallu',
      whatsappStatus: null,
      messages30d: 0,
      expected: 'inactive',
    },
    {
      name: 'Karina Rodriguez',
      whatsappStatus: null,
      messages30d: 0,
      expected: 'inactive',
    },
    {
      name: 'Shahil Gadhawala',
      whatsappStatus: 'connected',
      messages30d: 128,
      expected: 'active',
    },
    {
      name: 'Test CRM',
      whatsappStatus: 'connected',
      messages30d: 24,
      expected: 'active',
    },
    {
      name: 'Souaib Ansari',
      whatsappStatus: null,
      messages30d: 2,
      expected: 'active',
    },
  ] as const;

  it.each(liveRows)(
    '$name resolves to $expected',
    ({ whatsappStatus, messages30d, expected }) => {
      expect(deriveAccountActivity({ whatsappStatus, messages30d })).toBe(
        expected
      );
    }
  );

  it('classifies "Souaib" as inactive — the exact row in the report', () => {
    // The user filtered by Inactive, got this row, opened it, and the
    // header claimed Active. Both screens now agree.
    expect(
      deriveAccountActivity({ whatsappStatus: null, messages30d: 0 })
    ).toBe('inactive');
  });
});
