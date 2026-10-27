import { describe, expect, it } from 'vitest';

import {
  escapeIlike,
  parseListParams,
  PROVIDER_ID_RE,
  toListResponse,
  type ListSpec,
} from './admin-query';

const SPEC: ListSpec = {
  sorts: { created_at: 'created_at', amount_minor: 'amount_minor' },
  defaultSort: 'created_at',
  statuses: ['active', 'halted'],
  methods: ['card', 'upi'],
  kinds: ['charge'],
};

const parse = (qs: string) => parseListParams(new URLSearchParams(qs), SPEC);

describe('parseListParams', () => {
  it('uses safe defaults for an empty query', () => {
    expect(parse('')).toEqual({
      mode: 'all',
      status: null,
      method: null,
      kind: null,
      search: null,
      providerId: null,
      sortColumn: 'created_at',
      ascending: false,
      page: 1,
      pageSize: 20,
      from: 0,
      to: 19,
    });
  });

  it('only accepts page sizes from the allowlist', () => {
    expect(parse('pageSize=50').pageSize).toBe(50);
    expect(parse('pageSize=100').pageSize).toBe(100);
    expect(parse('pageSize=1000').pageSize).toBe(20);
    expect(parse('pageSize=7').pageSize).toBe(20);
    expect(parse('pageSize=-10').pageSize).toBe(20);
    expect(parse('pageSize=abc').pageSize).toBe(20);
  });

  it('computes the row range from page and size', () => {
    expect(parse('page=3&pageSize=10')).toMatchObject({
      page: 3,
      from: 20,
      to: 29,
    });
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=-2').page).toBe(1);
    expect(parse('page=1.5').page).toBe(1);
  });

  it('falls back to defaults for unknown sort, status, method, kind and mode', () => {
    const p = parse(
      'sort=password&status=deleted&method=cash&kind=gift&mode=prod'
    );
    expect(p).toMatchObject({
      sortColumn: 'created_at',
      status: null,
      method: null,
      kind: null,
      mode: 'all',
    });
  });

  it('never maps a prototype key to a column', () => {
    expect(parse('sort=constructor').sortColumn).toBe('created_at');
    expect(parse('sort=__proto__').sortColumn).toBe('created_at');
  });

  it('accepts allowlisted values', () => {
    expect(
      parse('sort=amount_minor&status=halted&method=upi&kind=charge&mode=live')
    ).toMatchObject({
      sortColumn: 'amount_minor',
      status: 'halted',
      method: 'upi',
      kind: 'charge',
      mode: 'live',
    });
    expect(parse('mode=test').mode).toBe('test');
  });

  it('reads dir=asc, and anything else as descending', () => {
    expect(parse('dir=asc').ascending).toBe(true);
    expect(parse('dir=desc').ascending).toBe(false);
    expect(parse('dir=sideways').ascending).toBe(false);
  });

  it('treats a Razorpay id as an exact provider-id search', () => {
    expect(parse('search=%20sub_TqTtwUDRjijZys%20')).toMatchObject({
      providerId: 'sub_TqTtwUDRjijZys',
      search: null,
    });
    for (const id of [
      'pay_A1',
      'inv_B2',
      'rfnd_C3',
      'disp_D4',
      'plan_E5',
      'cust_F6',
      'evt_G7',
    ])
      expect(PROVIDER_ID_RE.test(id)).toBe(true);
  });

  it('treats anything else as an account-name search', () => {
    expect(parse('search=Acme%20Ltd')).toMatchObject({
      providerId: null,
      search: 'Acme Ltd',
    });
    expect(parse('search=sub_bad-id').providerId).toBeNull();
    expect(parse('search=order_abc').providerId).toBeNull();
    expect(parse('search=%20%20').search).toBeNull();
    expect(parse(`search=${'x'.repeat(300)}`).search).toHaveLength(100);
  });
});

describe('escapeIlike', () => {
  it('escapes LIKE wildcards, the escape character and commas', () => {
    expect(escapeIlike('50%_off\\now,ok')).toBe('50\\%\\_off\\\\now\\,ok');
    expect(escapeIlike('plain')).toBe('plain');
  });
});

describe('toListResponse', () => {
  it('reports total pages', () => {
    expect(toListResponse([1, 2], 45, 2, 20)).toEqual({
      items: [1, 2],
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
    expect(toListResponse([], 0, 1, 20).totalPages).toBe(0);
  });
});
