// ============================================================
// What a Razorpay payment says about itself: the Checkout description,
// the notes we write onto every payment, and the charge type shown in
// our own billing screens.
//
// Pure and browser-safe (no I/O), so the routes, the notes sync and the
// UI all build identical strings.
//
// Razorpay limits (Update a Payment API): at most 15 note pairs, each
// value at most 256 characters, and the PATCH replaces the whole notes
// object. Notes never carry an email, a phone number or card details.
// ============================================================

import { isValidE164 } from '@/lib/whatsapp/phone-utils';

import { formatBillingDate } from './format';

/** Old default of `subscription_settings.razorpay_checkout_description`. */
export const LEGACY_CHECKOUT_DESCRIPTIONS: ReadonlySet<string> = new Set([
  'replai subscription',
]);

export const MAX_PAYMENT_NOTES = 15;
export const MAX_NOTE_VALUE = 256;
/** Razorpay Checkout clips longer descriptions; keep ours inside it. */
export const MAX_DESCRIPTION = 255;

/** Our note keys, in the order they are written. */
export const PAYMENT_NOTE_KEYS = [
  'product',
  'workspace',
  'account_id',
  'plan',
  'billing_cycle',
  'charge_type',
  'period_start',
  'period_end',
  'subscription_id',
  'invoice_id',
  'env',
  'mode',
] as const;

export type ChargeType = 'first_payment' | 'renewal' | 'card_verification';

const SEPARATOR = ' · ';

/** Trim, drop control characters and collapse whitespace. */
function clean(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value;
}

/**
 * "Replai Pro plan · Monthly · AutoPay". An admin description that is not
 * the legacy default is kept as a prefix, so the plan and cycle always
 * show in the Razorpay Dashboard and on the customer's statement.
 */
export function composeCheckoutDescription(input: {
  setting: string | null | undefined;
  planName: string;
  cycleLabel: string;
}): string {
  const name = clean(input.planName) || 'Replai';
  let planPart = /^replai\b/i.test(name) ? name : `Replai ${name}`;
  if (!/\bplan$/i.test(planPart)) planPart += ' plan';

  let prefix = clean(input.setting);
  if (
    LEGACY_CHECKOUT_DESCRIPTIONS.has(prefix.toLowerCase()) ||
    planPart.toLowerCase().startsWith(prefix.toLowerCase())
  ) {
    prefix = '';
  }
  const parts = [prefix, planPart, clean(input.cycleLabel), 'AutoPay'].filter(
    Boolean
  );
  return clip(parts.join(SEPARATOR), MAX_DESCRIPTION);
}

/** "Replai · Update AutoPay card". */
export function composeCardChangeDescription(
  business: string | null | undefined
): string {
  return clip(
    `${clean(business) || 'Replai'}${SEPARATOR}Update AutoPay card`,
    MAX_DESCRIPTION
  );
}

function toTime(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * - No invoice (the ₹5 card check, a card change, a UPI mandate check):
 *   card_verification.
 * - Otherwise first_payment unless an applied charge on the same
 *   subscription was created strictly earlier, else renewal. A failed
 *   first attempt and its successful retry are both "first payment".
 */
export function chargeTypeFor(input: {
  kind: string | null;
  hasInvoice: boolean;
  createdAt: string | null;
  firstAppliedChargeAt: string | null;
}): ChargeType {
  if (input.kind === 'authorization' || !input.hasInvoice)
    return 'card_verification';
  const first = toTime(input.firstAppliedChargeAt);
  const created = toTime(input.createdAt);
  if (first === null || created === null || created <= first)
    return 'first_payment';
  return 'renewal';
}

const CHARGE_LABELS: Record<ChargeType, string> = {
  first_payment: 'First payment',
  renewal: 'Renewal',
  card_verification: 'AutoPay setup check',
};

export function chargeTypeLabel(type: ChargeType): string {
  return CHARGE_LABELS[type];
}

/** Earliest applied charge per subscription (provider time first). */
export function firstAppliedChargeAtBySubscription(
  rows: Array<{
    subscription_id: string | null;
    provider_created_at: string | null;
    created_at: string;
  }>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    if (!row.subscription_id) continue;
    const at = row.provider_created_at ?? row.created_at;
    const t = toTime(at);
    if (t === null) continue;
    const current = out.get(row.subscription_id);
    const currentT = current ? toTime(current) : null;
    if (currentT === null || t < currentT) out.set(row.subscription_id, at);
  }
  return out;
}

export interface PaymentNotesInput {
  workspace: string | null;
  accountId: string;
  planName: string | null;
  cycleLabel: string | null;
  chargeType: ChargeType;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  env: string;
  mode: string;
}

/** Our notes for one payment. Empty values are left out. */
export function buildPaymentNotes(
  input: PaymentNotesInput
): Record<string, string> {
  const values: Record<(typeof PAYMENT_NOTE_KEYS)[number], string> = {
    product: 'Replai',
    workspace: clean(input.workspace),
    account_id: clean(input.accountId),
    plan: clean(input.planName),
    billing_cycle: clean(input.cycleLabel),
    charge_type: input.chargeType,
    period_start: formatBillingDate(input.periodStart),
    period_end: formatBillingDate(input.periodEnd),
    subscription_id: clean(input.subscriptionId),
    invoice_id: clean(input.invoiceId),
    env: clean(input.env),
    mode: clean(input.mode),
  };
  const notes: Record<string, string> = {};
  for (const key of PAYMENT_NOTE_KEYS) {
    const value = clip(values[key], MAX_NOTE_VALUE);
    if (value) notes[key] = value;
  }
  return notes;
}

/** Razorpay returns `[]` for "no notes"; anything else that is not an object is treated the same. */
function asNoteObject(existing: unknown): Record<string, unknown> {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing))
    return {};
  return existing as Record<string, unknown>;
}

/**
 * The body for the PATCH: our keys first, then any other notes already on
 * the payment while there is room (Razorpay replaces the whole object).
 */
export function mergeNotes(
  existing: unknown,
  ours: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(ours)) {
    if (Object.keys(merged).length >= MAX_PAYMENT_NOTES) break;
    merged[k] = clip(v, MAX_NOTE_VALUE);
  }
  for (const [k, v] of Object.entries(asNoteObject(existing))) {
    if (Object.keys(merged).length >= MAX_PAYMENT_NOTES) break;
    if (k in merged) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    merged[k] = clip(String(v), MAX_NOTE_VALUE);
  }
  return merged;
}

/** True when any of our keys is missing or holds a different value. */
export function notesNeedUpdate(
  existing: unknown,
  ours: Record<string, string>
): boolean {
  const current = asNoteObject(existing);
  return Object.entries(ours).some(([k, v]) => current[k] !== v);
}

/**
 * The owner's phone for Checkout prefill, as "+<digits>", or null when it
 * is missing or not a valid E.164 number (then `contact` is left out).
 */
export function normalizePrefillContact(
  phone: string | null | undefined
): string | null {
  if (!phone) return null;
  const compact = String(phone).replace(/[\s\-().]/g, '');
  if (!isValidE164(compact)) return null;
  return `+${compact.replace(/^\+/, '')}`;
}
