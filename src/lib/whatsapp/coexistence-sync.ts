/**
 * Requesting the Coexistence history + address-book sync from Meta.
 *
 * ═══ READ THIS BEFORE CHANGING ANYTHING HERE ══════════════════════
 *
 * THE ENDPOINT PATH IS NOT VERIFIED.
 *
 * Every other Meta call in this codebase was confirmed against a live
 * account. This one could not be: the sync edge only exists on a
 * Coexistence phone number, and probing it on an ordinary Cloud API
 * number returns "(#100) Tried accessing nonexisting field
 * (smb_app_data)" — which tells us nothing about whether the path is
 * right, only that this particular number cannot use it.
 *
 * The default below is the best reading of Meta's documentation and of
 * two BSP wrappers (Gupshup, 360dialog) that both expose a `syncType` of
 * `history` and `smb_app_state_sync`. It is a considered guess, not a
 * fact.
 *
 * So the path and parameter names are ENV-OVERRIDABLE. When the first
 * real Coexistence number connects, the error message will name the
 * correct edge, and it can be corrected without a deploy:
 *
 *   META_COEX_SYNC_PATH        default 'smb_app_data'
 *   META_COEX_SYNC_PARAM       default 'sync_type'
 *   META_COEX_SYNC_HISTORY     default 'history'
 *   META_COEX_SYNC_CONTACTS    default 'smb_app_state_sync'
 *
 * ═══ WHY THIS IS ONE-SHOT AND WHY THAT MATTERS ════════════════════
 *
 * Meta allows the sync to be STARTED ONCE, and only within 24 hours of
 * onboarding. Miss that window and the only remedy is for the customer to
 * disconnect and re-onboard — losing the history they connected in order
 * to keep.
 *
 * Two consequences shape this module:
 *
 *   1. It must never fire twice. `whatsapp_config.sync_requested_at` is
 *      the guard, checked before the call and written after it.
 *   2. It must never fail silently. A swallowed error here is invisible
 *      until the 24 hours have gone, at which point it is unfixable. So
 *      every failure is logged AND persisted to `sync_last_error`.
 *
 * Attempts are bounded. An unbounded retry loop against a one-shot
 * endpoint is the fastest way to burn the window.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { META_API_BASE } from './graph-version';

/** Hard cap on tries. Small on purpose — see the module note. */
export const MAX_SYNC_ATTEMPTS = 3;

/** Meta's window for starting the sync, in hours. */
export const SYNC_WINDOW_HOURS = 24;

function syncConfig() {
  return {
    path: process.env.META_COEX_SYNC_PATH || 'smb_app_data',
    param: process.env.META_COEX_SYNC_PARAM || 'sync_type',
    historyValue: process.env.META_COEX_SYNC_HISTORY || 'history',
    contactsValue:
      process.env.META_COEX_SYNC_CONTACTS || 'smb_app_state_sync',
  };
}

export type SyncKind = 'history' | 'contacts';

export interface SyncAttemptResult {
  kind: SyncKind;
  ok: boolean;
  /** Meta's message when it failed — surfaced to the operator verbatim. */
  error?: string;
}

/**
 * Ask Meta to start one kind of sync.
 *
 * Returns rather than throws, so a history failure does not prevent the
 * contact sync from being attempted. They are independent asks and one
 * working is better than neither.
 */
