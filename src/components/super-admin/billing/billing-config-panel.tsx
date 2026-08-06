'use client';

// ============================================================
// Page & UPI settings tab.
//
// Two kinds of field live here and they carry very different risk:
//
//   Operational (upi_id, trial_days, grace_days, is_enabled) — a mistake
//   has real consequences: money to the wrong VPA, or every customer
//   locked out. These get validation, explicit warnings, and the UPI ID
//   is called out as required before payments work at all.
//
//   Copy — cosmetic. Grouped separately so a wording tweak never sits
//   next to the field that decides where money goes.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Loader2,
  Save,
  Wallet,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { isValidUpiId } from '@/lib/subscription/upi';
import type { SubscriptionSettings } from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

/** Copy fields, grouped for the form. `multiline` picks a textarea. */
const COPY_GROUPS: {
  title: string;
  description: string;
  fields: {
    key: keyof SubscriptionSettings;
    label: string;
    hint?: string;
    multiline?: boolean;
  }[];
}[] = [
  {
    title: 'Upgrade page',
    description: 'The plan chooser customers see at /upgrade-plan.',
    fields: [
      { key: 'page_heading', label: 'Heading' },
      { key: 'page_subheading', label: 'Sub-heading', multiline: true },
      { key: 'cycle_hint', label: 'Hint under the cycle toggle' },
      { key: 'selected_plan_label', label: '“Selected Plan” label' },
      { key: 'total_label', label: '“Total” label' },
      { key: 'save_label', label: '“Save” label' },
      { key: 'equals_label', label: '“Equals” label' },
      { key: 'continue_label', label: 'Continue button' },
    ],
  },
  {
    title: 'Payment page',
    description: 'The QR and submission screen.',
    fields: [
      { key: 'payment_heading', label: 'Heading' },
      {
        key: 'payment_instructions',
        label: 'Instructions',
        hint: 'Shown above the QR code.',
        multiline: true,
      },
      { key: 'submit_button_label', label: 'Submit button' },
      {
        key: 'pending_review_message',
        label: 'Under-review message',
        multiline: true,
      },
      { key: 'support_note', label: 'Support note', multiline: true },
    ],
  },
  {
    title: 'Trial & expiry',
    description: 'The in-app banner and the billing tab.',
    fields: [
      {
        key: 'trial_banner_template',
        label: 'Trial banner',
        hint: 'Use {days} where the remaining day count should appear.',
      },
      { key: 'trial_banner_cta', label: 'Banner button' },
      { key: 'free_plan_label', label: 'Free plan label' },
      { key: 'free_plan_subtitle', label: 'Free plan subtitle' },
      { key: 'expired_heading', label: 'Expired heading' },
    ],
  },
  {
    title: 'Member blocked screen',
    description:
      'Shown to non-owners when the workspace lapses. Placeholders: {account_name}, {owner_name}, {owner_email}, {plan_name}, {expired_on}.',
    fields: [
      { key: 'member_blocked_heading', label: 'Heading' },
      { key: 'member_blocked_body', label: 'Body', multiline: true },
      { key: 'member_blocked_note', label: 'Reassurance note', multiline: true },
      { key: 'member_blocked_contact_label', label: 'Contact button' },
    ],
  },
];

