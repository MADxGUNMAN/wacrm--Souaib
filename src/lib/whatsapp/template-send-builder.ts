/**
 * Build the Meta `components` array used by POST /{phone_number_id}/messages
 * when sending an APPROVED template.
 *
 * Distinct from `template-components.ts` — that module builds the
 * `components` for TEMPLATE CREATION (where you describe headers,
 * footers, buttons, examples). This module builds the per-send
 * `components` (where you fill in variable values and supply the
 * actual media link or button URL suffix for THIS specific delivery).
 *
 * Auto-fills as much as possible from the template row so callers
 * only need to supply values for the variable-bearing fields:
 *
 *   - Static IMAGE/VIDEO/DOCUMENT headers ride along automatically
 *     using the template's `header_media_url` (or `header_handle`).
 *     Meta requires the media component on every send even though
 *     the URL hasn't changed since approval.
 *   - TEXT headers with `{{1}}` need `headerText` from the caller.
 *   - Body variables come in as `body: string[]`, indexed by {{N}}.
 *   - URL buttons with `{{1}}` need `buttonUrlParams[i]` keyed by
 *     button index. URL buttons without variables, plus QUICK_REPLY
 *     and PHONE_NUMBER buttons, don't need send-time parameters.
 *   - COPY_CODE buttons need the actual code to display. We fall
 *     back to the template's `example` value if the caller doesn't
 *     override — that matches the most common use case (a static
 *     promo code) without forcing UI work.
 *
 * Validation throws here (not at the Meta API boundary) so a missing
 * sample surfaces as "Header text variable {{1}} requires a value",
 * not a 400 from Meta that doesn't say which field broke.
 */

import type { MessageTemplate, TemplateButton } from '@/types';
import { MPM_LIMITS, ORDER_DETAILS_LIMITS } from './template-limits';
import {
  extractNamedParams,
  extractVariableIndices,
} from './template-variables';
import {
  definitionFromRow,
  findComponent,
  getBody,
  getButtons,
  getCarouselCards,
  getHeader,
  type TemplateDefinition,
} from './template-definition';
export { carouselNeedsSendInput } from './template-definition';

export interface SendTimeParams {
  /** Values for body {{1}}, {{2}}, … indexed by variable position. */
  body?: string[];
  /**
   * Values for a NAMED-format body, keyed by parameter name.
   *
   * Separate from `body` rather than overloading it: the two formats
   * cannot coexist in one template, and a positional array silently
   * mismatched against names would send the right values under the wrong
   * labels.
   */
  namedBody?: Record<string, string>;
  /** Value for TEXT-header {{1}}, when the header has a variable. */
  headerText?: string;
  /** Override the template's static media URL for this send. */
  headerMediaUrl?: string;
  /**
   * The map pin for a LOCATION header. Required on every send of such a
   * template — the template itself stores no coordinates, which is the
   * point: one template serves every branch or delivery address.
   */
  headerLocation?: {
    latitude: string;
    longitude: string;
    name: string;
    address: string;
  };
  /** Alternative: send the media by Meta media id (from prior upload). */
  headerMediaId?: string;
  /**
   * Per-button overrides keyed by the button's index in the
   * template's `buttons` array. Used for URL buttons with a {{1}}
   * suffix and for COPY_CODE buttons whose example you want to
   * override at send time.
   */
  buttonParams?: Record<number, string>;
  /**
   * When the offer code expires, as a UNIX timestamp in MILLISECONDS.
   *
   * Required for a limited-time offer template — Meta has no default,
   * because the whole point is a per-message deadline.
   */
  offerExpiresAtMs?: number;
  /**
   * Per-card values for a carousel, in card order.
   *
   * Usually unnecessary: card media defaults to the sample URL stored on
   * the template, exactly as a normal media header does. Only cards with
   * variables in their text or URL button need anything here.
   */
  cards?: CardSendParams[];
  /**
   * Flow templates: the token that identifies this Flow SESSION.
   *
   * Meta echoes it back on the webhook carrying the customer's answers,
   * so it is the only way to tie a submitted form to the message that
   * started it. Generated per send when the caller does not supply one —
   * reusing one token across recipients would make every response look
   * like the same session.
   */
  flowToken?: string;
  /**
   * Flow templates: initial data for the first screen.
   *
   * Merged into `flow_action_data` alongside the screen name. Only useful
   * for a 'navigate' Flow whose first screen expects data.
   */
  flowActionData?: Record<string, unknown>;
  /**
   * Order-status templates: which order this send updates.
   *
   * The reference id of the `order_details` message that created the
   * order. There is no default and no way to derive one — the send is
   * meaningless without it.
   */
  orderReferenceId?: string;
  /** The new status. Meta validates the transition and rejects invalid ones. */
  orderStatus?: OrderStatusValue;
  /** Optional free text shown under the status on the order card. */
  orderStatusDescription?: string;
  /**
   * Catalogue templates: the product whose image becomes the message
   * header. Optional — Meta falls back to the first item in the catalogue.
   */
  catalogThumbnailProductId?: string;
  /**
   * Multi-product templates: the curated product list. Required, because
   * the template stores no products at all — it only stores the button.
   */
  mpm?: {
    thumbnailProductId?: string;
    sections: { title: string; productIds: string[] }[];
  };
  /** Order-details templates: the invoice this message asks payment for. */
  orderDetails?: OrderDetailsSendParams;
}

