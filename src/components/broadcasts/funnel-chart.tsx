// ============================================================
// Sent → Delivered → Read → Replied, as decreasing bars.
//
// Extracted verbatim from /broadcasts/[id]/page.tsx so the API campaign
// report shows the same funnel over its runs' totals. The only addition
// is the `title` prop — the heading used to be a hardcoded "Funnel".
// ============================================================

export interface FunnelStep {
  label: string;
  value: number;
  /** Tailwind bg class for the fill, e.g. `bg-primary`. */
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
export function FunnelChart({
  steps,
  title = 'Funnel',
}: {
  steps: FunnelStep[];
  title?: string;
}) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <h3 className="text-foreground mb-4 text-sm font-medium">{title}</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          // 5% floor so a zero step still renders a visible sliver — a
          // bar of literally no width reads as a missing row.
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          // Relative to the FIRST step, not the largest, so the inner
          // label answers "what share of what we sent got this far".
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="text-muted-foreground w-20 shrink-0 text-xs">
                {step.label}
              </span>
              <div className="bg-muted relative h-7 flex-1 rounded-full">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="text-foreground absolute inset-0 flex items-center px-3 text-xs font-medium">
                  {step.value.toLocaleString()}
                  <span className="text-muted-foreground/80 ml-2">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
