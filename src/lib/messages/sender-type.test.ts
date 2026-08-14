import { describe, expect, it } from 'vitest';

import { isFromBusinessApp, isOutboundSender } from './sender-type';

/**
 * Regression guard for the four-call-site bug.
 *
 * "Is this message from us?" was written inline as
 * `sender_type === 'agent' || sender_type === 'bot'` in four separate
 * components. Adding a fourth sender type (`business_app`, a message
 * typed in the WhatsApp Business App under Coexistence) silently broke
 * every one of them, and TYPESCRIPT COULD NOT CATCH IT — comparing a
 * wider union against a string literal is perfectly legal, so `tsc`
 * stayed green while phone-sent messages rendered on the wrong side of
 * the thread, styled and labelled as the customer's.
 *
 * These tests are cheap insurance on the value that has no compiler
 * behind it.
 */

describe('isOutboundSender', () => {
  it('is true for everything the business sends', () => {
    expect(isOutboundSender('agent')).toBe(true); // a human, in the CRM
    expect(isOutboundSender('bot')).toBe(true); // automation / flow / AI
    expect(isOutboundSender('business_app')).toBe(true); // typed on a phone
  });

  it('is false only for the customer', () => {
    expect(isOutboundSender('customer')).toBe(false);
  });

  it('does not treat an unknown sender as outbound', () => {
    // A value we have never seen must not default to "ours". Guessing
    // outbound would right-align a customer's message and label it
    // "You", which reads as the business having said something it did
    // not.
    expect(isOutboundSender('something_new')).toBe(false);
  });
});

describe('isFromBusinessApp', () => {
  it('singles out phone-typed messages', () => {
    expect(isFromBusinessApp('business_app')).toBe(true);
  });

  it('is false for every other sender', () => {
    // Deliberately narrower than isOutboundSender: alignment treats these
    // the same, but only business_app earns the "Phone" badge. Widening
    // this would label ordinary CRM replies as phone-sent.
    expect(isFromBusinessApp('agent')).toBe(false);
    expect(isFromBusinessApp('bot')).toBe(false);
    expect(isFromBusinessApp('customer')).toBe(false);
  });
});
