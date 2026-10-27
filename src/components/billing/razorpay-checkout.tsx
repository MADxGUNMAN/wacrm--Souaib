'use client';

// ============================================================
// Razorpay Standard Checkout, loaded on demand.
//
// `checkout.js` is fetched only when a customer actually reaches the
// payment step (not on every page), once per page load, and the modal is
// opened with a subscription id the SERVER created. No amount is passed:
// the subscription defines it, so the browser cannot change what is
// charged.
//
// `openRazorpayCheckout` resolves exactly once:
//   success   — Checkout's handler fired; the response still has to be
//               verified by POST /api/billing/razorpay/verify
//   dismissed — the customer closed Checkout (with the last failure, if a
//               payment attempt failed before they closed it)
// ============================================================

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const LOAD_TIMEOUT_MS = 15_000;

export interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface CheckoutFailure {
  code: string | null;
  reason: string | null;
  description: string | null;
}

export type CheckoutOutcome =
  | { kind: 'success'; response: CheckoutSuccess }
  | { kind: 'dismissed'; lastFailure: CheckoutFailure | null };

interface RazorpayInstance {
  open(): void;
  close?(): void;
  on(
    event: 'payment.failed',
    handler: (response: { error?: Record<string, unknown> }) => void
  ): void;
}

type RazorpayConstructor = new (
  options: Record<string, unknown>
) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('Checkout needs a browser'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`
    );
    const script = existing ?? document.createElement('script');
    const timer = window.setTimeout(
      () => fail(new Error('Razorpay Checkout took too long to load')),
      LOAD_TIMEOUT_MS
    );

    function fail(err: Error) {
      window.clearTimeout(timer);
      loading = null;
      reject(err);
    }

    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail(new Error('Razorpay Checkout did not initialise'));
    });
    script.addEventListener('error', () =>
      fail(
        new Error(
          'Could not load Razorpay Checkout. Check your connection or ad blocker.'
        )
      )
    );

    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
  return loading;
}

/** Square brand icon served from /public, shown in the Checkout header. */
const CHECKOUT_LOGO_PATH = '/razorpay-checkout-logo.png';

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export async function openRazorpayCheckout(options: {
  keyId: string;
  subscriptionId: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  /** Server-built payment notes (max 15 pairs), set on the Checkout payment. */
  notes?: Record<string, string>;
  themeColor?: string;
  /** Absolute logo URL; defaults to this site's /razorpay-checkout-logo.png. */
  image?: string;
  /** Change the card on an existing card mandate instead of authorising a new one. */
  cardChange?: boolean;
}): Promise<CheckoutOutcome> {
  const Razorpay = await loadRazorpayCheckout();

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    let lastFailure: CheckoutFailure | null = null;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const rzp = new Razorpay({
      key: options.keyId,
      subscription_id: options.subscriptionId,
      ...(options.cardChange ? { subscription_card_change: 1 } : {}),
      name: options.name,
      description: options.description,
      // Brand logo in the Checkout header (replaces Razorpay's letter
      // placeholder). Must be an absolute URL Razorpay's iframe can fetch.
      image: options.image ?? `${window.location.origin}${CHECKOUT_LOGO_PATH}`,
      prefill: options.prefill,
      ...(options.notes && Object.keys(options.notes).length > 0
        ? { notes: options.notes }
        : {}),
      theme: options.themeColor ? { color: options.themeColor } : undefined,
      // Recurring payments only work on cards and UPI AutoPay here (D5).
      // eMandate is also off in the Dashboard; hiding it is belt and braces.
      config: {
        display: {
          hide: [{ method: 'emandate' }, { method: 'nach' }],
          preferences: { show_default_blocks: true },
        },
      },
      handler: (response: Partial<CheckoutSuccess>) => {
        const id = str(response.razorpay_payment_id);
        const sig = str(response.razorpay_signature);
        if (!id || !sig) {
          settle({ kind: 'dismissed', lastFailure });
          return;
        }
        settle({
          kind: 'success',
          response: {
            razorpay_payment_id: id,
            razorpay_subscription_id:
              str(response.razorpay_subscription_id) ?? '',
            razorpay_signature: sig,
          },
        });
      },
      modal: {
        // Ask before closing mid-payment, so a stray click does not abandon it.
        confirm_close: true,
        ondismiss: () => settle({ kind: 'dismissed', lastFailure }),
      },
    });

    // A failed attempt keeps Checkout open so the customer can retry with
    // another card; remember the reason in case they close it instead.
    rzp.on('payment.failed', (response) => {
      const e = response?.error ?? {};
      lastFailure = {
        code: str(e.code),
        reason: str(e.reason),
        description: str(e.description),
      };
    });

    rzp.open();
  });
}
