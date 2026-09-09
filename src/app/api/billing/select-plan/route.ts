// ============================================================
// POST /api/billing/select-plan
//
// Records the plan + billing term a customer picked, WITHOUT charging
// them. Called by both buttons on /upgrade-plan:
//
//   "Continue to payment" — save the choice, then go to the QR screen
//   "Start with trial"    — save the choice, then go to the CRM
//
// ─── Why saving it matters ────────────────────────────────────
//
// Before this, the choice lived only in the URL (`?plan=&cycle=`). That
// made two things impossible:
//
//   1. Trial expiry could only ever dump the customer on the generic
//      pricing grid, even though they had already told us what they
//      wanted on day one.
//   2. Billing could not show an unpaid "upcoming plan", because nothing
//      recorded an intention — `accounts.subscription_plan_id` is only
//      written once a payment is APPROVED.
//
// It also clears `plan_selection_required`, which is what releases a new
// signup from the plan-selection step and into the CRM.
//
// Owner-only, and validated against the catalogue server-side: the
// catalogue tables are RLS-closed to clients, so the browser cannot read
// a price and must not be trusted to name a valid pair.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireBillingOwner,
  toBillingErrorResponse,
} from '@/lib/subscription/guard';
import { setSelectedPlan } from '@/lib/subscription/queries';

interface SelectPlanBody {
  planId?: unknown;
  cycleId?: unknown;
}

export async function POST(request: Request) {
  try {
    // Deliberately NOT requireActiveSubscription: an expired account has
    // to be able to pick a plan, that being the only way back.
    const ctx = await requireBillingOwner();

    let body: SelectPlanBody;
    try {
      body = (await request.json()) as SelectPlanBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
    const cycleId = typeof body.cycleId === 'string' ? body.cycleId.trim() : '';

    // Both or neither. A half-selection cannot be priced, and storing one
    // would put a dead "Pay now" button in Billing.
    if (!planId || !cycleId) {
      return NextResponse.json(
        { error: 'planId and cycleId are both required' },
        { status: 400 }
      );
    }

    const selected = await setSelectedPlan(ctx.accountId, planId, cycleId);

    return NextResponse.json({ selectedPlan: selected });
  } catch (err) {
    return toBillingErrorResponse(err);
  }
}
