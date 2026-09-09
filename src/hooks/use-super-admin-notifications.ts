'use client';

import { useSyncExternalStore } from 'react';
import {
  getServerSnapshot,
  getSnapshot,
  load,
  markAllRead,
  markRead,
  subscribe,
  type NotificationSnapshot,
} from '@/lib/super-admin/notification-store';

/**
 * Super-admin notification feed, live.
 *
 * Replaces what the bell used to do, which was poll
 * `/api/super-admin/health` every two minutes and set the badge to
 * `Math.min(activity_feed.length, 9)`. That number was a capped tally of
 * recent platform activity, not a count of anything unread — which is
 * why it always read "9", why marking read only cleared it until the
 * next render, and why it came back on refresh. There was nothing to
 * mark read: no notification rows existed.
 *
 * A thin `useSyncExternalStore` view over
 * `@/lib/super-admin/notification-store`. All the behaviour lives there
 * so that one fetch and one realtime channel serve every consumer — the
 * bell is mounted on every admin page and the notifications page is a
 * second reader. See that module for why sharing is required rather than
 * merely tidy.
 */

// Re-exported so components import their types from the hook they use.
export type {
  SuperAdminNotification,
  SuperAdminNotificationSeverity,
  SuperAdminNotificationType,
} from '@/lib/super-admin/notification-store';

export interface UseSuperAdminNotifications extends NotificationSnapshot {
  markAllRead: () => Promise<boolean>;
  markRead: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useSuperAdminNotifications(): UseSuperAdminNotifications {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return { ...state, markAllRead, markRead, refresh: load };
}
