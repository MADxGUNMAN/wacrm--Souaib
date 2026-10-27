// ============================================================
// AI connector — side effects of OAuth events: audit rows, the in-app
// notification and the email the user gets when an AI app is connected
// or disconnected for a security reason.
//
// Everything here is best-effort and never throws: a failed email must
// not turn a successful sign-in (or a security revocation) into an error.
// Plan: docs/ai-connector/02-security.md §3.6, T4, T11.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getEmailBranding } from '@/lib/email/branding';
import {
  button,
  heading,
  notice,
  paragraph,
  renderEmail,
  toPlainText,
} from '@/lib/email/layout';
import { sendEmailQuietly } from '@/lib/email/send';
import { writeAudit } from './audit';
import { getConfig } from './config';
import type { TokenEvent } from './oauth';
import type { Platform } from './platforms';
import { SETTINGS_PATH } from './policy';
import { getConnection } from './store';

interface Person {
  email: string | null;
  name: string | null;
}

async function getPerson(db: SupabaseClient, userId: string): Promise<Person> {
  const { data } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .maybeSingle();
  return { email: data?.email ?? null, name: data?.full_name ?? null };
}

function greeting(p: Person): string {
  const first = p.name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi there,';
}

function settingsUrl(): string {
  return `${getConfig().issuer}${SETTINGS_PATH}`;
}

async function notify(
  db: SupabaseClient,
  input: { accountId: string; userId: string; title: string; body: string }
): Promise<void> {
  const { error } = await db.from('notifications').insert({
    account_id: input.accountId,
    user_id: input.userId,
    type: 'ai_connection',
    title: input.title.slice(0, 200),
    body: input.body.slice(0, 500),
    link: SETTINGS_PATH,
  });
  if (error)
    console.error('[ai-connector] notification failed:', error.message);
}

async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(
      `[ai-connector] ${label} failed:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }
}

/** After consent: audit, in-app notification, confirmation email. */
export async function onConnectionCreated(
  db: SupabaseClient,
  input: {
    accountId: string;
    userId: string;
    connectionId: string;
    platform: Platform;
    appName: string;
    scopes: string[];
    reconnected: boolean;
  }
): Promise<void> {
  await writeAudit(db, {
    accountId: input.accountId,
    connectionId: input.connectionId,
    userId: input.userId,
    platform: input.platform,
    action: input.reconnected ? 'oauth.reconnected' : 'oauth.connected',
    args: { scopes: input.scopes },
    outcome: 'ok',
  });

  await safely('connected notification', () =>
    notify(db, {
      accountId: input.accountId,
      userId: input.userId,
      title: `${input.appName} is connected to Replai`,
      body: 'You can change what it may do, or disconnect it, in Settings → AI Connectors.',
    })
  );

  await safely('connected email', async () => {
    const person = await getPerson(db, input.userId);
    if (!person.email) return;
    const branding = await getEmailBranding('ai-connector');
    const content = [
      heading(`${input.appName} was connected to your Replai account`),
      paragraph(greeting(person)),
      paragraph(
        `You just allowed ${input.appName} to work with your Replai workspace as you. It can only do what you allowed on the consent screen, and anything that sends a message asks you to confirm first.`
      ),
      notice({
        tone: 'warning',
        title: "Didn't do this?",
        body: 'Disconnect it now in Settings → AI Connectors, then change your password.',
      }),
      button({ href: settingsUrl(), label: 'Manage AI connectors' }),
    ].join('\n');
    const html = renderEmail({
      siteName: branding.siteName,
      preheader: `${input.appName} can now work with your Replai workspace.`,
      content,
      footerNote:
        'You are receiving this because an app was connected to your account.',
      logoUrl: branding.logoUrl,
      logoDarkUrl: branding.logoDarkUrl,
    });
    await sendEmailQuietly('ai-connected', {
      to: person.email,
      subject: `${input.appName} was connected to your Replai account`,
      html,
      text: toPlainText(html),
      fromName: branding.siteName,
      replyTo: branding.supportEmail,
    });
  });
}

/**
 * A used code or refresh token was presented again — likely a stolen
 * token. The connection is already revoked; tell the user.
 */
async function onReuseRevocation(
  db: SupabaseClient,
  connectionId: string,
  kind: 'code_reuse' | 'refresh_reuse'
): Promise<void> {
  const conn = await getConnection(db, connectionId);
  if (!conn) return;
  await writeAudit(db, {
    accountId: conn.account_id,
    connectionId,
    userId: conn.user_id,
    platform: conn.platform,
    action: `oauth.${kind}`,
    outcome: 'denied',
    denyReason:
      kind === 'code_reuse'
        ? 'authorization code used twice; connection revoked'
        : 'refresh token used twice; connection revoked',
  });

  const { data: client } = await db
    .from('oauth_clients')
    .select('display_name')
    .eq('id', conn.oauth_client_id)
    .maybeSingle();
  const appName = (client?.display_name as string | undefined) ?? 'An AI app';

  await safely('revoked notification', () =>
    notify(db, {
      accountId: conn.account_id,
      userId: conn.user_id,
      title: `${appName} was disconnected for your security`,
      body: 'We saw one of its sign-in tokens used twice, which can mean it was copied. Reconnect it if you still want to use it.',
    })
  );

  await safely('revoked email', async () => {
    const person = await getPerson(db, conn.user_id);
    if (!person.email) return;
    const branding = await getEmailBranding('ai-connector');
    const content = [
      heading(`We disconnected ${appName} from your Replai account`),
      paragraph(greeting(person)),
      paragraph(
        `One of the sign-in tokens ${appName} uses to reach Replai was presented twice. That normally only happens if the token was copied, so we disconnected ${appName} straight away. Nothing else in your account changed.`
      ),
      paragraph(
        `If you still want to use ${appName} with Replai, reconnect it from ${appName}. You will be asked to sign in and approve it again.`
      ),
      button({ href: settingsUrl(), label: 'Review AI connectors' }),
    ].join('\n');
    const html = renderEmail({
      siteName: branding.siteName,
      preheader: `${appName} was disconnected after a security check.`,
      content,
      footerNote:
        'You are receiving this because of a security event on your account.',
      logoUrl: branding.logoUrl,
      logoDarkUrl: branding.logoDarkUrl,
    });
    await sendEmailQuietly('ai-revoked-reuse', {
      to: person.email,
      subject: `We disconnected ${appName} from your Replai account`,
      html,
      text: toPlainText(html),
      fromName: branding.siteName,
      replyTo: branding.supportEmail,
    });
  });
}

/**
 * Someone other than the connection's user disconnected it (the
 * workspace owner from Settings). Tell the user in-app. Never throws.
 */
export async function onConnectionRevokedByOwner(
  db: SupabaseClient,
  input: { accountId: string; userId: string; appName: string }
): Promise<void> {
  await safely('owner revoke notification', () =>
    notify(db, {
      accountId: input.accountId,
      userId: input.userId,
      title: `${input.appName} was disconnected from Replai`,
      body: 'Your workspace owner disconnected it. Ask them if you still need it.',
    })
  );
}

/** TokenDeps.onEvent for the token endpoint. Never throws. */
export async function onTokenEvent(
  db: SupabaseClient,
  event: TokenEvent
): Promise<void> {
  if (event.type === 'tokens_issued') return;
  await safely(event.type, () =>
    onReuseRevocation(db, event.connectionId, event.type)
  );
}
