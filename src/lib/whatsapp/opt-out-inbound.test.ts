// ============================================================
// Pins the decisions in the inbound STOP/START handler that have real
// consequences if they invert:
//
//   * confirming an opt-out that was never written would leave the
//     customer believing they unsubscribed while marketing continues
//   * consuming a message that ISN'T an opt-out would silently kill the
//     account's Flows, automations and AI replies
//   * pausing the conversation on opt-IN would do the opposite of what
//     the customer just asked for
//
// `matchesKeyword` is deliberately NOT mocked — the whole-message-vs-
// substring rule is the behaviour under test. Only the DB and the Meta
// send are stubbed.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleInboundOptOutKeyword } from './opt-out-inbound';
import {
  loadOptInOutConfig,
  recordMarketingOptOut,
  removeMarketingOptOut,
  type OptInOutConfig,
} from './marketing-opt-out';
import {
  engineSendInteractiveButtons,
  engineSendText,
} from '@/lib/flows/meta-send';
// From the pure module rather than the mocked one, so these constants are
// never affected by the './marketing-opt-out' partial mock below.
import {
  RESERVED_OPT_IN_PAYLOAD,
  RESERVED_OPT_OUT_PAYLOAD,
} from './opt-out-keywords';

// BOTH senders must be mocked. When only engineSendText was stubbed, the
// interactive call was `undefined`, threw a TypeError, and the handler's
// fallback quietly sent plain text instead — so the Resubscribe button
// looked tested while never being exercised at all.
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn(async () => ({ whatsapp_message_id: 'wamid.test' })),
  engineSendInteractiveButtons: vi.fn(async () => ({
    whatsapp_message_id: 'wamid.buttons',
  })),
}));

vi.mock('./marketing-opt-out', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marketing-opt-out')>();
  return {
    ...actual,
    // Only the DB-touching helpers are stubbed; matchesKeyword and the
    // normalizers stay real.
    loadOptInOutConfig: vi.fn(),
    recordMarketingOptOut: vi.fn(async () => 'created' as const),
    removeMarketingOptOut: vi.fn(async () => true),
  };
});

const mockedLoadConfig = vi.mocked(loadOptInOutConfig);
const mockedRecord = vi.mocked(recordMarketingOptOut);
const mockedRemove = vi.mocked(removeMarketingOptOut);
const mockedSend = vi.mocked(engineSendText);
const mockedSendButtons = vi.mocked(engineSendInteractiveButtons);

const CONFIG: OptInOutConfig = {
  isActive: true,
  optOutKeywords: ['STOP', 'UNSUBSCRIBE'],
  optInKeywords: ['START'],
  optOutResponseMessage: 'You have been opted out.',
  optInResponseMessage: 'Welcome back.',
};

/** Records table / update / eq usage so tests can assert the columns. */
interface DbSpy {
  from: ReturnType<typeof vi.fn>;
  tables: string[];
  updates: { table: string; payload: Record<string, unknown> }[];
  filters: { table: string; column: string; value: unknown }[];
}

function makeDb(): DbSpy {
  const spy: DbSpy = {
    from: vi.fn(),
    tables: [],
    updates: [],
    filters: [],
  };

  spy.from = vi.fn((table: string) => {
    spy.tables.push(table);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      update: (payload: Record<string, unknown>) => {
        spy.updates.push({ table, payload });
        return chain;
      },
      eq: (column: string, value: unknown) => {
        spy.filters.push({ table, column, value });
        return chain;
      },
      // Thenable so `await db.from(...).update(...).eq(...)` resolves.
      then: (resolve: (v: { error: null }) => unknown) =>
        Promise.resolve({ error: null }).then(resolve),
    };
    return chain;
  });

  return spy;
}

