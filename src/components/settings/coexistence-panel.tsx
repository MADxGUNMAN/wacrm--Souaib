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

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  PauseCircle,
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
  /**
   * Server-derived: still marked running, but nothing has arrived for a
   * while. Kept separate from `status` because `status` records what Meta
   * told us and this is an inference about the silence since. See the note
   * in /api/whatsapp/coexistence.
   */
  is_stalled?: boolean;
  quiet_for_minutes?: number | null;
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
  contacts?: { pending: number; imported: number; skipped: number };
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
  // A stalled phase is excluded, otherwise this polls forever: nothing is
  // going to arrive to change the row, so every request returns the same
  // bytes. That is exactly what happened for 21 hours.
  const isImporting = state?.history?.some(
    (h) => h.status === 'running' && !h.is_stalled
  );
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
        toast.success(
          'Import requested. History will arrive over the next few minutes.'
        );
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
  const skipped = state.contacts?.skipped ?? 0;
  /**
   * Everything still importable, which is what decides whether this section
   * appears at all.
   *
   * Gating on `pending` alone was wrong: with all 1,788 numbers skipped the
   * card read "Nothing to review yet" and the button that reaches them
   * disappeared, so the only route back was SQL.
   */
  const actionable = pending + skipped;
  const imported = state.contacts?.imported ?? 0;
  const declined = history.some((h) => h.status === 'declined');
  const totalStored = history.reduce((sum, h) => sum + h.messages_stored, 0);

  return (
    <div className="space-y-4">
      {/* ---- Mode header ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-primary/30 bg-primary/10 text-primary border">
          <Smartphone className="mr-1 size-3" />
          Coexistence
        </Badge>
        <span className="text-muted-foreground text-sm">
          This number works on your phone&apos;s WhatsApp Business app and in
          this CRM at the same time.
        </span>
      </div>

      {/* ---- The pairing broke ---- */}
      {state.disconnect ? (
        <Card className="border-destructive/40 bg-destructive/[0.06]">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p className="text-destructive text-sm font-semibold">
                WhatsApp disconnected this number
              </p>
              {/* The remedy, not the code. Meta reports six causes as the
                  same event and most are operator-fixable — "open the app
                  on your phone" is not something anyone guesses. */}
              <p className="text-destructive/90 text-sm">
                {state.disconnect.help}
              </p>
              {!state.disconnect.known && state.disconnect.reason ? (
                <p className="text-destructive/70 text-xs">
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
      <div className="border-border bg-muted/40 flex items-start gap-2 rounded-lg border p-3">
        <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="text-muted-foreground text-sm">
          Open WhatsApp Business on your phone at least once every 13 days, and
          do not uninstall it. Meta drops the connection otherwise.
        </p>
      </div>

      {/* ---- History import ---- */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Chat history import
              </h3>
              <p className="text-muted-foreground text-xs">
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
            <div className="border-border bg-muted/40 flex items-start gap-2 rounded-md border p-3">
              <X className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground text-sm">
                History sharing was turned off on the phone, so no past chats
                were imported. New messages still sync normally. To import
                history you would need to disconnect and reconnect, choosing to
                share history on the phone.
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
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
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground'
                      )}
                    >
                      {sync.hours_remaining > 0
                        ? `${sync.hours_remaining} hours left to do this`
                        : 'The window has closed'}
                    </span>
                  ) : null}
                  {sync.attempts > 0 ? (
                    <span className="text-muted-foreground text-xs">
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
                    <span className="text-foreground font-medium">
                      {phaseLabel(phase.phase)}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      {phase.status === 'completed' ? (
                        <CheckCircle2 className="text-primary size-3.5" />
                      ) : phase.status === 'failed' ? (
                        <AlertCircle className="text-destructive size-3.5" />
                      ) : phase.is_stalled ? (
                        // Gone quiet. A spinner here is a lie: nothing is
                        // in flight and nothing more is coming unless the
                        // phone sends it.
                        <PauseCircle className="text-muted-foreground size-3.5" />
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
                    className="bg-muted h-1.5 overflow-hidden rounded-full"
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
                          : 'bg-primary'
                      )}
                      style={{ width: `${phase.progress}%` }}
                    />
                  </div>
                  {phase.error_message ? (
                    <p className="text-destructive text-xs">
                      {phase.error_message}
                    </p>
                  ) : phase.is_stalled ? (
                    /* Says what we know and what we don't, rather than
                       implying a transfer is still running. Meta never
                       sends a per-phase "complete", so for a phase that
                       simply went quiet we genuinely cannot tell "finished
                       early" from "phone went offline" — claiming either
                       would be a guess. */
                    <p className="text-muted-foreground text-xs">
                      Nothing new for{' '}
                      {phase.quiet_for_minutes != null &&
                      phase.quiet_for_minutes >= 60
                        ? `${Math.floor(phase.quiet_for_minutes / 60)}h`
                        : `${phase.quiet_for_minutes ?? 0} min`}
                      . Either this is everything your phone had, or it went
                      offline part-way. Open WhatsApp on your phone to let it
                      finish.
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
            <h3 className="text-foreground text-sm font-semibold">
              Contacts from your phone
            </h3>
            <p className="text-muted-foreground text-xs">
              {pending > 0
                ? `${pending} number${pending === 1 ? '' : 's'} waiting for you to review.` +
                  (skipped > 0 ? ` ${skipped} skipped, still importable.` : '')
                : skipped > 0
                  ? // Names the bucket instead of claiming there is nothing
                    // left, which is how a skip came across as a deletion.
                    `${skipped} skipped number${skipped === 1 ? '' : 's'} — you can still import them.`
                  : imported > 0
                    ? `${imported} imported. Nothing left to review.`
                    : 'Nothing to review yet.'}
            </p>
            {/* Says WHY there is a review step at all, so it does not read
                as pointless friction. */}
            {pending > 0 ? (
              <p className="text-muted-foreground mt-1 max-w-[62ch] text-xs">
                Your phone&apos;s address book includes personal numbers, so
                nothing is added to your CRM until you choose. Anything you
                import here can be included in broadcasts.
              </p>
            ) : null}
          </div>
          {/* Also offered once everything is decided, because the list is
              still the record of what the phone sent — and rows come back to
              it whenever a CRM contact is deleted. Gating on outstanding work
              alone made the button disappear at exactly the moment the import
              finished. */}
          {actionable > 0 || imported > 0 ? (
            <Button variant="outline" onClick={() => setReviewOpen(true)}>
              <Users className="size-4" />
              {/* The label matches the only action left to take. */}
              {pending > 0
                ? `Review ${pending}`
                : skipped > 0
                  ? `Import ${skipped}`
                  : `View ${imported}`}
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

/**
 * Exported so the Contacts page can offer the same review flow.
 *
 * The dialog was reachable only from Settings → WhatsApp Setup, which is a
 * long way from Contacts — the page where someone actually notices numbers
 * are missing. Sharing one component rather than building a second importer
 * keeps the batching, progress and double-click guard in a single place.
 */
export function ContactReviewDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so a host page can refresh its list. */
  onImported?: () => void;
}) {
  const [contacts, setContacts] = useState<StagedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Live batch progress, or null when no bulk action is running.
   *
   * Exists because the import used to be one long request that showed only
   * an indeterminate spinner — on 1,417 contacts it looked identical to a
   * hang, which is what got reported.
   */
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [total, setTotal] = useState(0);
  /**
   * First row of the page being shown.
   *
   * Before this the dialog showed the first 200 rows of a bucket and said
   * "Showing the first 200 of 3,703" — with no way to reach row 201. "Import
   * all" worked, and choosing individual contacts did not, which is the
   * opposite of what a review screen is for.
   */
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  /** Server-owned, so the two cannot drift. */
  const [pageSize, setPageSize] = useState(200);

  /**
   * Which bucket is being shown.
   *
   * Skipped numbers used to be invisible — the list only ever queried
   * 'pending', so one "Skip all" click emptied the screen and the panel read
   * "Nothing to review yet" while 1,788 rows sat in 'skipped'. Making the
   * bucket visible is what turns skipping into a reversible decision instead
   * of a disappearance.
   */
  const [view, setView] = useState<'pending' | 'skipped' | 'imported'>(
    'pending'
  );
  const [counts, setCounts] = useState({
    pending: 0,
    skipped: 0,
    imported: 0,
    // 'removed' — deleted from the phone after we staged it. Counted so the
    // buckets add up to `received`; without it numbers silently left every
    // total when the operator tidied their phone.
    removed: 0,
    // Every staged row. The honest denominator for "how much came from the
    // phone" — Meta sends no total for the address book, so this is a running
    // count of what has arrived, not a target to reach.
    received: 0,
  });

  /**
   * Set once the view has been auto-corrected, so an operator who then clicks
   * back to "To review" is not yanked away from it again.
   */
  const autoViewRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: view });
      if (search.trim()) params.set('search', search.trim());
      if (offset > 0) params.set('offset', String(offset));
      const res = await fetch(
        `/api/whatsapp/coexistence/contacts?${params.toString()}`
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Could not load contacts.');
        return;
      }
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
      // `truncated` is intentionally ignored now. It only ever said "there is
      // more than one page" and said nothing about where you were in it,
      // which is why reaching the 201st contact was impossible. `has_more`
      // plus `offset` replaces it.
      setHasMore(Boolean(data.has_more));
      if (typeof data.page_size === 'number') setPageSize(data.page_size);

      // Importing the last rows on a page leaves it empty while earlier pages
      // still have content — the bucket shrinks under the cursor. Stepping
      // back rather than showing "Nothing left to review" on page 4 of 19,
      // which reads as the queue being finished when it is not.
      if ((data.contacts?.length ?? 0) === 0 && offset > 0) {
        setOffset((o) => Math.max(0, o - (data.page_size ?? 200)));
        return;
      }
      // Bucket sizes ride along with the list, so the tab badges are exact
      // and cost no extra request. They are deliberately unaffected by the
      // search box: a badge that shrank while typing would misreport how much
      // is actually parked in each bucket.
      if (data.counts) setCounts(data.counts);
      setSelected(new Set());

      // Open on the bucket that actually has something in it. Landing on an
      // empty "To review" tab while everything sits in Skipped is how the
      // address book looked lost in the first place. Once per open, and never
      // while searching — an empty search result is not an empty bucket.
      if (!autoViewRef.current && !search.trim() && (data.total ?? 0) === 0) {
        const next =
          (data.counts?.pending ?? 0) > 0
            ? 'pending'
            : (data.counts?.skipped ?? 0) > 0
              ? 'skipped'
              : // Falls through to the record once every number is decided, so
                // opening the dialog after a full import shows the 1,788 rows
                // rather than an empty "To review" tab.
                (data.counts?.imported ?? 0) > 0
                ? 'imported'
                : null;
        if (next && next !== view) {
          autoViewRef.current = true;
          setView(next);
          setOffset(0);
        }
      }
    } catch {
      toast.error('Could not load contacts.');
    } finally {
      setLoading(false);
    }
  }, [search, view, offset]);

  useEffect(() => {
    if (!open) {
      // Let the next open pick its own bucket again, from the first page.
      autoViewRef.current = false;
      setOffset(0);
      return;
    }
    void load();
  }, [open, load]);

  /**
   * Switch bucket, always landing on the first page.
   *
   * Paging state is per-bucket in the user's head but a single variable here,
   * so without the reset, moving from page 6 of Skipped to a Pending bucket
   * with 40 rows would show an empty list and read as "nothing to review".
   */
  const changeView = (next: 'pending' | 'skipped' | 'imported') => {
    setView(next);
    setOffset(0);
  };

  /**
   * Guards against a second run starting while one is in flight.
   *
   * A ref, not the `working` state, on purpose: setState is asynchronous, so
   * two clicks landing in the same React batch both saw `working === false`
   * and both started. A ref updates synchronously and closes that window.
   *
   * The server is safe regardless — `contacts` has a unique index on
   * (account_id, phone_normalized), so duplicates cannot be created — but
   * two loops racing still doubles the requests and makes the progress
   * counter jump around.
   */
  const runningRef = useRef(false);

  const act = async (
    action: 'import' | 'skip' | 'unskip' | 'import_all',
    ids?: string[]
  ) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setWorking(true);

    const isBulk = action === 'import_all';
    // A bulk run drains whichever bucket is on screen. Without this, "Import
    // all" from the Skipped tab would have imported the pending queue
    // instead — and with pending empty, done nothing at all.
    const scope = view === 'skipped' ? 'skipped' : 'pending';
    // Snapshot the starting total so the progress bar has a fixed
    // denominator. Reading it from each response instead would make the bar
    // stretch as the queue drains.
    const startingTotal = isBulk ? total : (ids?.length ?? 0);
    setProgress(isBulk ? { done: 0, total: startingTotal } : null);

    let totalImported = 0;
    let totalExisted = 0;
    let totalSkipped = 0;
    let totalUnskipped = 0;
    /**
     * Contacts that already existed but were named after their own phone
     * number and have now been given the name from the address book.
     *
     * Reported because it is the outcome the operator is usually after. The
     * common case on a coexistence account is that chat history already
     * created every contact, so an import legitimately reports
     * "0 imported, 38 already in your CRM" — a message that reads as "nothing
     * happened" even when 38 rows just gained their real names.
     */
    let totalRenamed = 0;
    const allFailures: string[] = [];

    try {
      // The server handles a slice per call and reports what is left, so
      // this loops until the queue is empty. A single request could not
      // finish 1,417 contacts inside the route's time budget.
      for (;;) {
        const res = await fetch('/api/whatsapp/coexistence/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids, scope }),
        });
        const data = await res.json();

        if (!res.ok) {
          toast.error(data?.error || 'That did not work.');
          break;
        }

        totalImported += data.imported ?? 0;
        totalExisted += data.already_existed ?? 0;
        totalSkipped += data.skipped ?? 0;
        totalUnskipped += data.unskipped ?? 0;
        totalRenamed += data.renamed ?? 0;
        // The API returns exact per-status counts with every mutation, which
        // beats re-deriving them from a single capped page.
        if (data.counts) setCounts(data.counts);
        if (Array.isArray(data.failures)) allFailures.push(...data.failures);

        if (isBulk) {
          const handled = totalImported + totalExisted + totalSkipped;
          setProgress({
            // Clamped: `already_existed` can exceed the original pending
            // count when a concurrent sync adds rows, and a bar past 100%
            // looks broken.
            done: Math.min(handled, startingTotal),
            total: startingTotal,
          });
        }

        // Only bulk actions continue. A single-row action is one request.
        if (!isBulk) break;
        if ((data.remaining ?? 0) <= 0) break;
        // Nothing moved but rows remain — stop rather than spin forever.
        // Happens if every remaining row has an unusable phone number.
        if (
          (data.imported ?? 0) === 0 &&
          (data.already_existed ?? 0) === 0 &&
          (data.skipped ?? 0) === 0
        ) {
          break;
        }
      }

      // Named separately from imported, because a rename is the visible
      // result on an account whose contacts all already exist.
      const namedSuffix = totalRenamed
        ? ` · ${totalRenamed} got ${totalRenamed === 1 ? 'its' : 'their'} name from your phone`
        : '';

      if (totalImported > 0) {
        toast.success(
          `${totalImported} contact${totalImported === 1 ? '' : 's'} imported` +
            (totalExisted ? ` · ${totalExisted} already in your CRM` : '') +
            namedSuffix
        );
      } else if (totalRenamed > 0) {
        // Checked BEFORE the already-existed branch on purpose. Otherwise the
        // one run that actually fixes the phone-number names reports only
        // "38 were already in your CRM", which is what made this look broken.
        toast.success(
          `${totalRenamed} contact${totalRenamed === 1 ? '' : 's'} renamed from your phone's address book` +
            (totalExisted > totalRenamed
              ? ` · ${totalExisted - totalRenamed} already had a name`
              : '')
        );
      } else if (totalSkipped > 0) {
        // Says where they went and that it is undoable. A bare "N skipped"
        // was what made a skip feel like a deletion.
        toast.success(
          `${totalSkipped} moved to Skipped — you can import them any time`
        );
      } else if (totalUnskipped > 0) {
        toast.success(`${totalUnskipped} moved back to review`);
      } else if (totalExisted > 0) {
        toast.success(`${totalExisted} were already in your CRM`);
      }

      // Partial failures are surfaced, not swallowed — the operator needs
      // to know which numbers did not land.
      if (allFailures.length > 0) {
        toast.error(
          `${allFailures.length} did not import: ${allFailures.slice(0, 2).join('; ')}`
        );
      }

      await load();
      // Let the host page refresh. The Contacts page shows the very rows this
      // just created, so leaving it stale would look like the import failed.
      // A rename counts too: the name on screen is the thing that changed.
      if (totalImported > 0 || totalExisted > 0 || totalRenamed > 0)
        onImported?.();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      runningRef.current = false;
      setWorking(false);
      setProgress(null);
    }
  };

  /**
   * Whether rows in the current bucket can be acted on.
   *
   * False on Imported, which is a record of decisions already made, not a
   * queue. It used to render the same checkboxes and Import button as the
   * other tabs, and clicking Import there did nothing at all — the API only
   * accepts 'pending' or 'skipped' as a source status, so the request came
   * back `unchanged` and no toast fired. A button whose sole outcome is a
   * silent no-op is worse than no button.
   *
   * Un-importing is deliberately not offered here either: the row points at a
   * live CRM contact, so undoing it means deleting that contact, which belongs
   * on the Contacts page. Deleting it there returns this row to "To review"
   * on its own (migration 074).
   */
  const selectable = view !== 'imported';

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
      {/* Flex column, not the default grid: the list is the only part allowed
          to scroll, so the header stays put and the action buttons stay on
          screen. With `grid` the rows just added up past max-h and
          `overflow-hidden` clipped the footer off the bottom of the viewport —
          on a short window the Import buttons were unreachable. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Contacts from your phone</DialogTitle>
          <DialogDescription>
            {/* `received` rather than `total`: total is the size of the bucket
                on screen, which made the heading shrink as work got done and
                read as contacts going missing. */}
            {counts.received} number
            {counts.received === 1 ? '' : 's'}{' '}
            {/* Explicit space: JSX strips whitespace that wraps a line break
                next to an expression, which rendered "1788 numberscame". */}
            came from your phone&apos;s address book so far. Import the
            customers; skip anything personal. Skipping is not permanent —
            skipped numbers stay under their own tab and can be imported
            whenever you want.
          </DialogDescription>
          {/* The counts, spelled out, because "how much is synced and how much
              is left" was not answerable from this screen before: the tabs
              showed three buckets and nothing said what the whole was.

              No percentage and no progress bar for the address book, and that
              is deliberate — Meta sends it as an open-ended stream with no
              total, no chunk index and no completion signal. A bar would need
              a denominator that does not exist, and would finish at the wrong
              moment. Chat history is different (Meta sends a real percentage)
              and has its own bar in Settings → WhatsApp Setup. */}
          {counts.received > 0 ? (
            <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {counts.imported} imported · {counts.pending} to review ·{' '}
              {counts.skipped} skipped
              {counts.removed > 0
                ? ` · ${counts.removed} deleted from the phone`
                : ''}
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="relative shrink-0">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // A new query is a new result set; keeping the old offset
                // would open it on a page that may not exist.
                setOffset(0);
              }}
              placeholder="Search by name or number"
              className="pl-9"
              aria-label="Search staged contacts"
            />
          </div>

          {/* Real progress during a bulk run.
              Replaces an indeterminate spinner that, on 1,417 contacts,
              was indistinguishable from the page having hung. */}
          {working && progress ? (
            <div className="border-border bg-muted/40 shrink-0 space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground flex items-center gap-1.5 font-medium">
                  <Loader2 className="text-primary size-3.5 animate-spin" />
                  Importing contacts…
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {progress.done} of {progress.total}
                </span>
              </div>
              <div
                className="bg-border h-1.5 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label="Contact import progress"
              >
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${
                      progress.total > 0
                        ? Math.round((progress.done / progress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-muted-foreground text-[10px]">
                Processed in batches of 200. Leave this open until it finishes.
              </p>
            </div>
          ) : null}

          {/* Buckets. The Skipped tab is the whole point: it makes a skip a
              visible, reversible state instead of a disappearance. */}
          <div className="border-border bg-muted/30 flex shrink-0 items-center gap-1 rounded-lg border p-1">
            {(
              [
                ['pending', 'To review', counts.pending],
                ['skipped', 'Skipped', counts.skipped],
                ['imported', 'Imported', counts.imported],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                disabled={working}
                onClick={() => changeView(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  view === key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
                {count > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] tabular-nums',
                      view === key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Where you are, and how to move.

              This replaced a dead end. The old line read "Showing the first
              200 of 3,703. Act on these and the rest will load." — which was
              only true of bulk import. Anyone wanting to pick the 400th
              contact had no way to see it, so per-contact selection was
              effectively capped at whatever sorted into the first page. */}
          {(offset > 0 || hasMore) && !progress ? (
            <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-2 text-xs">
              <span className="tabular-nums">
                {total === 0
                  ? 'No matches'
                  : `${offset + 1}–${offset + contacts.length} of ${total}`}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={working || loading || offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={working || loading || !hasMore}
                  onClick={() => setOffset((o) => o + pageSize)}
                >
                  Next
                </Button>
              </span>
            </div>
          ) : null}

          {/* The only scroll container. `min-h-0` is what makes it work — a
              flex item defaults to min-height:auto and would refuse to shrink
              below its content, pushing the footer out of view again. */}
          <div className="border-border min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border p-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="text-primary size-5 animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {view === 'pending'
                  ? counts.skipped > 0
                    ? // Points at where they went. The old copy said "Nothing
                      // left to review" with 1,788 rows sitting in Skipped,
                      // which read as "they are gone".
                      `Nothing left to review. ${counts.skipped} skipped number${counts.skipped === 1 ? '' : 's'} can still be imported.`
                    : 'Nothing left to review.'
                  : view === 'skipped'
                    ? 'Nothing skipped.'
                    : 'Nothing imported yet.'}
              </p>
            ) : (
              contacts.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    // Imported rows are a record, not a queue. Selecting them
                    // offered an Import button whose only possible outcome was
                    // a silent no-op, since the API refuses 'imported' as a
                    // source status.
                    disabled={!selectable}
                    onClick={() => toggle(c.id)}
                    aria-pressed={selectable ? isSelected : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                      isSelected ? 'bg-primary/10' : '',
                      selectable ? 'hover:bg-muted' : 'cursor-default'
                    )}
                  >
                    {selectable ? (
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40'
                        )}
                      >
                        {isSelected ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : null}
                      </span>
                    ) : (
                      <Check
                        className="text-primary size-4 shrink-0"
                        strokeWidth={3}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {c.full_name || c.first_name || c.phone}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
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

          {/* ── Actions ──────────────────────────────────────────────
              Selection-driven, and NO "Skip all".

              Bulk import is offered because it is additive and undoable —
              delete the contact and migration 074 returns the row here.
              Bulk skip was neither: one click emptied the queue with no
              visible undo, which is exactly how 1,788 numbers appeared to
              vanish. Skipping is now something you do to a selection you
              actually looked at.

              Select-all-on-page is the middle ground for "skip these 200",
              rather than a button that silently takes everything. */}
          <div className="border-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              {selectable ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working || contacts.length === 0}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.size === contacts.length
                          ? new Set()
                          : new Set(contacts.map((c) => c.id))
                      )
                    }
                    className="text-muted-foreground"
                  >
                    {selected.size === contacts.length && contacts.length > 0
                      ? 'Clear selection'
                      : `Select these ${contacts.length}`}
                  </Button>

                  {selected.size > 0 ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {selected.size} selected
                    </span>
                  ) : null}
                </>
              ) : (
                // Says where the undo lives instead of leaving a dead-end tab.
                <p className="text-muted-foreground max-w-[46ch] text-xs">
                  Already in your CRM. To remove one, delete it on the Contacts
                  page — it will come back here to review.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Import works from BOTH review buckets: changing your mind
                  about a skipped number should not require un-skipping it
                  first. Not offered on Imported, where it can only no-op. */}
              {selectable ? (
                <Button
                  size="sm"
                  disabled={working || selected.size === 0}
                  onClick={() => act('import', [...selected])}
                >
                  {working && !progress ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Import {selected.size > 0 ? selected.size : 'selected'}
                </Button>
              ) : null}

              {view === 'pending' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working || selected.size === 0}
                  onClick={() => act('skip', [...selected])}
                >
                  Skip {selected.size > 0 ? selected.size : 'selected'}
                </Button>
              ) : null}

              {view === 'skipped' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working || selected.size === 0}
                  onClick={() => act('unskip', [...selected])}
                >
                  <RefreshCw className="size-3.5" />
                  Move back to review
                </Button>
              ) : null}

              {/* Offered from Skipped too, and that is the fix for the state
                  the old "Skip all" left behind: 1,788 rows in Skipped were
                  only recoverable 200 at a time, nine pages of clicking. */}
              {(view === 'pending' || view === 'skipped') && total > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() => act('import_all')}
                >
                  {working && progress ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Import all{' '}
                  {view === 'skipped'
                    ? counts.skipped
                    : counts.pending || total}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
