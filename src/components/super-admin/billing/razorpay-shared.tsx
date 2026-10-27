'use client';

// ============================================================
// Building blocks shared by the super-admin Razorpay panels.
//
// Both modes live in one database, so every row a panel renders carries
// its mode and test rows get an amber "Test" pill. A test row that looks
// like revenue is exactly the mistake this screen must not invite.
//
// Errors always show the server's own `error` text. "Failed to load"
// tells an operator nothing; "Razorpay could not complete the request
// (HTTP 400 BAD_REQUEST_ERROR: ...)" tells them what to do next.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Inbox,
  Info,
  RotateCcw,
  Search,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';
import type { AdminPaymentRow } from '@/lib/billing/razorpay/admin-db';
import { dashboardUrl } from '@/lib/billing/razorpay/admin-status';
import { chargeTypeLabel } from '@/lib/billing/razorpay/payment-details';
import { formatMoneyMinor } from '@/lib/billing/money-format';
import { formatBillingDate } from '@/lib/billing/razorpay/format';
import { cn } from '@/lib/utils';
import {
  methodLabel,
  statusMeta,
  TONE_BADGE_CLASS,
  type StatusDomain,
} from './billing-labels';

export type RazorpayMode = 'test' | 'live';

/**
 * The mode this server is set up for: undefined while the overview is
 * still loading, null when Razorpay is not configured here.
 */
export type RazorpayServerMode = RazorpayMode | null | undefined;

/** GET /api/super-admin/billing/razorpay/overview. */
export interface RazorpayOverviewResponse {
  configured: boolean;
  mode: RazorpayMode | null;
  overview: {
    subscriptions: Record<string, number>;
    trialing_with_autopay: Record<string, number>;
    upcoming_charges_7d: Record<string, number>;
    failures_7d: Record<string, number>;
    webhooks: Record<
      string,
      {
        last_received_at: string | null;
        failed: number;
        dead: number;
        anomalies: number;
      }
    >;
    last_runs: Record<
      string,
      {
        id: string;
        scope: string;
        status: string;
        checked: number;
        changed: number;
        error_count: number;
        started_at: string;
        finished_at: string | null;
        triggered_by: string | null;
      }
    >;
  };
}

/** The list envelope every /api/super-admin/billing/razorpay list returns. */
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'] as const;

export const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Both modes' },
  { value: 'live', label: 'Live only' },
  { value: 'test', label: 'Test only' },
];

// ------------------------------------------------------------
// Formatting
// ------------------------------------------------------------

/**
 * 99900 INR -> "₹999". Keeps paise only when there are some. Kept as a
 * name for existing callers; the body is the shared billing formatter.
 */
export function formatMinor(
  minor: number | null | undefined,
  currency: string | null | undefined
): string {
  return formatMoneyMinor(minor, currency);
}

/**
 * "6 Apr 2027" (or "6 Apr 2027, 10:30 am IST" with `time`), always in
 * IST, because Razorpay schedules charges on IST dates. "—" when empty.
 */
export function formatIst(
  value: string | Date | null | undefined,
  opts: { time?: boolean } = {}
): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  if (!opts.time) return formatBillingDate(d);
  return `${new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(d)} IST`;
}

/** "snake_case" -> "snake case", for statuses with no dedicated label. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

/**
 * "Visa •••• 4366" / "UPI te****@razorpay" from the stored method fields.
 * Says "Not known yet" rather than guessing when Razorpay has not told us.
 */
export function methodText(
  method: string | null | undefined,
  summary?: Record<string, unknown> | null
): string {
  const s = summary ?? {};
  const network = typeof s.network === 'string' ? s.network : null;
  const last4 = typeof s.last4 === 'string' ? s.last4 : null;
  const vpa = typeof s.vpa_masked === 'string' ? s.vpa_masked : null;
  const bank = typeof s.bank === 'string' ? s.bank : null;
  const m = method ?? (typeof s.method === 'string' ? s.method : null);
  if (m === 'card') {
    return [network ?? 'Card', last4 ? `•••• ${last4}` : null]
      .filter(Boolean)
      .join(' ');
  }
  if (m === 'upi') return vpa ? `UPI ${vpa}` : 'UPI';
  if (m === 'emandate' || m === 'nach') {
    return [m === 'nach' ? 'NACH' : 'eMandate', bank].filter(Boolean).join(' ');
  }
  return methodLabel(m);
}

