import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_ID,
  OTHER_ACCOUNT_ID,
  makeConfig,
} from './__fixtures__/factories';
import { resolveManualIntake, resolvePaymentProvider } from './provider';

describe('resolvePaymentProvider', () => {
  it('is manual UPI wherever Razorpay is not configured (production today)', () => {
    for (const settingsProvider of ['manual_upi', 'razorpay', null]) {
      expect(
        resolvePaymentProvider({
          settingsProvider,
          config: null,
          accountId: ACCOUNT_ID,
        })
      ).toBe('manual_upi');
    }
  });

  it('in test mode, follows the allowlist and ignores the shared DB flag', () => {
    const config = makeConfig();
    // Flag says manual (as in production), allowlisted account still gets Razorpay.
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: ACCOUNT_ID,
      })
    ).toBe('razorpay');
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: ACCOUNT_ID.toUpperCase(),
      })
    ).toBe('razorpay');
    // Flag says Razorpay, a non-allowlisted account still gets manual UPI.
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });

  it('in live mode with a pilot list, only pilot accounts get Razorpay', () => {
    const config = makeConfig({
      mode: 'live',
      env: 'prod',
      testAllowedAccountIds: new Set(),
      livePilotAccountIds: new Set([ACCOUNT_ID]),
    });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: ACCOUNT_ID,
      })
    ).toBe('razorpay');
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });

  it('in live mode without a pilot list, the DB flag decides', () => {
    const config = makeConfig({
      mode: 'live',
      env: 'prod',
      testAllowedAccountIds: new Set(),
    });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('razorpay');
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
    expect(
      resolvePaymentProvider({
        settingsProvider: undefined,
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });
});

describe('resolvePaymentProvider with the Phase 6 dev override', () => {
  const LIVE_DEV = {
    mode: 'live' as const,
    env: 'dev' as const,
    testAllowedAccountIds: new Set<string>(),
  };

  it('override manual_upi beats the test allowlist', () => {
    const config = makeConfig({ providerOverride: 'manual_upi' });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config,
        accountId: ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });

  it('override manual_upi beats the live pilot list and the DB flag', () => {
    const pilot = makeConfig({
      ...LIVE_DEV,
      livePilotAccountIds: new Set([ACCOUNT_ID]),
      providerOverride: 'manual_upi',
    });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config: pilot,
        accountId: ACCOUNT_ID,
      })
    ).toBe('manual_upi');
    const live = makeConfig({ ...LIVE_DEV, providerOverride: 'manual_upi' });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config: live,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });

  it('override razorpay in test mode does not admit a non-allowlisted account', () => {
    const config = makeConfig({ providerOverride: 'razorpay' });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('manual_upi');
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: ACCOUNT_ID,
      })
    ).toBe('razorpay');
  });

  it('in live mode on dev, the override replaces the DB flag', () => {
    const config = makeConfig({ ...LIVE_DEV, providerOverride: 'razorpay' });
    expect(
      resolvePaymentProvider({
        settingsProvider: 'manual_upi',
        config,
        accountId: OTHER_ACCOUNT_ID,
      })
    ).toBe('razorpay');
  });

  it('with no config, nothing else matters', () => {
    expect(
      resolvePaymentProvider({
        settingsProvider: 'razorpay',
        config: null,
        accountId: ACCOUNT_ID,
      })
    ).toBe('manual_upi');
  });
});

describe('resolveManualIntake', () => {
  it('is open where Razorpay is not configured', () => {
    expect(
      resolveManualIntake({ settingsProvider: 'razorpay', config: null })
    ).toBe('open');
  });

  it('is open when the dev override restores manual UPI', () => {
    expect(
      resolveManualIntake({
        settingsProvider: 'razorpay',
        config: makeConfig({ providerOverride: 'manual_upi' }),
      })
    ).toBe('open');
  });

  it('is partial in test mode and with a live pilot', () => {
    expect(
      resolveManualIntake({
        settingsProvider: 'manual_upi',
        config: makeConfig(),
      })
    ).toBe('partial');
    expect(
      resolveManualIntake({
        settingsProvider: 'razorpay',
        config: makeConfig({
          mode: 'live',
          env: 'prod',
          testAllowedAccountIds: new Set(),
          livePilotAccountIds: new Set([ACCOUNT_ID]),
        }),
      })
    ).toBe('partial');
  });

  it('in live mode follows the override, else the DB flag', () => {
    const live = makeConfig({
      mode: 'live',
      env: 'prod',
      testAllowedAccountIds: new Set(),
    });
    expect(
      resolveManualIntake({ settingsProvider: 'razorpay', config: live })
    ).toBe('retired');
    expect(
      resolveManualIntake({ settingsProvider: 'manual_upi', config: live })
    ).toBe('open');
    expect(
      resolveManualIntake({
        settingsProvider: 'manual_upi',
        config: makeConfig({
          mode: 'live',
          env: 'dev',
          testAllowedAccountIds: new Set(),
          providerOverride: 'razorpay',
        }),
      })
    ).toBe('retired');
  });
});
