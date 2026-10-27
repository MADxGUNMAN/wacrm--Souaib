'use client';

// ============================================================
// Settings → AI Connectors.
//
// Everyone with access sees and manages their OWN connections (Claude,
// ChatGPT, …). The owner also sees the workspace AI policy and the team's
// connections. Activity comes from ai_audit_log.
// Plan: docs/ai-connector/04-permissions-and-crm-ui.md §4.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, Plug, Sparkles, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { csvSlug, downloadCsv, toCsv } from '@/lib/csv';
import { ConnectGuideDialog } from './ai-connectors/connect-guide-dialog';
import {
  ManageConnectionDialog,
  OutcomeDot,
} from './ai-connectors/manage-connection-dialog';
import {
  PLATFORM_NAMES,
  PRIMARY_PLATFORMS,
  TIER_LABELS,
  actionLabel,
  api,
  directoryListingUrl,
  relative,
  type ActivityView,
  type ConnectionView,
  type ConnectorOverview,
  type PrimaryPlatform,
} from './ai-connectors/shared';
import { WorkspacePolicyCard } from './ai-connectors/workspace-policy-card';
import { Pager } from './security/table-kit';

const POLL_MS = 5000;

export function AiConnectorsPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<ConnectorOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [guide, setGuide] = useState<PrimaryPlatform | null>(null);
  const [managing, setManaging] = useState<ConnectionView | null>(null);
  const [activityKey, setActivityKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const next = await api<ConnectorOverview>('/api/ai-connectors');
      setData(next);
      setLoadError(false);
      return next;
    } catch {
      setLoadError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While the guide is open, poll so the card flips to Connected as soon
  // as the browser sign-in finishes in Claude / ChatGPT.
  const knownIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!guide) return;
    knownIds.current = new Set((data?.connections ?? []).map((c) => c.id));
    const timer = setInterval(async () => {
      const next = await load();
      const fresh = next?.connections.find(
        (c) => c.platform === guide && !knownIds.current.has(c.id)
      );
      if (fresh) {
        toast.success(`${fresh.app_name} is connected to Replai.`);
        setGuide(null);
        setActivityKey((k) => k + 1);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // `data` deliberately omitted: the snapshot is taken when the guide opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, load]);

  const disconnect = async (c: ConnectionView) => {
    const ok = await confirm({
      title: `Disconnect ${c.app_name}?`,
      description: c.is_mine
        ? `${c.app_name} stops working with Replai straight away. You can connect it again later from ${c.app_name}.`
        : `${c.user.name ?? 'This teammate'}'s ${c.app_name} stops working with Replai straight away. They'll get a notification.`,
      confirmText: 'Disconnect',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/ai-connectors/${c.id}`, { method: 'DELETE' });
      toast.success(`${c.app_name} disconnected.`);
      setManaging(null);
      await load();
      setActivityKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect.');
    }
  };

  const head = (
    <SettingsPanelHead
      title="AI connectors"
      description="Use Replai from Claude or ChatGPT. Ask about your inbox, look up contacts and, when you allow it, update records by chatting."
    />
  );

  if (!data) {
    return (
      <div>
        {head}
        <div className="border-border bg-card flex h-48 items-center justify-center rounded-xl border">
          {loadError ? (
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                Could not load AI connectors.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void load()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          )}
        </div>
      </div>
    );
  }

  const { connector, policy } = data;
  const notice = !connector.enabled
    ? 'AI connectors are not available yet. They are being rolled out gradually.'
    : !connector.account_allowed
      ? 'AI connectors are not enabled for this workspace yet. They are being rolled out gradually.'
      : policy.locked_by_platform
        ? 'Replai has switched off AI connectors for this workspace. Existing connections are paused.'
        : !policy.enabled
          ? 'Your workspace owner has switched off AI connectors. Existing connections are paused.'
          : !data.is_owner && !policy.members_allowed
            ? 'Your workspace owner allows AI connectors for owners only.'
            : null;
  const canConnect =
    Boolean(connector.mcp_url) && connector.account_allowed && !notice;
  const others = data.connections.filter(
    (c) => !(PRIMARY_PLATFORMS as readonly string[]).includes(c.platform)
  );

  return (
    <div className="space-y-6">
      {head}

      {notice ? (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-xl border px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {PRIMARY_PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform}
            platform={platform}
            connections={data.connections.filter(
              (c) => c.platform === platform
            )}
            allowedByPolicy={policy.allowed_platforms.includes(platform)}
            canConnect={canConnect}
            onConnect={() => {
              // Listed platforms open their official directory page in a
              // new tab (inside the click, so it isn't popup-blocked); the
              // dialog then just waits for the connection to arrive.
              const listing = directoryListingUrl(platform);
              if (listing) window.open(listing, '_blank', 'noopener');
              setGuide(platform);
            }}
            onManage={setManaging}
            onDisconnect={disconnect}
          />
        ))}
      </div>

      {others.length ? (
        <section className="border-border bg-card rounded-xl border p-4">
          <h3 className="text-foreground text-sm font-semibold">
            Other connections
          </h3>
          <ul className="mt-2 space-y-2">
            {others.map((c) => (
              <ConnectionRow
                key={c.id}
                c={c}
                onManage={setManaging}
                onDisconnect={disconnect}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {data.is_owner && connector.enabled ? (
        <WorkspacePolicyCard
          policy={policy}
          platforms={data.policy_platforms}
          onSaved={(p) => {
            setData((d) => (d ? { ...d, policy: p } : d));
            void load();
          }}
        />
      ) : null}

      {connector.enabled ? <ActivitySection key={activityKey} /> : null}

      {data.is_owner && data.team.length ? (
        <section className="border-border bg-card rounded-xl border p-4">
          <h3 className="text-foreground text-sm font-semibold">
            Team connections
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            AI apps your teammates connected to their own accounts.
          </p>
          <ul className="mt-3 space-y-2">
            {data.team.map((c) => (
              <ConnectionRow
                key={c.id}
                c={c}
                showUser
                onManage={setManaging}
                onDisconnect={disconnect}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {guide && connector.mcp_url ? (
        <ConnectGuideDialog
          platform={guide}
          mcpUrl={connector.mcp_url}
          listingUrl={directoryListingUrl(guide)}
          open
          onOpenChange={(open) => !open && setGuide(null)}
        />
      ) : null}

      {managing ? (
        <ManageConnectionDialog
          connection={managing}
          open
          onOpenChange={(open) => !open && setManaging(null)}
          onSaved={() => {
            void load();
            setActivityKey((k) => k + 1);
          }}
          onDisconnect={disconnect}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------

function Tiers({ c }: { c: ConnectionView }) {
  if (c.settings.read_only)
    return <span className="text-muted-foreground text-xs">Read-only</span>;
  return (
    <span className="text-muted-foreground text-xs">
      {c.tiers
        .map((t) => TIER_LABELS[t as keyof typeof TIER_LABELS])
        .filter(Boolean)
        .join(' · ') || 'View'}
    </span>
  );
}

function PlatformCard({
  platform,
  connections,
  allowedByPolicy,
  canConnect,
  onConnect,
  onManage,
  onDisconnect,
}: {
  platform: PrimaryPlatform;
  connections: ConnectionView[];
  allowedByPolicy: boolean;
  canConnect: boolean;
  onConnect: () => void;
  onManage: (c: ConnectionView) => void;
  onDisconnect: (c: ConnectionView) => void;
}) {
  const name = PLATFORM_NAMES[platform];
  const c = connections[0];
  return (
    <div className="border-border bg-card flex flex-col rounded-xl border p-4">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary-soft text-primary flex size-9 items-center justify-center rounded-lg">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">{name}</p>
          <p className="flex items-center gap-1.5 text-xs">
            <span
              className={
                c
                  ? 'size-2 rounded-full bg-emerald-500'
                  : 'border-muted-foreground/50 size-2 rounded-full border'
              }
              aria-hidden
            />
            <span
              className={
                c
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-muted-foreground'
              }
            >
              {c ? 'Connected' : 'Not connected'}
            </span>
          </p>
        </div>
      </div>

      {c ? (
        <div className="mt-3 space-y-1">
          <p className="text-muted-foreground text-xs">
            Since {format(new Date(c.created_at), 'd MMM yyyy')} · used{' '}
            {relative(c.last_used_at)}
          </p>
          {c.label ? (
            <p className="text-foreground text-xs">{c.label}</p>
          ) : null}
          <Tiers c={c} />
          {!allowedByPolicy ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Paused: not allowed by the workspace policy.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">
          {allowedByPolicy
            ? `Connect ${name} to your Replai account.`
            : `Your workspace owner hasn't allowed ${name}.`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {c ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onManage(c)}>
              Manage
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDisconnect(c)}>
              <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={onConnect}
            disabled={!canConnect || !allowedByPolicy}
          >
            <Plug className="mr-1 h-3.5 w-3.5" /> Connect {name}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectionRow({
  c,
  showUser,
  onManage,
  onDisconnect,
}: {
  c: ConnectionView;
  showUser?: boolean;
  onManage: (c: ConnectionView) => void;
  onDisconnect: (c: ConnectionView) => void;
}) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <p className="text-foreground text-sm">
          {showUser ? (
            <span className="font-medium">
              {c.user.name ?? c.user.email ?? 'Teammate'} ·{' '}
            </span>
          ) : null}
          {c.app_name}
          {c.label ? (
            <span className="text-muted-foreground"> — {c.label}</span>
          ) : null}
        </p>
        <p className="text-muted-foreground text-xs">
          <Tiers c={c} /> · used {relative(c.last_used_at)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onManage(c)}>
          Manage
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDisconnect(c)}>
          Disconnect
        </Button>
      </div>
    </li>
  );
}

const ACTIVITY_PAGE_SIZE_DEFAULT = 25;
/** Export pulls every matching row, in pages, up to this many. */
const EXPORT_MAX_ROWS = 5000;
const EXPORT_PAGE_SIZE = 100;

type ActivityPage = {
  items: ActivityView[];
  total?: number;
  page?: number;
  page_size?: number;
};

function ActivitySection() {
  const [data, setData] = useState<ActivityPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ACTIVITY_PAGE_SIZE_DEFAULT);
  const [platform, setPlatform] = useState('all');

  const fetchPage = useCallback(
    (p: number, size: number) => {
      const q = new URLSearchParams({ page: String(p), limit: String(size) });
      if (platform !== 'all') q.set('platform', platform);
      return api<ActivityPage>(`/api/ai-connectors/activity?${q}`);
    },
    [platform]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(page, pageSize)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, page, pageSize]);

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: ActivityView[] = [];
      for (let p = 1; all.length < EXPORT_MAX_ROWS; p++) {
        const r = await fetchPage(p, EXPORT_PAGE_SIZE);
        all.push(...r.items);
        if (r.items.length < EXPORT_PAGE_SIZE) break;
      }
      const rows = [
        ['Time', 'App', 'Member', 'Action', 'Outcome', 'Reason', 'Details'],
        ...all.map((i) => [
          i.created_at,
          i.app_name ?? '',
          i.user_name ?? '',
          i.action,
          i.outcome,
          i.deny_reason ?? '',
          i.summary ?? '',
        ]),
      ];
      downloadCsv(
        `ai-activity-${csvSlug(platform === 'all' ? 'all-apps' : platform)}.csv`,
        toCsv(rows)
      );
    } catch {
      toast.error('Could not export activity.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section
      className="border-border bg-card overflow-hidden rounded-xl border"
      aria-labelledby="ai-activity-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-0">
        <div>
          <h3
            id="ai-activity-heading"
            className="text-foreground text-sm font-semibold"
          >
            Activity
          </h3>
          <p className="text-muted-foreground text-xs">
            Every action an AI app took in Replai, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ai-activity-app" className="sr-only">
            Filter by app
          </label>
          <select
            id="ai-activity-app"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-xs"
          >
            <option value="all">All apps</option>
            {Object.entries(PLATFORM_NAMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void exportCsv()}
            disabled={!total || exporting}
          >
            {exporting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" />
            )}
            Export
          </Button>
        </div>
      </div>

      {data === null && !failed ? (
        <div className="text-muted-foreground flex items-center gap-2 p-4 py-6 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : failed && data === null ? (
        <p className="text-muted-foreground p-4 py-6 text-center text-xs">
          Could not load activity.
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground p-4 py-6 text-center text-xs">
          {platform === 'all'
            ? 'No AI activity yet.'
            : `No activity from ${PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] ?? platform}.`}
        </p>
      ) : (
        <div
          className={`mt-3 overflow-x-auto px-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading}
        >
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Time</th>
                <th className="py-1.5 pr-3 font-medium">App</th>
                <th className="py-1.5 pr-3 font-medium">Action</th>
                <th className="py-1.5 pr-3 font-medium">Details</th>
                <th className="py-1.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {items.map((i, idx) => (
                <tr key={i.id}>
                  <td className="text-muted-foreground py-1.5 pr-3 tabular-nums">
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className="text-muted-foreground py-1.5 pr-3 whitespace-nowrap tabular-nums">
                    {format(new Date(i.created_at), 'dd MMM HH:mm')}
                  </td>
                  <td className="text-foreground py-1.5 pr-3 whitespace-nowrap">
                    {i.app_name ?? '—'}
                    {i.user_name ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {i.user_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-foreground py-1.5 pr-3 font-mono">
                    {actionLabel(i.action)}
                  </td>
                  <td
                    className="text-muted-foreground max-w-[18rem] truncate py-1.5 pr-3"
                    title={i.summary ?? undefined}
                  >
                    {i.summary ?? ''}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <OutcomeDot outcome={i.outcome} reason={i.deny_reason} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data !== null && total > 0 ? (
        <div className="mt-3">
          <Pager
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
