import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { markMessageRead } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';

/**
 * POST /api/whatsapp/conversations/[id]/read
 *
 * Marks a conversation as read:
 * 1. Resolves the latest inbound customer wamid.
 * 2. Notifies Meta Cloud API (sends status: 'read' → gives customer blue ticks).
 * 3. Zeros out `unread_count` on the conversation row.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Profile not linked to an account' },
        { status: 403 }
      );
    }

    const { id: conversationId } = await params;
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id required' },
        { status: 400 }
      );
    }

    // Verify conversation belongs to this account
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, unread_count')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Reset unread_count on database
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    // Fetch latest inbound customer message with a valid Meta wamid
    const { data: latestInbound } = await supabase
      .from('messages')
      .select('id, message_id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let markedReadWithMeta = false;

    if (latestInbound?.message_id) {
      const { data: config } = await supabase
        .from('whatsapp_config')
        .select('phone_number_id, access_token, status')
        .eq('account_id', accountId)
        .maybeSingle();

      if (config?.phone_number_id && config?.access_token && config.status === 'connected') {
        try {
          const accessToken = decrypt(config.access_token);
          const result = await markMessageRead({
            phoneNumberId: config.phone_number_id,
            accessToken,
            messageId: latestInbound.message_id,
          });
          markedReadWithMeta = result.success;
        } catch (error) {
          // Log and do not fail the HTTP request — read receipt failures must never break the UI
          console.warn('[read-receipt] Failed to mark message read with Meta:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      markedRead: markedReadWithMeta,
    });
  } catch (error) {
    console.error('[read-receipt] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
