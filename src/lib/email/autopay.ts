// ============================================================
// Razorpay AutoPay emails (plan section 10) — rendering only.
//
// Pure: takes the outbox row's `data` (display values written by the SQL
// apply functions) plus branding, and returns subject/html/text. The
// outbox deliverer (src/lib/billing/notifications/deliver.ts) does the
// sending, retries and bookkeeping.
//
// Wording rules that matter for money (plan section 3.5):
//   - "AutoPay set up" is never called a payment or a receipt, and always
//     says the customer has not been charged.
//   - Dates are IST and say so, because charges are scheduled in IST.
//   - Card numbers never appear; at most network + last 4, or a masked VPA.
// ============================================================

import { formatPlanAmount } from '@/lib/billing/money-format';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import { fromMinor } from '@/lib/billing/razorpay/money';
import type { BillingNotificationKind } from '@/lib/billing/razorpay/types';

import type { EmailBranding } from './branding';
import {
  button,
  detailTable,
  heading,
  notice,
  paragraph,
  renderEmail,
  toPlainText,
  type DetailRow,
} from './layout';

export interface AutopayEmailContext {
  branding: EmailBranding;
  recipientName: string | null;
  /** Admin-authored support line (subscription_settings.support_note). */
  supportNote: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type Data = Record<string, unknown>;

function str(data: Data, key: string): string | null {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(data: Data, key: string): number | null {
  const v = data[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** "6 Apr 2027 (IST)", or '' when missing. */
function istDate(value: string | null): string {
  const d = formatBillingDate(value);
  return d ? `${d} (IST)` : '';
}

/** Minor units -> "₹990", or '' when missing or unconvertible. */
function money(data: Data, key = 'amount_minor'): string {
  const minor = num(data, key);
  const currency = str(data, 'currency') ?? 'INR';
  if (minor === null) return '';
  try {
    return formatPlanAmount(fromMinor(minor, currency), currency);
  } catch {
    return '';
  }
}

function planLabel(data: Data): string {
  return (
    [str(data, 'plan_name'), str(data, 'cycle_label')]
      .filter(Boolean)
      .join(' · ') || 'your plan'
  );
}

/** "Visa ending 1111", "UPI te****@razorpay", "Card", or ''. */
function methodLabel(data: Data): string {
  const summary = (data.method_summary ?? {}) as Data;
  const vpa = str(data, 'vpa_masked') ?? str(summary, 'vpa_masked');
  if (vpa) return `UPI ${vpa}`;
  const last4 = str(data, 'card_last4') ?? str(summary, 'last4');
  const network = str(data, 'card_network') ?? str(summary, 'network');
  if (last4) return `${network ?? 'Card'} ending ${last4}`;
  const method =
    str(data, 'method') ??
    str(data, 'payment_method') ??
    str(summary, 'method');
  if (!method) return '';
  return method === 'upi'
    ? 'UPI'
    : method.charAt(0).toUpperCase() + method.slice(1);
}

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi there,';
}

function cadence(data: Data): string {
  const days = num(data, 'duration_days');
  const amount = money(data);
  if (!amount) return '';
  return days ? `${amount} every ${days} days` : amount;
}

interface Body {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  rows: DetailRow[];
  notice?: {
    tone: 'neutral' | 'success' | 'warning' | 'danger';
    title?: string;
    body: string;
  };
  cta?: { href: string; label: string };
}

function compose(
  kind: BillingNotificationKind,
  data: Data,
  ctx: AutopayEmailContext
): Body {
  const app = ctx.branding.appUrl;
  const site = ctx.branding.siteName;
  const plan = planLabel(data);
  const billing = {
    href: `${app}/settings?tab=billing`,
    label: 'Manage billing',
  };
  const renew = { href: `${app}/upgrade-plan`, label: 'Renew now' };
  const paidThrough = istDate(str(data, 'paid_through'));

  switch (kind) {
    case 'mandate_authenticated': {
      const first = istDate(
        str(data, 'first_charge_at') ?? str(data, 'next_charge_at')
      );
      return {
        subject: `AutoPay is set up for ${site}. You have not been charged`,
        preheader: first
          ? `Your first charge is on ${first}. Nothing was charged today.`
          : 'Nothing was charged today.',
        heading: 'AutoPay is set up',
        paragraphs: [
          `You have set up AutoPay for ${plan}. This is not a payment: you have not been charged for the subscription.`,
          first
            ? `Your first charge is on ${first}, when your current access ends. After that, ${cadence(data) || 'the plan amount'} until you cancel.`
            : `Charges will follow your plan, ${cadence(data) || 'every billing period'}, until you cancel.`,
        ],
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Amount', value: cadence(data) },
          { label: 'First charge', value: first, emphasis: true },
          { label: 'Pays with', value: methodLabel(data) },
        ],
        notice: {
          tone: 'neutral',
          // The ₹5 card verification charge is an INR mandate fact; a
          // mandate in another currency is not described in rupees.
          body:
            (str(data, 'currency') ?? 'INR').toUpperCase() === 'INR'
              ? 'If you used a card, a small verification charge of ₹5 is refunded automatically. You may also get an email from Razorpay about this mandate. You can cancel AutoPay at any time from Billing.'
              : 'If you used a card, a small verification charge is made and refunded automatically. You may also get an email from Razorpay about this mandate. You can cancel AutoPay at any time from Billing.',
        },
        cta: billing,
      };
    }

    case 'payment_receipt': {
      const firstPayment = data.first_payment === true;
      const period = [
        istDate(str(data, 'period_start')),
        istDate(str(data, 'period_end')),
      ]
        .filter(Boolean)
        .join(' to ');
      const invoice = str(data, 'invoice_url');
      return {
        subject: firstPayment
          ? `Payment received: ${plan} is active`
          : `Payment received: ${plan} renewed`,
        preheader: `We received ${money(data)}. Your access runs until ${paidThrough}.`,
        heading: firstPayment
          ? 'Payment received, your subscription is active'
          : 'Payment received, your subscription has renewed',
        paragraphs: [
          `Thanks. AutoPay collected ${money(data)} for ${plan}.`,
          paidThrough
            ? `Your access now runs until ${paidThrough}. The next charge happens automatically unless you cancel.`
            : '',
        ].filter(Boolean),
        rows: [
          { label: 'Amount paid', value: money(data), emphasis: true },
          { label: 'Paid on', value: istDate(str(data, 'paid_at')) },
          { label: 'Paid with', value: methodLabel(data) },
          { label: 'Period covered', value: period },
          { label: 'Access until', value: paidThrough, emphasis: true },
          {
            label: 'Payment ID',
            value: str(data, 'provider_payment_id') ?? '',
          },
        ],
        cta: invoice ? { href: invoice, label: 'View invoice' } : billing,
      };
    }

    case 'payment_failed':
    case 'payment_retry_final': {
      const final = kind === 'payment_retry_final';
      return {
        subject: final
          ? `Final attempt: your ${site} payment could not be collected`
          : `Your ${site} AutoPay payment did not go through`,
        preheader: final
          ? 'Update your payment method to keep your subscription.'
          : 'Razorpay will try again automatically.',
        heading: final
          ? 'Your payment still could not be collected'
          : 'Your AutoPay payment did not go through',
        paragraphs: [
          `AutoPay could not collect ${money(data) || 'your renewal'} for ${plan}. Common reasons are a low balance, a card limit or a bank decline.`,
          final
            ? 'Razorpay has one more attempt left. If it also fails, AutoPay stops and you will need to renew by hand.'
            : 'Razorpay will try again automatically over the next few days. Your access continues while it retries.',
        ],
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Amount due', value: money(data) },
          { label: 'Pays with', value: methodLabel(data) },
        ],
        notice: {
          tone: 'warning',
          body: 'Please make sure the card or UPI account has enough balance, or change the payment method from Billing.',
        },
        cta: billing,
      };
    }

    case 'action_required':
      return {
        subject: `Action needed: your ${site} payment could not be collected`,
        preheader: 'AutoPay has stopped after several failed attempts.',
        heading: 'AutoPay has stopped',
        paragraphs: [
          `Razorpay tried several times and could not collect ${money(data) || 'your renewal'} for ${plan}, so AutoPay has stopped.`,
          paidThrough
            ? `Your access runs until ${paidThrough}. Renew before then to keep using ${site} without a break.`
            : `Renew to keep using ${site}.`,
        ],
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Amount', value: money(data) },
          { label: 'Access until', value: paidThrough, emphasis: true },
        ],
        notice: {
          tone: 'danger',
          body: 'No further automatic attempts will be made.',
        },
        cta: renew,
      };

    case 'autopay_cancelled':
      return {
        subject: `AutoPay cancelled for ${site}`,
        preheader: 'No further charges will be made.',
        heading: 'AutoPay has been cancelled',
        paragraphs: [
          `AutoPay for ${plan} is cancelled. No further charges will be made.`,
          paidThrough ? `You keep access until ${paidThrough}.` : '',
        ].filter(Boolean),
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Access until', value: paidThrough, emphasis: true },
        ],
        cta: { href: `${app}/upgrade-plan`, label: 'Set up AutoPay again' },
      };

