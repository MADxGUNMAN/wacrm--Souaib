// Display helpers for the security tables. Times render in the viewer's
// own timezone; each row's Timezone column shows the device's zone.

import { format } from 'date-fns';

/** "15th Oct 26 17:38" */
export function formatEventTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'do MMM yy HH:mm');
}

/** "Active now", "2m ago", "1h ago", "3d ago". */
export function formatRelative(
  iso: string | null | undefined,
  now: number = Date.now()
): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 45) return 'Active now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/** "India (IN)", "IN", or "—". */
export function formatCountry(
  name: string | null | undefined,
  code: string | null | undefined
): string {
  if (name && code && name !== code) return `${name} (${code})`;
  return code || name || '—';
}

export const dash = (v: string | null | undefined): string =>
  v && v.trim() ? v : '—';
