import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
});
vi.mock('@/lib/storage/s3-client', () => ({ deleteS3Prefix: vi.fn() }));

import {
  DELETION_TOKEN_TTL_MS,
  accountStoragePrefixes,
  checkDeletionToken,
  isConfirmWord,
  issueDeletionToken,
} from './account-deletion';
import { isSameOrigin } from './request-origin';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ACCT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('deletion token', () => {
  const now = 1_760_000_000_000;

  it('is valid only for the same admin, account and time window', () => {
    const { token } = issueDeletionToken(ADMIN, ACCT, now);
    expect(checkDeletionToken(token, ADMIN, ACCT, now + 1000)).toBe(true);
    expect(checkDeletionToken(token, OTHER, ACCT, now)).toBe(false);
    expect(checkDeletionToken(token, ADMIN, OTHER, now)).toBe(false);
    expect(
      checkDeletionToken(token, ADMIN, ACCT, now + DELETION_TOKEN_TTL_MS + 1)
    ).toBe(false);
  });

  it('rejects tampered or junk tokens', () => {
    const { token } = issueDeletionToken(ADMIN, ACCT, now);
    const [payload, mac] = token.split('.');
    const forged = Buffer.from(`${ADMIN}.${OTHER}.${now + 60_000}`).toString(
      'base64url'
    );
    expect(checkDeletionToken(`${forged}.${mac}`, ADMIN, OTHER, now)).toBe(
      false
    );
    expect(
      checkDeletionToken(`${payload}.${mac.slice(1)}x`, ADMIN, ACCT, now)
    ).toBe(false);
    for (const junk of [null, 42, '', 'abc', '.', 'x'.repeat(500)]) {
      expect(checkDeletionToken(junk, ADMIN, ACCT, now)).toBe(false);
    }
  });
});

describe('confirmation word', () => {
  it('requires exactly CONFIRM', () => {
    expect(isConfirmWord('CONFIRM')).toBe(true);
    expect(isConfirmWord(' CONFIRM ')).toBe(true);
    for (const v of ['confirm', 'Confirm', 'CONFIRMED', '', null, undefined]) {
      expect(isConfirmWord(v)).toBe(false);
    }
  });
});

describe('storage prefixes', () => {
  it('covers every account-scoped folder, avatars and support chats', () => {
    const p = accountStoragePrefixes(ACCT, ['u1'], ['c1']);
    expect(p).toEqual([
      `chat-media/account-${ACCT}/`,
      `flow-media/account-${ACCT}/`,
      `template-review-media/account-${ACCT}/`,
      `template-send-media/account-${ACCT}/`,
      `business-profile/account-${ACCT}/`,
      'avatars/u1/',
      'support-chat/c1/',
    ]);
    // Every prefix is two segments deep, so deleteS3Prefix accepts it and
    // can never be pointed at a whole top-level folder.
    for (const prefix of p) {
      expect(prefix).toMatch(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/$/);
    }
  });
});

describe('isSameOrigin', () => {
  const req = (h: Record<string, string>) =>
    new Request('https://app.test/x', { headers: h });
  beforeEach(() => vi.clearAllMocks());
  it('allows only same-host Origin', () => {
    expect(
      isSameOrigin(req({ origin: 'https://app.test', host: 'app.test' }))
    ).toBe(true);
    expect(
      isSameOrigin(req({ origin: 'https://evil.test', host: 'app.test' }))
    ).toBe(false);
    expect(isSameOrigin(req({ host: 'app.test' }))).toBe(false);
    expect(
      isSameOrigin(
        req({
          origin: 'https://wacrm.example',
          host: 'internal:3000',
          'x-forwarded-host': 'wacrm.example',
        })
      )
    ).toBe(true);
  });
});
