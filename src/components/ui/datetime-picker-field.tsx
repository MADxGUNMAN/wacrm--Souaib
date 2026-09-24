import { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { msToLocalInput } from '@/lib/whatsapp/template-send-inputs';

export interface DateTimePickerFieldProps {
  /** ISO local datetime string: "YYYY-MM-DDTHH:mm" */
  value: string;
  onChange: (value: string) => void;
  /** Floor datetime string: "YYYY-MM-DDTHH:mm". Moments before this are disabled. */
  min?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  timeZone?: string;
}

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseLocalDateTime(value: string): {
  year: number;
  month: number; // 0-11
  day: number;
  hours24: number; // 0-23
  hours12: number; // 1-12
  minutes: number; // 0-59
  period: 'AM' | 'PM';
  isoDate: string; // YYYY-MM-DD
} | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hours24 = Number(match[4]);
  const minutes = Number(match[5]);

  const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;

  return { year, month, day, hours24, hours12, minutes, period, isoDate };
}

export function toLocalDateTimeString(
  year: number,
  month: number, // 0-11
  day: number,
  hours12: number,
  minutes: number,
  period: 'AM' | 'PM'
): string {
  let hours24 = hours12 % 12;
  if (period === 'PM') {
    hours24 += 12;
  }
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours24)}:${pad(minutes)}`;
}

export function formatDisplayDateTime(value: string): string {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return '';
  const d = new Date(
    parsed.year,
    parsed.month,
    parsed.day,
    parsed.hours24,
    parsed.minutes
  );
  const datePart = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${datePart} at ${pad(parsed.hours12)}:${pad(parsed.minutes)} ${parsed.period}`;
}

