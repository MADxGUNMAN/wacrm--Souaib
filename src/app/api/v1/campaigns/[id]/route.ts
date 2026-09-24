// ============================================================
// GET /api/v1/campaigns/{id} — one campaign, with what its template
// needs to send (scope: broadcasts:send).
//
// The introspection is what lets an external caller build the right
// form without duplicating this app's understanding of WhatsApp
// templates: `buildSendPlan()` already knows how many body variables a
// template has, whether it has a media header, a carousel, buttons with
// variables, an offer expiry — this route just serialises that plan
// instead of re-deriving a second copy of the same rules for API
// consumers. See docs/google-sheets-addon-plan.md §6.3, and the header
// comment on template-send-inputs.ts on why the rules live in one place.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { isInvalidTextRepresentation } from '@/lib/api/v1/db-errors';
import { buildSendPlan } from '@/lib/whatsapp/template-send-inputs';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { MessageTemplate } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');
    const { id } = await params;

    const { data: campaign, error } = await ctx.supabase
      .from('api_campaigns')
      .select('id, name, template_name, template_language, status, created_at')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    // A malformed id can't be cast to uuid, so the query errors rather
    // than matching nothing. That's the same outcome as an unknown id.
    if (isInvalidTextRepresentation(error)) {
      return fail('not_found', 'Campaign not found', 404);
    }
    if (error) {
      console.error('[api/v1/campaigns/[id]] read error:', error);
      return fail('internal', 'Failed to read campaign', 500);
    }
    if (!campaign) return fail('not_found', 'Campaign not found', 404);

    // The template row backing this campaign. Looked up by name+language
    // rather than a stored id, matching how `createBroadcast` and the
    // scheduled executor already resolve a template — a rename or a
    // resubmission at Meta changes neither.
    const { data: rawTemplateRow } = await ctx.supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('name', campaign.template_name)
      .eq('language', campaign.template_language)
      .maybeSingle();

    // A campaign can legitimately outlive its template — someone deletes
    // the template, or it was never synced locally. Report that plainly
    // rather than 500ing: the campaign itself is real, only the send
    // plan is unavailable.
    let sendPlan: ReturnType<typeof buildSendPlan> | null = null;
    let templateWarning: string | null = null;
    if (!rawTemplateRow) {
      templateWarning = `No local template row found for "${campaign.template_name}" (${campaign.template_language}). Sends through this campaign will fail until it is re-synced.`;
    } else if (!isMessageTemplate(rawTemplateRow)) {
      templateWarning =
        'The template row is malformed locally — re-sync templates from Meta before sending through this campaign.';
    } else {
      const templateRow = rawTemplateRow as MessageTemplate;
      sendPlan = buildSendPlan(templateRow);
    }

    return ok({
      ...campaign,
      template: sendPlan
        ? {
            category:
              (rawTemplateRow as MessageTemplate | null)?.category ?? null,
            body_variable_count: sendPlan.bodyVarCount,
            body_variable_names: sendPlan.bodyParamNames,
            parameter_format:
              sendPlan.bodyParamNames.length > 0 ? 'NAMED' : 'POSITIONAL',
            header: sendPlan.headerMedia
              ? {
                  format: sendPlan.headerMedia.format,
                  requires_media: true,
                  default_url: sendPlan.headerMedia.defaultUrl ?? null,
                }
              : sendPlan.headerVarCount > 0
                ? {
                    format: 'TEXT',
                    requires_media: false,
                    variable_count: sendPlan.headerVarCount,
                  }
                : null,
            needs_header_location: sendPlan.needsHeaderLocation,
            url_buttons: sendPlan.urlButtons,
            copy_code_buttons: sendPlan.copyCodeButtons,
            offer: sendPlan.offer,
            is_order_status: sendPlan.isOrderStatus,
            is_authentication: sendPlan.isAuthentication,
            commerce: sendPlan.commerce,
            cards: sendPlan.cards,
            needs_no_input: sendPlan.needsNoInput,
          }
        : null,
      template_warning: templateWarning,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