/**
 * The invoice behind an order-details message.
 *
 * Amounts are given in MAJOR UNITS (rupees, not paise) and converted to
 * Meta's `{ offset, value }` form by the builder. That conversion is the
 * single most dangerous detail in this shape: Meta reads `value` in minor
 * units, so passing 250 rupees straight through as `value: 250` with an
 * offset of 100 bills the customer ₹2.50 — and passing 250 with no offset
 * has billed people 100× over in other integrations. Callers therefore
 * never supply `offset` themselves.
 */
export interface OrderDetailsSendParams {
  /** Your own order id. Echoed back on the payment webhook. */
  referenceId: string;
  /** ISO currency code, e.g. 'INR'. */
  currency: string;
  /** 'digital-goods' or 'physical-goods'. Meta uses it for tax handling. */
  goodsType?: 'digital-goods' | 'physical-goods';
  items: {
    name: string;
    /** Major units, e.g. 250 for ₹250. */
    amount: number;
    quantity: number;
    /** SKU / Content ID when the item is from a catalogue. */
    retailerId?: string;
  }[];
  /** Major units. Defaults to 0. */
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  /**
   * Meta's payment configuration name, from WhatsApp Manager. Required for
   * the customer to be able to pay — without it the invoice renders but
   * has no gateway behind it.
   */
  paymentConfiguration?: string;
}

/**
 * The order states Meta accepts on an order-status send.
 *
 * NOTE the underscores. Meta's own documentation lists
 * "partially-shipped" with a hyphen in its prose table and
 * `partially_shipped` with an underscore in the send example. The example
 * is what the API parses, so underscores it is.
 */
export const ORDER_STATUS_VALUES = [
  'pending',
  'processing',
  'partially_shipped',
  'shipped',
  'completed',
  'canceled',
] as const;

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

export interface CardSendParams {
  /** Overrides the card's stored sample media URL for this send. */
  headerMediaUrl?: string;
  /** Alternative: a real /media upload id. */
  headerMediaId?: string;
  /** Values for the card body's {{1}}, {{2}}, … */
  body?: string[];
  /** Keyed by the button's index within THIS card. */
  buttonParams?: Record<number, string>;
}

export type MetaSendComponent =
  | { type: 'header'; parameters: MetaSendParameter[] }
  | { type: 'body'; parameters: MetaSendParameter[] }
  | {
      type: 'button';
      sub_type:
        | 'url'
        | 'quick_reply'
        | 'copy_code'
        | 'flow'
        | 'catalog'
        | 'mpm'
        | 'order_details';
      index: string;
      parameters: MetaSendParameter[];
    }
  | { type: 'carousel'; cards: MetaSendCard[] }
  | { type: 'limited_time_offer'; parameters: MetaSendParameter[] }
  | { type: 'order_status'; parameters: MetaSendParameter[] };

export interface MetaSendCard {
  /** Zero-indexed position. Must cover every approved card. */
  card_index: number;
  components: MetaSendComponent[];
}

type MetaSendParameter =
  /** `parameter_name` is present only on NAMED-format templates. */
  | { type: 'text'; text: string; parameter_name?: string }
  | {
      type: 'limited_time_offer';
      limited_time_offer: { expiration_time_ms: number };
    }
  | { type: 'image'; image: { link?: string; id?: string } }
  | { type: 'video'; video: { link?: string; id?: string } }
  | { type: 'document'; document: { link?: string; id?: string } }
  | {
      type: 'location';
      location: {
        latitude: string;
        longitude: string;
        name: string;
        address: string;
      };
    }
  | { type: 'coupon_code'; coupon_code: string }
  | { type: 'payload'; payload: string }
  | {
      type: 'action';
      action: {
        flow_token: string;
        /** Present for a 'navigate' Flow only — Meta rejects it otherwise. */
        flow_action_data?: { screen?: string; data?: Record<string, unknown> };
      };
    }
  | {
      type: 'action';
      action: {
        /** Catalogue + MPM: the product whose image heads the message. */
        thumbnail_product_retailer_id?: string;
        /** MPM only. */
        sections?: {
          title: string;
          product_items: { product_retailer_id: string }[];
        }[];
        /** Order details only. */
        order_details?: MetaOrderDetails;
      };
    }
  | {
      type: 'order_status';
      order_status: {
        /** The order_details message this update refers to. */
        reference_id: string;
        order: { status: OrderStatusValue; description?: string };
      };
    };

