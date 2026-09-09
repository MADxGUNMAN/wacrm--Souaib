/**
 * Who sent this message — pure, no I/O.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * An outbound bubble used to say only "not the customer". On a shared
 * account that is not enough: a thread could contain a member's reply,
 * the owner's reply, a message typed on the owner's phone, a
 * deterministic automation and an AI agent, all rendered identically. A
 * live conversation was reviewed where the operator could not tell which
 * of five outbound messages he had written himself — the answer was none
 * of them.
 *
 * The rules are here rather than in the bubble so they are one readable
 * list instead of nested ternaries in JSX, and so the precedence order is
 * explicit: it matters, because a message can satisfy two conditions at
 * once (a bot send is also outbound; an AI send is also a bot send).
 */

import type { Message, SenderType } from '@/types';

/** One team member, reduced to what a label needs. */
export interface MessageAuthor {
  userId: string;
  fullName: string;
  /**
   * True for `profiles.account_role = 'owner'`.
   *
   * Derived by the caller rather than compared here, because the
   * `account_role` enum still physically carries three legacy values
   * ('admin', 'agent', 'viewer') that migration 038 collapsed into
   * 'member' — so "is owner" is the only safe test, never "is member".
   */
  isOwner: boolean;
}

/** `user_id` → member. Built once per thread, not per bubble. */
export type AuthorDirectory = ReadonlyMap<string, MessageAuthor>;

export type MessageAuthorLabel =
  /** A named team member sent this from the CRM. */
  | { kind: 'person'; name: string }
  /** The account owner sent this from the CRM. */
  | { kind: 'owner' }
  /** A model wrote it: AI auto-reply, or an `ai_agent` flow node. */
  | { kind: 'ai' }
  /** A deterministic Flow or automation sent it — no model involved. */
  | { kind: 'automation' }
  /** Typed in the WhatsApp Business App on a phone (Coexistence). */
  | { kind: 'phone' };

/**
 * Resolve the label for one message, or null when there is nothing
 * truthful to say.
 *
 * Null cases, both deliberate:
 *   - inbound messages, which already carry the contact's name in the UI
 *   - an `agent` send with no `sender_id`: every row written before
 *     migration 075, plus public-API sends. Showing a guess ("Team", or
 *     the API key owner's name) would be worse than showing nothing —
 *     an attribution that might be wrong is not an attribution.
 */
export function resolveMessageAuthorLabel(
  message: Pick<Message, 'sender_type' | 'sender_id' | 'ai_generated'>,
  directory: AuthorDirectory
): MessageAuthorLabel | null {
  const senderType = message.sender_type as SenderType;

  // Checked first: a phone message is outbound and has no sender_id, so a
  // later branch would fall through to "unknown" and drop the one fact we
  // do have about it.
  if (senderType === 'business_app') return { kind: 'phone' };

  if (senderType === 'bot') {
    // Both are sender_type 'bot'; only the flag separates them, and the
    // distinction is the whole point — "the AI said this" and "a rule I
    // configured said this" call for different reactions from an agent.
    return message.ai_generated ? { kind: 'ai' } : { kind: 'automation' };
  }

  if (senderType === 'agent') {
    if (!message.sender_id) return null;
    const author = directory.get(message.sender_id);
    if (!author) return null;
    // "Owner" rather than the owner's name, because that is the fact a
    // member needs: not which human, but that it came from the person who
    // owns the account. There is exactly one owner per account
    // (idx_accounts_one_per_owner), so it is never ambiguous.
    if (author.isOwner) return { kind: 'owner' };
    return { kind: 'person', name: author.fullName };
  }

  // 'customer', or a sender_type added later that nothing here knows how
  // to describe. Silence beats a wrong guess.
  return null;
}

/**
 * Build the directory from raw profile rows.
 *
 * Kept next to the resolver so the `account_role` caveat above lives in
 * one file. Rows with a blank `full_name` fall back to the email local
 * part: `full_name` is NOT NULL in the schema but can be an empty string
 * for an account created before the signup trigger populated it, and an
 * empty badge looks like a rendering bug.
 */
export function buildAuthorDirectory(
  profiles: readonly {
    user_id: string;
    full_name?: string | null;
    email?: string | null;
    account_role?: string | null;
  }[]
): AuthorDirectory {
  const map = new Map<string, MessageAuthor>();
  for (const p of profiles) {
    if (!p.user_id) continue;
    const name =
      p.full_name?.trim() || p.email?.trim().split('@')[0] || 'Unknown';
    map.set(p.user_id, {
      userId: p.user_id,
      fullName: name,
      isOwner: p.account_role === 'owner',
    });
  }
  return map;
}
