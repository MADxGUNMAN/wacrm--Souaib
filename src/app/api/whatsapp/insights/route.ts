import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import {
  fetchCallAnalytics,
  fetchConversationAnalytics,
  fetchInsightsEnabled,
  fetchMessagingAnalytics,
  fetchPricingAnalytics,
  fetchTemplateAnalytics,
  isSmbBusinessTypeError,
  isTemplateInsightsDisabledError,
  SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
  MetaApiError,
} from '@/lib/whatsapp/meta-api';
import {
  ACCOUNT_INSIGHTS_MAX_LOOKBACK_DAYS,
  granularityFor,
  InsightsWindowError,
  normalizeCallAnalytics,
  normalizeConversationAnalytics,
  normalizeMessagingAnalytics,
  normalizePricingAnalytics,
  resolveInsightsWindow,
} from '@/lib/whatsapp/account-insights';
import {
  computeEngagementRates,
  normalizeTemplateAnalytics,
  resolveAnalyticsWindow,
  TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS,
  TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS,
} from '@/lib/whatsapp/template-analytics';

/**
 * Account-level WhatsApp insights — everything Meta publishes about the
 * WABA, in one response.
 *
 * GET /api/whatsapp/insights?days=30
 * GET /api/whatsapp/insights?start=2026-08-01&end=2026-08-31
 *
 * ─── Why sections fail independently ──────────────────────────────
 *
 * Five different Meta reads back this page, and they have genuinely
 * different availability:
 *
 *   • cost is withheld entirely for WABAs billed through a Solution
 *     Partner's credit line,
 *   • call analytics only exist once WhatsApp Business Calling is on,
 *   • conversation analytics can be empty on accounts moved to
 *     per-message pricing,
 *   • template analytics needs insights confirmed on the WABA and is
 *     capped at 90 days where the rest reach a year.
 *
 * So each section carries its own `ok` / `error`, and one refusal never
 * blanks the others. A single try/catch around all five would mean an
 * account without calling enabled sees no messaging numbers either.
 *
 * Read-only, member-visible: these are the operator's own volumes.
 */

/** Shape every section the same way so the client can render uniformly. */
type Section<T> =
  { ok: true; data: T } | { ok: false; error: string; code?: string };

