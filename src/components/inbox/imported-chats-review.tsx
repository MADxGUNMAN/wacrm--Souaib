'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Review the chats a coexistence connection imported.
 *
 * ─── What this replaced ───────────────────────────────────────
 *
 * Connecting a coexistence number used to drop the phone's entire chat
 * history straight into the inbox — 69 conversations and 7,533 messages
 * on the reference account, personal chats included, with no indication
 * of what was arriving, how much there was, or any way to choose.
 *
 * ─── Why the numbers here are shaped the way they are ─────────
 *
 * Meta PUSHES history, once, inside a 24-hour window, and it cannot be
 * requested incrementally or replayed. So this screen does not — and
 * cannot — control how much Meta sends. Everything is received and stored
 * immediately, because refusing it loses it forever; what is batched is
 * the DECISION about what enters the inbox.
 *
 * That is why the headline is "N chats waiting" and not a percentage:
 * a percentage would need a denominator Meta never sends. The genuine
 * progress figure for the import itself lives in Settings → WhatsApp
 * Setup, where Meta's own `metadata.progress` is reported per phase.
 */

interface ImportedChat {
  id: string;
  last_message_text: string | null;
  last_message_at: string | null;
  message_count: number;
  contact: { id: string; name: string | null; phone: string } | null;
}

