// ============================================================
// The asterisk that marks a required field.
//
// The template wizard already marked OPTIONAL fields ("Footer ·
// optional") and left required ones bare, which relies on the user
// inferring the rule from an absence. That inference only works once you
// have already seen an optional field, so on the first screen — where
// every field happens to be required — there is no signal at all.
//
// Accessibility: a bare `*` is meaningless to a screen reader (it reads
// as "star", or is skipped entirely as punctuation). The glyph is
// therefore aria-hidden and paired with visually-hidden text, so the
// field announces as "Body, required". The `<RequiredLegend />` below
// explains the convention once per form for sighted users, which WCAG
// 3.3.2 asks for — a symbol is only self-explanatory if its meaning is
// stated somewhere.
// ============================================================

import { cn } from '@/lib/utils';

/** Red asterisk + "(required)" for assistive tech. Use inside a <Label>. */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('text-destructive ml-0.5 font-semibold', className)}
      >
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

/** One-line explanation of the asterisk. Place once, near the top of a form. */
export function RequiredLegend({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground text-xs', className)}>
      Fields marked <span className="text-destructive font-semibold">*</span>{' '}
      are required.
    </p>
  );
}
