// ============================================================
// Which conversations belong in "All chats".
//
// A broadcast send is a real message and bumps the ordinary conversation
// preview, so every recipient of a campaign used to jump to the top of All
// chats with campaign copy as its preview. A few hundred recipients buried
// the conversations an agent actually had to answer, and created inbox rows
// for people nobody had ever spoken to.
//
// `conversations.last_direct_message_at` (migration 20260917140000) is the
// newest NON-broadcast message, maintained by a database trigger. These two
// helpers are the only place that decides what to do with it, kept pure so
// the rules are testable — the previous version of this logic was an inline
// filter expression and its edge cases were invisible.
// ============================================================

/** The conversation fields these rules depend on. */
export interface BroadcastVisibilityFields {
  /** Newest message of ANY kind, broadcasts included. */
  last_message_at?: string | null;
  /** Newest non-broadcast message. Null when only bulk sends ever landed. */
  last_direct_message_at?: string | null;
  created_at?: string;
}

/**
 * Should this conversation appear in All chats?
 *
 * True unless the thread has activity and NONE of it is direct — that is
 * the precise definition of "reached only by a campaign".
 *
 * ── Why this is not simply `last_direct_message_at != null` ───────
 *
 * A conversation with no messages at all also has a null
 * `last_direct_message_at`, and those must keep showing. An empty thread is
 * created whenever someone starts a chat from the Contacts panel or when a
 * send fails after the conversation row was resolved; hiding it would make
 * the compose action look broken, which is a different bug in exchange for
 * the one being fixed. Requiring `last_message_at` to be present first
 * separates "only ever broadcast" from "nothing yet".
 */
export function isVisibleInAllChats(
  conversation: BroadcastVisibilityFields
): boolean {
  const hasAnyActivity = Boolean(conversation.last_message_at);
  const hasDirectActivity = Boolean(conversation.last_direct_message_at);

  if (!hasAnyActivity) return true;
  return hasDirectActivity;
}

/**
 * Sort key for All chats, newest first.
 *
 * Deliberately ignores `last_message_at`, which is what produced the
 * reordering complaint: a campaign send would move a thread to the top even
 * though nothing had actually happened in it. Ordering on direct activity
 * means a broadcast leaves the list untouched.
 *
 * Empty conversations have neither timestamp and fall back to `created_at`,
 * so a freshly started chat sits at the top where the person who just
 * created it expects to find it, rather than at the bottom.
 */
export function allChatsSortKey(
  conversation: BroadcastVisibilityFields
): number {
  const source =
    conversation.last_direct_message_at ?? conversation.created_at ?? null;
  if (!source) return 0;
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Preview text and timestamp for a row, given which tab is showing.
 *
 * The two views answer different questions and so read different columns.
 * All chats shows the last real exchange; the Broadcasts view shows the
 * campaign send, because that is the thing being inspected there — showing
 * the last direct message would hide the very send the operator opened the
 * tab to look at.
 */
export function rowPreview(
  conversation: BroadcastVisibilityFields & {
    last_message_text?: string | null;
    last_direct_message_text?: string | null;
  },
  viewMode: 'all' | 'broadcast'
): { text: string | null; at: string | null } {
  if (viewMode === 'broadcast') {
    return {
      text: conversation.last_message_text ?? null,
      at: conversation.last_message_at ?? null,
    };
  }

  return {
    text: conversation.last_direct_message_text ?? null,
    at: conversation.last_direct_message_at ?? null,
  };
}
