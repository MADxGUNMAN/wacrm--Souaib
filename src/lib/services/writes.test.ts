import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: vi.fn(async () => {}),
}));
vi.mock('@/lib/api/v1/contacts', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/v1/contacts')>()),
  findOrCreateContact: vi.fn(),
}));

import * as v1 from '@/lib/api/v1/contacts';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import {
  addContactNote,
  addTagsToContacts,
  createContact,
  removeTagsFromContacts,
  setCustomField,
  updateContact,
} from './contact-writes';
import { ServiceError, type ServiceContext } from './context';
import {
  assignConversation,
  markConversationRead,
  updateConversationStatus,
} from './conversation-writes';
import { closeDeal, createDeal, updateDeal } from './deal-writes';
import { fakeDb, type FakeDb } from './fake-db.test-helper';

// Workspace A (the caller) and workspace B (someone else).
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ME = '11111111-1111-4111-8111-111111111111';
const TEAMMATE = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const id = (n: number) =>
  `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

const CA = id(1); // contact in A
const CB = id(2); // contact in B
const CONV_A = id(3);
const CONV_B = id(4);
const TAG_A = id(5);
const TAG_B = id(6);
const FIELD_A = id(7);
const FIELD_SYS = id(8);
const FIELD_B = id(9);
const PIPE_A = id(10);
const STAGE_A1 = id(11);
const STAGE_A2 = id(12);
const PIPE_B = id(13);
const STAGE_B = id(14);
const DEAL_A = id(15);
const DEAL_B = id(16);

let db: FakeDb;
let ctx: ServiceContext;

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb({
    contacts: [
      {
        id: CA,
        account_id: A,
        name: 'Ravi',
        email: null,
        company: null,
        phone: '+919876543210',
      },
      {
        id: CB,
        account_id: B,
        name: 'Other',
        email: null,
        company: null,
        phone: '+15550001111',
      },
    ],
    conversations: [
      {
        id: CONV_A,
        account_id: A,
        status: 'open',
        assigned_agent_id: null,
        unread_count: 3,
      },
      {
        id: CONV_B,
        account_id: B,
        status: 'open',
        assigned_agent_id: null,
        unread_count: 2,
      },
    ],
    tags: [
      { id: TAG_A, account_id: A, name: 'VIP' },
      { id: TAG_B, account_id: B, name: 'VIP' },
    ],
    contact_tags: [],
    contact_notes: [],
    custom_fields: [
      {
        id: FIELD_A,
        account_id: A,
        field_name: 'City',
        field_key: null,
        field_options: null,
      },
      {
        id: FIELD_SYS,
        account_id: A,
        field_name: 'Email',
        field_key: 'email',
        field_options: null,
      },
      {
        id: FIELD_B,
        account_id: B,
        field_name: 'City',
        field_key: null,
        field_options: null,
      },
    ],
    contact_custom_values: [],
    profiles: [
      {
        id: id(41),
        user_id: ME,
        account_id: A,
        full_name: 'Me',
        is_active: true,
      },
      {
        id: id(42),
        user_id: TEAMMATE,
        account_id: A,
        full_name: 'Priya',
        is_active: true,
      },
      {
        user_id: STRANGER,
        account_id: B,
        full_name: 'Stranger',
        is_active: true,
      },
    ],
    pipelines: [
      { id: PIPE_A, account_id: A, name: 'Sales' },
      { id: PIPE_B, account_id: B, name: 'Theirs' },
    ],
    pipeline_stages: [
      { id: STAGE_A1, pipeline_id: PIPE_A, position: 0 },
      { id: STAGE_A2, pipeline_id: PIPE_A, position: 1 },
      { id: STAGE_B, pipeline_id: PIPE_B, position: 0 },
    ],
    deals: [
      {
        id: DEAL_A,
        account_id: A,
        pipeline_id: PIPE_A,
        stage_id: STAGE_A1,
        status: 'open',
        title: 'Deal A',
        value: 10,
      },
      {
        id: DEAL_B,
        account_id: B,
        pipeline_id: PIPE_B,
        stage_id: STAGE_B,
        status: 'open',
        title: 'Deal B',
        value: 20,
      },
    ],
  });
  ctx = {
    db: db.client,
    userId: ME,
    accountId: A,
    actor: { kind: 'ai', connectionId: id(99), platform: 'claude' },
  };
});

const notFound = expect.objectContaining({ code: 'not_found' });

// ------------------------------------------------------------
// Isolation test 2: every write with workspace B's ids fails as
// "not found" and writes nothing.
// ------------------------------------------------------------

describe('isolation: foreign ids change nothing', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['update_contact', () => updateContact(ctx, CB, { name: 'Hacked' })],
    [
      'add_tags (foreign contact)',
      () => addTagsToContacts(ctx, [CA, CB], [TAG_A]),
    ],
    ['add_tags (foreign tag)', () => addTagsToContacts(ctx, [CA], [TAG_B])],
    [
      'remove_tags (foreign contact)',
      () => removeTagsFromContacts(ctx, [CB], [TAG_A]),
    ],
    ['add_contact_note', () => addContactNote(ctx, CB, 'hi')],
    [
      'set_custom_field (foreign contact)',
      () => setCustomField(ctx, CB, FIELD_A, 'Pune'),
    ],
    [
      'set_custom_field (foreign field)',
      () => setCustomField(ctx, CA, FIELD_B, 'Pune'),
    ],
    [
      'update_conversation_status',
      () => updateConversationStatus(ctx, CONV_B, 'closed'),
    ],
    [
      'assign_conversation (foreign conversation)',
      () => assignConversation(ctx, CONV_B, 'me'),
    ],
    [
      'assign_conversation (foreign member)',
      () => assignConversation(ctx, CONV_A, STRANGER),
    ],
    ['mark_conversation_read', () => markConversationRead(ctx, CONV_B)],
    [
      'create_deal (foreign contact)',
      () => createDeal(ctx, { contactId: CB, pipelineId: PIPE_A, title: 'x' }),
    ],
    [
      'create_deal (foreign pipeline)',
      () => createDeal(ctx, { contactId: CA, pipelineId: PIPE_B, title: 'x' }),
    ],
    [
      'update_deal (foreign deal)',
      () => updateDeal(ctx, DEAL_B, { title: 'x' }),
    ],
    [
      'update_deal (foreign pipeline)',
      () => updateDeal(ctx, DEAL_A, { pipelineId: PIPE_B }),
    ],
    ['close_deal', () => closeDeal(ctx, DEAL_B, 'won')],
  ];
  it.each(cases)('%s', async (_name, fn) => {
    await expect(fn()).rejects.toEqual(notFound);
    expect(db.writes).toEqual([]);
    expect(runAutomationsForTrigger).not.toHaveBeenCalled();
  });

  it('a stage from another pipeline is refused', async () => {
    await expect(
      updateDeal(ctx, DEAL_A, { stageId: STAGE_B })
    ).rejects.toBeInstanceOf(ServiceError);
    expect(db.writes).toEqual([]);
  });
});

// ------------------------------------------------------------
// Idempotency: repeating a call changes nothing more.
// ------------------------------------------------------------

describe('idempotency', () => {
  it('adding the same tag twice adds once and fires automations once', async () => {
    const first = await addTagsToContacts(ctx, [CA], [TAG_A]);
    const second = await addTagsToContacts(ctx, [CA], [TAG_A]);
    expect(first).toMatchObject({
      added: 1,
      already: 0,
      automations_triggered: 1,
    });
    expect(second).toMatchObject({
      added: 0,
      already: 1,
      automations_triggered: 0,
    });
    expect(db.tables.contact_tags).toHaveLength(1);
    expect(runAutomationsForTrigger).toHaveBeenCalledTimes(1);
    expect(runAutomationsForTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: A,
        triggerType: 'tag_added',
        contactId: CA,
      })
    );
  });

  it('status, assignment, read and close only write when something changes', async () => {
    expect((await updateConversationStatus(ctx, CONV_A, 'open')).changed).toBe(
      false
    );
    expect((await assignConversation(ctx, CONV_A, null)).changed).toBe(false);
    await markConversationRead(ctx, CONV_A);
    const afterFirstRead = db.writes.length;
    await markConversationRead(ctx, CONV_A);
    expect(db.writes.length).toBe(afterFirstRead);
    await closeDeal(ctx, DEAL_A, 'won');
    const afterClose = db.writes.length;
    await closeDeal(ctx, DEAL_A, 'won');
    expect(db.writes.length).toBe(afterClose);
  });

  it('update_contact with the same values writes nothing', async () => {
    const r = await updateContact(ctx, CA, { name: 'Ravi' });
    expect(r.changed).toEqual([]);
    expect(db.writes).toEqual([]);
  });

  it('setting the same custom value twice writes once', async () => {
    await setCustomField(ctx, CA, FIELD_A, 'Pune');
    await setCustomField(ctx, CA, FIELD_A, 'Pune');
    expect(db.tables.contact_custom_values).toHaveLength(1);
    expect(
      db.writes.filter((w) => w.table === 'contact_custom_values')
    ).toHaveLength(1);
  });

  it('create_contact passes source ai and the real user, and reports an existing contact', async () => {
    vi.mocked(v1.findOrCreateContact).mockResolvedValue({
      id: CA,
      created: false,
    });
    const r = await createContact(ctx, {
      phone: '+919876543210',
      name: 'Ravi',
    });
    expect(r.created).toBe(false);
    expect(v1.findOrCreateContact).toHaveBeenCalledWith(
      db.client,
      A,
      ME,
      expect.objectContaining({ phone: '+919876543210' }),
      'ai'
    );
  });
});

// ------------------------------------------------------------
// Behaviour
// ------------------------------------------------------------

describe('write behaviour', () => {
  it('assigns to a teammate and to me', async () => {
    expect(
      (await assignConversation(ctx, CONV_A, TEAMMATE)).assigned_to
    ).toEqual({ id: TEAMMATE, name: 'Priya' });
    expect(db.tables.conversations[0].assigned_agent_id).toBe(TEAMMATE);
    await assignConversation(ctx, CONV_A, 'me');
    expect(db.tables.conversations[0].assigned_agent_id).toBe(ME);
  });

  it('notes are written as the signed-in user', async () => {
    await addContactNote(ctx, CA, '  Call back Monday  ');
    expect(db.tables.contact_notes[0]).toMatchObject({
      account_id: A,
      contact_id: CA,
      user_id: ME,
      note_text: 'Call back Monday',
    });
  });

  it('built-in fields are refused by set_custom_field and options are enforced', async () => {
    await expect(
      setCustomField(ctx, CA, FIELD_SYS, 'x@y.com')
    ).rejects.toMatchObject({ code: 'invalid_input' });
    db.tables.custom_fields[0].field_options = ['Pune', 'Mumbai'];
    await expect(
      setCustomField(ctx, CA, FIELD_A, 'Delhi')
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await setCustomField(ctx, CA, FIELD_A, 'Mumbai')).value).toBe(
      'Mumbai'
    );
    expect((await setCustomField(ctx, CA, FIELD_A, null)).previous).toBe(
      'Mumbai'
    );
    expect(db.tables.contact_custom_values).toHaveLength(0);
  });

  it('a new deal is open, owned by the user, and starts in the first stage', async () => {
    await createDeal(ctx, {
      contactId: CA,
      pipelineId: PIPE_A,
      title: '  Website  ',
      value: 5000,
      assignedTo: 'me',
    });
    const created = db.tables.deals.at(-1)!;
    expect(created).toMatchObject({
      account_id: A,
      user_id: ME,
      contact_id: CA,
      stage_id: STAGE_A1,
      status: 'open',
      title: 'Website',
      currency: 'INR',
      // deals.assigned_to stores the PROFILE id, as the deal form does.
      assigned_to: id(41),
    });
  });

  it('moving a deal checks the stage is in its pipeline', async () => {
    await updateDeal(ctx, DEAL_A, { stageId: STAGE_A2 });
    expect(db.tables.deals[0].stage_id).toBe(STAGE_A2);
  });

  it('removing tags never deletes the tag itself', async () => {
    await addTagsToContacts(ctx, [CA], [TAG_A]);
    await removeTagsFromContacts(ctx, [CA], [TAG_A]);
    expect(db.tables.contact_tags).toHaveLength(0);
    expect(db.tables.tags).toHaveLength(2);
  });
});

// ------------------------------------------------------------
// Regression: tag names must resolve to THOSE tags only. The lookup
// from resolveImportTagIds holds every tag in the account, and taking
// all its values tagged a test contact with all 123 of the workspace's
// tags in the first Phase 6 live run.
// ------------------------------------------------------------

describe('tag names resolve to only the named tags', () => {
  it('idsForTagNames picks requested names in order, case-insensitively', async () => {
    const { idsForTagNames } =
      await import('@/lib/contacts/resolve-import-tags');
    const all = new Map([
      ['vip', 't1'],
      ['lead', 't2'],
      ['greece', 't3'],
    ]);
    expect(idsForTagNames(all, ['Lead', ' VIP '])).toEqual(['t2', 't1']);
    expect(idsForTagNames(all, ['missing'])).toEqual([]);
  });

  it('resolveTagIds with one name returns one id when the account has many tags', async () => {
    const { resolveTagIds } = await import('./contact-writes');
    db.tables.tags.push(
      { id: id(50), account_id: A, name: 'GREECE' },
      { id: id(51), account_id: A, name: 'IRELAND' },
      { id: id(52), account_id: A, name: 'Lead' }
    );
    expect(
      await resolveTagIds(ctx, { names: ['lead'], create: false })
    ).toEqual([id(52)]);
    const created = await resolveTagIds(ctx, {
      names: ['brand-new'],
      create: true,
    });
    expect(created).toHaveLength(1);
    expect(db.tables.tags.find((t) => t.id === created[0])?.name).toBe(
      'brand-new'
    );
  });

  it('an unknown name is not found when creating is not allowed', async () => {
    const { resolveTagIds } = await import('./contact-writes');
    await expect(
      resolveTagIds(ctx, { names: ['nope'], create: false })
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('deal assignees: profile id stored, user id exposed', () => {
  it('reads return the member as { user id, name }, and filters accept user ids', async () => {
    const { getDeal, listDeals } = await import('./deals');
    db.tables.deals[0].assigned_to = id(42); // Priya's profile id
    const d = await getDeal(ctx, DEAL_A);
    expect(d.assigned_to).toEqual({ id: TEAMMATE, name: 'Priya' });
    const mine = await listDeals(ctx, { assignedTo: TEAMMATE });
    expect(mine.items.map((x) => x.id)).toEqual([DEAL_A]);
    const none = await listDeals(ctx, { assignedTo: 'me' });
    expect(none.items).toEqual([]);
  });

  it('update_deal stores the profile id for a member id', async () => {
    await updateDeal(ctx, DEAL_A, { assignedTo: TEAMMATE });
    expect(db.tables.deals[0].assigned_to).toBe(id(42));
    await updateDeal(ctx, DEAL_A, { assignedTo: null });
    expect(db.tables.deals[0].assigned_to).toBeNull();
  });

  it('a member of another workspace cannot be assigned', async () => {
    await expect(
      updateDeal(ctx, DEAL_A, { assignedTo: STRANGER })
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
