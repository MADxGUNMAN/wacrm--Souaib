'use client';

// ============================================================
// Billing cycles tab.
//
// A cycle is load-bearing in a way a plan is not: `months` /
// `duration_days` decide how long an APPROVED PAYMENT grants access for.
// Get it wrong and a customer pays for a year and gets a day. So the form
// states the resolved duration in plain words, and the API rejects a
// cycle that resolves to nothing.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { describeCycleDuration } from '@/lib/subscription/plans';
import type { BillingCycle } from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

export function CyclesPanel() {
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillingCycle | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/billing/cycles');
      if (!res.ok) throw new Error('Failed to load billing cycles');
      const data = await res.json();
      setCycles(data.cycles ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (cycle: BillingCycle, body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/super-admin/billing/cycles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cycle.id, ...body }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload?.error ?? 'Could not update the cycle');
        return;
      }
      await load();
    } catch {
      setError('Could not update the cycle');
    }
  };

  const remove = async (cycle: BillingCycle) => {
    if (
      !window.confirm(
        `Delete the "${cycle.label}" cycle?\n\nIts prices are removed too. Existing subscriptions keep their access and payment history.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/super-admin/billing/cycles?id=${cycle.id}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not delete the cycle');
        return;
      }
      await load();
    } catch {
      setError('Could not delete the cycle');
    }
  };

  if (loading && cycles.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#25D366]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          These become the toggle on the upgrade page.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#20b958]"
        >
          <Plus className="h-4 w-4" />
          New cycle
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

      <div className="space-y-3">
        {cycles.map((cycle) => (
          <div
            key={cycle.id}
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm',
              cycle.is_visible ? 'border-slate-200' : 'border-dashed border-slate-300',
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{cycle.label}</h3>
                {cycle.is_recommended ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <Sparkles className="h-2.5 w-2.5" />
                    {cycle.recommended_label || 'Recommended'}
                  </span>
                ) : null}
                {cycle.is_default ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    <Star className="h-2.5 w-2.5" />
                    Default
                  </span>
                ) : null}
                {!cycle.is_visible ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    Hidden
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Grants <strong>{describeCycleDuration(cycle)}</strong> of access
                per payment
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!cycle.is_default ? (
                <button
                  type="button"
                  title="Make this the pre-selected cycle"
                  onClick={() => void patch(cycle, { is_default: true })}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:text-blue-600"
                >
                  <Star className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                title={cycle.is_visible ? 'Hide' : 'Show'}
                onClick={() => void patch(cycle, { is_visible: !cycle.is_visible })}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900"
              >
                {cycle.is_visible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditing(cycle)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:text-slate-900"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void remove(cycle)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing || creating ? (
        <CycleDialog
          cycle={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function CycleDialog({
  cycle,
  onClose,
  onSaved,
}: {
  cycle: BillingCycle | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [label, setLabel] = useState(cycle?.label ?? '');
  const [months, setMonths] = useState(String(cycle?.months ?? 1));
  const [durationDays, setDurationDays] = useState(
    cycle?.duration_days ? String(cycle.duration_days) : '',
  );
  const [isRecommended, setIsRecommended] = useState(
    cycle?.is_recommended ?? false,
  );
  const [recommendedLabel, setRecommendedLabel] = useState(
    cycle?.recommended_label ?? '',
  );
  const [isDefault, setIsDefault] = useState(cycle?.is_default ?? false);
  const [isVisible, setIsVisible] = useState(cycle?.is_visible ?? true);
  const [position, setPosition] = useState(String(cycle?.position ?? 0));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restate the resolved duration so the operator can't misread which
  // field wins. Days beats months server-side.
  const resolved = (() => {
    const d = Number(durationDays);
    if (Number.isFinite(d) && d > 0) {
      return `${d} day${d === 1 ? '' : 's'} (days override months)`;
    }
    const m = Number(months);
    if (Number.isFinite(m) && m > 0) return `${m} month${m === 1 ? '' : 's'}`;
    return null;
  })();

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      // The key is an internal identifier, not customer-facing copy, so
      // it is derived from the label rather than asked for. On an
      // existing cycle we keep the stored key untouched — changing it is
      // never something an operator needs, and the label is free to
      // change without disturbing it.
      const slug = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const derivedKey =
        cycle?.cycle_key ?? (slug || `cycle-${Date.now().toString(36)}`);

      const payload: Record<string, unknown> = {
        cycle_key: derivedKey,
        label,
        months: Number(months) || 0,
        duration_days: durationDays ? Number(durationDays) : null,
        is_recommended: isRecommended,
        // Default the badge text when the flag is switched on but no
        // wording was given, otherwise the card renders a flagged cycle
        // with no visible badge — the toggle would look broken.
        recommended_label: isRecommended
          ? recommendedLabel.trim() || 'Recommended'
          : recommendedLabel.trim() || null,
        is_default: isDefault,
        is_visible: isVisible,
        position: Number(position) || 0,
      };
      if (cycle) payload.id = cycle.id;

      const res = await fetch('/api/super-admin/billing/cycles', {
        method: cycle ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error ?? 'Could not save the cycle');
        return;
      }
      await onSaved();
    } catch {
      setError('Could not save the cycle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 z-[110] max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">
            {cycle ? `Edit ${cycle.label}` : 'New billing cycle'}
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
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Card title <span className="text-red-500">*</span>
            </p>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Monthly"
              className="border-slate-200 bg-white text-slate-900"
            />
            <p className="mt-1 text-xs text-slate-400">
              The heading customers see on this card, e.g. Monthly or Yearly.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Months</p>
              <Input
                type="number"
                min={0}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Or days <span className="text-slate-400">(override)</span>
              </p>
              <Input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="blank"
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>
          </div>

          <div
            className={cn(
              'rounded-lg border p-3',
              resolved ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50',
            )}
          >
            <p className="text-xs text-slate-500">An approved payment grants</p>
            <p
              className={cn(
                'mt-0.5 text-sm font-semibold',
                resolved ? 'text-slate-900' : 'text-red-700',
              )}
            >
              {resolved ?? 'nothing — set months or days'}
            </p>
          </div>

          {/* The savings pill on the card is derived automatically from
              the daily rates (see /upgrade-plan), so there is no manual
              discount field here. Recommended is the one badge an operator
              sets by hand. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={isRecommended}
                onChange={(e) => setIsRecommended(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#25D366]"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  Highlight this as the recommended term
                </span>
                <span className="block text-xs text-slate-500">
                  Lifts the card on the plan page and shows a badge.
                </span>
              </span>
            </label>
            {isRecommended ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  Badge text
                </p>
                <Input
                  value={recommendedLabel}
                  onChange={(e) => setRecommendedLabel(e.target.value)}
                  placeholder="Recommended"
                  className="border-slate-200 bg-white text-slate-900"
                />
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Position</p>
            <Input
              type="number"
              min={0}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="border-slate-200 bg-white text-slate-900"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Pre-selected</p>
              <p className="text-xs text-slate-500">
                Only one cycle can be the default.
              </p>
            </div>
            <Switch
              checked={isDefault}
              onCheckedChange={(v: boolean) => setIsDefault(v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Visible to customers</p>
            <Switch
              checked={isVisible}
              onCheckedChange={(v: boolean) => setIsVisible(v)}
            />
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
            {cycle ? 'Save changes' : 'Create cycle'}
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
