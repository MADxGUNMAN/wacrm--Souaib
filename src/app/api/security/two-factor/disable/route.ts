// POST /api/security/two-factor/disable — { "code": "<6 digits or recovery code>" }
// Turns personal 2FA off. Refused for an owner while owner verification
// is on, since members sign in with the owner's authenticator.

import { disableTwoFactor } from '@/lib/two-factor/server';
import {
  CODE_ATTEMPT_LIMIT,
  requireVerifiedSession,
  twoFactorRoute,
} from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return twoFactorRoute(
    request,
    'POST /api/security/two-factor/disable',
    { key: 'disable', ...CODE_ATTEMPT_LIMIT },
    async ({ ctx, gate, meta, body }) => {
      requireVerifiedSession(gate);
      await disableTwoFactor(ctx, body.code, meta);
      return { ok: true };
    }
  );
}
