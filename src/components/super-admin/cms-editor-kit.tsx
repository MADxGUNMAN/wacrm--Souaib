'use client';

// Small form building blocks shared by the CMS page editors
// (Integrations → AI connector / Google Sheets, Global Settings copy).

import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function EditorCard({
  title,
  description,
  icon,
  actions,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {icon}
            {title}
          </h2>
          {description ? (
            <p className="text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

/** Single-line or multi-line text field bound to a string. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  rows,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  /** Render a textarea with this many rows. */
  rows?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {rows ? (
        <Textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-slate-500 hover:text-slate-900"
    >
      <RotateCcw className="mr-1 h-4 w-4" /> Reset to default
    </Button>
  );
}

export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus className="mr-1 h-4 w-4" /> {label}
    </Button>
  );
}

export function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 text-slate-400 hover:text-red-600"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function IconSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Icon"
      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-xs"
    >
      {!options.includes(value) && (
        <option value={value}>{value || 'Choose icon'}</option>
      )}
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/** Editable list of plain strings (examples, safeguards, highlights). */
export function StringList({
  items,
  onChange,
  multiline,
  itemLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  multiline?: boolean;
  itemLabel: string;
}) {
  const set = (idx: number, val: string) =>
    onChange(items.map((x, i) => (i === idx ? val : x)));
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              rows={2}
              value={item}
              onChange={(e) => set(idx, e.target.value)}
              aria-label={`${itemLabel} ${idx + 1}`}
              className="bg-white"
            />
          ) : (
            <Input
              value={item}
              onChange={(e) => set(idx, e.target.value)}
              aria-label={`${itemLabel} ${idx + 1}`}
              className="bg-white"
            />
          )}
          <RemoveButton
            label={`Remove ${itemLabel.toLowerCase()} ${idx + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
          />
        </div>
      ))}
    </div>
  );
}
