'use client';

// ============================================================
// Global (Universal) header on /super-admin/plans (shown for Global only).
//
// Same look as the country header (region-header.tsx), with a Currency
// input and Save but no enable switch and no "Copy from Global": Global is
// always on, because it is the fallback for every workspace. Save checks
// the currency against this deployment first, then opens the change
// dialog, which requires the new price of every Global billing cycle.
// Report: docs/razopay/localized-pricing-report.md, section 12.
// ============================================================

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Globe,
  Info,
  Loader2,
  Save,
} from 'lucide-react';

import {
  checkGlobalCurrencyChange,
  globalCurrencyRefusal,
  type GlobalCurrencyContext,
  type GlobalPriceRow,
} from '@/lib/billing/pricing/global-currency';
import { GLOBAL_REGION_LABEL } from '@/lib/billing/pricing/regions';
import type { ManualIntake } from '@/lib/billing/razorpay/provider';

import { CurrencySelect } from './currency-select';
import {
  GlobalCurrencyDialog,
  type LandingOverride,
} from './global-currency-dialog';

interface GlobalCurrencyInfo {
  currency: string;
  paymentProvider: string | null;
  manualIntake: ManualIntake;
  razorpay: {
    configured: boolean;
    mode: 'test' | 'live' | null;
    chargeCurrencies: string[];
  };
  allowedCurrencies: string[];
  prices: GlobalPriceRow[];
  landingOverride: LandingOverride | null;
}

function contextOf(info: GlobalCurrencyInfo): GlobalCurrencyContext {
  return {
    ctx: {
      razorpayConfigured: info.razorpay.configured,
      chargeCurrencies: new Set(info.razorpay.chargeCurrencies),
    },
    settingsProvider: info.paymentProvider,
    manualIntake: info.manualIntake,
  };
}

export function GlobalRegionHeader({
  onChanged,
}: {
  /** Reload region status and the tabs below. */
  onChanged: () => void | Promise<void>;
}) {
  const [info, setInfo] = useState<GlobalCurrencyInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/super-admin/billing/global-currency');
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            payload?.error ??
              `Could not load the Global currency (${res.status})`
          );
          return;
        }
        setInfo(payload as GlobalCurrencyInfo);
        setCurrency((payload as GlobalCurrencyInfo).currency);
      } catch {
        if (!cancelled) setLoadError('Could not load the Global currency');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stored = info?.currency ?? '';
  const upper = currency.trim().toUpperCase();

  const save = () => {
    if (!info) return;
    setError(null);
    const refusal = checkGlobalCurrencyChange({
      current: stored,
      next: upper,
      ...contextOf(info),
    });
    if (refusal) {
      setError(refusal.message);
      return;
    }
    setDialogOpen(true);
  };

  // Why only INR is offered here, in the words the server would use.
  const inrOnlyReason =
    info && info.allowedCurrencies.length === 1
      ? globalCurrencyRefusal(
          info.razorpay.chargeCurrencies.find((c) => c !== 'INR') ?? 'USD',
          contextOf(info)
        )?.message
      : null;
  const storedNotChargeable =
    info && stored && stored !== 'INR'
      ? globalCurrencyRefusal(stored, contextOf(info))
      : null;

  return (
    <section
      aria-label="Global (Universal) pricing"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Globe className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {GLOBAL_REGION_LABEL}
            </h2>
            <p className="text-xs text-slate-500">
              The fallback plan for every country without an enabled localized
              plan.{stored ? ` Currency: ${stored}.` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {info ? (
            <div className="flex items-end gap-2">
              <div>
                <label
                  htmlFor="global-currency"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Currency
                </label>
                <CurrencySelect
                  id="global-currency"
                  value={currency}
                  disabled={dialogOpen}
                  onChange={(code) => {
                    setError(null);
                    setCurrency(code);
                  }}
                  allowed={[...info.allowedCurrencies, stored]}
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={dialogOpen || !upper || upper === stored}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          ) : loadError ? null : (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading currency
            </span>
          )}
        </div>
      </div>

      {inrOnlyReason ? (
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Only INR can be used for Global on this deployment. {inrOnlyReason}
        </p>
      ) : null}

      {storedNotChargeable ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            {stored} cannot be charged on this deployment:{' '}
            {storedNotChargeable.message} Workspaces served by this deployment
            cannot pay until this is fixed or Global is changed back to INR.
          </p>
        </div>
      ) : null}

      {loadError || error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{loadError ?? error}</p>
        </div>
      ) : null}

      {info && dialogOpen ? (
        <GlobalCurrencyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          from={stored}
          to={upper}
          rows={info.prices}
          landingOverride={info.landingOverride}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  );
}
