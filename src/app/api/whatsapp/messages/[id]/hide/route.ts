import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: messageId } = await context.params;
    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if currently hidden for this user
    const { data: existing } = await supabase
      .from('message_hidden_users')
      .select('message_id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Unhide
      const { error: delErr } = await supabase
        .from('message_hidden_users')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ hidden: false });
    } else {
      // Hide
      const { error: insErr } = await supabase
        .from('message_hidden_users')
        .insert({
          message_id: messageId,
          user_id: user.id,
        });

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ hidden: true });
    }
  } catch (err) {
    console.error('Error toggling message hide:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
