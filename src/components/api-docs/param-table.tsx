// ============================================================
// Parameter and request-body tables.
//
// Two shapes, one look. Body fields nest (`template.name`,
// `recipients[].to`), so they indent by depth AND keep the dotted path
// visible — the indent shows structure at a glance, the path shows what
// to actually type. Showing only one of the two reliably confuses
// readers building a payload by hand.
//
// Required is spelled out as a word rather than an asterisk or a
// coloured dot, because "required" is the single most consequential fact
// in the table and legends are easy to miss.
// ============================================================

import { cn } from '@/lib/utils';
import type { BodyRow, ParamRow } from '@/lib/api-docs/view-model';

function RequiredTag({ required }: { required: boolean }) {
  return required ? (
    // Mid-500: this app themes via CSS variables on html[data-mode] and
    // never sets a `.dark` class, so a `dark:` pair would not fire.
    <span className="text-[11px] font-semibold text-rose-500">required</span>
  ) : (
    <span className="text-muted-foreground text-[11px]">optional</span>
  );
}

function FieldShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border divide-border divide-y overflow-hidden rounded-lg border',
        className
      )}
    >
      {children}
    </div>
  );
}

function Row({
  name,
  type,
  required,
  description,
  indent = 0,
}: {
  name: React.ReactNode;
  type: string;
  required: boolean;
  description: string;
  indent?: number;
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <div
        className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
        // Inline padding rather than a Tailwind class: depth is data, and
        // a class lookup table would cap how deep a body can nest.
        style={indent > 0 ? { paddingLeft: `${indent * 14}px` } : undefined}
      >
        <code className="text-foreground font-mono text-[12.5px] font-semibold">
          {name}
        </code>
        <span className="text-muted-foreground font-mono text-[11px]">
          {type}
        </span>
        <RequiredTag required={required} />
      </div>
      <p
        className="text-muted-foreground mt-1 text-[13px] leading-relaxed"
        style={indent > 0 ? { paddingLeft: `${indent * 14}px` } : undefined}
      >
        {description}
      </p>
    </div>
  );
}

export function ParamTable({ rows }: { rows: ParamRow[] }) {
  if (rows.length === 0) return null;
  return (
    <FieldShell>
      {rows.map((row) => (
        <Row
          key={row.name}
          name={row.name}
          type={row.type}
          required={row.required}
          description={row.description}
        />
      ))}
    </FieldShell>
  );
}

export function BodyTable({ rows }: { rows: BodyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <FieldShell>
      {rows.map((row) => (
        <Row
          key={row.path}
          // The full path is what the reader types; the indent conveys
          // where it sits.
          name={row.path}
          type={row.type}
          required={row.required}
          description={row.description}
          indent={row.depth}
        />
      ))}
    </FieldShell>
  );
}
