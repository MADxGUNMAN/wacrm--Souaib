// ============================================================
// Broadcast sends -> Inbox messages.
//
// A broadcast used to leave no trace in the Inbox. The fan-out called
// Meta directly and recorded progress only on `broadcast_recipients`, so
// the customer received a message, replied, and the agent opening that
// thread saw the reply with nothing above it. The outbound half of the
// conversation did not exist on our side.
//
// This module writes that half: the conversation the reply will land in,
// the message row itself, and the conversation preview that puts the
// thread in the list. `messages.broadcast_id` ties it back to the
// campaign so the Inbox can filter by it.
//
// ─── Best-effort, by contract ─────────────────────────────────────
//
// Every function here swallows its own failures and returns null. By the
// time it runs, Meta has ALREADY accepted the message and the customer's
// phone has it. Throwing would turn a delivered message into a reported
// failure, which is the one outcome worse than a missing inbox row.
// Failures are logged loudly instead, because a sustained run of them
// means the Inbox is silently drifting from reality.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation';
import { interpolateTemplateBody } from '@/lib/whatsapp/template-body-text';

export interface PersistBroadcastMessageArgs {
  accountId: string;
  contactId: string;
  /** The campaign this message belongs to. */
  broadcastId: string;
  templateName: string;
  /** Meta's wamid. The webhook matches delivery/read status on this. */
  waMessageId: string;
  /**
   * The template's stored body text, with `{{n}}` placeholders. Rendered
   * with `params` for the thread preview.
   */
  templateBody?: string | null;
  /** Positional values used for this recipient. */
  params?: string[];
  /**
   * Who triggered the campaign. Also used as the owner of a conversation
   * created here, since `conversations.user_id` is NOT NULL.
   */
  senderUserId: string;
}

export interface PersistedBroadcastMessage {
  conversationId: string;
  messageId: string;
}

/**
 * Record one delivered broadcast message in the Inbox.
 *
 * Returns null on any failure — see the module header for why that is
 * deliberate rather than lazy.
 */
export async function persistBroadcastMessage(
  db: SupabaseClient,
  args: PersistBroadcastMessageArgs
): Promise<PersistedBroadcastMessage | null> {
  try {
    // The SAME thread the customer's reply will resolve to, so a campaign
    // message and its answer sit in one conversation instead of the reply
    // appearing to come out of nowhere.
    const conversationId = await findOrCreateConversationRow(
      db,
      args.accountId,
      args.contactId,
      args.senderUserId
    );

    const contentText = interpolateTemplateBody(
      args.templateBody ?? null,
      args.params ?? []
    );

    const { data: inserted, error: msgError } = await db
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: args.senderUserId,
        content_type: 'template',
        content_text: contentText,
        template_name: args.templateName,
        message_id: args.waMessageId,
        // 'sent' is the truthful state: Meta accepted it and returned a
        // wamid. Delivery and read arrive later by webhook, which matches
        // on `message_id` and advances this row exactly as it does for a
        // one-to-one send.
        status: 'sent',
        sent_at: new Date().toISOString(),
        broadcast_id: args.broadcastId,
      })
      .select('id')
      .single();

    if (msgError || !inserted) {
      console.error(
        '[broadcast-inbox] failed to store broadcast message:',
        msgError?.message
      );
      return null;
    }

    // Without this the thread exists but sinks to the bottom of the
    // Inbox with a stale preview, so the agent never notices it.
    const { error: convError } = await db
      .from('conversations')
      .update({
        last_message_text: contentText ?? `[${args.templateName}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (convError) {
      // The message is stored and visible in the thread; only the list
      // ordering is stale. Not worth discarding the row over.
      console.error(
        '[broadcast-inbox] stored the message but failed to update the conversation preview:',
        convError.message
      );
    }

    return { conversationId, messageId: inserted.id as string };
  } catch (err) {
    console.error(
      '[broadcast-inbox] unexpected failure storing broadcast message:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
