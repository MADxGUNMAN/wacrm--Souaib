import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.hoisted(() => {
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);
});
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/admin-client', () => ({ supabaseAdmin: vi.fn() }));

import {
  createFakeAdmin,
  type FakeAdmin,
} from '@/lib/security/fake-admin.test-util';
import type { SecurityContext } from '@/lib/security/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { totpAt } from './totp';
import type { TwoFactorGateResult } from './gate';
import {
  confirmEnrollment,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  setOwnerVerification,
  startEnrollment,
  verifySignIn,
} from './server';

const OWNER = 'owner-1';
const M1 = 'member-1';
const M2 = 'member-2';
const ACCT = 'acct-1';
const meta = {
  ip: '27.54.191.65',
  user_agent: 'test',
  timezone: 'Asia/Kolkata',
  country_code: 'IN',
  platform: 'Windows',
  device_type: 'Desktop',
  browser: 'Chrome',
  browser_version: '141',
};

let db: FakeAdmin;
let clock = Date.UTC(2026, 9, 17, 10, 0, 0);

const tick = (seconds = 30) => {
  clock += seconds * 1000;
  vi.setSystemTime(clock);
};

function ctxFor(userId: string, sessionId = `sess-${userId}`): SecurityContext {
  return {
    userId,
    accountId: ACCT,
    sessionId,
    admin: db as unknown as SupabaseClient,
  };
}

/** JS mirror of public.security_two_factor_gate() for the test DB. */
function gateFor(ctx: SecurityContext): TwoFactorGateResult {
  const acct = db.tables.accounts.find((a) => a.id === ctx.accountId)!;
  const active = (uid: string) =>
    (db.tables.user_two_factor ?? []).some(
      (r) => r.user_id === uid && r.status === 'active'
    );
  let required: TwoFactorGateResult['required'] = 'none';
  if (
    acct.require_owner_two_factor &&
    acct.owner_user_id !== ctx.userId &&
    active(OWNER)
  ) {
    required = 'owner';
  } else if (active(ctx.userId)) required = 'personal';
  if (required === 'none') return { required, satisfied: true };
  const s = (db.tables.user_sessions ?? []).find(
    (r) => r.session_id === ctx.sessionId && r.user_id === ctx.userId
  );
  const method = s?.two_factor_verified_at
    ? (s.two_factor_method as string)
    : null;
  return {
    required,
    satisfied: !!method && (required === 'personal' || method === 'owner'),
  };
}

function secretOf(userId: string): string {
  const row = db.tables.user_two_factor.find((r) => r.user_id === userId)!;
  return decrypt(row.secret_enc as string);
}

async function enroll(userId: string): Promise<string[]> {
  const ctx = ctxFor(userId);
  ensureSession(ctx);
  await startEnrollment(ctx);
  const { recovery_codes } = await confirmEnrollment(
    ctx,
    totpAt(secretOf(userId)),
    meta
  );
  tick();
  return recovery_codes;
}

/** A fresh sign-in on a new device: new session, not yet verified. */
function newDevice(userId: string): SecurityContext {
  return ctxFor(
    userId,
    `sess-${userId}-${Math.random().toString(36).slice(2)}`
  );
}

