import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  disconnectHelpText,
  DISCONNECT_REASON_HELP,
} from '@/lib/whatsapp/coexistence';
import {
  MAX_SYNC_ATTEMPTS,
  requestCoexistenceSync,
  syncWindowHoursRemaining,
  SYNC_WINDOW_HOURS,
} from '@/lib/whatsapp/coexistence-sync';

/**
 * GET /api/whatsapp/coexistence
 *
 * Everything the Settings panel needs to describe a Coexistence number:
 * whether it IS one, how the history import is going, how many phone
 * contacts are waiting for review, and — if the pairing broke — which of
 * Meta's six reasons it was and what to do about it.
 *
 * Returns 200 even when the account has no WhatsApp connection at all, so
 * the UI renders "not connected" rather than an error toast. Only auth
 * failures are non-200.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json({ connected: false, is_coexistence: false });
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    // One literal string, not a concatenation. Supabase's typings parse
    // the select list at the type level, and a `+`-joined string is opaque
    // to them — every column then comes back as GenericStringError.
    .select(
      'id, phone_number_id, connection_mode, coexistence_detected_at, status, connected_at, disconnect_event, disconnect_reason, disconnected_at, sync_requested_at, sync_attempts, sync_last_error',
    )
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ connected: false, is_coexistence: false });
  }

  const isCoexistence = config.connection_mode === 'coexistence';

  // History import progress, one row per phase. Ordered so the UI can show
  // them in the order Meta works through them (recent first, then older).
  const { data: imports } = await supabase
    .from('coexistence_history_imports')
    .select(
      'phase, progress, status, error_code, error_message, threads_seen, messages_stored, messages_skipped, started_at, updated_at',
    )
    .eq('config_id', config.id)
    .order('phase');

  // Counts rather than the rows themselves — an address book can be
  // hundreds of numbers and the panel only needs a badge. The review
  // screen fetches the actual list.
  const { count: pendingContacts } = await supabase
    .from('coexistence_staged_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('config_id', config.id)
    .eq('status', 'pending');

  const { count: importedContacts } = await supabase
    .from('coexistence_staged_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('config_id', config.id)
    .eq('status', 'imported');

  const hoursRemaining = syncWindowHoursRemaining(config.connected_at);

  return NextResponse.json({
    connected: true,
    is_coexistence: isCoexistence,
    status: config.status,
    connected_at: config.connected_at,
    // Proof, as opposed to what onboarding claimed. Set by the first echo.
    coexistence_confirmed_at: config.coexistence_detected_at,

    // ---- Disconnect, with the actual remedy ----
    // Meta reports six different causes as the same event, so the UI gets
    // the human explanation rather than having to map codes itself.
    disconnect: config.disconnect_event
      ? {
          event: config.disconnect_event,
          reason: config.disconnect_reason,
          at: config.disconnected_at,
          help: disconnectHelpText(
            config.disconnect_event,
            config.disconnect_reason,
          ),
          // True when we recognise the code, so the UI can be confident
          // about presenting the fix as authoritative.
          known: Boolean(
            config.disconnect_reason &&
              DISCONNECT_REASON_HELP[config.disconnect_reason],
          ),
        }
      : null,

    // ---- The one-shot import ----
    sync: {
      requested_at: config.sync_requested_at,
      attempts: config.sync_attempts ?? 0,
      max_attempts: MAX_SYNC_ATTEMPTS,
      last_error: config.sync_last_error,
      window_hours: SYNC_WINDOW_HOURS,
      hours_remaining: hoursRemaining,
      // Meta accepts this ONCE, within 24h of connecting. Retry is only
      // offered while all three hold, so the UI never shows a button that
      // cannot work.
      can_retry:
        !config.sync_requested_at &&
        (config.sync_attempts ?? 0) < MAX_SYNC_ATTEMPTS &&
        (hoursRemaining === null || hoursRemaining > 0),
    },

    history: imports ?? [],
    contacts: {
      pending: pendingContacts ?? 0,
      imported: importedContacts ?? 0,
    },
  });
}

/**
 * POST /api/whatsapp/coexistence
 *
 * Retry the one-shot history + contact sync request.
 *
 * Exists because the first attempt happens automatically during
 * onboarding, where it can fail for reasons the operator can fix (a
 * transient Meta error, or the endpoint path being wrong — see the note
 * in coexistence-sync.ts). Without a retry the only remedy would be to
 * disconnect and re-onboard.
 *
 * `requestCoexistenceSync` owns all the guards, so this route cannot
 * accidentally fire twice or outside the window.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only: this consumes an attempt against an endpoint Meta only
  // honours once, so it is not something an ordinary agent should be able
  // to spend on the account's behalf.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();

  const accountId = profile?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    );
  }
  if (profile?.account_role !== 'owner' && profile?.account_role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an owner or admin can start the history import.' },
      { status: 403 },
    );
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('id, phone_number_id, access_token, connected_at, connection_mode')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json(
      { error: 'No WhatsApp number is connected.' },
      { status: 404 },
    );
  }

  if (config.connection_mode !== 'coexistence') {
    return NextResponse.json(
      {
        error:
          'This number is not a Coexistence number, so there is no phone history to import.',
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return NextResponse.json(
      { error: 'Stored WhatsApp credentials could not be read.' },
      { status: 500 },
    );
  }

  const outcome = await requestCoexistenceSync({
    db: supabase,
    configId: config.id,
    phoneNumberId: config.phone_number_id,
    accessToken,
    connectedAt: config.connected_at,
  });

  if (!outcome.requested) {
    // Each skip reason gets its own sentence, because they call for
    // completely different actions and "sync failed" would hide that.
    const messages: Record<string, string> = {
      already_requested:
        'The import was already requested. Meta only allows this once — check the progress above.',
      window_expired: `Meta's ${SYNC_WINDOW_HOURS}-hour window has passed. Disconnect and reconnect the number to import history.`,
      too_many_attempts:
        'Too many failed attempts. Reconnect the number to try again.',
    };
    const reason = outcome.skippedReason;
    return NextResponse.json(
      {
        error:
          (reason && messages[reason]) ||
          outcome.results
            ?.filter((r) => !r.ok)
            .map((r) => `${r.kind}: ${r.error}`)
            .join(' | ') ||
          'Meta refused the import request.',
        skipped_reason: reason ?? null,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, results: outcome.results });
}
