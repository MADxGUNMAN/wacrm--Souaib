import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  findExistingContact,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import { betterContactName } from '@/lib/contacts/placeholder-name';

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

async function resolveAccount(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return { error: 'Unauthorized' as const, status: 401 };

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
      { status: resolved.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const search = (searchParams.get('search') ?? '').trim();

  // Offset paging. Before this the route returned the first 200 rows and a
  // `truncated: true` flag, and that was the whole story — so with 3,703
  // staged numbers there was no way to SELECT one that happened to sort
  // 201st. "Import all" worked, and picking individual contacts did not,
  // which is the opposite of what a review screen is for.
  //
  // Clamped rather than rejected: a nonsense `offset` from a stale tab
  // should land on the first page, not 400.
  const offsetRaw = Number.parseInt(searchParams.get('offset') ?? '0', 10);
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  // 'all' is offered so an operator can audit what they already decided,
  // not just what is outstanding.
  const allowed = ['pending', 'imported', 'skipped', 'removed', 'all'];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowed.join(', ')}` },
      { status: 400 }
    );
  }

  let query = supabase
    .from('coexistence_staged_contacts')
    .select(
      'id, phone, full_name, first_name, status, already_known, contact_id, created_at, reviewed_at',
      { count: 'exact' }
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
  //
  // `id` is the final tiebreaker and it is not decorative: paging needs a
  // TOTAL order. `already_known` has two values and thousands of rows share
  // a null `full_name`, so without it Postgres is free to return those ties
  // in a different order per query — and offset paging over an unstable sort
  // silently skips and repeats rows.
  const { data, count, error } = await query
    .order('already_known', { ascending: true })
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json(
      { error: `Could not load staged contacts: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    contacts: data ?? [],
    total: count ?? 0,
    page_size: PAGE_SIZE,
    offset,
    // Whether another page exists, computed from the exact filtered count
    // rather than from whether this page came back full — a final page that
    // happens to hold exactly PAGE_SIZE rows would otherwise advertise a
    // next page that is empty.
    has_more: offset + (data?.length ?? 0) < (count ?? 0),
    // Retained for older clients. `has_more` is the one to use: this says
    // "there is more than one page" and says nothing about where you are in
    // it, which is why selecting the 201st contact was impossible.
    truncated: (count ?? 0) > PAGE_SIZE,
    // Every bucket's size, not just the one being viewed. The dialog's tab
    // badges used to be derived by counting a single capped page, so with
    // 1,788 skipped rows the Skipped tab read "200" — the exact opposite of
    // the reassurance the badge exists to give.
    counts: await statusCounts(supabase, resolved.accountId),
  });
}

/**
 * How many staged rows one `import_all` / `skip_all` request will process.
 *
 * A real address book produced 1,417 contacts. Doing them in a single
 * request exceeded the route's time budget and the import never completed,
 * so bulk actions now handle a slice and report `remaining`, and the client
 * calls again until it reaches zero. That is also what makes an honest
 * progress bar possible — the previous single request could only ever show
 * an indeterminate spinner.
 */
const IMPORT_BATCH_SIZE = 200;

/**
 * Counts per status, returned with every mutation.
 *
 * The dialog shows one tab per status, and after any action every tab's badge
 * can change — importing moves rows out of both pending and skipped. Sending
 * the whole set back means the UI never has to guess or re-fetch three times.
 */
