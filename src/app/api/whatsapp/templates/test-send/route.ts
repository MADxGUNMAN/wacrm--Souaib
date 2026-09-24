import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  isMarketingCategory,
  isPhoneOptedOut,
  recordOptOutFromSendError,
} from '@/lib/whatsapp/marketing-opt-out';

/**
 * POST /api/whatsapp/templates/test-send
 *
 * Send ONE template message to a number the operator typed, so they can
 * see the real thing on a real handset before committing a campaign to
 * an audience. A broadcast is irreversible — once it is out, a wrong
 * image or an unfilled variable has already reached everyone.
 *
 * Body:
 *   {
 *     phone: "+919876543210",     // required, E.164
 *     name?: "Souaib",            // optional, only used to resolve
 *                                 // {{name}}-style variables locally
 *     template_name: "promo",     // required
 *     template_language: "en_US", // optional (default en_US)
 *     params?: string[],          // positional body values
 *     messageParams?: SendTimeParams
 *   }
 *
 * ─── Why this deliberately writes NOTHING to the CRM ──────────────
 *
 * The obvious implementation reuses POST /api/whatsapp/send, but that
 * route takes a `conversation_id` or a `contact_id` — and reaching a raw
 * number means `resolveConversationByPhone`, which CREATES a contact, a
 * conversation and a `messages` row. A tester's own number would then
 * appear in Contacts and the Inbox as though they were a customer, and
 * every test would leave another artefact behind.
 *
 * So this mirrors `/api/whatsapp/broadcast` instead: load the config,
 * decrypt the token, call Meta. No contact, no conversation, no message
 * row. The honest trade-off, stated because it is a real limitation:
 * a test message does not appear in the inbox, and its delivery/read
 * webhooks have no row to attach to, so it is fire-and-confirm-on-your-
 * handset only.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Own bucket, tighter than `send`: each call is a billable message
    // to a hand-typed number, and this endpoint must not become an
    // unmetered way around the broadcast budget.
    const limit = checkRateLimit(`testSend:${user.id}`, RATE_LIMITS.testSend);
    if (!limit.success) {
      return rateLimitResponse(limit);
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be a JSON object' },
        { status: 400 }
      );
    }

    const { phone, template_name, template_language, params, messageParams } =
      body as {
        phone?: unknown;
        template_name?: unknown;
        template_language?: unknown;
        params?: unknown;
        messageParams?: SendTimeParams;
      };

    if (typeof template_name !== 'string' || !template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      );
    }

    const sanitized = sanitizePhoneForMeta(
      typeof phone === 'string' ? phone : ''
    );
    if (!isValidE164(sanitized)) {
      return NextResponse.json(
        {
          error:
            'Enter a valid phone number in international format, e.g. +91 98765 43210',
        },
        { status: 400 }
      );
    }

    const language =
      typeof template_language === 'string' && template_language
        ? template_language
        : 'en_US';

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp is not connected yet. Finish the WhatsApp setup before sending a test.',
        },
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
            'Stored WhatsApp credentials could not be read. Reconnect WhatsApp in Settings.',
        },
        { status: 400 }
      );
    }

    // The template row drives header/button component assembly. Without
    // it a media header or a URL button silently would not reach the
    // handset — which would make the test message differ from the real
    // broadcast, defeating the entire point of testing.
    const { data: rawTemplateRow } = await supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', template_name)
      .eq('language', language)
      .maybeSingle();

    if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
      return NextResponse.json(
        {
          error:
            'This template is malformed locally — run "Sync from Meta" on the Templates page before testing it.',
        },
        { status: 500 }
      );
    }
    const templateRow = rawTemplateRow ?? null;

    // ── Marketing opt-out ─────────────────────────────────────────
    // An opt-out is a per-phone legal state, not a per-campaign one.
    // Someone who replied STOP must not receive a marketing message
    // because an operator labelled this one a "test" — Meta's own policy
    // and the account's quality rating make no such distinction.
    //
    // Utility and authentication templates are unaffected, matching the
    // rule the broadcast paths already follow. isMarketingCategory fails
    // closed when the row is missing (exists at Meta, never synced), so
    // an unknown category is treated as marketing.
    if (isMarketingCategory(templateRow?.category)) {
      const optedOut = await isPhoneOptedOut(supabase, accountId, sanitized);
      if (optedOut) {
        return NextResponse.json(
          {
            error:
              'That number has opted out of marketing messages from this account, so a marketing template cannot be sent to it — even as a test.',
            code: 'recipient_opted_out',
          },
          { status: 409 }
        );
      }
    }

    // Retry across trunk-prefix variants, exactly as the broadcast path
    // does, so a number stored with a leading 0 still reaches its owner.
    const variants = phoneVariants(sanitized);
    let sentMessageId: string | null = null;
    let lastError: string | null = null;
    let lastErrorObject: unknown = null;

    for (const variant of variants) {
      try {
        const result = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: variant,
          templateName: template_name,
          language,
          template: templateRow ?? undefined,
          messageParams: messageParams ?? undefined,
          params: Array.isArray(params)
            ? params.filter((p): p is string => typeof p === 'string')
            : [],
        });
        sentMessageId = result.messageId;
        lastError = null;
        break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        lastError = message;
        lastErrorObject = error;
        if (!isRecipientNotAllowedError(message)) break;
      }
    }

    if (!sentMessageId) {
      // 131050 means the customer opted out at Meta's own level. Record
      // it so the next send suppresses them up front rather than paying
      // to rediscover the same fact.
      await recordOptOutFromSendError(supabase, {
        accountId,
        phone: sanitized,
        error: lastErrorObject ?? lastError,
      });
      // 422, deliberately NOT 502.
      //
      // The request reached us and we understood it; Meta refused the
      // CONTENT. A 5xx says "this server is broken", and reverse proxies
      // act on that: Cloudflare and nginx routinely discard the body of
      // an origin 5xx and substitute their own HTML error page. That
      // destroys the one useful thing in this response — Meta's verbatim
      // reason — and the operator is left reading "the server returned a
      // web page instead of data (502)".
      //
      // This exact degradation was diagnosed and written up once before
      // (the "Failed to send template: HTTP 502" work), and returning 502
      // here walked straight back into it: behind a Cloudflare tunnel the
      // JSON never survived. 4xx bodies are passed through untouched.
      return NextResponse.json(
        { error: lastError || 'Failed to send the test message' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      whatsapp_message_id: sentMessageId,
      /** Echoed so the UI can name exactly which number was reached. */
      phone: sanitized,
    });
  } catch (error) {
    console.error('Error in template test-send POST:', error);
    return NextResponse.json(
      { error: 'Failed to send the test message' },
      { status: 500 }
    );
  }
}
