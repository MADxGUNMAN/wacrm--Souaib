'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

/**
 * Meta's own charges for the account, above the templates list.
 *
 * ─── Why the list needed this ─────────────────────────────────────
 *
 * Adding up the per-template Spend column and comparing it to Meta gave
 * two different answers — ₹19.95 against Meta's ₹21.98 — because they are
 * two different Meta datasets. The column sums TEMPLATE analytics, which
 * is attribution: it only exists from the day template insights were
 * switched on, only covers templates that still exist in this CRM, and is
 * rounded to two decimals per template per day. This card shows the
 * BILLING ledger (`pricing_analytics`), which is the figure on Meta's own
 * Message pricing screen and the one that reconciles with an invoice.
 *
 * Showing both, with the difference named, is the honest version. Hiding
 * the gap would leave an operator to discover it while checking a bill.
 */

/** Shape of GET /api/whatsapp/message-pricing. */
interface MessagePricing {
  available: boolean;
  window: { start: string; end: string; days: number };
  currency: string | null;
  total_charges: number | null;
  volume: number;
  paid_volume: number;
  free_volume: number;
  by_category: { key: string; volume: number; cost: number | null }[];
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const code = (currency ?? '').trim();
  try {
    if (!code) throw new Error('no currency');
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return code ? `${code} ${formatted}` : formatted;
  }
}

/** `AUTHENTICATION` → `Authentication`. */
function categoryLabel(key: string): string {
  const clean = key.replace(/_/g, ' ').toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function MessagePricingCard(props: {
  /**
   * Sum of the Spend column, so the two can be compared in place. Null
   * when the column is not shown.
   */
  attributedSpend: number | null;
  attributedFrom: string | null;
}) {
  const { attributedSpend, attributedFrom } = props;
  const [pricing, setPricing] = useState<MessagePricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/whatsapp/message-pricing', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as MessagePricing;
        if (!cancelled) setPricing(body);
      } catch {
        // Silent by design: this card is additional context, and an error
        // banner over a working templates list would be noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing billed yet, or cost withheld on a partner credit line.
  if (!pricing?.available) return null;

  const charged = pricing.total_charges;
  // Only worth naming when it is real money rather than Meta's rounding.
  const gap =
    charged !== null && attributedSpend !== null
      ? charged - attributedSpend
      : null;
  const showGap = gap !== null && Math.abs(gap) >= 0.01;

  const priced = pricing.by_category.filter(
    (row) => row.cost !== null && row.cost > 0
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <Receipt className="size-3.5" />
            Charged by Meta
            <span className="font-normal">
              · {pricing.window.start} to {pricing.window.end}
            </span>
          </div>
          {priced.length > 0 ? (
            <p className="text-muted-foreground text-[11px]">
              {priced
                .map(
                  (row) =>
                    `${categoryLabel(row.key)} ${formatMoney(row.cost, pricing.currency)}`
                )
                .join(' · ')}
            </p>
          ) : null}
          <p className="text-muted-foreground text-[11px]">
            {pricing.paid_volume.toLocaleString()} of{' '}
            {pricing.volume.toLocaleString()} messages charged ·{' '}
            {pricing.free_volume.toLocaleString()} free
          </p>
          {showGap ? (
            <p
              className="text-muted-foreground text-[11px]"
              title={
                'The Spend column comes from Meta’s template analytics, which only attributes sends from the day template insights were switched on, only covers templates still in this CRM, and is rounded per template per day. This total is Meta’s billing ledger.'
              }
            >
              Attributed to templates below:{' '}
              {formatMoney(attributedSpend, pricing.currency)}
              {attributedFrom ? ` (from ${attributedFrom})` : ''} —{' '}
              {formatMoney(Math.abs(gap), pricing.currency)}{' '}
              {gap > 0 ? 'unattributed' : 'over-attributed'}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {formatMoney(charged, pricing.currency)}
          </p>
          <p className="text-muted-foreground text-[11px]">
            Approximate total charges
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