const events = (userId: string, type?: string) =>
  (db.tables.security_events ?? []).filter(
    (e) => e.user_id === userId && (!type || e.event_type === type)
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  db = createFakeAdmin();
  db.tables.accounts = [
    { id: ACCT, owner_user_id: OWNER, require_owner_two_factor: false },
  ];
  db.tables.profiles = [OWNER, M1, M2].map((u) => ({
    user_id: u,
    account_id: ACCT,
    full_name: u === OWNER ? 'Olivia Owner' : `Name ${u}`,
    email: `${u}@example.com`,
  }));
  db.rpcHandlers.security_list_auth_sessions = () => ({
    data: [],
    error: null,
  });
  db.rpcHandlers.security_two_factor_claim_step = (a) => {
    db.tables.two_factor_used_steps ??= [];
    const row = db.tables.two_factor_used_steps.find(
      (r) =>
        r.user_id === a.p_user_id && r.secret_user_id === a.p_secret_user_id
    );
    if (row && (row.last_step as number) >= (a.p_step as number)) {
      return { data: false, error: null };
    }
    if (row) row.last_step = a.p_step;
    else
      db.tables.two_factor_used_steps.push({
        user_id: a.p_user_id,
        secret_user_id: a.p_secret_user_id,
        last_step: a.p_step,
      });
    return { data: true, error: null };
  };
  // Sessions already exist when the user reaches 2FA (password step done).
  db.tables.user_sessions = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

const ensureSession = (ctx: SecurityContext) => {
  if (!db.tables.user_sessions.some((s) => s.session_id === ctx.sessionId)) {
    db.tables.user_sessions.push({
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      last_seen_at: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
      ended_at: null,
    });
  }
};

async function signIn(
  ctx: SecurityContext,
  code: string,
  method: 'totp' | 'recovery' = 'totp'
) {
  ensureSession(ctx);
  return verifySignIn(ctx, gateFor(ctx), { code, method }, meta);
}

describe('personal 2FA', () => {
  it('is off by default and independent per user', async () => {
    await enroll(OWNER);
    await enroll(M1);
    const m2 = await getTwoFactorStatus(ctxFor(M2), gateFor(ctxFor(M2)));
    expect(m2.personal.status).toBe('off');
    expect(gateFor(newDevice(M2)).required).toBe('none');
    expect(gateFor(newDevice(M1)).required).toBe('personal');
    expect(gateFor(newDevice(OWNER)).required).toBe('personal');
  });

  it('enrolling stores an encrypted secret and keeps this session verified', async () => {
    const codes = await enroll(M1);
    expect(codes).toHaveLength(10);
    const row = db.tables.user_two_factor.find((r) => r.user_id === M1)!;
    expect(row.status).toBe('active');
    expect(String(row.secret_enc)).not.toContain(secretOf(M1));
    expect(gateFor(ctxFor(M1)).satisfied).toBe(true);
    expect(events(M1, 'two_factor_enabled')).toHaveLength(1);
  });

  it('a new device needs the user’s code; wrong and replayed codes fail', async () => {
    await enroll(M1);
    const dev = newDevice(M1);
    expect(gateFor(dev)).toEqual({ required: 'personal', satisfied: false });
    await expect(signIn(dev, '000000')).rejects.toMatchObject({
      code: 'invalid_code',
    });
    const code = totpAt(secretOf(M1));
    expect(await signIn(dev, code)).toEqual({ method: 'personal' });
    expect(gateFor(dev).satisfied).toBe(true);

    const dev2 = newDevice(M1);
    await expect(signIn(dev2, code)).rejects.toMatchObject({
      code: 'code_reused',
    });
    expect(events(M1, 'two_factor_failed').length).toBe(2);
  });

  it('recovery codes work once', async () => {
    const codes = await enroll(M1);
    const dev = newDevice(M1);
    expect(await signIn(dev, codes[0], 'recovery')).toEqual({
      method: 'recovery',
    });
    await expect(
      signIn(newDevice(M1), codes[0], 'recovery')
    ).rejects.toMatchObject({
      code: 'invalid_code',
    });
    const status = await getTwoFactorStatus(ctxFor(M1), gateFor(ctxFor(M1)));
    expect(status.personal.recovery_codes_remaining).toBe(9);
  });

  it('disable needs a valid code; regenerate replaces all codes', async () => {
    const codes = await enroll(M1);
    await expect(
      disableTwoFactor(ctxFor(M1), '123', meta)
    ).rejects.toMatchObject({
      code: 'invalid_code',
    });
    const fresh = await regenerateRecoveryCodes(
      ctxFor(M1),
      totpAt(secretOf(M1)),
      meta
    );
    tick();
    await expect(
      signIn(newDevice(M1), codes[1], 'recovery')
    ).rejects.toBeTruthy();
    await disableTwoFactor(ctxFor(M1), fresh.recovery_codes[0], meta);
    expect(db.tables.user_two_factor.some((r) => r.user_id === M1)).toBe(false);
    expect(gateFor(newDevice(M1)).required).toBe('none');
  });

  it('refuses a second enrollment while active', async () => {
    await enroll(M1);
    await expect(startEnrollment(ctxFor(M1))).rejects.toMatchObject({
      code: 'already_enabled',
    });
  });
});

describe('workspace owner verification', () => {
  it('requires the owner to have 2FA and only the owner can change it', async () => {
    await expect(
      setOwnerVerification(ctxFor(OWNER), true, '000000', meta)
    ).rejects.toMatchObject({
      code: 'owner_two_factor_required',
    });
    await enroll(M1);
    await expect(
      setOwnerVerification(ctxFor(M1), true, totpAt(secretOf(M1)), meta)
    ).rejects.toMatchObject({ code: 'not_owner', status: 403 });
    await enroll(OWNER);
    await expect(
      setOwnerVerification(ctxFor(OWNER), true, '000000', meta)
    ).rejects.toMatchObject({
      code: 'invalid_code',
    });
    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    expect(db.tables.accounts[0].require_owner_two_factor).toBe(true);
    expect(events(OWNER, 'owner_verification_enabled')).toHaveLength(1);
  });

  it('follows the priority table', async () => {
    await enroll(OWNER);
    await enroll(M1); // M1 has personal 2FA, M2 does not
    tick();

    // Requirement OFF
    expect(gateFor(newDevice(OWNER)).required).toBe('personal');
    expect(gateFor(newDevice(M1)).required).toBe('personal');
    expect(gateFor(newDevice(M2)).required).toBe('none');

    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    tick();

    // Requirement ON
    expect(gateFor(newDevice(OWNER)).required).toBe('personal');
    expect(gateFor(newDevice(M1)).required).toBe('owner');
    expect(gateFor(newDevice(M2)).required).toBe('owner');
  });

  it('members must use the owner’s code; their own code is rejected', async () => {
    await enroll(OWNER);
    await enroll(M1);
    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    tick();

    const m1 = newDevice(M1);
    await expect(signIn(m1, totpAt(secretOf(M1)))).rejects.toMatchObject({
      code: 'invalid_code',
    });
    await expect(signIn(m1, 'ABCDE-FGHJK', 'recovery')).rejects.toBeTruthy();

    const ownerCode = totpAt(secretOf(OWNER));
    expect(await signIn(m1, ownerCode)).toEqual({ method: 'owner' });
    expect(gateFor(m1).satisfied).toBe(true);

    // Another member can use the same live code once; nobody can replay it.
    const m2 = newDevice(M2);
    expect(await signIn(m2, ownerCode)).toEqual({ method: 'owner' });
    await expect(signIn(newDevice(M2), ownerCode)).rejects.toMatchObject({
      code: 'code_reused',
    });

    // The owner sees where their code was used.
    expect(events(OWNER, 'owner_code_used').map((e) => e.metadata)).toEqual([
      { member: 'Name member-1' },
      { member: 'Name member-2' },
    ]);
  });

  it('a session verified with a personal code must re-verify once the owner requires it', async () => {
    await enroll(OWNER);
    await enroll(M1);
    const m1 = newDevice(M1);
    await signIn(m1, totpAt(secretOf(M1)));
    expect(gateFor(m1).satisfied).toBe(true);
    tick();
    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    expect(gateFor(m1)).toEqual({ required: 'owner', satisfied: false });
  });

  it('the owner cannot disable personal 2FA while the requirement is on', async () => {
    await enroll(OWNER);
    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    tick();
    await expect(
      disableTwoFactor(ctxFor(OWNER), totpAt(secretOf(OWNER)), meta)
    ).rejects.toMatchObject({ code: 'owner_verification_on' });
    await setOwnerVerification(
      ctxFor(OWNER),
      false,
      totpAt(secretOf(OWNER)),
      meta
    );
    tick();
    expect(gateFor(newDevice(M2)).required).toBe('none');
    await disableTwoFactor(ctxFor(OWNER), totpAt(secretOf(OWNER)), meta);
  });

  it('members see the owner setting in their status', async () => {
    await enroll(OWNER);
    let s = await getTwoFactorStatus(ctxFor(M2), gateFor(ctxFor(M2)));
    expect(s.workspace).toMatchObject({
      is_owner: false,
      require_owner_verification: false,
      owner_verification_active: false,
    });
    await setOwnerVerification(
      ctxFor(OWNER),
      true,
      totpAt(secretOf(OWNER)),
      meta
    );
    s = await getTwoFactorStatus(ctxFor(M2), {
      required: 'owner',
      satisfied: true,
    });
    expect(s.workspace).toMatchObject({
      require_owner_verification: true,
      owner_has_two_factor: true,
      owner_verification_active: true,
    });
  });
});
