import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { findExistingContact } from '@/lib/contacts/dedupe';

/**
 * Reviewing the phone contacts Coexistence handed over.
 *
 * These are STAGED, never imported automatically — see the note on
 * `handleAppStateSync` in the webhook. `smb_app_state_sync` sends the
 * owner's entire address book: family, friends, one-off numbers. Writing
 * that into `contacts` would inflate every broadcast audience built from
 * "all contacts", so a human decides.
 *
 * GET  — list staged contacts, filtered by status
 * POST — import or skip, individually or in bulk
 */

const PAGE_SIZE = 200;

async function resolveAccount(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized' as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return {
      error: 'Your profile is not linked to an account.' as const,
      status: 403,
    };
  }

  return {
    accountId,
    userId: user.id,
    role: profile?.account_role as string | undefined,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveAccount(supabase);
  if ('error' in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const search = (searchParams.get('search') ?? '').trim();

  // 'all' is offered so an operator can audit what they already decided,
  // not just what is outstanding.
  const allowed = ['pending', 'imported', 'skipped', 'removed', 'all'];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowed.join(', ')}` },
      { status: 400 },
    );
  }

  let query = supabase
    .from('coexistence_staged_contacts')
    .select(
      'id, phone, full_name, first_name, status, already_known, contact_id, created_at, reviewed_at',
      { count: 'exact' },
    )
    .eq('account_id', resolved.accountId);

  if (status !== 'all') query = query.eq('status', status);

  if (search) {
    // Name OR number, because an operator scanning an address book
    // remembers one or the other, not which field it lives in.
    query = query.or(`phone.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  // Unknown numbers first: those are the ones that actually need a
  // decision. Anything already in the CRM is noise in this list.
  const { data, count, error } = await query
    .order('already_known', { ascending: true })
    .order('full_name', { ascending: true, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (error) {
    return NextResponse.json(
      { error: `Could not load staged contacts: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    contacts: data ?? [],
    total: count ?? 0,
    page_size: PAGE_SIZE,
    truncated: (count ?? 0) > PAGE_SIZE,
  });
}

interface ReviewBody {
  /** Staged row ids. Omit with action 'import_all'/'skip_all'. */
  ids?: string[];
  action?: 'import' | 'skip' | 'import_all' | 'skip_all';
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveAccount(supabase);
  if ('error' in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  // Admin-only. Importing contacts changes who future broadcasts reach,
  // which is a settings-class decision rather than day-to-day agent work.
  if (resolved.role !== 'owner' && resolved.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an owner or admin can import contacts.' },
      { status: 403 },
    );
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (
    action !== 'import' &&
    action !== 'skip' &&
    action !== 'import_all' &&
    action !== 'skip_all'
  ) {
    return NextResponse.json(
      { error: "action must be 'import', 'skip', 'import_all' or 'skip_all'" },
      { status: 400 },
    );
  }

  const isBulk = action === 'import_all' || action === 'skip_all';
  if (!isBulk && (!Array.isArray(body.ids) || body.ids.length === 0)) {
    return NextResponse.json(
      { error: 'ids is required for a single-row action' },
      { status: 400 },
    );
  }

  // Always scoped to the caller's account AND to 'pending'. A row already
  // decided must not be re-decided by a stale browser tab replaying an
  // old id list.
  let rowQuery = supabase
    .from('coexistence_staged_contacts')
    .select('id, phone, full_name, first_name, config_id')
    .eq('account_id', resolved.accountId)
    .eq('status', 'pending');

  if (!isBulk) rowQuery = rowQuery.in('id', body.ids!);

  const { data: rows, error: rowError } = await rowQuery;
  if (rowError) {
    return NextResponse.json(
      { error: `Could not read staged contacts: ${rowError.message}` },
      { status: 500 },
    );
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0, unchanged: true });
  }

  const now = new Date().toISOString();

  // ---- Skip ----
  if (action === 'skip' || action === 'skip_all') {
    const { error } = await supabase
      .from('coexistence_staged_contacts')
      .update({ status: 'skipped', reviewed_at: now })
      .in(
        'id',
        rows.map((r) => r.id),
      );

    if (error) {
      return NextResponse.json(
        { error: `Could not skip: ${error.message}` },
        { status: 500 },
      );
    }
    // The rows are KEPT rather than deleted, so a later re-sync does not
    // re-offer numbers the operator has already rejected.
    return NextResponse.json({ imported: 0, skipped: rows.length });
  }

  // ---- Import ----
  let imported = 0;
  let alreadyExisted = 0;
  const failures: string[] = [];

  for (const row of rows) {
    // Re-checked per row at import time rather than trusting the
    // `already_known` flag from staging: the flag is a snapshot from
    // whenever the sync ran, and the contact may have been created since
    // by an inbound message, the manual form or a CSV import. Using the
    // stale flag would create a duplicate.
    const existing = await findExistingContact(
      supabase,
      resolved.accountId,
      row.phone,
    );

    if (existing) {
      await supabase
        .from('coexistence_staged_contacts')
        .update({
          status: 'imported',
          contact_id: existing.id,
          already_known: true,
          reviewed_at: now,
        })
        .eq('id', row.id);
      alreadyExisted++;
      continue;
    }

    const { data: created, error: createError } = await supabase
      .from('contacts')
      .insert({
        account_id: resolved.accountId,
        // The importing admin owns the row, matching what the manual
        // contact form does.
        user_id: resolved.userId,
        phone: row.phone,
        // Fall back to the number when the phone had no name saved, so the
        // contact is never blank.
        name: row.full_name || row.first_name || row.phone,
      })
      .select('id')
      .single();

    if (createError) {
      failures.push(`${row.phone}: ${createError.message}`);
      continue;
    }

    await supabase
      .from('coexistence_staged_contacts')
      .update({
        status: 'imported',
        contact_id: created.id,
        reviewed_at: now,
      })
      .eq('id', row.id);

    imported++;
  }

  return NextResponse.json({
    imported,
    already_existed: alreadyExisted,
    skipped: 0,
    // Reported rather than swallowed: a partial import is a legitimate
    // outcome, and the operator needs to know which numbers did not land.
    failures: failures.length > 0 ? failures : undefined,
  });
}
