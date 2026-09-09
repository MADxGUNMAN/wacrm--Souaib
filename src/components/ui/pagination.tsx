'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Numbered pagination with a jump-to-page box.
 *
 * Replaces prev/next-only controls. On 1,788 contacts that is 72 pages, so
 * reaching page 60 meant 59 clicks and 59 round trips — the data was there,
 * but effectively unreachable.
 *
 * Pages are 1-based here even where a caller stores a 0-based index. "Page 1"
 * is what the operator sees and types, and off-by-one bugs in pagination are
 * both easy to write and hard to notice.
 */

/** A gap is rendered as an ellipsis; the two are distinct so React keys are stable. */
type Slot = number | 'gap-left' | 'gap-right';

/**
 * Which page buttons to render.
 *
 * Always includes the first and last page, the current page, and `siblings`
 * either side of it. Everything else collapses into at most two gaps, so the
 * control stays the same width at 5 pages and at 500.
 */
export function paginationSlots(
  page: number,
  totalPages: number,
  siblings = 1
): Slot[] {
  // first + last + current + 2 siblings + 2 gaps
  const maxSlots = siblings * 2 + 5;

  if (totalPages <= maxSlots) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, totalPages);

  // Anchored at the start: no left gap, so the right side gets the pages the
  // gap would have taken. Without this the control would visibly change width
  // as it moves through the range.
  const showLeftGap = left > 2;
  const showRightGap = right < totalPages - 1;

  if (!showLeftGap && showRightGap) {
    const end = Math.max(maxSlots - 2, right);
    return [
      ...Array.from({ length: end }, (_, i) => i + 1),
      'gap-right',
      totalPages,
    ];
  }

  if (showLeftGap && !showRightGap) {
    const start = Math.min(totalPages - (maxSlots - 3), left);
    return [
      1,
      'gap-left',
      ...Array.from({ length: totalPages - start + 1 }, (_, i) => start + i),
    ];
  }

  return [
    1,
    'gap-left',
    ...Array.from({ length: right - left + 1 }, (_, i) => left + i),
    'gap-right',
    totalPages,
  ];
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  siblings = 1,
  /** Shown on the jump box, which only appears once paging is genuinely long. */
  jumpLabel = 'Go to page',
  jumpThreshold = 10,
  className,
}: {
  /** Current page, 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  siblings?: number;
  jumpLabel?: string;
  jumpThreshold?: number;
  className?: string;
}) {
  const [jump, setJump] = useState('');

  if (totalPages <= 1) return null;

  const go = (next: number) => {
    // Clamped rather than ignored: typing 999 into the jump box should land on
    // the last page, which is obviously what was meant.
    const target = Math.min(Math.max(next, 1), totalPages);
    if (target !== page) onPageChange(target);
  };

  const submitJump = () => {
    const parsed = Number.parseInt(jump, 10);
    if (Number.isNaN(parsed)) return;
    go(parsed);
    setJump('');
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {/* First and last are offered because they are the two destinations a
          long list is most often paged toward, and both were previously
          dozens of clicks away. */}
      <Button
        variant="outline"
        size="icon-sm"
        disabled={disabled || page <= 1}
        onClick={() => go(1)}
        aria-label="First page"
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronsLeft className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={disabled || page <= 1}
        onClick={() => go(page - 1)}
        aria-label="Previous page"
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronLeft className="size-4" />
      </Button>

      {paginationSlots(page, totalPages, siblings).map((slot) =>
        typeof slot === 'number' ? (
          <Button
            key={slot}
            variant={slot === page ? 'default' : 'outline'}
            size="icon-sm"
            disabled={disabled}
            onClick={() => go(slot)}
            // Announces WHICH page is current to a screen reader, which the
            // colour change alone does not.
            aria-current={slot === page ? 'page' : undefined}
            className={cn(
              'min-w-8 px-1 text-xs tabular-nums',
              slot === page
                ? ''
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {slot}
          </Button>
        ) : (
          <span
            key={slot}
            aria-hidden
            className="text-muted-foreground px-1 text-xs select-none"
          >
            …
          </span>
        )
      )}

      <Button
        variant="outline"
        size="icon-sm"
        disabled={disabled || page >= totalPages}
        onClick={() => go(page + 1)}
        aria-label="Next page"
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={disabled || page >= totalPages}
        onClick={() => go(totalPages)}
        aria-label="Last page"
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronsRight className="size-4" />
      </Button>

      {/* Only past the threshold. On 4 pages the numbers are all visible and a
          jump box would be clutter; on 72 it is the fastest route to page 60. */}
      {totalPages > jumpThreshold ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitJump();
          }}
          className="ml-1 flex items-center gap-1"
        >
          <Input
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
            // Numeric keypad on mobile without type="number", which brings
            // spinners and lets non-numeric text through in some browsers.
            inputMode="numeric"
            disabled={disabled}
            placeholder={jumpLabel}
            aria-label={jumpLabel}
            className="h-8 w-28 text-xs"
          />
        </form>
      ) : null}
    </nav>
  );
}
