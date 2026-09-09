// ============================================================
// GET   /api/whatsapp/opt-in-out/status?phone=…  — one number's status
// PATCH /api/whatsapp/opt-in-out/status          — change it
//
// WHY THIS ROUTE EXISTS
//
// The inbox contact sidebar used to call `recordMarketingOptOut` and
// `removeMarketingOptOut` straight from the browser, passing the user's
// own Supabase client. That worked — RLS is the real gate — but it meant a
// CLIENT component imported `marketing-opt-out.ts`, which pulls the Meta
// API layer and Supabase's server types into the page bundle. The same
// mistake is documented in `template-validators.ts` and cost a debugging
// session there.
//
// Moving it behind a route fixes that AND buys two things the direct
// calls could not:
//
//   * `actor_user_id` on the audit row. The browser could write the
//     suppression row but had no trustworthy way to say WHO did it.
//   * one place that knows both halves — the suppression index and the
//     lifecycle log — so a status and its date cannot disagree.
//
// Reads are open to any member who can see opt-out settings; writes are
// member-tier, matching `marketing_opt_outs_write`. Re-subscribing a
// contact who asked in conversation is ordinary inbox work, not a
// settings change — which is why this is NOT owner-only, unlike the
// keyword configuration.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import {
  recordMarketingOptOut,
  removeMarketingOptOut,
  resolveSubscriptionStatus,
} from '@/lib/whatsapp/marketing-opt-out';
import {
  isCallerError,
  resolveOptInOutCaller,
} from '@/lib/whatsapp/opt-in-out-access';

export async function GET(request: Request) {
  const supabase = await createClient();
  const caller = await resolveOptInOutCaller(supabase);
  if (isCallerError(caller)) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  if (!caller.canRead) {
    return NextResponse.json(
      { error: 'You do not have access to subscription status.' },
      { status: 403 }
    );
  }

  const raw = new URL(request.url).searchParams.get('phone') ?? '';
  const phone = normalizePhone(raw);
  if (!phone) {
    return NextResponse.json(
      { error: 'A phone number is required.' },
      { status: 400 }
    );
  }

  // Runs on the CALLER's client, so RLS scopes it to their account. The
  // accountId is passed for the index, not for authorisation.
  const status = await resolveSubscriptionStatus(supabase, {
    accountId: caller.accountId,
    phone,
  });

  return NextResponse.json({
    phone,
    status: status.status,
    since: status.since,
    source: status.source,
    can_edit: caller.canRead,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const caller = await resolveOptInOutCaller(supabase);
  if (isCallerError(caller)) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  // Deliberately `canRead`, not `isOwner`. RLS
  // (`marketing_opt_outs_write`, agent tier) is the real gate; this check
  // only keeps a member who was explicitly denied the opt-out section
  // from writing through it.
  if (!caller.canRead) {
    return NextResponse.json(
      { error: 'You do not have access to change subscription status.' },
      { status: 403 }
    );
  }

  const limit = checkRateLimit(
    `opt-in-out-status:${caller.userId}`,
    RATE_LIMITS.adminAction
  );
  if (!limit.success) return rateLimitResponse(limit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = normalizePhone(
    typeof body.phone === 'string' ? body.phone : ''
  );
  if (!phone) {
    return NextResponse.json(
      { error: 'A phone number is required.' },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action !== 'unsubscribe' && action !== 'resubscribe') {
    return NextResponse.json(
      { error: "action must be 'unsubscribe' or 'resubscribe'." },
      { status: 400 }
    );
  }

  const contactId =
    typeof body.contact_id === 'string' && body.contact_id
      ? body.contact_id
      : null;

  if (action === 'unsubscribe') {
    const result = await recordMarketingOptOut(supabase, {
      accountId: caller.accountId,
      phone,
      contactId,
      source: 'agent',
      actorUserId: caller.userId,
    });
    if (result === 'failed') {
      return NextResponse.json(
        { error: 'Could not unsubscribe this contact.' },
        { status: 500 }
      );
    }
  } else {
    const ok = await removeMarketingOptOut(supabase, {
      accountId: caller.accountId,
      phone,
      source: 'agent',
      actorUserId: caller.userId,
    });
    if (!ok) {
      return NextResponse.json(
        { error: 'Could not re-subscribe this contact.' },
        { status: 500 }
      );
    }
  }

  // Return the resulting status so the caller renders what is actually
  // stored rather than assuming its optimistic guess was right.
  const status = await resolveSubscriptionStatus(supabase, {
    accountId: caller.accountId,
    phone,
  });

  return NextResponse.json({
    success: true,
    phone,
    status: status.status,
    since: status.since,
    source: status.source,
  });
}
