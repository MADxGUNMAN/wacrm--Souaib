'use client';

// ============================================================
// Coexistence panel — shown inside Settings → WhatsApp Setup.
//
// Coexistence means one number runs on the WhatsApp Business App (a
// phone) and the Cloud API (this CRM) at the same time. That brings three
// things an operator cannot work out on their own, so each gets a home
// here:
//
//   1. The pairing can BREAK, for six different reasons that Meta reports
//      identically. The remedy differs per reason and is usually a
//      two-minute fix — but only if we name it.
//   2. Chat history and contacts import ONCE, inside a 24-hour window.
//      Without a countdown, "import your history" is advice with no
//      deadline attached.
//   3. The phone's whole address book arrives and needs reviewing before
//      any of it becomes a CRM contact.
//
// Renders nothing at all for an ordinary API-only number, so it costs
// non-coexistence accounts no screen space.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Smartphone,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface HistoryPhase {
  phase: number;
  progress: number;
  status: 'running' | 'completed' | 'declined' | 'failed';
  error_code: string | null;
  error_message: string | null;
  threads_seen: number;
  messages_stored: number;
  messages_skipped: number;
}

interface CoexistenceState {
  connected: boolean;
  is_coexistence: boolean;
  status?: string;
  connected_at?: string | null;
  coexistence_confirmed_at?: string | null;
  disconnect?: {
    event: string;
    reason: string | null;
    at: string | null;
    help: string;
    known: boolean;
  } | null;
  sync?: {
    requested_at: string | null;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    window_hours: number;
    hours_remaining: number | null;
    can_retry: boolean;
  };
  history?: HistoryPhase[];
  contacts?: { pending: number; imported: number };
}

interface StagedContact {
  id: string;
  phone: string;
  full_name: string | null;
  first_name: string | null;
  status: string;
  already_known: boolean;
}

/**
 * Meta's phases in words. "Phase 1" tells an operator nothing; "1 to 90
 * days old" tells them which part of their history is landing.
 */
const PHASE_LABELS: Record<number, string> = {
  0: 'Last 24 hours',
  1: '1 to 90 days old',
  2: '90 to 180 days old',
};

function phaseLabel(phase: number): string {
  return PHASE_LABELS[phase] ?? `Phase ${phase}`;
}