function buildHeaderComponent(
  template: MessageTemplate,
  params: SendTimeParams,
): MetaSendComponent | null {
  const headerType = template.header_type;
  if (!headerType) return null;

  if (headerType === 'text') {
    // TEXT header with {{1}} → need a value. Static text headers
    // (no variables) just ride along inside the template itself; no
    // header component required on send.
    const varCount = extractVariableIndices(template.header_content ?? '').length;
    if (varCount === 0) return null;
    const value = params.headerText;
    if (!value || !value.trim()) {
      throw new Error(
        'Header text variable {{1}} requires a value — pass headerText.',
      );
    }
    return {
      type: 'header',
      parameters: [{ type: 'text', text: value }],
    };
  }

  if (headerType === 'location') {
    // All four fields are required. Meta renders the pin from the
    // coordinates and the label from name + address, and rejects a partial
    // object — so a half-filled form is refused here with a message that
    // names the field, rather than upstream with one that does not.
    const loc = params.headerLocation;
    const missing = (['latitude', 'longitude', 'name', 'address'] as const)
      .filter((k) => !loc?.[k]?.toString().trim())
      .map((k) => k);
    if (!loc || missing.length > 0) {
      throw new Error(
        `A location header needs latitude, longitude, name and address — missing ${missing.join(', ')}.`,
      );
    }
    return {
      type: 'header',
      parameters: [
        {
          type: 'location',
          location: {
            latitude: String(loc.latitude).trim(),
            longitude: String(loc.longitude).trim(),
            name: loc.name.trim(),
            address: loc.address.trim(),
          },
        },
      ],
    };
  }

  // image / video / document — Meta requires the media component on
  // every send. Prefer the caller's explicit override; fall back to the
  // template's stored public URL.
  //
  // NOTE: `template.header_handle` is intentionally NOT used here. It's a
  // Resumable-Upload handle that's only valid as the *creation-time*
  // sample (`example.header_handle`); it is NOT a reusable send-time
  // media id, and passing it as `{ id }` makes Meta reject the send. Only
  // an explicit `headerMediaId` (a real /media upload id) is honored.
  const link = params.headerMediaUrl ?? template.header_media_url;
  const id = params.headerMediaId;
  if (!link && !id) {
    throw new Error(
      `${headerType} header requires a media link or id at send time — set header_media_url on the template or pass headerMediaUrl/headerMediaId.`,
    );
  }
  const mediaPayload: { link?: string; id?: string } = id ? { id } : { link };
  return {
    type: 'header',
    parameters: [
      headerType === 'image'
        ? { type: 'image', image: mediaPayload }
        : headerType === 'video'
          ? { type: 'video', video: mediaPayload }
          : { type: 'document', document: mediaPayload },
    ],
  };
}

function buildBodyComponent(
  template: MessageTemplate,
  params: SendTimeParams,
): MetaSendComponent | null {
  // NAMED templates are matched by parameter NAME, not by position, so
  // they take a separate path — a positional array sent for a named
  // template is rejected, and Meta's error does not say why.
  if (template.parameter_format === 'NAMED') {
    const names = extractNamedParams(template.body_text);
    if (names.length === 0) return null;
    const supplied = params.namedBody ?? {};
    const missing = names.filter((n) => !supplied[n]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `Missing value(s) for ${missing.map((n) => `{{${n}}}`).join(', ')}.`,
      );
    }
    return {
      type: 'body',
      parameters: names.map((param_name) => ({
        type: 'text',
        parameter_name: param_name,
        text: String(supplied[param_name]),
      })),
    };
  }

  const varCount = extractVariableIndices(template.body_text).length;
  const body = params.body ?? [];
  if (varCount === 0 && body.length === 0) return null;
  if (body.length < varCount) {
    throw new Error(
      `Body has ${varCount} variable(s) but only ${body.length} value(s) were supplied.`,
    );
  }
  // Trim to the variable count — extra values are dropped silently so
  // a legacy caller that passes too many doesn't error out.
  const values = body.slice(0, varCount);
  return {
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text: String(text) })),
  };
}

