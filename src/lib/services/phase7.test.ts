import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./templates', async (orig) => ({
  ...(await orig<typeof import('./templates')>()),
  getTemplate: vi.fn(),
}));
vi.mock('./contact-writes', async (orig) => ({
  ...(await orig<typeof import('./contact-writes')>()),
  createContact: vi.fn(),
}));
vi.mock('@/lib/automations/steps-tree', () => ({
  loadStepsTree: vi.fn(async () => []),
}));

import { loadStepsTree } from '@/lib/automations/steps-tree';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import { setAutomationActive, setFlowStatus } from './automation-writes';
import {
  cancelScheduledBroadcast,
  previewBroadcast,
  sendBroadcast,
} from './broadcast-ai';
import * as cw from './contact-writes';
import { ServiceError, type ServiceContext } from './context';
import { fakeDb, type FakeDb } from './fake-db.test-helper';
import {
  executeTemplateMessage,
  executeTextMessage,
  prepareTemplateMessage,
  prepareTextMessage,
} from './messaging';
import type { TemplateFill } from './messaging';
import type { PrivilegedOps } from './privileged';
import * as templates from './templates';
import type { TemplateDetail, TemplateRequirements } from './templates';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const id = (n: number) =>
  `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

const CA = id(1);
const CA2 = id(2);
const CB = id(3);
const CONV_A = id(4);
const CONV_B = id(5);
const NOW = new Date('2026-08-06T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;

let db: FakeDb;
let ctx: ServiceContext;
let ops: PrivilegedOps & {
  sendMessage: ReturnType<typeof vi.fn>;
  reserve: ReturnType<typeof vi.fn>;
  createBroadcast: ReturnType<typeof vi.fn>;
};

function template(
  over: Partial<TemplateDetail> = {},
  req: Partial<TemplateRequirements> = {}
): TemplateDetail {
  return {
    id: id(90),
    name: 'delivery_confirmation',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    requirements: {
      parameter_format: 'POSITIONAL',
      body_variables: { count: 2, names: [] },
      header: { type: 'none', needs_value: false },
      url_buttons_needing_suffix: [],
      special_type: null,
      ...req,
    },
    header_text: null,
    body_text: 'Hi {{1}}, order {{2}} is on its way.',
    footer_text: null,
    buttons: [],
    rejection_reason: null,
    quality_score: null,
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb({
    contacts: [
      { id: CA, account_id: A, phone: '916359463987', name: 'Souaib' },
      { id: CA2, account_id: A, phone: '919999900001', name: 'Second' },
      { id: CB, account_id: B, phone: '919999900002', name: 'Other ws' },
    ],
    conversations: [
      { id: CONV_A, account_id: A, contact_id: CA, created_at: ago(HOUR) },
      { id: CONV_B, account_id: B, contact_id: CB, created_at: ago(HOUR) },
    ],
    messages: [
      {
        id: id(20),
        conversation_id: CONV_A,
        sender_type: 'customer',
        content_text: 'hello',
        created_at: ago(HOUR),
      },
    ],
    marketing_opt_outs: [],
    broadcasts: [],
    automations: [],
    flows: [],
    flow_nodes: [],
  });
  ctx = {
    db: db.client,
    userId: ME,
    accountId: A,
    actor: { kind: 'ai', connectionId: id(99), platform: 'claude' },
  };
  ops = {
    caps: {
      connectionMessagesPerDay: 100,
      accountMessagesPerDay: 300,
      accountBroadcastRecipientsPerDay: 500,
      timezone: 'Asia/Kolkata',
    },
    sendMessage: vi.fn(async () => ({
      messageId: id(50),
      whatsappMessageId: 'wamid.X',
    })),
    reserve: vi.fn(async () => ({
      allowed: true,
      connectionMessages: 1,
      accountMessages: 1,
      accountRecipients: 0,
    })),
    createBroadcast: vi.fn(async (p: { recipients: unknown[] }) => ({
      broadcastId: id(60),
      recipients: p.recipients.length,
      suppressed: 0,
      rejected: 0,
      mode: 'schedule' as const,
    })),
  };
  vi.mocked(templates.getTemplate).mockResolvedValue(template());
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ServiceError ? `${e.code}: ${e.message}` : String(e);
  }
  return 'ok';
};

// ------------------------------------------------------------
describe('send_text_message', () => {
  it('sends inside the 24-hour window, reserving the cap first', async () => {
    const p = await prepareTextMessage(
      ctx,
      { conversationId: CONV_A, text: ' Your order shipped ' },
      NOW
    );
    expect(p.window.open).toBe(true);
    const r = await executeTextMessage(ops, p);
    expect(r.messageId).toBe(id(50));
    expect(ops.reserve).toHaveBeenCalledWith({ messages: 1 });
    expect(ops.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_A,
        messageType: 'text',
        contentText: 'Your order shipped',
      })
    );
    expect(ops.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      ops.sendMessage.mock.invocationCallOrder[0]
    );
  });

  it('refuses free text when the window has closed', async () => {
    db.tables.messages[0].created_at = ago(25 * HOUR);
    expect(
      await code(
        prepareTextMessage(ctx, { conversationId: CONV_A, text: 'hi' }, NOW)
      )
    ).toMatch(
      /invalid_input: The 24-hour reply window closed.*send_template_message/
    );
  });

  it('refuses free text when the customer never wrote', async () => {
    db.tables.messages = [];
    expect(
      await code(
        prepareTextMessage(ctx, { conversationId: CONV_A, text: 'hi' }, NOW)
      )
    ).toMatch(/never written.*send_template_message/);
  });

  it("another workspace's conversation is not found", async () => {
    expect(
      await code(
        prepareTextMessage(ctx, { conversationId: CONV_B, text: 'hi' }, NOW)
      )
    ).toBe('not_found: Conversation not found');
  });

  it('refuses the same AI text within 2 minutes, but not a failed one or an older one', async () => {
    const aiMsg = (createdAt: string, status = 'sent') => ({
      id: id(Math.floor(Math.random() * 1e6)),
      conversation_id: CONV_A,
      sender_type: 'agent',
      content_text: 'Same text',
      template_name: null,
      status,
      via_ai: { platform: 'claude', connection_id: id(99) },
      created_at: createdAt,
    });
    db.tables.messages.push(aiMsg(ago(60_000)));
    expect(
      await code(
        prepareTextMessage(
          ctx,
          { conversationId: CONV_A, text: 'Same text' },
          NOW
        )
      )
    ).toMatch(/less than 2 minutes ago/);

    db.tables.messages.pop();
    db.tables.messages.push(
      aiMsg(ago(60_000), 'failed'),
      aiMsg(ago(3 * 60_000))
    );
    expect(
      await code(
        prepareTextMessage(
          ctx,
          { conversationId: CONV_A, text: 'Same text' },
          NOW
        )
      )
    ).toBe('ok');
  });

  it('a human message with the same text is not a duplicate', async () => {
    db.tables.messages.push({
      id: id(30),
      conversation_id: CONV_A,
      sender_type: 'agent',
      content_text: 'Same text',
      status: 'sent',
      via_ai: null,
      created_at: ago(30_000),
    });
    expect(
      await code(
        prepareTextMessage(
          ctx,
          { conversationId: CONV_A, text: 'Same text' },
          NOW
        )
      )
    ).toBe('ok');
  });

  it('stops at the daily cap without sending', async () => {
    ops.reserve.mockResolvedValueOnce({
      allowed: false,
      connectionMessages: 100,
      accountMessages: 100,
      accountRecipients: 0,
    });
    const p = await prepareTextMessage(
      ctx,
      { conversationId: CONV_A, text: 'hi' },
      NOW
    );
    expect(await code(executeTextMessage(ops, p))).toMatch(
      /daily limit of 100 AI-sent messages for this connection.*00:00 \(Asia\/Kolkata\)/
    );
    expect(ops.sendMessage).not.toHaveBeenCalled();
  });

  it('reports the workspace cap when that is the one reached', async () => {
    ops.reserve.mockResolvedValueOnce({
      allowed: false,
      connectionMessages: 3,
      accountMessages: 300,
      accountRecipients: 0,
    });
    const p = await prepareTextMessage(
      ctx,
      { conversationId: CONV_A, text: 'hi' },
      NOW
    );
    expect(await code(executeTextMessage(ops, p))).toMatch(
      /workspace's daily limit of 300/
    );
  });

  it('turns a Meta rejection into an actionable error', async () => {
    ops.sendMessage.mockRejectedValueOnce(
      new SendMessageError(
        'meta_error',
        'Meta API error: Re-engagement message.',
        502
      )
    );
    const p = await prepareTextMessage(
      ctx,
      { conversationId: CONV_A, text: 'hi' },
      NOW
    );
    expect(await code(executeTextMessage(ops, p))).toBe(
      'invalid_input: Meta API error: Re-engagement message'
    );
  });
});

// ------------------------------------------------------------
describe('send_template_message', () => {
  const fill: TemplateFill = {
    templateName: 'delivery_confirmation',
    bodyVariables: ['Souaib', 'A-1'],
  };
  const prep = (
    target: Parameters<typeof prepareTemplateMessage>[1],
    f = fill,
    allowNewNumbers = false
  ) => prepareTemplateMessage(ctx, target, f, { allowNewNumbers, now: NOW });

  it('sends to a conversation with the variables filled in', async () => {
    const p = await prep({ conversationId: CONV_A });
    expect(p.fill.renderedText).toBe('Hi Souaib, order A-1 is on its way.');
    const r = await executeTemplateMessage(ctx, ops, p);
    expect(r.conversationId).toBe(CONV_A);
    expect(ops.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'template',
        templateName: 'delivery_confirmation',
        templateLanguage: 'en_US',
        templateParams: ['Souaib', 'A-1'],
        templateMessageParams: { body: ['Souaib', 'A-1'] },
        contentText: 'Hi Souaib, order A-1 is on its way.',
      })
    );
  });

  it('works outside the 24-hour window', async () => {
    db.tables.messages = [];
    expect(await code(prep({ conversationId: CONV_A }))).toBe('ok');
  });

  it('requires exactly the declared variables', async () => {
    expect(
      await code(
        prep({ conversationId: CONV_A }, { ...fill, bodyVariables: ['x'] })
      )
    ).toMatch(/needs exactly 2 body variables, got 1/);
    expect(
      await code(
        prep(
          { conversationId: CONV_A },
          { ...fill, bodyVariables: ['a', 'line\nbreak'] }
        )
      )
    ).toMatch(/can't contain line breaks/);
  });

  it('checks named variables by name', async () => {
    vi.mocked(templates.getTemplate).mockResolvedValue(
      template(
        { body_text: 'Hi {{first_name}}' },
        {
          parameter_format: 'NAMED',
          body_variables: { count: 1, names: ['first_name'] },
        }
      )
    );
    expect(
      await code(
        prep({ conversationId: CONV_A }, { ...fill, bodyVariables: {} })
      )
    ).toMatch(/needs body variables first_name/);
    const p = await prep(
      { conversationId: CONV_A },
      { ...fill, bodyVariables: { first_name: 'Souaib' } }
    );
    expect(p.fill.messageParams).toEqual({
      namedBody: { first_name: 'Souaib' },
    });
    expect(p.fill.renderedText).toBe('Hi Souaib');
  });

  it('refuses templates that are not approved or of a special type', async () => {
    vi.mocked(templates.getTemplate).mockResolvedValueOnce(
      template({ status: 'PAUSED' })
    );
    expect(await code(prep({ conversationId: CONV_A }))).toMatch(
      /is PAUSED; only APPROVED/
    );
    vi.mocked(templates.getTemplate).mockResolvedValueOnce(
      template({}, { special_type: 'carousel' })
    );
    expect(await code(prep({ conversationId: CONV_A }))).toMatch(
      /carousel template/
    );
  });

  it('needs an https media URL and a header value when the template asks', async () => {
    vi.mocked(templates.getTemplate).mockResolvedValue(
      template({}, { header: { type: 'image', needs_value: false } })
    );
    expect(
      await code(
        prep(
          { conversationId: CONV_A },
          { ...fill, headerMediaUrl: 'http://x.test/a.png' }
        )
      )
    ).toMatch(/must be an https URL/);
    vi.mocked(templates.getTemplate).mockResolvedValue(
      template({}, { header: { type: 'text', needs_value: true } })
    );
    expect(await code(prep({ conversationId: CONV_A }))).toMatch(
      /needs header_text/
    );
  });

  it('a new number is refused unless "send to new numbers" is on', async () => {
    expect(await code(prep({ toPhone: '+919812345678' }))).toMatch(
      /not a contact.*send to new numbers is off|sending to new numbers is off/
    );
    expect(cw.createContact).not.toHaveBeenCalled();
  });

  it('with the switch on, a new number becomes a contact and conversation', async () => {
    vi.mocked(cw.createContact).mockImplementation(async () => {
      db.tables.contacts.push({
        id: id(70),
        account_id: A,
        phone: '919812345678',
      });
      return {
        contact: { id: id(70) } as never,
        created: true,
        tags_added: 0,
      };
    });
    const p = await prep({ toPhone: '+919812345678' }, fill, true);
    expect(p.newPhone).toBe('919812345678');
    const r = await executeTemplateMessage(ctx, ops, p);
    expect(cw.createContact).toHaveBeenCalledWith(ctx, {
      phone: '+919812345678',
    });
    expect(r.contactCreated).toBe(true);
    expect(
      db.tables.conversations.find((c) => c.contact_id === id(70))
    ).toMatchObject({ account_id: A, user_id: ME });
  });

  it('a known number goes to its existing contact', async () => {
    const p = await prep({ toPhone: '+916359463987' });
    expect(p).toMatchObject({
      contactId: CA,
      conversationId: CONV_A,
      newPhone: null,
    });
  });

  it("another workspace's contact is not found", async () => {
    expect(await code(prep({ contactId: CB }))).toBe(
      'not_found: Contact not found'
    );
  });

  it('an opted-out recipient is reported, not sent', async () => {
    ops.sendMessage.mockRejectedValueOnce(
      new SendMessageError(
        'recipient_opted_out',
        'This contact opted out of marketing messages.',
        409
      )
    );
    const p = await prep({ conversationId: CONV_A });
    expect(await code(executeTemplateMessage(ctx, ops, p))).toBe(
      'invalid_input: This contact opted out of marketing messages'
    );
  });
});

// ------------------------------------------------------------
describe('broadcasts', () => {
  const input = {
    templateName: 'delivery_confirmation',
    bodyVariables: ['there', 'your order'],
    contactIds: [CA, CA2],
  };

  it('previews the audience without writing anything', async () => {
    const p = await previewBroadcast(ctx, input, NOW);
    expect(p).toMatchObject({ audience: 2, opted_out: 0, will_send: 2 });
    expect(p.stored.contact_ids.sort()).toEqual([CA, CA2].sort());
    expect(db.writes).toEqual([]);
  });

  it('counts marketing opt-outs', async () => {
    vi.mocked(templates.getTemplate).mockResolvedValue(
      template({ category: 'MARKETING' })
    );
    db.tables.marketing_opt_outs.push({
      account_id: A,
      phone_normalized: '919999900001',
    });
    const p = await previewBroadcast(ctx, input, NOW);
    expect(p).toMatchObject({ audience: 2, opted_out: 1, will_send: 1 });
  });

  it("refuses an audience that includes another workspace's contact", async () => {
    expect(
      await code(previewBroadcast(ctx, { ...input, contactIds: [CA, CB] }, NOW))
    ).toBe('not_found: One or more contacts were not found');
  });

  it('rejects a schedule in the past', async () => {
    expect(
      await code(
        previewBroadcast(ctx, { ...input, scheduleAt: ago(HOUR) }, NOW)
      )
    ).toMatch(/in the future/);
  });

  it('sends from the stored preview: reserve recipients, then schedule', async () => {
    const at = new Date(NOW.getTime() + 2 * HOUR).toISOString();
    const p = await previewBroadcast(ctx, { ...input, scheduleAt: at }, NOW);
    const r = await sendBroadcast(ctx, ops, p.stored, NOW);
    expect(ops.reserve).toHaveBeenCalledWith({ broadcastRecipients: 2 });
    expect(ops.createBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'delivery_confirmation',
        templateLanguage: 'en_US',
        scheduledAt: at,
        recipients: expect.arrayContaining([
          expect.objectContaining({
            to: '916359463987',
            params: ['there', 'your order'],
          }),
        ]),
      })
    );
    expect(r).toMatchObject({
      broadcastId: id(60),
      recipients: 2,
      scheduledAt: at,
    });
  });

  it('drops contacts deleted since the preview', async () => {
    const p = await previewBroadcast(ctx, input, NOW);
    db.tables.contacts = db.tables.contacts.filter((c) => c.id !== CA2);
    const r = await sendBroadcast(ctx, ops, p.stored, NOW);
    expect(r.recipients).toBe(1);
  });

  it('a stored preview pointing at another workspace sends nothing', async () => {
    expect(
      await code(
        sendBroadcast(
          ctx,
          ops,
          { fill: input, contact_ids: [CB], schedule_at: null, name: null },
          NOW
        )
      )
    ).toMatch(/None of the previewed contacts exist/);
    expect(ops.createBroadcast).not.toHaveBeenCalled();
  });

  it('stops at the daily recipient cap', async () => {
    ops.reserve.mockResolvedValueOnce({
      allowed: false,
      connectionMessages: 0,
      accountMessages: 0,
      accountRecipients: 499,
    });
    const p = await previewBroadcast(ctx, input, NOW);
    expect(await code(sendBroadcast(ctx, ops, p.stored, NOW))).toMatch(
      /daily limit of 500 AI broadcast recipients/
    );
    expect(ops.createBroadcast).not.toHaveBeenCalled();
  });

  it('refuses a malformed stored preview', async () => {
    expect(await code(sendBroadcast(ctx, ops, { nope: 1 }, NOW))).toMatch(
      /not a broadcast preview/
    );
  });

  it('cancels only a scheduled broadcast of this workspace', async () => {
    db.tables.broadcasts.push(
      {
        id: id(80),
        account_id: A,
        name: 'Sale',
        status: 'scheduled',
        scheduled_at: NOW.toISOString(),
      },
      { id: id(81), account_id: A, name: 'Live', status: 'sending' },
      { id: id(82), account_id: B, name: 'Theirs', status: 'scheduled' }
    );
    await cancelScheduledBroadcast(ctx, id(80));
    expect(db.tables.broadcasts[0]).toMatchObject({
      status: 'draft',
      scheduled_at: null,
    });
    expect(await code(cancelScheduledBroadcast(ctx, id(81)))).toMatch(
      /this one is sending/
    );
    expect(await code(cancelScheduledBroadcast(ctx, id(82)))).toBe(
      'not_found: Broadcast not found'
    );
  });
});

// ------------------------------------------------------------
describe('automations and flows', () => {
  beforeEach(() => {
    db.tables.automations.push(
      {
        id: id(40),
        account_id: A,
        user_id: ME,
        name: 'Mine',
        is_active: false,
        trigger_type: 'new_message',
        trigger_config: {},
      },
      {
        id: id(41),
        account_id: A,
        user_id: OTHER,
        name: 'Theirs',
        is_active: true,
        trigger_type: 'new_message',
        trigger_config: {},
      }
    );
    db.tables.flows.push({
      id: id(45),
      account_id: A,
      name: 'Lead capture',
      status: 'draft',
      trigger_type: 'manual',
      trigger_config: {},
      entry_node_id: null,
    });
  });

  it('only the creator can switch an automation', async () => {
    expect(await code(setAutomationActive(ctx, id(41), false))).toMatch(
      /Only the team member who created/
    );
    expect(db.writes).toEqual([]);
  });

  it('switching on validates the steps first', async () => {
    expect(await code(setAutomationActive(ctx, id(40), true))).toMatch(
      /can't be switched on until it is fixed/
    );
    expect(loadStepsTree).toHaveBeenCalledWith(id(40));
    expect(db.writes).toEqual([]);
  });

  it('switching off needs no validation, and a repeat changes nothing', async () => {
    db.tables.automations[0].is_active = true;
    const r = await setAutomationActive(ctx, id(40), false);
    expect(r).toMatchObject({ active: false, previous: true, changed: true });
    expect(loadStepsTree).not.toHaveBeenCalled();
    const again = await setAutomationActive(ctx, id(40), false);
    expect(again.changed).toBe(false);
  });

  it('a flow with errors cannot be activated; draft always works', async () => {
    expect(await code(setFlowStatus(ctx, id(45), 'active'))).toMatch(
      /can't be activated until it is fixed/
    );
    db.tables.flows[0].status = 'active';
    const r = await setFlowStatus(ctx, id(45), 'draft');
    expect(r).toMatchObject({
      status: 'draft',
      previous: 'active',
      changed: true,
    });
  });
});