export function CoexistencePanel() {
  const [state, setState] = useState<CoexistenceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/coexistence');
      if (!res.ok) return;
      setState((await res.json()) as CoexistenceState);
    } catch {
      // Silent: this panel is supplementary. A failure here must not
      // break the WhatsApp Setup screen it sits inside.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while an import is actually moving. A backfill arrives over
  // minutes via webhooks with nothing to subscribe to, so the progress bar
  // needs refreshing — but polling a finished import forever is pure waste.
  const isImporting = state?.history?.some((h) => h.status === 'running');
  useEffect(() => {
    if (!isImporting) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [isImporting, load]);

  const retrySync = async () => {
    setRetrying(true);
    try {
      const res = await fetch('/api/whatsapp/coexistence', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Could not start the import.');
      } else {
        toast.success('Import requested. History will arrive over the next few minutes.');
        await load();
      }
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setRetrying(false);
    }
  };

  if (loading || !state?.connected || !state.is_coexistence) return null;

  const sync = state.sync;
  const history = state.history ?? [];
  const pending = state.contacts?.pending ?? 0;
  const declined = history.some((h) => h.status === 'declined');
  const totalStored = history.reduce((sum, h) => sum + h.messages_stored, 0);

  return (
    <div className="space-y-4">
      {/* ---- Mode header ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border border-primary/30 bg-primary/10 text-primary">
          <Smartphone className="mr-1 size-3" />
          Coexistence
        </Badge>
        <span className="text-sm text-muted-foreground">
          This number works on your phone&apos;s WhatsApp Business app and in
          this CRM at the same time.
        </span>
      </div>

      {/* ---- The pairing broke ---- */}
      {state.disconnect ? (
        <Card className="border-destructive/40 bg-destructive/[0.06]">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-destructive">
                WhatsApp disconnected this number
              </p>
              {/* The remedy, not the code. Meta reports six causes as the
                  same event and most are operator-fixable — "open the app
                  on your phone" is not something anyone guesses. */}
              <p className="text-sm text-destructive/90">
                {state.disconnect.help}
              </p>
              {!state.disconnect.known && state.disconnect.reason ? (
                <p className="text-xs text-destructive/70">
                  Meta&apos;s reason code: {state.disconnect.reason}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Keep-alive reminder ---- */}
      {/* Not decoration: the most common way a coexistence pairing dies is
          nobody opening the phone app for 13 days. Saying so up front is
          cheaper than explaining the disconnect afterwards. */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
        <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Open WhatsApp Business on your phone at least once every 13 days, and
          do not uninstall it. Meta drops the connection otherwise.
        </p>
      </div>

      {/* ---- History import ---- */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Chat history import
              </h3>
              <p className="text-xs text-muted-foreground">
                Up to six months of past chats from your phone.
              </p>
            </div>
            {totalStored > 0 ? (
              <Badge variant="outline" className="text-xs font-normal">
                {totalStored.toLocaleString()} message
                {totalStored === 1 ? '' : 's'} imported
              </Badge>
            ) : null}
          </div>

          {declined ? (
            /* A refusal is NOT an error. Nothing is broken and there is
               nothing to retry, so this deliberately shows no Retry
               button — offering one would waste the operator's time. */
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
              <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                History sharing was turned off on the phone, so no past chats
                were imported. New messages still sync normally. To import
                history you would need to disconnect and reconnect, choosing
                to share history on the phone.
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {sync?.requested_at
                  ? 'Requested — waiting for Meta to start sending. This can take a few minutes.'
                  : 'Not started yet.'}
              </p>

              {sync?.last_error ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p className="text-sm break-words text-amber-700 dark:text-amber-400">
                    {sync.last_error}
                  </p>
                </div>
              ) : null}

              {sync?.can_retry ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={retrySync} disabled={retrying} size="sm">
                    {retrying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Import history and contacts
                  </Button>
                  {/* The deadline is the whole point. Meta accepts this
                      once, within 24h of connecting — after that the only
                      route back is disconnect and reconnect. */}
                  {sync.hours_remaining !== null ? (
                    <span
                      className={cn(
                        'text-xs',
                        sync.hours_remaining < 4
                          ? 'font-medium text-destructive'
                          : 'text-muted-foreground',
                      )}
                    >
                      {sync.hours_remaining > 0
                        ? `${sync.hours_remaining} hours left to do this`
                        : 'The window has closed'}
                    </span>
                  ) : null}
                  {sync.attempts > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Attempt {sync.attempts} of {sync.max_attempts}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((phase) => (
                <div key={phase.phase} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {phaseLabel(phase.phase)}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {phase.status === 'completed' ? (
                        <CheckCircle2 className="size-3.5 text-primary" />
                      ) : phase.status === 'failed' ? (
                        <AlertCircle className="size-3.5 text-destructive" />
                      ) : phase.status === 'running' ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {phase.messages_stored.toLocaleString()} stored
                      {phase.messages_skipped > 0
                        ? ` · ${phase.messages_skipped.toLocaleString()} already had`
                        : ''}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={phase.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${phaseLabel(phase.phase)} import progress`}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        phase.status === 'failed'
                          ? 'bg-destructive'
                          : 'bg-primary',
                      )}
                      style={{ width: `${phase.progress}%` }}
                    />
                  </div>
                  {phase.error_message ? (
                    <p className="text-xs text-destructive">
                      {phase.error_message}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Contact review ---- */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              Contacts from your phone
            </h3>
            <p className="text-xs text-muted-foreground">
              {pending > 0
                ? `${pending} number${pending === 1 ? '' : 's'} waiting for you to review.`
                : (state.contacts?.imported ?? 0) > 0
                  ? `${state.contacts?.imported} imported. Nothing left to review.`
                  : 'Nothing to review yet.'}
            </p>
            {/* Says WHY there is a review step at all, so it does not read
                as pointless friction. */}
            {pending > 0 ? (
              <p className="mt-1 max-w-[62ch] text-xs text-muted-foreground">
                Your phone&apos;s address book includes personal numbers, so
                nothing is added to your CRM until you choose. Anything you
                import here can be included in broadcasts.
              </p>
            ) : null}
          </div>
          {pending > 0 ? (
            <Button variant="outline" onClick={() => setReviewOpen(true)}>
              <Users className="size-4" />
              Review {pending}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ContactReviewDialog
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          void load();
        }}
      />
    </div>
  );
}

// ============================================================
// The review list
// ============================================================

function ContactReviewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<StagedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'pending' });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(
        `/api/whatsapp/coexistence/contacts?${params.toString()}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Could not load contacts.');
        return;
      }
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
      setTruncated(Boolean(data.truncated));
      setSelected(new Set());
    } catch {
      toast.error('Could not load contacts.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const act = async (
    action: 'import' | 'skip' | 'import_all' | 'skip_all',
    ids?: string[],
  ) => {
    setWorking(true);
    try {
      const res = await fetch('/api/whatsapp/coexistence/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'That did not work.');
        return;
      }
      if (data.imported > 0) {
        toast.success(
          `${data.imported} contact${data.imported === 1 ? '' : 's'} imported` +
            (data.already_existed
              ? ` · ${data.already_existed} already in your CRM`
              : ''),
        );
      } else if (data.skipped > 0) {
        toast.success(`${data.skipped} skipped`);
      } else if (data.already_existed > 0) {
        toast.success(`${data.already_existed} were already in your CRM`);
      }
      // Partial failures are surfaced, not swallowed — the operator needs
      // to know which numbers did not land.
      if (Array.isArray(data.failures) && data.failures.length > 0) {
        toast.error(`Some did not import: ${data.failures.slice(0, 2).join('; ')}`);
      }
      await load();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setWorking(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contacts from your phone</DialogTitle>
          <DialogDescription>
            {total} number{total === 1 ? '' : 's'} came from your phone&apos;s
            address book. Import the customers; skip anything personal. Skipped
            numbers will not be offered again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or number"
              className="pl-9"
              aria-label="Search staged contacts"
            />
          </div>

          {truncated ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {contacts.length} of {total}. Import or skip
              these and the rest will load.
            </p>
          ) : null}

          <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border border-border p-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : contacts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing left to review.
              </p>
            ) : (
              contacts.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40',
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.full_name || c.first_name || c.phone}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    </span>
                    {/* Lets an operator skim past numbers they already have
                        rather than deciding on each one again. */}
                    {c.already_known ? (
                      <Badge variant="outline" className="text-xs font-normal">
                        Already in CRM
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={working || selected.size === 0}
                onClick={() => act('import', [...selected])}
              >
                {working ? <Loader2 className="size-4 animate-spin" /> : null}
                Import {selected.size > 0 ? selected.size : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={working || selected.size === 0}
                onClick={() => act('skip', [...selected])}
              >
                Skip {selected.size > 0 ? selected.size : ''}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={working}
                onClick={() => act('skip_all')}
                className="text-muted-foreground"
              >
                Skip all
              </Button>
              {/* Offered because some businesses genuinely do keep a
                  customers-only phone. Worded as "all" so nobody assumes
                  it only takes the visible page. */}
              <Button
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => act('import_all')}
              >
                <RefreshCw className="size-3.5" />
                Import all {total}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
