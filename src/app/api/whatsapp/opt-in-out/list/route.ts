// ============================================================
// GET    /api/whatsapp/opt-in-out/list — who is suppressed, and why
// DELETE /api/whatsapp/opt-in-out/list?phone=… — re-subscribe one number
//
// The audit surface for the suppression list. Without it the count on the
// settings screen is a number nobody can act on: an operator who needs to
// answer "did this customer really unsubscribe, and how?" has no way to
// look.
//
// Read tier matches the settings pane. DELETE is member-tier on purpose —
// it mirrors `marketing_opt_outs_write` RLS and the per-contact control
// that already exists in the Inbox sidebar, because putting somebody back
// on the list after they asked in conversation is ordinary inbox work.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';
import { removeMarketingOptOut } from '@/lib/whatsapp/marketing-opt-out';
import {
  isCallerError,
  resolveOptInOutCaller,
} from '@/lib/whatsapp/opt-in-out-access';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface OptOutRow {
  id: string;
  phone_normalized: string;
  contact_id: string | null;
  source: string;
  opted_out_at: string;
}

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
      { error: 'You do not have access to opt-in/out settings.' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);

  // Search is reduced to digits so a pasted "+1 (415) 555-0123" matches
  // the digits-only stored key. Searching the raw string would find
  // nothing and look like the record was missing.
  const search = normalizePhone(url.searchParams.get('search') ?? '');

  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, limitRaw))
    : DEFAULT_LIMIT;
  const offsetRaw = Number.parseInt(url.searchParams.get('offset') ?? '', 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  let query = supabase
    .from('marketing_opt_outs')
    .select('id, phone_normalized, contact_id, source, opted_out_at', {
      count: 'exact',
    })
    .eq('account_id', caller.accountId);

  if (search) query = query.ilike('phone_normalized', `%${search}%`);

  const { data, count, error } = await query
    .order('opted_out_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[whatsapp/opt-in-out/list] load failed:', error.message);
    return NextResponse.json(
      { error: 'Could not load the opt-out list.' },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as OptOutRow[];

  // Resolve display names in a SECOND query rather than a PostgREST embed
  // on `contact_id`. The FK is new, and an embed depends on PostgREST's
  // schema cache having picked it up — a stale cache fails the whole
  // request with PGRST200 (the same trap documented in
  // `getCurrentAccount`). Two plain queries cannot break that way.
  //
  // Joined on phone, not contact_id, so a contact that was deleted and
  // re-imported still shows its name: the opt-out survives by design and
  // its `contact_id` may be NULL or point at the old row.
  const phones = [...new Set(rows.map((r) => r.phone_normalized))];
  const nameByPhone = new Map<string, string>();
  if (phones.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('name, phone, phone_normalized')
      .eq('account_id', caller.accountId)
      .in('phone_normalized', phones);
    for (const c of contacts ?? []) {
      const key = (c as { phone_normalized?: string }).phone_normalized;
      const name = (c as { name?: string | null }).name;
      if (key && name && !nameByPhone.has(key)) nameByPhone.set(key, name);
    }
  }

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      phone: r.phone_normalized,
      contact_id: r.contact_id,
      contact_name: nameByPhone.get(r.phone_normalized) ?? null,
      source: r.source,
      opted_out_at: r.opted_out_at,
    })),
    total: count ?? 0,
    limit,
    offset,
    can_edit: caller.isOwner,
  });
}

export async function DELETE(request: Request) {
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
      { error: 'You do not have access to opt-in/out settings.' },
      { status: 403 }
    );
  }

  const limit = checkRateLimit(
    `opt-in-out-resubscribe:${caller.userId}`,
    RATE_LIMITS.adminAction
  );
  if (!limit.success) return rateLimitResponse(limit);

  const url = new URL(request.url);
  const phone = normalizePhone(url.searchParams.get('phone') ?? '');
  if (!phone) {
    return NextResponse.json(
      { error: 'A phone number is required.' },
      { status: 400 }
    );
  }

  // RLS (`marketing_opt_outs_write`, member tier) is the real gate here —
  // this runs on the caller's own request-scoped client, not the service
  // role, so a cross-account phone simply matches no row.
  const ok = await removeMarketingOptOut(supabase, {
    accountId: caller.accountId,
    phone,
  });
  if (!ok) {
    return NextResponse.json(
      { error: 'Could not re-subscribe that number.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
