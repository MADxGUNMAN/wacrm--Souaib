// GET /api/security/two-factor — the caller's 2FA status: personal
// authenticator, workspace owner-verification setting, current session.

import { getTwoFactorStatus } from '@/lib/two-factor/server';
import { requireVerifiedSession, twoFactorRoute } from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return twoFactorRoute(
    request,
    'GET /api/security/two-factor',
    { key: 'status', limit: 60, windowMs: 60_000 },
    async ({ ctx, gate }) => {
      requireVerifiedSession(gate);
      return getTwoFactorStatus(ctx, gate);
    }
  );
}