/** Method of one stored payment (card, UPI, netbanking, wallet). */
export function adminPaymentMethodText(p: AdminPaymentRow): string {
  if (p.method === 'card') {
    return methodText('card', { network: p.cardNetwork, last4: p.cardLast4 });
  }
  if (p.method === 'upi') return methodText('upi', { vpa_masked: p.vpaMasked });
  if (p.method === 'netbanking')
    return p.bank ? `Netbanking ${p.bank}` : 'Netbanking';
  if (p.method === 'wallet') return p.wallet ? `Wallet ${p.wallet}` : 'Wallet';
  return methodText(p.method, { bank: p.bank });
}

/** "22 Oct 2026 to 17 Oct 2027" for the access a payment bought, or null. */
export function adminPaymentPeriodText(p: AdminPaymentRow): string | null {
  if (!p.grantedFrom || !p.grantedUntil) return null;
  return `${formatIst(p.grantedFrom)} to ${formatIst(p.grantedUntil)}`;
}

/**
 * Charge type, plan and billing cycle of one payment, stacked. Same rule
 * as the notes written onto the payment at Razorpay.
 */
export function PaymentChargeCell({
  payment: p,
}: {
  payment: AdminPaymentRow;
}) {
  const plan = [p.planName, p.cycleLabel].filter(Boolean).join(' · ');
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-slate-800">
        {chargeTypeLabel(p.chargeType)}
      </p>
      {plan ? <p className="text-[10px] text-slate-500">{plan}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------
// Badges
// ------------------------------------------------------------

export function ModeBadge({
  mode,
  className,
}: {
  mode: RazorpayMode | string;
  className?: string;
}) {
  const test = mode === 'test';
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto px-1.5 py-0.5 text-[10px] leading-none font-semibold',
        test
          ? 'border-amber-300 bg-amber-100 text-amber-800'
          : 'border-slate-200 bg-slate-100 text-slate-600',
        className
      )}
      title={test ? 'Razorpay test mode: no real money' : 'Razorpay live mode'}
    >
      {test ? 'Test' : 'Live'}
    </Badge>
  );
}

/**
 * Status in words from the shared label table; the colour only
 * reinforces the text. `domain` is required because the same raw value
 * means different things in different tables ("pending").
 */
export function StatusPill({
  domain,
  status,
  className,
}: {
  domain: StatusDomain;
  status: string | null | undefined;
  className?: string;
}) {
  const meta = statusMeta(domain, status);
  return (
    <Badge
      variant="outline"
      title={meta.hint}
      className={cn(
        'text-[10px] font-semibold',
        TONE_BADGE_CLASS[meta.tone],
        className
      )}
    >
      {meta.label}
    </Badge>
  );
}

// ------------------------------------------------------------
// Ids and links
// ------------------------------------------------------------

export function CopyId({
  value,
  label,
  className,
}: {
  value: string | null | undefined;
  /** What the id is, for the button's accessible name. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <code className="font-mono text-[11px] break-all text-slate-700">
        {value}
      </code>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
        aria-label={`Copy ${label ?? 'id'} ${value}`}
        title={copied ? 'Copied' : 'Copy'}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

// ------------------------------------------------------------
// Compact table cells (two short lines each, no horizontal scroll)
// ------------------------------------------------------------

/** Cell padding for the compact billing tables. */
export const COMPACT_CELL = 'px-2.5 py-2 align-top';

/** "6:37 pm IST" in India time, or "" when empty. */
export function istTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(d)} IST`;
}

/** "pay_TrMZzL…UVXQiF": start and end of a long id; full id on hover. */
export function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 9)}…${id.slice(-5)}` : id;
}

/** Date on the first line, IST time below it. */
export function DateTimeCell({
  value,
  empty = '—',
}: {
  value: string | null | undefined;
  empty?: string;
}) {
  if (!value) return <span className="text-xs text-slate-400">{empty}</span>;
  return (
    <>
      <p className="truncate text-xs font-medium text-slate-800 tabular-nums">
        {formatIst(value)}
      </p>
      <p className="truncate text-[11px] text-slate-500 tabular-nums">
        {istTime(value)}
      </p>
    </>
  );
}

