// POST /api/security/two-factor/enroll — start setting up an
// authenticator app: returns a new secret, its otpauth:// URI and a QR
// code. Nothing is active until /enroll/confirm checks a code.

import { startEnrollment } from '@/lib/two-factor/server';
import { requireVerifiedSession, twoFactorRoute } from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return twoFactorRoute(
    request,
    'POST /api/security/two-factor/enroll',
    { key: 'enroll', limit: 10, windowMs: 15 * 60_000 },
    async ({ ctx, gate }) => {
      requireVerifiedSession(gate);
      return startEnrollment(ctx);
    }
  );
}
