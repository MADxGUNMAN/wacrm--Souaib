#!/usr/bin/env node
// ============================================================
// AI connector — isolation + security suite (Phase 8).
//
// Runs 02-security.md §6 (isolation) and the automatable half of
// 06-testing-guide.md §6 (OAuth / MCP probes) against a RUNNING dev
// server, using the dev database. Everything it creates is removed at
// the end, and every profile / policy field it changes is restored.
//
//   node scripts/ai-connector/security-suite.mjs
//
// Environment (from .env.local via @next/env):
//   AI_CONNECTOR_ISSUER, AI_CONNECTOR_TOKEN_PEPPER,
//   AI_CONNECTOR_JWT_PRIVATE_KEY, AI_CONNECTOR_JWT_KID,
//   AI_CONNECTOR_ALLOWED_ACCOUNTS, NEXT_PUBLIC_SUPABASE_URL,
//   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   ISO_A_ACCOUNT  workspace A (default: first allowlisted account)
//   ISO_B_ACCOUNT  workspace B — required. An EMPTY test workspace with
//                  no WhatsApp connected; synthetic rows are added to it
//                  for the run and deleted afterwards.
//   ISO_A_MEMBER   optional member of A for the role tests (default: the
//                  first active member with no AI connections)
//
// Side effects that can't be undone: the refresh-reuse and code-reuse
// tests revoke throwaway connections, which emails A's owner "we
// disconnected … because of suspicious activity" (06 §6 #10 expects it).
// In-app notifications from the run are deleted.
// ============================================================

import crypto from 'node:crypto';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const E = process.env;

const PRODUCTION_ISSUER = 'https://wacrm.junkiescoder.com';
// A real customer workspace that must never be touched by test tooling.
const NEVER_TOUCH = new Set(['b69f6811-ab01-4b6d-b89e-68b65bdcba5d']);

const ISSUER = E.AI_CONNECTOR_ISSUER;
const MCP = `${ISSUER}/mcp`;
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PEPPER = E.AI_CONNECTOR_TOKEN_PEPPER;
const A =
  E.ISO_A_ACCOUNT ||
  (E.AI_CONNECTOR_ALLOWED_ACCOUNTS ?? '').split(',')[0].trim();
const B = (E.ISO_B_ACCOUNT ?? '').trim();
const RUN = crypto.randomBytes(3).toString('hex');
const MARK = `ISO-${RUN}`;
const STARTED = new Date().toISOString();

const ALL_SCOPES = [
  'profile',
  'contacts:read',
  'conversations:read',
  'messages:read',
  'deals:read',
  'templates:read',
  'broadcasts:read',
  'automations:read',
  'analytics:read',
  'contacts:write',
  'conversations:write',
  'deals:write',
  'messages:send',
  'broadcasts:send',
  'automations:manage',
];
const ALL_ON = {
  read_only: false,
  groups: {
    edit_records: true,
    send_messages: true,
    send_to_new_numbers: false,
    broadcasts: true,
    automations: true,
  },
  caps: { messages_per_day: 100 },
  idle_days: 30,
};

function fatal(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}
if (!ISSUER || !PEPPER || !SUPA || !ANON || !E.SUPABASE_SERVICE_ROLE_KEY)
  fatal('AI connector / Supabase env is incomplete');
if (ISSUER === PRODUCTION_ISSUER && !process.argv.includes('--allow-prod'))
  fatal('issuer is production; run against devcrm (or pass --allow-prod)');
if (!A || !B)
  fatal(
    'set ISO_B_ACCOUNT (and AI_CONNECTOR_ALLOWED_ACCOUNTS or ISO_A_ACCOUNT)'
  );
if (A === B) fatal('workspace A and B must differ');
if (NEVER_TOUCH.has(A) || NEVER_TOUCH.has(B))
  fatal('that workspace must never be used for tests');

