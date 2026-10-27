// ============================================================
// Reconciliation: the cron half of plan section 3.8. Nothing here
// depends on a webhook having arrived.
//
//   (a) retry stored webhook events that failed or were never processed
//   (b) refetch subscriptions whose charge was due 30+ minutes ago
//   (c) close unauthorised checkouts past expire_by, and clean up claims
//       whose process died around the Razorpay create call
//   (d) a rolling daily sweep of every live subscription and its invoices
//   (e) deliver the email outbox (passed in, so this file stays free of
//       SMTP)
//   + retention: webhook payloads after 90 days, sent emails after a year
//
// Bounded per tick (counts and a time budget), so a backlog drains over
// a few runs instead of one run timing out.
// ============================================================

import { RazorpayApiError } from './client';
import {
  processDueWebhookEvents,
  type EventDeps,
  type ProcessSummary,
} from './events';
import { noteValue } from './mapping';
import { backfillPaymentNotes } from './payment-notes';
import { refreshSubscription } from './service';
import type { BillingSubscriptionRow } from './types';

export const RECONCILE_LIMIT = 20;
export const EVENT_BATCH = 25;
export const DEFAULT_BUDGET_MS = 40_000;

export interface ReconcileSummary {
  events: ProcessSummary;
  subscriptions: {
    checked: number;
    changed: number;
    orphansCancelled: number;
    errors: number;
  };
  notifications: unknown;
  purged: { payloads: number; notifications: number } | null;
  errors: string[];
}

function message(err: unknown): string {
  if (err instanceof RazorpayApiError)
    return `Razorpay ${err.status} ${err.code ?? ''}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

/**
 * A claim with no provider id: the process died before, during or just
 * after `POST /subscriptions`. Release it, then look for a subscription
 * Razorpay did create for it (matched on notes.checkout_id within the
 * claim's time window) and cancel it while it is still unauthorised.
 * Nobody ever received its id, so nobody can be authorising it.
 */
export async function resolveOrphanClaim(
  deps: EventDeps,
  row: BillingSubscriptionRow
): Promise<boolean> {
  if (row.status === 'initiating') {
    await deps.db.markCreateFailed(
      row.id,
      'Stale checkout claim released by reconciliation'
    );
  }
  const created = Math.floor(new Date(row.created_at).getTime() / 1000);
  const list = await deps.client.listSubscriptions({
    plan_id: row.provider_plan_id,
    from: created - 300,
    to: created + 900,
    count: 100,
  });
  const match = (list.items ?? []).find(
    (s) => noteValue(s.notes, 'checkout_id') === row.checkout_id
  );
  let cancelled = false;
  if (match && match.status === 'created') {
    try {
      await deps.client.cancelSubscription(match.id, false);
      cancelled = true;
    } catch (err) {
      if (!(
        err instanceof RazorpayApiError &&
        (err.isAlreadyInState || err.isNotFound)
      ))
        throw err;
    }
  }
  await deps.store.markOrphanChecked(row.id);
  return cancelled;
}

export async function runReconciliation(
  deps: EventDeps,
  opts: {
    deliver: () => Promise<unknown>;
    budgetMs?: number;
    clock?: () => number;
    /** Recorded on the run row: `cron` (default) or `admin`. */
    scope?: string;
    /** The super admin who started this run, when it was not cron. */
    triggeredBy?: string | null;
  }
): Promise<ReconcileSummary> {
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const overBudget = () => clock() - started > budget;
  const errors: string[] = [];

  const runId = await deps.store.startRun(
    deps.config.mode,
    opts.scope ?? 'cron',
    opts.triggeredBy ?? null
  );

  // (a)
  let events: ProcessSummary = {
    claimed: 0,
    processed: 0,
    ignored: 0,
    failed: 0,
    dead: 0,
  };
  try {
    events = await processDueWebhookEvents(deps, { limit: EVENT_BATCH });
  } catch (err) {
    errors.push(`events: ${message(err)}`);
  }

  // (b), (c), (d)
  const subs = { checked: 0, changed: 0, orphansCancelled: 0, errors: 0 };
  try {
    const candidates = await deps.store.reconcileCandidates(
      deps.config.mode,
      RECONCILE_LIMIT
    );
    for (const candidate of candidates) {
      if (overBudget()) break;
      try {
        const row = await deps.db.getSubscription(candidate.id);
        if (!row) continue;
        subs.checked += 1;
        if (
          candidate.reason === 'orphan_check' ||
          !row.provider_subscription_id
        ) {
          if (await resolveOrphanClaim(deps, row)) subs.orphansCancelled += 1;
          continue;
        }
        const { applied } = await refreshSubscription(
          deps,
          row,
          'reconciliation'
        );
        subs.changed += applied;
        // Once a day per subscription (the sweep), so a notes PATCH that
        // failed earlier is retried without adding calls to every tick.
        // Best effort: a notes read error is logged, not counted as a
        // failed subscription.
        if (candidate.reason === 'sweep') {
          await backfillPaymentNotes(deps, row).catch((err) =>
            console.error(
              `[razorpay] payment notes backfill ${row.id}: ${message(err)}`
            )
          );
        }
      } catch (err) {
        subs.errors += 1;
        errors.push(`subscription ${candidate.id}: ${message(err)}`);
      }
    }
  } catch (err) {
    errors.push(`candidates: ${message(err)}`);
  }

  // (e)
  let notifications: unknown = null;
  try {
    notifications = await opts.deliver();
  } catch (err) {
    errors.push(`outbox: ${message(err)}`);
  }

  let purged: ReconcileSummary['purged'] = null;
  try {
    purged = await deps.store.purge(deps.config.mode, new Date(clock()));
  } catch (err) {
    errors.push(`purge: ${message(err)}`);
  }

  if (runId) {
    await deps.store.finishRun(runId, {
      status: errors.length === 0 ? 'succeeded' : 'failed',
      checked: subs.checked + events.claimed,
      changed: subs.changed + events.processed,
      errors,
    });
  }

  return { events, subscriptions: subs, notifications, purged, errors };
}
