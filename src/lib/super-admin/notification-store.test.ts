/**
 * The bug this pins shipped once already.
 *
 * The first version of this feature opened a realtime channel per hook
 * mount. `createClient()` is a singleton and `supabase.channel(name)`
 * hands back the EXISTING channel for a name it already knows, so the
 * moment a second component used the feed — the header bell is on every
 * admin page, and `/super-admin/notifications` is a second reader — the
 * second mount called `.on()` on an already-subscribed channel and the
 * page crashed with:
 *
 *   cannot add `postgres_changes` callbacks for
 *   realtime:super-admin-notifications after `subscribe()`
 *
 * That is invisible until someone opens the one page that adds a second
 * consumer, which is exactly the kind of regression worth a test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    /** Channels handed out, keyed by name, mimicking the real registry. */
    channels: new Map<string, ChannelDouble>(),
    channelCalls: [] as string[],
    removed: [] as string[],
    rpcCalls: [] as string[],
    upserts: [] as unknown[],
    rpcResult: { data: 3, error: null } as { data: unknown; error: unknown },
    rows: [] as Record<string, unknown>[],
    reads: [] as { notification_id: string }[],
    rowsError: null as { message: string } | null,
    user: { id: 'admin-1' } as { id: string } | null,
  };

  /**
   * Stands in for a Supabase channel, and reproduces the one behaviour
   * that caused the crash: `.on()` after `.subscribe()` throws.
   */
  class ChannelDouble {
    name: string;
    subscribed = false;
    handlers: { event: string; table: string; cb: (p: unknown) => void }[] = [];

    constructor(name: string) {
      this.name = name;
    }
    on(
      _type: string,
      filter: { event: string; table: string },
      cb: (p: unknown) => void
    ) {
      if (this.subscribed) {
        throw new Error(
          `cannot add \`postgres_changes\` callbacks for realtime:${this.name} after \`subscribe()\``
        );
      }
      this.handlers.push({ event: filter.event, table: filter.table, cb });
      return this;
    }
    subscribe() {
      this.subscribed = true;
      return this;
    }
    /** Fire a handler the way the server would. */
    emit(table: string, event: string, payload: unknown) {
      for (const handler of this.handlers) {
        if (
          handler.table === table &&
          (handler.event === event || handler.event === '*')
        ) {
          handler.cb(payload);
        }
      }
    }
  }

  function makeClient() {
    return {
      auth: {
        getUser: async () => ({ data: { user: state.user } }),
      },
      channel(name: string) {
        state.channelCalls.push(name);
        // The real client returns the same channel object for a repeated
        // name — that is the whole trap.
        const existing = state.channels.get(name);
        if (existing) return existing;
        const made = new ChannelDouble(name);
        state.channels.set(name, made);
        return made;
      },
      removeChannel(ch: ChannelDouble) {
        state.removed.push(ch.name);
        state.channels.delete(ch.name);
        return Promise.resolve('ok');
      },
      rpc(name: string) {
        state.rpcCalls.push(name);
        return Promise.resolve(state.rpcResult);
      },
      from(table: string) {
        if (table === 'super_admin_notifications') {
          const chain = {
            select: () => chain,
            order: () => chain,
            limit: () =>
              Promise.resolve({ data: state.rows, error: state.rowsError }),
          };
          return chain;
        }
        // super_admin_notification_reads
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve({ data: state.reads, error: null }),
          upsert: (row: unknown) => {
            state.upserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  return { state, ChannelDouble, makeClient };
});

type ChannelDouble = InstanceType<typeof h.ChannelDouble>;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => h.makeClient(),
}));

/** Fresh module state per test — the store is module-level by design. */
async function freshStore() {
  vi.resetModules();
  return import('./notification-store');
}

function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    type: 'account_created',
    severity: 'success',
    title: `Notification ${id}`,
    body: null,
    account_id: null,
    account_name: null,
    entity_type: null,
    entity_id: null,
    link: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  h.state.channels.clear();
  h.state.channelCalls = [];
  h.state.removed = [];
  h.state.rpcCalls = [];
  h.state.upserts = [];
  h.state.rpcResult = { data: 0, error: null };
  h.state.rows = [];
  h.state.reads = [];
  h.state.rowsError = null;
  h.state.user = { id: 'admin-1' };
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================
// The crash
// ============================================================