function invoke(
  overrides: Partial<Parameters<typeof handleInboundOptOutKeyword>[0]> = {}
) {
  const db = makeDb();
  return {
    db,
    result: handleInboundOptOutKeyword({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
      accountId: 'acc-1',
      configOwnerUserId: 'user-1',
      contactId: 'contact-1',
      conversationId: 'conv-1',
      phone: '+1 415 555 0123',
      text: null,
      interactiveReplyId: null,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  mockedLoadConfig.mockResolvedValue({ ...CONFIG });
  mockedRecord.mockResolvedValue('created');
  mockedRemove.mockResolvedValue(true);
  mockedSend.mockResolvedValue({ whatsapp_message_id: 'wamid.test' });
  mockedSendButtons.mockResolvedValue({
    whatsapp_message_id: 'wamid.buttons',
  });
});

describe('opt-out detection', () => {
  it('records and confirms a typed STOP', async () => {
    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });

    expect(mockedRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: 'acc-1',
        contactId: 'contact-1',
        source: 'customer_keyword',
      })
    );
    // The opt-out confirmation is an INTERACTIVE message, so it can carry
    // the one-tap way back.
    expect(mockedSendButtons).toHaveBeenCalledWith(
      expect.objectContaining({ bodyText: 'You have been opted out.' })
    );
  });

  it('attributes a quick-reply tap to customer_button', async () => {
    // The payload is matched, not the label — a label can be translated
    // or edited at Meta without the business noticing.
    const { result } = invoke({
      text: 'Stop promotions',
      interactiveReplyId: 'STOP',
    });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'customer_button' })
    );
  });

  it('is case- and punctuation-insensitive', async () => {
    for (const text of ['stop', ' Stop ', 'STOP.', 'unsubscribe']) {
      vi.clearAllMocks();
      mockedLoadConfig.mockResolvedValue({ ...CONFIG });
      mockedRecord.mockResolvedValue('created');
      const { result } = invoke({ text });
      await expect(result).resolves.toMatchObject({ consumed: true });
    }
  });

  it('ignores a keyword embedded in a sentence', async () => {
    for (const text of ['stop by tomorrow', "don't stop these", 'nonstop']) {
      vi.clearAllMocks();
      mockedLoadConfig.mockResolvedValue({ ...CONFIG });
      const { result } = invoke({ text });
      await expect(result).resolves.toEqual({ consumed: false });
      expect(mockedRecord).not.toHaveBeenCalled();
      expect(mockedSend).not.toHaveBeenCalled();
    }
  });

  it('pauses the active flow run and mutes AI on opt-out', async () => {
    const { db, result } = invoke({ text: 'STOP' });
    await result;

    expect(db.tables).toContain('flow_runs');
    expect(db.tables).toContain('conversations');

    const flowUpdate = db.updates.find((u) => u.table === 'flow_runs');
    expect(flowUpdate?.payload).toMatchObject({
      status: 'paused_by_agent',
      end_reason: 'customer_opted_out',
    });

    // Assert the COLUMNS, not just that a filter happened — only ACTIVE
    // runs for THIS contact in THIS account may be paused.
    const flowFilters = db.filters.filter((f) => f.table === 'flow_runs');
    expect(flowFilters).toEqual(
      expect.arrayContaining([
        { table: 'flow_runs', column: 'account_id', value: 'acc-1' },
        { table: 'flow_runs', column: 'contact_id', value: 'contact-1' },
        { table: 'flow_runs', column: 'status', value: 'active' },
      ])
    );

    const convUpdate = db.updates.find((u) => u.table === 'conversations');
    expect(convUpdate?.payload).toMatchObject({ ai_autoreply_disabled: true });
    expect(db.filters).toEqual(
      expect.arrayContaining([
        { table: 'conversations', column: 'id', value: 'conv-1' },
      ])
    );
  });
});

describe('write failures', () => {
  it('does NOT confirm or consume when the opt-out write failed', async () => {
    // The important one. Saying "you have been opted out" when nothing was
    // stored would stop the customer asking again while marketing keeps
    // arriving — worse than staying silent and letting them retry.
    mockedRecord.mockResolvedValue('failed');

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({ consumed: false });
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedSendButtons).not.toHaveBeenCalled();
  });

  it('still confirms a repeated STOP that was already recorded', async () => {
    // 'existed' is success, not failure — a customer repeating STOP is
    // usually unsure it worked, and silence reads as being ignored.
    mockedRecord.mockResolvedValue('existed');

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });
    expect(mockedSendButtons).toHaveBeenCalledTimes(1);
  });

  it('does not consume when clearing an opt-out fails', async () => {
    mockedRemove.mockResolvedValue(false);

    const { result } = invoke({ text: 'START' });
    await expect(result).resolves.toEqual({ consumed: false });
    expect(mockedSend).not.toHaveBeenCalled();
  });
});

describe('opt-in', () => {
  it('clears the opt-out and confirms', async () => {
    const { result } = invoke({ text: 'START' });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_in',
    });
    expect(mockedRemove).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accountId: 'acc-1' })
    );
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Welcome back.' })
    );
  });

  it('does NOT pause flows or mute AI when opting back in', async () => {
    // Opting in is a signal the customer wants to engage. Silencing their
    // conversation would be the opposite of what they asked for.
    const { db, result } = invoke({ text: 'START' });
    await result;
    expect(db.tables).not.toContain('flow_runs');
    expect(db.tables).not.toContain('conversations');
  });

  it('ignores opt-in keywords when the list is empty', async () => {
    // A valid configuration: accept opt-outs without offering keyword
    // re-subscription.
    mockedLoadConfig.mockResolvedValue({ ...CONFIG, optInKeywords: [] });

    const { result } = invoke({ text: 'START' });
    await expect(result).resolves.toEqual({ consumed: false });
    expect(mockedRemove).not.toHaveBeenCalled();
  });
});

