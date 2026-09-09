'use client';

// ============================================================
// How many of THIS audience will be skipped because they unsubscribed.
//
// WHY IT MATTERS
//
// Suppression already worked, but only at send time and invisibly. The
// wizard showed "1,788 estimated recipients", the send then quietly
// dropped the unsubscribed ones, and a fully-suppressed audience failed
// with a toast on the last screen after four steps of work. Worse, the
// number an operator used to decide whether the campaign was worth sending
// was not the number who would receive it.
//
// THE CHEAP DIRECTION
//
// The obvious implementation — read every audience phone and intersect it
// with the suppression list — is backwards. An audience is routinely
// thousands of contacts while the suppression list is usually dozens, and
// for `type: 'all'` the existing estimate is a `head: true` COUNT that
// fetches no rows at all, so intersecting would mean reading the entire
// contacts table into the browser.
//
// So this works from the small side:
//
//   1. read the account's suppressed phones (small, one query)
//   2. if none, stop — the common case costs exactly one cheap query
//   3. resolve those phones to contact ids via `contacts.phone_normalized`
//      (a generated column, migration 022), bounded by step 1's size
//   4. intersect with the audience's own id set
//
// FAIL OPEN, ALWAYS
//
// On any error this reports `unavailable` rather than 0. Zero would be a
// lie that reads as reassurance; the server re-checks on send and is the
// real gate, so the honest failure mode is "could not check" — never a
// blocked send and never a confident wrong number.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { isMarketingCategory } from '@/lib/whatsapp/marketing-category';

/** PostgREST caps a plain select at ~1000 rows, so reads are paged. */
const PAGE_SIZE = 1000;

/**
 * The audience shape this hook needs. Deliberately narrower than the
 * wizard's `AudienceConfig` so it cannot start depending on send-time
 * fields.
 */
export interface SuppressionAudience {
  type: 'all' | 'tags' | 'custom_field' | 'csv';
  tagIds?: string[];
  customField?: {
    fieldId: string;
    operator: 'is' | 'is_not' | 'contains';
    value: string;
  };
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
  excludedContactIds?: string[];
}

export interface AudienceSuppression {
  /** Contacts in this audience who unsubscribed and will not be sent to. */
  suppressedCount: number;
  loading: boolean;
  /** The check failed. Show nothing rather than a number. */
  unavailable: boolean;
  /** False for utility/authentication templates, where nothing is skipped. */
  applies: boolean;
}

/** Read every suppressed phone for the account, paging past the row cap. */
async function readSuppressedPhones(
  supabase: ReturnType<typeof createClient>
): Promise<Set<string> | null> {
  const phones = new Set<string>();
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from('marketing_opt_outs')
      .select('phone_normalized')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) return null;
    const rows = data ?? [];
    for (const row of rows) {
      const key = (row as { phone_normalized?: string }).phone_normalized;
      if (key) phones.add(key);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return phones;
}

