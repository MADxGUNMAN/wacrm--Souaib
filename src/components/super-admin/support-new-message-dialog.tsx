'use client';

// ============================================================
// "New message" — pick any workspace and open a thread with it.
//
// Lists EVERY workspace, not only those with a conversation, because the
// point is reaching a customer who has never written in. Each row says up
// front what sending will do:
//
//   Has access        — they can already see Live chat
//   Gets access       — the rule leaves them out; your first message will
//                       give them access automatically
//   Blocked           — you blocked them; your first message will unblock
//                       them (the settings page records why)
//   Live chat is off  — nothing can be sent until it is switched back on
//
// Picking a row does not send or grant anything. Access changes only when
// a message is actually sent, so browsing this list is side-effect free.
// ============================================================

import { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  Search,
  Smartphone,
  Sparkles,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { SupportAccessRow } from '@/lib/support-chat/availability';
import { cn } from '@/lib/utils';

export function SupportNewMessageDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (row: SupportAccessRow) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<SupportAccessRow[]>([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '50' });
        if (debounced) params.set('search', debounced);
        const res = await fetch(
          `/api/super-admin/support-chat/access?${params}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Could not load.');
        setRows(data.rows);
        setChatEnabled(data.settings?.enabled !== false);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearch('');
      }}
    >
      <DialogContent className="max-w-lg border-slate-200 bg-white p-0 text-slate-900">
        <DialogHeader className="border-b border-slate-100 px-5 pt-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <MessageSquarePlus className="h-4 w-4 text-[#159947]" />
            New message
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Choose a workspace to message. If they can&rsquo;t see Live chat
            yet, your first message gives them access.
          </DialogDescription>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspace, owner or email"
              className="pl-8"
              aria-label="Search workspaces"
            />
          </div>
        </DialogHeader>

        {!chatEnabled ? (
          <p className="mx-5 mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Live chat is turned off for everyone. Turn it on in Live chat
            settings before messaging a workspace.
          </p>
        ) : null}

        <div className="max-h-[55vh] overflow-y-auto px-2 py-2">
          {loading && rows.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <p className="p-4 text-center text-sm text-red-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">
              No workspace matches.
            </p>
          ) : (
            rows.map((row) => (
              <PickerRow
                key={row.accountId}
                row={row}
                chatEnabled={chatEnabled}
                onPick={() => {
                  onPick(row);
                  onOpenChange(false);
                  setSearch('');
                }}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerRow({
  row,
  chatEnabled,
  onPick,
}: {
  row: SupportAccessRow;
  chatEnabled: boolean;
  onPick: () => void;
}) {
  const name =
    row.accountName || row.owner?.full_name || row.owner?.email || 'Workspace';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  const badge = !chatEnabled
    ? {
        label: 'Live chat is off',
        icon: Ban,
        cls: 'bg-slate-100 text-slate-500',
      }
    : row.access.available
      ? {
          label: 'Has access',
          icon: CheckCircle2,
          cls: 'bg-green-50 text-green-700',
        }
      : row.override?.mode === 'deny'
        ? {
            label: 'Blocked — will be unblocked',
            icon: Ban,
            cls: 'bg-amber-50 text-amber-700',
          }
        : {
            label: 'Gets access when you send',
            icon: Sparkles,
            cls: 'bg-blue-50 text-blue-700',
          };
  const BadgeIcon = badge.icon;

  return (
    <button
      type="button"
      onClick={onPick}
      // Still pickable while the chat is off, so the operator can read an
      // existing thread; sending is what the server refuses.
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
    >
      <Avatar className="size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
        {row.owner?.avatar_url ? (
          <AvatarImage
            src={row.owner.avatar_url}
            alt={name}
            className="size-full object-cover"
          />
        ) : null}
        <AvatarFallback className="bg-[#25D366]/15 text-xs font-semibold text-[#159947]">
          {initial}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="flex items-center gap-2 truncate text-xs text-slate-500">
          <span className="truncate">
            {row.owner?.email ?? 'No owner email'}
          </span>
          {row.whatsappConnected ? (
            <Smartphone
              className="h-3 w-3 shrink-0 text-[#159947]"
              aria-label="WhatsApp connected"
            />
          ) : null}
          {row.conversationId ? (
            <span className="shrink-0 text-slate-400">· has a thread</span>
          ) : null}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          badge.cls
        )}
      >
        <BadgeIcon className="h-3 w-3" />
        {badge.label}
      </span>
    </button>
  );
}