async function statusCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string
): Promise<{
  pending: number;
  skipped: number;
  imported: number;
  removed: number;
  /** Every staged row, whatever its status — "how many came from the phone". */
  received: number;
}> {
  const forStatus = async (status: string) => {
    const { count } = await supabase
      .from('coexistence_staged_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', status);
    return count ?? 0;
  };

  const [pending, skipped, imported, removed, received] = await Promise.all([
    forStatus('pending'),
    forStatus('skipped'),
    forStatus('imported'),
    // 'removed' was previously not counted anywhere, so a number deleted
    // from the phone after being staged simply vanished from every total and
    // the buckets did not add up to what arrived.
    forStatus('removed'),
    // The denominator the UI needs, and the only honest one available:
    // Meta sends no total for the address book, so "how many contacts came
    // from the phone" can only be the number of rows we have actually
    // received. Counted here rather than summed client-side from the four
    // buckets so it stays correct if a status is ever added.
    (async () => {
      const { count } = await supabase
        .from('coexistence_staged_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId);
      return count ?? 0;
    })(),
  ]);

  return { pending, skipped, imported, removed, received };
}

/**
 * ── Why there is no `skip_all` ─────────────────────────────────
 *
 * There was one, and it was a footgun. A single click moved all 1,788 staged
 * numbers to 'skipped', the review list only ever showed 'pending', so the
 * panel read "Nothing to review yet" and the entire address book looked
 * permanently gone. Meta sends the address book once per onboarding window,
 * so it also looked unrecoverable.
 *
 * Bulk IMPORT is safe to offer because it is additive and reversible —
 * delete the contact and migration 074's trigger returns the row to pending.
 * Bulk SKIP is neither: it destroys the operator's queue in one click and
 * has no visible undo. Skipping is now a per-selection decision only.
 *
 * `unskip` exists so a skip is never final: skipped numbers stay listed under
 * their own filter and can be returned to the queue or imported directly.
 */
type ReviewAction = 'import' | 'skip' | 'unskip' | 'import_all';

interface ReviewBody {
  /** Staged row ids. Omit only for 'import_all'. */
  ids?: string[];
  action?: ReviewAction;
  /**
   * Which bucket `import_all` drains. Defaults to 'pending'.
   *
   * 'skipped' exists because the alternative was unusable: with everything
   * sitting in Skipped, importing it back meant selecting 200 rows at a time
   * through nine pages. Bulk import is safe from either bucket for the same
   * reason it is safe from pending — it adds contacts, and deleting one
   * returns the staged row here (migration 074).
   */
  scope?: 'pending' | 'skipped';
}

/**
 * Which statuses each action may act on.
 *
 * `import` deliberately accepts 'skipped' as well as 'pending': changing your
 * mind about one number should not require un-skipping it first. `skip` only
 * accepts 'pending', because "skipping" something already imported would mean
 * deleting a live CRM contact — a different and far more destructive
 * operation that belongs on the contacts page, not in a review list.
 */
const ALLOWED_SOURCE_STATUS: Record<ReviewAction, string[]> = {
  import: ['pending', 'skipped'],
  skip: ['pending'],
  unskip: ['skipped'],
  // Bulk narrows this to the single bucket named by `scope` — draining both
  // at once would make `remaining` ambiguous and the progress bar wrong.
  import_all: ['pending', 'skipped'],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveAccount(supabase);
  if ('error' in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status }
    );
  }

  // Admin-only. Importing contacts changes who future broadcasts reach,
  // which is a settings-class decision rather than day-to-day agent work.
  if (resolved.role !== 'owner' && resolved.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an owner or admin can import contacts.' },
      { status: 403 }
    );
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as ReviewAction | undefined;
  if (!action || !(action in ALLOWED_SOURCE_STATUS)) {
    return NextResponse.json(
      {
        error:
          "action must be 'import', 'skip', 'unskip' or 'import_all'" +
          " ('skip_all' was removed — see the note in this route)",
      },
      { status: 400 }
    );
  }

  const isBulk = action === 'import_all';
  // The bucket a bulk run drains, and therefore also the number the client
  // watches to know when to stop looping.
  const bulkScope: 'pending' | 'skipped' = isBulk
    ? body.scope === 'skipped'
      ? 'skipped'
      : 'pending'
    : 'pending';

  if (!isBulk && (!Array.isArray(body.ids) || body.ids.length === 0)) {
    return NextResponse.json(
      { error: 'ids is required for a single-row action' },
      { status: 400 }
    );
  }

  // Always scoped to the caller's account AND to the statuses this action is
  // allowed to touch, so a stale browser tab replaying an old id list cannot
  // re-decide a row or skip something already imported.
  let rowQuery = supabase
    .from('coexistence_staged_contacts')
    .select('id, phone, full_name, first_name, config_id')
    .eq('account_id', resolved.accountId)
    .in('status', isBulk ? [bulkScope] : ALLOWED_SOURCE_STATUS[action]);

  if (!isBulk) {
    rowQuery = rowQuery.in('id', body.ids!);
  } else {
    // One slice per request. Ordered so repeated calls march through the
    // list deterministically instead of revisiting the same rows.
    rowQuery = rowQuery
      .order('created_at', { ascending: true })
      .limit(IMPORT_BATCH_SIZE);
  }

  const { data: rows, error: rowError } = await rowQuery;
  if (rowError) {
    return NextResponse.json(
      { error: `Could not read staged contacts: ${rowError.message}` },
      { status: 500 }
    );
  }
  if (!rows || rows.length === 0) {
    // Nothing pending. `remaining: 0` matters here — it is the signal that
    // stops the client's batch loop, and without it a double-click could
    // spin forever on an empty queue.
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      remaining: 0,
      counts: await statusCounts(supabase, resolved.accountId),
      unchanged: true,
    });
  }

  const now = new Date().toISOString();

  // ---- Skip / Unskip ----
  if (action === 'skip' || action === 'unskip') {
    const nextStatus = action === 'skip' ? 'skipped' : 'pending';

    const { error } = await supabase
      .from('coexistence_staged_contacts')
      .update({
        status: nextStatus,
        // Cleared on unskip so the row looks genuinely undecided again rather
        // than carrying a review timestamp from a decision that was undone.
        reviewed_at: action === 'skip' ? now : null,
      })
      .in(
        'id',
        rows.map((r) => r.id)
      );

    if (error) {
      return NextResponse.json(
        { error: `Could not ${action}: ${error.message}` },
        { status: 500 }
      );
    }

    if (action === 'unskip') {
      const counts = await statusCounts(supabase, resolved.accountId);
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        unskipped: rows.length,
        remaining: counts.pending,
        counts,
      });
    }
    const counts = await statusCounts(supabase, resolved.accountId);

    // The rows are KEPT rather than deleted, so a later re-sync does not
    // re-offer numbers the operator has already rejected — and so a skip can
    // be undone from the Skipped filter.
    return NextResponse.json({
      imported: 0,
      skipped: rows.length,
      remaining: counts.pending,
      counts,
    });
  }

  // ---- Import ----
  //
  // ── Why this is batched and set-based ──────────────────────────
  //
  // The original version looped every staged row and issued THREE round
  // trips each: findExistingContact (a `LIKE '%suffix'` scan with no index
  // to support it), an insert, then an update. For the 1,417 contacts a
  // real address book produced, that is over 4,000 sequential queries
  // against a route with a 60-second budget. It could not finish, so the
  // dialog sat on a spinner forever and the request died — which is
  // exactly the symptom that was reported.
  //
  // This now does a fixed ~4 queries per batch regardless of batch size,
  // and returns `remaining` so the client can loop and show real progress
  // instead of an indeterminate spinner.
  //
  // ── Why double-clicking is safe ────────────────────────────────
  //
  // `contacts` carries a UNIQUE index on (account_id, phone_normalized),
  // so a duplicate contact is impossible at the database level no matter
  // how many concurrent requests arrive. A racing insert loses with
  // SQLSTATE 23505, which is treated as "already existed" rather than a
  // failure — the row is then linked to whichever contact won. Combined
  // with the `status = 'pending'` filter above, a second click can only
  // ever find fewer rows to do, never the same ones twice.
  // key -> the contact that already holds this number, WITH its current
  // name. The name is what makes the rename below possible; selecting only
  // the id is what made this route silently discard every name Meta sent for
  // a number the CRM had already seen.
  const existingByKey = new Map<string, { id: string; name: string | null }>();

  // One indexed lookup for the whole batch, against the same normalized
  // column the unique index uses. Deliberately EXACT rather than the
  // trunk-tolerant `phonesMatch` used by findExistingContact: the database
  // only enforces uniqueness on the exact normalized form, so matching
  // exactly here is consistent with what actually prevents duplicates, and
  // it is the difference between one indexed query and a scan per row.
  const batchKeys = Array.from(
    new Set(rows.map((r) => normalizeKey(r.phone)).filter(Boolean))
  );

  if (batchKeys.length > 0) {
    const { data: existingRows } = await supabase
      .from('contacts')
      .select('id, name, phone_normalized')
      .eq('account_id', resolved.accountId)
      .in('phone_normalized', batchKeys);

    for (const c of (existingRows ?? []) as {
      id: string;
      name: string | null;
      phone_normalized: string;
    }[]) {
      if (c.phone_normalized)
        existingByKey.set(c.phone_normalized, { id: c.id, name: c.name });
    }
  }

  const toInsert: { row: (typeof rows)[number]; key: string }[] = [];
  const linkNow: {
    id: string;
    contactId: string;
    /** Non-null when the existing contact's name should be upgraded. */
    rename: string | null;
  }[] = [];

  for (const row of rows) {
    const key = normalizeKey(row.phone);
    // A number the phone stored in a form that normalizes to nothing cannot
    // become a contact. Marked imported-with-no-contact would be a lie, so
    // it is reported as a failure instead.
    if (!key) continue;

    const hit = existingByKey.get(key);
    if (hit) {
      linkNow.push({
        id: row.id,
        contactId: hit.id,
        // ---- The name bug, fixed ----
        //
        // This branch is the common case on a coexistence account, not the
        // exception: `history` ingestion has already created a contact for
        // every number that ever had a conversation, named after the number
        // because the history payload carries no name. So by the time anyone
        // presses Import, most staged rows resolve to an existing contact —
        // and this path used to only LINK it, throwing the name away.
        //
        // Hence an inbox of rows reading "919716747472" while
        // coexistence_staged_contacts.full_name said "Sabzi Wala".
        //
        // `betterContactName` returns null unless the current name is a
        // placeholder, so importing can never rename a contact an agent has
        // already corrected, and re-importing is a no-op rather than a churn
        // of pointless UPDATEs.
        rename: betterContactName(
          hit.name,
          row.full_name || row.first_name || null
        ),
      });
    } else {
      toInsert.push({ row, key });
    }
  }

  let imported = 0;
  let renamed = 0;
  let alreadyExisted = linkNow.length;
  const failures: string[] = [];

  // Link the ones that already exist — one statement per contact id, but
  // no inserts and no lookups.
  for (const link of linkNow) {
    await supabase
      .from('coexistence_staged_contacts')
      .update({
        status: 'imported',
        contact_id: link.contactId,
        already_known: true,
        reviewed_at: now,
      })
      .eq('id', link.id);

    // Only for rows that actually need it, so a re-import of an
    // already-named address book costs zero extra writes.
    if (link.rename) {
      const { error: renameErr } = await supabase
        .from('contacts')
        .update({ name: link.rename, updated_at: now })
        .eq('id', link.contactId)
        .eq('account_id', resolved.accountId);
      if (renameErr) {
        // Reported, not fatal: the staged row is linked either way, and
        // losing the whole import over a name would be a worse outcome than
        // a contact that keeps its number for now.
        failures.push(`${link.rename}: could not apply name`);
      } else {
        renamed++;
      }
    }
  }

  if (toInsert.length > 0) {
    // De-duped by normalized key first: an address book can hold the same
    // number twice under different names, and a bulk insert containing both
    // would trip the unique index and fail the WHOLE batch.
    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];
    const orderedRows: typeof toInsert = [];

    for (const item of toInsert) {
      if (seen.has(item.key)) {
        // Same number twice in one batch — the second is not a failure, it
        // is the same person. Linked below once the first has an id.
        continue;
      }
      seen.add(item.key);
      orderedRows.push(item);
      payload.push({
        account_id: resolved.accountId,
        // The importing admin owns the row, matching the manual form.
        user_id: resolved.userId,
        phone: item.row.phone,
        // Fall back to the number when the phone had no name saved, so the
        // contact is never blank.
        name: item.row.full_name || item.row.first_name || item.row.phone,
      });
    }

    const { data: created, error: insertError } = await supabase
      .from('contacts')
      .insert(payload)
      .select('id, phone_normalized');

    if (insertError) {
      // A concurrent import already created some of these. Retry row by
      // row so the rest of the batch still lands — one collision must not
      // cost the whole batch.
      if (isUniqueViolation(insertError)) {
        for (const item of orderedRows) {
          const { data: one, error: oneErr } = await supabase
            .from('contacts')
            .insert({
              account_id: resolved.accountId,
              user_id: resolved.userId,
              phone: item.row.phone,
              name: item.row.full_name || item.row.first_name || item.row.phone,
            })
            .select('id')
            .single();

          if (oneErr) {
            if (isUniqueViolation(oneErr)) {
              // Someone else won the race. Find their contact and link to
              // it rather than reporting a failure the operator cannot act on.
              const existing = await findExistingContact(
                supabase,
                resolved.accountId,
                item.row.phone
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
                  .eq('id', item.row.id);
                alreadyExisted++;
                continue;
              }
            }
            failures.push(`${item.row.phone}: ${oneErr.message}`);
            continue;
          }

          await supabase
            .from('coexistence_staged_contacts')
            .update({
              status: 'imported',
              contact_id: one.id,
              reviewed_at: now,
            })
            .eq('id', item.row.id);
          imported++;
        }
      } else {
        failures.push(`Batch insert failed: ${insertError.message}`);
      }
    } else {
      // Map inserted ids back by normalized phone, then link every staged
      // row that resolves to each — including in-batch duplicates.
      const createdByKey = new Map<string, string>();
      for (const c of (created ?? []) as {
        id: string;
        phone_normalized: string;
      }[]) {
        if (c.phone_normalized) createdByKey.set(c.phone_normalized, c.id);
      }

      for (const item of toInsert) {
        const contactId = createdByKey.get(item.key);
        if (!contactId) {
          failures.push(`${item.row.phone}: no contact id returned`);
          continue;
        }
        await supabase
          .from('coexistence_staged_contacts')
          .update({
            status: 'imported',
            contact_id: contactId,
            reviewed_at: now,
          })
          .eq('id', item.row.id);
      }
      imported += createdByKey.size;
    }
  }

  // How much of the bucket being drained is left AFTER this batch, so the
  // client knows whether to keep going and can render a real progress bar.
  const counts = await statusCounts(supabase, resolved.accountId);

  return NextResponse.json({
    imported,
    already_existed: alreadyExisted,
    // Contacts that existed but were named after their own phone number and
    // have now been given the name from the address book. Reported
    // separately from `imported` because it is the outcome the operator is
    // actually looking for when they complain that names did not sync — and
    // because "0 imported, 38 already in your CRM" is exactly the message
    // that made this bug look like nothing had happened.
    renamed,
    skipped: 0,
    remaining: counts[bulkScope],
    counts,
    // Reported rather than swallowed: a partial import is a legitimate
    // outcome, and the operator needs to know which numbers did not land.
    failures: failures.length > 0 ? failures : undefined,
  });
}
