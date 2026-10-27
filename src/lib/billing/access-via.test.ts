import { describe, expect, it } from 'vitest';

import { deriveAccessVia, type AccessViaInput } from './access-via';

const base: AccessViaInput = {
  liveStatus: 'active',
  autopay: null,
  latestGrant: null,
  hadPaidWindow: true,
};

describe('deriveAccessVia', () => {
  it('ungated', () => {
    expect(deriveAccessVia({ ...base, liveStatus: 'none' }).kind).toBe('none');
  });

  it('trial, noting an AutoPay already set up', () => {
    expect(deriveAccessVia({ ...base, liveStatus: 'trialing' })).toEqual({
      kind: 'trial',
      current: true,
      since: null,
      detail: null,
    });
    expect(
      deriveAccessVia({
        ...base,
        liveStatus: 'trialing',
        autopay: { status: 'authenticated', mode: 'test' },
      }).detail
    ).toBe('AutoPay set up');
  });

  it.each([
    ['razorpay', 'razorpay_autopay'],
    ['manual_upi', 'manual_upi'],
    ['admin', 'admin_grant'],
  ] as const)('active via a %s grant', (channel, kind) => {
    const r = deriveAccessVia({
      ...base,
      latestGrant: { channel, createdAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(r).toMatchObject({
      kind,
      current: true,
      since: '2026-10-01T00:00:00.000Z',
    });
  });

  it('active with only an active AutoPay row', () => {
    expect(
      deriveAccessVia({ ...base, autopay: { status: 'active', mode: 'test' } })
    ).toEqual({
      kind: 'razorpay_autopay',
      current: true,
      since: null,
      detail: 'Test mode',
    });
  });

  it('active with an admin grant newer than an AutoPay payment', () => {
    // The caller passes the NEWEST grant; an admin grant after AutoPay wins.
    expect(
      deriveAccessVia({
        ...base,
        autopay: { status: 'active', mode: 'live' },
        latestGrant: {
          channel: 'admin',
          createdAt: '2026-10-05T00:00:00.000Z',
        },
      }).kind
    ).toBe('admin_grant');
  });

  it('expired after a manual payment reads as last access', () => {
    expect(
      deriveAccessVia({
        ...base,
        liveStatus: 'expired',
        latestGrant: {
          channel: 'manual_upi',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      })
    ).toMatchObject({ kind: 'manual_upi', current: false });
  });

  it('expired after a trial only', () => {
    expect(
      deriveAccessVia({ ...base, liveStatus: 'expired', hadPaidWindow: false })
    ).toMatchObject({ kind: 'trial', current: false });
  });

  it('never guesses: active with nothing recorded is unknown', () => {
    expect(deriveAccessVia(base)).toEqual({
      kind: 'unknown',
      current: true,
      since: null,
      detail: null,
    });
    expect(
      deriveAccessVia({
        ...base,
        latestGrant: {
          channel: 'system',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      }).kind
    ).toBe('unknown');
  });
});
