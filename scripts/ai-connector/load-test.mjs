#!/usr/bin/env node
// ============================================================
// AI connector — load test (Phase 8, 05 "Load test").
//
// N throwaway connections each call read tools at R requests/minute for
// D minutes, and rotate their refresh token every T seconds (the token
// endpoint target is p95 < 500 ms). Read tools only: nothing is written
// to the CRM. Connections, tokens and audit rows are removed afterwards.
//
//   node scripts/ai-connector/load-test.mjs --connections 20 --rpm 60 --minutes 10
//
// The plan's full run (20 × 60/min × 10 min) is 1,200 requests/minute,
// which is exactly the per-IP limit on /mcp (RATE_LIMITS.mcpIp). Run it
// from a staging box with that limit raised for the test, or spread the
// load over several machines; from one machine, expect 429s at full size.
// ============================================================

import crypto from 'node:crypto';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const E = process.env;
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const CONNECTIONS = arg('connections', 5);
const RPM = arg('rpm', 60);
const MINUTES = arg('minutes', 2);
const ROTATE_S = arg('rotate', 30);
const ISSUER = E.AI_CONNECTOR_ISSUER;
const MCP = `${ISSUER}/mcp`;
const ACCOUNT =
  E.LOAD_ACCOUNT ||
  (E.AI_CONNECTOR_ALLOWED_ACCOUNTS ?? '').split(',')[0].trim();
if (
  ISSUER === 'https://wacrm.junkiescoder.com' &&
  !process.argv.includes('--allow-prod')
) {
  console.error('REFUSED: issuer is production');
  process.exit(2);
}
const RUN = crypto.randomBytes(3).toString('hex');
const SCOPES = [
  'profile',
  'contacts:read',
  'conversations:read',
  'messages:read',
  'deals:read',
  'templates:read',
  'broadcasts:read',
  'automations:read',
  'analytics:read',
];
const db = createClient(
  E.NEXT_PUBLIC_SUPABASE_URL,
  E.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const hmac = (v) =>
  crypto
    .createHmac('sha256', E.AI_CONNECTOR_TOKEN_PEPPER)
    .update(v, 'utf8')
    .digest('hex');
const secret = (p) => `${p}${crypto.randomBytes(32).toString('base64url')}`;

const CALLS = [
  ['get_profile', {}],
  ['list_conversations', { limit: 10 }],
  ['search_contacts', { query: 'a', limit: 10 }],
  ['list_tags', {}],
  ['get_dashboard_summary', {}],
  ['list_templates', {}],
  ['list_deals', { limit: 10 }],
];

const mcpLat = [];
const tokenLat = [];
const statuses = {};
let toolErrors = 0;
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(
    s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
  );
};

const clients = [];
const conns = [];
const started = Date.now();
try {
  const owner = (
    await db.from('accounts').select('owner_user_id').eq('id', ACCOUNT).single()
  ).data.owner_user_id;
  // One app per connection: a user can hold one active connection per app.
  for (let i = 0; i < CONNECTIONS; i++) {
    const cl = await db
      .from('oauth_clients')
      .insert({
        client_id: `load-${RUN}-${i}`,
        kind: 'dcr',
        platform: 'mcp_inspector',
        display_name: `Load test ${RUN}`,
        redirect_uris: ['https://example.com/cb'],
        trust: 'dev_only',
      })
      .select('id, client_id')
      .single();
    if (cl.error) throw new Error(`client: ${cl.error.message}`);
    clients.push(cl.data);
    const ins = await db
      .from('ai_connections')
      .insert({
        account_id: ACCOUNT,
        user_id: owner,
        oauth_client_id: cl.data.id,
        platform: 'mcp_inspector',
        granted_scopes: SCOPES,
        settings: { read_only: true },
        issuer: ISSUER,
        label: `load test ${RUN}`,
      })
      .select('id')
      .single();
    if (ins.error) throw new Error(`connection: ${ins.error.message}`);
    const c = ins.data;
    const refresh = secret('rpl_rt_');
    await db.from('oauth_refresh_tokens').insert({
      token_hash: hmac(refresh),
      connection_id: c.id,
      family_id: crypto.randomUUID(),
      scopes: SCOPES,
      issuer: ISSUER,
      resource: MCP,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      absolute_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    conns.push({
      id: c.id,
      refresh,
      access: null,
      clientId: cl.data.client_id,
    });
  }

  async function rotate(conn) {
    const t0 = performance.now();
    const res = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: conn.refresh,
        client_id: conn.clientId,
      }),
    });
    tokenLat.push(performance.now() - t0);
    const body = await res.json().catch(() => ({}));
    statuses[`token ${res.status}`] =
      (statuses[`token ${res.status}`] ?? 0) + 1;
    if (res.ok) {
      conn.refresh = body.refresh_token;
      conn.access = body.access_token;
    }
  }

  const deadline = started + MINUTES * 60_000;
  const gap = 60_000 / RPM;
  let n = 0;
  async function worker(conn, index) {
    await rotate(conn);
    let nextRotate = Date.now() + ROTATE_S * 1000;
    await new Promise((r) => setTimeout(r, (index * gap) / CONNECTIONS));
    while (Date.now() < deadline) {
      const tick = Date.now();
      if (tick >= nextRotate) {
        await rotate(conn);
        nextRotate = tick + ROTATE_S * 1000;
      }
      const [name, args] = CALLS[n++ % CALLS.length];
      const t0 = performance.now();
      try {
        const res = await fetch(MCP, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${conn.access}`,
            'MCP-Protocol-Version': '2025-06-18',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: n,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        });
        const body = await res.json().catch(() => null);
        mcpLat.push(performance.now() - t0);
        statuses[`mcp ${res.status}`] =
          (statuses[`mcp ${res.status}`] ?? 0) + 1;
        if (body?.result?.isError) toolErrors++;
      } catch {
        statuses['mcp network'] = (statuses['mcp network'] ?? 0) + 1;
      }
      const wait = gap - (Date.now() - tick);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
  console.log(
    `load: ${CONNECTIONS} connections × ${RPM}/min × ${MINUTES} min against ${ISSUER}`
  );
  await Promise.all(conns.map((c, i) => worker(c, i)));

  const secs = (Date.now() - started) / 1000;
  console.log(
    JSON.stringify(
      {
        requests: mcpLat.length,
        rate_per_min: Math.round((mcpLat.length / secs) * 60),
        mcp_ms: {
          p50: pct(mcpLat, 50),
          p95: pct(mcpLat, 95),
          p99: pct(mcpLat, 99),
          max: pct(mcpLat, 100),
        },
        token_ms: {
          n: tokenLat.length,
          p50: pct(tokenLat, 50),
          p95: pct(tokenLat, 95),
          max: pct(tokenLat, 100),
        },
        statuses,
        tool_errors: toolErrors,
      },
      null,
      2
    )
  );
} finally {
  await new Promise((r) => setTimeout(r, 3000));
  const ids = conns.map((c) => c.id);
  if (ids.length) {
    const { data: sample } = await db
      .from('ai_audit_log')
      .select('args_summary')
      .in('connection_id', ids)
      .eq('action', 'search_contacts')
      .limit(1);
    console.log(
      'audit sample (search_contacts):',
      JSON.stringify(sample?.[0]?.args_summary ?? null)
    );
    await db.from('ai_audit_log').delete().in('connection_id', ids);
    await db.from('ai_connections').delete().in('id', ids);
  }
  if (clients.length)
    await db
      .from('oauth_clients')
      .delete()
      .in(
        'id',
        clients.map((c) => c.id)
      );
  console.log('cleanup: done');
}
