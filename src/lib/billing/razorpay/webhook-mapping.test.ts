import { describe, expect, it } from 'vitest';

import { makeDispute, makeRefund } from './__fixtures__/phase3';
import type { RazorpayWebhookEvent } from './types';
import {
  parseWebhookEvent,
  toDisputeSnapshot,
  toRefundSnapshot,
  webhookEntityIds,
} from './webhook-mapping';

const event = (
  payload: RazorpayWebhookEvent['payload'],
  type = 'subscription.charged'
): RazorpayWebhookEvent => ({
  entity: 'event',
  event: type,
  payload,
});

describe('parseWebhookEvent', () => {
  it('accepts a Razorpay event body', () => {
    const e = parseWebhookEvent(
      JSON.stringify(
        event({ subscription: { entity: { id: 'sub_Unit000001' } } })
      )
    );
    expect(e?.event).toBe('subscription.charged');
  });

  it.each([
    'not json',
    '[]',
    '{}',
    '{"event":"x","payload":{}}',
    '{"event":"subscription.charged","payload":[]}',
  ])('rejects %s', (raw) => {
    expect(parseWebhookEvent(raw)).toBeNull();
  });
});

describe('webhookEntityIds', () => {
  it('collects the ids each entity names', () => {
    expect(
      webhookEntityIds(
        event({
          subscription: { entity: { id: 'sub_Unit000001' } },
          payment: { entity: { id: 'pay_Unit000001' } },
        })
      )
    ).toEqual({ subscription: 'sub_Unit000001', payment: 'pay_Unit000001' });
  });

  it('takes the payment id from refund and dispute payloads', () => {
    expect(
      webhookEntityIds(
        event(
          {
            refund: {
              entity: { id: 'rfnd_Unit000001', payment_id: 'pay_Unit000001' },
            },
          },
          'refund.processed'
        )
      )
    ).toEqual({ refund: 'rfnd_Unit000001', payment: 'pay_Unit000001' });
  });

  it('takes subscription and payment ids from an invoice', () => {
    expect(
      webhookEntityIds(
        event(
          {
            invoice: {
              entity: {
                id: 'inv_Unit000001',
                subscription_id: 'sub_Unit000001',
                payment_id: 'pay_Unit000001',
              },
            },
          },
          'invoice.paid'
        )
      )
    ).toEqual({
      invoice: 'inv_Unit000001',
      subscription: 'sub_Unit000001',
      payment: 'pay_Unit000001',
    });
  });

  it('drops anything that is not shaped like a Razorpay id', () => {
    expect(
      webhookEntityIds(
        event({
          subscription: { entity: { id: "sub_x'; drop table" } },
          payment: { entity: { id: 'order_Unit000001' } },
        })
      )
    ).toEqual({});
  });
});

describe('refund and dispute snapshots', () => {
  it('maps a refund (minor units, upper-case currency, ISO time)', () => {
    expect(toRefundSnapshot(makeRefund({ currency: 'inr' }))).toEqual({
      provider_refund_id: 'rfnd_Unit000001',
      provider_payment_id: 'pay_Unit000001',
      amount_minor: 99000,
      currency: 'INR',
      status: 'processed',
      speed_requested: 'normal',
      speed_processed: 'normal',
      provider_created_at: new Date(1792562600 * 1000).toISOString(),
    });
  });

  it('maps a dispute with its respond-by deadline', () => {
    const d = toDisputeSnapshot(makeDispute({ status: 'UNDER_REVIEW' }));
    expect(d).toMatchObject({
      provider_dispute_id: 'disp_Unit000001',
      status: 'under_review',
      phase: 'chargeback',
    });
    expect(d.respond_by).toBe(new Date(1793000000 * 1000).toISOString());
  });
});
