import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { META_API_BASE } from '@/lib/whatsapp/graph-version';
import { fetchPricingAnalytics, MetaApiError } from '@/lib/whatsapp/meta-api';
import {
  granularityFor,
  InsightsWindowError,
  normalizePricingAnalytics,
  resolveInsightsWindow,
} from '@/lib/whatsapp/account-insights';

/**
 * What Meta actually charged this account — its billing ledger.
 *
 * GET /api/whatsapp/message-pricing?days=90
 *
 * ─── Why this exists next to the per-template Spend column ────────
 *
 * The templates list sums `amount_spent` out of Meta's TEMPLATE
 * analytics. That is attribution, not billing, and the two Meta products
 * do not agree. Adding up the column gave ₹19.95 against ₹21.98 on
 * Meta's own Insights → Message pricing screen, and the gap is
 * structural rather than a rounding slip:
 *
 *   • Template analytics starts the day template insights were switched
 *     on for the WABA and Meta never backfills earlier sends. Billing
 *     counts them from the first message.
 *   • It is keyed on a template id. A send from a template since deleted,
 *     or one never synced into this CRM, has nowhere to be attributed —
 *     but it is still on the bill.
 *   • Meta rounds each template's daily `amount_spent` to two decimals,
 *     while the ledger keeps four (₹0.8631 per marketing message). Summing
 *     hundreds of rounded per-template-per-day values drifts.
 *   • Template analytics caps at 90 days; pricing reaches 365.
 *
 * So the per-template column answers "which template spent this" and this
 * route answers "what did Meta charge". Only the second can be reconciled
 * against an invoice, which is why the screen now shows both.
 *
 * `pricing_analytics` is the exact field behind Meta's own card — asked
 * DAILY and summed here, which also sidesteps Meta rejecting MONTHLY on a
 * part-finished month.
 *
 * Read-only and member-visible: these are the operator's own charges.
 */
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
        // 90 days by default so this lines up with the furthest back
        // template analytics can reach, which is what the Spend column is
        // built from. Comparing a 365-day bill against a 90-day
        // attribution would manufacture a gap that means nothing.
        days: url.searchParams.get('days')
          ? Number(url.searchParams.get('days'))
          : 90,
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
      .select('waba_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (configError || !config?.waba_id) {
      return NextResponse.json(
        {
          error: 'WhatsApp is not connected yet, so there are no charges yet.',
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

    // Currency and charges are fetched together but isolated: Meta omits
    // the currency from every analytics payload, and a missing currency
    // must not cost us the figures.
    const [pricingRes, currencyRes] = await Promise.allSettled([
      fetchPricingAnalytics({
        wabaId,
        accessToken,
        startSec: window.startSec,
        endSec: window.endSec,
        granularity: granularityFor('pricing'),
      }),
      readCurrency(wabaId, accessToken),
    ]);

    if (pricingRes.status === 'rejected') {
      const reason = pricingRes.reason;
      return NextResponse.json(
        {
          error:
            reason instanceof MetaApiError
              ? reason.operatorText
              : reason instanceof Error
                ? reason.message
                : 'Meta did not return message pricing.',
          code: 'meta_unavailable',
        },
        { status: 502 }
      );
    }

    // Shared with the account insights screen on purpose, so the two
    // never quote different totals for the same account. One inherited
    // quirk worth knowing: Meta stamps each bucket in the WABA's own
    // timezone (00:00 IST here) and the normaliser keys buckets by UTC
    // date, so a bucket landing on the day before the window starts is
    // dropped. That only ever touches the first boundary day.
    const pricing = normalizePricingAnalytics(pricingRes.value, window);
    const currency =
      currencyRes.status === 'fulfilled' ? currencyRes.value : null;

    return NextResponse.json({
      // Cost is withheld entirely for WABAs billed through a Solution
      // Partner's credit line, so the screen must be able to hide this
      // rather than print a confident zero.
      available: pricing.hasData && pricing.costReported,
      window: {
        start: window.startDate,
        end: window.endDate,
        days: window.days,
      },
      currency,
      /** Meta's "Approximate total charges". */
      total_charges: pricing.cost,
      volume: pricing.volume,
      paid_volume: pricing.paidVolume,
      free_volume: pricing.freeVolume,
      by_category: pricing.byCategory,
      source: 'meta_live',
    });
  } catch (error) {
    console.error('Error loading message pricing:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load message pricing.',
      },
      { status: 500 }
    );
  }
}

/** Charges are meaningless without their unit, and Meta omits it. */
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
