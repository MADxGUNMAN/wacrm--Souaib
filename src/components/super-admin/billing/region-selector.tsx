'use client';

// ============================================================
// Pricing region picker for /super-admin/plans.
//
// "Global (Universal)" first and default, then every country as
// "Name (+dial)", sorted by name, with a status dot from the regions API:
//   green   enabled, complete and chargeable here
//   amber   enabled, but customers still see Global (not chargeable
//           on this deployment, or no priced cycle)
//   slate   draft: something is configured, not enabled
//   hollow  not set up
// ============================================================

import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';

import { CountryFlag } from '@/components/ui/phone-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  GLOBAL_REGION,
  REGION_OPTIONS,
  regionLabel,
  type RegionOption,
} from '@/lib/billing/pricing/regions';
import { cn } from '@/lib/utils';

export interface RegionSummary {
  code: string;
  currency: string | null;
  is_enabled: boolean;
  complete: boolean;
  chargeable: boolean;
  cycle_count: number;
  priced_cycle_count: number;
  problems: string[];
}

export type RegionStatus = 'live' | 'warning' | 'draft' | 'none';

export function regionStatusOf(
  summary: RegionSummary | undefined
): RegionStatus {
  if (!summary) return 'none';
  if (summary.is_enabled) {
    return summary.complete && summary.chargeable ? 'live' : 'warning';
  }
  return 'draft';
}

const STATUS_LABEL: Record<RegionStatus, string> = {
  live: 'Enabled',
  warning: 'Enabled, customers still see Global',
  draft: 'Draft, not enabled',
  none: 'Not set up',
};

function StatusDot({ status }: { status: RegionStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        status === 'live' && 'bg-emerald-500',
        status === 'warning' && 'bg-amber-500',
        status === 'draft' && 'bg-slate-400',
        status === 'none' && 'border border-slate-300 bg-transparent'
      )}
    />
  );
}

export function RegionSelector({
  value,
  onChange,
  summaries,
}: {
  value: string;
  onChange: (code: string) => void;
  summaries: ReadonlyMap<string, RegionSummary>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGION_OPTIONS;
    const digits = q.replace(/[^\d]/g, '');
    return REGION_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.code.toLowerCase() === q ||
        (digits && o.dialCode?.replace('+', '').startsWith(digits))
    );
  }, [query]);

  const selected =
    REGION_OPTIONS.find((o) => o.code === value) ?? REGION_OPTIONS[0];
  const isGlobal = selected.code === GLOBAL_REGION;
  const selectedStatus = isGlobal
    ? null
    : regionStatusOf(summaries.get(selected.code));

  const choose = (option: RegionOption) => {
    onChange(option.code);
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next =
        e.key === 'ArrowDown'
          ? Math.min(options.length - 1, active + 1)
          : Math.max(0, active - 1);
      setActive(next);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label="Pricing region"
        title={
          selectedStatus
            ? `${regionLabel(selected.code)}: ${STATUS_LABEL[selectedStatus]}`
            : regionLabel(selected.code)
        }
        className="inline-flex h-9 max-w-[18rem] min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:outline-none"
      >
        {isGlobal ? (
          <Globe className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <CountryFlag
            countryCode={selected.code}
            countryName={selected.name}
            fallbackEmoji={selected.flag ?? ''}
          />
        )}
        <span className="truncate">{selected.label}</span>
        {selectedStatus ? <StatusDot status={selectedStatus} /> : null}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-80 overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 p-2">
          <Search className="ml-1 h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search country or dialing code"
            aria-label="Search pricing regions"
            aria-controls="pricing-region-list"
            className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <div
          id="pricing-region-list"
          ref={listRef}
          role="listbox"
          aria-label="Pricing regions"
          className="max-h-72 overflow-y-auto p-1"
        >
          {options.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-500">
              No country matches that search.
            </p>
          ) : (
            options.map((option, index) => {
              const isSelected = option.code === selected.code;
              const optionGlobal = option.code === GLOBAL_REGION;
              const status = optionGlobal
                ? null
                : regionStatusOf(summaries.get(option.code));
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  title={status ? STATUS_LABEL[status] : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                    index === active ? 'bg-slate-100' : 'hover:bg-slate-50',
                    isSelected && 'font-medium text-emerald-700'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {optionGlobal ? (
                      <Globe className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <CountryFlag
                        countryCode={option.code}
                        countryName={option.name}
                        fallbackEmoji={option.flag ?? ''}
                      />
                    )}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {status ? (
                      <>
                        <StatusDot status={status} />
                        <span className="sr-only">{STATUS_LABEL[status]}</span>
                      </>
                    ) : null}
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
