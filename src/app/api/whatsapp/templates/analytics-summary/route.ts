import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import {
  fetchTemplateAnalyticsWindowed,
  isTemplateInsightsDisabledError,
} from '@/lib/whatsapp/meta-api';
import {
  metaRequestStart,
  normalizeTemplateAnalytics,
  resolveAnalyticsWindow,
  TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS,
} from '@/lib/whatsapp/template-analytics';
import {
  isStale,
  persistDailySnapshots,
  readStoredSummary,
} from '@/lib/whatsapp/template-analytics-store';

/**
 * Per-template spend and volume for the templates list.
 *
 * GET /api/whatsapp/templates/analytics-summary
 *
 * ─── DB-first, by design ──────────────────────────────────────────
 *
 * This route answers from `template_analytics_daily` and NEVER waits on
 * Meta. It used to fetch live on every page load, which took about two
 * minutes: Meta paginates template_analytics at 25 data points per page,
 * so 8 templates across 90 days is roughly 240 points — about 10 pages
 * per 30-day slice, three slices, all before the column could render.
 *
 * Meta is refreshed AFTER the response is sent, via `after()`, and only
 * when the stored figures are actually stale. So the common case is a
 * single indexed database read, and Meta is asked at most once every few
 * minutes regardless of how often the page is opened.
 *
 * `after()` rather than a floating promise: on a serverless platform the
 * function can be frozen the instant the response is flushed, which
 * would abandon the refresh half-written. This is the same reasoning the
 * WhatsApp webhook route documents.
 */

// The background refresh walks several Meta pages. It runs inside this
// route's max duration, so give it headroom beyond the default.
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
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
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    /** `?force=1` bypasses the staleness check, for an explicit refresh. */
    const force = url.searchParams.get('force') === '1';

    // ---- 1. Answer from our own database ----
    const summary = await readStoredSummary({ accountId });

    const templatesOut = [...summary.byTemplate.entries()].map(
      ([id, totals]) => ({
        id,
        sent: totals.sent,
        delivered: totals.delivered,
        spent: totals.spent,
      })
    );
    const currency =
      [...summary.byTemplate.values()].find((t) => t.currency)?.currency ??
      null;
    const costReported = templatesOut.some((t) => t.spent !== null);
    const stale = force || isStale(summary.refreshedAt);

    // ---- 2. Schedule the Meta refresh, after the response ----
    if (stale) {
      after(async () => {
        try {
          await refreshFromMeta(accountId);
        } catch (err) {
          // Best-effort by contract: the operator already has an answer.
          console.error('[template analytics] background refresh failed:', err);
        }
      });
    }

    return NextResponse.json({
      // The column renders whenever we hold a cost figure. On a brand-new
      // account nothing is stored yet, so `refreshing` tells the client to
      // check back rather than concluding the feature is unavailable.
      available: templatesOut.length > 0,
      cost_reported: costReported,
      refreshing: stale,
      refreshed_at: summary.refreshedAt,
      source: 'database',
      window: {
        start: summary.earliestDay,
        end: new Date().toISOString().slice(0, 10),
        all_time: true,
      },
      currency,
      templates: templatesOut,
    });
  } catch (error) {
    console.error('Error loading template analytics summary:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load template analytics summary.',
      },
      { status: 500 }
    );
  }
}

/**
 * Pull Meta's current figures for every submitted template and store them.
 *
 * Runs in the background. Never throws to the caller — a refresh failure
 * leaves the last known good numbers in place, which is strictly better
 * than replacing a working screen with an error.
 */
async function refreshFromMeta(accountId: string): Promise<void> {
  const supabase = await createClient();

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('waba_id, access_token')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!config?.waba_id) return;

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return;
  }

  const { data: rows } = await supabase
    .from('message_templates')
    .select('id, meta_template_id')
    .eq('account_id', accountId)
    .not('meta_template_id', 'is', null);

  const templates = (rows ?? []).filter(
    (row): row is { id: string; meta_template_id: string } =>
      typeof row.meta_template_id === 'string' && !!row.meta_template_id
  );
  if (templates.length === 0) return;

  // Meta's own lookback is the most history it can give us; anything
  // older is already in our table and does not need re-fetching.
  const window = resolveAnalyticsWindow({ allTime: true, earliestDay: null });

  // Meta accepts at most 10 template ids per request.
  const chunks: { id: string; meta_template_id: string }[][] = [];
  for (
    let i = 0;
    i < templates.length;
    i += TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS
  ) {
    chunks.push(templates.slice(i, i + TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS));
  }

  const currency = await readCurrency(config.waba_id, accessToken);

  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      fetchTemplateAnalyticsWindowed({
        wabaId: config.waba_id as string,
        accessToken,
        templateIds: chunk.map((t) => t.meta_template_id),
        startSec: metaRequestStart(window),
        endSec: window.endSec,
      })
    )
  );

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      if (isTemplateInsightsDisabledError(result.reason)) return;
      console.error(
        '[template analytics] refresh chunk failed:',
        result.reason instanceof Error ? result.reason.message : result.reason
      );
      continue;
    }
    for (const row of chunks[index]) {
      const normalized = normalizeTemplateAnalytics(
        result.value,
        row.meta_template_id,
        window
      );
      await persistDailySnapshots({
        accountId,
        templateId: row.id,
        metaTemplateId: row.meta_template_id,
        currency,
        series: normalized.daily,
      });
    }
  }
}

/** Cost is meaningless without its unit, and Meta omits it from analytics. */
async function readCurrency(
  wabaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${META_API_BASE}/${wabaId}?fields=currency`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { currency?: unknown };
    return typeof body.currency === 'string' ? body.currency : null;
  } catch {
    return null;
  }
}
