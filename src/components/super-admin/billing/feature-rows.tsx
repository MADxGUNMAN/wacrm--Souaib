'use client';

// ============================================================
// A repeatable bullet-list editor for `PlanFeature[]` JSONB.
//
// Lives in its own file because two unrelated panels store that exact
// shape: the shared feature list (on subscription_plans.features) and the
// Custom card's bullets (on subscription_settings.custom_plan_features).
// Two copies of these rows would be two places to fix the next time the
// shape gains a field.
// ============================================================

import { Plus, Star, Trash2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { PlanFeature } from '@/lib/subscription/types';
import { cn } from '@/lib/utils';

export function FeatureRows({
  label,
  hint,
  placeholder,
  features,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  features: PlanFeature[];
  onChange: (next: PlanFeature[]) => void;
}) {
  const update = (i: number, patch: Partial<PlanFeature>) =>
    onChange(features.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600">{label}</p>
          {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onChange([...features, { label: '' }])}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#25D366] hover:underline"
        >
          <Plus className="h-3 w-3" />
          Add line
        </button>
      </div>

      {features.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400">
          No lines yet — the list is hidden on the page until you add one.
        </p>
      ) : (
        <div className="space-y-2">
          {features.map((feature, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={feature.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder={placeholder}
                className="h-9 border-slate-200 bg-white text-sm text-slate-900"
              />
              {/* Emphasis renders the line in bold — for a lead-in like
                  "Everything in the standard plan". */}
              <button
                type="button"
                title="Show this line in bold"
                onClick={() => update(i, { emphasis: !feature.emphasis })}
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
                title="Remove this line"
                onClick={() => onChange(features.filter((_, idx) => idx !== i))}
                className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-red-400 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