    case 'autopay_paused':
      return {
        subject: `AutoPay paused for ${site}`,
        preheader:
          'Your next renewal will not be charged while AutoPay is paused.',
        heading: 'AutoPay is paused',
        paragraphs: [
          `AutoPay for ${plan} is paused, so the next renewal will not be charged.`,
          'If you paused it in your UPI app, you can resume it there.',
          paidThrough ? `Your access runs until ${paidThrough}.` : '',
        ].filter(Boolean),
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Access until', value: paidThrough },
        ],
        cta: billing,
      };

    case 'subscription_completed':
      return {
        subject: `Your ${site} subscription has completed`,
        preheader: 'All scheduled billing cycles have been charged.',
        heading: 'Your subscription has completed',
        paragraphs: [
          `Every scheduled billing cycle for ${plan} has been charged, so AutoPay has ended.`,
          paidThrough
            ? `Your access runs until ${paidThrough}. Subscribe again to continue after that.`
            : 'Subscribe again to continue.',
        ],
        rows: [
          { label: 'Plan', value: plan, emphasis: true },
          { label: 'Access until', value: paidThrough },
        ],
        cta: { href: `${app}/upgrade-plan`, label: 'Subscribe again' },
      };

    case 'refund_processed': {
      const effect = str(data, 'access_effect');
      const removed = effect === 'window_removed';
      return {
        subject: `Refund processed: ${money(data)}`,
        preheader: 'Refunds usually reach your account in 5 to 7 working days.',
        heading: 'Your refund has been processed',
        paragraphs: [
          `Razorpay has processed a refund of ${money(data)} for your ${plan} payment. It usually reaches your account in 5 to 7 working days, depending on your bank.`,
          removed
            ? `Because the full payment was refunded, the time it paid for has been removed.${paidThrough ? ` Your access now runs until ${paidThrough}.` : ''}`
            : 'Your access is unchanged.',
        ],
        rows: [
          { label: 'Refund', value: money(data), emphasis: true },
          {
            label: 'Original payment',
            value: money(data, 'payment_amount_minor'),
          },
          {
            label: 'Payment ID',
            value: str(data, 'provider_payment_id') ?? '',
          },
          { label: 'Access until', value: paidThrough },
        ],
        cta: billing,
      };
    }

    default: {
      const never: never = kind;
      throw new Error(`Unknown AutoPay email kind: ${String(never)}`);
    }
  }
}

export function renderAutopayEmail(
  kind: BillingNotificationKind,
  data: Record<string, unknown>,
  ctx: AutopayEmailContext
): RenderedEmail {
  const body = compose(kind, data ?? {}, ctx);
  const { branding } = ctx;

  const content = [
    heading(body.heading),
    paragraph(greeting(ctx.recipientName)),
    ...body.paragraphs.map(paragraph),
    detailTable(body.rows),
    body.notice ? notice(body.notice) : '',
    body.cta ? button(body.cta) : '',
  ]
    .filter(Boolean)
    .join('\n');

  const footer = [
    ctx.supportNote,
    branding.supportEmail
      ? `Questions about billing? Reply to this email or write to ${branding.supportEmail}.`
      : 'Questions about billing? Just reply to this email.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmail({
    siteName: branding.siteName,
    preheader: body.preheader,
    content,
    footerNote: footer,
    logoUrl: branding.logoUrl,
    logoDarkUrl: branding.logoDarkUrl,
  });

  return { subject: body.subject, html, text: toPlainText(html) };
}