const db = createClient(SUPA, E.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const q = async (p, what) => {
  const r = await p;
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ------------------------------------------------------------
// Result tracking
// ------------------------------------------------------------
const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail ? `  — ${String(detail).slice(0, 160)}` : ''}`
  );
}
function skip(id, name, why) {
  results.push({ id, name, ok: true, skipped: true });
  console.log(`SKIP  [${id}] ${name}  — ${why}`);
}

// ------------------------------------------------------------
// Fixtures: clients, connections, tokens
// ------------------------------------------------------------
const created = { clients: [], connections: [], b: [] };

async function mkClient(label) {
  const row = await q(
    db
      .from('oauth_clients')
      .insert({
        client_id: `iso-${RUN}-${label}`,
        kind: 'dcr',
        platform: 'mcp_inspector',
        display_name: `Security suite ${RUN}`,
        redirect_uris: ['https://example.com/iso-callback'],
        trust: 'dev_only',
      })
      .select('id, client_id')
      .single(),
    'client'
  );
  created.clients.push(row.id);
  return row;
}
async function mkConnection(userId, client, opts = {}) {
  const row = await q(
    db
      .from('ai_connections')
      .insert({
        account_id: opts.accountId ?? A,
        user_id: userId,
        oauth_client_id: client.id,
        platform: 'mcp_inspector',
        granted_scopes: opts.scopes ?? ALL_SCOPES,
        settings: opts.settings ?? ALL_ON,
        issuer: opts.issuer ?? ISSUER,
        label: `security suite ${RUN}`,
      })
      .select('id')
      .single(),
    'connection'
  );
  created.connections.push(row.id);
  return row.id;
}
const hmac = (v, pepper = PEPPER) =>
  crypto.createHmac('sha256', pepper).update(v, 'utf8').digest('hex');
const secret = (prefix) =>
  `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
async function mkAccess(connId, opts = {}) {
  const token = secret('rpl_at_');
  await q(
    db.from('oauth_access_tokens').insert({
      token_hash: hmac(token, opts.pepper),
      connection_id: connId,
      scopes: opts.scopes ?? ALL_SCOPES,
      issuer: opts.issuer ?? ISSUER,
      resource: opts.resource ?? MCP,
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    }),
    'access token'
  );
  return token;
}

// ------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------
let rpcId = 1;
async function rpc(token, method, params = {}, extraHeaders = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, body };
}
async function call(token, name, args = {}) {
  const r = await rpc(token, 'tools/call', { name, arguments: args });
  const result = r.body?.result ?? {};
  return {
    status: r.status,
    isError: result.isError === true || !!r.body?.error,
    out: result.structuredContent ?? null,
    text: result.content?.[0]?.text ?? r.body?.error?.message ?? '',
    raw: JSON.stringify(r.body ?? {}),
  };
}
async function listTools(token) {
  const r = await rpc(token, 'tools/list');
  return (r.body?.result?.tools ?? []).map((t) => t.name);
}
async function tokenEndpoint(params) {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

// ------------------------------------------------------------
// Supabase JWTs (same claims as src/lib/ai-connector/supabase-jwt.ts)
// ------------------------------------------------------------
function signingKey() {
  const raw = (E.AI_CONNECTOR_JWT_PRIVATE_KEY ?? '').trim();
  return raw.startsWith('{')
    ? crypto.createPrivateKey({ key: JSON.parse(raw), format: 'jwk' })
    : crypto.createPrivateKey(raw.replace(/\\n/g, '\n'));
}
function mintJwt(userId, aiConn) {
  const b64u = (v) => Buffer.from(v).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid: E.AI_CONNECTOR_JWT_KID };
  const payload = {
    iss: `${SUPA}/auth/v1`,
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    iat,
    exp: iat + 120,
    session_id: aiConn ?? crypto.randomUUID(),
    ...(aiConn ? { ai_conn: aiConn, ai_platform: 'mcp_inspector' } : {}),
  };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(input), {
    key: signingKey(),
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${b64u(sig)}`;
}
async function rest(jwt, path, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

// ------------------------------------------------------------
// Workspace B seed (synthetic, removed at the end)
// ------------------------------------------------------------
async function seedB(bOwner) {
  const ins = async (table, row) => {
    const r = await q(
      db.from(table).insert(row).select('id').single(),
      `seed ${table}`
    );
    created.b.push({ table, id: r.id });
    return r.id;
  };
  const ids = {};
  ids.tag = await ins('tags', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} tag`,
    color: '#000000',
  });
  ids.contact = await ins('contacts', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} contact`,
    phone: `9190000${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    source: 'manual',
  });
  ids.contactTag = await ins('contact_tags', {
    contact_id: ids.contact,
    tag_id: ids.tag,
  });
  ids.note = await ins('contact_notes', {
    account_id: B,
    user_id: bOwner,
    contact_id: ids.contact,
    note_text: `${MARK} note`,
  });
  ids.field = await ins('custom_fields', {
    account_id: B,
    user_id: bOwner,
    field_name: `${MARK} field`,
    field_type: 'text',
  });
  ids.conversation = await ins('conversations', {
    account_id: B,
    user_id: bOwner,
    contact_id: ids.contact,
    status: 'open',
    unread_count: 3,
  });
  ids.message = await ins('messages', {
    conversation_id: ids.conversation,
    sender_type: 'customer',
    content_type: 'text',
    content_text: `${MARK} customer message`,
    status: 'delivered',
  });
  ids.pipeline = await ins('pipelines', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} pipeline`,
  });
  ids.stage = await ins('pipeline_stages', {
    pipeline_id: ids.pipeline,
    name: `${MARK} stage`,
    position: 0,
  });
  ids.deal = await ins('deals', {
    account_id: B,
    user_id: bOwner,
    pipeline_id: ids.pipeline,
    stage_id: ids.stage,
    contact_id: ids.contact,
    title: `${MARK} deal`,
    value: 100,
    status: 'open',
  });
  ids.template = await ins('message_templates', {
    account_id: B,
    user_id: bOwner,
    name: `iso_${RUN}_tpl`,
    language: 'en_US',
    category: 'Utility',
    status: 'APPROVED',
    body_text: `${MARK} template body`,
  });
  ids.broadcast = await ins('broadcasts', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} broadcast`,
    template_name: `iso_${RUN}_tpl`,
    template_language: 'en_US',
    status: 'scheduled',
    scheduled_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  ids.automation = await ins('automations', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} automation`,
    trigger_type: 'new_message_received',
    trigger_config: {},
    is_active: false,
  });
  ids.flow = await ins('flows', {
    account_id: B,
    user_id: bOwner,
    name: `${MARK} flow`,
    status: 'draft',
    trigger_type: 'manual',
    trigger_config: {},
  });
  return ids;
}
async function snapshotB() {
  const out = {};
  for (const { table, id } of created.b) {
    const { data } = await db
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    out[`${table}:${id}`] = JSON.stringify(data);
  }
  const counts = await Promise.all([
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
    db
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
    db
      .from('broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
    db
      .from('contact_notes')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
    db
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', B),
  ]);
  out.counts = counts.map((c) => c.count).join(',');
  return out;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
let policyBackup = null;
const notifyUsers = [];
let memberBackup = null;

try {
  // ---------- preflight ----------
  const [accA, accB] = await Promise.all([
    q(
      db.from('accounts').select('id, owner_user_id').eq('id', A).single(),
      'account A'
    ),
    q(
      db.from('accounts').select('id, owner_user_id').eq('id', B).single(),
      'account B'
    ),
  ]);
  const waB = await q(
    db.from('whatsapp_config').select('id').eq('account_id', B),
    'B whatsapp'
  );
  if (waB.length)
    fatal('workspace B has WhatsApp connected; use an empty test workspace');
  if (
    (E.AI_CONNECTOR_ALLOWED_ACCOUNTS ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes(B)
  )
    fatal(
      'workspace B is allowlisted for the connector; pick a workspace that is not'
    );
  const ownerA = accA.owner_user_id;
  const ownerB = accB.owner_user_id;
  notifyUsers.push(ownerA);

  const aConv = (
    await q(
      db
        .from('conversations')
        .select('id, contact_id, assigned_agent_id, status, unread_count')
        .eq('account_id', A)
        .order('created_at', { ascending: true })
        .limit(1),
      'A conversation'
    )
  )[0];
  const aTag = (
    await q(db.from('tags').select('id').eq('account_id', A).limit(1), 'A tag')
  )[0];
  const aPipeline = (
    await q(
      db.from('pipelines').select('id').eq('account_id', A).limit(1),
      'A pipeline'
    )
  )[0];
  if (!aConv) fatal('workspace A needs at least one conversation');
  const aContact = aConv.contact_id;

  const b = await seedB(ownerB);
  const bIds = Object.values(b);
  const leaks = (json) =>
    bIds.filter((id) => json.includes(id)).length +
    (json.includes(MARK) ? 1 : 0);
  console.log(
    `run ${RUN}: A=${A.slice(0, 8)} B=${B.slice(0, 8)} seeded ${bIds.length} rows in B`
  );

  const clientMain = await mkClient('main');
  const connOwner = await mkConnection(ownerA, clientMain);
  const tOwner = await mkAccess(connOwner);
  const listed = await listTools(tOwner);
  console.log(`   owner sees ${listed.length} tools`);

  // ---------- 02 §6 #1: reads never return B ----------
  const byId = [
    ['get_contact', { contact_id: b.contact }],
    ['list_contact_notes', { contact_id: b.contact }],
    ['get_conversation', { conversation_id: b.conversation }],
    ['get_messages', { conversation_id: b.conversation }],
    ['get_deal', { deal_id: b.deal }],
    ['get_broadcast', { broadcast_id: b.broadcast }],
    ['get_template', { template_id: b.template }],
  ];
  const filtered = [
    ['list_conversations', { contact_id: b.contact }],
    ['list_deals', { contact_id: b.contact }],
    ['list_deals', { pipeline_id: b.pipeline }],
    ['search_contacts', { tag_id: b.tag }],
    ['search_contacts', { query: MARK }],
    ['search_messages', { query: MARK }],
    ['search_messages', { query: MARK, conversation_id: b.conversation }],
    ['list_tags', {}],
    ['list_conversations', {}],
    ['list_team_members', {}],
    ['list_custom_fields', {}],
    ['list_templates', { status: 'all' }],
    ['list_pipelines', {}],
    ['list_deals', {}],
    ['list_broadcasts', {}],
    ['list_automations', {}],
    ['list_flows', {}],
    ['list_notifications', {}],
    ['get_dashboard_summary', {}],
  ];
  let readFails = [];
  for (const [tool, args] of byId) {
    if (!listed.includes(tool)) {
      readFails.push(`${tool}: not listed`);
      continue;
    }
    const r = await call(tOwner, tool, args);
    const ok =
      r.isError &&
      /not found/i.test(r.text) &&
      !/forbidden|permission|not allowed/i.test(r.text) &&
      leaks(r.raw) === 0;
    if (!ok) readFails.push(`${tool}: ${r.text.slice(0, 80)}`);
  }
  check(
    '02§6.1a',
    `${byId.length} read tools given B ids answer "not found" (not "forbidden")`,
    readFails.length === 0,
    readFails.join(' | ')
  );
  readFails = [];
  for (const [tool, args] of filtered) {
    if (!listed.includes(tool)) continue;
    const r = await call(tOwner, tool, args);
    const ok = (!r.isError || /not found/i.test(r.text)) && leaks(r.raw) === 0;
    if (!ok)
      readFails.push(
        `${tool}(${Object.keys(args).join(',')}): ${r.isError ? r.text.slice(0, 60) : 'B data in result'}`
      );
  }
  check(
    '02§6.1b',
    `${filtered.length} list/search calls return nothing from B`,
    readFails.length === 0,
    readFails.join(' | ')
  );

  // ---------- 02 §6 #2: writes with B ids change nothing ----------
  const before = await snapshotB();
  const aBefore = JSON.stringify(
    await q(
      db
        .from('conversations')
        .select('assigned_agent_id, status, unread_count')
        .eq('id', aConv.id)
        .single(),
      'A conv'
    )
  );
  const aTagsBefore = (
    await q(
      db.from('contact_tags').select('id').eq('contact_id', aContact),
      'A tags'
    )
  ).length;
  const aValuesBefore = await q(
    db
      .from('contact_custom_values')
      .select('id, value')
      .eq('contact_id', aContact),
    'A values'
  );
  const writes = [
    ['update_contact', { contact_id: b.contact, name: 'pwned' }],
    ['add_tags_to_contacts', { contact_ids: [b.contact], tag_ids: [b.tag] }],
    ['add_tags_to_contacts', { contact_ids: [aContact], tag_ids: [b.tag] }],
    ...(aTag
      ? [
          [
            'add_tags_to_contacts',
            { contact_ids: [b.contact], tag_ids: [aTag.id] },
          ],
        ]
      : []),
    [
      'remove_tags_from_contacts',
      { contact_ids: [b.contact], tag_ids: [b.tag] },
    ],
    ['add_contact_note', { contact_id: b.contact, text: 'pwned' }],
    [
      'set_custom_field',
      { contact_id: b.contact, field_id: b.field, value: 'pwned' },
    ],
    [
      'set_custom_field',
      { contact_id: aContact, field_id: b.field, value: 'pwned' },
    ],
    [
      'update_conversation_status',
      { conversation_id: b.conversation, status: 'closed' },
    ],
    [
      'assign_conversation',
      { conversation_id: b.conversation, assign_to: 'me' },
    ],
    ['assign_conversation', { conversation_id: aConv.id, assign_to: ownerB }],
    ['mark_conversation_read', { conversation_id: b.conversation }],
    [
      'create_deal',
      { contact_id: b.contact, pipeline_id: b.pipeline, title: 'pwned' },
    ],
    [
      'create_deal',
      { contact_id: aContact, pipeline_id: b.pipeline, title: 'pwned' },
    ],
    ...(aPipeline
      ? [
          [
            'create_deal',
            {
              contact_id: b.contact,
              pipeline_id: aPipeline.id,
              title: 'pwned',
            },
          ],
        ]
      : []),
    ['update_deal', { deal_id: b.deal, title: 'pwned' }],
    ['update_deal', { deal_id: b.deal, stage_id: b.stage }],
    ['close_deal', { deal_id: b.deal, outcome: 'won' }],
    [
      'send_text_message',
      { conversation_id: b.conversation, text: `${MARK} must not send` },
    ],
    [
      'send_template_message',
      { contact_id: b.contact, template_name: 'hello_world' },
    ],
    [
      'send_template_message',
      { conversation_id: b.conversation, template_name: 'hello_world' },
    ],
    [
      'preview_broadcast',
      { template_name: 'hello_world', contact_ids: [b.contact] },
    ],
    ['preview_broadcast', { template_name: 'hello_world', tag_ids: [b.tag] }],
    ['cancel_scheduled_broadcast', { broadcast_id: b.broadcast }],
    ['set_automation_active', { automation_id: b.automation, active: true }],
    ['set_flow_status', { flow_id: b.flow, status: 'active' }],
  ];
  const writeFails = [];
  const notListed = new Set();
  for (const [tool, args] of writes) {
    if (!listed.includes(tool)) {
      notListed.add(tool);
      continue;
    }
    const r = await call(tOwner, tool, args);
    const ok = r.isError && /not found/i.test(r.text) && leaks(r.raw) === 0;
    if (!ok)
      writeFails.push(
        `${tool}: ${r.isError ? r.text.slice(0, 70) : 'SUCCEEDED'}`
      );
  }
  const after = await snapshotB();
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
  const aAfter = JSON.stringify(
    await q(
      db
        .from('conversations')
        .select('assigned_agent_id, status, unread_count')
        .eq('id', aConv.id)
        .single(),
      'A conv'
    )
  );
  const aTagsAfter = (
    await q(
      db.from('contact_tags').select('id').eq('contact_id', aContact),
      'A tags'
    )
  ).length;
  const aValuesAfter = await q(
    db
      .from('contact_custom_values')
      .select('id, value')
      .eq('contact_id', aContact),
    'A values'
  );
  check(
    '02§6.2a',
    `${writes.length - notListed.size} write calls with B ids answer "not found"`,
    writeFails.length === 0,
    writeFails.join(' | ')
  );
  if (notListed.size)
    console.log(
      `   not listed (workspace policy / settings): ${[...notListed].join(', ')}`
    );
  check(
    '02§6.2b',
    'nothing in B changed (rows + counts byte-identical)',
    changed.length === 0,
    changed.join(', ')
  );
  check(
    '02§6.2c',
    "A's own rows untouched by the mixed-id calls",
    aBefore === aAfter &&
      aTagsBefore === aTagsAfter &&
      JSON.stringify(aValuesBefore) === JSON.stringify(aValuesAfter)
  );

  // ---------- 02 §6 #3, #4: member permissions, live ----------
  const memberId =
    E.ISO_A_MEMBER ||
    (
      await q(
        db
          .from('profiles')
          .select('user_id')
          .eq('account_id', A)
          .eq('account_role', 'member')
          .eq('is_active', true),
        'members'
      )
    )[0]?.user_id;
  if (!memberId) {
    skip(
      '02§6.3',
      'member without Contacts',
      'workspace A has no active member'
    );
    skip(
      '02§6.4',
      'member changed mid-session',
      'workspace A has no active member'
    );
  } else {
    const otherConns = await q(
      db
        .from('ai_connections')
        .select('id')
        .eq('user_id', memberId)
        .is('revoked_at', null),
      'member conns'
    );
    const prof = await q(
      db
        .from('profiles')
        .select('permissions, is_active')
        .eq('user_id', memberId)
        .single(),
      'member'
    );
    notifyUsers.push(memberId);
    memberBackup = {
      userId: memberId,
      permissions: prof.permissions,
      is_active: prof.is_active,
    };
    const pol = await q(
      db
        .from('ai_workspace_policies')
        .select('members_allowed, max_member_tier')
        .eq('account_id', A)
        .maybeSingle(),
      'policy'
    );
    policyBackup = pol ? { existed: true, ...pol } : { existed: false };
    if (pol)
      await q(
        db
          .from('ai_workspace_policies')
          .update({ members_allowed: true, max_member_tier: 'edit' })
          .eq('account_id', A),
        'policy members on'
      );
    else
      await q(
        db
          .from('ai_workspace_policies')
          .insert({ account_id: A, members_allowed: true }),
        'policy insert'
      );

    const setPerms = (p) =>
      q(
        db
          .from('profiles')
          .update({ permissions: { ...(prof.permissions ?? {}), ...p } })
          .eq('user_id', memberId),
        'perms'
      );
    await setPerms({ inbox: true, contacts: false });
    const clientM = await mkClient('member');
    const connM = await mkConnection(memberId, clientM, {
      settings: {
        ...ALL_ON,
        groups: {
          ...ALL_ON.groups,
          send_messages: false,
          broadcasts: false,
          automations: false,
        },
      },
    });
    const tM = await mkAccess(connM);
    const mList = await listTools(tM);
    const contactTools = [
      'search_contacts',
      'get_contact',
      'create_contact',
      'add_contact_note',
      'list_tags',
    ];
    const hidden = contactTools.every((t) => !mList.includes(t));
    const r1 = await call(tM, 'get_contact', { contact_id: aContact });
    check(
      '02§6.3',
      'member without Contacts: contact tools hidden and refused if called',
      hidden && mList.includes('list_conversations') && r1.isError,
      `${mList.length} tools; call: ${r1.text.slice(0, 60)}`
    );

    await setPerms({ inbox: true, contacts: true });
    const r2 = await call(tM, 'get_contact', { contact_id: aContact });
    await setPerms({ inbox: true, contacts: false });
    const r3 = await call(tM, 'get_contact', { contact_id: aContact });
    check(
      '02§6.4a',
      'permission removed mid-session → the next call is refused',
      !r2.isError && r3.isError,
      `granted: ${r2.isError ? r2.text.slice(0, 50) : 'ok'}; removed: ${r3.text.slice(0, 50)}`
    );

    if (otherConns.length) {
      skip(
        '02§6.4b',
        'member deactivated → next call 401',
        'member has other live AI connections; not deactivating them'
      );
    } else {
      await q(
        db
          .from('profiles')
          .update({ is_active: false })
          .eq('user_id', memberId),
        'deactivate'
      );
      const r4 = await rpc(tM, 'tools/list');
      const c4 = await q(
        db
          .from('ai_connections')
          .select('revoked_at, revoke_reason')
          .eq('id', connM)
          .single(),
        'conn'
      );
      await q(
        db
          .from('profiles')
          .update({ is_active: memberBackup.is_active })
          .eq('user_id', memberId),
        'reactivate'
      );
      check(
        '02§6.4b',
        'member deactivated → next call 401 and the connection is revoked',
        r4.status === 401 && c4.revoke_reason === 'membership_changed',
        `status ${r4.status}, ${c4.revoke_reason}`
      );
    }
  }

  // ---------- 02 §6 #5 ----------
  skip(
    '02§6.5',
    'banned / lapsed workspace refused',
    'unit-tested (gate.test, policy.test); banning a real workspace live notifies super admins'
  );

  // ---------- 02 §6 #7 + 06 §6 #5: token from another server ----------
  const clientAud = await mkClient('aud');
  const connAud = await mkConnection(ownerA, clientAud);
  const tProdIssuer = await mkAccess(connAud, {
    issuer: PRODUCTION_ISSUER,
    resource: `${PRODUCTION_ISSUER}/mcp`,
  });
  const tOtherPepper = await mkAccess(connAud, {
    pepper: crypto.randomBytes(32).toString('hex'),
  });
  const tAud = await mkAccess(connAud);
  const a1 = await rpc(tProdIssuer, 'tools/list');
  const a2 = await rpc(tOtherPepper, 'tools/list');
  const a3 = await rpc(tAud, 'tools/list');
  check(
    '02§6.7',
    'token issued for production (issuer/resource) → 401 here',
    a1.status === 401 &&
      /different server/.test(a1.headers.get('www-authenticate') ?? ''),
    a1.headers.get('www-authenticate')
  );
  check(
    '02§6.7b',
    'token hashed with another pepper (another environment) → 401',
    a2.status === 401
  );
  const clientProdConn = await mkClient('prodconn');
  const connProd = await mkConnection(ownerA, clientProdConn, {
    issuer: PRODUCTION_ISSUER,
  });
  const tProdConn = await mkAccess(connProd);
  const a4 = await rpc(tProdConn, 'tools/list');
  check(
    '02§6.7c',
    'connection made on production → 401 here',
    a3.status === 200 && a4.status === 401,
    `control ${a3.status}, prod conn ${a4.status}`
  );

  // ---------- 02 §6 #8: AI-deny RLS straight against PostgREST ----------
  const aiJwt = mintJwt(ownerA, connOwner);
  const plainJwt = mintJwt(ownerA, null);
  const control = await rest(
    plainJwt,
    `whatsapp_config?select=id&account_id=eq.${A}`
  );
  const denied = {};
  for (const t of [
    'whatsapp_config',
    'api_keys',
    'ai_configs',
    'webhook_endpoints',
    'ai_connections',
    'ai_audit_log',
    'ai_workspace_policies',
    'payment_requests',
  ]) {
    const r = await rest(aiJwt, `${t}?select=*&account_id=eq.${A}&limit=5`);
    denied[t] = Array.isArray(r.body) ? r.body.length : `status ${r.status}`;
  }
  const deniedOk = Object.values(denied).every(
    (v) => v === 0 || String(v).startsWith('status 4')
  );
  check(
    '02§6.8a',
    'AI JWT reads 0 rows from secrets/settings tables (non-AI JWT control sees whatsapp_config)',
    Array.isArray(control.body) && control.body.length > 0 && deniedOk,
    JSON.stringify(denied)
  );
  const optOut = await rest(aiJwt, 'marketing_opt_outs', {
    method: 'POST',
    body: JSON.stringify({ account_id: A, phone_normalized: `9100${RUN}` }),
  });
  if (optOut.status < 300)
    await db
      .from('marketing_opt_outs')
      .delete()
      .eq('account_id', A)
      .eq('phone_normalized', `9100${RUN}`);
  const profPatch = await rest(aiJwt, `profiles?user_id=eq.${ownerA}`, {
    method: 'PATCH',
    body: JSON.stringify({ full_name: 'pwned' }),
  });
  const policyPatch = await rest(aiJwt, `ai_connections?id=eq.${connOwner}`, {
    method: 'PATCH',
    body: JSON.stringify({ granted_scopes: ['profile'] }),
  });
  check(
    '02§6.8b',
    'AI JWT cannot write opt-outs, profiles or its own connection',
    optOut.status >= 400 &&
      (profPatch.status >= 400 ||
        (Array.isArray(profPatch.body) && profPatch.body.length === 0)) &&
      (policyPatch.status >= 400 ||
        (Array.isArray(policyPatch.body) && policyPatch.body.length === 0)),
    `opt-out ${optOut.status}, profile ${profPatch.status}/${JSON.stringify(profPatch.body).slice(0, 40)}, connection ${policyPatch.status}`
  );

  // ---------- 02 §6 #6 + 06 §6 #4: revoke → 401, replay → 401 ----------
  const d = await call(tOwner, 'disconnect', {});
  const afterRevoke = await rpc(tOwner, 'tools/list');
  const replay = await call(tOwner, 'get_profile', {});
  check(
    '02§6.6',
    'disconnect → next call 401; replaying the token → 401',
    !d.isError && afterRevoke.status === 401 && replay.status === 401,
    `disconnect: ${d.text.slice(0, 40)}`
  );

  // ---------- 02 §6 #9 + 06 §6 #10: refresh reuse ----------
  const clientR = await mkClient('refresh');
  const clientOther = await mkClient('other');
  const connR = await mkConnection(ownerA, clientR);
  const r1Token = secret('rpl_rt_');
  await q(
    db.from('oauth_refresh_tokens').insert({
      token_hash: hmac(r1Token),
      connection_id: connR,
      family_id: crypto.randomUUID(),
      scopes: ALL_SCOPES,
      issuer: ISSUER,
      resource: MCP,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      absolute_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }),
    'refresh token'
  );
  const wrongClient = await tokenEndpoint({
    grant_type: 'refresh_token',
    refresh_token: r1Token,
    client_id: clientOther.client_id,
  });
  const connAfterWrong = await q(
    db.from('ai_connections').select('revoked_at').eq('id', connR).single(),
    'conn'
  );
  check(
    '06§6.10a',
    "another client presenting the refresh token → 400, and it can't revoke the victim",
    wrongClient.status === 400 && connAfterWrong.revoked_at === null,
    `${wrongClient.status} ${wrongClient.body?.error}`
  );
  const first = await tokenEndpoint({
    grant_type: 'refresh_token',
    refresh_token: r1Token,
    client_id: clientR.client_id,
  });
  const second = await tokenEndpoint({
    grant_type: 'refresh_token',
    refresh_token: r1Token,
    client_id: clientR.client_id,
  });
  const connAfterReuse = await q(
    db
      .from('ai_connections')
      .select('revoked_at, revoke_reason')
      .eq('id', connR)
      .single(),
    'conn'
  );
  const newAccess = first.body?.access_token
    ? await rpc(first.body.access_token, 'tools/list')
    : { status: 0 };
  const newRefresh = first.body?.refresh_token
    ? await tokenEndpoint({
        grant_type: 'refresh_token',
        refresh_token: first.body.refresh_token,
        client_id: clientR.client_id,
      })
    : { status: 0 };
  check(
    '02§6.9',
    'refresh reuse → 400, connection revoked (refresh_reuse), whole family dead',
    first.status === 200 &&
      second.status === 400 &&
      connAfterReuse.revoke_reason === 'refresh_reuse' &&
      newAccess.status === 401 &&
      newRefresh.status === 400,
    `first ${first.status}, reuse ${second.status}, ${connAfterReuse.revoke_reason}, new access ${newAccess.status}, new refresh ${newRefresh.status}`
  );

  // ---------- 02 §6 #10: code reuse ----------
  const clientC = await mkClient('code');
  const connC = await mkConnection(ownerA, clientC);
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  const code = secret('rpl_ac_');
  await q(
    db.from('oauth_authorization_codes').insert({
      code_hash: hmac(code),
      connection_id: connC,
      oauth_client_id: clientC.id,
      redirect_uri: 'https://example.com/iso-callback',
      code_challenge: challenge,
      granted_scopes: ALL_SCOPES,
      resource: MCP,
      issuer: ISSUER,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }),
    'code'
  );
  const exchange = (v) =>
    tokenEndpoint({
      grant_type: 'authorization_code',
      code,
      client_id: clientC.client_id,
      redirect_uri: 'https://example.com/iso-callback',
      code_verifier: v,
      resource: MCP,
    });
  const badPkce = await exchange(crypto.randomBytes(48).toString('base64url'));
  const good = await exchange(verifier);
  const again = await exchange(verifier);
  const connAfterCode = await q(
    db.from('ai_connections').select('revoke_reason').eq('id', connC).single(),
    'conn'
  );
  const codeAccess = good.body?.access_token
    ? await rpc(good.body.access_token, 'tools/list')
    : { status: 0 };
  check(
    '02§6.10',
    'wrong PKCE verifier → 400 without burning the code; reuse → 400 and its tokens revoked',
    badPkce.status === 400 &&
      good.status === 200 &&
      again.status === 400 &&
      connAfterCode.revoke_reason === 'code_reuse' &&
      codeAccess.status === 401,
    `bad pkce ${badPkce.status}, good ${good.status}, reuse ${again.status}, ${connAfterCode.revoke_reason}, access ${codeAccess.status}`
  );

  // ---------- 06 §6 #6–9 and /mcp transport rules ----------
  const getMcp = await fetch(MCP);
  check('mcp.1', 'GET /mcp → 405', getMcp.status === 405);
  const qTok = await fetch(`${MCP}?access_token=${secret('rpl_at_')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  check('mcp.2', 'token in the query string → 401', qTok.status === 401);
  const evil = await rpc(
    tAud,
    'tools/list',
    {},
    { Origin: 'https://evil.example' }
  );
  check(
    'mcp.3',
    'browser Origin not on the allowlist → 403',
    evil.status === 403
  );
  const big = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tAud}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { pad: 'x'.repeat(300 * 1024) },
    }),
  });
  check('mcp.4', 'body over 256 KB → 413', big.status === 413);
  const batch = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tAud}`,
    },
    body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]),
  });
  check('mcp.5', 'JSON-RPC batch → 400', batch.status === 400);
  const noAuth = await rpc(null, 'tools/list');
  check(
    'mcp.6',
    'no token → 401 with resource_metadata challenge',
    noAuth.status === 401 &&
      /resource_metadata=/.test(noAuth.headers.get('www-authenticate') ?? '')
  );

  const consent = await fetch(`${ISSUER}/oauth/consent?request=req_x`, {
    redirect: 'manual',
  });
  const xfo = consent.headers.get('x-frame-options');
  const csp = `${consent.headers.get('content-security-policy') ?? ''} ${consent.headers.get('content-security-policy-report-only') ?? ''}`;
  check(
    '06§6.6',
    'consent page refuses to be framed (X-Frame-Options DENY)',
    xfo === 'DENY',
    `status ${consent.status}, XFO ${xfo}, frame-ancestors ${/frame-ancestors 'none'/.test(csp)}`
  );
  const decision = await fetch(`${ISSUER}/api/oauth/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://evil.example',
    },
    body: 'request_id=req_x&decision=allow&csrf=x',
    redirect: 'manual',
  });
  check(
    '06§6.7',
    'consent decision posted from another origin → 403',
    decision.status === 403
  );

  const authorize = (over) => {
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: clientAud.client_id,
      redirect_uri: 'https://example.com/iso-callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'iso',
      resource: MCP,
      scope: 'profile contacts:read',
      ...over,
    });
    return fetch(`${ISSUER}/oauth/authorize?${p}`, { redirect: 'manual' });
  };
  const evilRedirect = await authorize({
    redirect_uri: 'https://evil.example/cb',
  });
  const loc1 = evilRedirect.headers.get('location') ?? '';
  check(
    '06§6.8',
    'unregistered redirect_uri → error on Replai, never a redirect to it',
    !loc1.startsWith('https://evil.example'),
    `status ${evilRedirect.status}, location ${loc1.slice(0, 60) || '-'}`
  );
  const plain = await authorize({
    code_challenge_method: 'plain',
    code_challenge: verifier,
  });
  const loc2 = plain.headers.get('location') ?? '';
  check(
    '06§6.9',
    'code_challenge_method=plain → error (no code issued)',
    !/[?&]code=/.test(loc2) && (plain.status >= 400 || /error=/.test(loc2)),
    `status ${plain.status}, ${loc2.slice(0, 80) || '-'}`
  );
  const pw = await tokenEndpoint({
    grant_type: 'password',
    client_id: clientAud.client_id,
    username: 'x',
    password: 'y',
  });
  check(
    'oauth.1',
    'password grant → unsupported_grant_type',
    pw.status === 400 && pw.body?.error === 'unsupported_grant_type'
  );
  const meta = await (
    await fetch(`${ISSUER}/.well-known/oauth-authorization-server`)
  ).json();
  check(
    'oauth.2',
    'metadata: S256 only, code flow only, iss parameter supported',
    JSON.stringify(meta.code_challenge_methods_supported) === '["S256"]' &&
      JSON.stringify(meta.response_types_supported) === '["code"]' &&
      meta.authorization_response_iss_parameter_supported === true
  );
} catch (err) {
  console.error('ERROR', err);
  check('run', 'suite completed', false, err?.message ?? String(err));
} finally {
  // Restore everything that was changed, then remove what was created.
  try {
    if (memberBackup) {
      await db
        .from('profiles')
        .update({
          permissions: memberBackup.permissions,
          is_active: memberBackup.is_active,
        })
        .eq('user_id', memberBackup.userId);
    }
    if (policyBackup) {
      if (policyBackup.existed)
        await db
          .from('ai_workspace_policies')
          .update({
            members_allowed: policyBackup.members_allowed,
            max_member_tier: policyBackup.max_member_tier,
          })
          .eq('account_id', A);
      else await db.from('ai_workspace_policies').delete().eq('account_id', A);
    }
    await new Promise((r) => setTimeout(r, 2500)); // after() audit writes
    if (created.connections.length) {
      await db
        .from('ai_audit_log')
        .delete()
        .in('connection_id', created.connections);
      await db.from('ai_connections').delete().in('id', created.connections);
    }
    if (created.clients.length)
      await db.from('oauth_clients').delete().in('id', created.clients);
    for (const { table, id } of [...created.b].reverse())
      await db.from(table).delete().eq('id', id);
    if (notifyUsers.length)
      await db
        .from('notifications')
        .delete()
        .eq('type', 'ai_connection')
        .in('user_id', notifyUsers)
        .gte('created_at', STARTED);
    const leftover = await db
      .from('ai_connections')
      .select('id', { count: 'exact', head: true })
      .like('label', `security suite ${RUN}`);
    console.log(
      `cleanup: done (leftover connections ${leftover.count ?? '?'})`
    );
  } catch (e) {
    console.error(
      'CLEANUP ERROR — check manually:',
      e?.message ?? e,
      JSON.stringify(created)
    );
  }
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped).length;
  console.log(
    `\n${results.length - failed.length - skipped} passed, ${failed.length} failed, ${skipped} skipped`
  );
  process.exitCode = failed.length ? 1 : 0;
}
