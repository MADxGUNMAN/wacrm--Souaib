// ============================================================
// POST /api/oauth/decision — the user's Allow / Deny on the consent page.
//
// Defences, in order:
//   * same-origin only (Origin header must be our issuer)
//   * signed-in user must be the one the request was bound to
//   * CSRF token from the rendered form (HMAC-compared)
//   * the request is consumed atomically — a second submit fails
//   * policy, role and account state are re-derived here, never taken
//     from the page; granted scopes ⊆ requested ∩ available ∩ chosen
//
// Answers JSON `{ redirect_url }`; the page navigates there.
// ============================================================

import { after, NextResponse } from 'next/server';
import { getConfig } from '@/lib/ai-connector/config';
import {
  grantedScopesFor,
  loadConsentContext,
  settingsAfterConsent,
} from '@/lib/ai-connector/consent';
import { onConnectionCreated } from '@/lib/ai-connector/events';
import { authorizationRedirect } from '@/lib/ai-connector/oauth';
import { normalizeConnectionSettings } from '@/lib/ai-connector/settings';
import {
  adminDb,
  consumeAuthorizationRequest,
  getAuthorizationRequest,
  getOrCreateProfileId,
  issueAuthorizationCode,
  touchClient,
  upsertConnection,
} from '@/lib/ai-connector/store';
import { hashSecret, safeEqual } from '@/lib/ai-connector/tokens';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

function fail(status: number, code: string) {
  return NextResponse.json(
    { code },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

function ok(redirectUrl: string) {
  return NextResponse.json(
    { redirect_url: redirectUrl },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const config = getConfig();
  if (!config.enabled) return fail(503, 'unavailable');

  // Same-origin only. Browsers always send Origin on a POST fetch.
  const origin = request.headers.get('origin');
  if (!origin || origin !== config.issuer) return fail(403, 'bad_origin');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, 'unauthenticated');

  const limit = checkRateLimit(
    `ai-decision:${user.id}`,
    RATE_LIMITS.oauthDecision
  );
  if (!limit.success) return rateLimitResponse(limit);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return fail(400, 'bad_request');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request');
  }
  const requestId = typeof body.request_id === 'string' ? body.request_id : '';
  const csrf = typeof body.csrf === 'string' ? body.csrf : '';
  const decision = body.decision;
  const tiers = Array.isArray(body.tiers)
    ? body.tiers.filter((t): t is string => typeof t === 'string').slice(0, 10)
    : [];
  if (decision !== 'allow' && decision !== 'deny')
    return fail(400, 'bad_request');

  const db = adminDb();
  const pending = await getAuthorizationRequest(db, requestId);
  if (!pending || pending.issuer !== config.issuer) return fail(409, 'expired');
  if (pending.user_id !== user.id) return fail(403, 'wrong_user');
  if (
    !csrf ||
    !safeEqual(hashSecret(csrf, config.tokenPepper), pending.csrf_hash)
  ) {
    return fail(403, 'bad_csrf');
  }

  // Re-derive everything before consuming, so a blocked user gets a
  // clear answer and the request isn't burnt by a doomed attempt.
  const loaded =
    decision === 'allow'
      ? await loadConsentContext(db, config, pending, user.id)
      : null;

  const consumed = await consumeAuthorizationRequest(db, requestId, user.id);
  if (!consumed) return fail(409, 'expired');

  const deny = () =>
    ok(
      authorizationRedirect(
        consumed.redirect_uri,
        config.issuer,
        { error: 'access_denied' },
        consumed.state
      )
    );

  if (decision === 'deny' || !loaded) return deny();
  if (!loaded.ok) {
    // Blocked since the page rendered (policy changed, account banned…):
    // tell the app the user could not grant access.
    return deny();
  }
  const { ctx } = loaded;

  const scopes = grantedScopesFor(
    consumed.requested_scopes,
    tiers,
    ctx.options
  );
  const existingSettings = ctx.existing
    ? normalizeConnectionSettings(ctx.existing.settings)
    : null;

  try {
    const { connection, created } = await upsertConnection(db, {
      accountId: ctx.accountId,
      userId: user.id,
      client: ctx.client,
      scopes,
      settings: settingsAfterConsent(existingSettings, scopes),
      issuer: config.issuer,
    });
    await getOrCreateProfileId(db, ctx.accountId, user.id);
    const code = await issueAuthorizationCode(db, config, {
      requestId,
      connectionId: connection.id,
      clientDbId: ctx.client.id,
      redirectUri: consumed.redirect_uri,
      codeChallenge: consumed.code_challenge,
      scopes,
      resource: consumed.resource,
      issuer: config.issuer,
    });

    after(async () => {
      await touchClient(db, ctx.client.id);
      await onConnectionCreated(db, {
        accountId: ctx.accountId,
        userId: user.id,
        connectionId: connection.id,
        platform: ctx.client.platform,
        appName: ctx.client.display_name,
        scopes,
        reconnected: !created,
      });
    });

    return ok(
      authorizationRedirect(
        consumed.redirect_uri,
        config.issuer,
        { code },
        consumed.state
      )
    );
  } catch (err) {
    console.error(
      '[ai-connector] consent decision failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return ok(
      authorizationRedirect(
        consumed.redirect_uri,
        config.issuer,
        { error: 'server_error' },
        consumed.state
      )
    );
  }
}
