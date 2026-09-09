'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Search, Undo2, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

/**
 * Stored numbers are digits-only (that is the suppression key), so they
 * just need a leading `+` to read as a phone number.
 *
 * Deliberately not `formatDisplayPhoneNumber` from
 * `@/lib/whatsapp/format-phone-display`: that one is about Meta's
 * `display_phone_number` and returns `null` for input it distrusts, which
 * would render as an empty cell for a number we know we hold.
 */
function displayPhone(digits: string): string {
  return digits ? `+${digits}` : '—';
}

interface OptOutItem {
  id: string;
  phone: string;
  contact_id: string | null;
  contact_name: string | null;
  source: string;
  opted_out_at: string;
}

/**
 * How each opt-out got recorded, in words an operator can act on.
 *
 * `meta_131050` is the one worth spelling out: Meta refused a send
 * because the customer had opted out at the platform level, which can
 * happen without them ever messaging this business.
 */
const SOURCE_COPY: Record<string, { label: string; tone: string }> = {
  customer_keyword: {
    label: 'Replied with a keyword',
    tone: 'border-border bg-muted/40 text-foreground',
  },
  customer_button: {
    label: 'Tapped opt-out button',
    tone: 'border-border bg-muted/40 text-foreground',
  },
  meta_131050: {
    label: 'Reported by Meta',
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  agent: {
    label: 'Added by your team',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  api: {
    label: 'Added via API',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  import: {
    label: 'Imported',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
};

export function OptOutList({ onChanged }: { onChanged?: () => void }) {
  const confirm = useConfirm();

  const [items, setItems] = useState<OptOutItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  // Debounced copy — the query runs on this, so typing does not fire a
  // request per keystroke.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      // Any new search starts from the first page; keeping the old offset
      // can land on an empty page and read as "no results".
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (appliedSearch.trim()) params.set('search', appliedSearch.trim());

      const res = await fetch(`/api/whatsapp/opt-in-out/list?${params}`);
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.error || 'Could not load the opt-out list.');
        return;
      }
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
    } catch {
      toast.error('Could not load the opt-out list.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const resubscribe = async (item: OptOutItem) => {
    const who = item.contact_name || displayPhone(item.phone);
    const ok = await confirm({
      title: 'Re-subscribe this contact?',
      description: `${who} asked not to receive marketing messages. Only re-subscribe them if they have since agreed — marketing templates will start reaching them again.`,
      confirmText: 'Re-subscribe',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    setRemoving(item.phone);
    try {
      const res = await fetch(
        `/api/whatsapp/opt-in-out/list?phone=${encodeURIComponent(item.phone)}`,
        { method: 'DELETE' }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.error || 'Could not re-subscribe that number.');
        return;
      }
      toast.success(`${who} can receive marketing messages again.`);
      // If this was the last row on the final page, step back so the user
      // is not left staring at an empty table.
      if (items.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      } else {
        await load();
      }
      onChanged?.();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setRemoving(null);
    }
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const searching = appliedSearch.trim().length > 0;

  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-foreground text-sm font-semibold">
            Unsubscribed numbers
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Everyone currently excluded from marketing templates, and how they
            got there.
          </p>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number"
            aria-label="Search unsubscribed numbers"
            className="h-8 w-44 pl-8 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="text-primary size-4 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="border-border/80 mt-4 rounded-lg border border-dashed p-6 text-center">
          <UserX className="text-muted-foreground/60 mx-auto size-5" />
          <p className="text-muted-foreground mt-2 text-xs">
            {searching
              ? 'No unsubscribed number matches that search.'
              : 'Nobody has unsubscribed yet.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-border/70 mt-4 divide-y">
            {items.map((item) => {
              const copy = SOURCE_COPY[item.source] ?? {
                label: item.source,
                tone: 'border-border bg-muted/40 text-muted-foreground',
              };
              const isRemoving = removing === item.phone;

              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-xs font-medium">
                      {item.contact_name || displayPhone(item.phone)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                      {/* Always show the number too: it is the suppression
                          key, so it is what an operator needs when
                          cross-checking against Meta or a CSV. */}
                      {displayPhone(item.phone)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        copy.tone
                      )}
                    >
                      {copy.label}
                    </span>
                    <span className="text-muted-foreground w-20 text-right text-[11px] tabular-nums">
                      {format(new Date(item.opted_out_at), 'd MMM yyyy')}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void resubscribe(item)}
                      disabled={isRemoving}
                      className="text-muted-foreground hover:text-foreground h-7 cursor-pointer gap-1 px-2 text-[11px]"
                    >
                      {isRemoving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Undo2 className="size-3" />
                      )}
                      Re-subscribe
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {total > PAGE_SIZE ? (
            <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
              <p className="text-muted-foreground text-[11px] tabular-nums">
                {pageStart}–{pageEnd} of {total.toLocaleString('en-US')}
              </p>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="h-7 px-2 text-[11px]"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageEnd >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="h-7 px-2 text-[11px]"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