export function BillingConfigPanel() {
  const [settings, setSettings] = useState<Partial<SubscriptionSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/billing/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      setSettings(data.settings ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof SubscriptionSettings>(
    key: K,
    value: SubscriptionSettings[K],
  ) => {
    setSettings((prev) => ({ ...(prev ?? {}), [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setErrorField(null);

    try {
      // Strip the columns the API doesn't accept. It whitelists fields
      // anyway, so these would be ignored — dropping them keeps the
      // request honest about what it's actually changing.
      const payload: Record<string, unknown> = {
        ...(settings as Record<string, unknown>),
      };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      const res = await fetch('/api/super-admin/billing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error ?? 'Could not save settings');
        setErrorField(body?.field ?? null);
        return;
      }

      setSettings(body.settings ?? settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
      </div>
    );
  }

  const upiId = (settings?.upi_id ?? '') as string;
  const upiLooksWrong = upiId.length > 0 && !isValidUpiId(upiId);

  return (
    <div className="space-y-5 pb-24">
      {/* ---- Payments (operational) ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#25D366]" />
          <h3 className="font-semibold text-slate-900">UPI payments</h3>
        </div>

        {!upiId ? (
          // The single blocking config step. Without a UPI ID the payment
          // page deliberately 503s rather than generating a QR that pays
          // nobody, so say so plainly.
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              No UPI ID is set, so customers cannot pay yet — the payment page
              shows “Payment unavailable” instead of generating a QR code. Add
              your UPI ID below to switch payments on.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              UPI ID (VPA) <span className="text-red-500">*</span>
            </p>
            <Input
              value={upiId}
              onChange={(e) => set('upi_id', e.target.value)}
              placeholder="business@okhdfcbank"
              className={cn(
                'bg-white font-mono text-slate-900',
                upiLooksWrong || errorField === 'upi_id'
                  ? 'border-red-300'
                  : 'border-slate-200',
              )}
            />
            {upiLooksWrong ? (
              <p className="mt-1 text-xs text-red-600">
                Expected the form name@bank. Every generated QR pays this
                address, so double-check it.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                Every QR code pays this address.
              </p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Payee name</p>
            <Input
              value={(settings?.upi_payee_name ?? '') as string}
              onChange={(e) => set('upi_payee_name', e.target.value)}
              placeholder="Your Business Name"
              className="border-slate-200 bg-white text-slate-900"
            />
            <p className="mt-1 text-xs text-slate-400">
              Shown in the customer&apos;s UPI app.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Currency</p>
            <Input
              value={(settings?.currency ?? 'INR') as string}
              onChange={(e) => set('currency', e.target.value.toUpperCase())}
              maxLength={3}
              className={cn(
                'bg-white text-slate-900',
                errorField === 'currency' ? 'border-red-300' : 'border-slate-200',
              )}
            />
            <p className="mt-1 text-xs text-slate-400">
              3-letter code. UPI settles INR only.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Trial & enforcement (operational) ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">Trial &amp; enforcement</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Free trial length (days)
            </p>
            <Input
              type="number"
              min={0}
              value={String(settings?.trial_days ?? 14)}
              onChange={(e) => set('trial_days', Number(e.target.value))}
              className={cn(
                'bg-white text-slate-900',
                errorField === 'trial_days' ? 'border-red-300' : 'border-slate-200',
              )}
            />
            <p className="mt-1 text-xs text-slate-400">
              Applies to new signups only — existing trials keep their dates.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Grace period (days)
            </p>
            <Input
              type="number"
              min={0}
              value={String(settings?.grace_days ?? 0)}
              onChange={(e) => set('grace_days', Number(e.target.value))}
              className={cn(
                'bg-white text-slate-900',
                errorField === 'grace_days' ? 'border-red-300' : 'border-slate-200',
              )}
            />
            <p className="mt-1 text-xs text-slate-400">
              Extra access after the end date before blocking. 0 blocks
              immediately.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <div>
            <p className="text-sm font-medium text-slate-800">
              Enforce subscriptions
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Turning this off removes every gate: no trial banner and no
              redirect to the upgrade page. Takes up to a minute to propagate.
            </p>
          </div>
          <Switch
            checked={Boolean(settings?.is_enabled ?? true)}
            onCheckedChange={(v: boolean) => set('is_enabled', v)}
          />
        </div>

        <div className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <div>
            <p className="text-sm font-medium text-slate-800">
              Show owner contact to blocked members
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              When off, the owner&apos;s name and email are withheld from the
              member-blocked screen.
            </p>
          </div>
          <Switch
            checked={Boolean(settings?.member_blocked_show_owner_contact ?? true)}
            onCheckedChange={(v: boolean) =>
              set('member_blocked_show_owner_contact', v)
            }
          />
        </div>
      </section>

      {/* ---- Copy ---- */}
      {COPY_GROUPS.map((group) => (
        <section
          key={group.title}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="font-semibold text-slate-900">{group.title}</h3>
          <p className="mt-0.5 mb-4 text-xs text-slate-500">{group.description}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              const value = (settings?.[field.key] ?? '') as string;
              const invalid = errorField === field.key;

              return (
                <div
                  key={String(field.key)}
                  className={field.multiline ? 'sm:col-span-2' : undefined}
                >
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    {field.label}
                  </p>
                  {field.multiline ? (
                    <textarea
                      rows={2}
                      value={value}
                      onChange={(e) =>
                        set(
                          field.key,
                          e.target.value as SubscriptionSettings[typeof field.key],
                        )
                      }
                      className={cn(
                        'w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-[#25D366] focus:outline-none',
                        invalid ? 'border-red-300' : 'border-slate-200',
                      )}
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) =>
                        set(
                          field.key,
                          e.target.value as SubscriptionSettings[typeof field.key],
                        )
                      }
                      className={cn(
                        'bg-white text-slate-900',
                        invalid ? 'border-red-300' : 'border-slate-200',
                      )}
                    />
                  )}
                  {field.hint ? (
                    <p className="mt-1 text-xs text-slate-400">{field.hint}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* ---- Sticky save ---- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            {error ? (
              <p className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : saved ? (
              <p className="flex items-center gap-1.5 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Saved — live immediately
              </p>
            ) : (
              <p className="truncate text-sm text-slate-400">
                Changes apply to the next page load. No deploy needed.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#20b958] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
