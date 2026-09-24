import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import {
  fetchInsightsEnabled,
  fetchTemplateAnalyticsWindowed,
  SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
} from '@/lib/whatsapp/meta-api';
import {
  AnalyticsWindowError,
  computeEngagementRates,
  enumerateWindowDates,
  metaRequestStart,
  normalizeTemplateAnalytics,
  resolveAnalyticsWindow,
  TEMPLATE_ANALYTICS_ENGAGEMENT_RETENTION_DAYS,
  TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS,
  windowExceedsEngagementRetention,
  type AnalyticsWindow,
  type DailyTemplateMetrics,
} from '@/lib/whatsapp/template-analytics';
import {
  buttonsFromSeries,
  isEmptyDay,
  isStale,
  mergeSeries,
  persistDailySnapshots,
  readEarliestStoredDay,
  readStoredDaily,
  readStoredSummary,
  totalsFromSeries,
} from '@/lib/whatsapp/template-analytics-store';

/**
 * Refresh one template's stored analytics from Meta.
 *
 * Runs in `after()`, so it must own its own failures: the operator has
 * already been served the last known good figures, and replacing those
 * with an error would be a downgrade.
 */
async function refreshTemplateFromMeta(args: {
  accountId: string;
  templateId: string;
  metaTemplateId: string;
  wabaId: string;
  accessToken: string;
  window: AnalyticsWindow;
}): Promise<void> {
  const raw = await fetchTemplateAnalyticsWindowed({
    wabaId: args.wabaId,
    accessToken: args.accessToken,
    templateIds: [args.metaTemplateId],
    // Clamped to Meta's reach; older days are already in our table.
    startSec: metaRequestStart(args.window),
    endSec: args.window.endSec,
  });

  let currency: string | null = null;
  try {
    const res = await fetch(`${META_API_BASE}/${args.wabaId}?fields=currency`, {
      headers: { Authorization: `Bearer ${args.accessToken}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { currency?: unknown };
      currency = typeof body.currency === 'string' ? body.currency : null;
    }
  } catch {
    currency = null;
  }

  const normalized = normalizeTemplateAnalytics(
    raw,
    args.metaTemplateId,
    args.window
  );

  await persistDailySnapshots({
    accountId: args.accountId,
    templateId: args.templateId,
    metaTemplateId: args.metaTemplateId,
    currency,
    series: normalized.daily,
  });
}

/**
 * Per-template analytics.
 *
 * GET /api/whatsapp/templates/{id}/analytics?days=7
 * GET /api/whatsapp/templates/{id}/analytics?start=2026-08-01&end=2026-08-31
 *
 * Read-only, and member-visible like its sibling template routes — the
 * numbers are the operator's own send volume, not account configuration.
 * Turning insights ON is a different matter and lives behind an
 * owner-only route (`/api/whatsapp/templates/insights`) because Meta
 * cannot undo it.
 *
 * The response always echoes the window that was actually used. Meta
 * caps template analytics at 90 days and silently returns less than a
 * wider request asks for, so a UI that labels its chart from the
 * REQUEST rather than the response ends up lying about the period.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Categories Meta reports button clicks for.
 *
 * Authentication templates never get click data, so the UI needs to say
 * "not reported for this category" instead of showing a confident zero.
 */
const CLICK_METRIC_CATEGORIES = new Set(['Marketing', 'Utility']);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 }
      );
    }

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
      // user_id, not id — profiles.id is its own PK.
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
    const daysParam = url.searchParams.get('days');
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const allTime = url.searchParams.get('range') === 'all';
    /** `?force=1` bypasses the staleness check, for an explicit Refresh. */
    const force = url.searchParams.get('force') === '1';

    // Scoped by account_id as well as id: RLS already restricts this, but
    // the explicit filter means a mismatched id returns "not found"
    // rather than leaking that the row exists on another account.
    const { data: template, error: lookupErr } = await supabase
      .from('message_templates')
      .select(
        'id, name, status, category, language, header_type, quality_score, meta_template_id, rejection_reason, created_at, updated_at, last_submitted_at'
      )
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (lookupErr || !template) {
      return NextResponse.json(
        { error: 'Template not found.' },
        { status: 404 }
      );
    }

    // All-time needs the template's own earliest snapshot to know where
    // history begins, so the window can only be resolved after the row is
    // known.
    let window;
    try {
      window = resolveAnalyticsWindow({
        allTime,
        earliestDay: allTime
          ? await readEarliestStoredDay({
              accountId,
              templateIds: [template.id as string],
            })
          : null,
        days: daysParam ? Number(daysParam) : null,
        start: startParam,
        end: endParam,
      });
    } catch (e) {
      if (e instanceof AnalyticsWindowError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const templateMeta = {
      id: template.id as string,
      name: template.name as string,
      status: (template.status ?? 'DRAFT') as string,
      category: template.category as string,
      language: (template.language ?? null) as string | null,
      header_type: (template.header_type ?? null) as string | null,
      quality_score: (template.quality_score ?? null) as string | null,
      meta_template_id: (template.meta_template_id ?? null) as string | null,
      rejection_reason: (template.rejection_reason ?? null) as string | null,
      created_at: (template.created_at ?? null) as string | null,
      /** Our own last write to the row — not Meta's edit timestamp. */
      updated_at: (template.updated_at ?? null) as string | null,
      last_submitted_at: (template.last_submitted_at ?? null) as string | null,
    };

    const notices = {
      engagement_retention_days: TEMPLATE_ANALYTICS_ENGAGEMENT_RETENTION_DAYS,
      exceeds_engagement_retention: windowExceedsEngagementRetention(window),
      max_lookback_days: TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS,
      click_metrics_supported: CLICK_METRIC_CATEGORIES.has(
        templateMeta.category
      ),
    };

    // A local-only draft has no Meta id, so there is nothing to ask about.
    // Answering 200 with zeroes would be indistinguishable from "sent to
    // nobody yet", which is a different situation with a different fix.
    if (!templateMeta.meta_template_id) {
      return NextResponse.json(
        {
          error:
            'This template has not been submitted to Meta yet, so it has no analytics.',
          code: 'not_submitted',
          template: templateMeta,
        },
        { status: 409 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('waba_id, access_token, connection_mode, insights_enabled_at')
      .eq('account_id', accountId)
      .single();
    if (configError || !config || !config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WhatsApp is not connected, so Meta cannot be asked for analytics.',
          code: 'not_configured',
          template: templateMeta,
        },
        { status: 409 }
      );
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch {
      return NextResponse.json(
        {
          error:
            'The stored WhatsApp access token could not be read. Reconnect WhatsApp in Settings.',
          code: 'token_unreadable',
          template: templateMeta,
        },
        { status: 409 }
      );
    }

    // ---- DB-first ----
    //
    // The dialog answers from `template_analytics_daily` and does NOT wait
    // on Meta. A live fetch here walked up to ~10 paginated Graph pages
    // per 30-day slice, which is what made this screen take minutes. Meta
    // is refreshed after the response, and only when the stored figures
    // are stale, so repeated opens cost one indexed query.
    const stored = await readStoredDaily({
      accountId,
      templateIds: [templateMeta.id],
      startDate: window.startDate,
      endDate: window.endDate,
    });
    const storedRows = stored.get(templateMeta.id) ?? [];

    // A gap-filled skeleton for the window, so the chart shows quiet days
    // and the merge has somewhere to put each stored day.
    const skeleton: DailyTemplateMetrics[] = enumerateWindowDates(window).map(
      (date) => ({
        date,
        sent: 0,
        delivered: 0,
        read: 0,
        clicked: 0,
        uniqueClicked: 0,
        amountSpent: null,
        costPerDelivered: null,
        costPerUrlClick: null,
        buttons: null,
      })
    );
    const daily = mergeSeries(skeleton, storedRows);

    // One extra read gives both the stored currency and the freshness
    // stamp, so cost figures carry their unit without a Meta round trip.
    const accountSummary = await readStoredSummary({ accountId });
    const currency =
      [...accountSummary.byTemplate.values()].find((t) => t.currency)
        ?.currency ?? null;
    const stale = force || isStale(accountSummary.refreshedAt);

    if (stale) {
      after(async () => {
        try {
          await refreshTemplateFromMeta({
            accountId,
            templateId: templateMeta.id,
            metaTemplateId: templateMeta.meta_template_id as string,
            wabaId: config.waba_id as string,
            accessToken,
            window,
          });
        } catch (err) {
          console.error(
            '[template analytics] background refresh failed:',
            err instanceof Error ? err.message : err
          );
        }
      });
    }
    // Totals are recomputed from the merged series rather than reused
    // from the live parse, so the headline can never disagree with the
    // chart and table built from the same rows.
    const mergedTotals = totalsFromSeries(daily);
    const totals = {
      sent: mergedTotals.sent,
      delivered: mergedTotals.delivered,
      read: mergedTotals.read,
      clicked: mergedTotals.clicked,
      uniqueClicked: mergedTotals.uniqueClicked,
    };
    // The three cost cards WhatsApp Manager shows, built the way Manager
    // builds them: Meta's spend for the window, then that spend over
    // deliveries and over website-button taps. Meta's own per-day rates
    // ride along so the screen can show them next to the window figures.
    //
    // Spend is the sum of the per-day `amount_spent` values Meta reports,
    // independently confirmed against Meta's billing ledger
    // (`pricing_analytics`): a day the template rows put at ₹5.18 + ₹0.86
    // is billed as 7 REGULAR marketing messages at ₹0.8631 each.
    const cost = {
      amountSpent: mergedTotals.amountSpent,
      costPerDelivered: mergedTotals.costPerDelivered,
      metaCostPerDelivered: mergedTotals.metaCostPerDelivered,
      costPerUrlClick: mergedTotals.costPerUrlClick,
      // Meta's own per-day cost per link click. Sent alongside the window
      // figure so the dialog can show both: a per-day rate cannot see
      // spend from any other day, so the two differ legitimately and the
      // difference needs to be visible rather than argued about.
      metaCostPerUrlClick: mergedTotals.metaCostPerUrlClick,
      // The denominator, sent so the screen can show what the rate was
      // divided by. Without it a cost-per-click figure is a bare number an
      // operator cannot check against WhatsApp Manager.
      urlClicks: mergedTotals.urlClicks,
    };
    const hasData = daily.some((row) => !isEmptyDay(row));

    // ---- Empty for a fixable reason, or genuinely empty? ----
    //
    // Being DB-first means Meta's refusal happens in `after()` and never
    // reaches the operator. That is right for a transient failure, but it
    // buried the one failure that has a button: with insights off, Meta
    // collects nothing, so every window is empty forever and the dialog
    // sat on "Meta has no data — try a shorter period", advice that could
    // never work.
    //
    // Only asked when the window came back empty, so a working account
    // pays nothing for this. `null` (could not check) deliberately falls
    // through to the normal empty state rather than guessing.
    if (!hasData) {
      // Coexistence first. Meta refuses template analytics on a number that
      // also runs on the WhatsApp Business phone app ("SMB business type",
      // error #10), so on those accounts the flag below ALSO reads false —
      // and reporting that as `insights_disabled` puts an Enable button in
      // front of the operator that Meta rejects every single time. The
      // distinction is between "you can turn this on" and "nobody can".
      if (config.connection_mode === 'coexistence') {
        return NextResponse.json(
          {
            error: SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
            code: 'insights_unsupported_smb',
            template: templateMeta,
          },
          { status: 409 }
        );
      }

      // A recorded enable outranks Meta's inconsistent reporting — see
      // migration 20260917180000. Without this the dialog kept offering a
      // switch the operator had already thrown.
      if (config.insights_enabled_at) {
        // 409, matching the insights_disabled branch below. A 200 here would
        // make the client treat this explanatory payload as an analytics
        // response and try to render charts from it.
        return NextResponse.json(
          {
            error:
              'Template insights are on for this account, but Meta has not reported data for this template yet. ' +
              'Meta only collects from the moment insights were enabled and never backfills earlier sends, ' +
              'and it can lag a few hours behind a send.',
            code: 'insights_no_data_yet',
            template: templateMeta,
          },
          { status: 409 }
        );
      }

      const insightsEnabled = await fetchInsightsEnabled({
        wabaId: config.waba_id as string,
        accessToken,
      });
      if (insightsEnabled === false) {
        return NextResponse.json(
          {
            error:
              'Meta has not been asked to collect template analytics for this WhatsApp Business account yet, so there is nothing to report.',
            code: 'insights_disabled',
            template: templateMeta,
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      window: {
        start: window.startDate,
        end: window.endDate,
        days: window.days,
        clamped: window.clamped,
        all_time: allTime,
      },
      template: templateMeta,
      totals,
      rates: computeEngagementRates(totals),
      daily,
      buttons: buttonsFromSeries(daily),
      cost,
      currency,
      meta: {
        granularity: 'DAILY',
        product_type: null,
        has_data: hasData,
        /** Served from our table; Meta is refreshed in the background. */
        source: 'database',
        refreshing: stale,
      },
      notices,
    });
  } catch (error) {
    console.error('Error loading template analytics:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load template analytics.',
      },
      { status: 500 }
    );
  }
}
