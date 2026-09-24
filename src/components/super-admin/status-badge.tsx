'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { FactTone } from '@/lib/super-admin/whatsapp-connection';

// ============================================================
// The super-admin area's status vocabulary, in one place.
//
// Until now every pill here was inline Tailwind, copied and adjusted per use
// site, which is why the same "live state" idea appeared in four slightly
// different shapes on one page. `src/components/ui/badge.tsx` exists but has no
// tone for "warning" or "danger" and carries dark-mode variants the
// super-admin shell does not use, so it fits the dashboard rather than here.
//
// The house rule this encodes, taken from the existing markup:
//   border-<colour>/20..30 + bg-<colour>/10..20 + text-<colour>
//   rounded-full for live state, rounded for uppercase classification
// ============================================================

/**
 * Tone → classes. Deliberately literal strings rather than composed from a
 * colour name, so Tailwind's scanner can see every class it must emit.
 */
const TONE_CLASSES: Record<FactTone, string> = {
  good: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  danger: 'border-red-500/25 bg-red-500/10 text-red-600',
  info: 'border-blue-500/25 bg-blue-500/10 text-blue-700',
  neutral: 'border-slate-200 bg-slate-100 text-slate-600',
};

/** Dot colour, for the pill shape. */
const DOT_CLASSES: Record<FactTone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-slate-400',
};

export function StatusBadge({
  tone = 'neutral',
  children,
  icon,
  /** Show the leading state dot. Off when an icon is supplied. */
  dot = false,
  className,
  title,
}: {
  tone?: FactTone;
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon ??
        (dot ? (
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              DOT_CLASSES[tone]
            )}
          />
        ) : null)}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * One labelled fact: a caption, a badge, and optionally the reason underneath.
 *
 * The `detail` line is what makes this card usable by someone who is not a
 * WhatsApp specialist — "Coexistence" means nothing on its own, and the
 * operator should not have to remember what it implies.
 */
export function FactRow({
  label,
  tone = 'neutral',
  value,
  detail,
  icon,
}: {
  label: string;
  tone?: FactTone;
  value: ReactNode;
  detail?: string | null;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        {detail ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            {detail}
          </p>
        ) : null}
      </div>
      <StatusBadge tone={tone} icon={icon} dot={!icon} className="shrink-0">
        {value}
      </StatusBadge>
    </div>
  );
}

/** A small uppercase classification tag, for things that are not live state. */
export function MetaTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase',
        className
      )}
    >
      {children}
    </span>
  );
}

/** A copyable identifier field, e.g. Phone ID / WABA ID. */
export function IdField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 text-[10px] tracking-wider text-slate-500 uppercase">
        {label}
      </div>
      <div
        className="truncate font-mono text-xs text-slate-600"
        title={value ?? undefined}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}
