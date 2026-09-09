/**
 * Single source of truth for message content types across the application.
 *
 * Used by:
 * - Database migration `076_message_types_and_metadata.sql` (messages_content_type_check)
 * - Inbound Webhook parser (`src/app/api/whatsapp/webhook/route.ts`)
 * - TypeScript definitions (`src/types/index.ts`)
 * - Message UI renderer (`MessageBubble`)
 */

export const CONTENT_TYPES = [
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'template',
  'interactive',
  'sticker', // dedicated rendering without bubble chrome
  'contacts', // contact cards in & out
  'unsupported', // poll, live location, view once placeholders
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_SET = new Set<string>(CONTENT_TYPES);

/**
 * Raw WhatsApp types that mean the same thing as one of ours under a
 * different name. Without these an inbound message lands on 'unsupported'
 * and the inbox shows a "message type not supported" card even though the
 * text was captured fine.
 *
 * `button` is a quick-reply tap on a TEMPLATE message. Meta reports
 * interactive-message taps as `interactive` but template button taps as
 * `button`; both are a customer choosing a canned reply, so they render
 * and behave identically for us.
 */
const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  button: 'interactive',
};

/**
 * Normalizes an incoming raw WhatsApp message type string into an allowed ContentType.
 */
export function normalizeContentType(
  rawType: string | undefined | null
): ContentType {
  if (!rawType) return 'unsupported';
  if (CONTENT_TYPE_SET.has(rawType)) {
    return rawType as ContentType;
  }
  return CONTENT_TYPE_ALIASES[rawType] ?? 'unsupported';
}
