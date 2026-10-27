#!/usr/bin/env node
// ============================================================
// Reviewer demo workspace "Replai Demo" for the Claude and ChatGPT
// directory reviews (07 §2.3). Runbook:
// docs/ai-connector/listing/reviewer-demo.md
//
//   node scripts/ai-connector/demo-seed.mjs                 # dry run: plan only
//   node scripts/ai-connector/demo-seed.mjs --apply         # create login + seed
//   node scripts/ai-connector/demo-seed.mjs --refresh       # reopen 24-hour windows
//
// Environment (.env.local via @next/env; the database is shared by dev
// and production, so this IS the production workspace):
//   DEMO_EMAIL         reviewer login, e.g. ai-review@junkiescoder.com (required)
//   DEMO_PASSWORD      optional; generated and printed once when omitted
//   DEMO_TEAM_PHONES   optional, comma-separated digits of TEAM phones that
//                      are allowed recipients of the demo's Meta test number,
//                      e.g. 916359463987. Their conversations are the ones
//                      reviewers can really message.
//   DEMO_TEMPLATES     optional, comma-separated approved template names in
//                      the demo WABA used for the past broadcasts
//                      (default: hello_world)
//
// Every synthetic customer number is in the North American 555-0100…0199
// range, which is reserved for fiction: nobody real can be reached. Sends
// can only succeed to DEMO_TEAM_PHONES anyway once the workspace's
// WhatsApp is a Meta test number.
// ============================================================

import crypto from 'node:crypto';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const E = process.env;
const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const DEMO_NAME = 'Replai Demo';
const EMAIL = (E.DEMO_EMAIL ?? '').trim().toLowerCase();
const TEAM = (E.DEMO_TEAM_PHONES ?? '')
  .split(',')
  .map((p) => p.replace(/\D/g, ''))
  .filter((p) => p.length >= 8);
