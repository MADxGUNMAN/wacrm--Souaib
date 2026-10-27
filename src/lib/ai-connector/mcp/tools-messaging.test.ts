import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/subscription/gate-cache', () => ({
  getCachedGateConfig: vi.fn(),
}));
vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/automations/steps-tree', () => ({ loadStepsTree: vi.fn() }));
vi.mock('@/lib/services/messaging', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/messaging')>()),
  prepareTextMessage: vi.fn(async () => ({
    conversationId: CONV,
    contactId: CONTACT,
    text: 'Hello',
    window: { open: true, closesAt: null, lastCustomerMessageAt: null },
  })),
  executeTextMessage: vi.fn(async () => ({
    messageId: MSG,
    whatsappMessageId: 'wamid.X',
  })),
}));
vi.mock('@/lib/services/broadcast-ai', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/broadcast-ai')>()),
  previewBroadcast: vi.fn(async () => ({
    stored: {
      fill: { templateName: 't', language: 'en_US' },
      contact_ids: [CONTACT],
      schedule_at: null,
      name: null,
    },
    audience: 1,
    opted_out: 0,
    will_send: 1,
    template: { name: 't', language: 'en_US', category: 'UTILITY' },
    sample_text: 'Hi',
    schedule_at: null,
  })),
  sendBroadcast: vi.fn(async () => ({
    broadcastId: BCAST,
    recipients: 1,
    skipped: 0,
    scheduledAt: null,
    templateName: 't',
  })),
}));

import * as bai from '@/lib/services/broadcast-ai';
import type { ServiceContext } from '@/lib/services/context';
import * as msg from '@/lib/services/messaging';
import type { AuditEntry } from '../audit';
import type { GateContext } from '../gate';
import {
  DEFAULT_CONNECTION_SETTINGS,
  DEFAULT_WORKSPACE_POLICY,
} from '../settings';
import { buildMcpServer } from './server';

const USER = '2b7a9798-3044-440f-80be-68952f57d708';
const CONV = '00000000-0000-4000-9000-000000000001';
const CONTACT = '00000000-0000-4000-9000-000000000002';
const MSG = '00000000-0000-4000-9000-000000000003';
const BCAST = '00000000-0000-4000-9000-000000000004';
const CNF = 'cnf_AAAAAAAAAAAAAAAAAAAAAA';

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
    scopes: [
      'profile',
      'messages:send',
      'broadcasts:send',
      'automations:manage',
    ] as GateContext['scopes'],
    settings: {
      ...DEFAULT_CONNECTION_SETTINGS,
      groups: {
        ...DEFAULT_CONNECTION_SETTINGS.groups,
        broadcasts: true,
        automations: true,
      },
    },
    policy: {
      ...DEFAULT_WORKSPACE_POLICY,
      allow_broadcasts: true,
      allow_automation_changes: true,
      max_member_tier: 'send',
    },
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
    id: CNF,
    expiresAt: new Date('2026-08-06T12:10:00Z'),
  })),
  consumeConfirmation: vi.fn(
    async (): Promise<{ preview: unknown } | null> => ({
      preview: { stored: true },
    })
  ),
};
const privileged = { caps: {} } as never;
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

describe('listing and annotations', () => {
  it('send and broadcast tools are destructive + open-world', async () => {
    const { client } = await connect();
    const tools = Object.fromEntries(
      (await client.listTools()).tools.map((t) => [t.name, t.annotations])
    );
    for (const n of [
      'send_text_message',
      'send_template_message',
      'send_broadcast',
    ]) {
      expect(tools[n]).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    }
    expect(tools.preview_broadcast).toMatchObject({ destructiveHint: false });
  });

  it('broadcast and automation tools are refused while their switch is off', async () => {
    const { client } = await connect(
      gate({ settings: DEFAULT_CONNECTION_SETTINGS })
    );
    const r = await client.callTool({
      name: 'preview_broadcast',
      arguments: { template_name: 't', contact_ids: [CONTACT] },
    });
    expect(r.isError).toBe(true);
    expect(bai.previewBroadcast).not.toHaveBeenCalled();
  });
});

