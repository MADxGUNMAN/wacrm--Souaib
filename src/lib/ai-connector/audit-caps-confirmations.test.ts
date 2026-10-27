import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAuditRow, summarizeArgs, writeAudit } from './audit';
import { dayInTimezone, reserveUsage } from './caps';
import {
  CONFIRMATION_ID_RE,
  consumeConfirmation,
  createConfirmation,
  hashArgs,
  stableStringify,
} from './confirmations';

const UUID = '3430edae-763b-4aac-9b82-1c2364936d79';

describe('audit', () => {
  it('keeps ids and short values but never free text or secrets', () => {
    const s = summarizeArgs({
      contact_id: UUID,
      template_name: 'order_update',
      to: '+919876543210',
      text: 'Hi Ravi, your invoice is attached. Thanks for your order!',
      dry_run: true,
      limit: 20,
      token: 'rpl_at_' + 'a'.repeat(43),
    }) as Record<string, unknown>;
    expect(s.contact_id).toBe(UUID);
    expect(s.template_name).toBe('order_update');
    expect(s.to).toBe('+919876543210');
    expect(s.text).toEqual({ text_length: 57 });
    expect(s.dry_run).toBe(true);
    expect(s.limit).toBe(20);
    expect(JSON.stringify(s)).not.toContain('a'.repeat(43));
  });

  it('reduces short free text to a length too (message bodies, variables, searches)', () => {
    const s = summarizeArgs({
      conversation_id: UUID,
      text: 'Hi',
      query: 'hello',
      name: 'Ravi',
      body_variables: ['Souaib', 'ORD-5074'],
      button_url_suffixes: { '0': 'abc' },
      template_name: 'delivery_confirmation',
      to_phone: '+919876543210',
    }) as Record<string, unknown>;
    expect(s).toEqual({
      conversation_id: UUID,
      text: { text_length: 2 },
      query: { text_length: 5 },
      name: { text_length: 4 },
      body_variables: [{ text_length: 6 }, { text_length: 8 }],
      button_url_suffixes: { '0': { text_length: 3 } },
      template_name: 'delivery_confirmation',
      to_phone: '+919876543210',
    });
  });

  it('bounds arrays and depth', () => {
    const s = summarizeArgs({
      ids: Array.from({ length: 30 }, () => UUID),
      deep: { a: { b: { c: { d: 1 } } } },
    }) as Record<string, unknown>;
    expect(s.ids).toMatchObject({ total: 30 });
    expect(JSON.stringify(s.deep)).toContain('[omitted]');
  });

  it('builds a row that fits the table constraints', () => {
    const row = buildAuditRow({
      accountId: UUID,
      connectionId: null,
      userId: null,
      platform: 'claude',
      action: 'x'.repeat(200),
      outcome: 'denied',
      denyReason: 'y'.repeat(500),
      affectedIds: [UUID, 'not-a-uuid'],
      durationMs: 12.6,
    });
    expect(row.action).toHaveLength(80);
    expect(row.deny_reason).toHaveLength(300);
    expect(row.affected_ids).toEqual([UUID]);
    expect(row.duration_ms).toBe(13);
    expect(row.args_summary).toBeNull();
  });

  it('never throws when the insert fails', async () => {
    const db = {
      from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }),
    } as unknown as SupabaseClient;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      writeAudit(db, {
        accountId: UUID,
        connectionId: null,
        userId: null,
        platform: null,
        action: 'x',
        outcome: 'ok',
      })
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('caps', () => {
  it('computes the day in the workspace timezone', () => {
    const t = new Date('2026-10-01T20:00:00Z');
    expect(dayInTimezone(t, 'UTC')).toBe('2026-10-01');
    expect(dayInTimezone(t, 'Asia/Kolkata')).toBe('2026-10-02');
    expect(dayInTimezone(t, 'Not/AZone')).toBe('2026-10-01');
  });

  it('passes caps to the RPC and maps the result', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          allowed: false,
          connection_messages: 100,
          account_messages: 250,
          account_recipients: 0,
        },
      ],
      error: null,
    }));
    const db = { rpc } as unknown as SupabaseClient;
    const r = await reserveUsage(db, {
      accountId: UUID,
      connectionId: UUID,
      messages: 1,
      caps: {
        connectionMessagesPerDay: 100,
        accountMessagesPerDay: 300,
        accountBroadcastRecipientsPerDay: 500,
      },
      now: new Date('2026-10-01T10:00:00Z'),
    });
    expect(r).toEqual({
      allowed: false,
      connectionMessages: 100,
      accountMessages: 250,
      accountRecipients: 0,
      day: '2026-10-01',
    });
    expect(rpc).toHaveBeenCalledWith(
      'ai_usage_try_increment',
      expect.objectContaining({ p_messages: 1, p_connection_msg_cap: 100 })
    );
  });

  it('throws when the RPC fails so the send does not go ahead', async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: 'denied' } }),
    } as unknown as SupabaseClient;
    await expect(
      reserveUsage(db, {
        accountId: UUID,
        connectionId: UUID,
        caps: {
          connectionMessagesPerDay: 1,
          accountMessagesPerDay: 1,
          accountBroadcastRecipientsPerDay: 1,
        },
      })
    ).rejects.toThrow();
  });
});

describe('confirmations', () => {
  it('hashes arguments independently of key order', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe(
      '{"a":[2,{"c":0,"d":1}],"b":1}'
    );
    expect(hashArgs('send_broadcast', { a: 1, b: 2 })).toBe(
      hashArgs('send_broadcast', { b: 2, a: 1 })
    );
    expect(hashArgs('send_broadcast', { a: 1 })).not.toBe(
      hashArgs('preview_broadcast', { a: 1 })
    );
    expect(hashArgs('t', { a: 1 })).not.toBe(hashArgs('t', { a: 2 }));
  });

  it('stores a confirmation bound to the connection, tool and args', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ insert }) } as unknown as SupabaseClient;
    const { id } = await createConfirmation(db, {
      connectionId: UUID,
      tool: 'send_broadcast',
      args: { x: 1 },
      preview: { n: 3 },
    });
    expect(id).toMatch(CONFIRMATION_ID_RE);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        connection_id: UUID,
        tool: 'send_broadcast',
        args_hash: hashArgs('send_broadcast', { x: 1 }),
      })
    );
  });

  it('consumes with one conditional update and refuses malformed ids without a query', async () => {
    const calls: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['update', 'eq', 'is', 'gt']) {
      builder[m] = (...a: unknown[]) => {
        calls.push([m, a]);
        return builder;
      };
    }
    builder.select = async () => ({
      data: [{ preview: { n: 3 } }],
      error: null,
    });
    const from = vi.fn(() => builder);
    const db = { from } as unknown as SupabaseClient;

    expect(
      await consumeConfirmation(db, {
        id: 'bad',
        connectionId: UUID,
        tool: 't',
        args: {},
      })
    ).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(from).not.toHaveBeenCalled();

    const id = 'cnf_' + 'A'.repeat(22);
    expect(
      await consumeConfirmation(db, {
        id,
        connectionId: UUID,
        tool: 't',
        args: { x: 1 },
      })
    ).toEqual({
      ok: true,
      preview: { n: 3 },
    });
    expect(calls.map((c) => c[0])).toEqual([
      'update',
      'eq',
      'eq',
      'eq',
      'eq',
      'is',
      'gt',
    ]);
    expect(calls).toContainEqual(['is', ['used_at', null]]);
  });
});
