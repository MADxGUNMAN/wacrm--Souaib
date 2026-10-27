// ============================================================
// Super-admin billing lists: query-string parsing (pure).
//
// Every value a browser sends is checked against an allowlist. Anything
// unknown falls back to the default, and a sort key is only ever turned
// into a column name we wrote ourselves, so nothing from the URL reaches
// `.order()` or a filter unvetted.
// ============================================================

export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_SEARCH_LENGTH = 100;

/**
 * A Razorpay id pasted into the search box. Matched exactly against the
 * relevant column instead of being treated as an account name. `evt_` is
 * included so a webhook event can be found by its x-razorpay-event-id.
 */
export const PROVIDER_ID_RE =
  /^(sub|pay|inv|rfnd|disp|plan|cust|evt)_[A-Za-z0-9]+$/;

export type ModeFilter = 'all' | 'test' | 'live';

export interface ListSpec {
  /** Sort key (from the URL) -> column name. */
  sorts: Record<string, string>;
  defaultSort: string;
  statuses?: readonly string[];
  methods?: readonly string[];
  kinds?: readonly string[];
}

export interface ListParams {
  mode: ModeFilter;
  status: string | null;
  method: string | null;
  kind: string | null;
  /** Free-text account-name search (null when empty or a provider id). */
  search: string | null;
  /** An exact Razorpay id, when the search box held one. */
  providerId: string | null;
  sortColumn: string;
  ascending: boolean;
  page: number;
  pageSize: number;
  /** Inclusive row range for `.range(from, to)`. */
  from: number;
  to: number;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function pick(
  value: string | null,
  allowed: readonly string[] | undefined
): string | null {
  if (!value || !allowed) return null;
  return allowed.includes(value) ? value : null;
}

function positiveInt(value: string | null, fallback: number): number {
  if (!value || !/^\d{1,6}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 1 ? n : fallback;
}

export function parseListParams(
  sp: URLSearchParams,
  spec: ListSpec
): ListParams {
  const rawMode = sp.get('mode');
  const mode: ModeFilter =
    rawMode === 'test' || rawMode === 'live' ? rawMode : 'all';

  const sortKey = sp.get('sort');
  const sortColumn =
    sortKey && Object.prototype.hasOwnProperty.call(spec.sorts, sortKey)
      ? spec.sorts[sortKey]
      : spec.sorts[spec.defaultSort];

  const sizeRaw = positiveInt(sp.get('pageSize'), DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZES.includes(sizeRaw) ? sizeRaw : DEFAULT_PAGE_SIZE;
  const page = positiveInt(sp.get('page'), 1);

  const text = (sp.get('search') ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  const providerId = PROVIDER_ID_RE.test(text) ? text : null;

  const from = (page - 1) * pageSize;
  return {
    mode,
    status: pick(sp.get('status'), spec.statuses),
    method: pick(sp.get('method'), spec.methods),
    kind: pick(sp.get('kind'), spec.kinds),
    search: providerId || !text ? null : text,
    providerId,
    sortColumn,
    ascending: sp.get('dir') === 'asc',
    page,
    pageSize,
    from,
    to: from + pageSize - 1,
  };
}

/** Escape a value for use inside an ILIKE pattern. */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_,]/g, (c) => `\\${c}`);
}

export function toListResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): ListResponse<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** The prefix of a provider id (`sub`, `pay`, ...). */
export function providerIdKind(id: string): string {
  return id.slice(0, id.indexOf('_'));
}
