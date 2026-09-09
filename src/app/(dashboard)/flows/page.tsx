'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
  FileText,
  Download,
  Upload,
  AlertTriangle,
  BookOpen,
  Sparkles,
} from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useCan } from '@/hooks/use-can';
import { Button } from '@/components/ui/button';
import { GatedButton } from '@/components/ui/gated-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';

/**
 * Flows list page.
 *
 * Open to every authenticated user. Flows is in soft-GA — the "Beta"
 * chip in the header is the only remaining signal that the surface
 * is new. The previous per-account beta gate was removed in PR #134.
 */

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  trigger_type: 'keyword' | 'first_inbound_message' | 'manual';
  trigger_config: { keywords?: string[] } | Record<string, unknown>;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS = (
  t: ReturnType<typeof useTranslations>
): Record<FlowRow['status'], string> => ({
  draft: t('statusDraft'),
  active: t('statusActive'),
  archived: t('statusArchived'),
});

const STATUS_COLORS: Record<FlowRow['status'], string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  active: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
  archived: 'border-border bg-muted/50 text-muted-foreground',
};

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  icon: 'MessageSquare' | 'HelpCircle' | 'UserPlus';
  trigger_type: string;
  node_count: number;
}

const TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const;

export default function FlowsPage() {
  const router = useRouter();
  const canCreate = useCan('send-messages');
  const t = useTranslations('Flows.list');
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flowsRes, tmplRes] = await Promise.all([
          fetch('/api/flows'),
          fetch('/api/flows/templates'),
        ]);
        if (!flowsRes.ok) {
          throw new Error(`Failed to load flows: ${flowsRes.status}`);
        }
        const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] };
        if (!cancelled) setFlows(flowsJson.flows ?? []);
        // Templates endpoint is forward-looking — if it 404s on an
        // older deployment, gracefully fall through.
        if (tmplRes.ok) {
          const tmplJson = (await tmplRes.json()) as {
            templates: TemplateSummary[];
          };
          if (!cancelled) setTemplates(tmplJson.templates ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: 'keyword',
          trigger_config: { keywords: [] },
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      setNewName('');
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t('createError'));
    } finally {
      setCreating(false);
    }
  }

  async function handleUseTemplate(slug: string) {
    setCreating(true);
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_slug: slug }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Clone failed: ${res.status}`);
      }
      const json = (await res.json()) as { flow: FlowRow };
      setCreateOpen(false);
      router.push(`/flows/${json.flow.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('cloneError');
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  /**
   * Download the flow as JSON.
   *
   * Fetched then saved from a blob rather than pointed at with a plain
   * `<a href>`: the export route is cookie-authenticated, and a bare link
   * navigation on a 401 would replace the page with a JSON error body
   * instead of leaving the user where they were.
   */
  async function handleExport(flow: FlowRow) {
    try {
      const res = await fetch(`/api/flows/${flow.id}/export?download=1`);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();

      // Prefer the filename the server chose so the slug rules live in
      // one place.
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'flow.replai-flow.json';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${flow.name}`);
    } catch (err) {
      console.error(err);
      toast.error('Could not export that flow.');
    }
  }

  const confirm = useConfirm();

  async function handleDelete(flow: FlowRow) {
    const ok = await confirm({
      title: `Delete "${flow.name}"?`,
      description: 'Any active runs will end immediately and this cannot be undone.',
      confirmText: 'Delete Flow',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t('deleteSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('deleteError'));
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
              {t('beta')}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
          {/* Read-only, so no permission gate — someone who cannot
              create a flow can still need to understand one. */}
          <Button variant="ghost" onClick={() => router.push('/flows/guide')}>
            <BookOpen className="h-4 w-4" />
            Guide
          </Button>
          {/* Gated like create, not like the guide: this one ends in a
              flow being written to the account. */}
          <GatedButton
            canAct={canCreate}
            gateReason="build flows with AI"
            variant="outline"
            onClick={() => router.push('/flows/agent')}
          >
            <Sparkles className="h-4 w-4" />
            Build with AI
          </GatedButton>
          <GatedButton
            canAct={canCreate}
            gateReason="import flows"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Import
          </GatedButton>
          <GatedButton
            canAct={canCreate}
            gateReason="create flows"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t('newFlow')}
          </GatedButton>
        </div>
      </header>

      {flows.length === 0 ? (
        <EmptyState
          onCreate={() => setCreateOpen(true)}
          canCreate={canCreate}
          t={t}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onEdit={() => router.push(`/flows/${flow.id}`)}
              onDelete={() => handleDelete(flow)}
              onExport={() => handleExport(flow)}
              t={t}
            />
          ))}
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(flowId) => {
          setImportOpen(false);
          router.push(`/flows/${flowId}`);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* `sm:max-w-4xl` not `max-w-4xl` — shadcn's DialogContent has
            `sm:max-w-sm` baked into its default classes. Without the
            sm: prefix our override applies at base only and the
            sm-scoped 384px wins at every real desktop breakpoint. */}
        <DialogContent className="bg-popover text-popover-foreground sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('createDesc')}
            </DialogDescription>
          </DialogHeader>

          {templates.length > 0 && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                {t('startTemplate')}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const Icon = TEMPLATE_ICONS[template.icon] ?? FileText;
                  return (
                    <button
                      key={template.slug}
                      type="button"
                      onClick={() => handleUseTemplate(template.slug)}
                      disabled={creating}
                      className="border-border bg-background hover:border-primary/40 hover:bg-muted flex flex-col gap-2.5 rounded-lg border p-4 text-left transition-colors disabled:opacity-50"
                    >
                      <Icon className="text-primary h-5 w-5" />
                      <span className="text-popover-foreground text-sm font-semibold">
                        {template.name}
                      </span>
                      <span className="text-muted-foreground text-xs leading-relaxed">
                        {template.description}
                      </span>
                      <span className="border-border text-muted-foreground mt-auto border-t pt-2 text-[11px]">
                        {t('nodeCount', { count: template.node_count })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-border space-y-2 border-t pt-4">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {t('startBlank')}
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('placeholderName')}
              className="bg-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('createBlank')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Paste-or-upload import.
 *
 * Both inputs exist because both habits do: a file lands from a
 * colleague or an export, while pasted text comes from an AI answer or a
 * chat message. Reading the file into the same textarea (rather than
 * posting it straight off) means the user always sees what they are about
 * to import before it becomes a flow.
 */
function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (flowId: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);

  function reset() {
    setText('');
    setIssues([]);
    setNotes([]);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      setText(await file.text());
      setIssues([]);
      setNotes([]);
    } catch {
      toast.error('Could not read that file.');
    }
  }

  async function handleImport() {
    setIssues([]);
    setNotes([]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Caught client-side so an obvious typo does not need a round trip.
      setIssues([
        'That is not valid JSON — check for a missing brace or comma.',
      ]);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/flows/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: parsed }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setIssues(
          Array.isArray(json.issues) && json.issues.length > 0
            ? json.issues
            : [json.error ?? `Import failed (${res.status}).`]
        );
        return;
      }

      // Notes are advisory (renames, created tags, activation warnings).
      // Shown before navigating so they are not lost behind a redirect.
      const allNotes: string[] = [
        ...(Array.isArray(json.created_tags) && json.created_tags.length > 0
          ? [
              `Created ${json.created_tags.length} new tag(s): ${json.created_tags.join(', ')}`,
            ]
          : []),
        ...(Array.isArray(json.notes) ? json.notes : []),
      ];

      toast.success(
        `Imported "${json.flow?.name}" with ${json.node_count} node(s) as a draft.`
      );

      if (allNotes.length > 0) {
        setNotes(allNotes);
      } else {
        reset();
        onImported(json.flow.id);
      }
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover text-popover-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a flow</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Paste a flow JSON export, or choose a file. It is added as a draft
            so you can review it before activating.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="border-border hover:bg-muted flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors">
            <Upload className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground">Choose a .json file</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setIssues([]);
            }}
            rows={10}
            spellCheck={false}
            placeholder='{ "replai_flow_version": 1, "flow": { ... }, "nodes": [ ... ] }'
            className="border-border bg-muted text-foreground placeholder-muted-foreground focus:border-primary/50 w-full rounded-lg border p-3 font-mono text-xs outline-none"
          />

          {issues.length > 0 && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-400">
                <AlertTriangle className="h-4 w-4" />
                This flow cannot be imported
              </p>
              <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-xs">
                {issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {notes.length > 0 && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-sm font-medium text-amber-400">
                Imported, with notes
              </p>
              <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-xs">
                {notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={busy}
          >
            {notes.length > 0 ? 'Close' : 'Cancel'}
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={!text.trim() || busy || notes.length > 0}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Import as draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({
  onCreate,
  canCreate,
  t,
}: {
  onCreate: () => void;
  canCreate: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="border-border bg-card/50 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
        <Workflow className="text-muted-foreground h-6 w-6" />
      </div>
      <h2 className="text-foreground mt-4 text-base font-medium">
        {t('emptyTitle')}
      </h2>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        {t('emptyDesc')}
      </p>
      <GatedButton
        canAct={canCreate}
        gateReason="create flows"
        onClick={onCreate}
        className="mt-5"
      >
        <Plus className="h-4 w-4" />
        {t('createFirst')}
      </GatedButton>
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  onExport,
  t,
}: {
  flow: FlowRow;
  onEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const triggerSummary = describeTrigger(flow, t);
  const StatusIcon =
    flow.status === 'active'
      ? PlayCircle
      : flow.status === 'archived'
        ? Archive
        : PauseCircle;
  return (
    <div className="border-border bg-card hover:border-border flex flex-col rounded-lg border p-4 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="text-primary h-4 w-4 shrink-0" />
          <h3 className="text-foreground truncate text-sm font-semibold">
            {flow.name}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 gap-1 text-[10px]',
            STATUS_COLORS[flow.status]
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {STATUS_LABELS(t)[flow.status]}
        </Badge>
      </div>

      <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">
        {flow.description || triggerSummary}
      </p>

      <div className="text-muted-foreground mt-4 flex items-center gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {t('runCount', { count: flow.execution_count })}
        </span>
      </div>

      <div className="border-border mt-4 flex items-center justify-end gap-2 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          title="Download this flow as JSON"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          {t('edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('delete')}
        </Button>
      </div>
    </div>
  );
}

function describeTrigger(
  flow: FlowRow,
  t: ReturnType<typeof useTranslations>
): string {
  if (flow.trigger_type === 'keyword') {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : [];
    if (keywords.length === 0) return t('triggerKeywordNone');
    return t('triggerKeyword', { keywords: keywords.join(', ') });
  }
  if (flow.trigger_type === 'first_inbound_message') {
    return t('triggerFirstInbound');
  }
  return t('triggerManual');
}
