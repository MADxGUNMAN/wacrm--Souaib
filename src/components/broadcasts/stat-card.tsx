// ============================================================
// One KPI tile from a send report.
//
// Extracted from /broadcasts/[id]/page.tsx, where it was a local
// function, so the API campaign report can present a campaign's totals
// with the same six tiles rather than a second set that drifts from it.
// `broadcast-status.ts` exists for the same reason: the badge config was
// duplicated across those two screens once already.
// ============================================================

import type React from 'react';

export interface StatCardProps {
  label: string;
  value: number;
  /**
   * Denominator for the percentage in the corner. Pass the same number as
   * `value` for a tile that IS the total (its share is then 100% by
   * definition), and 0 for one whose share is meaningless — a 0
   * denominator renders 0% rather than dividing by zero.
   */
  total: number;
  icon: React.ReactNode;
  /** Tailwind classes for the icon chip, e.g. `bg-primary/10 text-primary`. */
  color: string;
}

export function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}
        >
          {icon}
        </div>
        <span className="text-muted-foreground text-xs">{pct}%</span>
      </div>
      <p className="text-foreground mt-3 text-2xl font-bold">
        {value.toLocaleString()}
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
