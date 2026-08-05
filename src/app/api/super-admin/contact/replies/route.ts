import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get('submissionId');

    if (!submissionId) {
      return NextResponse.json(
        { error: 'submissionId is required' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    const { data: replies, error } = await admin
      .from('contact_replies')
      .select('id, subject, body, sent_by, created_at')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[contact-replies] Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch replies' },
        { status: 500 }
      );
    }

    return NextResponse.json({ replies: replies || [] });
  } catch (err) {
    console.error('[contact-replies] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
