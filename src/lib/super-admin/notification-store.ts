/**
 * Shared store behind the super-admin notification feed.
 *
 * Deliberately not a hook. One module-level store, one initial fetch and
 * one realtime channel, however many components read it — the header
 * bell is mounted on every admin page and `/super-admin/notifications`
 * adds a second consumer on top.
 *
 * That sharing is not an optimisation, it is the fix for a real crash.
 * `createClient()` is a singleton and `supabase.channel(name)` returns
 * the EXISTING channel when it already knows that name, so a per-mount
 * channel meant the second consumer called `.on()` on an
 * already-subscribed channel and threw:
 *
 *   cannot add `postgres_changes` callbacks for
 *   realtime:super-admin-notifications after `subscribe()`
 *
 * Giving each mount a unique channel name would have silenced that while
 * opening one websocket subscription and one fetch per consumer, and
 * leaving the bell and the page with separate copies of the same state
 * that could drift. One store fixes the crash and makes the two surfaces
 * genuinely consistent.
 *
 * Kept out of the hook file so it can be tested without a React
 * renderer: the regression that matters ("a second consumer must not
 * open a second channel") is a property of this module alone.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type SuperAdminNotificationType =
  | 'account_created'
  | 'account_banned'
  | 'payment_requested'
  | 'payment_verified'
  | 'payment_rejected'
  | 'contact_submitted'
  | 'newsletter_subscribed'
  | 'template_rejected'
  | 'subscription_expiring';

export type SuperAdminNotificationSeverity =
  'info' | 'success' | 'warning' | 'critical';

export interface SuperAdminNotification {
  id: string;
  type: SuperAdminNotificationType;
  severity: SuperAdminNotificationSeverity;
  title: string;
  body: string | null;
  account_id: string | null;
  account_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  created_at: string;
  /** Derived from this operator's read rows — never a column. */
  is_read: boolean;
}

/** The row as stored. */
type NotificationRow = Omit<SuperAdminNotification, 'is_read'>;

export interface NotificationSnapshot {
  notifications: SuperAdminNotification[];
  unreadCount: number;
  loading: boolean;
  /** True when the tables/RPC are missing — an un-migrated deployment. */
  unavailable: boolean;
}

/** How much history the feed keeps in memory. */
export const PAGE_SIZE = 40;

/**
 * How long the subscription outlives its last consumer.
 *
 * React StrictMode mounts, unmounts and remounts effects in development,
 * and a route change briefly drops to zero consumers. Tearing down
 * synchronously would reconnect the websocket on every navigation.
 */
export const TEARDOWN_GRACE_MS = 2000;

const SELECT_COLUMNS =
  'id, type, severity, title, body, account_id, account_name, entity_type, entity_id, link, created_at';

const EMPTY: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
  loading: true,
  unavailable: false,
};

/**
 * Cached snapshot. `useSyncExternalStore` compares by reference, so this
 * is replaced only when something actually changed — returning a fresh
 * object per read would loop forever.
 */
let snapshot: NotificationSnapshot = EMPTY;
const listeners = new Set<() => void>();

let channel: RealtimeChannel | null = null;
let currentUserId: string | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
/** Guards against a slow fetch landing after a newer one. */
let fetchSeq = 0;

function setSnapshot(patch: Partial<NotificationSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export async function load(): Promise<void> {
  const supabase = createClient();
  const seq = ++fetchSeq;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (seq === fetchSeq) setSnapshot({ loading: false });
    return;
  }
  currentUserId = user.id;

  const [rowsRes, readsRes, countRes] = await Promise.all([
    supabase
      .from('super_admin_notifications')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('super_admin_notification_reads')
      .select('notification_id')
      .eq('user_id', user.id),
    supabase.rpc('fn_sa_unread_notification_count'),
  ]);

  if (seq !== fetchSeq) return;

  // A deployment that has not run the migration yet should degrade to an
  // empty bell, not a console full of 404s on every admin page.
  if (rowsRes.error) {
    console.error(
      '[super-admin notifications] load failed:',
      rowsRes.error.message
    );
    setSnapshot({ unavailable: true, loading: false });
    return;
  }

  const readIds = new Set(
    (readsRes.data ?? []).map(
      (r: { notification_id: string }) => r.notification_id
    )
  );
  const rows = (rowsRes.data ?? []) as unknown as NotificationRow[];

  setSnapshot({
    notifications: rows.map((r) => ({ ...r, is_read: readIds.has(r.id) })),
    unreadCount:
      typeof countRes.data === 'number'
        ? countRes.data
        : // RPC missing (older deployment) — fall back to the windowed
          // diff rather than showing nothing.
          rows.filter((r) => !readIds.has(r.id)).length,
    unavailable: false,
    loading: false,
  });
}

