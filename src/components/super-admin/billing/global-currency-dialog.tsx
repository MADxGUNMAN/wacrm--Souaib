'use client';

// ============================================================
// Confirm dialog for a Global (Universal) currency change.
//
// Global prices are plain numbers, so a currency change without new
// prices would silently turn 990 INR into 990 USD. This dialog states the
// impact, requires the new price of every Global price row in the new
// currency, and sends prices and currency to the server in ONE call
// (PUT /api/super-admin/billing/global-currency), which writes them in one
// database transaction. Layout follows the shared confirm dialog
// (src/components/ui/confirm-dialog.tsx), which cannot hold form state.
// ============================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatPlanAmount } from '@/lib/billing/money-format';
import {
  globalPriceRowLabel,
  parseMoneyInput,
  soldPlanIdOf,
  type GlobalPriceRow,
} from '@/lib/billing/pricing/global-currency';
import { perDayAmount } from '@/lib/subscription/plans';

export interface LandingOverride {
  currency: string | null;
  cycles: string[];
}

const keyOf = (r: Pick<GlobalPriceRow, 'planId' | 'cycleId'>) =>
  `${r.planId}:${r.cycleId}`;

function termOf(row: GlobalPriceRow): string {
  if (row.durationDays) return `${row.durationDays} days`;
  return row.months === 1 ? '1 month' : `${row.months} months`;
}

export function GlobalCurrencyDialog({
  open,
  onOpenChange,
  from,
  to,
  rows,
  landingOverride,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
  rows: GlobalPriceRow[];
  landingOverride: LandingOverride | null;
  onChanged: () => void | Promise<void>;
}) {
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [perDays, setPerDays] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const sold = soldPlanIdOf(rows);
  const clearsOverrides = rows.some(
    (r) => r.perDayAmount != null || r.compareAtAmount != null
  );
  const ready = useMemo(
    () =>
      rows.every((r) => {
        const n = parseMoneyInput(totals[keyOf(r)] ?? '');
        return n !== null && n > 0;
      }),
    [rows, totals]
  );

  const submit = async () => {
    setSaving(true);
    setError(null);
    setProblems([]);
    try {
      const res = await fetch('/api/super-admin/billing/global-currency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: to,
          expected_currency: from,
          prices: rows.map((r) => ({
            plan_id: r.planId,
            cycle_id: r.cycleId,
            amount: totals[keyOf(r)] ?? '',
            per_day_amount: perDays[keyOf(r)] ?? null,
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          payload?.error ??
            `Could not change the Global currency (${res.status})`
        );
        setProblems(Array.isArray(payload?.problems) ? payload.problems : []);
        return;
      }
      onOpenChange(false);
      await onChanged();
    } catch {
      setError('Could not change the Global currency');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="bg-card text-card-foreground border-border max-h-[90vh] gap-5 overflow-y-auto rounded-2xl border p-6 shadow-2xl sm:max-w-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <DialogTitle className="text-foreground text-base leading-snug font-semibold">
              Change the Global currency from {from} to {to}?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
              Global prices are stored as plain numbers, so they are not
              converted for you. Enter the new price of every Global billing
              cycle in {to}. The prices and the currency are saved together in
              one step.
            </DialogDescription>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Dev and production share one database. Saving here changes the Global
          currency and prices for production customers immediately, even from a
          dev deployment.
        </div>

        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Every workspace without an enabled localized plan sees and pays
            these prices from its next page load. Existing AutoPay subscriptions
            keep the price and currency they were bought with, including
            renewals and invoices.
          </p>
          {landingOverride ? (
            <p>
              The landing page pricing section has its own display override (
              {landingOverride.currency ?? 'amounts only'}) set in CMS, Landing
              sections. It is not changed here.
            </p>
          ) : null}
          {clearsOverrides ? (
            <p>
              Daily rate overrides and compare-at prices in {from} are cleared.
              Enter a new daily rate if you want one.
            </p>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No Global price exists yet, so only the currency changes.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const k = keyOf(row);
              const label = globalPriceRowLabel(row, sold);
              const total = parseMoneyInput(totals[k] ?? '');
              const perDayInput = parseMoneyInput(perDays[k] ?? '');
              const preview =
                total !== null && total > 0
                  ? perDayAmount({
                      amount: total,
                      cycle: { duration_days: row.durationDays },
                      perDayOverride: perDayInput,
                    })
                  : null;
              const hidden = !row.cycleVisible || !row.priceVisible;
              return (
                <div
                  key={k}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {termOf(row)}
                    </span>
                    {hidden ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        Hidden
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-slate-500">
                      Now {formatPlanAmount(row.amount, from)}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`gc-total-${k}`}
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        New total ({to})
                      </label>
                      <Input
                        id={`gc-total-${k}`}
                        inputMode="decimal"
                        aria-required="true"
                        value={totals[k] ?? ''}
                        disabled={saving}
                        onChange={(e) =>
                          setTotals((prev) => ({
                            ...prev,
                            [k]: e.target.value,
                          }))
                        }
                        className="h-9 border-slate-200 bg-white text-slate-900"
                      />
                    </div>
                    {row.perDayAmount != null ? (
                      <div>
                        <label
                          htmlFor={`gc-perday-${k}`}
                          className="mb-1 block text-xs font-medium text-slate-600"
                        >
                          Daily rate shown ({to}, optional)
                        </label>
                        <Input
                          id={`gc-perday-${k}`}
                          inputMode="decimal"
                          value={perDays[k] ?? ''}
                          disabled={saving}
                          onChange={(e) =>
                            setPerDays((prev) => ({
                              ...prev,
                              [k]: e.target.value,
                            }))
                          }
                          className="h-9 border-slate-200 bg-white text-slate-900"
                        />
                      </div>
                    ) : null}
                  </div>
                  {total !== null && total > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {preview !== null
                        ? `${formatPlanAmount(preview, to)} / day = ${formatPlanAmount(total, to)}`
                        : formatPlanAmount(total, to)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="text-sm text-red-700">
              <p>{error}</p>
              {problems.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-row items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-lg px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !ready}
            className="rounded-lg px-4"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Change currency to {to}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
