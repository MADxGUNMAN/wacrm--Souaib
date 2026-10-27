// Phase 3 test factories: a fake BillingStore, a Razorpay client fake that
// also covers refunds, disputes and listing, and event-dep wiring.

import { vi } from 'vitest';

import type { EventClient, EventDeps } from '../events';
import type { BillingStore } from '../store';
import type {
  BillingWebhookEventRow,
  RazorpayDispute,
  RazorpayRefund,
} from '../types';
import { makeClient, makeConfig, makeDb } from './factories';

export function makeStore() {
  return {
    insertWebhookEvent: vi.fn<BillingStore['insertWebhookEvent']>(async () => ({
      id: 'evt-row-1',
    })),
    claimWebhookEvents: vi.fn<BillingStore['claimWebhookEvents']>(
      async () => []
    ),
    finishWebhookEvent: vi.fn<BillingStore['finishWebhookEvent']>(
      async () => undefined
    ),
    claimNotifications: vi.fn<BillingStore['claimNotifications']>(
      async () => []
    ),
    finishNotification: vi.fn<BillingStore['finishNotification']>(
      async () => undefined
    ),
    applyRefund: vi.fn<BillingStore['applyRefund']>(async () => ({
      outcome: 'processed',
    })),
    applyDispute: vi.fn<BillingStore['applyDispute']>(async () => ({
      outcome: 'applied',
      lost: false,
    })),
    reconcileCandidates: vi.fn<BillingStore['reconcileCandidates']>(
      async () => []
    ),
    markOrphanChecked: vi.fn<BillingStore['markOrphanChecked']>(
      async () => undefined
    ),
    notifyAdmin: vi.fn<BillingStore['notifyAdmin']>(async () => undefined),
    getRecipient: vi.fn<BillingStore['getRecipient']>(async () => ({
      email: 'owner@example.com',
      name: 'Demo Owner',
    })),
    startRun: vi.fn<BillingStore['startRun']>(async () => 'run-1'),
    finishRun: vi.fn<BillingStore['finishRun']>(async () => undefined),
    purge: vi.fn<BillingStore['purge']>(async () => ({
      payloads: 0,
      notifications: 0,
    })),
  } satisfies BillingStore;
}

export function makeEventClient() {
  const unexpected = (name: string) => async () => {
    throw new Error(`unexpected Razorpay call: ${name}`);
  };
  return {
    ...makeClient(),
    listSubscriptions: vi.fn<EventClient['listSubscriptions']>(
      unexpected('listSubscriptions')
    ),
    fetchRefund: vi.fn<EventClient['fetchRefund']>(unexpected('fetchRefund')),
    fetchDispute: vi.fn<EventClient['fetchDispute']>(
      unexpected('fetchDispute')
    ),
  } satisfies EventClient;
}

export const NOW = new Date('2026-10-21T06:00:00.000Z');

export function makeEventDeps(configOverrides = {}) {
  const db = makeDb();
  const client = makeEventClient();
  const store = makeStore();
  const config = makeConfig(configOverrides);
  const deps: EventDeps = { db, client, store, config, now: () => NOW };
  return { db, client, store, config, deps };
}

export function makeEventRow(
  overrides: Partial<BillingWebhookEventRow> = {}
): BillingWebhookEventRow {
  return {
    id: 'evt-row-1',
    mode: 'test',
    provider_event_id: 'evt_Unit000001',
    event_type: 'subscription.authenticated',
    account_id: null,
    entity_ids: { subscription: 'sub_Unit000001' },
    provider_created_at: NOW.toISOString(),
    received_at: NOW.toISOString(),
    payload: null,
    status: 'processing',
    attempts: 1,
    next_attempt_at: null,
    locked_until: null,
    last_error: null,
    anomaly: null,
    processed_at: null,
    requeue_count: 0,
    requeued_at: null,
    requeued_by: null,
    ...overrides,
  };
}

export function makeRefund(
  overrides: Partial<RazorpayRefund> = {}
): RazorpayRefund {
  return {
    id: 'rfnd_Unit000001',
    entity: 'refund',
    amount: 99000,
    currency: 'INR',
    payment_id: 'pay_Unit000001',
    status: 'processed',
    speed_requested: 'normal',
    speed_processed: 'normal',
    created_at: 1792562600,
    ...overrides,
  };
}

export function makeDispute(
  overrides: Partial<RazorpayDispute> = {}
): RazorpayDispute {
  return {
    id: 'disp_Unit000001',
    entity: 'dispute',
    payment_id: 'pay_Unit000001',
    amount: 99000,
    currency: 'INR',
    reason_code: 'fraud',
    respond_by: 1793000000,
    status: 'open',
    phase: 'chargeback',
    created_at: 1792562700,
    ...overrides,
  };
}
