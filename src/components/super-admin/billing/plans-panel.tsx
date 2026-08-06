'use client';

// ============================================================
// Plans tab — plan cards and the price matrix.
//
// The matrix is the important part: one editable cell per (plan × cycle).
// Whatever is saved here is what `resolveQuote` reads on the next quote,
// so editing a cell changes the very next UPI QR generated. There is no
// cache to bust and no publish step — which is exactly the requirement,
// but it also means a typo is live immediately. Hence: cells save on
// blur (not per keystroke), show an explicit saved/failed state, and
// revert on failure so the UI never shows a price the DB rejected.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  normalisePlanFeatures,
  toAmount,
  visibleCycles,
} from '@/lib/subscription/plans';
import type {
  BillingCycle,
  PlanFeature,
  PlansBundle,
  SubscriptionPlan,
  SubscriptionPlanPrice,
} from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

export function PlansPanel() {
  const [bundle, setBundle] = useState<PlansBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/billing/plans');
      if (!res.ok) throw new Error('Failed to load plans');
      setBundle((await res.json()) as PlansBundle);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePlanField = async (
    plan: SubscriptionPlan,
    patch: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch('/api/super-admin/billing/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, ...patch }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Could not update the plan');
        return;
      }
      await load();
    } catch {
      setError('Could not update the plan');
    }
  };

  const deletePlan = async (plan: SubscriptionPlan, force = false) => {
    try {
      const res = await fetch(
        `/api/super-admin/billing/plans?id=${plan.id}${force ? '&force=true' : ''}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && body?.code === 'plan_in_use') {
        // Accounts are still on this plan. Their access and payment
        // history survive (FK is ON DELETE SET NULL + name snapshots), but
        // the operator should confirm knowingly.
        if (window.confirm(`${body.error}\n\nDelete anyway?`)) {
          await deletePlan(plan, true);
        }
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? 'Could not delete the plan');
        return;
      }
      await load();
    } catch {
      setError('Could not delete the plan');
    }
  };

  if (loading && !bundle) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
      </div>
    );
  }

  const cycles = bundle ? visibleCycles(bundle.cycles) : [];
  // Hidden cycles still need a column, otherwise their prices become
  // uneditable once hidden — an easy way to lose data silently.
  const allCycles = bundle
    ? [...bundle.cycles].sort((a, b) => a.position - b.position)
    : [];
  const plans = bundle
    ? [...bundle.plans].sort((a, b) => a.position - b.position)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {plans.length} plan{plans.length === 1 ? '' : 's'} ·{' '}
          {cycles.length} visible cycle{cycles.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#20b958]"
        >
          <Plus className="h-4 w-4" />
          New plan
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {allCycles.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No billing cycles exist yet. Add at least one on the{' '}
            <strong>Billing cycles</strong> tab — without one there is nothing to
            price and customers cannot buy anything.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'rounded-xl border bg-white shadow-sm',
              plan.is_visible ? 'border-slate-200' : 'border-dashed border-slate-300',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <GripVertical className="h-4 w-4 text-slate-300" />
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  {plan.is_highlighted && plan.highlight_label ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#25D366]/12 px-2 py-0.5 text-[11px] font-semibold text-[#1a9e4b]">
                      <Star className="h-2.5 w-2.5" />
                      {plan.highlight_label}
                    </span>
                  ) : null}
                  {!plan.is_visible ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      <EyeOff className="h-2.5 w-2.5" />
                      Hidden
                    </span>
                  ) : null}
                </div>
                {plan.tagline ? (
                  <p className="mt-1 ml-6 text-sm text-slate-500">{plan.tagline}</p>
                ) : null}
                <p className="mt-1 ml-6 text-xs text-slate-400">
                  {normalisePlanFeatures(plan.features).length} features · position{' '}
                  {plan.position}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title={plan.is_visible ? 'Hide from customers' : 'Show to customers'}
                  onClick={() =>
                    void togglePlanField(plan, { is_visible: !plan.is_visible })
                  }
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900"
                >
                  {plan.is_visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(plan)}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete the "${plan.name}" plan?`)) {
                      void deletePlan(plan);
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ---- Price matrix row ---- */}
            <div className="p-5">
              <p className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Prices ({bundle?.settings.currency ?? 'INR'})
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allCycles.map((cycle) => (
                  <PriceCell
                    key={`${plan.id}-${cycle.id}`}
                    plan={plan}
                    cycle={cycle}
                    price={
                      bundle?.prices.find(
                        (p) => p.plan_id === plan.id && p.cycle_id === cycle.id,
                      ) ?? null
                    }
                    onSaved={load}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <PlanDialog
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {creating ? (
        <PlanDialog
          plan={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------

function PriceCell({
  plan,
  cycle,
  price,
  onSaved,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  price: SubscriptionPlanPrice | null;
  onSaved: () => void | Promise<void>;
}) {
  const initial = price ? String(toAmount(price.amount)) : '';
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Re-sync when the parent reloads (another cell's save refetches all).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === initial.trim()) return;

    setState('saving');
    setMessage(null);

    try {
      // Empty means "not sold on this cycle" — delete rather than store 0,
      // which would generate a ₹0 UPI intent.
      if (!trimmed) {
        if (!price) {
          setState('idle');
          return;
        }
        const res = await fetch(
          `/api/super-admin/billing/prices?planId=${plan.id}&cycleId=${cycle.id}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error('Could not remove the price');
      } else {
        const res = await fetch('/api/super-admin/billing/prices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: plan.id,
            cycle_id: cycle.id,
            amount: trimmed,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'Could not save the price');
      }

      setState('saved');
      setTimeout(() => setState('idle'), 1600);
      await onSaved();
    } catch (err) {
      // Revert so the field never displays a value the DB refused.
      setValue(initial);
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Could not save');
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        cycle.is_visible ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50/50',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-600">
          {cycle.label}
          {!cycle.is_visible ? (
            <span className="ml-1 text-slate-400">(hidden)</span>
          ) : null}
        </span>
        {state === 'saving' ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
        ) : state === 'saved' ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : state === 'error' ? (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        ) : null}
      </div>
      <Input
        inputMode="decimal"
        value={value}
        placeholder="Not sold"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="h-9 border-slate-200 bg-white text-sm text-slate-900"
      />
      {message ? <p className="mt-1 text-[11px] text-red-600">{message}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------

function PlanDialog({
  plan,
  onClose,
  onSaved,
}: {
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(plan?.name ?? '');
  const [tagline, setTagline] = useState(plan?.tagline ?? '');
  const [isHighlighted, setIsHighlighted] = useState(plan?.is_highlighted ?? false);
  const [highlightLabel, setHighlightLabel] = useState(
    plan?.highlight_label ?? 'Most popular',
  );
  const [isVisible, setIsVisible] = useState(plan?.is_visible ?? true);
  const [position, setPosition] = useState(String(plan?.position ?? 0));
  const [features, setFeatures] = useState<PlanFeature[]>(
    plan ? normalisePlanFeatures(plan.features) : [{ label: '' }],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name,
        tagline: tagline || null,
        is_highlighted: isHighlighted,
        highlight_label: isHighlighted ? highlightLabel || null : null,
        is_visible: isVisible,
        position: Number(position) || 0,
        features: features.filter((f) => f.label.trim()),
      };
      if (plan) payload.id = plan.id;

      const res = await fetch('/api/super-admin/billing/plans', {
        method: plan ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error ?? 'Could not save the plan');
        return;
      }
      await onSaved();
    } catch {
      setError('Could not save the plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 z-[110] max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">
            {plan ? `Edit ${plan.name}` : 'New plan'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Plan name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pro"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>

          <Field label="Tagline">
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="One line under the plan name"
              className="border-slate-200 bg-white text-slate-900"
            />
          </Field>

          {/* Features */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">Features</p>
              <button
                type="button"
                onClick={() => setFeatures((f) => [...f, { label: '' }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#25D366] hover:underline"
              >
                <Plus className="h-3 w-3" />
                Add feature
              </button>
            </div>
            <div className="space-y-2">
              {features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={feature.label}
                    onChange={(e) =>
                      setFeatures((prev) =>
                        prev.map((f, idx) =>
                          idx === i ? { ...f, label: e.target.value } : f,
                        ),
                      )
                    }
                    placeholder="e.g. 50,000 Marketing Messages/month"
                    className="h-9 border-slate-200 bg-white text-sm text-slate-900"
                  />
                  {/* Emphasis = the bold "All Growth Features +" lead-in. */}
                  <button
                    type="button"
                    title="Show in bold (for an 'All X Features +' line)"
                    onClick={() =>
                      setFeatures((prev) =>
                        prev.map((f, idx) =>
                          idx === i ? { ...f, emphasis: !f.emphasis } : f,
                        ),
                      )
                    }
                    className={cn(
                      'shrink-0 rounded-lg border p-2 transition-colors',
                      feature.emphasis
                        ? 'border-[#25D366] bg-[#25D366]/10 text-[#1a9e4b]'
                        : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700',
                    )}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFeatures((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-red-400 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Highlight this plan</p>
              <p className="text-xs text-slate-500">
                Adds a badge and a coloured border on the pricing page.
              </p>
            </div>
            <Switch
              checked={isHighlighted}
              onCheckedChange={(v: boolean) => setIsHighlighted(v)}
            />
          </div>

          {isHighlighted ? (
            <Field label="Badge label">
              <Input
                value={highlightLabel}
                onChange={(e) => setHighlightLabel(e.target.value)}
                placeholder="Most popular"
                className="border-slate-200 bg-white text-slate-900"
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <Input
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </Field>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5">
                <span className="text-sm font-medium text-slate-800">Visible</span>
                <Switch
                  checked={isVisible}
                  onCheckedChange={(v: boolean) => setIsVisible(v)}
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#20b958] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {plan ? 'Save changes' : 'Create plan'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </p>
      {children}
    </div>
  );
}
