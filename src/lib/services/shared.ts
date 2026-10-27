// ============================================================
// Small helpers shared by the read services.
// ============================================================

import type { ServiceContext } from './context';

/** PostgREST returns a to-one embed as an object or a one-item array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Escape LIKE wildcards so user text matches literally. */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface MemberRef {
  id: string;
  name: string | null;
}

/**
 * `{ id, name }` for teammates in this account — the only shape another
 * member's identity is ever returned in (02 §3.5). Ids from outside the
 * account resolve to a name of null.
 */
export async function memberNames(
  ctx: ServiceContext,
  ids: readonly (string | null | undefined)[]
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const { data } = await ctx.db
    .from('profiles')
    .select('user_id, full_name')
    .eq('account_id', ctx.accountId)
    .in('user_id', unique);
  return new Map(
    (data ?? []).map((r) => [
      r.user_id as string,
      (r.full_name as string | null) ?? null,
    ])
  );
}

export function memberRef(
  names: Map<string, string | null>,
  id: string | null | undefined
): MemberRef | null {
  if (!id) return null;
  return { id, name: names.get(id) ?? null };
}

// ------------------------------------------------------------
// deals.assigned_to holds a PROFILE id (FK → profiles.id), while
// conversations.assigned_agent_id and every member id the tools expose
// are USER ids. These two helpers are the only place the two meet.
// ------------------------------------------------------------

/** profiles.id for an active member of this account, or null. */
export async function profileIdForMember(
  ctx: ServiceContext,
  userId: string
): Promise<string | null> {
  const { data } = await ctx.db
    .from('profiles')
    .select('id, is_active')
    .eq('account_id', ctx.accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  return data.id as string;
}

/** profiles.id → the member as `{ id: user id, name }`, for this account. */
export async function membersByProfileId(
  ctx: ServiceContext,
  profileIds: readonly (string | null | undefined)[]
): Promise<Map<string, MemberRef>> {
  const unique = [
    ...new Set(profileIds.filter((v): v is string => Boolean(v))),
  ];
  if (!unique.length) return new Map();
  const { data } = await ctx.db
    .from('profiles')
    .select('id, user_id, full_name')
    .eq('account_id', ctx.accountId)
    .in('id', unique);
  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      { id: p.user_id as string, name: (p.full_name as string | null) ?? null },
    ])
  );
}
