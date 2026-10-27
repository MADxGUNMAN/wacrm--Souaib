'use client';

// ============================================================
// AI connectors on a single account's deep-dive page: how many Claude /
// ChatGPT connections the workspace has, when they were last used, 7-day
// call volume, and the platform lock.
//
// The lock refuses every AI tool call for the workspace without revoking
// anything, so switching it off restores access as it was. The workspace
// owner can see the lock but can't change it.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Lock, Sparkles, Unlock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { PlatformSummary } from '@/lib/ai-connector/manage';

const NAMES: Record<string, string> = {
  claude: 'Claude',
  claude_code: 'Claude Code',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  mcp_inspector: 'MCP Inspector',
  other: 'Other',
};

const ago = (iso: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never';

export function AiConnectorsCard({ accountId }: { accountId: string }) {
  const confirm = useConfirm();
  const [data, setData] = useState<PlatformSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/super-admin/accounts/${accountId}/ai-connectors`
      );
      if (!res.ok) throw new Error('failed');
      setData((await res.json()) as PlatformSummary);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLock = async () => {
    if (!data) return;
    const locking = !data.locked;
    const ok = await confirm({
      title: locking
        ? 'Switch off AI connectors for this workspace?'
        : 'Switch AI connectors back on?',
      description: locking
        ? 'Every Claude and ChatGPT call for this workspace is refused until you switch them back on. Connections are kept.'
        : 'Connections start working again straight away, within the owner’s policy.',
      confirmText: locking ? 'Switch off' : 'Switch on',
      variant: locking ? 'destructive' : 'default',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/super-admin/accounts/${accountId}/ai-connectors`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locked: locking,
            reason: locking ? 'Switched off by Replai' : null,
          }),
        }
      );
      if (!res.ok) throw new Error('failed');
      setData((await res.json()) as PlatformSummary);
      toast.success(
        locking ? 'AI connectors switched off' : 'AI connectors switched on'
      );
    } catch {
      toast.error('Could not update the AI connector lock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">AI connectors</h3>
            <p className="text-xs text-slate-500">
              Claude and ChatGPT connections
            </p>
          </div>
        </div>
        {data ? (
          <Button
            size="sm"
            variant={data.locked ? 'outline' : 'destructive'}
            onClick={toggleLock}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : data.locked ? (
              <>
                <Unlock className="mr-1 h-3.5 w-3.5" /> Switch on
              </>
            ) : (
              <>
                <Lock className="mr-1 h-3.5 w-3.5" /> Switch off
              </>
            )}
          </Button>
        ) : null}
      </div>

      <div className="px-5 py-4 text-sm">
        {!data ? (
          failed ? (
            <p className="text-xs text-slate-500">
              Could not load AI connector details.
            </p>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          )
        ) : (
          <div className="space-y-3">
            {data.locked ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Switched off by Replai
                {data.locked_reason ? ` — ${data.locked_reason}` : ''}.
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Active" value={data.active_connections} />
              <Stat label="Calls (7 d)" value={data.calls_7d} />
              <Stat label="Errors (7 d)" value={data.errors_7d} />
            </div>
            {data.by_platform.length ? (
              <ul className="space-y-1 text-xs text-slate-600">
                {data.by_platform.map((p) => (
                  <li key={p.platform} className="flex justify-between">
                    <span>
                      {NAMES[p.platform] ?? p.platform} × {p.count}
                    </span>
                    <span className="text-slate-400">
                      used {ago(p.last_used_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No AI apps connected.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="text-base font-semibold text-slate-900 tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
