// ============================================================
// POST /api/geo/expand-link
//
// Follows a Google Maps SHORT link and returns the URL it lands on, so the
// client-side parser can read coordinates out of it.
//
// Body: { url: string }  →  { url: string }
//
// ─── Why the server has to do this ───────────────────────────────
//
// `maps.app.goo.gl/xyz` is opaque: the coordinates only exist in the URL it
// redirects to. The browser cannot read that itself — a cross-origin fetch
// to google.com is blocked by CORS, and `redirect: 'manual'` hides the
// Location header. So this is the one part of the paste-a-link flow that
// cannot be pure client-side code.
//
// This matters because the mobile Google Maps "Share" button produces
// exactly this kind of link. Refusing them would push the agent back to
// GPS, which is the thing that does not work.
//
// ─── Why the host allowlist is not optional ──────────────────────
//
// An endpoint that fetches a caller-supplied URL is a server-side request
// forgery primitive: without a check, `http://169.254.169.254/...` reads
// cloud instance metadata, and `http://localhost:3000/...` reaches our own
// internal routes with this server's network position. The allowlist means
// this can only ever talk to Google's URL shorteners, and the redirect
// target is re-checked because a redirect is a second, attacker-influenced
// URL.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  isAllowedMapsTarget,
  isGoogleShortLink,
} from '@/lib/geo/parse-location';

export async function POST(request: Request) {
  try {
    // Signed-in only. This makes an outbound request on the caller's
    // behalf; there is no reason to offer that to anonymous traffic.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const url = (body as { url?: unknown } | null)?.url;

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { error: 'A url is required.' },
        { status: 400 }
      );
    }
    if (!isGoogleShortLink(url) || !isAllowedMapsTarget(url)) {
      return NextResponse.json(
        { error: 'Only Google Maps short links can be expanded.' },
        { status: 400 }
      );
    }

    // `redirect: 'follow'` is what resolves the chain. Capped by a short
    // timeout so a hanging third party cannot pin a request handler open.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        // Google serves a coordinate-bearing URL to a normal browser and a
        // consent interstitial to an unrecognised agent.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en',
      },
    });

    // Re-check where we actually ended up: the redirect target is chosen by
    // the remote side, not by us.
    if (!isAllowedMapsTarget(res.url)) {
      return NextResponse.json(
        { error: 'That link did not resolve to Google Maps.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ url: res.url });
  } catch (err) {
    // Includes the timeout. Deliberately vague to the client and specific
    // in the log — the caller can only act on "it did not work".
    console.error('[geo/expand-link] error:', err);
    return NextResponse.json(
      {
        error:
          'Could not expand that link. Paste the full Google Maps URL instead.',
      },
      { status: 502 }
    );
  }
}
