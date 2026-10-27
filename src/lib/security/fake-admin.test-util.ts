// In-memory stand-in for the service-role Supabase client, covering the
// query-builder calls the security module makes. Test-only.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeAdmin {
  tables: Record<string, Row[]>;
  rpcCalls: { name: string; args: Row }[];
  rpcHandlers: Record<string, (args: Row) => { data: unknown; error: unknown }>;
  failInsert?: { table: string; code: string };
  from: (table: string) => Builder;
  rpc: (name: string, args: Row) => Promise<{ data: unknown; error: unknown }>;
}

class Builder implements PromiseLike<{
  data: unknown;
  error: unknown;
  count?: number;
}> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private single = false;
  private rangeFrom = 0;
  private rangeTo = Infinity;
  private orderCol: string | null = null;
  private orderAsc = true;
  private wantCount = false;
  private returning = false;
  private ignoreDuplicates = false;
  private conflictCol: string | null = null;

  constructor(
    private db: FakeAdmin,
    private table: string
  ) {
    db.tables[table] ??= [];
  }

  select(_cols?: string, opts?: { count?: string }) {
    if (this.op !== 'select') this.returning = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = 'insert';
    this.payload = p;
    return this;
  }
  upsert(
    p: Row | Row[],
    o?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) {
    this.op = 'upsert';
    this.payload = p;
    this.conflictCol = o?.onConflict ?? null;
    this.ignoreDuplicates = !!o?.ignoreDuplicates;
    return this;
  }
  update(p: Row) {
    this.op = 'update';
    this.payload = p;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => typeof r[c] === 'string' && (r[c] as string) < v);
    return this;
  }
  ilike(c: string, pattern: string) {
    const raw = pattern.replace(/\\([\\%_])/g, '$1');
    this.filters.push(
      (r) => String(r[c] ?? '').toLowerCase() === raw.toLowerCase()
    );
    return this;
  }
  or(expr: string) {
    const parts = expr.split(',').map((p) => {
      const [col, , val] = p.split('.');
      const needle = val.replace(/%/g, '');
      return (r: Row) => String(r[col] ?? '').includes(needle);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orderCol = c;
    this.orderAsc = o?.ascending ?? true;
    return this;
  }
  range(a: number, b: number) {
    this.rangeFrom = a;
    this.rangeTo = b;
    return this;
  }
  limit(n: number) {
    this.rangeTo = n - 1;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    const rows = this.db.tables[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      if (this.db.failInsert?.table === this.table) {
        return {
          data: null,
          error: { code: this.db.failInsert.code, message: 'fail' },
        };
      }
      const out: Row[] = [];
      for (const p of list) {
        const key = this.conflictCol;
        const existing = key ? rows.find((r) => r[key] === p[key]) : undefined;
        if (existing) {
          if (this.ignoreDuplicates) continue;
          Object.assign(existing, p);
          out.push(existing);
          continue;
        }
        const row = {
          id: `id-${rows.length + 1}`,
          created_at: new Date().toISOString(),
          ...p,
        };
        rows.push(row);
        out.push(row);
      }
      return { data: this.returning ? out : null, error: null };
    }
    if (this.op === 'update') {
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? hit : null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    let result = rows.filter(match);
    if (this.orderCol) {
      const c = this.orderCol;
      result = [...result].sort(
        (a, b) =>
          (String(a[c]) < String(b[c]) ? -1 : 1) * (this.orderAsc ? 1 : -1)
      );
    }
    const count = result.length;
    result = result.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.single) return { data: result[0] ?? null, error: null };
    return { data: result, error: null, ...(this.wantCount ? { count } : {}) };
  }

  then<T1, T2>(
    ok?:
      | ((v: {
          data: unknown;
          error: unknown;
          count?: number;
        }) => T1 | PromiseLike<T1>)
      | null,
    fail?: ((e: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(ok, fail);
  }
}

export function createFakeAdmin(): FakeAdmin {
  const db: FakeAdmin = {
    tables: {},
    rpcCalls: [],
    rpcHandlers: {},
    from: (table: string) => new Builder(db, table),
    rpc: async (name: string, args: Row) => {
      db.rpcCalls.push({ name, args });
      const h = db.rpcHandlers[name];
      return h ? h(args) : { data: null, error: { message: `no rpc ${name}` } };
    },
  };
  return db;
}