function buttonNeedsSendParam(
  button: TemplateButton,
  override: string | undefined,
): boolean {
  switch (button.type) {
    case 'URL':
      return extractVariableIndices(button.url).length > 0;
    case 'COPY_CODE':
      // We always emit a button param for COPY_CODE so the customer
      // gets a real code (either the caller's override or the
      // template's example as a default).
      return true;
    case 'QUICK_REPLY':
    case 'PHONE_NUMBER':
      return override !== undefined;
    case 'VOICE_CALL':
      // Never takes a send-time parameter — the button carries no data.
      return false;
  }
}

function buildButtonComponent(
  button: TemplateButton,
  index: number,
  override: string | undefined,
): MetaSendComponent | null {
  if (!buttonNeedsSendParam(button, override)) return null;

  switch (button.type) {
    case 'URL': {
      // Each URL button is its own component with sub_type=url and
      // the button's index in the template's buttons array.
      if (!override || !override.trim()) {
        throw new Error(
          `URL button #${index + 1} uses {{1}} — requires a buttonParams[${index}] value.`,
        );
      }
      return {
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: override }],
      };
    }
    case 'COPY_CODE': {
      const code = override?.trim() || button.example;
      return {
        type: 'button',
        sub_type: 'copy_code',
        index: String(index),
        parameters: [{ type: 'coupon_code', coupon_code: code }],
      };
    }
    case 'QUICK_REPLY': {
      // Only included when the caller explicitly overrides the
      // payload (rare — usually QR buttons use their default text).
      return {
        type: 'button',
        sub_type: 'quick_reply',
        index: String(index),
        parameters: [{ type: 'payload', payload: override! }],
      };
    }
    case 'PHONE_NUMBER':
    case 'VOICE_CALL':
      // Neither accepts send-time params per Meta — return null even if
      // an override snuck through.
      return null;
  }
}

/**
 * Build the full `components` array for the send-message payload.
 * Returns an empty array when the template is fully static (no
 * variables, no media header), which is a valid Meta request.
 */
/**
 * Components for sending a carousel template.
 *
 * Two things Meta is strict about, both enforced here:
 *
 *   1. The number of cards sent must EQUAL the number approved. Sending
 *      fewer returns error #132012 with the message "header component
 *      parameter should not be empty", which points at the wrong thing
 *      entirely. So the cards are built from the STORED components and
 *      the caller's params only fill them in — the count cannot drift.
 *
 *   2. Card buttons are addressed by their index within the card, and
 *      that index must match the approved order. Since validateCarousel
 *      guarantees every card shares one button shape, the stored order is
 *      authoritative.
 *
 * Card media falls back to the sample URL stored at creation, mirroring
 * how a normal media header rides along on every send.
 */
export function buildCarouselSendComponents(
  definition: TemplateDefinition,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];
  const cards = getCarouselCards(definition.components);

  // The message body above the cards follows the normal rules.
  const topBody = getBody(definition.components);
  const topVarCount = extractVariableIndices(topBody?.text ?? '').length;
  if (topVarCount > 0) {
    const values = (params.body ?? []).slice(0, topVarCount);
    if (values.length < topVarCount) {
      throw new Error(
        `Message body has ${topVarCount} variable(s) but ${values.length} value(s) were supplied.`,
      );
    }
    out.push({
      type: 'body',
      parameters: values.map((text) => ({ type: 'text' as const, text })),
    });
  }

  const sendCards: MetaSendCard[] = cards.map((card, cardIndex) => {
    const given = params.cards?.[cardIndex] ?? {};
    const components: MetaSendComponent[] = [];

    // ---- header: always required on every send ----
    const header = getHeader(card.components);
    // Narrow to a media header up front: TEXT and LOCATION headers have
    // no `example.header_url`, and a card cannot legally have either.
    const mediaHeader =
      header && header.format !== 'TEXT' && header.format !== 'LOCATION'
        ? header
        : null;
    if (!mediaHeader) {
      throw new Error(
        `Card ${cardIndex + 1} has no media header — a carousel card cannot be sent without one.`,
      );
    }
    const format = mediaHeader.format;
    const link = given.headerMediaUrl ?? mediaHeader.example?.header_url?.[0];
    const id = given.headerMediaId;
    if (!link && !id) {
      throw new Error(
        `Card ${cardIndex + 1} needs a media link or id at send time.`,
      );
    }
    const media: { link?: string; id?: string } = id ? { id } : { link };
    components.push({
      type: 'header',
      parameters: [
        format === 'IMAGE'
          ? { type: 'image', image: media }
          : format === 'VIDEO'
            ? { type: 'video', video: media }
            : { type: 'document', document: media },
      ],
    });

    // ---- card body variables ----
    const cardBody = getBody(card.components);
    const cardVarCount = extractVariableIndices(cardBody?.text ?? '').length;
    if (cardVarCount > 0) {
      const values = (given.body ?? []).slice(0, cardVarCount);
      if (values.length < cardVarCount) {
        throw new Error(
          `Card ${cardIndex + 1} text has ${cardVarCount} variable(s) but ${values.length} value(s) were supplied.`,
        );
      }
      components.push({
        type: 'body',
        parameters: values.map((text) => ({ type: 'text' as const, text })),
      });
    }

    // ---- card buttons ----
    getButtons(card.components).forEach((button, buttonIndex) => {
      const override = given.buttonParams?.[buttonIndex];

      if (button.type === 'URL') {
        // Only a URL carrying a variable needs a parameter; a static one
        // is already baked into the approved template.
        if (extractVariableIndices(button.url).length === 0) return;
        if (!override?.trim()) {
          throw new Error(
            `Card ${cardIndex + 1}, button ${buttonIndex + 1} has a URL variable and needs a value.`,
          );
        }
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(buttonIndex),
          parameters: [{ type: 'text', text: override }],
        });
        return;
      }

      if (button.type === 'QUICK_REPLY' && override?.trim()) {
        // Optional: the payload echoed back in the webhook when tapped.
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(buttonIndex),
          parameters: [{ type: 'payload', payload: override }],
        });
      }
      // PHONE_NUMBER buttons never take a send-time parameter.
    });

    return { card_index: cardIndex, components };
  });

  out.push({ type: 'carousel', cards: sendCards });
  return out;
}