const TEMPLATES = (E.DEMO_TEMPLATES ?? 'hello_world')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (!EMAIL || !EMAIL.includes('@')) {
  console.error(
    'Set DEMO_EMAIL to the reviewer login (a mailbox the team controls).'
  );
  process.exit(2);
}
const db = createClient(
  E.NEXT_PUBLIC_SUPABASE_URL,
  E.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
const must = async (p, what) => {
  const r = await p;
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// Deterministic randomness so a re-seed looks the same.
let seed = 20261008;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const now = Date.now();
const H = 3_600_000;
const D = 24 * H;
const iso = (t) => new Date(t).toISOString();

// ------------------------------------------------------------
// Find (or plan) the login and its workspace
// ------------------------------------------------------------
async function findUser() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === EMAIL);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function workspaceFor(userId) {
  const prof = await must(
    db
      .from('profiles')
      .select('id, account_id, account_role')
      .eq('user_id', userId)
      .maybeSingle(),
    'profile'
  );
  if (!prof) return null;
  const acc = await must(
    db
      .from('accounts')
      .select('id, name, owner_user_id')
      .eq('id', prof.account_id)
      .single(),
    'account'
  );
  return { profileId: prof.id, role: prof.account_role, account: acc };
}

let user = await findUser();
let ws = user ? await workspaceFor(user.id) : null;
if (ws && (ws.account.name !== DEMO_NAME || ws.role !== 'owner')) {
  console.error(
    `REFUSED: ${EMAIL} already belongs to workspace "${ws.account.name}" (${ws.role}). Use a dedicated reviewer mailbox.`
  );
  process.exit(2);
}
const existingContacts = ws
  ? ((
      await db
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', ws.account.id)
    ).count ?? 0)
  : 0;

console.log(
  `login:     ${EMAIL} — ${user ? 'exists' : 'will be created (email confirmed, no MFA)'}`
);
console.log(
  `workspace: ${ws ? `${ws.account.name} ${ws.account.id}` : `"${DEMO_NAME}" will be created`} — ${existingContacts} contacts`
);
console.log(
  `team phones: ${TEAM.length ? TEAM.join(', ') : 'none (no conversation will accept a real send)'}`
);
console.log(`broadcast templates: ${TEMPLATES.join(', ')}`);

// ------------------------------------------------------------
// --refresh: keep a few 24-hour windows open during the review
// ------------------------------------------------------------
if (REFRESH) {
  if (!ws) throw new Error('No demo workspace yet; run --apply first.');
  const contacts = await must(
    db
      .from('contacts')
      .select('id, name, phone')
      .eq('account_id', ws.account.id)
      .order('created_at')
      .limit(400),
    'contacts'
  );
  const team = contacts.filter((c) =>
    TEAM.some((p) => c.phone.endsWith(p.slice(-10)))
  );
  const targets = [
    ...team,
    ...contacts.filter((c) => /^1(212|415)5550/.test(c.phone)).slice(0, 4),
  ];
  const lines = [
    'Hi, any update on my order?',
    'Can you share the price list again?',
    'Is the demo still on for Friday?',
    'Thanks! Please send the invoice.',
  ];
  for (const [i, c] of targets.entries()) {
    const conv = (
      await must(
        db
          .from('conversations')
          .select('id, unread_count')
          .eq('account_id', ws.account.id)
          .eq('contact_id', c.id)
          .limit(1),
        'conv'
      )
    )[0];
    if (!conv) continue;
    const text = lines[i % lines.length];
    await must(
      db.from('messages').insert({
        conversation_id: conv.id,
        sender_type: 'customer',
        content_type: 'text',
        content_text: text,
        status: 'delivered',
      }),
      'message'
    );
    await must(
      db
        .from('conversations')
        .update({
          status: 'open',
          last_message_text: text,
          last_message_at: iso(Date.now()),
          unread_count: (conv.unread_count ?? 0) + 1,
        })
        .eq('id', conv.id),
      'conv update'
    );
  }
  console.log(
    `refreshed ${targets.length} conversations (reply window open for the next 24 hours)`
  );
  process.exit(0);
}

if (existingContacts > 0) {
  console.log(
    'Workspace is already seeded. Use --refresh to reopen reply windows; reset it from Super admin if you need a clean copy.'
  );
  process.exit(0);
}

// ------------------------------------------------------------
// Data plan
// ------------------------------------------------------------
const FIRST = [
  'Ravi',
  'Priya',
  'Arjun',
  'Ananya',
  'Rohan',
  'Meera',
  'Vikram',
  'Sneha',
  'Kabir',
  'Isha',
  'Aditya',
  'Pooja',
  'Farhan',
  'Neha',
  'Sameer',
  'Kavya',
  'Omar',
  'Lena',
  'Daniel',
  'Sofia',
  'Lucas',
  'Amara',
  'Yusuf',
  'Hana',
  'Mateo',
];
const LAST = [
  'Kumar',
  'Sharma',
  'Patel',
  'Iyer',
  'Khan',
  'Reddy',
  'Mehta',
  'Nair',
  'Gupta',
  'Das',
  'Singh',
  'Joshi',
  'Fernandes',
  'Ali',
  'Silva',
  'Haddad',
  'Novak',
  'Okafor',
];
const COMPANIES = [
  'Sunrise Traders',
  'Blue Lotus Retail',
  'Metro Fabrics',
  'Green Leaf Organics',
  'Urban Nest Interiors',
  'Quickcart',
  'Peak Fitness',
  'Coastal Spices',
  null,
  null,
  null,
];
const CITIES = [
  'Mumbai',
  'Delhi',
  'Bengaluru',
  'Pune',
  'Ahmedabad',
  'Chennai',
  'Hyderabad',
  'Dubai',
  'Nairobi',
];
const PLANS = ['Starter', 'Growth', 'Enterprise'];
const TAGS = [
  ['VIP', '#f59e0b'],
  ['Lead', '#3b82f6'],
  ['Customer', '#10b981'],
  ['Wholesale', '#8b5cf6'],
  ['Newsletter', '#06b6d4'],
  ['Follow-up', '#ef4444'],
];
const contactPlan = [];
for (let i = 0; i < 200; i++) {
  const area = i < 100 ? '212' : '415';
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  contactPlan.push({
    name,
    phone: `1${area}55501${String(i % 100).padStart(2, '0')}`,
    email:
      rnd() < 0.6
        ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com`
        : null,
    company: pick(COMPANIES),
    city: pick(CITIES),
    plan: rnd() < 0.5 ? pick(PLANS) : null,
    tags: TAGS.filter(() => rnd() < 0.22).map(([t]) => t),
    created: now - int(2, 120) * D,
  });
}
TEAM.forEach((p, i) =>
  contactPlan.unshift({
    name: `Demo Team ${i + 1}`,
    phone: p,
    email: null,
    company: 'Replai test',
    city: 'Mumbai',
    plan: null,
    tags: ['Customer'],
    created: now - 30 * D,
    team: true,
  })
);

console.log(
  `plan: ${contactPlan.length} contacts, 6 tags, 2 custom fields, ~30 notes, 40 conversations, 2 pipelines / ~20 deals, ${Math.min(3, TEMPLATES.length * 3)} past broadcasts, 3 automations, 1 flow, 2 opt-outs, AI policy (broadcasts on, cap 20)`
);
if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to create it.');
  process.exit(0);
}

// ------------------------------------------------------------
// Apply
// ------------------------------------------------------------
let password = null;
if (!user) {
  password =
    E.DEMO_PASSWORD || `${crypto.randomBytes(12).toString('base64url')}-Rp7`;
  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Replai Reviewer' },
  });
  if (error) throw error;
  user = data.user;
}
for (let i = 0; i < 10 && !ws; i++) {
  ws = await workspaceFor(user.id);
  if (!ws) await new Promise((r) => setTimeout(r, 500));
}
if (!ws) {
  await must(
    db.rpc('bootstrap_user_account', {
      p_user_id: user.id,
      p_email: EMAIL,
      p_full_name: 'Replai Reviewer',
    }),
    'bootstrap'
  );
  ws = await workspaceFor(user.id);
}
const A = ws.account.id;
const U = user.id;
const PROFILE = ws.profileId;

await must(
  db
    .from('accounts')
    .update({
      name: DEMO_NAME,
      default_currency: 'INR',
      subscription_status: 'active',
      subscription_plan_name: 'Reviewer demo',
      subscription_started_at: iso(now),
      subscription_ends_at: iso(now + 180 * D),
      subscription_note:
        'AI connector directory reviewer workspace (Claude / ChatGPT). Do not bill.',
      plan_selection_required: false,
      auto_email_opted_out: true,
    })
    .eq('id', A),
  'account'
);
await must(
  db.from('profiles').update({ full_name: 'Replai Reviewer' }).eq('user_id', U),
  'profile name'
);
await must(
  db.from('ai_workspace_policies').upsert({
    account_id: A,
    enabled: true,
    members_allowed: false,
    allow_messaging: true,
    allow_broadcasts: true,
    allow_automation_changes: true,
    daily_message_cap: 50,
    daily_broadcast_recipient_cap: 20,
    require_preview_for_sends: false,
    updated_by: U,
  }),
  'policy'
);

const insertMany = async (table, rows, cols = 'id') => {
  const out = [];
  for (let i = 0; i < rows.length; i += 200)
    out.push(
      ...(await must(
        db
          .from(table)
          .insert(rows.slice(i, i + 200))
          .select(cols),
        table
      ))
    );
  return out;
};

const tags = await insertMany(
  'tags',
  TAGS.map(([name, color]) => ({ account_id: A, user_id: U, name, color })),
  'id, name'
);
const tagId = Object.fromEntries(tags.map((t) => [t.name, t.id]));
const [fCity, fPlan] = await insertMany('custom_fields', [
  { account_id: A, user_id: U, field_name: 'City', field_type: 'text' },
  {
    account_id: A,
    user_id: U,
    field_name: 'Plan interest',
    field_type: 'text',
  },
]);
const contacts = await insertMany(
  'contacts',
  contactPlan.map((c) => ({
    account_id: A,
    user_id: U,
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    source: c.team ? 'manual' : pick(['manual', 'import', 'whatsapp']),
    created_at: iso(c.created),
  })),
  'id, phone'
);
const byPhone = new Map(contacts.map((c) => [c.phone, c.id]));
const plan = contactPlan.map((c) => ({ ...c, id: byPhone.get(c.phone) }));
await insertMany(
  'contact_tags',
  plan.flatMap((c) =>
    c.tags.map((t) => ({ contact_id: c.id, tag_id: tagId[t] }))
  )
);
await insertMany(
  'contact_custom_values',
  plan.flatMap((c) => [
    { contact_id: c.id, custom_field_id: fCity.id, value: c.city },
    ...(c.plan
      ? [{ contact_id: c.id, custom_field_id: fPlan.id, value: c.plan }]
      : []),
  ])
);
const NOTES = [
  'Called — wants a demo on Friday.',
  'Asked for bulk pricing for 50 units.',
  'Prefers WhatsApp over email.',
  'Paid the last invoice late; send a reminder before the due date.',
  'Interested in the Growth plan; follow up next week.',
  'Referred by Priya.',
];
await insertMany(
  'contact_notes',
  plan.slice(0, 30).map((c, i) => ({
    account_id: A,
    user_id: U,
    contact_id: c.id,
    note_text: NOTES[i % NOTES.length],
    created_at: iso(now - int(1, 20) * D),
  }))
);

// Conversations: team contacts first (reply window open), then synthetic.
const SCRIPTS = [
  [
    'Hi, is the blue kurta available in size M?',
    'Yes, it is in stock. Shall I reserve one for you?',
    'Yes please, and what is the delivery time?',
    'Usually 2–3 days within the city.',
  ],
  [
    'Can you send me your price list?',
    'Sure — sharing the latest catalogue now.',
    'Thanks. Do you offer a discount for 50 units?',
  ],
  [
    'My order ORD-5074 hasn’t arrived yet.',
    'Sorry about that! Let me check with the courier.',
    'Any update?',
  ],
  [
    'Please send the invoice for last month.',
    'Done — you should have it now.',
    'Got it, thanks!',
  ],
  ['Do you ship to Dubai?', 'Yes, international shipping takes 5–7 days.'],
  [
    'I’d like to book a demo of the Growth plan.',
    'Happy to! Does Friday 11 am work?',
    'Friday works.',
  ],
];
const convPlan = plan.slice(0, 40).map((c, i) => {
  const windowOpen = c.team || i < TEAM.length + 4;
  const status = windowOpen
    ? 'open'
    : pick(['open', 'open', 'pending', 'closed']);
  const lastAt = windowOpen ? now - int(1, 8) * H : now - int(2, 14) * D;
  return {
    contact: c,
    status,
    lastAt,
    script: SCRIPTS[i % SCRIPTS.length],
    unread: status === 'open' && rnd() < 0.5 ? int(1, 3) : 0,
    assigned: rnd() < 0.3 ? U : null,
  };
});
const convs = await insertMany(
  'conversations',
  convPlan.map((v) => ({
    account_id: A,
    user_id: U,
    contact_id: v.contact.id,
    status: v.status,
    unread_count: v.unread,
    assigned_agent_id: v.assigned,
    last_message_text: v.script[v.script.length - 1],
    last_message_at: iso(v.lastAt),
    created_at: iso(v.lastAt - 3 * D),
  })),
  'id, contact_id'
);
const convByContact = new Map(convs.map((c) => [c.contact_id, c.id]));
const messages = [];
for (const v of convPlan) {
  const n = v.script.length;
  // The LAST line is always the customer's, so open windows really are open.
  v.script.forEach((text, k) => {
    const fromCustomer = (n - 1 - k) % 2 === 0;
    messages.push({
      conversation_id: convByContact.get(v.contact.id),
      sender_type: fromCustomer ? 'customer' : 'agent',
      sender_id: fromCustomer ? null : U,
      content_type: 'text',
      content_text: text,
      status: fromCustomer ? 'delivered' : 'read',
      created_at: iso(v.lastAt - (n - 1 - k) * 20 * 60_000),
    });
  });
}
await insertMany('messages', messages);

// Pipelines and deals.
const [pSales, pWholesale] = await insertMany('pipelines', [
  { account_id: A, user_id: U, name: 'Sales' },
  { account_id: A, user_id: U, name: 'Wholesale' },
]);
const stages = await insertMany(
  'pipeline_stages',
  [
    ...['New lead', 'Qualified', 'Proposal', 'Negotiation'].map(
      (name, position) => ({ pipeline_id: pSales.id, name, position })
    ),
    ...['Enquiry', 'Sample sent', 'Order'].map((name, position) => ({
      pipeline_id: pWholesale.id,
      name,
      position,
    })),
  ],
  'id, pipeline_id, name'
);
const DEALS = [
  'Annual plan',
  'Bulk order',
  'Store fit-out',
  'Catalogue print',
  'Festive collection',
  'Office uniforms',
  'Spice export',
  'Gym membership drive',
];
await insertMany(
  'deals',
  Array.from({ length: 20 }, (_, i) => {
    const st = stages[i % stages.length];
    const status = i < 14 ? 'open' : i < 17 ? 'won' : 'lost';
    return {
      account_id: A,
      user_id: U,
      pipeline_id: st.pipeline_id,
      stage_id: st.id,
      contact_id: plan[i + TEAM.length].id,
      title: `${DEALS[i % DEALS.length]} — ${plan[i + TEAM.length].name}`,
      value: int(5, 250) * 1000,
      currency: 'INR',
      status,
      expected_close_date: iso(now + int(-10, 45) * D).slice(0, 10),
      assigned_to: rnd() < 0.6 ? PROFILE : null,
      notes: rnd() < 0.4 ? 'Discussed pricing on WhatsApp.' : null,
    };
  })
);

// Two marketing opt-outs so a broadcast preview shows skipped contacts.
await insertMany(
  'marketing_opt_outs',
  plan.slice(-2).map((c) => ({
    account_id: A,
    phone_normalized: c.phone,
    contact_id: c.id,
    source: 'customer_keyword',
  }))
);

// Past broadcasts; per-recipient rows drive the trigger-owned counts.
const BNAMES = ['Diwali offer', 'New arrivals', 'Payment reminder'];
for (let b = 0; b < 3; b++) {
  const sentAt = now - (b * 9 + 3) * D;
  const audience = plan.slice(
    TEAM.length + 40 + b * 25,
    TEAM.length + 65 + b * 25
  );
  const bc = (
    await insertMany('broadcasts', [
      {
        account_id: A,
        user_id: U,
        name: BNAMES[b],
        template_name: TEMPLATES[b % TEMPLATES.length],
        template_language: 'en_US',
        status: 'sent',
        total_recipients: audience.length,
        created_at: iso(sentAt),
        updated_at: iso(sentAt + H),
      },
    ])
  )[0];
  await insertMany(
    'broadcast_recipients',
    audience.map((c, k) => {
      const s =
        k < 2
          ? 'failed'
          : k < 6
            ? 'sent'
            : k < 13
              ? 'delivered'
              : k < 21
                ? 'read'
                : 'replied';
      return {
        broadcast_id: bc.id,
        contact_id: c.id,
        status: s,
        sent_at: s === 'failed' ? null : iso(sentAt),
        delivered_at: ['delivered', 'read', 'replied'].includes(s)
          ? iso(sentAt + 60_000)
          : null,
        read_at: ['read', 'replied'].includes(s)
          ? iso(sentAt + 30 * 60_000)
          : null,
        replied_at: s === 'replied' ? iso(sentAt + 2 * H) : null,
        error_code: s === 'failed' ? '131026' : null,
        error_message: s === 'failed' ? 'Message undeliverable' : null,
      };
    })
  );
}

// Automations (valid configs, so reviewers can switch them on and off).
const autos = await insertMany('automations', [
  {
    account_id: A,
    user_id: U,
    name: 'Welcome new customers',
    description: 'Greets someone the first time they write.',
    trigger_type: 'first_inbound_message',
    trigger_config: {},
    is_active: true,
  },
  {
    account_id: A,
    user_id: U,
    name: 'Tag price enquiries',
    description: 'Tags anyone who asks about price as a Lead.',
    trigger_type: 'keyword_match',
    trigger_config: { keywords: ['price', 'quote'], match_type: 'contains' },
    is_active: false,
  },
  {
    account_id: A,
    user_id: U,
    name: 'VIP follow-up',
    description: 'One day after a contact is tagged VIP, sends a thank-you.',
    trigger_type: 'tag_added',
    trigger_config: { tag_id: tagId.VIP },
    is_active: false,
  },
]);
await insertMany('automation_steps', [
  {
    automation_id: autos[0].id,
    step_type: 'send_message',
    step_config: {
      text: 'Hi! Thanks for contacting Replai Demo. A teammate will reply shortly.',
    },
    position: 0,
  },
  {
    automation_id: autos[1].id,
    step_type: 'add_tag',
    step_config: { tag_id: tagId.Lead },
    position: 0,
  },
  {
    automation_id: autos[2].id,
    step_type: 'wait',
    step_config: { amount: 1, unit: 'days' },
    position: 0,
  },
  {
    automation_id: autos[2].id,
    step_type: 'send_message',
    step_config: {
      text: 'Thank you for being a VIP customer! Reply here any time.',
    },
    position: 1,
  },
]);

// One draft flow that passes activation checks.
const flow = (
  await insertMany('flows', [
    {
      account_id: A,
      user_id: U,
      name: 'Pricing enquiry',
      description: 'Answers "pricing" and hands over to the team.',
      status: 'draft',
      trigger_type: 'keyword',
      trigger_config: {
        keywords: ['pricing'],
        match_type: 'exact',
        case_sensitive: false,
      },
      entry_node_id: 'start',
    },
  ])
)[0];
await insertMany('flow_nodes', [
  {
    flow_id: flow.id,
    node_key: 'start',
    node_type: 'start',
    config: { next_node_key: 'reply' },
    position_x: 0,
    position_y: 0,
  },
  {
    flow_id: flow.id,
    node_key: 'reply',
    node_type: 'send_message',
    config: {
      text: 'Our plans start at ₹999/month. A teammate will share details.',
      next_node_key: 'to_agent',
    },
    position_x: 0,
    position_y: 150,
  },
  {
    flow_id: flow.id,
    node_key: 'to_agent',
    node_type: 'handoff',
    config: { note: 'Pricing enquiry from the flow.' },
    position_x: 0,
    position_y: 300,
  },
]);

console.log(`\nSeeded workspace ${A}`);
console.log(
  `  ${contacts.length} contacts, ${convs.length} conversations, ${messages.length} messages, 20 deals, 3 broadcasts, 3 automations, 1 flow`
);
if (password) {
  console.log(
    '\nReviewer login (store it in the password manager now; it is not shown again):'
  );
  console.log(`  email:    ${EMAIL}\n  password: ${password}`);
}
console.log(
  `\nNext: connect the demo WhatsApp test number and sync templates (and add ${A} to AI_CONNECTOR_ALLOWED_ACCOUNTS if an allowlist is set).`
);
