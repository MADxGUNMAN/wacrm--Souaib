// Customer-facing links for an AutoPay. Pure and browser-safe.

import type { AutopayView } from './view';

/**
 * Where "Renew" / "Set up again" goes: the payment step for the same plan
 * and term, or the plan chooser if that plan or term no longer exists.
 * The payment step replaces a stopped or paused mandate (service.ts).
 */
export function renewHref(a: Pick<AutopayView, 'planId' | 'cycleId'>): string {
  return a.planId && a.cycleId
    ? `/upgrade-plan/payment?plan=${encodeURIComponent(a.planId)}&cycle=${encodeURIComponent(a.cycleId)}`
    : '/upgrade-plan';
}
