// GET /api/security/two-factor/challenge — which code the /two-factor
// page must ask for (none | personal | owner), whether this session has
// already passed, and the owner's name to show members whom to contact.
// Reachable before verification (the proxy lets it through).

import { getChallenge } from '@/lib/two-factor/server';
import { twoFactorRoute } from '@/lib/two-factor/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return twoFactorRoute(
    request,
    'GET /api/security/two-factor/challenge',
    { key: 'challenge', limit: 60, windowMs: 60_000 },
    ({ ctx, gate }) => getChallenge(ctx, gate)
  );
}