describe('a second consumer must not open a second channel', () => {
  it('shares one channel between two subscribers', async () => {
    const store = await freshStore();

    // The bell, then the notifications page.
    const unsubA = store.subscribe(() => {});
    const unsubB = store.subscribe(() => {});

    expect(h.state.channelCalls).toEqual(['super-admin-notifications']);
    expect(h.state.channels.size).toBe(1);

    unsubA();
    unsubB();
  });

  it('does not throw when a third consumer mounts after subscribe()', async () => {
    const store = await freshStore();
    const unsubA = store.subscribe(() => {});
    // Before the fix this threw the "after subscribe()" error.
    expect(() => store.subscribe(() => {})()).not.toThrow();
    unsubA();
  });

  it('registers its handlers before subscribing', async () => {
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    const ch = h.state.channels.get('super-admin-notifications')!;
    expect(ch.subscribed).toBe(true);
    // INSERT + DELETE on notifications, * on reads.
    expect(ch.handlers).toHaveLength(3);
    unsub();
  });
});

// ============================================================
// Teardown
// ============================================================

describe('teardown', () => {
  it('keeps the channel alive across a StrictMode-style remount', async () => {
    vi.useFakeTimers();
    const store = await freshStore();

    const unsub = store.subscribe(() => {});
    unsub();
    // Remount inside the grace window, as StrictMode does.
    vi.advanceTimersByTime(store.TEARDOWN_GRACE_MS - 1);
    const unsub2 = store.subscribe(() => {});
    vi.advanceTimersByTime(store.TEARDOWN_GRACE_MS * 2);

    expect(h.state.removed).toEqual([]);
    expect(h.state.channelCalls).toEqual(['super-admin-notifications']);
    unsub2();
  });

  it('removes the channel once nobody is listening', async () => {
    vi.useFakeTimers();
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    unsub();
    vi.advanceTimersByTime(store.TEARDOWN_GRACE_MS + 10);
    expect(h.state.removed).toEqual(['super-admin-notifications']);
  });
});

// ============================================================
// Counting — the original user-visible bug
// ============================================================

