import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  enableTemplateInsights,
  fetchInsightsEnabled,
  isSmbBusinessTypeError,
  MetaApiError,
  SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
} from '@/lib/whatsapp/meta-api';

/**
 * Record that insights are on, so the UI stops offering the switch.
 *
 * Meta's two signals disagree on some accounts — the WABA field can read
 * `true` while `template_analytics` still answers "insights have not been
 * enabled" — and `fetchInsightsEnabled` returns null whenever the customer's
 * token cannot read the field. That combination left the panel recommending an
 * action the operator had already completed, however many times they pressed
 * it. This is the one signal that cannot contradict itself: we watched Meta
 * accept it.
 *
 * Written with `is null` so the FIRST enable keeps its timestamp — that moment
 * is the start of Meta's collection window, and overwriting it would make the
 * UI understate how long data has been gathering.
 *
 * Non-fatal: insights are genuinely on by this point, so a failed bookkeeping
 * write must not be reported as a failed enable. Worst case the panel is
 * stale until the next read resolves it.
 */
async function recordInsightsEnabled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_config')
    .update({ insights_enabled_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('insights_enabled_at', null);

  if (error) {
    console.error(
      '[TEMPLATE INSIGHTS] enabled, but could not record it locally:',
      error.message
    );
  }
}

/**
 * Turn on Meta's template analytics for this account's WABA.
 *
 * POST /api/whatsapp/templates/insights
 *
 * Separate from the per-template analytics route because this is a
 * WABA-level switch, not a template read, and because it carries
 * consequences that a read does not:
 *
 *   • Meta captures NO template analytics until it is confirmed, which
 *     is why a new account sees permanently empty insights without it.
 *   • Confirming opts the account into Meta's link tracking and into
 *     Meta collecting and anonymising chat data.
 *   • It cannot be undone. Meta has no "disable insights" call.
 *
 * Owner-only for exactly those reasons: it changes what Meta is
 * permitted to collect for the whole business, and no member should be
 * able to make that call irreversibly on the owner's behalf.
 *
 * Idempotent from the caller's side — confirming an already-confirmed
 * account succeeds, so a double click is harmless.
 */
export async function POST() {
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
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    if (profile?.account_role !== 'owner') {
      return NextResponse.json(
        {
          error:
            'Only the workspace owner can enable template insights, because Meta cannot switch them off again.',
        },
        { status: 403 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('waba_id, access_token, connection_mode')
      .eq('account_id', accountId)
      .single();
    if (configError || !config || !config.waba_id) {
      return NextResponse.json(
        { error: 'Connect your WhatsApp Business account first.' },
        { status: 400 }
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
        },
        { status: 400 }
      );
    }

    // ── Coexistence numbers can never have this ───────────────
    //
    // Meta refuses template analytics on a number that also runs on the
    // WhatsApp Business phone app, calling it an "SMB business type":
    //
    //   (#10) This operation can not be performed on SMB business type
    //
    // Checked BEFORE contacting Meta because the answer is already known and
    // fixed. Sending the request anyway spends a round trip to be told no, and
    // returns a refusal the operator cannot act on — which is what made this
    // button look broken rather than inapplicable.
    //
    // `connection_mode` is the CRM's own record, set at connection time and
    // corrected against Meta's `is_on_biz_app` (see reconcileConnectionMode),
    // so it is trustworthy here. Meta's own #10 is still handled below as the
    // backstop, in case the stored mode is stale.
    if (config.connection_mode === 'coexistence') {
      return NextResponse.json(
        {
          error: SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
          code: 'insights_unsupported_smb',
        },
        { status: 422 }
      );
    }

    // ── Already on? Then there is nothing to do ───────────────
    //
    // Asked BEFORE writing, for two reasons. The write is irreversible, so
    // making it a no-op when it would change nothing is simply correct. And
    // one of these accounts already read `is_enabled_for_insights: true`
    // while the UI still offered the button — so a click that should have
    // been a silent success was instead sent to Meta, refused, and rendered
    // as a failure on an account where the feature was already on.
    //
    // `null` means the flag could not be read; that falls through to the
    // write attempt rather than blocking it.
    const alreadyEnabled = await fetchInsightsEnabled({
      wabaId: config.waba_id,
      accessToken,
    });

    if (alreadyEnabled === true) {
      await recordInsightsEnabled(supabase, accountId);
      return NextResponse.json({
        success: true,
        already_enabled: true,
        note: 'Template insights were already on for this WhatsApp Business account. Meta collects from the moment it was enabled — earlier sends are not backfilled.',
      });
    }

    try {
      await enableTemplateInsights({ wabaId: config.waba_id, accessToken });
    } catch (e) {
      // Meta sometimes applies the change and still answers with an error.
      // Re-reading the flag turns that into the success it actually was,
      // instead of telling the operator to retry something already done.
      const nowEnabled = await fetchInsightsEnabled({
        wabaId: config.waba_id,
        accessToken,
      });
      if (nowEnabled === true) {
        await recordInsightsEnabled(supabase, accountId);
        return NextResponse.json({
          success: true,
          note: 'Insights are on. Meta starts collecting from now — earlier sends are not backfilled.',
        });
      }

      const metaText =
        e instanceof MetaApiError
          ? e.operatorText
          : e instanceof Error
            ? e.message
            : 'Meta rejected the request to enable template insights.';

      // Meta's own refusal for "this WABA cannot have insights yet". Worth
      // naming explicitly, because it is the one outcome the operator can do
      // nothing about — retrying, reconnecting and re-reading the guide all
      // fail identically, and without saying so the button looks broken.
      // Backstop for the Coexistence case when the stored connection_mode
      // did not catch it — Meta's own answer is authoritative.
      if (isSmbBusinessTypeError(e)) {
        console.error(
          '[TEMPLATE INSIGHTS] Meta refused: SMB/Coexistence business type',
          { wabaId: config.waba_id, storedMode: config.connection_mode }
        );
        return NextResponse.json(
          {
            error: SMB_INSIGHTS_UNSUPPORTED_MESSAGE,
            code: 'insights_unsupported_smb',
          },
          { status: 422 }
        );
      }

      const notAvailableYet =
        e instanceof MetaApiError &&
        (e.subcode === 4182002 || e.code === 200005);

      const error = notAvailableYet
        ? `Meta has not made template insights available for this WhatsApp Business account yet, so it cannot be switched on from here. ` +
          `This is a Meta-side eligibility limit, not a problem with your account or this app — Meta does not support it for WhatsApp Business Accounts owned by or shared with businesses in the EU, UK or Japan, or with a business phone number from those regions. ` +
          `You can also try switching it on in WhatsApp Manager → Insights. (Meta: ${metaText})`
        : metaText;

      console.error('[TEMPLATE INSIGHTS] enable failed:', {
        wabaId: config.waba_id,
        code: e instanceof MetaApiError ? e.code : null,
        subcode: e instanceof MetaApiError ? e.subcode : null,
        fbtraceId: e instanceof MetaApiError ? e.fbtraceId : null,
        notAvailableYet,
        message: metaText,
      });

      // 422, deliberately NOT 502.
      //
      // The request reached us and we understood it; META refused it. A 5xx
      // says "this server is broken", and reverse proxies act on that:
      // Cloudflare and nginx discard the body of an origin 5xx and serve
      // their own HTML error page instead. That is exactly what happened
      // here — the operator saw "The server returned a web page instead of
      // data (502)" and never Meta's actual reason, which was the only
      // useful thing in the response.
      //
      // The identical mistake was diagnosed and written up in
      // templates/test-send/route.ts. 4xx bodies pass through untouched.
      return NextResponse.json({ error }, { status: 422 });
    }

    // Meta accepted it, so this is now a fact we observed — recorded because
    // neither of Meta's own signals can be relied on to agree afterwards.
    await recordInsightsEnabled(supabase, accountId);

    return NextResponse.json({
      success: true,
      // Meta only starts capturing from this point forward — it does not
      // backfill. Saying so here stops the obvious follow-up complaint
      // that the numbers are still zero right after enabling.
      note: 'Insights are on. Meta starts collecting from now — earlier sends are not backfilled.',
    });
  } catch (error) {
    console.error('Error enabling template insights:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to enable template insights.',
      },
      { status: 500 }
    );
  }
}
