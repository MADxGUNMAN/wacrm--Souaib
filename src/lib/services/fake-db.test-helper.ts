// Recording in-memory stand-in for the Supabase query builder, for
// service tests. Rows live in plain arrays per table; filters eq/neq/in/
// is/gt/gte/lt/lte/ilike are applied; inserts/updates/deletes/upserts are
// applied and logged in `writes` so a test can assert "nothing changed".

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  writes: { table: string; op: string; payload?: unknown }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
}

let seq = 0;
const newId = () =>
  `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function fakeDb(tables: Record<string, Row[]>): FakeDb {
  const db: FakeDb = { tables, writes: [], client: null };

  function builder(table: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    let head = false;
    let countMode = false;
    let single: 'one' | 'maybe' | null = null;
    let limitN: number | null = null;
    const rows = () => (db.tables[table] ??= []);

    const b: Record<string, unknown> = {};
    const chain =
      (fn: () => void) =>
      (...args: unknown[]) => {
        void args;
        fn();
        return b;
      };
    b.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) head = true;
      if (opts?.count) countMode = true;
      return b;
    };
    b.insert = (p: Row | Row[]) => ((op = 'insert'), (payload = p), b);
    b.update = (p: Row) => ((op = 'update'), (payload = p), b);
    b.upsert = (p: Row) => ((op = 'upsert'), (payload = p), b);
    b.delete = () => ((op = 'delete'), b);
    b.eq = (c: string, v: unknown) => (
      filters.push((r) => field(r, c) === v),
      b
    );
    b.neq = (c: string, v: unknown) => (
      filters.push((r) => field(r, c) !== v),
      b
    );
    b.in = (c: string, vs: unknown[]) => (
      filters.push((r) => vs.includes(field(r, c))),
      b
    );
    b.is = (c: string, v: unknown) => (
      filters.push((r) => (field(r, c) ?? null) === v),
      b
    );
    b.gt = (c: string, v: string) => (
      filters.push((r) => String(field(r, c)) > v),
      b
    );
    b.gte = (c: string, v: string) => (
      filters.push((r) => String(field(r, c)) >= v),
      b
    );
    b.lt = (c: string, v: string) => (
      filters.push((r) => String(field(r, c)) < v),
      b
    );
    b.lte = (c: string, v: string) => (
      filters.push((r) => String(field(r, c)) <= v),
      b
    );
    b.ilike = (c: string, p: string) => {
      const re = new RegExp(`^${p.replace(/%/g, '.*')}$`, 'i');
      filters.push((r) => re.test(String(field(r, c) ?? '')));
      return b;
    };
    b.like = (c: string, p: string) => {
      const re = new RegExp(`^${p.replace(/%/g, '.*')}$`);
      filters.push((r) => re.test(String(field(r, c) ?? '')));
      return b;
    };
    // Only `.not(col, 'is', null)` is needed so far.
    b.not = (c: string, operator: string, v: unknown) => {
      if (operator === 'is') filters.push((r) => (field(r, c) ?? null) !== v);
      return b;
    };
    b.or = chain(() => {});
    b.order = chain(() => {});
    b.limit = (n: number) => ((limitN = n), b);
    b.single = () => ((single = 'one'), b);
    b.maybeSingle = () => ((single = 'maybe'), b);
    b.then = (resolve: (v: unknown) => void) => resolve(run());

    function run() {
      const match = rows().filter((r) => filters.every((f) => f(r)));
      if (op === 'insert' || op === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const out: Row[] = [];
        for (const p of list) {
          if (op === 'upsert' && table === 'contact_custom_values') {
            const hit = rows().find(
              (r) =>
                r.contact_id === p.contact_id &&
                r.custom_field_id === p.custom_field_id
            );
            if (hit) {
              Object.assign(hit, p);
              out.push(hit);
              continue;
            }
          }
          if (
            table === 'contact_tags' &&
            rows().some(
              (r) => r.contact_id === p.contact_id && r.tag_id === p.tag_id
            )
          ) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate' },
            };
          }
          const row = {
            id: newId(),
            created_at: new Date().toISOString(),
            ...p,
          };
          rows().push(row);
          out.push(row);
        }
        db.writes.push({ table, op, payload });
        return shape(out);
      }
      if (op === 'update') {
        for (const r of match) Object.assign(r, payload);
        db.writes.push({ table, op, payload });
        return shape(match);
      }
      if (op === 'delete') {
        db.tables[table] = rows().filter((r) => !match.includes(r));
        db.writes.push({ table, op });
        return shape(match);
      }
      return shape(limitN === null ? match : match.slice(0, limitN));
    }

    function shape(list: Row[]) {
      if (head) return { data: null, count: list.length, error: null };
      if (single === 'one')
        return list[0]
          ? { data: list[0], error: null }
          : { data: null, error: { code: 'PGRST116' } };
      if (single === 'maybe') return { data: list[0] ?? null, error: null };
      return { data: list, count: countMode ? list.length : null, error: null };
    }
    return b;
  }

  db.client = { from: (t: string) => builder(t) };
  return db;
}

function field(r: Row, c: string): unknown {
  // `contacts.phone_normalized` is a GENERATED column in the real schema
  // (migration 022: regexp_replace(phone, '\D', '', 'g')), so fixtures
  // never set it. Derive it the same way, so lookups on it behave as they
  // do against Postgres.
  if (
    c === 'phone_normalized' &&
    !('phone_normalized' in r) &&
    typeof r.phone === 'string'
  ) {
    return r.phone.replace(/\D/g, '');
  }
  return r[c];
}