/** Workspace name, with the owner email or the Test pill underneath. */
export function WorkspaceCell({
  name,
  email,
  mode,
}: {
  name: string | null | undefined;
  email?: string | null;
  mode?: RazorpayMode | string | null;
}) {
  return (
    <>
      <p
        className="truncate text-xs font-semibold text-slate-800"
        title={name ?? undefined}
      >
        {name ?? 'Deleted workspace'}
      </p>
      {email ? (
        <p className="truncate text-[11px] text-slate-500" title={email}>
          {email}
        </p>
      ) : null}
      {mode === 'test' ? <ModeBadge mode="test" className="mt-1" /> : null}
    </>
  );
}

/**
 * A long provider id in a narrow column: a small label, the shortened id,
 * a copy button (copies the full id) and an optional open-link icon.
 */
export function IdCell({
  label,
  value,
  what,
  href,
  hrefTitle,
}: {
  label: string;
  value: string | null | undefined;
  /** What the id is, for the copy button's accessible name. */
  what: string;
  href?: string | null;
  hrefTitle?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
        <code
          className="min-w-0 truncate font-mono text-[11px] text-slate-700"
          title={value}
        >
          {shortId(value)}
        </code>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard
              ?.writeText(value)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => undefined);
          }}
          aria-label={`Copy ${what} ${value}`}
          title={copied ? 'Copied' : `Copy ${what}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${hrefTitle ?? 'Open'}: ${value} (opens in a new tab)`}
            title={hrefTitle ?? 'Open'}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Small (i) button that reveals an explanation: hover or focus shows it,
 * click or tap pins it open (works on touch screens).
 */
