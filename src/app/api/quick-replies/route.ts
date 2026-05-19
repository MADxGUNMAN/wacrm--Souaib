import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isMissingQuickRepliesTable(error: { message?: string; code?: string }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes("Could not find the table 'public.quick_replies'")
  );
}

function missingTableResponse() {
  return NextResponse.json(
    {
      error:
        'Quick replies are not installed yet. Apply migration 009_quick_replies_and_contact_cards.sql in Supabase.',
      code: 'QUICK_REPLIES_TABLE_MISSING',
    },
    { status: 503 }
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .select('id, shortcut, text, created_at')
    .eq('user_id', user.id)
    .order('shortcut', { ascending: true });

  if (error) {
    if (isMissingQuickRepliesTable(error)) return missingTableResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const shortcut = String(body.shortcut || '')
    .trim()
    .replace(/^\/+/, '');
  const text = String(body.text || '').trim();

  if (!shortcut || !text) {
    return NextResponse.json(
      { error: 'shortcut and text are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .insert({ user_id: user.id, shortcut, text })
    .select('id, shortcut, text, created_at')
    .single();

  if (error) {
    if (isMissingQuickRepliesTable(error)) return missingTableResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    if (isMissingQuickRepliesTable(error)) return missingTableResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
