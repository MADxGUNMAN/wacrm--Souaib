// PUT /api/security/two-factor/workspace — owner only.
// Body: { "require_owner_verification": true|false, "code": "123456" }
// Turns "Require Owner 2FA Verification for Members" on or off. Needs the
// owner's current authenticator code either way.

import { TwoFactorError, setOwnerVerification } from '@/lib/two-factor/server';
import {
  CODE_ATTEMPT_LIMIT,
  requireVerifiedSession,
  twoFactorRoute,
} from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  return twoFactorRoute(
    request,
    'PUT /api/security/two-factor/workspace',
    { key: 'workspace', ...CODE_ATTEMPT_LIMIT },
    async ({ ctx, gate, meta, body }) => {
      requireVerifiedSession(gate);
      if (typeof body.require_owner_verification !== 'boolean') {
        throw new TwoFactorError(
          "'require_owner_verification' must be true or false",
          400,
          'invalid_body'
        );
      }
      return setOwnerVerification(
        ctx,
        body.require_owner_verification,
        body.code,
        meta
      );
    }
  );
}
