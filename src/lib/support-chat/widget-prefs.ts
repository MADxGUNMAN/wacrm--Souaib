'use client';

// ============================================================
// Floating chat bubble preferences — per user, per browser.
//
// The bubble always sits bottom-right; the only choice is whether to show
// it. Stored in localStorage (not the database) so hiding it is instant
// and needs no API. Keyed by user id, so two people sharing a browser each
// keep their own, and synced across tabs through the `storage` event so
// hiding it in one tab hides it in all of them.
// ============================================================

import { useCallback, useSyncExternalStore } from 'react';

export interface WidgetPrefs {
  hidden: boolean;
}

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = { hidden: false };

const keyFor = (userId: string) => `replai:support-widget:${userId}`;

/** Same-tab listeners. `storage` only fires in OTHER tabs. */
const listeners = new Set<() => void>();

/** Cached parse per key, so getSnapshot returns a stable reference. */
const cache = new Map<string, { raw: string | null; value: WidgetPrefs }>();

function parse(raw: string | null): WidgetPrefs {
  if (!raw) return DEFAULT_WIDGET_PREFS;
  try {
    // Older builds also stored a position; only `hidden` is read now.
    const obj = JSON.parse(raw) as Partial<WidgetPrefs>;
    return { hidden: obj.hidden === true };
  } catch {
    // A hand-edited or corrupted value resets rather than breaking the page.
    return DEFAULT_WIDGET_PREFS;
  }
}

function read(userId: string): WidgetPrefs {
  const key = keyFor(userId);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Blocked storage (some privacy modes): behave as defaults.
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

function write(userId: string, next: WidgetPrefs) {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // Unwritable storage: the change applies for this render only.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('replai:support-widget:')) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Read and update the bubble preferences for `userId`. */
export function useWidgetPrefs(userId: string | undefined) {
  const prefs = useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId) : DEFAULT_WIDGET_PREFS),
    () => DEFAULT_WIDGET_PREFS
  );

  const update = useCallback(
    (patch: Partial<WidgetPrefs>) => {
      if (!userId) return;
      // Rewrites the whole object, which also drops any stale position
      // field left behind by an older build.
      write(userId, { ...read(userId), ...patch });
    },
    [userId]
  );

  return { prefs, update };
}
