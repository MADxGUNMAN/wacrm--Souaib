// ============================================================
// F6: manual access changes do not move Razorpay's charge schedule.
//
// Access lives in `accounts.subscription_ends_at`; Razorpay charges on its
// own `charge_at`. Granting a month by hand, moving the end date or ending
// access touches only the first, so a workspace with working AutoPay is
// still charged on the old date. This note says so inside the dialog where
// the operator is about to make that change.
//
// Pure and presentational, so it renders under renderToStaticMarkup.
// ============================================================

import { AlertTriangle } from 'lucide-react';

import type { SubscriberAutopay } from '@/types/super-admin';
import { statusMeta } from './billing-labels';
import { paymentsHref } from './payments-nav';
import { formatIst, formatMinor } from './razorpay-shared';

export type ManualIntent = 'give' | 'date' | 'end' | 'advanced';

export function AutopayManualActionWarning({
  autopay,
  intent,
  onOpenAutopay,
}: {
  autopay: SubscriberAutopay | null | undefined;
  intent: ManualIntent;
  /** Opens the AutoPay in the Subscriptions tab without a page load. */
  onOpenAutopay?: (billingSubscriptionId: string) => void;
}) {
  if (!autopay?.charging) return null;
  if (intent !== 'give' && intent !== 'date' && intent !== 'end') return null;

  const amount = formatMinor(autopay.amountMinor, autopay.currency);
  const date = autopay.chargeAt
    ? formatIst(autopay.chargeAt)
    : 'the date Razorpay has scheduled';
  const label = `${statusMeta('subscription', autopay.status).label.toLowerCase()}${autopay.mode === 'test' ? ', test mode' : ''}`;
  const href = paymentsHref({
    section: 'subscriptions',
    view: 'autopay',
    sub: autopay.id,
  });

  return (
    <div
      role="note"
      className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        aria-hidden
      />
      <div className="space-y-1">
        {intent === 'end' ? (
          <p>
            Ending access here does not cancel AutoPay. Razorpay will still
            charge {amount} on {date} unless you cancel AutoPay from the
            Subscriptions tab.
          </p>
        ) : (
          <p>
            This workspace has Razorpay AutoPay ({label}). Changing access here
            does not move Razorpay&apos;s charge schedule. The next charge of{' '}
            {amount} is still due on {date}. To stop charges, cancel AutoPay
            from the Subscriptions tab.
          </p>
        )}
        <a
          href={href}
          onClick={(e) => {
            if (!onOpenAutopay) return;
            e.preventDefault();
            onOpenAutopay(autopay.id);
          }}
          className="inline-block font-medium text-slate-900 underline underline-offset-2 hover:text-slate-700"
        >
          Open this AutoPay in the Subscriptions tab
        </a>
      </div>
    </div>
  );
}
