// AI connector housekeeping rules (used by /api/ai-connectors/cron).

import { normalizeConnectionSettings } from './settings';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IdleCandidate {
  id: string;
  settings: unknown;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Ids of connections unused for longer than their own idle window
 * (settings.idle_days). A connection never used counts from creation.
 */
export function idleConnectionIds(
  rows: readonly IdleCandidate[],
  now: Date
): string[] {
  return rows
    .filter((row) => {
      const { idle_days } = normalizeConnectionSettings(row.settings);
      const last = Date.parse(row.last_used_at ?? row.created_at);
      return Number.isFinite(last) && now.getTime() - last > idle_days * DAY_MS;
    })
    .map((row) => row.id);
}
