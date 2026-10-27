import { describe, expect, it } from 'vitest';

import { formatCurrency } from '@/lib/currency';

import {
  formatMoneyMajor,
  formatMoneyMinor,
  formatPlanAmount,
  PLATFORM_BILLING_CURRENCY,
} from './money-format';

describe('formatPlanAmount', () => {
  it('renders INR exactly as before', () => {
    for (const n of [990, 9000, 33, 25, 0]) {
      expect(formatPlanAmount(n, 'INR')).toBe(formatCurrency(n, 'INR'));
    }
    expect(formatPlanAmount(990, null)).toBe(formatCurrency(990, 'INR'));
  });

  it('keeps cents for other currencies only when present', () => {
    expect(formatPlanAmount(60, 'USD')).toBe('$60');
    expect(formatPlanAmount(1.99, 'USD')).toBe('$1.99');
    expect(formatPlanAmount(2, 'usd')).toBe('$2');
    expect(formatPlanAmount(1200, 'USD')).toBe('$1,200');
  });

  it('never throws on a bad code', () => {
    expect(formatPlanAmount(5, 'ZZ1')).toBe('ZZ1 5');
  });

  it('follows a non-INR Global currency instead of a hardcoded rupee', () => {
    expect(formatPlanAmount(12, 'USD')).toBe('$12');
    expect(formatPlanAmount(12.5, 'USD')).toBe('$12.50');
    expect(formatPlanAmount(1500, 'JPY')).toBe('¥1,500');
    expect(formatPlanAmount(990, 'INR')).toBe(formatCurrency(990, 'INR'));
    expect(formatPlanAmount(12, 'USD')).not.toContain('₹');
  });
});

describe('formatMoneyMajor', () => {
  it('defaults to INR, not USD', () => {
    expect(PLATFORM_BILLING_CURRENCY).toBe('INR');
    expect(formatMoneyMajor(9000)).toBe('₹9,000');
    expect(formatMoneyMajor(9000, null)).toBe('₹9,000');
  });

  it('uses Indian digit grouping', () => {
    expect(formatMoneyMajor(4515000, 'INR')).toBe('₹45,15,000');
    expect(formatMoneyMajor('45150.00', 'inr')).toBe('₹45,150');
  });

  it('keeps paise only when there are some', () => {
    expect(formatMoneyMajor(990.5, 'INR')).toBe('₹990.50');
  });

  it('keeps a non-INR row in its own currency', () => {
    expect(formatMoneyMajor(12, 'USD')).toBe('$12');
  });

  it('never throws on a bad code or value', () => {
    expect(formatMoneyMajor(1234, 'Rupees')).toBe('RUPEES 1,234');
    expect(formatMoneyMajor(null)).toBe('—');
    expect(formatMoneyMajor(undefined)).toBe('—');
    expect(formatMoneyMajor('abc')).toBe('—');
  });
});

describe('formatMoneyMinor', () => {
  it('converts paise to rupees', () => {
    expect(formatMoneyMinor(99950, 'INR')).toBe('₹999.50');
    expect(formatMoneyMinor(900000)).toBe('₹9,000');
    expect(formatMoneyMinor(500, 'INR')).toBe('₹5');
  });

  it('handles empty and invalid input', () => {
    expect(formatMoneyMinor(null, 'INR')).toBe('—');
    expect(formatMoneyMinor(undefined)).toBe('—');
    expect(formatMoneyMinor(123400, 'Rupees')).toBe('RUPEES 1,234');
  });

  it('keeps a USD row in dollars', () => {
    expect(formatMoneyMinor(1250, 'USD')).toBe('$12.50');
  });
});
