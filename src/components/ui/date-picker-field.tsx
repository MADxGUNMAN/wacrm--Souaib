'use client';

// ============================================================
// A plain-text date field with a calendar dropdown, instead of the
// browser's native `<input type="date">`.
//
// ─── Why not the native date input ────────────────────────────────
//
// A native date input renders its little calendar icon and its OWN
// popup calendar entirely inside the OS/browser, outside React and
// outside this app's styling. Two symptoms that produces, both real:
//
//   1. Clicking anywhere in the field can select its text like any
//      other input, and a stray double-click or the browser's own
//      focus-select behaviour looks exactly like "it tried to copy it".
//   2. Clicking the (invisible, browser-styled) calendar affordance pops
//      the OS calendar widget — which paints ABOVE this app's dialog,
//      because it is not a DOM node this app controls and cannot share
//      the dialog's z-index or portal.
//
// Both were reported as "the box tries to copy it and sometimes opens
// a calendar" on the subscriber Manage dialog's end-date field.
//
// ─── The fix ───────────────────────────────────────────────────────
//
// Read-only text input (so there is nothing native to select/copy or
// trigger a browser calendar from) plus our OWN calendar rendered in a
// `Popover`, which is a real DOM node inside this app's z-50 layer and
// therefore stacks correctly above/inside the dialog that opened it.
// ============================================================

import { useMemo, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DatePickerFieldProps {
  /** ISO date, `YYYY-MM-DD`, or empty. Same shape `<input type="date">` used. */
  value: string;
  onChange: (value: string) => void;
  /** ISO date. Days before this are not selectable. */
  min?: string;
  /** ISO date. Days after this are not selectable. */
  max?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function formatDisplay(value: string): string {
  const parsed = parseIso(value);
  if (!parsed) return '';
  return new Date(parsed.y, parsed.m, parsed.d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DatePickerField({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select a date',
  className,
  disabled,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const selected = parseIso(value);
  const minParsed = min ? parseIso(min) : null;
  const maxParsed = max ? parseIso(max) : null;

  // The month currently shown. Starts on the selected date if there is
  // one, otherwise today — never a fixed epoch, or picking a far-future
  // date once means clicking "next month" dozens of times every time the
  // field is reopened.
  const [viewYear, setViewYear] = useState(
    selected?.y ?? new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    selected?.m ?? new Date().getMonth()
  );

  const monthLabel = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [viewYear, viewMonth]
  );

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // getDay() is 0=Sunday; shifted so the grid starts on Monday to match
    // WEEKDAY_LABELS.
    const leadingBlanks = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++)
      cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toIso(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isOutOfRange = (iso: string): boolean => {
    if (minParsed && iso < toIso(minParsed.y, minParsed.m, minParsed.d)) {
      return true;
    }
    if (maxParsed && iso > toIso(maxParsed.y, maxParsed.m, maxParsed.d)) {
      return true;
    }
    return false;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          'border-input flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 py-1 text-left text-sm shadow-sm transition-colors',
          'focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !open && 'hover:bg-accent/40',
          className
        )}
      >
        <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
        <span className={cn(!value && 'text-muted-foreground')}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-medium">{monthLabel}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="text-muted-foreground text-center text-[11px] font-medium"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {days.map((cell, i) => {
            if (cell.day === null || cell.iso === null) {
              return <div key={i} />;
            }
            const blocked = isOutOfRange(cell.iso);
            const isSelected = cell.iso === value;
            return (
              <button
                key={cell.iso}
                type="button"
                disabled={blocked}
                onClick={() => {
                  onChange(cell.iso!);
                  setOpen(false);
                }}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : blocked
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'hover:bg-accent'
                )}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