export function ImportedChatsReview({
  /** Called after any approval so the inbox can refetch and show them. */
  onApproved,
}: {
  onApproved?: () => void;
}) {
  const [counts, setCounts] = useState({ pending: 0, live: 0, rejected: 0 });
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<ImportedChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [view, setView] = useState<'pending_review' | 'rejected'>(
    'pending_review'
  );

  /**
   * Counts are fetched even while the dialog is closed, because the banner
   * is the only thing that tells an operator imported chats exist at all.
   * Without it the gate would look exactly like the history sync having
   * silently failed — which is a worse bug than the one being fixed.
   */
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch(
        '/api/whatsapp/coexistence/chats?state=pending_review&offset=0'
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.counts) setCounts(data.counts);
    } catch {
      // Silent: an account with no coexistence connection has nothing here,
      // and that is not worth interrupting the inbox for.
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ state: view });
      if (offset > 0) params.set('offset', String(offset));
      const res = await fetch(
        `/api/whatsapp/coexistence/chats?${params.toString()}`
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Could not load imported chats.');
        return;
      }
      setChats(data.chats ?? []);
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.has_more));
      if (typeof data.page_size === 'number') setPageSize(data.page_size);
      if (data.counts) setCounts(data.counts);
      setSelected(new Set());

      // Approving the last rows on a page leaves it empty while earlier
      // pages still have content. Step back rather than showing an empty
      // list on page 2 of 2, which reads as the queue being finished.
      if ((data.chats?.length ?? 0) === 0 && offset > 0) {
        setOffset((o) => Math.max(0, o - (data.page_size ?? 50)));
      }
    } catch {
      toast.error('Could not load imported chats.');
    } finally {
      setLoading(false);
    }
  }, [view, offset]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  /**
   * Synchronous double-run guard. `working` is state and setState is async,
   * so two clicks landing in the same React batch both saw it false and both
   * started a loop.
   */
  const runningRef = useRef(false);

  const act = async (
    action: 'approve' | 'reject' | 'approve_all',
    ids?: string[]
  ) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setWorking(true);

    const isBulk = action === 'approve_all';
    const startingTotal = isBulk ? counts.pending : (ids?.length ?? 0);
    setProgress(isBulk ? { done: 0, total: startingTotal } : null);

    let approved = 0;
    let rejected = 0;

    try {
      // The server handles a slice per call and reports what is left, so
      // this loops until the queue drains. One request could not approve
      // thousands of chats inside the route's time budget.
      for (;;) {
        const res = await fetch('/api/whatsapp/coexistence/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || 'That did not work.');
          break;
        }

        approved += data.approved ?? 0;
        rejected += data.rejected ?? 0;
        if (data.counts) setCounts(data.counts);

        if (isBulk) {
          setProgress({
            done: Math.min(approved, startingTotal),
            total: startingTotal,
          });
        }

        if (!isBulk) break;
        if ((data.remaining ?? 0) <= 0) break;
        // Nothing moved but rows remain — stop rather than spin forever.
        if ((data.approved ?? 0) === 0) break;
      }

      if (approved > 0) {
        toast.success(
          `${approved} chat${approved === 1 ? '' : 's'} added to your inbox`
        );
      } else if (rejected > 0) {
        // Says where they went and that it is undoable. A bare "N rejected"
        // is what makes this feel like a deletion.
        toast.success(
          `${rejected} hidden — they stay under Rejected and can be added back any time`
        );
      }

      await load();
      if (approved > 0) onApproved?.();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      runningRef.current = false;
      setWorking(false);
      setProgress(null);
    }
  };

  // Nothing imported and nothing rejected: this account has no coexistence
  // history, so the banner would be noise.
  if (counts.pending === 0 && counts.rejected === 0) return null;

  const changeView = (next: 'pending_review' | 'rejected') => {
    setView(next);
    setOffset(0);
  };

  return (
    <>
      {counts.pending > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 shrink-0 text-emerald-500" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              <span className="font-semibold tabular-nums">
                {counts.pending}
              </span>{' '}
              chat{counts.pending === 1 ? '' : 's'} imported from your phone{' '}
              {/* Says explicitly that nothing was lost. Without this the
                  gate is indistinguishable from the sync having failed. */}
              — kept out of your inbox until you choose.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setOpen(true)}
          >
            Review
          </Button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>Chats imported from your phone</DialogTitle>
            <DialogDescription>
              WhatsApp sent your chat history when you connected. It is all
              saved — Meta only sends it once, so nothing is thrown away — but
              only the chats you approve appear in your inbox. Hiding one is
              reversible.
            </DialogDescription>
            <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {counts.pending} waiting · {counts.live} in your inbox ·{' '}
              {counts.rejected} hidden
            </p>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {working && progress ? (
              <div className="border-border bg-muted/40 shrink-0 space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground flex items-center gap-1.5 font-medium">
                    <Loader2 className="text-primary size-3.5 animate-spin" />
                    Adding chats…
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
                  aria-label="Chat approval progress"
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
              </div>
            ) : null}

            <div className="border-border bg-muted/30 flex shrink-0 items-center gap-1 rounded-lg border p-1">
              {(
                [
                  ['pending_review', 'Waiting', counts.pending],
                  ['rejected', 'Hidden', counts.rejected],
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

            {offset > 0 || hasMore ? (
              <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-2 text-xs">
                <span className="tabular-nums">
                  {total === 0
                    ? 'None'
                    : `${offset + 1}–${offset + chats.length} of ${total}`}
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

            <div className="border-border min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border p-1">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="text-primary size-5 animate-spin" />
                </div>
              ) : chats.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">
                  {view === 'pending_review'
                    ? 'Nothing waiting.'
                    : 'Nothing hidden.'}
                </p>
              ) : (
                chats.map((c) => {
                  const isSelected = selected.has(c.id);
                  const label =
                    c.contact?.name || c.contact?.phone || 'Unknown';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      aria-pressed={isSelected}
                      className={cn(
                        'hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-primary/10' : ''
                      )}
                    >
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
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-sm font-medium">
                          {label}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {c.last_message_text || 'No preview'}
                        </span>
                      </span>
                      {/* The message count is how you tell a real customer
                          thread from a one-message wrong number without
                          opening either. */}
                      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
                        <MessageSquare className="size-3" />
                        {c.message_count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={working || chats.length === 0}
                  onClick={() =>
                    setSelected((prev) =>
                      prev.size === chats.length
                        ? new Set()
                        : new Set(chats.map((c) => c.id))
                    )
                  }
                  className="text-muted-foreground"
                >
                  {selected.size === chats.length && chats.length > 0
                    ? 'Clear selection'
                    : `Select these ${chats.length}`}
                </Button>
                {selected.size > 0 ? (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {selected.size} selected
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={working || selected.size === 0}
                  onClick={() => act('approve', [...selected])}
                >
                  <Check className="size-3.5" />
                  Add {selected.size > 0 ? selected.size : 'selected'}
                </Button>

                {view === 'pending_review' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working || selected.size === 0}
                      onClick={() => act('reject', [...selected])}
                    >
                      <X className="size-3.5" />
                      Hide {selected.size > 0 ? selected.size : 'selected'}
                    </Button>

                    {/* Bulk APPROVE only. There is deliberately no "hide
                        all": one click would empty the queue with no visible
                        undo, and Meta cannot resend the history. */}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={working || counts.pending === 0}
                      onClick={() => act('approve_all')}
                    >
                      {working && progress ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      Add all {counts.pending}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