function onFocus() {
  void load();
}

function onVisible() {
  if (document.visibilityState === 'visible') void load();
}

function handleInsert(row: NotificationRow) {
  // Realtime can redeliver; a duplicate would show twice and inflate the
  // badge.
  if (snapshot.notifications.some((n) => n.id === row.id)) return;
  setSnapshot({
    notifications: [
      { ...row, is_read: false },
      ...snapshot.notifications,
    ].slice(0, PAGE_SIZE),
    unreadCount: snapshot.unreadCount + 1,
  });
}

function handleReadChange(
  notificationId: string,
  userId: string,
  nowRead: boolean
) {
  // Only this operator's read state moves this operator's badge; several
  // operators can be clearing their own at the same time.
  if (userId !== currentUserId) return;

  const known = snapshot.notifications.find((n) => n.id === notificationId);
  // Already in the wanted state — usually our own optimistic update
  // echoing back. Counting it again would double-decrement the badge.
  if (known && known.is_read === nowRead) return;

  setSnapshot({
    notifications: snapshot.notifications.map((n) =>
      n.id === notificationId ? { ...n, is_read: nowRead } : n
    ),
    unreadCount: nowRead
      ? Math.max(0, snapshot.unreadCount - 1)
      : snapshot.unreadCount + 1,
  });
}

function start() {
  // The guard that makes a second consumer safe.
  if (channel) return;

  void load();

  const supabase = createClient();
  channel = supabase
    .channel('super-admin-notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'super_admin_notifications' },
      (payload) => handleInsert(payload.new as NotificationRow)
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'super_admin_notifications' },
      () => {
        // Rare (operator cleanup). Re-read rather than guess, since we
        // cannot know whether the removed row was unread for us.
        void load();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'super_admin_notification_reads' },
      (payload) => {
        const row = (payload.new ?? payload.old) as {
          notification_id?: string;
          user_id?: string;
        };
        if (!row?.notification_id || !row?.user_id) return;
        handleReadChange(
          row.notification_id,
          row.user_id,
          payload.eventType !== 'DELETE'
        );
      }
    )
    .subscribe();

  // Realtime can miss events across a sleep or a reconnect, so reconcile
  // whenever the operator returns to the tab. This is also what makes the
  // count correct after the exact sequence in the bug report: mark read,
  // leave, come back.
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
  }
}

function stop() {
  if (channel) {
    void createClient().removeChannel(channel);
    channel = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
  }
  // A later mount should show a spinner rather than stale rows.
  snapshot = EMPTY;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  start();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !teardownTimer) {
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (listeners.size === 0) stop();
      }, TEARDOWN_GRACE_MS);
    }
  };
}

export const getSnapshot = (): NotificationSnapshot => snapshot;
export const getServerSnapshot = (): NotificationSnapshot => EMPTY;

export async function markAllRead(): Promise<boolean> {
  const previous = snapshot;
  // Optimistic: the badge should clear on the click, not on the round
  // trip.
  setSnapshot({
    notifications: snapshot.notifications.map((n) => ({
      ...n,
      is_read: true,
    })),
    unreadCount: 0,
  });

  const { error } = await createClient().rpc(
    'fn_sa_mark_all_notifications_read'
  );
  if (error) {
    // Roll back. Silently keeping a cleared badge over a failed write is
    // exactly how the original bug looked: cleared, then back after a
    // refresh.
    console.error(
      '[super-admin notifications] markAllRead failed:',
      error.message
    );
    setSnapshot(previous);
    return false;
  }
  // Reconcile so the count reflects anything that arrived mid-request.
  await load();
  return true;
}

export async function markRead(id: string): Promise<boolean> {
  const target = snapshot.notifications.find((n) => n.id === id);
  if (target?.is_read) return true;
  if (!currentUserId) return false;

  if (target) {
    setSnapshot({
      notifications: snapshot.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, snapshot.unreadCount - 1),
    });
  }

  const { error } = await createClient()
    .from('super_admin_notification_reads')
    .upsert(
      { notification_id: id, user_id: currentUserId },
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    );
  if (error) {
    console.error(
      '[super-admin notifications] markRead failed:',
      error.message
    );
    if (target) {
      setSnapshot({
        notifications: snapshot.notifications.map((n) =>
          n.id === id ? { ...n, is_read: false } : n
        ),
        unreadCount: snapshot.unreadCount + 1,
      });
    }
    return false;
  }

  // A row outside the bell's 40-item window cannot update the snapshot
  // optimistically, so reconcile the exact global count after writing it.
  if (!target) await load();
  return true;
}
