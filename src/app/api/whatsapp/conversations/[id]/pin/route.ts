import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: conversationId } = await context.params;
    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'Profile not linked to an account' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { messageId } = body as { messageId?: string | null };

    // Verify conversation belongs to this account
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id, account_id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // If messageId is provided, verify message exists in this conversation
    if (messageId) {
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .select('id')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .single();

      if (msgErr || !msg) {
        return NextResponse.json({ error: 'Message not found in conversation' }, { status: 404 });
      }
    }

    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        pinned_message_id: messageId || null,
        pinned_at: messageId ? new Date().toISOString() : null,
        pinned_by: messageId ? user.id : null,
      })
      .eq('id', conversationId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pinnedMessageId: messageId || null,
    });
  } catch (err) {
    console.error('Error updating pinned message:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
