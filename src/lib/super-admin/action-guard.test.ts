import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  profile: null as null | { is_super_admin: boolean },
  profileError: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
  }),
}));
vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.profile,
            error: state.profileError,
          }),
        }),
      }),
    }),
  }),
}));

import { requireSuperAdminAction } from './action-guard';

beforeEach(() => {
  state.user = null;
  state.profile = null;
  state.profileError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireSuperAdminAction', () => {
  it('rejects signed-out callers', async () => {
    expect(await requireSuperAdminAction()).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects signed-in users who are not super admins', async () => {
    state.user = { id: 'u1' };
    state.profile = { is_super_admin: false };
    const res = await requireSuperAdminAction();
    expect(res.ok).toBe(false);
  });

  it('rejects when there is no profile row or the lookup fails', async () => {
    state.user = { id: 'u1' };
    expect((await requireSuperAdminAction()).ok).toBe(false);
    state.profileError = { message: 'down' };
    expect((await requireSuperAdminAction()).ok).toBe(false);
  });

  it('allows super admins', async () => {
    state.user = { id: 'u1' };
    state.profile = { is_super_admin: true };
    expect(await requireSuperAdminAction()).toEqual({ ok: true, userId: 'u1' });
  });
});
