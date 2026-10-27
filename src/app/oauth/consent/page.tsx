// ============================================================
// /oauth/consent — "Allow Claude to access your Replai workspace?"
//
// Server component: loads the pending authorization request by its
// opaque id, requires a signed-in user (else /login?next=…), re-checks
// account state / workspace policy / role, binds the request to this
// user and mints a fresh CSRF token for the form. Nothing from the
// client's original query string is rendered — the app name comes from
// our own registry, never from self-asserted metadata.
// ============================================================

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isLoopbackRedirect } from '@/lib/ai-connector/clients';
import { getConfig } from '@/lib/ai-connector/config';
import {
  loadConsentContext,
  type ConsentBlock,
} from '@/lib/ai-connector/consent';
import {
  AUTHORIZE_ERROR_REASONS,
  authorizationRedirect,
  type AuthorizeErrorReason,
} from '@/lib/ai-connector/oauth';
import {
  adminDb,
  bindRequestToUser,
  getAuthorizationRequest,
} from '@/lib/ai-connector/store';
import { loginUrlWithNext } from '@/lib/auth/next-path';
import { createClient } from '@/lib/supabase/server';
import { ConsentError, ConsentForm } from './consent-form';

export const metadata: Metadata = {
  title: 'Connect an app',
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | null {
  return typeof v === 'string' ? v : null;
}

/** Host of the registered redirect URI (validated before we got here). */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}

function isAuthorizeReason(v: string | null): v is AuthorizeErrorReason {
  return (
    v !== null && (AUTHORIZE_ERROR_REASONS as readonly string[]).includes(v)
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const error = one(sp.error);
  if (error !== null) {
    return (
      <ConsentError reason={isAuthorizeReason(error) ? error : 'unavailable'} />
    );
  }

  const config = getConfig();
  if (!config.enabled) return <ConsentError reason="unavailable" />;

  const requestId = one(sp.request_id);
  if (!requestId) return <ConsentError reason="expired" />;

  const db = adminDb();
  const request = await getAuthorizationRequest(db, requestId);
  if (!request || request.issuer !== config.issuer) {
    return <ConsentError reason="expired" />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(loginUrlWithNext(`/oauth/consent?request_id=${requestId}`));
  }

  // "Cancel" for every blocked state: tell the app the user declined.
  const cancelUrl = authorizationRedirect(
    request.redirect_uri,
    config.issuer,
    { error: 'access_denied' },
    request.state
  );

  const loaded = await loadConsentContext(db, config, request, user.id);
  if (!loaded.ok) {
    const block: ConsentBlock = loaded.block;
    return (
      <ConsentError
        reason={block}
        cancelUrl={block === 'expired' ? undefined : cancelUrl}
        email={user.email ?? null}
        requestId={requestId}
      />
    );
  }
  const { ctx } = loaded;

  let csrf: string;
  try {
    csrf = await bindRequestToUser(db, config, requestId, user.id);
  } catch {
    return <ConsentError reason="expired" />;
  }

  return (
    <ConsentForm
      requestId={requestId}
      csrf={csrf}
      appName={ctx.client.display_name}
      platform={ctx.client.platform}
      devClient={ctx.client.trust !== 'trusted'}
      clientHost={
        ctx.client.kind === 'cimd' && ctx.client.trust !== 'trusted'
          ? new URL(ctx.client.client_id).hostname
          : null
      }
      loopback={isLoopbackRedirect(request.redirect_uri)}
      accountName={ctx.accountName}
      email={ctx.userEmail ?? user.email ?? null}
      userName={ctx.userName}
      returnHost={hostOf(request.redirect_uri)}
      alwaysScopes={ctx.alwaysScopes}
      options={ctx.options}
      reconnect={ctx.existing !== null}
    />
  );
}
