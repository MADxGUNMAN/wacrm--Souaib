// ============================================================
// In-app support chat — shared types.
//
// Mirrors support_conversations / support_messages from migration
// 20260925120000_support_chat.sql. Imported by both the tenant Settings
// pane and the Super Admin inbox, so it must stay free of server-only
// imports.
// ============================================================

export const SUPPORT_CONVERSATIONS_TABLE = 'support_conversations';
export const SUPPORT_MESSAGES_TABLE = 'support_messages';

/**
 * Which side of the conversation a message came from.
 *
 * Separate from `sender_user_id` so a message stays attributable to a
 * side even after its author's auth user is deleted.
 */
export type SupportSenderKind = 'account' | 'admin';

/** Mirrors the DB CHECK. `text` is all phase 1 sends. */
export type SupportContentType = 'text' | 'image' | 'document' | 'audio';

export type SupportConversationStatus = 'open' | 'closed';

export interface SupportConversation {
  id: string;
  account_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  /** Messages from the operator this workspace has not read. */
  unread_for_account: number;
  /** Messages from the workspace the operator has not read. */
  unread_for_admin: number;
  status: SupportConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  conversation_id: string;
  account_id: string;
  sender_kind: SupportSenderKind;
  sender_user_id: string | null;
  content_type: SupportContentType;
  content_text: string | null;

  /**
   * S3 object key — the source of truth for an attachment.
   *
   * Support attachments are served through short-lived presigned GETs
   * rather than the bucket's public-read URL, so there is no permanent
   * link to store. Unused until phase 2.
   */
  media_key: string | null;
  media_url: string | null;
  media_filename: string | null;
  media_mime_type: string | null;
  media_size_bytes: number | null;

  reply_to_message_id: string | null;

  /**
   * Set when the OTHER side opens the thread.
   *
   * There is deliberately no `delivered` state: in-app, delivery IS the
   * insert, so a second tick meaning the same as the first would be
   * decoration pretending to be information.
   */
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

/**
 * A conversation plus the workspace it belongs to, for the operator's
 * inbox list. The account name is joined in rather than denormalised —
 * a renamed workspace should not leave a stale name in the inbox.
 */
export interface SupportConversationWithAccount extends SupportConversation {
  account_name: string | null;
  /**
   * The workspace's members, so the operator can see who is around
   * before promising a live answer.
   *
   * Sent with the list rather than fetched per thread because presence
   * is keyed by user_id and the operator has no RLS path to another
   * account's profiles — and because the alternative, the account
   * deep-dive RPC, is a far heavier call for two columns.
   */
  members: SupportAuthor[];
  /**
   * The workspace owner, for the avatar and a human name on the row.
   *
   * Sent separately rather than left for the client to find in `members`,
   * because "who owns this workspace" is a role question the server already
   * has the answer to and the client would otherwise need the role on every
   * member just to filter for one.
   */
  owner: SupportAuthor | null;
  /**
   * Whether the workspace can currently open Live chat. Null when unknown
   * (e.g. a stand-in row for a workspace picked from "New message" before
   * the list reloads). `reason` is an access-rules SupportAccessReason.
   */
  access?: { available: boolean; reason: string } | null;
}

/** One author, for the name shown on a bubble. */
export interface SupportAuthor {
  user_id: string;
  full_name: string | null;
  email: string | null;
  /** Null when they never uploaded one — the UI falls back to initials. */
  avatar_url?: string | null;
}

export type SupportAuthorDirectory = Map<string, SupportAuthor>;

// ---- "Support replied" email log (super admin) ----------------------

export const SUPPORT_REPLY_EMAIL_STATUSES = [
  'sent',
  'failed',
  'skipped',
  'pending',
] as const;

export type SupportReplyEmailStatus =
  (typeof SUPPORT_REPLY_EMAIL_STATUSES)[number];

/** One row of GET /api/super-admin/support-chat/reply-emails. */
export interface SupportReplyEmailEntry {
  id: string;
  conversationId: string;
  accountId: string | null;
  accountName: string | null;
  recipients: string[];
  status: SupportReplyEmailStatus;
  /** Failure reason, or "Partial: …" when only some recipients got it. */
  detail: string | null;
  emailedAt: string;
  /** The operator reply that triggered the email. Null if it is gone. */
  reply: {
    preview: string;
    sentAt: string;
    senderName: string | null;
    deleted: boolean;
  } | null;
}