/**
 * Components for sending a limited-time offer template.
 *
 * The expiry is REQUIRED on every send and has no sensible default — the
 * deadline is the whole feature, and inventing one would silently promise
 * the customer something untrue. So this throws rather than guessing.
 *
 * Button indexes are fixed by Meta's own rule: the copy-code button is
 * always 0, and the website button is 1 when a copy-code button is
 * present. Since validateLimitedTimeOffer requires exactly one copy-code
 * button, the website button is always index 1 here.
 */
export function buildLtoSendComponents(
  template: MessageTemplate,
  definition: TemplateDefinition,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];

  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);

  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  const expiresAt = params.offerExpiresAtMs;
  if (!expiresAt || !Number.isFinite(expiresAt)) {
    throw new Error(
      'A limited-time offer needs an expiry time (offerExpiresAtMs, a UNIX timestamp in milliseconds).',
    );
  }
  if (expiresAt <= Date.now()) {
    // Meta would accept it and the customer would receive an offer that
    // is already dead. Better to refuse.
    throw new Error(
      'The offer expiry is in the past — the customer would receive an already-expired offer.',
    );
  }
  out.push({
    type: 'limited_time_offer',
    parameters: [
      {
        type: 'limited_time_offer',
        limited_time_offer: { expiration_time_ms: expiresAt },
      },
    ],
  });

  getButtons(definition.components).forEach((button, index) => {
    if (button.type === 'COPY_CODE') {
      // Falls back to the approved example, matching the standard
      // copy-code path — most offers use one fixed code.
      const code = params.buttonParams?.[index] ?? button.example?.[0];
      if (!code) {
        throw new Error('The offer code is missing for the copy-code button.');
      }
      out.push({
        type: 'button',
        sub_type: 'copy_code',
        index: String(index),
        parameters: [{ type: 'coupon_code', coupon_code: code }],
      });
      return;
    }
    if (button.type === 'URL') {
      if (extractVariableIndices(button.url).length === 0) return;
      const value = params.buttonParams?.[index];
      if (!value?.trim()) {
        throw new Error(
          'The website button URL has a variable and needs a value.',
        );
      }
      out.push({
        type: 'button',
        sub_type: 'url',
        index: String(index),
        parameters: [{ type: 'text', text: value }],
      });
    }
  });

  return out;
}

/**
 * Components for sending a Flow template.
 *
 * The content half is the standard path — header, body, and any ordinary
 * buttons. What is special is the FLOW button, which needs a `flow_token`
 * on every send:
 *
 *   { type: 'button', sub_type: 'flow', index: '<i>',
 *     parameters: [{ type: 'action',
 *                    action: { flow_token, flow_action_data: { screen } } }] }
 *
 * Two decisions worth knowing:
 *
 *   - The token is GENERATED when the caller does not supply one. It
 *     identifies the session and comes back on the webhook carrying the
 *     customer's answers, so a shared or missing token would make every
 *     response indistinguishable. There is nothing for an operator to
 *     decide here, so asking them for one would be noise.
 *   - `flow_action_data.screen` is taken from the APPROVED button rather
 *     than from the caller. Meta requires it for a 'navigate' Flow and
 *     rejects it for 'data_exchange', and the approved template already
 *     records which it is — re-asking would let a send contradict it.
 *
 * The FLOW button is read from `components`, never from the flat `buttons`
 * column: `toLegacyButton` drops FLOW on purpose, so the flat cache for a
 * Flow template has no buttons at all.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/flows-templates
 */
