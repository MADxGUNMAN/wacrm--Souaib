'use client';

// Search box, pager and table shell shared by the Logged-in devices and
// Login activity tables.

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PAGE_SIZES } from '@/lib/security/types';

export function IpSearch({
  value,
  onChange,
  label = 'Search by IP',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="relative w-full sm:w-56">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        type="search"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}...`}
        aria-label={label}
        className="h-9 pl-8"
      />
    </div>
  );
}

/** Numbered page buttons with gaps: 1 … 4 5 6 … 20 */
function pageList(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | 'gap')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('gap');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pages - 1) out.push('gap');
  out.push(pages);
  return out;
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span aria-live="polite">
          {from} - {to} of {total}
        </span>
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        {pageList(page, pages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="text-muted-foreground px-1">
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={p === page ? 'default' : 'ghost'}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
              className="min-w-8"
            >
              {p}
            </Button>
          )
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </nav>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'text-muted-foreground px-2.5 py-2 text-center text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase sm:text-[11px]',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        'text-foreground px-2.5 py-2 text-center text-xs whitespace-nowrap',
        className
      )}
    >
      {children}
    </td>
  );
}

export function TableShell({
  toolbar,
  children,
  footer,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      {toolbar ? (
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          {children}
        </table>
      </div>
      {footer}
    </div>
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-muted-foreground px-3 py-10 text-center text-sm"
      >
        {children}
      </td>
    </tr>
  );
}
