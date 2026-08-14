import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'
import type { SenderType } from '@/types'

interface DbMessage {
  sender_type: SenderType
  content_text: string | null
}

/**
 * Fetch the last N text messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`;
 * everything else the business said — agent, bot, and messages typed in
 * the WhatsApp Business App on a phone — becomes `assistant`. Non-text
 * messages (media, templates, interactive) are excluded — they carry no
 * text to model.
 *
 * The "anything not customer is assistant" mapping is why Coexistence
 * needed no change here: a phone-typed reply IS the business speaking,
 * and the model should see it as such, or it would answer a question a
 * colleague already answered from their phone.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .eq('content_type', 'text')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  return rows
    .filter((m) => m.content_text && m.content_text.trim())
    .map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content_text!.trim(),
    }))
}