export function buildFlowSendComponents(
  template: MessageTemplate,
  definition: TemplateDefinition,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];

  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);

  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  getButtons(definition.components).forEach((button, index) => {
    if (button.type !== 'FLOW') {
      // A Flow template carries only its Flow button today
      // (validateFlowTemplate enforces that), but a row synced from Meta
      // could hold more, so the standard rules still apply to the rest
      // rather than being silently dropped.
      const legacy =
        button.type === 'URL' ||
        button.type === 'QUICK_REPLY' ||
        button.type === 'PHONE_NUMBER' ||
        button.type === 'COPY_CODE';
      if (!legacy) return;
      const component = buildButtonComponent(
        button as TemplateButton,
        index,
        params.buttonParams?.[index],
      );
      if (component) out.push(component);
      return;
    }

    const action: {
      flow_token: string;
      flow_action_data?: { screen?: string; data?: Record<string, unknown> };
    } = {
      // A stable, unique per-send identifier. `randomUUID` is available in
      // Node 19+ and in the edge runtime, both of which this path runs on.
      flow_token: params.flowToken?.trim() || crypto.randomUUID(),
    };

    // 'navigate' is Meta's default when the button omits flow_action, so
    // an absent value is treated as navigate — matching what this app
    // submits and what draftFromRow reads back.
    const isNavigate = button.flow_action !== 'data_exchange';
    if (isNavigate) {
      const screen = button.navigate_screen?.trim();
      if (!screen) {
        throw new Error(
          'This Flow template has no starting screen recorded, so it cannot be sent. Re-create it with the first screen from your Flow JSON.',
        );
      }
      action.flow_action_data = {
        screen,
        ...(params.flowActionData ? { data: params.flowActionData } : {}),
      };
    }

    out.push({
      type: 'button',
      sub_type: 'flow',
      index: String(index),
      parameters: [{ type: 'action', action }],
    });
  });

  return out;
}

/** Meta's money shape: `value` is in MINOR units, `offset` says how many per major. */
interface MetaMoney {
  offset: number;
  value: number;
}

interface MetaOrderDetails {
  reference_id: string;
  type: 'digital-goods' | 'physical-goods';
  currency: string;
  total_amount: MetaMoney;
  order: {
    status: 'pending';
    items: {
      name: string;
      amount: MetaMoney;
      quantity: number;
      retailer_id?: string;
    }[];
    subtotal: MetaMoney;
    tax: MetaMoney;
    shipping?: MetaMoney;
    discount?: MetaMoney;
  };
  payment_settings?: { type: 'payment_gateway'; payment_gateway: { configuration_name: string } }[];
}

/**
 * Convert major units to Meta's offset/value pair.
 *
 * Rounded, not truncated: 19.99 × 100 in floating point is 1998.9999…,
 * and truncating would quietly undercharge by a paisa on a large share of
 * real prices.
 */
function toMetaMoney(majorUnits: number): MetaMoney {
  const offset = ORDER_DETAILS_LIMITS.amountOffset;
  return { offset, value: Math.round(majorUnits * offset) };
}

/**
 * Components for sending a catalogue template.
 *
 * The button needs no data — it opens the whole catalogue — so the only
 * optional extra is which product's image heads the message. Omit it and
 * Meta uses the first item in the catalogue.
 */
export function buildCatalogSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];
  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  const thumbnail = params.catalogThumbnailProductId?.trim();
  out.push({
    type: 'button',
    sub_type: 'catalog',
    index: '0',
    parameters: [
      {
        type: 'action',
        action: thumbnail
          ? { thumbnail_product_retailer_id: thumbnail }
          : {},
      },
    ],
  });
  return out;
}

/**
 * Components for sending a multi-product (MPM) template.
 *
 * Unlike every other type, the PRODUCTS ARE NOT PART OF THE TEMPLATE —
 * the approved template holds only the button, so each send names the
 * sections and the products inside them. That means an MPM template can
 * never be sent without input, and the limits (10 sections, 30 products
 * across all of them) are checked here because Meta's rejection counts
 * neither.
 */
