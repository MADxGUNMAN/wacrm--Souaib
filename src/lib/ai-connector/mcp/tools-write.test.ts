import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/subscription/gate-cache', () => ({
  getCachedGateConfig: vi.fn(),
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/services/contact-writes', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/contact-writes')>()),
  assertContactsInAccount: vi.fn(async () => {}),
  resolveTagIds: vi.fn(async () => ['t1']),
  addTagsToContacts: vi.fn(async (_c, ids: string[]) => ({
    added: ids.length,
    already: 0,
    automations_triggered: 0,
  })),
  addContactNote: vi.fn(async () => ({
    id: 'n1',
    created_at: '2026-08-06T00:00:00Z',
  })),
}));
vi.mock('@/lib/services/conversation-writes', () => ({
  updateConversationStatus: vi.fn(async () => ({
    status: 'closed',
    previous: 'open',
    changed: true,
  })),
  assignConversation: vi.fn(),
  markConversationRead: vi.fn(),
}));

import type { ServiceContext } from '@/lib/services/context';
import * as cw from '@/lib/services/contact-writes';
import * as convw from '@/lib/services/conversation-writes';
import type { AuditEntry } from '../audit';
import type { GateContext } from '../gate';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
} from '../settings';
import { TOOL_CATALOG } from '../tool-catalog';
import { buildMcpServer } from './server';

