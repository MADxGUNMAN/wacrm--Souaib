// ============================================================
// GET /api/public/sheets-addon/help — dialog content for the add-on
//
// Public on purpose, and the reason matters: every /api/v1 route
// requires a valid API key, so routing Help & Support through one
// would fail exactly for the person who needs it most — someone whose
// key is the thing that will not validate. A support dialog that
// demands working credentials is not a support dialog.
//
// Nothing account-scoped is exposed. The payload is operator-authored
// support copy and public links (docs, website, support address).
//
// The add-on ships no fallback text, so this response IS the dialog.
// A failure here must read as a failure, never as empty content — see
// the 503 below.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { loadHelpContent } from '@/lib/sheets-addon/help';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const content = await loadHelpContent(supabaseAdmin());

    if (!content) {
      // The migration seeds this row, so its absence means the database
      // is not in the state the app expects. Reported as 503 rather than
      // an empty 200: the add-on renders a retry state for a server
      // fault, and would render a blank dialog for an empty success.
      console.error(
        '[public/sheets-addon/help] no settings row - migration not applied?'
      );
      return NextResponse.json(
        { error: 'Support content is not configured yet.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ help: content });
  } catch (err) {
    console.error('[public/sheets-addon/help] GET failed:', err);
    return NextResponse.json(
      { error: 'Could not load support content.' },
      { status: 500 }
    );
  }
}
