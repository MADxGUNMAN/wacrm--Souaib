/**
 * Reading `messages.sender_type` — pure, no I/O.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * "Is this message from us?" was written inline as
 *
 *     sender_type === 'agent' || sender_type === 'bot'
 *
 * in four separate components. When Coexistence added a fourth value,
 * `business_app` (a message the business typed in the WhatsApp Business
 * App on their phone), every one of those four places silently got the
 * WRONG answer — and TypeScript could not help, because comparing a
 * wider union against a string literal is perfectly legal. The bugs
 * would have been visual: phone-sent messages rendered on the left,
 * styled as if the customer had sent them, labelled with the customer's
 * name.
 *
 * One helper, four call sites updated, and the next value added to the
 * union has exactly one place to change.
 */

import type { SenderType } from '@/types';

/**
 * Did the BUSINESS send this, whoever or whatever typed it?
 *
 * Drives bubble alignment, colour, and the "You" author label. All three
 * are about which side of the conversation a message belongs to, which is
 * the same question for a human agent, an automation, and a phone.
 */
export function isOutboundSender(senderType: SenderType | string): boolean {
  return (
    senderType === 'agent' ||
    senderType === 'bot' ||
    senderType === 'business_app'
  );
}

/**
 * Was this typed outside the CRM, in the WhatsApp Business App?
 *
 * Kept separate from `isOutboundSender` on purpose. Alignment treats
 * these messages the same as any other outbound message, but the inbox
 * still has to SAY where it came from: an agent seeing a reply nobody on
 * the team wrote will otherwise assume a colleague sent it, or that the
 * CRM double-sent.
 */
export function isFromBusinessApp(senderType: SenderType | string): boolean {
  return senderType === 'business_app';
}
