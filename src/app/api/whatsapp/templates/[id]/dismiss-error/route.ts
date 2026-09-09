// ============================================================
// POST /api/whatsapp/templates/:id/dismiss-error
//
// Clears the failure text stored on a template row.
//
// Why this needs to exist: `submission_error` is written whenever a
// submit or edit is refused by Meta, but until now the ONLY things that
// cleared it were a successful edit, a status webhook, or a library
// re-create. A failed edit against an already-APPROVED template
// therefore left a permanent red banner on a template that was perfectly
// healthy and sendable — the row said APPROVED and displayed an error
// simultaneously, and no action available in the UI could remove it.
//
// This deliberately does NOT touch Meta. Nothing about the template on
// Meta's side changes; the row's `status`, `components` and
// `meta_template_id` are all left exactly as they are. It only clears
// OUR note about a past attempt, which is why it is safe to expose as a
// one-click dismiss.
//
// `rejection_reason` is cleared too, but ONLY when the template is not
// currently rejected. While Meta says REJECTED that text is the live
// explanation for why the template cannot be sent, so dismissing it
// would hide a fact the user still needs.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    // Read the status first: whether `rejection_reason` may be cleared
    // depends on it, and scoping by account_id here is what stops one
    // workspace clearing another's rows.
    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (lookupErr || !existing) {
      return NextResponse.json(
        { error: 'Template not found.' },
        { status: 404 }
      );
    }

    const isRejected = existing.status === 'REJECTED';

    const { data: row, error: updErr } = await supabase
      .from('message_templates')
      .update({
        submission_error: null,
        // Preserved while genuinely rejected — see the header comment.
        ...(isRejected ? {} : { rejection_reason: null }),
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json(
        { error: `Could not clear the message: ${updErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template: row });
  } catch (error) {
    console.error('[template dismiss-error] failed:', error);
    return NextResponse.json(
      { error: 'Could not clear the message.' },
      { status: 500 }
    );
  }
}
