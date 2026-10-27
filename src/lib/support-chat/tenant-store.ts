'use client';

// ============================================================
// Live Chat state for the signed-in CRM user — one store, many readers.
//
// Answers two questions for the whole CRM:
//
//   • availability — may this user see Live chat at all? (the Settings
//     rail item, the Settings pane, the floating bubble, the sidebar badge
//     and the tab title all hide when not)
//   • summary      — unread replies, the latest preview, and a "pulse"
//     that ticks each time a NEW reply from support arrives, which is what
//     the floating bubble uses to pop a preview
//
// ─── Why a module store and not a hook per consumer ──────────
//
// Four components need this at once. Each owning its own Realtime channel
// on `support_conversations` meant four subscriptions per tab to the same
// row, and — as earlier releases found — two mounts asking
// `supabase.channel()` for the same topic get the SAME channel back and
// crash adding callbacks after subscribe. One ref-counted store, the same
// shape as `lib/super-admin/notification-store.ts`, removes both problems.
//
// ─── How access granted by an operator shows up ──────────────
//
// When an operator messages a workspace that could not see the chat, the
// server grants access and THEN writes the conversation and message. Those
// writes arrive here as a Realtime event on the workspace's own
// conversation row (readable through the member RLS policy regardless of
// access), and every such event re-asks the availability endpoint. So the
// chat appears for the customer as the operator's message lands, with no
// reload. Settings changes (master switch, rule) are picked up on tab
// focus and on a two-minute timer.
// ============================================================

import type { RealtimeChannel } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { SUPPORT_CONVERSATIONS_TABLE } from './types';

export interface SupportAvailability {
  available: boolean;
  blockedBy: 'workspace' | 'permission' | null;
  widgetEnabled: boolean;
  welcomeMessage: string | null;
}

export interface SupportTenantSnapshot {
  accountId: string | null;
  /** null until the first answer arrives. Treat null as "not yet". */
  availability: SupportAvailability | null;
  unread: number;
  preview: string | null;
  lastMessageAt: string | null;
  /**
   * Increments when unread goes UP from a live event — i.e. support just
   * replied. Snapshot fetches never bump it, so opening the CRM with old
   * unread messages does not pop a preview over the page.
   */
  replyPulse: number;
}

const EMPTY: SupportTenantSnapshot = {
  accountId: null,
  availability: null,
  unread: 0,
  preview: null,
  lastMessageAt: null,
  replyPulse: 0,
};

const AVAILABILITY_REFRESH_MS = 2 * 60_000;
const TEARDOWN_GRACE_MS = 2000;

let snapshot: SupportTenantSnapshot = EMPTY;
const listeners = new Set<() => void>();

let currentAccountId: string | null = null;
let channel: RealtimeChannel | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let availabilityDebounce: ReturnType<typeof setTimeout> | null = null;
/** Guards against a slow response landing after a newer one. */
let availabilitySeq = 0;

function setSnapshot(patch: Partial<SupportTenantSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

async function loadAvailability(): Promise<void> {
  const accountId = currentAccountId;
  if (!accountId) return;
  const seq = ++availabilitySeq;
  try {
    const res = await fetch('/api/support-chat/availability', {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = (await res.json()) as SupportAvailability;
    if (seq !== availabilitySeq || accountId !== currentAccountId) return;
    setSnapshot({ availability: data });
  } catch {
    // A network blip keeps the last known answer rather than flickering
    // every Live chat entry point out and back in.
  }
}

/** Coalesce a burst of events (conversation + message) into one request. */
function scheduleAvailability() {
  if (availabilityDebounce) clearTimeout(availabilityDebounce);
  availabilityDebounce = setTimeout(() => {
    availabilityDebounce = null;
    void loadAvailability();
  }, 400);
}

async function loadSummary(): Promise<void> {
  const accountId = currentAccountId;
  if (!accountId) return;
  const { data, error } = await createClient()
    .from(SUPPORT_CONVERSATIONS_TABLE)
    .select('unread_for_account, last_message_preview, last_message_at')
    .eq('account_id', accountId)
    // Created lazily on first use, so "no row" is the normal case for a
    // workspace that has never chatted.
    .maybeSingle();
  if (error || accountId !== currentAccountId) return;
  setSnapshot({
    unread: (data?.unread_for_account as number | undefined) ?? 0,
    preview: (data?.last_message_preview as string | null) ?? null,
    lastMessageAt: (data?.last_message_at as string | null) ?? null,
  });
}

function onFocus() {
  void loadAvailability();
  void loadSummary();
}
function onVisible() {
  if (document.visibilityState === 'visible') onFocus();
}

function stop() {
  if (channel) {
    void createClient().removeChannel(channel);
    channel = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (availabilityDebounce) {
    clearTimeout(availabilityDebounce);
    availabilityDebounce = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
  }
}

function start(accountId: string) {
  stop();
  currentAccountId = accountId;
  snapshot = { ...EMPTY, accountId };
  for (const listener of listeners) listener();

  const supabase = createClient();
  channel = supabase
    // Random suffix: a fast account switch can call this before the
    // asynchronous removeChannel above has landed, and reusing the topic
    // would return that dying channel.
    .channel(
      `support-tenant:${accountId}:${Math.random().toString(36).slice(2)}`
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: SUPPORT_CONVERSATIONS_TABLE,
        filter: `account_id=eq.${accountId}`,
      },
      (payload) => {
        if (accountId !== currentAccountId) return;
        if (payload.eventType === 'DELETE') {
          setSnapshot({ unread: 0, preview: null, lastMessageAt: null });
        } else {
          const row = payload.new as {
            unread_for_account?: number;
            last_message_preview?: string | null;
            last_message_at?: string | null;
          };
          const unread = row.unread_for_account ?? 0;
          setSnapshot({
            unread,
            preview: row.last_message_preview ?? null,
            lastMessageAt: row.last_message_at ?? null,
            // The counter only moves up for messages from support, so a rise
            // IS a new reply. Clearing it (read) moves it down.
            replyPulse:
              unread > snapshot.unread
                ? snapshot.replyPulse + 1
                : snapshot.replyPulse,
          });
        }
        // Any activity on the thread can mean access just changed — see the
        // header.
        scheduleAvailability();
      }
    )
    .subscribe();

  void loadAvailability();
  void loadSummary();

  interval = setInterval(
    () => void loadAvailability(),
    AVAILABILITY_REFRESH_MS
  );
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
  }
}

/** Point the store at the signed-in user's workspace. Idempotent. */
export function setSupportTenantAccount(accountId: string | null) {
  if (accountId === currentAccountId) return;
  if (!accountId) {
    stop();
    currentAccountId = null;
    snapshot = EMPTY;
    for (const listener of listeners) listener();
    return;
  }
  if (listeners.size > 0) start(accountId);
  else currentAccountId = accountId;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  // First consumer for a known account: begin.
  if (listeners.size === 1 && currentAccountId && !channel) {
    start(currentAccountId);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !teardownTimer) {
      // Grace period so StrictMode remounts and route changes do not tear
      // the websocket down and reconnect it.
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (listeners.size === 0) {
          stop();
          snapshot = { ...EMPTY, accountId: currentAccountId };
        }
      }, TEARDOWN_GRACE_MS);
    }
  };
}

export const getSnapshot = (): SupportTenantSnapshot => snapshot;
export const getServerSnapshot = (): SupportTenantSnapshot => EMPTY;

/** Re-ask now — e.g. after the user reads the thread. */
export function refreshSupportTenant() {
  void loadAvailability();
  void loadSummary();
}
