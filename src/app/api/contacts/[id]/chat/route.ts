import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('member');
    const { id: contactId } = await params;

    if (!contactId) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    // Check if a conversation already exists for this contact in the account
    const { data: existing, error: findErr } = await ctx.supabase
      .from('conversations')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr) {
      console.error('[contacts-chat] failed to look up conversation:', findErr);
    }

    if (existing?.id) {
      return NextResponse.json({ conversationId: existing.id });
    }

    // Verify contact belongs to this account
    const { data: contact, error: contactErr } = await ctx.supabase
      .from('contacts')
      .select('id, user_id')
      .eq('account_id', ctx.accountId)
      .eq('id', contactId)
      .maybeSingle();

    if (contactErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Create a new conversation row for this contact
    const { data: newConv, error: insertErr } = await ctx.supabase
      .from('conversations')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        contact_id: contactId,
        status: 'open',
        import_state: 'live',
      })
      .select('id')
      .single();

    if (newConv?.id) {
      return NextResponse.json({ conversationId: newConv.id });
    }

    // Handle race condition where conversation was created concurrently
    const { data: raced } = await ctx.supabase
      .from('conversations')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (raced?.id) {
      return NextResponse.json({ conversationId: raced.id });
    }

    console.error('[contacts-chat] failed to insert conversation:', insertErr);
    return NextResponse.json(
      { error: insertErr?.message || 'Failed to create conversation' },
      { status: 500 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
