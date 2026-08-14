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

import { FeatureRows } from '@/components/super-admin/billing/feature-rows';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  CUSTOM_CARD_SETTING_KEYS,
  normalisePlanFeatures,
} from '@/lib/subscription/plans';
import { isValidUpiId } from '@/lib/subscription/upi';
import type {
  PlanFeature,
  PlansBundle,
  SubscriptionSettings,
} from '@/lib/subscription/types';
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
  /** Appends the shared feature-line editor under this group's fields. */
  withFeatureList?: boolean;
}[] = [
  {
    title: 'Upgrade page',
    description:
      'The plan chooser customers see at /upgrade-plan. Each card is a billing term; the daily rate is the headline. The Custom card is edited under Plans & Pricing.',
    fields: [
      { key: 'page_heading', label: 'Heading' },
      { key: 'page_subheading', label: 'Sub-heading', multiline: true },
      {
        key: 'per_day_label',
        label: 'Per-day suffix',
        hint: 'Sits beside the big daily figure, e.g. “/ day”.',
      },
      {
        key: 'price_equals_template',
        label: 'Total line under the price',
        hint: 'Use {total} and {days}, e.g. “= {total} for {days} days”.',
      },
      { key: 'selected_plan_label', label: '“Selected plan” label' },
      { key: 'total_label', label: '“Total” label' },
      { key: 'save_label', label: '“Save” label' },
      { key: 'continue_label', label: 'Continue button' },
    ],
  },
  {
    title: 'Shared feature list',
    description:
      'One list below the cards. Every paid term includes all of it, so it is written once rather than per card.',
    fields: [
      { key: 'features_heading', label: 'Heading' },
      { key: 'features_subheading', label: 'Sub-heading', multiline: true },
    ],
    // The lines themselves are a repeatable JSONB list on the plan row,
    // not a settings column, so they need their own editor and their own
    // save. Rendered inside this group anyway: an operator writing the
    // heading is writing the list it introduces, and splitting them
    // across two tabs is what made this hard to find before.
    withFeatureList: true,
  },
  // The Custom card used to be edited here. It moved to Plans & Pricing:
  // its bullet list is a repeatable JSONB list, which this flat field map
  // cannot express, and two editors writing the same columns meant
  // whichever tab saved last quietly reverted the other.
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

/**
 * The feature lines shown once under the pricing cards.
 *
 * These live on `subscription_plans.features`, not on the settings row, so
 * this has its own fetch and its own save rather than riding along with
 * the settings form below. Mixing them would mean one Save button writing
 * to two tables, where a failure on the second leaves the first applied
 * with no way to tell from the UI.
 *
 * Targets the same plan /upgrade-plan sells: first visible, by position.
 */
function SharedFeatureList() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/super-admin/billing/plans');
        if (!res.ok) throw new Error('Failed to load the feature list');
        const bundle = (await res.json()) as PlansBundle;
        if (cancelled) return;

        const plan =
          bundle.plans
            .filter((p) => p.is_visible)
            .sort((a, b) => a.position - b.position)[0] ?? null;

        setPlanId(plan?.id ?? null);
        setFeatures(plan ? normalisePlanFeatures(plan.features) : []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!planId) return;
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/super-admin/billing/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: planId,
          features: features.filter((f) => f.label.trim()),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Could not save the feature list');
        setState('idle');
        return;
      }
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setError('Could not save the feature list');
      setState('idle');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading feature lines…
      </div>
    );
  }

  if (!planId) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        No visible plan exists, so there is no feature list to edit.
      </p>
    );
  }

  return (
    <>
      <FeatureRows
        label="Feature lines"
        hint="Shown once under the cards. Use the star to bold a line."
        placeholder="e.g. Unlimited marketing messages"
        features={features}
        onChange={(next) => {
          setFeatures(next);
          setState('idle');
        }}
      />

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={state === 'saving'}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#20b958] disabled:opacity-60"
        >
          {state === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save feature list
        </button>
        {state === 'saved' ? (
          <p className="flex items-center gap-1.5 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Saved — live immediately
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            Saved separately from the settings below.
          </p>
        )}
      </div>
    </>
  );
}

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

      // The Custom card is owned by the Plans & Pricing tab. This panel
      // loads the whole settings row, so without this it would echo back
      // whatever those columns held when the tab opened — reverting an
      // edit made there in the meantime. Not sending them at all makes
      // the boundary real rather than a convention.
      for (const key of CUSTOM_CARD_SETTING_KEYS) delete payload[key];

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

          {group.withFeatureList ? (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <SharedFeatureList />
            </div>
          ) : null}
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
