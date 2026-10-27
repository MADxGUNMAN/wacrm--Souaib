'use client';

// Settings → Login & security → Logged-in devices.
// Every device currently signed in to the caller's own account, with a
// per-device Logout and "Log out all other devices".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { browserTimezone } from '@/lib/security/client';
import {
  dash,
  formatCountry,
  formatEventTime,
  formatRelative,
} from '@/lib/security/format';
import type { DeviceSession } from '@/lib/security/types';
import { EmptyRow, IpSearch, Pager, TableShell, Td, Th } from './table-kit';

const COLUMNS = 10;

export function DevicesTable() {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Re-render relative times without refetching.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const tz = browserTimezone();
      const res = await fetch(
        `/api/security/sessions${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load devices');
      setSessions(data.sessions as DeviceSession[]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = sessions ?? [];
    return q ? list.filter((s) => (s.ip ?? '').includes(q)) : list;
  }, [sessions, search]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const others = (sessions ?? []).filter((s) => !s.is_current).length;

  const logout = async (s: DeviceSession) => {
    const ok = await confirm({
      title: s.is_current ? 'Log out of this device?' : 'Log out this device?',
      description: s.is_current
        ? 'You will be signed out here and taken to the login page.'
        : `${dash(s.browser)} on ${dash(s.platform)} (${dash(s.ip)}) will be signed out. It will need your password to sign in again.`,
      confirmText: 'Logout',
      variant: 'destructive',
      icon: LogOut,
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/security/sessions/${s.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not log out device');
      if (data.was_current) {
        await createClient()
          .auth.signOut({ scope: 'local' })
          .catch(() => {});
        window.location.replace('/login');
        return;
      }
      toast.success('Device logged out');
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? prev);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const logoutOthers = async () => {
    const ok = await confirm({
      title: 'Log out all other devices?',
      description: `${others} other ${others === 1 ? 'device' : 'devices'} will be signed out. This device stays signed in.`,
      confirmText: 'Log out others',
      variant: 'destructive',
      icon: ShieldOff,
    });
    if (!ok) return;
    setRevokingOthers(true);
    try {
      const res = await fetch('/api/security/sessions/revoke-others', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not log out devices');
      toast.success(
        data.revoked
          ? `Logged out ${data.revoked} ${data.revoked === 1 ? 'device' : 'devices'}`
          : 'No other devices were signed in'
      );
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRevokingOthers(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-foreground text-base font-semibold">
            Logged-in devices
          </h3>
          <p className="text-muted-foreground text-xs">
            Devices signed in to your account right now. Only you can see this
            list.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            aria-label="Refresh devices"
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={others === 0 || revokingOthers}
            onClick={logoutOthers}
          >
            {revokingOthers ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldOff className="size-4" />
            )}
            Log out all other devices
          </Button>
        </div>
      </div>

      <TableShell
        toolbar={
          <IpSearch
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        }
        footer={
          <Pager
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        }
      >
        <caption className="sr-only">Logged-in devices</caption>
        <thead className="bg-muted/40">
          <tr>
            <Th>SL</Th>
            <Th>Last active</Th>
            <Th>First activity</Th>
            <Th>IP</Th>
            <Th>Country</Th>
            <Th>Platform</Th>
            <Th>Device</Th>
            <Th>Browser</Th>
            <Th>Timezone</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sessions === null && !error ? (
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
          ) : pageRows.length === 0 ? (
            <EmptyRow colSpan={COLUMNS}>
              {search ? 'No devices match that IP.' : 'No devices found.'}
            </EmptyRow>
          ) : (
            pageRows.map((s, i) => (
              <tr
                key={s.id}
                className={
                  s.is_current
                    ? 'bg-emerald-500/[0.07] dark:bg-emerald-500/[0.12]'
                    : undefined
                }
              >
                <Td className="font-semibold">
                  {(page - 1) * pageSize + i + 1}
                </Td>
                <Td>
                  {s.is_current ||
                  formatRelative(s.last_active_at) === 'Active now' ? (
                    <span className="inline-flex items-center justify-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Active now
                    </span>
                  ) : (
                    <span
                      title={formatEventTime(s.last_active_at)}
                      className="text-muted-foreground font-medium"
                    >
                      {formatRelative(s.last_active_at)}
                    </span>
                  )}
                </Td>
                <Td className="text-muted-foreground font-mono text-[11px]">
                  {formatEventTime(s.first_activity_at)}
                </Td>
                <Td className="font-mono text-xs">{dash(s.ip)}</Td>
                <Td title={formatCountry(s.country_name, s.country_code)}>
                  {s.country_name || s.country_code || '—'}
                </Td>
                <Td>{dash(s.platform)}</Td>
                <Td>{dash(s.device_type)}</Td>
                <Td>
                  <span
                    title={
                      s.browser_version
                        ? `${s.browser} ${s.browser_version}`
                        : undefined
                    }
                  >
                    {dash(s.browser)}
                  </span>
                </Td>
                <Td className="text-muted-foreground font-mono text-[11px]">
                  {dash(s.timezone)}
                </Td>
                <Td>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => void logout(s)}
                    aria-label={`Log out ${s.is_current ? 'this device' : `device ${dash(s.ip)}`}`}
                    className="h-7 border-red-300 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    {busyId === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      'Logout'
                    )}
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      <p className="text-muted-foreground text-xs">
        Times are shown in your local time. Country comes from the device&apos;s
        timezone or network location, so it is approximate.
      </p>
    </div>
  );
}
