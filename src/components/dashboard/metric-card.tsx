import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-5 tech-border shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary shadow-[0_0_8px_rgba(45,212,191,0.05)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 font-mono text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{subtitle}</p>
      ) : null}
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-primary'
      : sign < 0
      ? 'text-red-600'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2 flex items-center gap-1.5 font-mono text-xs', tone)}>
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums tracking-wide uppercase">{label}</span>
    </div>
  )
}