describe('unread count', () => {
  it('comes from the RPC, not from the loaded window', async () => {
    h.state.rows = [notification('a')];
    h.state.reads = [];
    // More unread exist than the window holds — a client-side diff would
    // report 1 and the badge would lie.
    h.state.rpcResult = { data: 57, error: null };

    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    expect(store.getSnapshot().unreadCount).toBe(57);
    expect(h.state.rpcCalls).toContain('fn_sa_unread_notification_count');
    unsub();
  });

  it('falls back to the windowed diff when the RPC is absent', async () => {
    h.state.rows = [notification('a'), notification('b'), notification('c')];
    h.state.reads = [{ notification_id: 'b' }];
    h.state.rpcResult = { data: null, error: { message: 'missing' } };

    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    expect(store.getSnapshot().unreadCount).toBe(2);
    unsub();
  });

  it('marks read state from this operator rows only', async () => {
    h.state.rows = [notification('a'), notification('b')];
    h.state.reads = [{ notification_id: 'a' }];
    h.state.rpcResult = { data: 1, error: null };

    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    const snap = store.getSnapshot();
    expect(snap.notifications.find((n) => n.id === 'a')?.is_read).toBe(true);
    expect(snap.notifications.find((n) => n.id === 'b')?.is_read).toBe(false);
    unsub();
  });

  it('reports unavailable rather than throwing on an un-migrated database', async () => {
    h.state.rowsError = { message: 'relation does not exist' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    expect(store.getSnapshot().unavailable).toBe(true);
    expect(store.getSnapshot().loading).toBe(false);
    unsub();
    spy.mockRestore();
  });
});

// ============================================================
// Realtime
// ============================================================

describe('realtime', () => {
  async function mounted() {
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();
    const ch = h.state.channels.get('super-admin-notifications')!;
    return { store, ch, unsub };
  }

  it('prepends a new event and bumps the badge', async () => {
    const { store, ch, unsub } = await mounted();
    ch.emit('super_admin_notifications', 'INSERT', {
      eventType: 'INSERT',
      new: notification('new-1'),
    });
    const snap = store.getSnapshot();
    expect(snap.notifications[0].id).toBe('new-1');
    expect(snap.notifications[0].is_read).toBe(false);
    expect(snap.unreadCount).toBe(1);
    unsub();
  });

  it('ignores a redelivered event', async () => {
    const { store, ch, unsub } = await mounted();
    const payload = { eventType: 'INSERT', new: notification('dup') };
    ch.emit('super_admin_notifications', 'INSERT', payload);
    ch.emit('super_admin_notifications', 'INSERT', payload);
    expect(store.getSnapshot().notifications).toHaveLength(1);
    expect(store.getSnapshot().unreadCount).toBe(1);
    unsub();
  });

  it('ignores another operator read state', async () => {
    h.state.rows = [notification('a')];
    h.state.rpcResult = { data: 1, error: null };
    const { store, ch, unsub } = await mounted();

    ch.emit('super_admin_notification_reads', 'INSERT', {
      eventType: 'INSERT',
      new: { notification_id: 'a', user_id: 'someone-else' },
    });

    // Their badge cleared, not ours.
    expect(store.getSnapshot().unreadCount).toBe(1);
    expect(store.getSnapshot().notifications[0].is_read).toBe(false);
    unsub();
  });

  it('applies our own read state from another tab', async () => {
    h.state.rows = [notification('a')];
    h.state.rpcResult = { data: 1, error: null };
    const { store, ch, unsub } = await mounted();

    ch.emit('super_admin_notification_reads', 'INSERT', {
      eventType: 'INSERT',
      new: { notification_id: 'a', user_id: 'admin-1' },
    });

    expect(store.getSnapshot().unreadCount).toBe(0);
    expect(store.getSnapshot().notifications[0].is_read).toBe(true);
    unsub();
  });

  it('does not double-count when our own optimistic update echoes back', async () => {
    h.state.rows = [notification('a')];
    h.state.rpcResult = { data: 1, error: null };
    const { store, ch, unsub } = await mounted();

    await store.markRead('a');
    expect(store.getSnapshot().unreadCount).toBe(0);

    // The write we just made comes back over the wire.
    ch.emit('super_admin_notification_reads', 'INSERT', {
      eventType: 'INSERT',
      new: { notification_id: 'a', user_id: 'admin-1' },
    });

    expect(store.getSnapshot().unreadCount).toBe(0);
    unsub();
  });
});

// ============================================================
// Marking read
// ============================================================

describe('marking read', () => {
  it('markRead is optimistic and writes the operator own row', async () => {
    h.state.rows = [notification('a')];
    h.state.rpcResult = { data: 1, error: null };
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    await store.markRead('a');

    expect(store.getSnapshot().notifications[0].is_read).toBe(true);
    expect(store.getSnapshot().unreadCount).toBe(0);
    expect(h.state.upserts).toEqual([
      { notification_id: 'a', user_id: 'admin-1' },
    ]);
    unsub();
  });

  it('markRead is a no-op on an already-read notification', async () => {
    h.state.rows = [notification('a')];
    h.state.reads = [{ notification_id: 'a' }];
    h.state.rpcResult = { data: 0, error: null };
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    await store.markRead('a');
    expect(h.state.upserts).toEqual([]);
    unsub();
  });

  it('markAllRead clears everything and calls the RPC', async () => {
    h.state.rows = [notification('a'), notification('b')];
    h.state.rpcResult = { data: 2, error: null };
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();

    // After the mark, a reload reports zero unread.
    h.state.reads = [{ notification_id: 'a' }, { notification_id: 'b' }];
    h.state.rpcResult = { data: 0, error: null };
    await store.markAllRead();

    expect(store.getSnapshot().unreadCount).toBe(0);
    expect(store.getSnapshot().notifications.every((n) => n.is_read)).toBe(
      true
    );
    expect(h.state.rpcCalls).toContain('fn_sa_mark_all_notifications_read');
    unsub();
  });

  it('markAllRead rolls back when the write fails', async () => {
    h.state.rows = [notification('a'), notification('b')];
    h.state.reads = [];
    h.state.rpcResult = { data: 2, error: null };
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();
    expect(store.getSnapshot().unreadCount).toBe(2);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.state.rpcResult = { data: null, error: { message: 'denied' } };
    await store.markAllRead();

    // Leaving a cleared badge over a failed write is precisely how the
    // original bug looked: cleared, then back after a refresh.
    expect(store.getSnapshot().unreadCount).toBe(2);
    expect(store.getSnapshot().notifications.every((n) => !n.is_read)).toBe(
      true
    );
    unsub();
    spy.mockRestore();
  });
});

// ============================================================
// Snapshot identity — useSyncExternalStore requires it
// ============================================================

describe('snapshot', () => {
  it('is referentially stable between changes', async () => {
    const store = await freshStore();
    const unsub = store.subscribe(() => {});
    await store.load();
    // A fresh object per read would loop forever in React.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    unsub();
  });

  it('notifies listeners when it changes', async () => {
    h.state.rows = [notification('a')];
    const store = await freshStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    await store.load();
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