const USER = '2b7a9798-3044-440f-80be-68952f57d708';
const uuid = (n: number) =>
  `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
const SCOPES = [
  'profile',
  'contacts:read',
  'conversations:read',
  'contacts:write',
  'conversations:write',
  'deals:write',
];

function gate(over: Partial<GateContext> = {}): GateContext {
  return {
    connectionId: '44444444-4444-4444-8444-444444444444',
    userId: USER,
    accountId: '3430edae-763b-4aac-9b82-1c2364936d79',
    accountName: 'Acme',
    currency: 'INR',
    userName: 'Owner',
    userEmail: 'o@example.com',
    profileId: 'prf_abc',
    platform: 'claude',
    client: {
      id: 'c',
      display_name: 'Claude',
      platform: 'claude',
      trust: 'trusted',
    },
    scopes: SCOPES as GateContext['scopes'],
    settings: DEFAULT_CONNECTION_SETTINGS,
    policy: DEFAULT_WORKSPACE_POLICY,
    role: 'owner',
    memberPermissions: null,
    account: {
      connectorEnabled: true,
      platformEnabled: true,
      allowlisted: true,
      banned: false,
      subscriptionBlocked: false,
    },
    lastUsedAt: null,
    ...over,
  };
}

const service = {
  db: {},
  userId: USER,
  accountId: 'a',
  actor: { kind: 'ai' },
} as unknown as ServiceContext;
const connection = {
  saveSettings: vi.fn(async () => {}),
  revoke: vi.fn(async () => {}),
  createConfirmation: vi.fn(async () => ({
    id: 'cnf_AAAAAAAAAAAAAAAAAAAAAA',
    expiresAt: new Date('2026-08-06T12:10:00Z'),
  })),
  consumeConfirmation: vi.fn(
    async (): Promise<{ preview: unknown } | null> => ({ preview: {} })
  ),
};
// Phase 7 send ops; these suites never send.
const privileged = {} as never;
const config = {
  issuer: 'https://wacrm.example.com',
  mcpUrl: 'https://wacrm.example.com/mcp',
};

let open: Client | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
  vi.clearAllMocks();
});

async function connect(g: GateContext = gate()) {
  const audits: AuditEntry[] = [];
  const server = buildMcpServer(
    { gate: g, service, config, connection, privileged },
    (e) => audits.push(e)
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
  open = client;
  return { client, audits };
}

const text = (r: Record<string, unknown>) =>
  (r.content as { text: string }[])[0].text;

describe('annotations', () => {
  it('match the catalog so Claude prompts for destructive writes', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    const byName = Object.fromEntries(
      tools.map((t) => [t.name, t.annotations])
    );
    expect(byName.create_contact).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(byName.add_contact_note).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    for (const n of [
      'update_contact',
      'remove_tags_from_contacts',
      'set_custom_field',
      'update_deal',
      'close_deal',
    ]) {
      expect(byName[n]).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
      expect(TOOL_CATALOG[n as keyof typeof TOOL_CATALOG].destructive).toBe(
        true
      );
    }
  });
});

describe('bulk tag changes are two-step above 25 contacts', () => {
  const many = Array.from({ length: 30 }, (_, i) => uuid(i + 1));

  it('small changes run at once', async () => {
    const { client, audits } = await connect();
    const r = await client.callTool({
      name: 'add_tags_to_contacts',
      arguments: { contact_ids: many.slice(0, 3), tag_names: ['VIP'] },
    });
    expect(r.structuredContent).toMatchObject({
      confirmation_required: false,
      changed: 3,
    });
    expect(connection.createConfirmation).not.toHaveBeenCalled();
    expect(audits[0]).toMatchObject({
      outcome: 'ok',
      affectedIds: many.slice(0, 3),
    });
  });

  it('large changes preview first, then run once with the confirmation', async () => {
    const { client, audits } = await connect();
    const first = await client.callTool({
      name: 'add_tags_to_contacts',
      arguments: { contact_ids: many, tag_names: ['VIP'] },
    });
    const out = first.structuredContent as {
      confirmation_required: boolean;
      confirmation_id: string;
      contacts: number;
    };
    expect(out).toMatchObject({ confirmation_required: true, contacts: 30 });
    expect(cw.addTagsToContacts).not.toHaveBeenCalled();
    expect(audits[0].outcome).toBe('confirmation_required');
    // Bound to the exact arguments (without the confirmation id itself).
    expect(connection.createConfirmation).toHaveBeenCalledWith(
      'add_tags_to_contacts',
      { contact_ids: many, tag_names: ['VIP'] },
      expect.anything()
    );

    const second = await client.callTool({
      name: 'add_tags_to_contacts',
      arguments: {
        contact_ids: many,
        tag_names: ['VIP'],
        confirmation_id: out.confirmation_id,
      },
    });
    expect(second.structuredContent).toMatchObject({
      confirmation_required: false,
      changed: 30,
    });
    expect(connection.consumeConfirmation).toHaveBeenCalledWith(
      out.confirmation_id,
      'add_tags_to_contacts',
      {
        contact_ids: many,
        tag_names: ['VIP'],
      }
    );
  });

  it('a used, expired or mismatched confirmation is refused', async () => {
    connection.consumeConfirmation.mockResolvedValueOnce(null);
    const { client } = await connect();
    const r = await client.callTool({
      name: 'remove_tags_from_contacts',
      arguments: {
        contact_ids: many,
        tag_ids: [uuid(99)],
        confirmation_id: 'cnf_AAAAAAAAAAAAAAAAAAAAAA',
      },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('not valid for these exact changes');
  });
});

describe('writes are refused by settings, role and scope', () => {
  it('read-only connection', async () => {
    const { client } = await connect(
      gate({ settings: { ...DEFAULT_CONNECTION_SETTINGS, read_only: true } })
    );
    const r = await client.callTool({
      name: 'add_contact_note',
      arguments: { contact_id: uuid(1), text: 'x' },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('read-only');
    expect(cw.addContactNote).not.toHaveBeenCalled();
  });

  it('"Edit records" switched off', async () => {
    const settings = {
      ...DEFAULT_CONNECTION_SETTINGS,
      groups: { ...DEFAULT_CONNECTION_SETTINGS.groups, edit_records: false },
    };
    const { client } = await connect(gate({ settings }));
    // Still listed, so the refusal can point to the setting.
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('create_contact');
    const r = await client.callTool({
      name: 'update_conversation_status',
      arguments: { conversation_id: uuid(1), status: 'closed' },
    });
    expect(r.isError).toBe(true);
    expect(convw.updateConversationStatus).not.toHaveBeenCalled();
  });

  it('members above the workspace member tier', async () => {
    const { client } = await connect(
      gate({
        role: 'member',
        memberPermissions: {
          inbox: true,
          contacts: true,
        } as GateContext['memberPermissions'],
        policy: { ...DEFAULT_WORKSPACE_POLICY, max_member_tier: 'view' },
      })
    );
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('search_contacts');
    expect(names).not.toContain('add_contact_note');
  });

  it('ChatGPT without contacts:write gets the step-up challenge', async () => {
    const { client } = await connect(
      gate({ platform: 'chatgpt', scopes: ['profile', 'contacts:read'] })
    );
    const r = await client.callTool({
      name: 'add_contact_note',
      arguments: { contact_id: uuid(1), text: 'x' },
    });
    expect(r.isError).toBe(true);
    expect((r._meta?.['mcp/www_authenticate'] as string[])[0]).toContain(
      'contacts:write'
    );
  });
});

describe('input rules', () => {
  it('phones must be E.164 and unknown keys are rejected', async () => {
    const { client } = await connect();
    const bad = await client.callTool({
      name: 'create_contact',
      arguments: { phone: '98765 43210' },
    });
    expect(bad.isError).toBe(true);
    const extra = await client.callTool({
      name: 'update_conversation_status',
      arguments: {
        conversation_id: uuid(1),
        status: 'closed',
        account_id: uuid(2),
      },
    });
    expect(extra.isError).toBe(true);
    expect(convw.updateConversationStatus).not.toHaveBeenCalled();
  });

  it('records affected ids in the audit row', async () => {
    const { client, audits } = await connect();
    await client.callTool({
      name: 'update_conversation_status',
      arguments: { conversation_id: uuid(7), status: 'closed' },
    });
    expect(audits[0]).toMatchObject({
      action: 'update_conversation_status',
      outcome: 'ok',
      affectedIds: [uuid(7)],
    });
  });
});
