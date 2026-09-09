import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/whatsapp/conversations/[id]/typing
 *
 * Sends a typing indicator to Meta for the active conversation.
 * Indicator lasts 25s or until an outbound reply is sent.
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

    // Rate-limit per conversation to prevent quota waste (at most 4 requests per 60s)
    const rateLimit = checkRateLimit(`typing:${conversationId}`, {
      limit: 4,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.success) {
      return NextResponse.json(
        { success: true, rateLimited: true },
        { status: 200 }
      );
    }

    // Verify conversation belongs to account
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Fetch latest inbound customer message wamid
    const { data: latestInbound } = await supabase
      .from('messages')
      .select('id, message_id')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestInbound?.message_id) {
      return NextResponse.json({ success: true, sent: false });
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status')
      .eq('account_id', accountId)
      .maybeSingle();

    if (config?.phone_number_id && config?.access_token && config.status === 'connected') {
      try {
        const accessToken = decrypt(config.access_token);
        await sendTypingIndicator({
          phoneNumberId: config.phone_number_id,
          accessToken,
          messageId: latestInbound.message_id,
        });
      } catch (error) {
        console.warn('[typing-indicator] Failed to send typing indicator to Meta:', error);
      }
    }

    return NextResponse.json({ success: true, sent: true });
  } catch (error) {
    console.error('[typing-indicator] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