/** Contact ids whose number is on the suppression list. */
async function suppressedContactIds(
  supabase: ReturnType<typeof createClient>,
  phones: string[]
): Promise<Set<string> | null> {
  const ids = new Set<string>();
  // Chunked because `.in()` becomes a URL query string, and a few thousand
  // numbers would exceed the request line length.
  for (let i = 0; i < phones.length; i += 500) {
    const chunk = phones.slice(i, i + 500);
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .in('phone_normalized', chunk);
    if (error) return null;
    for (const row of data ?? []) {
      const id = (row as { id?: string }).id;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Contact ids in the audience, or null meaning "every contact".
 *
 * Mirrors the wizard's own estimate logic rather than the send path's,
 * because it must agree with the number displayed beside it.
 */
async function audienceContactIds(
  supabase: ReturnType<typeof createClient>,
  audience: SuppressionAudience
): Promise<{ ids: Set<string> | null } | null> {
  if (audience.type === 'all') return { ids: null };

  if (audience.type === 'tags') {
    if (!audience.tagIds?.length) return null;
    const { data, error } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .in('tag_id', audience.tagIds);
    if (error) return null;
    return { ids: new Set((data ?? []).map((r) => r.contact_id as string)) };
  }

  if (audience.type === 'custom_field') {
    const field = audience.customField;
    if (!field?.fieldId || !field.value) return null;
    let q = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', field.fieldId);
    if (field.operator === 'is') q = q.eq('value', field.value);
    else if (field.operator === 'is_not') q = q.neq('value', field.value);
    else q = q.ilike('value', `%${field.value}%`);
    const { data, error } = await q;
    if (error) return null;
    return { ids: new Set((data ?? []).map((r) => r.contact_id as string)) };
  }

  // CSV rows are raw phone numbers that may not be contacts yet, so they
  // are matched on phone rather than id by the caller below.
  return null;
}

export function useAudienceSuppression(
  audience: SuppressionAudience,
  templateCategory: string | null | undefined
): AudienceSuppression {
  const [suppressedCount, setSuppressedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Suppression only applies to marketing. Fails CLOSED on an unknown
  // category, matching every send path.
  const applies = isMarketingCategory(templateCategory);

  // Serialised so the effect re-runs on a real change rather than on every
  // parent render handing over a fresh object literal.
  const key = useMemo(
    () =>
      JSON.stringify({
        t: audience.type,
        tags: audience.tagIds ?? null,
        cf: audience.customField ?? null,
        csv: audience.csvContacts?.map((c) => c.phone) ?? null,
        ex: audience.excludeTagIds ?? null,
        manual: audience.excludedContactIds ?? null,
        applies,
      }),
    [
      audience.type,
      audience.tagIds,
      audience.customField,
      audience.csvContacts,
      audience.excludeTagIds,
      audience.excludedContactIds,
      applies,
    ]
  );

  // Guards against a slow earlier request landing after a newer one.
  const runRef = useRef(0);

  const run = useCallback(async () => {
    const run = ++runRef.current;
    const settle = (count: number, failed: boolean) => {
      if (runRef.current !== run) return;
      setSuppressedCount(count);
      setUnavailable(failed);
      setLoading(false);
    };

    if (!applies) {
      settle(0, false);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      const phones = await readSuppressedPhones(supabase);
      if (!phones) {
        settle(0, true);
        return;
      }
      // Nothing suppressed anywhere — no need to resolve the audience.
      if (phones.size === 0) {
        settle(0, false);
        return;
      }

      // CSV audiences are phone lists, so they intersect directly without
      // ever touching `contacts`.
      if (audience.type === 'csv') {
        const rows = audience.csvContacts ?? [];
        const hit = rows.filter((r) =>
          phones.has((r.phone ?? '').replace(/\D/g, ''))
        ).length;
        settle(hit, false);
        return;
      }

      const resolved = await audienceContactIds(supabase, audience);
      if (!resolved) {
        // A partially-configured audience is not a failure — there is
        // simply nothing to count yet.
        settle(0, false);
        return;
      }

      const suppressedIds = await suppressedContactIds(supabase, [...phones]);
      if (!suppressedIds) {
        settle(0, true);
        return;
      }

      let candidates = [...suppressedIds];

      // Only count suppressed contacts that are actually in the audience.
      if (resolved.ids) {
        const inAudience = resolved.ids;
        candidates = candidates.filter((id) => inAudience.has(id));
      }

      // Someone already removed by an exclude tag is not "skipped because
      // they unsubscribed" — they were never in the audience. Counting
      // them twice would overstate the suppression.
      if (audience.excludeTagIds?.length) {
        const { data, error } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        if (error) {
          settle(0, true);
          return;
        }
        const excluded = new Set((data ?? []).map((r) => r.contact_id));
        candidates = candidates.filter((id) => !excluded.has(id));
      }

      if (audience.excludedContactIds?.length) {
        const manual = new Set(audience.excludedContactIds);
        candidates = candidates.filter((id) => !manual.has(id));
      }

      settle(candidates.length, false);
    } catch {
      settle(0, true);
    }
    // `key` is the real dependency — it captures every audience field the
    // body reads, and the audience object identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void run();
  }, [run]);

  return { suppressedCount, loading, unavailable, applies };
}
