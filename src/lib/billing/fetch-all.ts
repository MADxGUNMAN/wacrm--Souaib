// ============================================================
// Read every row of a query in chunks, with an explicit cap (pure).
//
// PostgREST answers at most `max-rows` (1,000 here) per request, so a
// single `.limit(1000)` silently truncates any list that grows past it
// and every count derived from it under-reports (AGENTS.md §4). This
// pages through with `.range(from, to)` until a short page, and stops
// at `cap` with `truncated: true` so the UI can say so instead of
// pretending the newest N rows are all of them.
// ============================================================

export interface FetchAllOptions {
  /** Rows per request. PostgREST's own ceiling is 1,000. */
  chunk?: number;
  /** Hard ceiling on rows returned. */
  cap?: number;
}

export interface FetchAllResult<T> {
  rows: T[];
  /** True when `cap` was reached and more rows may exist. */
  truncated: boolean;
}

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * `page(from, to)` must return rows `from..to` inclusive, in a stable
 * order (callers order by created_at then id). Throws on the first error.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { chunk = 1000, cap = 10000 }: FetchAllOptions = {}
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let from = 0;
  while (rows.length < cap) {
    const size = Math.min(chunk, cap - rows.length);
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < size) return { rows, truncated: false };
    from += size;
  }
  // Exactly at the cap: one probe row says whether anything was cut off.
  const probe = await page(from, from);
  if (probe.error) throw new Error(probe.error.message);
  return { rows, truncated: (probe.data ?? []).length > 0 };
}