export function buildMpmSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];

  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);
  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  const mpm = params.mpm;
  const sections = (mpm?.sections ?? [])
    .map((s) => ({
      title: s.title.trim(),
      productIds: s.productIds.map((p) => p.trim()).filter(Boolean),
    }))
    .filter((s) => s.productIds.length > 0);

  if (sections.length === 0) {
    throw new Error(
      'A multi-product message needs at least one section with at least one product.',
    );
  }
  if (sections.length > MPM_LIMITS.maxSections) {
    throw new Error(
      `At most ${MPM_LIMITS.maxSections} sections are allowed (got ${sections.length}).`,
    );
  }
  const productCount = sections.reduce((n, s) => n + s.productIds.length, 0);
  if (productCount > MPM_LIMITS.maxProductsTotal) {
    throw new Error(
      `At most ${MPM_LIMITS.maxProductsTotal} products are allowed across all sections (got ${productCount}).`,
    );
  }
  const missingTitle = sections.findIndex((s) => s.title === '');
  if (missingTitle !== -1) {
    throw new Error(`Section ${missingTitle + 1} needs a title.`);
  }

  const thumbnail = mpm?.thumbnailProductId?.trim();
  out.push({
    type: 'button',
    sub_type: 'mpm',
    index: '0',
    parameters: [
      {
        type: 'action',
        action: {
          ...(thumbnail ? { thumbnail_product_retailer_id: thumbnail } : {}),
          sections: sections.map((s) => ({
            title: s.title,
            product_items: s.productIds.map((product_retailer_id) => ({
              product_retailer_id,
            })),
          })),
        },
      },
    ],
  });
  return out;
}

/**
 * Components for sending an order-details (invoice) template.
 *
 * The template carries no order, so every send supplies the whole invoice.
 * Totals are COMPUTED here rather than accepted from the caller: Meta
 * validates that total = subtotal + tax + shipping − discount and rejects
 * a mismatch, and a hand-supplied total that disagrees with the items is
 * the kind of bug that shows up as a customer being charged the wrong
 * amount rather than as an error.
 */
export function buildOrderDetailsSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];

  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);
  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  const order = params.orderDetails;
  if (!order) {
    throw new Error(
      'An order details message needs the invoice — reference id, currency and at least one item.',
    );
  }
  if (!order.referenceId?.trim()) {
    throw new Error('The invoice needs your own order reference id.');
  }
  if (!order.currency?.trim()) {
    throw new Error('The invoice needs a currency, e.g. INR.');
  }
  const items = (order.items ?? []).filter(
    (i) => i.name?.trim() && Number.isFinite(i.amount) && i.quantity > 0,
  );
  if (items.length === 0) {
    throw new Error('The invoice needs at least one item with a name, price and quantity.');
  }
  if (items.length > ORDER_DETAILS_LIMITS.maxItems) {
    throw new Error(
      `At most ${ORDER_DETAILS_LIMITS.maxItems} items are allowed (got ${items.length}).`,
    );
  }

  const subtotal = items.reduce((sum, i) => sum + i.amount * i.quantity, 0);
  const tax = order.taxAmount ?? 0;
  const shipping = order.shippingAmount ?? 0;
  const discount = order.discountAmount ?? 0;
  const total = subtotal + tax + shipping - discount;
  if (total <= 0) {
    throw new Error(
      'The invoice total must be more than zero — check the discount is not larger than the order.',
    );
  }

  const orderDetails: MetaOrderDetails = {
    reference_id: order.referenceId.trim(),
    type: order.goodsType ?? 'physical-goods',
    currency: order.currency.trim().toUpperCase(),
    total_amount: toMetaMoney(total),
    order: {
      // Always 'pending' on send: the customer has not paid yet, and any
      // later change is an order-STATUS message, not another invoice.
      status: 'pending',
      items: items.map((i) => ({
        name: i.name.trim(),
        amount: toMetaMoney(i.amount),
        quantity: i.quantity,
        ...(i.retailerId?.trim() ? { retailer_id: i.retailerId.trim() } : {}),
      })),
      subtotal: toMetaMoney(subtotal),
      tax: toMetaMoney(tax),
      ...(shipping > 0 ? { shipping: toMetaMoney(shipping) } : {}),
      ...(discount > 0 ? { discount: toMetaMoney(discount) } : {}),
    },
    ...(order.paymentConfiguration?.trim()
      ? {
          payment_settings: [
            {
              type: 'payment_gateway',
              payment_gateway: {
                configuration_name: order.paymentConfiguration.trim(),
              },
            },
          ],
        }
      : {}),
  };

  out.push({
    type: 'button',
    sub_type: 'order_details',
    index: '0',
    parameters: [{ type: 'action', action: { order_details: orderDetails } }],
  });
  return out;
}