export function InfoHint({
  title,
  children,
  label,
  side = 'top',
}: {
  /** Bold first line of the popover. */
  title?: string;
  children: React.ReactNode;
  /** Accessible name of the button. */
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        closeDelay={100}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors outline-none hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 data-[popup-open]:text-slate-700"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-72 gap-1 p-3 text-xs leading-relaxed"
      >
        {title ? <p className="font-semibold text-slate-900">{title}</p> : null}
        <div className="space-y-1 text-slate-600">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Razorpay Dashboard link for a subscription or payment id. */
export function razorpayDashboardHref(
  kind: 'subscription' | 'payment',
  id: string | null | undefined
) {
  return id ? dashboardUrl(kind, id) : null;
}

/** Razorpay Dashboard link for a payment id (for IdCell's `href`). */
export function razorpayPaymentHref(id: string | null | undefined) {
  return id ? dashboardUrl('payment', id) : null;
}

export function RazorpayLink({
  kind,
  id,
  className,
}: {
  kind: 'subscription' | 'payment';
  id: string | null | undefined;
  className?: string;
}) {
  if (!id) return null;
  return (
    <a
      href={dashboardUrl(kind, id)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Open ${id} in Razorpay (opens in a new tab)`}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline',
        className
      )}
    >
      Open in Razorpay
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// ------------------------------------------------------------
// Fetching
// ------------------------------------------------------------

/**
 * The message to show for a failed request: the server's `error` text,
 * a plain rate-limit sentence for 429, and the status code when the
 * server said nothing useful.
 */
export function errorMessage(status: number, data: unknown): string {
  const body = (data ?? {}) as Record<string, unknown>;
  if (status === 429) {
    const secs = Number(body.retry_after_seconds);
    return Number.isFinite(secs) && secs > 0
      ? `Too many attempts. Try again in ${secs} seconds.`
      : 'Too many attempts. Try again in a few minutes.';
  }
  if (typeof body.error === 'string' && body.error.trim()) {
    return status >= 500 ? `${body.error} (HTTP ${status})` : body.error;
  }
  return `The request failed (HTTP ${status}).`;
}

export type PostResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null; message: string };

/** JSON POST that never throws; failures carry the server's wording. */
export async function postJson<T>(
  url: string,
  body?: unknown
): Promise<PostResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code =
        typeof (data as Record<string, unknown>).code === 'string'
          ? ((data as Record<string, unknown>).code as string)
          : null;
      return {
        ok: false,
        status: res.status,
        code,
        message: errorMessage(res.status, data),
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return {
      ok: false,
      status: 0,
      code: null,
      message: 'Could not reach the server. Check your connection.',
    };
  }
}

/** GET a JSON document; `reload()` fetches again. */
export function useAdminJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!url) return;
      setLoading(true);
      try {
        const res = await fetch(url, { signal, cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (signal.aborted) return;
        if (!res.ok) {
          setError(errorMessage(res.status, body));
          return;
        }
        setData(body as T);
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        setError(
          err instanceof Error && err.name !== 'AbortError'
            ? `Could not reach the server: ${err.message}`
            : 'Could not reach the server.'
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    // `nonce` is a dependency on purpose: bumping it re-runs the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, nonce]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * A paged admin list. Empty / null / 'all' params are dropped from the
 * query string so the server's defaults apply.
 */
export function useAdminList<T>(
  url: string,
  params: Record<string, string | number | null | undefined>
) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (value === 'all') continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return useAdminJson<ListResponse<T>>(query ? `${url}?${query}` : url);
}

/** `value`, settled for `ms` (for search boxes). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

// ------------------------------------------------------------
// Filters, table states and pagination
// ------------------------------------------------------------

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full sm:w-[300px]">
      <Search
        className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full border-slate-200 bg-white pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-1"
      />
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  groups,
  width = 'w-[150px]',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Ungrouped options, listed first (for example "All events"). */
  options: { value: string; label: string; count?: number | null }[];
  /** Labelled groups listed after `options` (Base UI Select groups). */
  groups?: { label: string; options: { value: string; label: string }[] }[];
  width?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (typeof v === 'string' && v) onChange(v);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          'h-9 border-slate-200 bg-white text-xs text-slate-900',
          width
        )}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.count !== undefined && o.count !== null ? (
              <span className="inline-flex min-w-[20px] items-center justify-center rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-700 tabular-nums">
                {o.count.toLocaleString('en-IN')}
              </span>
            ) : null}
            <span>{o.label}</span>
          </SelectItem>
        ))}
        {groups?.map((g) => (
          <SelectGroup key={g.label}>
            <SelectLabel className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              {g.label}
            </SelectLabel>
            {g.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Placeholder rows while a list loads for the first time, so the table
 * keeps its shape instead of collapsing to a spinner.
 */
export function TableSkeletonRows({
  cols,
  rows = 5,
}: {
  cols: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow
          key={r}
          className="border-b border-slate-100 hover:bg-transparent"
          aria-hidden
        >
          {Array.from({ length: cols }, (_, c) => (
            <TableCell key={c} className="px-3 py-3">
              <div
                className={cn(
                  'h-3 animate-pulse rounded bg-slate-100',
                  c === 0 ? 'w-40' : c % 2 ? 'w-24' : 'w-16'
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        'sticky top-0 z-20 h-8 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-600 uppercase shadow-xs',
        className
      )}
    >
      {children}
    </TableHead>
  );
}

/** Loading / error / empty row for a table body. Null when rows exist. */
export function TableStateRow({
  colSpan,
  loading,
  error,
  empty,
  emptyText,
  emptyHint,
  onReset,
}: {
  colSpan: number;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  emptyHint?: string;
  /** Shows a "Reset filters" action in the empty state. */
  onReset?: () => void;
}) {
  if (error) {
    return (
      <TableRow className="border-slate-200">
        <TableCell colSpan={colSpan} className="h-24 text-center">
          <p
            role="alert"
            className="mx-auto inline-flex max-w-xl items-start gap-2 text-left text-xs text-red-600"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        </TableCell>
      </TableRow>
    );
  }
  if (loading && empty) {
    // Skeleton rows keep the table's shape on first load; the hidden
    // status line is what a screen reader announces.
    return (
      <>
        <TableRow className="border-0 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="sr-only p-0">
            <span role="status">Loading…</span>
          </TableCell>
        </TableRow>
        <TableSkeletonRows cols={Math.min(colSpan, 12)} />
      </>
    );
  }
  if (empty) {
    return (
      <TableRow className="border-slate-200">
        <TableCell colSpan={colSpan} className="h-24 whitespace-normal">
          <EmptyState
            title={emptyText}
            hint={emptyHint}
            action={
              onReset ? (
                <Button variant="outline" size="sm" onClick={onReset}>
                  <RotateCcw aria-hidden />
                  Reset filters
                </Button>
              ) : null
            }
          />
        </TableCell>
      </TableRow>
    );
  }
  return null;
}

export function ListPagination({
  page,
  pageSize,
  total,
  totalPages,
  loading,
  noun,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading: boolean;
  /** Plural noun for "Showing 1–20 of 40 {noun}". */
  noun: string;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const pages = Math.max(1, totalPages);
  return (
    <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-2 sm:flex-row">
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, total)} of {total} {noun}
        </span>
        <span className="text-slate-300" aria-hidden>
          |
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              if (v) onPageSize(Number(v));
            }}
          >
            <SelectTrigger
              aria-label="Rows per page"
              className="h-7 w-[68px] border-slate-200 bg-white px-2 py-0 text-xs font-medium text-slate-900"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-xs text-slate-900">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-600">
          Page {page} of {pages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1 || loading}
            onClick={() => onPage(Math.max(1, page - 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pages || loading}
            onClick={() => onPage(Math.min(pages, page + 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The bordered card every list sits in (same frame as the payment queue). */
export function ListFrame({
  toolbar,
  children,
  footer,
  className,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
        className
      )}
    >
      {toolbar ? (
        <div className="flex flex-col gap-2.5 border-b border-slate-100 p-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          {toolbar}
        </div>
      ) : null}
      <div className="flex-1 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
        {children}
      </div>
      {footer}
    </div>
  );
}

/** "Page reset to 1 whenever a filter changes" for list panels. */
export function usePagedFilters<F extends Record<string, string>>(
  initial: F,
  /** Starting values that differ from the reset target (a link preset). */
  start?: Partial<F>
) {
  // The first value is the reset target; later renders pass a fresh
  // object literal, so it is captured once.
  const [initialFilters] = useState<F>(initial);
  const [filters, setFilters] = useState<F>(() => ({ ...initial, ...start }));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const setFilter = useCallback((key: keyof F, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);
  const dirty = useMemo(
    () =>
      Object.keys(initialFilters).some(
        (k) => filters[k as keyof F] !== initialFilters[k as keyof F]
      ),
    [filters, initialFilters]
  );
  const reset = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, [initialFilters]);
  return {
    filters,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    dirty,
    reset,
  };
}

/** Height of the tall lists, below the two tab bars. */
export const LIST_HEIGHT = 'h-[calc(100vh-13rem)] min-h-[420px]';

/**
 * One toolbar row on large screens: heading and search on the left,
 * filters on the right, then "Reset filters" while any filter is set,
 * then actions. Stacks on small screens.
 */
export function FilterToolbar({
  heading,
  search,
  middle,
  filters,
  actions,
  active,
  onReset,
}: {
  heading?: React.ReactNode;
  search?: React.ReactNode;
  middle?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  active: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
      {heading || search ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {heading}
          {search ? (
            <div className="w-full shrink-0 sm:w-[260px] lg:w-[280px] [&>div]:w-full">
              {search}
            </div>
          ) : null}
        </div>
      ) : null}
      {middle ? (
        <div className="flex max-w-full items-center overflow-x-auto py-0.5">
          {middle}
        </div>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {filters}
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs text-slate-600"
          >
            <RotateCcw aria-hidden />
            Reset filters
          </Button>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

/** Centred "nothing here" block for tables and cards. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center',
        className
      )}
    >
      <span className="text-slate-300" aria-hidden>
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="text-xs font-medium text-slate-500">{title}</p>
      {hint ? (
        <p className="max-w-md text-[11px] text-slate-400">{hint}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Shown above Razorpay lists when this server has no Razorpay keys
 * (production today). The lists still load from the shared database.
 */
export function RazorpayNotConfiguredNotice({
  onOpenManual,
}: {
  onOpenManual: () => void;
}) {
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700 sm:flex-row sm:items-start sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <span>
          Razorpay is not set up on this server. These lists show billing
          records already stored in the shared database, for reference. Sync
          now, Cancel AutoPay, Retry and Run reconciliation are unavailable
          here. Manual UPI payments are reviewed in the Manual UPI section.
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenManual}
        className="shrink-0 bg-white text-xs"
      >
        Open Manual UPI
      </Button>
    </div>
  );
}
