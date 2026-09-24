import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
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
  filterOptedOutPhones,
  isMarketingCategory,
  recordOptOutFromSendError,
} from '@/lib/whatsapp/marketing-opt-out';
import { persistBroadcastMessage } from '@/lib/whatsapp/broadcast-inbox';

interface BroadcastResult {
  phone: string;
  /**
   * 'skipped' means suppressed before sending because the recipient opted
   * out of marketing. Deliberately distinct from 'failed': a respected
   * opt-out is not a delivery failure and must not be counted as one.
   */
  status: 'sent' | 'failed' | 'skipped';
  whatsapp_message_id?: string;
  error?: string;
}

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string;
  /** Body variable values, one per {{N}}. Legacy field. */
  params?: string[];
  /**
   * Structured per-send values (header text variable, media URL
   * override, URL/COPY_CODE button values). When set, takes
   * precedence over `params` for the body too — see
   * sendTemplateMessage for the merge rules.
   */
  messageParams?: SendTimeParams;
  /**
   * The contact this phone belongs to, when the caller knows it.
   *
   * This endpoint is phone-array based and historically had no idea who it
   * was messaging, which is why broadcast sends left nothing in the Inbox.
   * The wizard DOES know — it resolved the audience from `contacts` — so it
   * now passes the id through, letting the send be recorded in that
   * contact's conversation thread.
   *
   * Optional: a caller that only has phone numbers still sends fine, it
   * just gets no inbox thread.
   */
  contact_id?: string;
}

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

    // Per-user broadcast budget. Note: this limits how often a user
    // can *start* a campaign, not how many messages go out inside
    // one — the fan-out loop below runs without additional gating.
    const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    // Resolve the caller's account_id. whatsapp_config + templates
    // + broadcasts are all account-scoped post-multi-user, so the
    // old `.eq('user_id', user.id)` filters miss every row created
    // by a teammate.
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

    const body = await request.json();
    const {
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_language,
      template_params,
      // The campaign these sends belong to. Optional so the legacy
      // phone-array shape keeps working; when present, each successful
      // send is recorded in the recipient's Inbox thread and tagged with
      // this id so the Inbox can filter by campaign.
      broadcast_id,
    } = body;

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[];
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients;
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : [];
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }));
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      );
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(config.access_token);

    // Load the template row once so sendTemplateMessage can build
    // header + button components on each iteration. Loading inside
    // the loop would N+1 against Supabase for every recipient.
    // Guard against a malformed local row crashing every send in
    // the loop with the same opaque TypeError — fail loudly once.
    const { data: rawTemplateRow } = await supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', template_name)
      .eq('language', template_language || 'en_US')
      .maybeSingle();
    if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
      return NextResponse.json(
        {
          error:
            'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
        },
        { status: 500 }
      );
    }
    const templateRow = rawTemplateRow ?? null;

    // ── Marketing opt-out suppression ────────────────────────────
    // This endpoint takes a PHONE ARRAY from the caller and never reads
    // `contacts`, so a filter applied only in the broadcast wizard would
    // be cosmetic — any authenticated user could POST straight past it.
    // The gate has to live here.
    //
    // Only marketing is suppressed; utility and authentication templates
    // still go out. isMarketingCategory fails closed when templateRow is
    // null (exists at Meta, never synced locally), where the category is
    // unknowable.
    const suppressedPhones = isMarketingCategory(templateRow?.category)
      ? (
          await filterOptedOutPhones(
            supabase,
            accountId,
            recipients.map((r) => r.phone)
          )
        ).suppressed
      : new Set<string>();

    const results: BroadcastResult[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const recipient of recipients) {
      const sanitized = sanitizePhoneForMeta(recipient.phone);

      if (!isValidE164(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'Invalid phone number format',
        });
        failedCount++;
        continue;
      }

      // `sanitizePhoneForMeta` and `normalizePhone` both reduce to
      // digits-only, so `sanitized` is already the suppression key.
      if (suppressedPhones.has(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'skipped',
          error: 'Recipient opted out of marketing messages',
        });
        skippedCount++;
        continue;
      }

      // Retry with phone variants on "not in allowed list" so numbers
      // that differ only in a trunk-prefix 0 still reach recipients.
      const variants = phoneVariants(sanitized);
      let sentMessageId: string | null = null;
      let lastError: string | null = null;
      // The error OBJECT as well as its message: MetaApiError carries the
      // numeric code, which is what identifies a 131050 (customer opted
      // out at Meta) among ordinary failures.
      let lastErrorObject: unknown = null;

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: variant,
            templateName: template_name,
            language: template_language || 'en_US',
            template: templateRow ?? undefined,
            messageParams: recipient.messageParams,
            params: recipient.params ?? [],
          });
          sentMessageId = result.messageId;
          lastError = null;
          break;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          lastErrorObject = error;
          if (!isRecipientNotAllowedError(errorMessage)) {
            lastError = errorMessage;
            break;
          }
          lastError = errorMessage;
          // retry with next variant
        }
      }

      if (sentMessageId) {
        results.push({
          phone: recipient.phone,
          status: 'sent',
          whatsapp_message_id: sentMessageId,
        });
        sentCount++;

        // Record the send in the recipient's Inbox thread, so a campaign
        // message and the customer's reply sit in one conversation instead
        // of the reply arriving with nothing above it.
        //
        // Needs both ids: the contact to find the thread, and the campaign
        // to tag the message. A caller supplying only phone numbers skips
        // this rather than guessing which contact a number belongs to.
        // Best-effort by contract — Meta has already delivered.
        if (recipient.contact_id && typeof broadcast_id === 'string') {
          await persistBroadcastMessage(supabase, {
            accountId,
            contactId: recipient.contact_id,
            broadcastId: broadcast_id,
            templateName: template_name,
            waMessageId: sentMessageId,
            templateBody: templateRow?.body_text ?? null,
            params: recipient.params ?? [],
            senderUserId: user.id,
          });
        }
      } else {
        console.error(
          `Failed to send broadcast to ${recipient.phone}:`,
          lastError
        );
        // Meta error 131050 means the customer opted out at the platform
        // level. Recording it locally is what stops the next broadcast
        // rediscovering the same fact one wasted send at a time.
        await recordOptOutFromSendError(supabase, {
          accountId,
          phone: sanitized,
          error: lastErrorObject ?? lastError,
        });
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: lastError || 'Unknown error',
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
    });
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error);
    return NextResponse.json(
      { error: 'Failed to process broadcast' },
      { status: 500 }
    );
  }
}