/**
 * Components for sending an order-status update.
 *
 * The body follows the normal rules; what is unusual is the
 * `order_status` component, which is what makes the send an ORDER UPDATE
 * rather than a message that merely talks about one:
 *
 *   { type: 'order_status',
 *     parameters: [{ type: 'order_status',
 *                    order_status: { reference_id,
 *                                    order: { status, description } } }] }
 *
 * Both the reference id and the status are refused rather than defaulted.
 * A guessed status would tell a customer their order had shipped when it
 * had not, and Meta validates the TRANSITION too — an invalid one comes
 * back asynchronously as error webhook 2046, long after the send appeared
 * to succeed, so there is no value in being lenient here.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-in/orderstatustemplate
 */
export function buildOrderStatusSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  const out: MetaSendComponent[] = [];

  const body = buildBodyComponent(template, params);
  if (body) out.push(body);

  const referenceId = params.orderReferenceId?.trim();
  if (!referenceId) {
    throw new Error(
      'An order status update needs the reference id of the order it refers to.',
    );
  }
  const status = params.orderStatus;
  if (!status || !ORDER_STATUS_VALUES.includes(status)) {
    throw new Error(
      `An order status update needs a status — one of ${ORDER_STATUS_VALUES.join(', ')}.`,
    );
  }

  const description = params.orderStatusDescription?.trim();
  out.push({
    type: 'order_status',
    parameters: [
      {
        type: 'order_status',
        order_status: {
          reference_id: referenceId,
          order: { status, ...(description ? { description } : {}) },
        },
      },
    ],
  });

  return out;
}

export function buildSendComponents(
  template: MessageTemplate,
  params: SendTimeParams = {},
): MetaSendComponent[] {
  // AUTHENTICATION templates take a fixed shape that shares nothing with
  // the standard path — see buildAuthSendComponents.
  if (template.category === 'Authentication') {
    return buildAuthSendComponents(params);
  }

  // Order status is the one type that must be routed on `template_type`:
  // its components are a body and an optional footer, indistinguishable
  // from a plain Utility template. Meta records the difference as a
  // sub_category, which is not part of the components it returns.
  if (template.template_type === 'order_status') {
    return buildOrderStatusSendComponents(template, params);
  }

  // The commerce shapes are routed on the BUTTON present in `components`,
  // not on template_type, so a row synced from Meta (which carries none of
  // our types) still sends correctly.
  const buttonTypes = new Set(
    getButtons(definitionFromRow(template).components).map((b) => b.type),
  );
  if (buttonTypes.has('CATALOG')) {
    return buildCatalogSendComponents(template, params);
  }
  if (buttonTypes.has('MPM')) {
    return buildMpmSendComponents(template, params);
  }
  if (buttonTypes.has('ORDER_DETAILS')) {
    return buildOrderDetailsSendComponents(template, params);
  }

  // Carousel and limited-time offer are both driven by the stored
  // components, not the flat columns — neither shape can be expressed
  // there.
  const definition = definitionFromRow(template);
  if (getCarouselCards(definition.components).length > 0) {
    return buildCarouselSendComponents(definition, params);
  }
  if (findComponent(definition.components, 'LIMITED_TIME_OFFER')) {
    return buildLtoSendComponents(template, definition, params);
  }
  // A FLOW button exists only in `components` — the flat `buttons` column
  // drops it — so the standard path below would send a Flow template with
  // no button component at all, and Meta would reject it for a missing
  // parameter without naming the button.
  if (getButtons(definition.components).some((b) => b.type === 'FLOW')) {
    return buildFlowSendComponents(template, definition, params);
  }

  const out: MetaSendComponent[] = [];
  const header = buildHeaderComponent(template, params);
  if (header) out.push(header);
  const body = buildBodyComponent(template, params);
  if (body) out.push(body);
  if (template.buttons?.length) {
    template.buttons.forEach((btn, i) => {
      const override = params.buttonParams?.[i];
      const component = buildButtonComponent(btn, i, override);
      if (component) out.push(component);
    });
  }
  return out;
}

/**
 * Components for sending an authentication template.
 *
 * The one-time code must appear TWICE: once as the body parameter (it is
 * interpolated into Meta's preset wording) and once as the button
 * parameter (it is what the copy/autofill button hands to your app).
 * Sending it only in the body produces a message whose button copies
 * nothing, which looks like a working send right up until the customer
 * taps it.
 *
 * The button `sub_type` is `url`, not `otp` — Meta converts the OTP
 * button to a URL button on creation, so the send payload must speak in
 * terms of what the template became rather than what was submitted.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/auth-otp-template-messages
 */
export function buildAuthSendComponents(
  params: SendTimeParams,
): MetaSendComponent[] {
  const code = params.body?.[0]?.trim();
  if (!code) {
    throw new Error(
      'Authentication templates need the one-time code as the first body parameter.',
    );
  }

  return [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
    {
      // Index is a string here to match the rest of this module; Meta
      // accepts either. The OTP button is always the only button, so 0.
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    },
  ];
}
