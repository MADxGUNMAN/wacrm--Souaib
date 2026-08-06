// ============================================================
// GET /api/billing/plans
//
// The catalogue for /upgrade-plan: settings copy, visible billing
// cycles, visible plans, and their prices — in one round trip.
//
// Why this exists at all instead of the client querying Supabase
// directly: the catalogue tables are RLS-enabled with no client
// policies, so `authenticated` reads zero rows from them. Routing the
// read through the server is what keeps hidden plans hidden and keeps
// the price out of client control.
//
// Requires a session (any account member) — a blocked member still
// needs the page to render. It does NOT require an active subscription,
// which would be circular: you cannot pay if the payment page is gated
// behind having paid.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import { getPlansBundle } from '@/lib/subscription/queries';
import { toBillingErrorResponse } from '@/lib/subscription/guard';

export async function GET() {
  try {
    // Auth only — no role or subscription check.
    await getCurrentAccount();

    const bundle = await getPlansBundle();

    return NextResponse.json(bundle);
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