describe('send_text_message', () => {
  it('sends at once by default and records the message id', async () => {
    const { client, audits } = await connect();
    const r = await client.callTool({
      name: 'send_text_message',
      arguments: { conversation_id: CONV, text: 'Hello' },
    });
    expect(r.structuredContent).toMatchObject({ sent: true, message_id: MSG });
    expect(audits[0]).toMatchObject({
      outcome: 'ok',
      affectedIds: [CONV, MSG],
    });
    expect(connection.createConfirmation).not.toHaveBeenCalled();
  });

  it('is two-step when the workspace requires a preview for sends', async () => {
    const g = gate({
      policy: { ...gate().policy, require_preview_for_sends: true },
    });
    const { client, audits } = await connect(g);
    const first = await client.callTool({
      name: 'send_text_message',
      arguments: { conversation_id: CONV, text: 'Hello' },
    });
    expect(first.structuredContent).toMatchObject({
      confirmation_required: true,
      confirmation_id: CNF,
      sent: false,
      preview_text: 'Hello',
    });
    expect(msg.executeTextMessage).not.toHaveBeenCalled();
    expect(audits[0].outcome).toBe('confirmation_required');

    const second = await client.callTool({
      name: 'send_text_message',
      arguments: { conversation_id: CONV, text: 'Hello', confirmation_id: CNF },
    });
    expect(second.structuredContent).toMatchObject({ sent: true });
    expect(connection.consumeConfirmation).toHaveBeenCalledWith(
      CNF,
      'send_text_message',
      { conversation_id: CONV, text: 'Hello' }
    );
  });

  it('a used or mismatched confirmation sends nothing', async () => {
    connection.consumeConfirmation.mockResolvedValueOnce(null);
    const g = gate({
      policy: { ...gate().policy, require_preview_for_sends: true },
    });
    const { client } = await connect(g);
    const r = await client.callTool({
      name: 'send_text_message',
      arguments: { conversation_id: CONV, text: 'Hello', confirmation_id: CNF },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not valid for this exact message/);
    expect(msg.executeTextMessage).not.toHaveBeenCalled();
  });
});

describe('send_template_message', () => {
  it('needs exactly one recipient', async () => {
    const { client } = await connect();
    const r = await client.callTool({
      name: 'send_template_message',
      arguments: {
        template_name: 't',
        conversation_id: CONV,
        to_phone: '+919812345678',
      },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/exactly one recipient/);
  });
});

describe('broadcasts are always two-step', () => {
  it('preview stores a confirmation bound to send_broadcast with no other args', async () => {
    const { client } = await connect();
    const r = await client.callTool({
      name: 'preview_broadcast',
      arguments: { template_name: 't', contact_ids: [CONTACT] },
    });
    expect(r.structuredContent).toMatchObject({
      confirmation_required: true,
      confirmation_id: CNF,
      will_send: 1,
    });
    expect(connection.createConfirmation).toHaveBeenCalledWith(
      'send_broadcast',
      {},
      expect.objectContaining({ contact_ids: [CONTACT] })
    );
    expect(bai.sendBroadcast).not.toHaveBeenCalled();
  });

  it('send_broadcast acts only on the stored preview', async () => {
    const { client, audits } = await connect();
    const r = await client.callTool({
      name: 'send_broadcast',
      arguments: { confirmation_id: CNF },
    });
    expect(r.structuredContent).toMatchObject({
      broadcast_id: BCAST,
      status: 'scheduled',
    });
    expect(bai.sendBroadcast).toHaveBeenCalledWith(
      service,
      privileged,
      { stored: true },
      expect.any(Date)
    );
    expect(audits[0]).toMatchObject({ outcome: 'ok', affectedIds: [BCAST] });
  });

  it('a reused, expired or foreign confirmation sends nothing', async () => {
    connection.consumeConfirmation.mockResolvedValueOnce(null);
    const { client } = await connect();
    const r = await client.callTool({
      name: 'send_broadcast',
      arguments: { confirmation_id: CNF },
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Call preview_broadcast again/);
    expect(bai.sendBroadcast).not.toHaveBeenCalled();
  });
});
