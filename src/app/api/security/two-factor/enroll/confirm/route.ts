// POST /api/security/two-factor/enroll/confirm — { "code": "123456" }
// Turns 2FA on once the app's first code checks out. Returns the
// recovery codes, which are never shown again.

import { confirmEnrollment } from '@/lib/two-factor/server';
import {
  CODE_ATTEMPT_LIMIT,
  requireVerifiedSession,
  twoFactorRoute,
} from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return twoFactorRoute(
    request,
    'POST /api/security/two-factor/enroll/confirm',
    { key: 'confirm', ...CODE_ATTEMPT_LIMIT },
    async ({ ctx, gate, meta, body }) => {
      requireVerifiedSession(gate);
      return confirmEnrollment(ctx, body.code, meta);
    }
  );
}
