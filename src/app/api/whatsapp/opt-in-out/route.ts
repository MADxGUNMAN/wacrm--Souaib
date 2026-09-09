// ============================================================
// GET  /api/whatsapp/opt-in-out — the account's opt-in/out config
// PUT  /api/whatsapp/opt-in-out — save it (owner only)
//
// Read is allowed for the owner AND for a member granted
// `settings_opt_out`: knowing that STOP is the opt-out word is useful
// context for anyone working the inbox, and none of it is sensitive.
//
// Write is owner-only. This is a compliance control, not day-to-day
// configuration — a member who could clear the keywords or switch capture
// off would make the safeguard pointless.
//
// The owner check is enforced here AND by RLS
// (`opt_in_out_configs_write` requires `is_account_member(account_id,
// 'owner')`), so a forgotten `if` in this file cannot become a privilege
// hole. Note the RLS tier is deliberately 'owner' and not the legacy
// 'admin': migration 038 collapsed admin/agent/viewer to the same rank as
// `member`, so 'admin' would admit any member.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  DEFAULT_OPT_IN_OUT_CONFIG,
  MARKETING_OPT_OUT_SOURCES,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_RESPONSE_MESSAGE_LENGTH,
  SUGGESTED_OPT_IN_KEYWORDS,
  SUGGESTED_OPT_OUT_KEYWORDS,
  normalizeKeywordList,
  toOptInOutConfig,
} from '@/lib/whatsapp/marketing-opt-out';
import {
  isCallerError,
  resolveOptInOutCaller,
} from '@/lib/whatsapp/opt-in-out-access';

const CONFIG_COLUMNS =
  'is_active, opt_out_keywords, opt_in_keywords, opt_out_response_message, opt_in_response_message, updated_at';

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Validate + normalize one keyword list. Returns an error string or the list. */
function parseKeywords(
  raw: unknown,
  label: string
): { list: string[] } | { error: string } {
  if (raw !== undefined && !Array.isArray(raw)) {
    return { error: `${label} must be an array of words.` };
  }
  const input = Array.isArray(raw) ? raw : [];
  const strings = input.filter((k): k is string => typeof k === 'string');

  const tooLong = strings.find((k) => k.trim().length > MAX_KEYWORD_LENGTH);
  if (tooLong) {
    return {
      error: `"${tooLong.trim().slice(0, 40)}" is too long — keep keywords under ${MAX_KEYWORD_LENGTH} characters.`,
    };
  }
  // A keyword is matched against the WHOLE message, so one containing a
  // space could only ever match that exact phrase. Rejecting it here is
  // clearer than silently storing something that will never fire.
  const withSpace = strings.find((k) => /\s/.test(k.trim()));
  if (withSpace) {
    return {
      error: `"${withSpace.trim()}" contains a space. Keywords are matched as a whole message, so use a single word.`,
    };
  }

  const list = normalizeKeywordList(strings);
  if (list.length > MAX_KEYWORDS) {
    return { error: `Use at most ${MAX_KEYWORDS} ${label.toLowerCase()}.` };
  }
  return { list };
}

function parseMessage(
  raw: unknown,
  fallback: string,
  label: string
): { text: string } | { error: string } {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    return { error: `${label} must be text.` };
  }
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length > MAX_RESPONSE_MESSAGE_LENGTH) {
    return {
      error: `${label} is too long — keep it under ${MAX_RESPONSE_MESSAGE_LENGTH} characters.`,
    };
  }
  // Blank falls back to the default rather than erroring: an owner who
  // clears the box wants the standard wording, not a validation fight.
  // The column is NOT NULL, so something has to go in.
  return { text: text || fallback };
}