export function DateTimePickerField({
  value,
  onChange,
  min,
  placeholder = 'Pick a date and time',
  className,
  disabled,
  timeZone,
}: DateTimePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const parsedValue = useMemo(() => parseLocalDateTime(value), [value]);
  const parsedMin = useMemo(
    () => (min ? parseLocalDateTime(min) : null),
    [min]
  );

  const now = useMemo(() => new Date(), []);
  const [viewState, setViewState] = useState<{
    year: number;
    month: number;
  } | null>(null);

  const viewYear = viewState?.year ?? parsedValue?.year ?? now.getFullYear();
  const viewMonth = viewState?.month ?? parsedValue?.month ?? now.getMonth();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && parsedValue) {
      setViewState({ year: parsedValue.year, month: parsedValue.month });
    }
  };

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }, [viewYear, viewMonth]);

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // getDay(): 0=Sun; shift so Monday is 0
    const leadingBlanks = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: { day: number | null; isoDate: string | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ day: null, isoDate: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isoDate: `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewState({ year: viewYear - 1, month: 11 });
    } else {
      setViewState({ year: viewYear, month: viewMonth - 1 });
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewState({ year: viewYear + 1, month: 0 });
    } else {
      setViewState({ year: viewYear, month: viewMonth + 1 });
    }
  };

  const isDateBeforeMin = (isoDate: string): boolean => {
    if (!parsedMin) return false;
    return isoDate < parsedMin.isoDate;
  };

  // Time components
  const currentHours12 = parsedValue?.hours12 ?? 12;
  const currentMinutes = parsedValue?.minutes ?? 0;
  const currentPeriod = parsedValue?.period ?? 'PM';

  const updateTime = (
    newHours12: number,
    newMinutes: number,
    newPeriod: 'AM' | 'PM'
  ) => {
    const y = parsedValue?.year ?? now.getFullYear();
    const m = parsedValue?.month ?? now.getMonth();
    const d = parsedValue?.day ?? now.getDate();
    onChange(toLocalDateTimeString(y, m, d, newHours12, newMinutes, newPeriod));
  };

  const updateDate = (isoDate: string) => {
    const parts = isoDate.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    onChange(
      toLocalDateTimeString(
        y,
        m,
        d,
        currentHours12,
        currentMinutes,
        currentPeriod
      )
    );
  };

  // Presets
  const applyPreset = (hoursAhead: number) => {
    const targetMs = Date.now() + hoursAhead * 60 * 60 * 1000;
    onChange(msToLocalInput(targetMs));
  };

  const applyTomorrowAt = (hour24: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour24, 0, 0, 0);
    onChange(msToLocalInput(d.getTime()));
  };

  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          'border-input bg-card hover:bg-muted/40 text-foreground flex h-10 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm shadow-xs transition-colors',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <CalendarClock className="text-primary size-4 shrink-0" />
          <span
            className={cn(
              'truncate font-medium',
              !value && 'text-muted-foreground font-normal'
            )}
          >
            {value ? formatDisplayDateTime(value) : placeholder}
          </span>
        </div>
        <span className="text-muted-foreground/60 shrink-0 text-xs select-none">
          Change
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="border-border bg-popover text-popover-foreground w-auto max-w-[95vw] rounded-xl border p-4 shadow-2xl"
      >
        {/* Quick presets */}
        <div className="border-border flex flex-wrap items-center gap-1.5 border-b pb-3">
          <span className="text-muted-foreground mr-1 text-xs font-medium select-none">
            Quick:
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-foreground hover:border-primary/50 h-6 px-2 text-xs"
            onClick={() => applyPreset(1)}
          >
            +1 hour
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-foreground hover:border-primary/50 h-6 px-2 text-xs"
            onClick={() => applyPreset(3)}
          >
            +3 hours
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-foreground hover:border-primary/50 h-6 px-2 text-xs"
            onClick={() => applyTomorrowAt(9)}
          >
            Tomorrow 9 AM
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-foreground hover:border-primary/50 h-6 px-2 text-xs"
            onClick={() => applyTomorrowAt(18)}
          >
            Tomorrow 6 PM
          </Button>
        </div>

        <div className="flex flex-col gap-5 pt-1 sm:flex-row">
          {/* ---- Date picker calendar ---- */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={goToPrevMonth}
                aria-label="Previous month"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="text-foreground text-sm font-semibold">
                {monthLabel}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={goToNextMonth}
                aria-label="Next month"
                className="text-muted-foreground hover:text-foreground h-7 w-7"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="text-muted-foreground w-8 text-center text-[11px] font-semibold select-none"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((cell, i) => {
                if (cell.day === null || cell.isoDate === null) {
                  return <div key={i} className="h-8 w-8" />;
                }
                const isPast = isDateBeforeMin(cell.isoDate);
                const isSelected = parsedValue?.isoDate === cell.isoDate;
                const isToday = cell.isoDate === todayIso;

                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    disabled={isPast}
                    onClick={() => updateDate(cell.isoDate!)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all select-none',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        : isPast
                          ? 'text-muted-foreground/30 cursor-not-allowed hover:bg-transparent'
                          : 'text-foreground hover:bg-muted/80',
                      isToday &&
                        !isSelected &&
                        'border-primary/40 text-primary border font-bold'
                    )}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider on desktop */}
          <div className="bg-border hidden w-px sm:block" />

          {/* ---- Time picker controls ---- */}
          <div className="flex flex-col justify-between gap-3.5 sm:w-[270px]">
            <div className="space-y-3">
              <div className="text-foreground flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <Clock className="text-primary size-3.5" />
                  <span>Time of Day</span>
                </div>
                <span className="text-muted-foreground font-mono text-xs font-medium">
                  {pad(currentHours12)}:{pad(currentMinutes)} {currentPeriod}
                </span>
              </div>

              {/* Hour & Minute Pickers */}
              <div className="flex items-center gap-2">
                {/* Hours (1-12) */}
                <div className="flex-1">
                  <label className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                    Hour
                  </label>
                  <div className="relative">
                    <select
                      value={currentHours12}
                      onChange={(e) =>
                        updateTime(
                          Number(e.target.value),
                          currentMinutes,
                          currentPeriod
                        )
                      }
                      aria-label="Hour"
                      className="border-input bg-card text-foreground hover:bg-muted/40 focus:border-primary focus:ring-primary/20 h-10 w-full cursor-pointer appearance-none rounded-lg border pr-7 pl-2.5 text-center font-mono text-sm font-semibold shadow-2xs transition-colors focus:ring-2 focus:outline-none"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option
                          key={h}
                          value={h}
                          className="bg-popover text-popover-foreground"
                        >
                          {pad(h)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
                  </div>
                </div>

                <span className="text-muted-foreground/60 mt-5 font-mono text-base font-bold select-none">
                  :
                </span>

                {/* Minutes (0-59) */}
                <div className="flex-1">
                  <label className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                    Minute
                  </label>
                  <div className="relative">
                    <select
                      value={currentMinutes}
                      onChange={(e) =>
                        updateTime(
                          currentHours12,
                          Number(e.target.value),
                          currentPeriod
                        )
                      }
                      aria-label="Minute"
                      className="border-input bg-card text-foreground hover:bg-muted/40 focus:border-primary focus:ring-primary/20 h-10 w-full cursor-pointer appearance-none rounded-lg border pr-7 pl-2.5 text-center font-mono text-sm font-semibold shadow-2xs transition-colors focus:ring-2 focus:outline-none"
                    >
                      {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                        <option
                          key={m}
                          value={m}
                          className="bg-popover text-popover-foreground"
                        >
                          {pad(m)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
                  </div>
                </div>

                {/* AM / PM Segmented Control */}
                <div className="shrink-0">
                  <label className="text-muted-foreground mb-1 block text-[10px] font-semibold tracking-wider uppercase">
                    Period
                  </label>
                  <div className="border-input bg-muted/40 flex h-10 rounded-lg border p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() =>
                        updateTime(currentHours12, currentMinutes, 'AM')
                      }
                      className={cn(
                        'cursor-pointer rounded-md px-2.5 text-xs font-bold transition-all',
                        currentPeriod === 'AM'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTime(currentHours12, currentMinutes, 'PM')
                      }
                      className={cn(
                        'cursor-pointer rounded-md px-2.5 text-xs font-bold transition-all',
                        currentPeriod === 'PM'
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick time slots */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-[10px] font-semibold tracking-wider uppercase">
                  Popular Times
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: '09:00 AM', h: 9, m: 0, p: 'AM' as const },
                    { label: '12:00 PM', h: 12, m: 0, p: 'PM' as const },
                    { label: '03:00 PM', h: 3, m: 0, p: 'PM' as const },
                    { label: '06:00 PM', h: 6, m: 0, p: 'PM' as const },
                    { label: '07:30 PM', h: 7, m: 30, p: 'PM' as const },
                    { label: '09:00 PM', h: 9, m: 0, p: 'PM' as const },
                  ].map((slot) => {
                    const isSlotActive =
                      currentHours12 === slot.h &&
                      currentMinutes === slot.m &&
                      currentPeriod === slot.p;
                    return (
                      <button
                        key={slot.label}
                        type="button"
                        onClick={() => updateTime(slot.h, slot.m, slot.p)}
                        className={cn(
                          'border-border/70 cursor-pointer rounded-md border px-2 py-1.5 text-center font-mono text-xs transition-colors',
                          isSlotActive
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Confirmation & timezone info */}
            <div className="border-border flex items-center justify-between gap-2 border-t pt-2.5">
              <span className="text-muted-foreground max-w-[150px] truncate text-[11px]">
                {timeZone || 'Local device time'}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-8 gap-1.5 px-3.5 text-xs font-semibold"
              >
                <Check className="size-3.5" />
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
