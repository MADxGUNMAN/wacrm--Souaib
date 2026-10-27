'use client';

// ============================================================
// Currency dropdown for the region headers on /super-admin/plans.
//
// Replaces a native <input list> + <datalist>: browsers filter a datalist
// by the text already in the box, so with "USD" selected the list only
// ever offered USD. This always lists every currency.
//
// `allowed` (optional) marks the currencies this deployment can charge;
// the rest stay visible but disabled, so the admin sees why. A stored
// value missing from CURRENCIES is still listed, so it never vanishes.
// ============================================================

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCIES } from '@/lib/currency';

export function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
  allowed,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Currencies that can be chosen; others are shown disabled. */
  allowed?: readonly string[];
}) {
  const options =
    CURRENCIES.some((c) => c.code === value) || !value
      ? CURRENCIES
      : [{ code: value, label: value, symbol: '' }, ...CURRENCIES];
  const allowedSet = allowed ? new Set(allowed) : null;

  return (
    <Select
      value={value || null}
      onValueChange={(v) => {
        if (typeof v === 'string' && v) onChange(v);
      }}
      disabled={disabled}
      items={options.map((c) => ({ value: c.code, label: c.code }))}
    >
      <SelectTrigger
        id={id}
        aria-label="Currency"
        className="h-9 w-28 border-slate-200 bg-white font-mono text-slate-900"
      >
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        className="max-h-72 min-w-56"
      >
        {options.map((c) => {
          const blocked = allowedSet ? !allowedSet.has(c.code) : false;
          return (
            <SelectItem key={c.code} value={c.code} disabled={blocked}>
              <span className="w-10 font-mono font-medium text-slate-900">
                {c.code}
              </span>
              <span className="text-slate-500">
                {c.label}
                {blocked ? ' (not enabled)' : ''}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
