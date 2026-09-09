'use client';

// ============================================================
// The "Auto Email" card on a single account's deep-dive page.
//
// Answers one question an operator asks constantly during a billing
// conversation: "what have we actually sent this customer, and did it
// arrive?" The global History tab can be filtered to the same rows, but
// arriving at it requires knowing the workspace name and leaving the page
// you were already on.
//
// Reads the same endpoint as that tab with `?accountId=`, rather than a
// bespoke one. A second query shape would be a second thing to keep in
// step, and the first time they disagreed this card would be the one
// quietly showing stale truth.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, MailX, Send } from 'lucide-react';

import { StatusPill } from '@/components/super-admin/auto-mail/history-panel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AutoEmailLogEntry } from '@/lib/auto-mail/types';

/** Most recent sends. The full list lives on the Auto Mail History tab. */
const VISIBLE = 10;

export function AccountAutoEmailCard({ accountId }: { accountId: string }) {
  const [entries, setEntries] = useState<AutoEmailLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/auto-mail/log?accountId=${encodeURIComponent(accountId)}&pageSize=${VISIBLE}`
      );
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setEntries(json.entries ?? []);
      setTotal(json.total ?? 0);
      setFailed(false);
    } catch {
      // Silent but visible: this card is supplementary to the page, so it
      // must not raise a toast over an account view, but an operator
      // reading "0 emails" needs to know whether that is a fact or a
      // failure to load.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
            <Send className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">Auto Email</h3>
            <p className="text-xs text-slate-500">
              Trial and renewal reminders sent to this workspace
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : total}
          </p>
          <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            {total === 1 ? 'email sent' : 'emails sent'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[#25D366]" />
        </div>
      ) : failed ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">
            Could not load the email history.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-sm font-medium text-[#25D366] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <MailX className="mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            No reminders sent yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Reminders are sent automatically as this workspace approaches the
            end of its trial or subscription.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="text-slate-500">Subject</TableHead>
                <TableHead className="text-slate-500">Stage</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead className="text-right text-slate-500">
                  Sent
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="border-slate-200 hover:bg-slate-50"
                >
                  <TableCell className="py-3">
                    <p className="max-w-[280px] truncate text-sm text-slate-800">
                      {entry.subject}
                    </p>
                    <p
                      className="max-w-[280px] truncate text-xs text-slate-400"
                      title={entry.recipient_email}
                    >
                      {entry.recipient_email}
                    </p>
                    {entry.error_detail ? (
                      <p
                        className="max-w-[280px] truncate text-xs text-red-500"
                        title={entry.error_detail}
                      >
                        {entry.error_detail}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500 capitalize">
                      {entry.segment} · {entry.offset_days}d
                    </span>
                    {entry.trigger === 'manual' ? (
                      <span
                        className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                        title="Sent by an admin, not the scheduler"
                      >
                        manual
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={entry.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-500">
                    {formatDistanceToNow(new Date(entry.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total > entries.length ? (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Showing the {entries.length} most recent of {total}. The full list
              is on Auto Mail → History.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
