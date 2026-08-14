/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + badge classes here so the template manager, inbox
 * picker, and broadcast picker stay aligned.
 *
 * ─── Why every colour is a light/dark PAIR ────────────────────────
 *
 * These were originally dark-theme only: `text-yellow-400`,
 * `text-red-400` and friends. Those shades are picked to glow against a
 * dark surface, and on the light theme they read as washed-out pastel —
 * "Rejected" looked barely more urgent than "Draft", which is the one
 * distinction this badge exists to make.
 *
 * So each entry now sets a darker foreground for light mode and keeps the
 * bright shade behind `dark:`. The translucent background tints work in
 * both themes unchanged. `text-primary` and `text-muted-foreground` are
 * theme tokens that already adapt, so they need no override.
 */

import type { MessageTemplateStatus } from '@/types';

export interface TemplateStatusDisplay {
  label: string;
  classes: string;
}

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    label: 'Draft',
    classes: 'bg-slate-500/15 text-muted-foreground border-slate-500/30',
  },
  PENDING: {
    // Amber rather than yellow: yellow at a readable weight on white
    // turns muddy, amber stays legible in both themes.
    label: 'Pending',
    classes:
      'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  APPROVED: {
    label: 'Approved',
    classes: 'bg-primary/15 text-primary border-primary/30',
  },
  REJECTED: {
    label: 'Rejected',
    classes: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  },
  PAUSED: {
    label: 'Paused',
    classes:
      'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  },
  DISABLED: {
    // Deliberately heavier than Rejected — a disabled template is the
    // end of the road, not something an appeal can recover.
    label: 'Disabled',
    classes: 'bg-red-500/20 text-red-800 dark:text-red-400 border-red-500/40',
  },
  IN_APPEAL: {
    label: 'In Appeal',
    classes:
      'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  PENDING_DELETION: {
    label: 'Pending Deletion',
    classes: 'bg-slate-500/20 text-muted-foreground border-slate-500/40',
  },
};
