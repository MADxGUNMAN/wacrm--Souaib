'use client';

// ============================================================
// Country header on /super-admin/plans (shown for a country only).
//
// Currency, the "Enable localized plan" switch and "Copy from Global".
// Enabling is validated on the server (/api/super-admin/billing/regions)
// and every reason it was refused is listed here verbatim, including
// Razorpay's own wording, so the admin knows exactly what to fix.
// ============================================================

import { useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  Save,
} from 'lucide-react';

import { useConfirm } from '@/components/ui/confirm-dialog';
import { CountryFlag } from '@/components/ui/phone-input';
import { Switch } from '@/components/ui/switch';
import { findCountryByCode } from '@/lib/phone/countries';
import { regionLabel } from '@/lib/billing/pricing/regions';

import { CurrencySelect } from './currency-select';
import { regionStatusOf, type RegionSummary } from './region-selector';

export interface RazorpayDeployment {
  configured: boolean;
  mode: 'test' | 'live' | null;
  chargeCurrencies: string[];
}

export function RegionHeader({
  code,
  summary,
  razorpay,
  onChanged,
}: {
  code: string;
  summary: RegionSummary | undefined;
  razorpay: RazorpayDeployment | null;
  /** Reload region status and the tabs below. */
  onChanged: () => void | Promise<void>;
}) {
  const confirm = useConfirm();
  const country = findCountryByCode(code);
  const name = country?.name ?? code;
  const enabled = summary?.is_enabled ?? false;
  const storedCurrency = summary?.currency ?? '';
  const status = regionStatusOf(summary);

  const [currency, setCurrency] = useState(storedCurrency);
  const [busy, setBusy] = useState<null | 'currency' | 'enable' | 'copy'>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/super-admin/billing/regions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ...body }),
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  };

  const saveCurrency = async () => {
    setBusy('currency');
    setError(null);
    setProblems([]);
    try {
      const { res, payload } = await put({ currency: currency.trim() });
      if (!res.ok) {
        setError(
          payload?.error ?? `Could not save the currency (${res.status})`
        );
        return;
      }
      await onChanged();
    } catch {
      setError('Could not save the currency');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (next: boolean) => {
    setBusy('enable');
    setError(null);
    setProblems([]);
    try {
      const { res, payload } = await put({ is_enabled: next });
      if (!res.ok) {
        setError(
          payload?.error ??
            `Could not update the localized plan (${res.status})`
        );
        setProblems(Array.isArray(payload?.problems) ? payload.problems : []);
        return;
      }
      await onChanged();
    } catch {
      setError('Could not update the localized plan');
    } finally {
      setBusy(null);
    }
  };

  const copyFromGlobal = async () => {
    const ok = await confirm({
      title: `Copy the Global setup to ${name}?`,
      description:
        'This copies the Global billing cycles and page wording. Prices are not copied: you enter them in this country’s currency. The plan stays disabled.',
      confirmText: 'Copy from Global',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    setBusy('copy');
    setError(null);
    try {
      const res = await fetch('/api/super-admin/billing/regions/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          payload?.error ?? `Could not copy from Global (${res.status})`
        );
        return;
      }
      await onChanged();
    } catch {
      setError('Could not copy from Global');
    } finally {
      setBusy(null);
    }
  };

  const upper = currency.trim().toUpperCase();
  const notChargeableHere =
    Boolean(storedCurrency) &&
    storedCurrency !== 'INR' &&
    !(
      razorpay?.configured && razorpay.chargeCurrencies.includes(storedCurrency)
    );

  return (
    <section
      aria-label={`Localized plan for ${name}`}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <CountryFlag
            countryCode={code}
            countryName={name}
            fallbackEmoji={country?.flag}
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {regionLabel(code)}
            </h2>
            <p className="text-xs text-slate-500">
              {status === 'live'
                ? 'Enabled. Customers whose workspace owner has this dialing code see these prices.'
                : status === 'warning'
                  ? 'Enabled, but customers here still see the Global plan (see below).'
                  : `Customers in ${name} see the Global plan until this is enabled.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-end gap-2">
            <div>
              <label
                htmlFor={`region-currency-${code}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Currency
              </label>
              <CurrencySelect
                id={`region-currency-${code}`}
                value={currency}
                disabled={enabled || busy !== null}
                onChange={setCurrency}
              />
            </div>
            {!enabled ? (
              <button
                type="button"
                onClick={() => void saveCurrency()}
                disabled={busy !== null || !upper || upper === storedCurrency}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'currency' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            ) : null}
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
            <Switch
              checked={enabled}
              disabled={busy !== null}
              onCheckedChange={(v: boolean) => void toggle(v)}
              aria-label="Enable localized plan"
            />
            Enable localized plan
            {busy === 'enable' ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : null}
          </label>

          {summary?.cycle_count ? null : (
            <button
              type="button"
              onClick={() => void copyFromGlobal()}
              disabled={busy !== null}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'copy' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy from Global
            </button>
          )}
        </div>
      </div>

      {enabled ? (
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Disable the localized plan to change its currency. Existing AutoPay
          subscriptions keep their price and currency either way.
        </p>
      ) : null}

      {notChargeableHere ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            {razorpay?.configured
              ? `${storedCurrency} cannot be charged on this deployment yet. Razorpay must activate International payments, and ${storedCurrency} must be added to RAZORPAY_CHARGE_CURRENCIES. Until then customers here see the Global plan.`
              : `Razorpay is not configured on this deployment, and manual UPI accepts INR only, so ${storedCurrency} cannot be charged here. Customers here see the Global plan.`}
          </p>
        </div>
      ) : null}

      {status === 'warning' && summary?.problems.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-amber-800">
            {summary.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
    </section>
  );
}
