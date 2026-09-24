import { describe, expect, it } from 'vitest';

import {
  allChatsSortKey,
  isVisibleInAllChats,
  rowPreview,
} from './broadcast-visibility';

describe('isVisibleInAllChats', () => {
  /**
   * THE CASE THIS EXISTS FOR. A campaign reached someone nobody has ever
   * spoken to. The send is a real message, so it bumped the conversation
   * preview and created an inbox row — a few hundred recipients buried the
   * threads an agent actually had to answer.
   */
  it('hides a conversation reached only by a broadcast', () => {
    expect(
      isVisibleInAllChats({
        last_message_at: '2026-09-17T13:14:00Z',
        last_direct_message_at: null,
      })
    ).toBe(false);
  });

  it('shows a conversation as soon as the customer replies', () => {
    // The reply is a direct message, so the trigger populates the column and
    // the thread returns to All chats on its own.
    expect(
      isVisibleInAllChats({
        last_message_at: '2026-09-17T13:20:00Z',
        last_direct_message_at: '2026-09-17T13:20:00Z',
      })
    ).toBe(true);
  });

  it('shows a thread that had real activity before the broadcast', () => {
    // Broadcast is newer, but there is prior direct history — this thread
    // is a real conversation and must not disappear.
    expect(
      isVisibleInAllChats({
        last_message_at: '2026-09-17T13:14:00Z',
        last_direct_message_at: '2026-09-17T12:57:00Z',
      })
    ).toBe(true);
  });

  /**
   * An empty conversation also has a null `last_direct_message_at`, so the
   * naive rule `last_direct_message_at != null` would hide it. Those get
   * created by starting a chat from the Contacts panel, and hiding them
   * would make that action look broken — a new bug traded for the fixed one.
   */
  it('shows a conversation with no messages at all', () => {
    expect(
      isVisibleInAllChats({
        last_message_at: null,
        last_direct_message_at: null,
      })
    ).toBe(true);
    expect(isVisibleInAllChats({})).toBe(true);
  });
});

describe('allChatsSortKey', () => {
  it('orders on direct activity, ignoring a newer broadcast', () => {
    // This is the reordering complaint: the broadcast at 13:14 must not move
    // this thread above one whose customer wrote at 13:00.
    const broadcastedThread = {
      last_message_at: '2026-09-17T13:14:00Z',
      last_direct_message_at: '2026-09-17T12:00:00Z',
    };
    const quietThread = {
      last_message_at: '2026-09-17T13:00:00Z',
      last_direct_message_at: '2026-09-17T13:00:00Z',
    };
    expect(allChatsSortKey(quietThread)).toBeGreaterThan(
      allChatsSortKey(broadcastedThread)
    );
  });

  it('falls back to created_at for an empty conversation', () => {
    const key = allChatsSortKey({ created_at: '2026-09-17T13:00:00Z' });
    expect(key).toBe(Date.parse('2026-09-17T13:00:00Z'));
  });

  it('prefers direct activity over created_at', () => {
    expect(
      allChatsSortKey({
        created_at: '2026-01-01T00:00:00Z',
        last_direct_message_at: '2026-09-17T13:00:00Z',
      })
    ).toBe(Date.parse('2026-09-17T13:00:00Z'));
  });

  it('returns 0 rather than NaN for missing or unparseable dates', () => {
    // NaN would poison the comparator and scramble the whole list.
    expect(allChatsSortKey({})).toBe(0);
    expect(allChatsSortKey({ last_direct_message_at: 'nonsense' })).toBe(0);
  });

  it('sorts a realistic list newest-direct-first', () => {
    const rows = [
      {
        id: 'broadcast-bumped',
        last_message_at: '2026-09-17T13:14:00Z',
        last_direct_message_at: '2026-09-10T09:00:00Z',
      },
      {
        id: 'recent-reply',
        last_message_at: '2026-09-17T13:05:00Z',
        last_direct_message_at: '2026-09-17T13:05:00Z',
      },
      {
        id: 'older-reply',
        last_message_at: '2026-09-15T10:00:00Z',
        last_direct_message_at: '2026-09-15T10:00:00Z',
      },
    ];
    const sorted = [...rows].sort(
      (a, b) => allChatsSortKey(b) - allChatsSortKey(a)
    );
    expect(sorted.map((r) => r.id)).toEqual([
      'recent-reply',
      'older-reply',
      'broadcast-bumped',
    ]);
  });
});

describe('rowPreview', () => {
  const conversation = {
    last_message_at: '2026-09-17T13:14:00Z',
    last_message_text: 'Hello World template body',
    last_direct_message_at: '2026-09-17T12:57:00Z',
    last_direct_message_text: 'Hi',
  };

  it('shows the last real exchange in All chats', () => {
    expect(rowPreview(conversation, 'all')).toEqual({
      text: 'Hi',
      at: '2026-09-17T12:57:00Z',
    });
  });

  /**
   * The Broadcasts tab deliberately keeps reading `last_message_*`. Showing
   * the last direct message there would hide the campaign send the operator
   * opened the tab to inspect.
   */
  it('shows the campaign send in the Broadcasts view', () => {
    expect(rowPreview(conversation, 'broadcast')).toEqual({
      text: 'Hello World template body',
      at: '2026-09-17T13:14:00Z',
    });
  });

  it('returns nulls for a broadcast-only thread viewed in All chats', () => {
    // Not rendered there at all, but the helper must not invent a preview.
    expect(
      rowPreview(
        { last_message_at: '2026-09-17T13:14:00Z', last_message_text: 'Promo' },
        'all'
      )
    ).toEqual({ text: null, at: null });
  });
});