export async function GET() {
  const supabase = await createClient();
  const caller = await resolveOptInOutCaller(supabase);
  if (isCallerError(caller)) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  if (!caller.canRead) {
    return NextResponse.json(
      { error: 'You do not have access to opt-in/out settings.' },
      { status: 403 }
    );
  }

  const { data: row, error } = await supabase
    .from('opt_in_out_configs')
    .select(CONFIG_COLUMNS)
    .eq('account_id', caller.accountId)
    .maybeSingle();

  if (error) {
    console.error('[whatsapp/opt-in-out] load failed:', error.message);
    return NextResponse.json(
      { error: 'Could not load opt-in/out settings.' },
      { status: 500 }
    );
  }

  // ── Suppression summary ──────────────────────────────────────────
  // Turns an abstract settings screen into one with visible effect, and
  // answers the only question that matters for account health: is this
  // getting worse, and where are the opt-outs coming from?
  //
  // Exact `count` queries rather than fetching rows and tallying in JS:
  // PostgREST caps a plain select at ~1000 rows, so a tally would quietly
  // undercount a busy account. All of these run in parallel and hit the
  // (account_id, phone_normalized) index.
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const baseCountQuery = () =>
    supabase
      .from('marketing_opt_outs')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', caller.accountId);

  const [totalRes, recentRes, ...sourceRes] = await Promise.all([
    baseCountQuery(),
    baseCountQuery().gte('opted_out_at', thirtyDaysAgo),
    ...MARKETING_OPT_OUT_SOURCES.map((source) =>
      baseCountQuery().eq('source', source)
    ),
  ]);

  const bySource: Record<string, number> = {};
  MARKETING_OPT_OUT_SOURCES.forEach((source, i) => {
    bySource[source] = sourceRes[i]?.count ?? 0;
  });

  const count = totalRes.count ?? 0;

  return NextResponse.json({
    // `configured: false` distinguishes "never saved" from
    // "saved with the defaults" — the panel says so, because an account
    // relying on the implicit default should know that is what it is doing.
    configured: Boolean(row),
    // Always the EFFECTIVE config: defaults filled in. The panel renders
    // exactly what the webhook will act on.
    config: toOptInOutConfig(row),
    opted_out_count: count,
    summary: {
      total: count,
      last_30_days: recentRes.count ?? 0,
      by_source: bySource,
    },
    can_edit: caller.isOwner,
    defaults: DEFAULT_OPT_IN_OUT_CONFIG,
    suggestions: {
      opt_out: [...SUGGESTED_OPT_OUT_KEYWORDS],
      opt_in: [...SUGGESTED_OPT_IN_KEYWORDS],
    },
    limits: {
      max_keywords: MAX_KEYWORDS,
      max_keyword_length: MAX_KEYWORD_LENGTH,
      max_message_length: MAX_RESPONSE_MESSAGE_LENGTH,
    },
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const caller = await resolveOptInOutCaller(supabase);
  if (isCallerError(caller)) {
    return NextResponse.json(
      { error: caller.error },
      { status: caller.status }
    );
  }
  if (!caller.isOwner) {
    return NextResponse.json(
      { error: 'Only the account owner can change opt-in/out settings.' },
      { status: 403 }
    );
  }

  const limit = checkRateLimit(
    `opt-in-out:${caller.userId}`,
    RATE_LIMITS.adminAction
  );
  if (!limit.success) return rateLimitResponse(limit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return bad('Invalid request body');

  const optOut = parseKeywords(body.opt_out_keywords, 'Opt-out keywords');
  if ('error' in optOut) return bad(optOut.error);
  const optIn = parseKeywords(body.opt_in_keywords, 'Opt-in keywords');
  if ('error' in optIn) return bad(optIn.error);

  // Mirrors the DB CHECK. Removing the last opt-out keyword would leave
  // customers with no way to leave — which is the problem this feature
  // exists to solve. Switching the feature off is what `is_active` is for.
  if (optOut.list.length === 0) {
    return bad(
      'Keep at least one opt-out keyword. To stop watching for keywords entirely, turn the feature off instead.'
    );
  }

  // A word in both lists could never behave predictably; the handler
  // resolves the ambiguity by preferring opt-out, but the owner should not
  // be left to discover that.
  const overlap = optOut.list.filter((k) => optIn.list.includes(k));
  if (overlap.length > 0) {
    return bad(
      `"${overlap[0]}" is in both lists. A keyword can either opt customers out or opt them in, not both.`
    );
  }

  const outMessage = parseMessage(
    body.opt_out_response_message,
    DEFAULT_OPT_IN_OUT_CONFIG.optOutResponseMessage,
    'Opt-out response message'
  );
  if ('error' in outMessage) return bad(outMessage.error);

  const inMessage = parseMessage(
    body.opt_in_response_message,
    DEFAULT_OPT_IN_OUT_CONFIG.optInResponseMessage,
    'Opt-in response message'
  );
  if ('error' in inMessage) return bad(inMessage.error);

  // Upsert on account_id: one row per account (UNIQUE), so create-or-update
  // is a single statement that cannot race into duplicates.
  const { error } = await supabase.from('opt_in_out_configs').upsert(
    {
      account_id: caller.accountId,
      is_active: body.is_active === true,
      opt_out_keywords: optOut.list,
      opt_in_keywords: optIn.list,
      opt_out_response_message: outMessage.text,
      opt_in_response_message: inMessage.text,
      created_by: caller.userId,
    },
    { onConflict: 'account_id' }
  );

  if (error) {
    console.error('[whatsapp/opt-in-out] save failed:', error.message);
    return NextResponse.json(
      { error: `Could not save opt-in/out settings: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
