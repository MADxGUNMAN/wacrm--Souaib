// POST /api/security/two-factor/recovery-codes — { "code": "..." }
// Replaces all recovery codes; the old ones stop working.

import { regenerateRecoveryCodes } from '@/lib/two-factor/server';
import {
  CODE_ATTEMPT_LIMIT,
  requireVerifiedSession,
  twoFactorRoute,
} from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return twoFactorRoute(
    request,
    'POST /api/security/two-factor/recovery-codes',
    { key: 'recovery', ...CODE_ATTEMPT_LIMIT },
    async ({ ctx, gate, meta, body }) => {
      requireVerifiedSession(gate);
      return regenerateRecoveryCodes(ctx, body.code, meta);
    }
  );
}