function failed(error: unknown, fallback: string): Section<never> {
  if (error instanceof MetaApiError) {
    return { ok: false, error: error.operatorText };
  }
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

interface TemplateLeaderboardRow {
  id: string;
  name: string;
  category: string;
  language: string | null;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  deliveryRate: number | null;
  openRate: number | null;
  clickRate: number | null;
}

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
    let window;
    try {
      window = resolveInsightsWindow({
        days: url.searchParams.get('days')
          ? Number(url.searchParams.get('days'))
          : null,
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end'),
      });
    } catch (e) {
      if (e instanceof InsightsWindowError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select(
        'waba_id, access_token, phone_number_id, connection_mode, insights_enabled_at'
      )
      .eq('account_id', accountId)
      .single();
    if (configError || !config || !config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WhatsApp is not connected yet, so there are no account insights to show.',
          code: 'not_configured',
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
        },
        { status: 409 }
      );
    }

    const wabaId = config.waba_id as string;
    const base = {
      wabaId,
      accessToken,
      startSec: window.startSec,
      endSec: window.endSec,
    };

    // Template analytics has its own, shorter lookback than the rest, so
    // it gets its own window rather than silently returning less than the
    // page header claims.
    const templateWindow = resolveAnalyticsWindow({
      days: Math.min(window.days, TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS),
    });

    // Up to Meta's per-request cap of 10, newest first. These are the
    // templates a leaderboard can actually be built from — a row without
    // a Meta id has never been sent.
    const { data: templateRows } = await supabase
      .from('message_templates')
      .select('id, name, category, language, meta_template_id, status')
      .eq('account_id', accountId)
      .not('meta_template_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(TEMPLATE_ANALYTICS_MAX_TEMPLATE_IDS);

    const templates = (templateRows ?? []).filter(
      (row) => typeof row.meta_template_id === 'string' && row.meta_template_id
    );

    const [
      wabaMeta,
      messagingRes,
      conversationRes,
      pricingRes,
      callRes,
      templateRes,
    ] = await Promise.allSettled([
      // Currency matters: every cost below is in the WABA's own currency
      // and Meta never repeats it inside the analytics payloads. Without
      // it the dashboard would have to show bare numbers for money.
      (async () => {
        const res = await fetch(
          `${META_API_BASE}/${wabaId}?fields=id,name,currency,timezone_id,account_review_status`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        return (await res.json()) as Record<string, unknown>;
      })(),
      fetchMessagingAnalytics({
        ...base,
        granularity: granularityFor('analytics'),
      }),
      fetchConversationAnalytics({
        ...base,
        granularity: granularityFor('conversation'),
      }),
      fetchPricingAnalytics({
        ...base,
        granularity: granularityFor('pricing'),
      }),
      fetchCallAnalytics({
        ...base,
        granularity: granularityFor('call'),
      }),
      templates.length > 0
        ? fetchTemplateAnalytics({
            wabaId,
            accessToken,
            templateIds: templates.map((t) => t.meta_template_id as string),
            startSec: templateWindow.startSec,
            endSec: templateWindow.endSec,
          })
        : Promise.resolve(null),
    ]);

    const waba =
      wabaMeta.status === 'fulfilled' && wabaMeta.value
        ? {
            id: String(wabaMeta.value.id ?? wabaId),
            name:
              typeof wabaMeta.value.name === 'string'
                ? wabaMeta.value.name
                : null,
            currency:
              typeof wabaMeta.value.currency === 'string'
                ? wabaMeta.value.currency
                : null,
            timezone_id:
              wabaMeta.value.timezone_id != null
                ? String(wabaMeta.value.timezone_id)
                : null,
            review_status:
              typeof wabaMeta.value.account_review_status === 'string'
                ? wabaMeta.value.account_review_status
                : null,
          }
        : {
            id: wabaId,
            name: null,
            currency: null,
            timezone_id: null,
            review_status: null,
          };

    const messaging: Section<ReturnType<typeof normalizeMessagingAnalytics>> =
      messagingRes.status === 'fulfilled'
        ? {
            ok: true,
            data: normalizeMessagingAnalytics(messagingRes.value, window),
          }
        : failed(
            messagingRes.reason,
            'Meta did not return messaging analytics.'
          );

    const conversations: Section<
      ReturnType<typeof normalizeConversationAnalytics>
    > =
      conversationRes.status === 'fulfilled'
        ? {
            ok: true,
            data: normalizeConversationAnalytics(conversationRes.value, window),
          }
        : failed(
            conversationRes.reason,
            'Meta did not return conversation analytics.'
          );

    const pricing: Section<ReturnType<typeof normalizePricingAnalytics>> =
      pricingRes.status === 'fulfilled'
        ? {
            ok: true,
            data: normalizePricingAnalytics(pricingRes.value, window),
          }
        : failed(pricingRes.reason, 'Meta did not return pricing analytics.');

    const calls: Section<ReturnType<typeof normalizeCallAnalytics>> =
      callRes.status === 'fulfilled'
        ? { ok: true, data: normalizeCallAnalytics(callRes.value, window) }
        : failed(
            callRes.reason,
            'Meta did not return call analytics. WhatsApp Business Calling may not be enabled.'
          );

    // ---- Template leaderboard ----
    let templateSection: Section<{
      window: { start: string; end: string; days: number };
      rows: TemplateLeaderboardRow[];
    }>;
    if (templateRes.status === 'rejected') {
      // ── Precedence: the flag beats the error text ────────────
      //
      // Ask the WABA directly and let that answer stand. The error-text
      // classifier is only consulted when the flag could not be read.
      //
      // This used to be `classifier(reason) || flag === false`, which
      // inverted the very precedence `fetchInsightsEnabled` was written to
      // establish ("asking the WABA directly is authoritative; inferring the
      // state from a failed analytics call is not"). Because `||`
      // short-circuits, a classifier match meant the authoritative flag was
      // never even requested — so an account whose WABA reports
      // `is_enabled_for_insights: true` could still be told insights were off
      // and pushed at an irreversible switch it did not need. One of these
      // accounts is in that exact state.
      //
      // Reading the flag first costs one field on one node, only on a window
      // that already failed, so the extra request buys correctness for
      // nothing that matters.
      // ── Coexistence: not "off", but unavailable ──────────────
      //
      // Meta refuses template analytics on a number that also runs on the
      // WhatsApp Business phone app ("SMB business type", error #10). Reporting
      // that as `insights_disabled` was actively misleading: it renders an
      // Enable button that Meta rejects every time, so the operator retries a
      // permanent product limit and concludes the app is broken.
      //
      // Checked first, because it outranks both other signals — on a
      // Coexistence number the flag reads false AND the analytics call fails,
      // and neither of those facts is fixable.
      const isCoexistence =
        config.connection_mode === 'coexistence' ||
        isSmbBusinessTypeError(templateRes.reason);

      if (isCoexistence) {
        templateSection = {
          ok: false,
          error: SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
          code: 'insights_unsupported_smb',
        };
      } else {
        const insightsEnabled = await fetchInsightsEnabled({
          wabaId,
          accessToken,
        });

        // ── Never re-offer a switch already thrown ──────────────
        //
        // Meta's two signals disagree on some accounts: the WABA field reads
        // `is_enabled_for_insights: true` while `template_analytics` still
        // answers "Template Insights have not been enabled". And
        // `fetchInsightsEnabled` returns null whenever the customer's token
        // cannot read the field, in which case the misleading sentence used to
        // win — so the operator pressed Enable, got a success toast, watched
        // the page reload, and saw the same Enable button. Repeatedly.
        //
        // `insights_enabled_at` is the one signal that cannot contradict
        // itself: we watched Meta accept the enable. Once it is set, this is
        // no longer a question of whether to switch something on.
        const alreadyOn =
          Boolean(config.insights_enabled_at) || insightsEnabled === true;

        // Self-healing: an account that was enabled before this column existed
        // (or enabled directly in WhatsApp Manager) gets stamped on the first
        // read, so it never shows the switch again either. Fire-and-forget —
        // the answer below does not depend on it landing.
        if (!config.insights_enabled_at && insightsEnabled === true) {
          void supabase
            .from('whatsapp_config')
            .update({ insights_enabled_at: new Date().toISOString() })
            .eq('account_id', accountId)
            .is('insights_enabled_at', null);
        }

        if (alreadyOn) {
          // On, but nothing to show. A genuinely different state from "off",
          // and it needs the opposite response from the operator: wait, rather
          // than press something.
          templateSection = {
            ok: false,
            error:
              'Template insights are on for this account, but Meta has not reported any template data yet. ' +
              'Meta only collects from the moment insights were enabled and never backfills earlier sends, ' +
              'and it can lag a few hours behind a send. Send a template, then check back.',
            code: 'insights_no_data_yet',
          };
        } else {
          const disabled =
            insightsEnabled === false ||
            (insightsEnabled === null &&
              isTemplateInsightsDisabledError(templateRes.reason));

          templateSection = disabled
            ? {
                ok: false,
                error:
                  templateRes.reason instanceof MetaApiError
                    ? templateRes.reason.operatorText
                    : 'Template insights are not enabled for this WhatsApp Business account.',
                code: 'insights_disabled',
              }
            : failed(
                templateRes.reason,
                'Meta did not return template analytics.'
              );
        }
      }
    } else if (!templateRes.value) {
      templateSection = {
        ok: true,
        data: {
          window: {
            start: templateWindow.startDate,
            end: templateWindow.endDate,
            days: templateWindow.days,
          },
          rows: [],
        },
      };
    } else {
      // Hoisted so the non-null narrowing survives into the callback —
      // TypeScript cannot carry it through a closure boundary.
      const rawTemplateAnalytics = templateRes.value;
      const rows: TemplateLeaderboardRow[] = templates
        .map((row) => {
          const normalized = normalizeTemplateAnalytics(
            rawTemplateAnalytics,
            row.meta_template_id as string,
            templateWindow
          );
          const rates = computeEngagementRates(normalized.totals);
          return {
            id: row.id as string,
            name: row.name as string,
            category: row.category as string,
            language: (row.language ?? null) as string | null,
            sent: normalized.totals.sent,
            delivered: normalized.totals.delivered,
            read: normalized.totals.read,
            clicked: normalized.totals.clicked,
            deliveryRate: rates.deliveryRate,
            openRate: rates.openRate,
            clickRate: rates.clickRate,
          };
        })
        // A template with nothing sent in the window tells the operator
        // nothing and would push the ones that matter off the list.
        .filter((row) => row.sent > 0)
        .sort((a, b) => b.sent - a.sent);

      templateSection = {
        ok: true,
        data: {
          window: {
            start: templateWindow.startDate,
            end: templateWindow.endDate,
            days: templateWindow.days,
          },
          rows,
        },
      };
    }

    return NextResponse.json({
      window: {
        start: window.startDate,
        end: window.endDate,
        days: window.days,
        clamped: window.clamped,
        monthly: window.monthly,
      },
      waba,
      sections: {
        messaging,
        conversations,
        pricing,
        calls,
        templates: templateSection,
      },
      notices: {
        max_lookback_days: ACCOUNT_INSIGHTS_MAX_LOOKBACK_DAYS,
        template_max_lookback_days: TEMPLATE_ANALYTICS_MAX_LOOKBACK_DAYS,
        // Meta's own disclaimer, worth repeating: these figures are
        // approximate and will not tie out exactly to an invoice.
        approximate: true,
      },
    });
  } catch (error) {
    console.error('Error loading WhatsApp account insights:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load WhatsApp insights.',
      },
      { status: 500 }
    );
  }
}
