import { describe, expect, it } from 'vitest';

import { fetchAllRows } from './fetch-all';

function source(total: number) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const data: number[] = [];
    for (let i = from; i <= to && i < total; i++) data.push(i);
    return Promise.resolve({ data, error: null });
  };
  return { page, calls };
}

describe('fetchAllRows', () => {
  it('returns nothing for an empty table', async () => {
    const { page, calls } = source(0);
    expect(await fetchAllRows(page, { chunk: 10 })).toEqual({
      rows: [],
      truncated: false,
    });
    expect(calls).toEqual([[0, 9]]);
  });

  it('reads exactly one chunk, then confirms the end with a short page', async () => {
    const { page, calls } = source(10);
    const res = await fetchAllRows(page, { chunk: 10 });
    expect(res.rows).toHaveLength(10);
    expect(res.truncated).toBe(false);
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
    ]);
  });

  it('reads past one chunk', async () => {
    const { page } = source(11);
    const res = await fetchAllRows(page, { chunk: 10 });
    expect(res.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(res.truncated).toBe(false);
  });

  it('stops at the cap and says so', async () => {
    const { page } = source(30);
    const res = await fetchAllRows(page, { chunk: 10, cap: 25 });
    expect(res.rows).toHaveLength(25);
    expect(res.truncated).toBe(true);
  });

  it('is not truncated when the table is exactly the cap', async () => {
    const { page } = source(20);
    const res = await fetchAllRows(page, { chunk: 10, cap: 20 });
    expect(res.rows).toHaveLength(20);
    expect(res.truncated).toBe(false);
  });

  it('throws the database error', async () => {
    const page = () =>
      Promise.resolve({ data: null, error: { message: 'boom' } });
    await expect(fetchAllRows(page)).rejects.toThrow('boom');
  });
});
