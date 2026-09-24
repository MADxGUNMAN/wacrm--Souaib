// ============================================================
// MethodBadge — the coloured HTTP verb pill.
//
// Colour carries meaning here rather than decoration: readers scan a
// reference for "what mutates", so write verbs get warm hues and reads
// get a neutral blue.
//
// Mid-500 hues with a translucent tint are used on purpose. This app
// themes light/dark through CSS variables on `html[data-mode]` and never
// adds a `.dark` class, so Tailwind's `dark:` variant does not fire here
// — a light/dark pair of shades would silently leave one mode wrong. A
// single mid-tone on a 12%-opacity wash reads on both surfaces.
// ============================================================

import { cn } from '@/lib/utils';

/** Explicit map, not a computed hue: an unknown verb must stay legible. */
const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-sky-500/12 text-sky-500 ring-sky-500/30',
  POST: 'bg-emerald-500/12 text-emerald-500 ring-emerald-500/30',
  PATCH: 'bg-amber-500/12 text-amber-500 ring-amber-500/30',
  PUT: 'bg-amber-500/12 text-amber-500 ring-amber-500/30',
  DELETE: 'bg-rose-500/12 text-rose-500 ring-rose-500/30',
};

const FALLBACK_STYLE = 'bg-slate-500/12 text-slate-500 ring-slate-500/30';

export function MethodBadge({
  method,
  className,
}: {
  method: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wider ring-1 ring-inset',
        METHOD_STYLES[method] ?? FALLBACK_STYLE,
        className
      )}
    >
      {method}
    </span>
  );
}