async function requestOneSync(args: {
  phoneNumberId: string;
  accessToken: string;
  kind: SyncKind;
}): Promise<SyncAttemptResult> {
  const { phoneNumberId, accessToken, kind } = args;
  const cfg = syncConfig();

  const body = new URLSearchParams({
    messaging_product: 'whatsapp',
    [cfg.param]: kind === 'history' ? cfg.historyValue : cfg.contactsValue,
  });

  const url = `${META_API_BASE}/${phoneNumberId}/${cfg.path}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (!response.ok) {
      const metaMessage =
        payload.error?.message ?? `HTTP ${response.status} from Meta`;
      // The path being wrong is the single most likely failure, and it is
      // indistinguishable from a permissions problem unless it is called
      // out. Meta reports an unknown edge as code 100 with a "nonexisting
      // field" message.
      const looksLikeWrongPath =
        payload.error?.code === 100 && /nonexisting/i.test(metaMessage);

      return {
        kind,
        ok: false,
        error: looksLikeWrongPath
          ? `${metaMessage} — the sync endpoint path "${cfg.path}" is probably wrong. ` +
            'Set META_COEX_SYNC_PATH to the edge Meta names in its docs for this account.'
          : metaMessage,
      };
    }

    return { kind, ok: true };
  } catch (err) {
    return {
      kind,
      ok: false,
      error: err instanceof Error ? err.message : 'Network error calling Meta',
    };
  }
}

export interface RequestSyncArgs {
  db: SupabaseClient;
  configId: string;
  phoneNumberId: string;
  accessToken: string;
  /** When the number was connected — used to check the 24h window. */
  connectedAt?: string | null;
}

export interface RequestSyncOutcome {
  requested: boolean;
  /** Set when we deliberately did not call Meta. */
  skippedReason?:
    | 'already_requested'
    | 'window_expired'
    | 'too_many_attempts';
  results?: SyncAttemptResult[];
}

/**
 * Request both syncs for a freshly-connected Coexistence number.
 *
 * Safe to call more than once: it short-circuits when the sync has
 * already been requested, when the 24-hour window has closed, or when
 * attempts are exhausted. That makes it usable from the signup handler
 * AND from a retry path without either needing to know about the other.
 */
export async function requestCoexistenceSync(
  args: RequestSyncArgs,
): Promise<RequestSyncOutcome> {
  const { db, configId, phoneNumberId, accessToken, connectedAt } = args;

  const { data: config, error: readError } = await db
    .from('whatsapp_config')
    .select('sync_requested_at, sync_attempts, connected_at')
    .eq('id', configId)
    .maybeSingle();

  if (readError || !config) {
    console.error(
      '[coex-sync] could not read config before requesting sync:',
      readError?.message ?? 'not found',
    );
    return { requested: false };
  }

  // Already done. Meta only honours the first request, so a second call
  // would at best be ignored and at worst count as an error.
  if (config.sync_requested_at) {
    return { requested: false, skippedReason: 'already_requested' };
  }

  if ((config.sync_attempts ?? 0) >= MAX_SYNC_ATTEMPTS) {
    return { requested: false, skippedReason: 'too_many_attempts' };
  }

  // Outside Meta's window there is no point calling — but this is
  // RECORDED rather than passed over quietly, because a missed window is
  // exactly the situation where the operator needs to be told that
  // re-onboarding is the only way to get their history.
  const started = connectedAt ?? config.connected_at;
  if (started) {
    const ageHours = (Date.now() - new Date(started).getTime()) / 3_600_000;
    if (ageHours > SYNC_WINDOW_HOURS) {
      const message =
        `Meta's ${SYNC_WINDOW_HOURS}-hour window for importing chat history has passed ` +
        `(this number was connected ${Math.round(ageHours)} hours ago). ` +
        'Disconnect and reconnect the number to import history.';
      await db
        .from('whatsapp_config')
        .update({ sync_last_error: message })
        .eq('id', configId);
      console.warn(`[coex-sync] ${message}`);
      return { requested: false, skippedReason: 'window_expired' };
    }
  }

  // Count the attempt BEFORE calling, so a crash mid-call still burns an
  // attempt. Better to under-retry a one-shot endpoint than to loop.
  await db
    .from('whatsapp_config')
    .update({ sync_attempts: (config.sync_attempts ?? 0) + 1 })
    .eq('id', configId);

  const results = await Promise.all([
    requestOneSync({ phoneNumberId, accessToken, kind: 'history' }),
    requestOneSync({ phoneNumberId, accessToken, kind: 'contacts' }),
  ]);

  const anyOk = results.some((r) => r.ok);
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => `${r.kind}: ${r.error}`)
    .join(' | ');

  await db
    .from('whatsapp_config')
    .update({
      // Only stamped when Meta accepted at least one. Leaving it NULL on
      // total failure is what allows a retry inside the window.
      ...(anyOk ? { sync_requested_at: new Date().toISOString() } : {}),
      sync_last_error: errors || null,
    })
    .eq('id', configId);

  if (errors) {
    console.error(`[coex-sync] sync request problems — ${errors}`);
  } else {
    console.log(
      `[coex-sync] history + contact sync requested for phone_number_id ${phoneNumberId}`,
    );
  }

  return { requested: anyOk, results };
}

/**
 * How long is left of Meta's window, in hours. Negative once it has
 * closed. Null when there is no connection timestamp to measure from.
 *
 * Used by the UI to show a countdown, because "import your history" is
 * meaningless without "…before this expires".
 */
export function syncWindowHoursRemaining(
  connectedAt: string | null | undefined,
): number | null {
  if (!connectedAt) return null;
  const ageHours = (Date.now() - new Date(connectedAt).getTime()) / 3_600_000;
  return Math.round((SYNC_WINDOW_HOURS - ageHours) * 10) / 10;
}
