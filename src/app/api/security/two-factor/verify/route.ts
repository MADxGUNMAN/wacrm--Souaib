// ============================================================
// POST /api/security/two-factor/verify — complete sign-in.
//
// Body: { "code": "123456", "method": "totp" | "recovery" }
// Checks the code the gate requires for this session (the user's own,
// or the workspace owner's) and marks the session verified. Reachable
// before verification (the proxy lets it through).
//
// Brute force: 10 tries per 15 min per user, and owner codes are also
// limited per owner across all members.
// ============================================================

import { checkRateLimit } from '@/lib/rate-limit';
import { TwoFactorError, verifySignIn } from '@/lib/two-factor/server';
import { CODE_ATTEMPT_LIMIT, twoFactorRoute } from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

const OWNER_CODE_LIMIT = { limit: 30, windowMs: 15 * 60_000 } as const;

export async function POST(request: Request) {
  return twoFactorRoute(
    request,
    'POST /api/security/two-factor/verify',
    { key: 'verify', ...CODE_ATTEMPT_LIMIT },
    async ({ ctx, gate, meta, body }) => {
      if (gate.required === 'owner' && ctx.accountId) {
        // Shared budget for guesses at one workspace owner's code.
        const r = checkRateLimit(
          `2fa:ownerCode:${ctx.accountId}`,
          OWNER_CODE_LIMIT
        );
        if (!r.success) {
          throw new TwoFactorError(
            'Too many attempts for this workspace. Try again in a few minutes.',
            429,
            'rate_limited'
          );
        }
      }
      const method = body.method === 'recovery' ? 'recovery' : 'totp';
      const result = await verifySignIn(
        ctx,
        gate,
        { code: body.code, method },
        meta
      );
      return { ok: true, ...result };
    }
  );
}
