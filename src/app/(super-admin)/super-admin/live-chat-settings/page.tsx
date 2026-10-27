'use client';

// ============================================================
// Super Admin → Support → Live chat settings
//
// Three platform switches and one per-workspace table:
//
//   • Live chat on/off       — off hides it from EVERY workspace, overrides
//                              included. The inbox stays readable.
//   • Who can use it         — every workspace / WhatsApp-connected only /
//                              only the ones allowed below
//   • Floating chat bubble   — platform switch + welcome message
//   • Workspace access       — per workspace: follow the rule, always
//                              allow, or always block
//
// The switches save together with one Save button, because they are read
// as a set ("on, WhatsApp-connected only") and a half-saved combination
// would briefly show the wrong customers the chat. The table saves each
// row immediately, because each row is independent and an operator
// working down a list should not lose ten decisions to a forgotten Save.
//
// What each workspace actually ends up with is computed on the server by
// the same function the CRM uses, so the "Access" column can never
// disagree with what the customer sees.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SupportReplyEmailLog } from '@/components/super-admin/support-reply-email-log';
import {
  SUPPORT_VISIBILITY_OPTIONS,
  SUPPORT_WELCOME_MAX,
  describeSupportAccess,
  type SupportChatSettings,
  type SupportOverrideChoice,
  type SupportVisibility,
} from '@/lib/support-chat/access-rules';
import type { SupportAccessRow } from '@/lib/support-chat/availability';
import { cn } from '@/lib/utils';

interface Reach {
  total: number;
  withAccess: number;
  allowed: number;
  blocked: number;
  whatsappConnected: number;
}

type Filter = 'all' | 'access' | 'no_access' | 'overridden';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'access', label: 'Has access' },
  { value: 'no_access', label: 'No access' },
  { value: 'overridden', label: 'Overridden' },
];

const CHOICE_LABEL: Record<SupportOverrideChoice, string> = {
  default: 'Follow the rule',
  allow: 'Always allow',
  deny: 'Always block',
};

