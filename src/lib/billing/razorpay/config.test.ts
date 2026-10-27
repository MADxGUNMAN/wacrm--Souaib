import { describe, expect, it, vi } from 'vitest';

import {
  RazorpayConfigError,
  chargeCurrenciesOf,
  getRazorpayConfig,
  isAccountAllowed,
  readRazorpayConfig,
} from './config';

const DEMO = 'c1db92d7-7ae4-44ac-aae7-b62e152b0341';
const OTHER = '22222222-2222-4222-8222-222222222222';

const TEST_ENV = {
  RAZORPAY_MODE: 'test',
  BILLING_ENV: 'dev',
  RAZORPAY_KEY_ID: 'rzp_test_abcdefghijklmn',
  RAZORPAY_KEY_SECRET: 'secret_secret_secret_1',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_whsec_whsec_1234',
  RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: DEMO,
};

const LIVE_ENV = {
  RAZORPAY_MODE: 'live',
  BILLING_ENV: 'prod',
  RAZORPAY_KEY_ID: 'rzp_live_abcdefghijklmn',
  RAZORPAY_KEY_SECRET: 'secret_secret_secret_1',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_whsec_whsec_1234',
};

describe('readRazorpayConfig', () => {
  it('accepts a valid test configuration and limits it to the allowlist', () => {
    const cfg = readRazorpayConfig(TEST_ENV);
    expect(cfg.mode).toBe('test');
    expect(cfg.webhookSecrets).toEqual(['whsec_whsec_whsec_1234']);
    expect(isAccountAllowed(cfg, DEMO)).toBe(true);
    expect(isAccountAllowed(cfg, DEMO.toUpperCase())).toBe(true);
    expect(isAccountAllowed(cfg, OTHER)).toBe(false);
  });

  it('accepts live mode for everyone, or only the pilot when set', () => {
    const cfg = readRazorpayConfig(LIVE_ENV);
    expect(isAccountAllowed(cfg, OTHER)).toBe(true);
    const pilot = readRazorpayConfig({
      ...LIVE_ENV,
      RAZORPAY_LIVE_PILOT_ACCOUNT_IDS: DEMO,
    });
    expect(isAccountAllowed(pilot, DEMO)).toBe(true);
    expect(isAccountAllowed(pilot, OTHER)).toBe(false);
  });

  it('keeps the previous webhook secret during rotation', () => {
    const cfg = readRazorpayConfig({
      ...TEST_ENV,
      RAZORPAY_WEBHOOK_SECRET_PREVIOUS: 'whsec_old_old_old_1234',
    });
    expect(cfg.webhookSecrets).toEqual([
      'whsec_whsec_whsec_1234',
      'whsec_old_old_old_1234',
    ]);
  });

  it.each([
    ['missing mode', { ...TEST_ENV, RAZORPAY_MODE: '' }],
    ['unknown mode', { ...TEST_ENV, RAZORPAY_MODE: 'sandbox' }],
    [
      'test key in live mode',
      { ...LIVE_ENV, RAZORPAY_KEY_ID: 'rzp_test_abcdefghijklmn' },
    ],
    [
      'live key in test mode',
      { ...TEST_ENV, RAZORPAY_KEY_ID: 'rzp_live_abcdefghijklmn' },
    ],
    ['test mode on production', { ...TEST_ENV, BILLING_ENV: 'prod' }],
    ['no billing env', { ...TEST_ENV, BILLING_ENV: '' }],
    ['short key secret', { ...TEST_ENV, RAZORPAY_KEY_SECRET: 'short' }],
    ['no webhook secret', { ...TEST_ENV, RAZORPAY_WEBHOOK_SECRET: '' }],
    [
      'test mode without allowlist',
      { ...TEST_ENV, RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: '' },
    ],
    [
      'malformed allowlist',
      { ...TEST_ENV, RAZORPAY_TEST_ALLOWED_ACCOUNT_IDS: 'demo-account' },
    ],
  ])('refuses %s', (_label, env) => {
    expect(() => readRazorpayConfig(env)).toThrow(RazorpayConfigError);
    expect(getRazorpayConfig(env)).toBeNull();
  });

  describe('BILLING_PROVIDER_OVERRIDE (Phase 6 dev switch)', () => {
    it('is null when unset or blank', () => {
      expect(readRazorpayConfig(TEST_ENV).providerOverride).toBeNull();
      expect(
        readRazorpayConfig({ ...TEST_ENV, BILLING_PROVIDER_OVERRIDE: '  ' })
          .providerOverride
      ).toBeNull();
    });

    it('parses both values on a dev deployment', () => {
      expect(
        readRazorpayConfig({
          ...TEST_ENV,
          BILLING_PROVIDER_OVERRIDE: 'manual_upi',
        }).providerOverride
      ).toBe('manual_upi');
      expect(
        readRazorpayConfig({
          ...TEST_ENV,
          BILLING_PROVIDER_OVERRIDE: 'razorpay',
        }).providerOverride
      ).toBe('razorpay');
    });

    it('is ignored, not refused, when BILLING_ENV=prod', () => {
      for (const value of ['manual_upi', 'razorpay', 'nonsense']) {
        const cfg = readRazorpayConfig({
          ...LIVE_ENV,
          BILLING_PROVIDER_OVERRIDE: value,
        });
        expect(cfg.providerOverride).toBeNull();
      }
    });

    it('refuses an invalid value on dev, naming the variable but not the value', () => {
      const env = { ...TEST_ENV, BILLING_PROVIDER_OVERRIDE: 'stripe_xyz' };
      expect(() => readRazorpayConfig(env)).toThrow(RazorpayConfigError);
      expect(getRazorpayConfig(env)).toBeNull();
      try {
        readRazorpayConfig(env);
      } catch (err) {
        expect(String(err)).toContain('BILLING_PROVIDER_OVERRIDE');
        expect(String(err)).not.toContain('stripe_xyz');
      }
    });
  });

  describe('RAZORPAY_CHARGE_CURRENCIES', () => {
    it('is INR only when unset', () => {
      expect([...chargeCurrenciesOf(readRazorpayConfig(TEST_ENV))]).toEqual([
        'INR',
      ]);
      expect([...chargeCurrenciesOf(null)]).toEqual(['INR']);
      expect([...chargeCurrenciesOf({})]).toEqual(['INR']);
    });

    it('uppercases and always keeps INR', () => {
      const cfg = readRazorpayConfig({
        ...LIVE_ENV,
        RAZORPAY_CHARGE_CURRENCIES: 'usd, AED',
      });
      expect([...chargeCurrenciesOf(cfg)].sort()).toEqual([
        'AED',
        'INR',
        'USD',
      ]);
    });

    it('drops invalid tokens with a warning naming the variable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cfg = readRazorpayConfig({
        ...LIVE_ENV,
        RAZORPAY_CHARGE_CURRENCIES: 'US$,USD',
      });
      expect([...chargeCurrenciesOf(cfg)].sort()).toEqual(['INR', 'USD']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('RAZORPAY_CHARGE_CURRENCIES')
      );
      warn.mockRestore();
    });
  });

  it('never puts a secret value in the error message', () => {
    try {
      readRazorpayConfig({
        ...TEST_ENV,
        RAZORPAY_KEY_ID: 'rzp_live_SECRETLOOKING',
      });
      throw new Error('expected a config error');
    } catch (err) {
      expect(String(err)).not.toContain('SECRETLOOKING');
      expect(String(err)).not.toContain('secret_secret_secret_1');
    }
  });
});