describe('precedence and safety', () => {
  it('prefers opt-OUT when a keyword appears in both lists', async () => {
    // A misconfiguration the Settings UI should prevent. The safer reading
    // of an ambiguous instruction is that the customer wants out.
    mockedLoadConfig.mockResolvedValue({
      ...CONFIG,
      optOutKeywords: ['STOP'],
      optInKeywords: ['STOP'],
    });

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });
    expect(mockedRemove).not.toHaveBeenCalled();
  });

  it('does nothing when capture is switched off', async () => {
    // is_active gates CAPTURE only. Enforcement of opt-outs already
    // recorded lives in the send paths and never reads this flag.
    mockedLoadConfig.mockResolvedValue({ ...CONFIG, isActive: false });

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({ consumed: false });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('never throws, and falls back to not-consumed', async () => {
    // The caller is inside the webhook's after() block; a throw here would
    // cost the inbound message that is already stored.
    mockedLoadConfig.mockRejectedValue(new Error('db down'));

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({ consumed: false });
  });

  it('ignores empty and non-keyword messages', async () => {
    for (const text of [null, '', 'hello there']) {
      vi.clearAllMocks();
      mockedLoadConfig.mockResolvedValue({ ...CONFIG });
      const { result } = invoke({ text });
      await expect(result).resolves.toEqual({ consumed: false });
    }
  });
});
describe('reserved button payloads', () => {
  it('unsubscribes on the reserved opt-out payload even when the label matches nothing', async () => {
    // The case that was silently broken: a button labelled in another
    // language, or worded as "Unsubscribe" while the keyword list says
    // STOP. Before reserved payloads the tap matched nothing and did
    // nothing, so the customer believed they had unsubscribed while
    // marketing kept arriving.
    const { result } = invoke({
      text: 'No quiero más ofertas',
      interactiveReplyId: RESERVED_OPT_OUT_PAYLOAD,
    });

    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'customer_button' })
    );
  });

  it('re-subscribes on the reserved opt-in payload with NO opt-in keywords configured', async () => {
    // This is why the Resubscribe button carries the reserved payload
    // rather than the word START: an account may legitimately configure no
    // opt-in keywords at all, and a button we sent must still work.
    mockedLoadConfig.mockResolvedValue({ ...CONFIG, optInKeywords: [] });

    const { result } = invoke({
      text: 'Resubscribe',
      interactiveReplyId: RESERVED_OPT_IN_PAYLOAD,
    });

    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_in',
    });
    expect(mockedRemove).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'customer_button' })
    );
  });

  it('attributes a typed opt-in to the customer, not to an agent', async () => {
    // The history must not claim a team member re-subscribed somebody who
    // asked for it themselves.
    const { result } = invoke({ text: 'START' });
    await expect(result).resolves.toMatchObject({ action: 'opted_in' });
    expect(mockedRemove).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'customer_keyword' })
    );
  });
});

describe('opt-out confirmation', () => {
  it('offers a one-tap Resubscribe button carrying the reserved payload', async () => {
    const { result } = invoke({ text: 'STOP' });
    await result;

    expect(mockedSendButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyText: 'You have been opted out.',
        buttons: [{ id: RESERVED_OPT_IN_PAYLOAD, title: 'Resubscribe' }],
      })
    );
    // Not sent twice — the text sender is the fallback, not an addition.
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the interactive send is refused', async () => {
    // An interactive message has more ways to be refused than a text one.
    // The customer's real question is "did that work?", so a confirmation
    // without its button beats no confirmation at all.
    mockedSendButtons.mockRejectedValue(new Error('interactive not allowed'));

    const { result } = invoke({ text: 'STOP' });
    await expect(result).resolves.toEqual({
      consumed: true,
      action: 'opted_out',
    });
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'You have been opted out.' })
    );
  });

  it('confirms an opt-IN as plain text, with no button', async () => {
    // Deliberately asymmetric: the opt-in wording already says how to
    // leave again, and a button would put an instant reversal of the
    // choice just made one accidental tap away.
    const { result } = invoke({ text: 'START' });
    await result;

    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Welcome back.' })
    );
    expect(mockedSendButtons).not.toHaveBeenCalled();
  });
});