export default function LiveChatSettingsPage() {
  const confirm = useConfirm();

  // ---- Platform switches ---------------------------------------------
  const [saved, setSaved] = useState<SupportChatSettings | null>(null);
  const [draft, setDraft] = useState<SupportChatSettings | null>(null);
  const [reach, setReach] = useState<Reach | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/support-chat/settings', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load settings.');
      setSaved(data.settings);
      setDraft(data.settings);
      setReach(data.reach);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return (
      saved.enabled !== draft.enabled ||
      saved.visibility !== draft.visibility ||
      saved.widgetEnabled !== draft.widgetEnabled ||
      (saved.welcomeMessage ?? '') !== (draft.welcomeMessage ?? '')
    );
  }, [saved, draft]);

  // ---- Workspace table -----------------------------------------------
  const [rows, setRows] = useState<SupportAccessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tableLoading, setTableLoading] = useState(true);
  const [pendingRow, setPendingRow] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadRows = useCallback(async () => {
    setTableLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        filter,
      });
      if (debounced) params.set('search', debounced);
      const res = await fetch(
        `/api/super-admin/support-chat/access?${params}`,
        {
          cache: 'no-store',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load workspaces.');
      setRows(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load.');
    } finally {
      setTableLoading(false);
    }
  }, [page, filter, debounced]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // ---- Save the switches ----------------------------------------------
  const save = useCallback(async () => {
    if (!draft || !saved) return;

    // Turning it off is the one change with an immediate, platform-wide
    // effect on customers, so it is the one that asks first.
    if (saved.enabled && !draft.enabled) {
      const ok = await confirm({
        title: 'Turn Live chat off for everyone?',
        description:
          'Live chat, the chat bubble and every unread badge disappear from all customer workspaces straight away, including any you allowed individually. Your inbox stays readable, and nothing is deleted — turning it back on restores everything.',
        confirmText: 'Turn off',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/super-admin/support-chat/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          visibility: draft.visibility,
          widgetEnabled: draft.widgetEnabled,
          welcomeMessage: draft.welcomeMessage ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setSaved(data.settings);
      setDraft(data.settings);
      setReach(data.reach);
      toast.success('Live chat settings saved.');
      // The rule changed, so every row's computed access may have too.
      void loadRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [draft, saved, confirm, loadRows]);

  // ---- Per-row override -----------------------------------------------
  const setChoice = useCallback(
    async (row: SupportAccessRow, choice: SupportOverrideChoice) => {
      const current: SupportOverrideChoice = row.override?.mode ?? 'default';
      if (current === choice) return;

      setPendingRow(row.accountId);
      try {
        const res = await fetch('/api/super-admin/support-chat/access', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: row.accountId, choice }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Could not save.');
        // Refetch rather than patching locally: the resulting ACCESS is
        // computed by the server's rule, and recomputing it here would be a
        // second copy of that rule waiting to drift.
        await Promise.all([loadRows(), loadSettings()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save.');
      } finally {
        setPendingRow(null);
      }
    },
    [loadRows, loadSettings]
  );

  if (loadError && !draft) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-10 text-center">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-slate-600">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void loadSettings()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!draft || !reach) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      {/* Reach summary — the consequence of the settings, not the settings */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={MessageCircle}
          label="Workspaces with access"
          value={`${reach.withAccess} / ${reach.total}`}
          tone={saved?.enabled ? 'text-[#159947]' : 'text-slate-400'}
        />
        <Stat
          icon={Smartphone}
          label="WhatsApp connected"
          value={String(reach.whatsappConnected)}
        />
        <Stat
          icon={ShieldCheck}
          label="Always allowed"
          value={String(reach.allowed)}
        />
        <Stat icon={Ban} label="Always blocked" value={String(reach.blocked)} />
      </div>

      {/* Master switch */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live chat
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              When off, Live chat disappears from every customer workspace — the
              Settings page, the chat bubble, unread badges and reply emails.
              Your inbox stays readable and nothing is deleted.
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(checked) =>
              setDraft((d) => (d ? { ...d, enabled: checked } : d))
            }
            aria-label="Live chat enabled"
          />
        </div>
      </Card>

      {/* Visibility rule */}
      <Card className={cn(!draft.enabled && 'opacity-60')}>
        <h2 className="text-base font-semibold text-slate-900">
          Who can use it
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The rule for every workspace you have not set individually below.
          Messaging a workspace from the Live chat inbox always gives it access,
          whatever the rule.
        </p>
        <RadioGroup
          value={draft.visibility}
          onValueChange={(v) => {
            if (typeof v === 'string') {
              setDraft((d) =>
                d ? { ...d, visibility: v as SupportVisibility } : d
              );
            }
          }}
          disabled={!draft.enabled}
          className="mt-4 gap-2"
        >
          {SUPPORT_VISIBILITY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                draft.visibility === opt.value
                  ? 'border-[#25D366] bg-[#25D366]/5'
                  : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <RadioGroupItem value={opt.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </Card>

      {/* Bubble + welcome */}
      <Card className={cn(!draft.enabled && 'opacity-60')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Floating chat bubble
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A chat button in the bottom-right corner of every CRM page.
              Customers can still hide it for themselves.
            </p>
          </div>
          <Switch
            checked={draft.widgetEnabled}
            disabled={!draft.enabled}
            onCheckedChange={(checked) =>
              setDraft((d) => (d ? { ...d, widgetEnabled: checked } : d))
            }
            aria-label="Floating chat bubble enabled"
          />
        </div>

        <div className="mt-5">
          <label
            htmlFor="welcome-message"
            className="text-sm font-medium text-slate-900"
          >
            Welcome message
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Shown in an empty chat and under the bubble&rsquo;s header. Leave
            blank for the default.
          </p>
          <Textarea
            id="welcome-message"
            value={draft.welcomeMessage ?? ''}
            disabled={!draft.enabled}
            maxLength={SUPPORT_WELCOME_MAX}
            rows={2}
            placeholder="Send the first message and we'll get back to you here."
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, welcomeMessage: e.target.value } : d
              )
            }
            className="mt-2"
          />
          <p className="mt-1 text-right text-[11px] text-slate-400">
            {(draft.welcomeMessage ?? '').length} / {SUPPORT_WELCOME_MAX}
          </p>
        </div>
      </Card>

      {/* Workspace access */}
      <Card>
        <h2 className="text-base font-semibold text-slate-900">
          Workspace access
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Give one workspace access regardless of the rule, or keep it out.
          Changes apply immediately.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspace, owner or email"
              className="pl-8"
              aria-label="Search workspaces"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => {
                  setFilter(f.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === f.value
                    ? 'border-[#25D366] bg-[#25D366]/10 text-[#159947]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {tableLoading && rows.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              No workspace matches.
            </p>
          ) : (
            rows.map((row) => (
              <AccessRow
                key={row.accountId}
                row={row}
                pending={pendingRow === row.accountId}
                onChoose={(choice) => void setChoice(row, choice)}
              />
            ))
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {total} workspace{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Read-only log of reminder emails — outside the Save bar's scope. */}
      <SupportReplyEmailLog />

      {/* Sticky save bar — only when there is something to save, so it
          cannot be mistaken for the save button of the table above. */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-slate-600">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setDraft(saved)}
              >
                Discard
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-opacity',
        className
      )}
    >
      {children}
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'text-slate-900',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-bold', tone)}>{value}</p>
    </div>
  );
}

function AccessRow({
  row,
  pending,
  onChoose,
}: {
  row: SupportAccessRow;
  pending: boolean;
  onChoose: (choice: SupportOverrideChoice) => void;
}) {
  const name =
    row.accountName || row.owner?.full_name || row.owner?.email || 'Workspace';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const choice: SupportOverrideChoice = row.override?.mode ?? 'default';

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-500">
            {row.owner?.email ?? 'No owner email'}
            {row.whatsappConnected ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[#159947]">
                <Smartphone className="h-3 w-3" /> WhatsApp connected
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:justify-end">
        <div className="min-w-0 text-right">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              row.access.available
                ? 'bg-green-50 text-green-700'
                : 'bg-slate-100 text-slate-500'
            )}
          >
            {row.access.available ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Ban className="h-3 w-3" />
            )}
            {row.access.available ? 'Has access' : 'No access'}
          </span>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {row.override?.source === 'admin_message' ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Allowed when you messaged them{' '}
                {formatDistanceToNow(new Date(row.override.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            ) : (
              describeSupportAccess(row.access)
            )}
          </p>
        </div>

        <Select
          value={choice}
          onValueChange={(v) => {
            if (v) onChoose(v as SupportOverrideChoice);
          }}
          disabled={pending}
        >
          <SelectTrigger className="w-40" aria-label={`Access for ${name}`}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SelectValue>{CHOICE_LABEL[choice]}</SelectValue>
            )}
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CHOICE_LABEL) as SupportOverrideChoice[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CHOICE_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
