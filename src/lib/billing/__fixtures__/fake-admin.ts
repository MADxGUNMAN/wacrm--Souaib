// ============================================================
// A small in-memory stand-in for the Supabase admin client, for route
// tests of the read-only billing reports.
//
// Unlike a chain that ignores its arguments, this one APPLIES eq / in /
// gte / lte / order / range, and records every filter with its column,
// so a test can assert that `.eq('account_id', …)` was used and not
// `.eq('id', …)` (AGENTS.md §4). Any write (insert, update, upsert,
// delete) or rpc is recorded in `writes`, so "read-only" is checkable.
// ============================================================

type Row = Record<string, unknown>;

export interface FakeCall {
  table: string;
  op: string;
  column?: string;
  value?: unknown;
}

export function createFakeAdmin(tables: Record<string, Row[]>) {
  const calls: FakeCall[] = [];
  const writes: FakeCall[] = [];

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    let window: [number, number] | null = null;
    let limit: number | null = null;

    const run = () => {
      let rows = [...(tables[table] ?? [])].filter((r) =>
        filters.every((f) => f(r))
      );
      if (orders.length) {
        rows.sort((a, b) => {
          for (const o of orders) {
            const x = a[o.column] as string | number | null;
            const y = b[o.column] as string | number | null;
            if (x === y) continue;
            if (x === null || x === undefined) return 1;
            if (y === null || y === undefined) return -1;
            const cmp = x < y ? -1 : 1;
            return o.ascending ? cmp : -cmp;
          }
          return 0;
        });
      }
      if (window) rows = rows.slice(window[0], window[1] + 1);
      if (limit !== null) rows = rows.slice(0, limit);
      return { data: rows, error: null, count: rows.length };
    };

    const b: Record<string, unknown> = {};
    const write = (op: string) => () => {
      writes.push({ table, op });
      return b;
    };
    Object.assign(b, {
      select: (columns: string) => {
        calls.push({ table, op: 'select', value: columns });
        return b;
      },
      eq: (column: string, value: unknown) => {
        calls.push({ table, op: 'eq', column, value });
        filters.push((r) => r[column] === value);
        return b;
      },
      in: (column: string, value: unknown[]) => {
        calls.push({ table, op: 'in', column, value });
        filters.push((r) => value.includes(r[column]));
        return b;
      },
      gte: (column: string, value: string) => {
        calls.push({ table, op: 'gte', column, value });
        filters.push((r) => String(r[column]) >= value);
        return b;
      },
      lte: (column: string, value: string) => {
        calls.push({ table, op: 'lte', column, value });
        filters.push((r) => String(r[column]) <= value);
        return b;
      },
      not: (column: string, op: string, value: unknown) => {
        calls.push({ table, op: `not.${op}`, column, value });
        if (op === 'is' && value === null) {
          filters.push((r) => r[column] !== null && r[column] !== undefined);
        }
        return b;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        orders.push({ column, ascending: opts?.ascending !== false });
        return b;
      },
      range: (a: number, z: number) => {
        window = [a, z];
        return b;
      },
      limit: (n: number) => {
        limit = n;
        return b;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      insert: write('insert'),
      update: write('update'),
      upsert: write('upsert'),
      delete: write('delete'),
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(ok, fail),
    });
    return b;
  }

  const client = {
    from,
    rpc: (fn: string) => {
      writes.push({ table: fn, op: 'rpc' });
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { client, calls, writes };
}
