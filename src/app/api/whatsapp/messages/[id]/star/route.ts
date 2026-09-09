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

    // Check if currently starred by this user
    const { data: existing } = await supabase
      .from('message_stars')
      .select('message_id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Unstar
      const { error: delErr } = await supabase
        .from('message_stars')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      return NextResponse.json({ starred: false });
    } else {
      // Star
      const { error: insErr } = await supabase
        .from('message_stars')
        .insert({
          message_id: messageId,
          user_id: user.id,
        });

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ starred: true });
    }
  } catch (err) {
    console.error('Error toggling message star:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
