'use client';

// Settings → Login & security → Login activity.
// The caller's own sign-ins, sign-outs, device revokes, failed logins,
// password and API token changes — newest first, server-side paging.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dash, formatCountry, formatEventTime } from '@/lib/security/format';
import {
  SECURITY_EVENT_LABELS,
  SECURITY_EVENT_TYPES,
  type Paged,
  type SecurityEventRow,
  type SecurityEventType,
} from '@/lib/security/types';
import { EmptyRow, IpSearch, Pager, TableShell, Td, Th } from './table-kit';

const COLUMNS = 9;
const SEARCH_DEBOUNCE_MS = 350;

const EVENT_TONE: Partial<Record<SecurityEventType, string>> = {
  login: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
  logout: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
  logout_all: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
  session_revoked: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
  sessions_revoked_others: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
  login_failed: 'text-red-700 bg-red-500/15 dark:text-red-400',
  password_changed: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
  email_change_requested: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
  api_key_created: 'text-violet-700 bg-violet-500/10 dark:text-violet-400',
  api_key_revoked: 'text-violet-700 bg-violet-500/10 dark:text-violet-400',
  two_factor_enabled:
    'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
  two_factor_disabled: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
  two_factor_verified:
    'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
  two_factor_failed: 'text-red-700 bg-red-500/15 dark:text-red-400',
  two_factor_recovery_used:
    'text-amber-700 bg-amber-500/10 dark:text-amber-400',
  recovery_codes_regenerated: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
  owner_verification_enabled: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
  owner_verification_disabled:
    'text-amber-700 bg-amber-500/10 dark:text-amber-400',
  owner_code_used: 'text-blue-700 bg-blue-500/10 dark:text-blue-400',
};

function eventDetail(e: SecurityEventRow): string | null {
  // The revoked device's IP is only worth showing when it differs from the
  // IP column (the device that did the revoking); otherwise it's a repeat.
  if (e.target_ip) return e.target_ip !== e.ip ? `from ${e.target_ip}` : null;
  const m = e.metadata ?? {};
  if (typeof m.name === 'string' && m.name) return m.name;
  if (typeof m.member === 'string' && m.member) return `by ${m.member}`;
  if (e.event_type === 'two_factor_verified' && m.method === 'owner') {
    return "owner's code";
  }
  if (typeof m.count === 'number' && m.count > 0) {
    return `${m.count} ${m.count === 1 ? 'device' : 'devices'}`;
  }
  return null;
}

export function LoginActivityTable() {
  const [data, setData] = useState<Paged<SecurityEventRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [ip, setIp] = useState('');
  const [type, setType] = useState<SecurityEventType | ''>('');

  // Debounce the IP search so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => {
      setIp(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (ip) params.set('ip', ip);
      if (type) params.set('type', type);
      const res = await fetch(`/api/security/activity?${params}`, {
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load activity');
      setData(body as Paged<SecurityEventRow>);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, ip, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-foreground text-base font-semibold">
            Login activity
          </h3>
          <p className="text-muted-foreground text-xs">
            Sign-ins, sign-outs and security changes on your account, kept for
            12 months. Only you can see this log.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh activity"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <TableShell
        toolbar={
          <>
            <IpSearch value={search} onChange={setSearch} />
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as SecurityEventType | '');
                setPage(1);
              }}
              aria-label="Filter by event"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">All events</option>
              {SECURITY_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SECURITY_EVENT_LABELS[t]}
                </option>
              ))}
            </select>
          </>
        }
        footer={
          <Pager
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        }
      >
        <caption className="sr-only">Login activity</caption>
        <thead className="bg-muted/40">
          <tr>
            <Th>SL</Th>
            <Th>Time</Th>
            <Th>Event</Th>
            <Th>IP</Th>
            <Th>Country</Th>
            <Th>Platform</Th>
            <Th>Device</Th>
            <Th>Browser</Th>
            <Th>Timezone</Th>
          </tr>
        </thead>
        <tbody className={cn('divide-y', loading && data && 'opacity-60')}>
          {data === null && !error ? (
            <EmptyRow colSpan={COLUMNS}>
              <Loader2 className="mx-auto size-5 animate-spin" />
            </EmptyRow>
          ) : error ? (
            <EmptyRow colSpan={COLUMNS}>
              {error}{' '}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => void load()}
              >
                Try again
              </button>
            </EmptyRow>
          ) : rows.length === 0 ? (
            <EmptyRow colSpan={COLUMNS}>
              {ip || type
                ? 'No activity matches these filters.'
                : 'No activity yet.'}
            </EmptyRow>
          ) : (
            rows.map((e, i) => {
              const detail = eventDetail(e);
              return (
                <tr key={e.id}>
                  <Td className="font-semibold">
                    {(page - 1) * pageSize + i + 1}
                  </Td>
                  <Td className="text-muted-foreground font-mono text-[11px]">
                    {formatEventTime(e.created_at)}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium',
                        EVENT_TONE[e.event_type]
                      )}
                    >
                      {SECURITY_EVENT_LABELS[e.event_type] ?? e.event_type}
                    </span>
                    {detail ? (
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {detail}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-mono text-xs">{dash(e.ip)}</Td>
                  <Td title={formatCountry(e.country_name, e.country_code)}>
                    {e.country_name || e.country_code || '—'}
                  </Td>
                  <Td>{dash(e.platform)}</Td>
                  <Td>{dash(e.device_type)}</Td>
                  <Td>{dash(e.browser)}</Td>
                  <Td className="text-muted-foreground font-mono text-[11px]">
                    {dash(e.timezone)}
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
