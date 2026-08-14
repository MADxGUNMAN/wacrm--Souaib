import crypto from 'crypto';

function getSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for email token signing. ' +
      'Set it in your environment variables.',
    );
  }
  return key;
}

export interface EmailTokenPayload {
  userId: string;
  newEmail: string;
  exp: number;
}

export function createEmailChangeToken(userId: string, newEmail: string): string {
  const payload: EmailTokenPayload = {
    userId,
    newEmail,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(base64)
    .digest('base64url');
  return `${base64}.${hmac}`;
}

export function verifyEmailChangeToken(token: string): EmailTokenPayload | null {
  try {
    const [base64, hmac] = token.split('.');
    if (!base64 || !hmac) return null;

    const expectedHmac = crypto
      .createHmac('sha256', getSecret())
      .update(base64)
      .digest('base64url');

    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expectedHmac);

    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return null;

    const payload: EmailTokenPayload = JSON.parse(
      Buffer.from(base64, 'base64url').toString('utf-8'),
    );

    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}
