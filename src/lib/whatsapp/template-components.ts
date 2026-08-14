/**
 * Translate our local template row shape into the `components` array
 * shape that Meta's POST /{waba_id}/message_templates endpoint expects.
 *
 * Keep this function pure and JSON-shaped — the submit route and the
 * (future) edit route both call it, and unit tests assert the exact
 * payload by snapshot.
 *
 * Spec reference:
 *   https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components
 */

import type { TemplatePayload } from './template-validators';
import { extractNamedParams } from './template-variables';
import type { TemplateButton } from '@/types';

export interface MetaCarouselCard {
  components: MetaComponent[];
}

/**
 * Components for a limited-time offer template.
 *
 * Order matters and follows Meta's own example: HEADER (optional) →
 * LIMITED_TIME_OFFER → BODY → BUTTONS. The offer strip sits ABOVE the
 * body in the delivered message, which is why it comes first.
 *
 * Two deviations from every other template, both taken straight from
 * Meta's limited-time-offer reference and both easy to get wrong:
 *
 *   - No FOOTER component is permitted at all.
 *   - The copy-code button carries `example` as a STRING here, not the
 *     one-element array used elsewhere, and carries no `text` — Meta
 *     supplies the button label itself.
 *
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/limited-time-offer-templates
 */
function buildLtoComponents(payload: TemplatePayload): MetaComponent[] {
  const offer = payload.offer;
  if (!offer) {
    throw new Error('Limited-time offer templates require offer details.');
  }

  const components: MetaComponent[] = [];

  const header = buildHeaderComponent(payload);
  if (header) components.push(header);

  components.push({
    type: 'LIMITED_TIME_OFFER',
    limited_time_offer: {
      text: offer.text,
      has_expiration: offer.has_expiration,
    },
  });

  components.push(buildBodyComponent(payload));

  const buttons = payload.buttons ?? [];
  if (buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) =>
        b.type === 'COPY_CODE'
          ? // String, not array, and no label. See the note above.
            { type: 'COPY_CODE' as const, example: b.example }
          : buildButtonPayload(b),
      ),
    });
  }

  return components;
}

export interface MetaComponent {
  type:
    | 'HEADER'
    | 'BODY'
    | 'FOOTER'
    | 'BUTTONS'
    | 'CAROUSEL'
    | 'LIMITED_TIME_OFFER';
  /** CAROUSEL only. */
  cards?: MetaCarouselCard[];
  /** LIMITED_TIME_OFFER only. */
  limited_time_offer?: { text: string; has_expiration: boolean };
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  buttons?: MetaButtonPayload[];
  /** AUTHENTICATION BODY only. */
  add_security_recommendation?: boolean;
  /** AUTHENTICATION FOOTER only. */
  code_expiration_minutes?: number;
  example?: {
    header_text?: string[];
    header_url?: string[];
    header_handle?: string[];
    body_text?: string[][];
    /** NAMED format only — matched by name, so order does not matter. */
    body_text_named_params?: { param_name: string; example: string }[];
  };
}

interface MetaButtonPayload {
  type:
    | 'QUICK_REPLY'
    | 'URL'
    | 'PHONE_NUMBER'
    | 'COPY_CODE'
    | 'OTP'
    | 'FLOW'
    | 'VOICE_CALL'
    | 'CATALOG'
    | 'MPM'
    | 'ORDER_DETAILS';
  /** Optional for OTP and for a limited-time offer's copy-code button. */
  text?: string;
  url?: string;
  phone_number?: string;
  /**
   * An array everywhere EXCEPT a limited-time offer's copy-code button,
   * where Meta's reference specifies a bare string.
   */
  example?: string[] | string;
  /** OTP only. */
  otp_type?: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
  /** FLOW only — the Meta Flow the button opens. */
  flow_id?: string;
  flow_action?: 'navigate' | 'data_exchange';
  /** FLOW + flow_action 'navigate' only. Names a screen in the Flow JSON. */
  navigate_screen?: string;
}

function buildHeaderComponent(payload: TemplatePayload): MetaComponent | null {
  const { header_type, header_content, header_media_url, header_handle } = payload;
  if (!header_type) return null;

  if (header_type === 'text') {
    const headerSample = payload.sample_values?.header;
    const component: MetaComponent = {
      type: 'HEADER',
      format: 'TEXT',
      text: header_content,
    };
    if (headerSample && headerSample.length > 0) {
      component.example = { header_text: headerSample };
    }
    return component;
  }

  // A location header carries NO example at creation — the pin is supplied
  // per message, because a template advertising one fixed address would be
  // a text header instead.
  if (header_type === 'location') {
    return { type: 'HEADER', format: 'LOCATION' };
  }

  const format =
    header_type === 'image'
      ? 'IMAGE'
      : header_type === 'video'
        ? 'VIDEO'
        : 'DOCUMENT';
  const component: MetaComponent = { type: 'HEADER', format };
  if (header_handle) {
    component.example = { header_handle: [header_handle] };
  } else if (header_media_url) {
    component.example = { header_url: [header_media_url] };
  }
  return component;
}

function buildBodyComponent(payload: TemplatePayload): MetaComponent {
  const component: MetaComponent = {
    type: 'BODY',
    text: payload.body_text,
  };

  // NAMED parameters take a different example shape entirely: a list of
  // { param_name, example } pairs instead of a positional row. Sending the
  // positional form for a named template is rejected with "The parameter
  // name is required", which does not say which shape it wanted.
  if (payload.parameter_format === 'NAMED') {
    const names = extractNamedParams(payload.body_text);
    const pairs = names
      .map((param_name) => ({
        param_name,
        example: payload.named_samples?.[param_name] ?? '',
      }))
      .filter((p) => p.example !== '');
    if (pairs.length > 0) {
      component.example = { body_text_named_params: pairs };
    }
    return component;
  }

  const bodySample = payload.sample_values?.body;
  if (bodySample && bodySample.length > 0) {
    // Meta expects body_text as a 2D array — outer is "examples",
    // inner is the values for each variable. We submit a single
    // example row.
    component.example = { body_text: [bodySample] };
  }
  return component;
}

function buildFooterComponent(payload: TemplatePayload): MetaComponent | null {
  if (!payload.footer_text?.trim()) return null;
  return { type: 'FOOTER', text: payload.footer_text };
}

function buildButtonPayload(b: TemplateButton): MetaButtonPayload {
  switch (b.type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: b.text };
    case 'URL': {
      const payload: MetaButtonPayload = {
        type: 'URL',
        text: b.text,
        url: b.url,
      };
      if (b.example) payload.example = [b.example];
      return payload;
    }
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: b.text, example: [b.example] };
    case 'VOICE_CALL':
      // Label only — Meta calls the business number on the WABA.
      return { type: 'VOICE_CALL', text: b.text };
  }
}

function buildButtonsComponent(payload: TemplatePayload): MetaComponent | null {
  if (!payload.buttons || payload.buttons.length === 0) return null;
  return {
    type: 'BUTTONS',
    buttons: payload.buttons.map(buildButtonPayload),
  };
}

export interface MetaTemplateSubmitPayload {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: MetaComponent[];
  /** Delivery time-to-live. Omitted unless explicitly set. */
  message_send_ttl_seconds?: number;
  /**
   * ORDER_STATUS turns an ordinary Utility template into one whose sends
   * update an order. The components carry no trace of it, so omitting this
   * field produces a normal template that looks right and cannot do the
   * job.
   */
  sub_category?: 'ORDER_STATUS' | 'CALL_PERMISSION_REQUEST';
  /**
   * Omitted for positional templates, which is Meta's default.
   *
   * Sent uppercase to match the `category` field, which this app already
   * sends uppercase against Meta's own lowercase documentation examples —
   * so the enum is known to be case-insensitive in practice.
   */
  parameter_format?: 'NAMED';
}

/**
 * AUTHENTICATION templates take a completely different components shape.
 *
 * There is no body text, no header, and no free-form buttons: Meta owns
 * the wording and composes the message from these flags. Sending a BODY
 * with `text` here is rejected, which is why this is a separate builder
 * rather than a few conditionals inside the standard one.
 *
 * Note the button type is `OTP` on the way in but Meta reports it back as
 * `URL` on read — so sync must trust the stored components rather than
 * re-deriving the type from what the API returns.
 *
 * https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
 */
function buildAuthComponents(payload: TemplatePayload): MetaComponent[] {
  const auth = payload.auth;
  if (!auth) {
    // Unreachable via the API (validateAuthTemplate runs first), but a
    // silent empty payload would be a worse failure than a loud one.
    throw new Error('Authentication templates require auth options.');
  }

  const components: MetaComponent[] = [
    {
      type: 'BODY',
      // Explicit false is meaningful to Meta (exclude the disclaimer),
      // so this is not collapsed to `|| undefined`.
      add_security_recommendation: auth.add_security_recommendation === true,
    },
  ];

  // The footer exists ONLY to carry the expiry warning. Omit it entirely
  // when there is no expiry, rather than sending an empty footer.
  if (auth.code_expiration_minutes != null) {
    components.push({
      type: 'FOOTER',
      code_expiration_minutes: auth.code_expiration_minutes,
    });
  }

  const button: MetaButtonPayload = {
    type: 'OTP',
    otp_type: auth.otp_type,
  };
  if (auth.button_text?.trim()) button.text = auth.button_text.trim();
  if (auth.otp_type === 'ONE_TAP' || auth.otp_type === 'ZERO_TAP') {
    if (auth.autofill_text?.trim()) button.autofill_text = auth.autofill_text.trim();
    button.package_name = auth.package_name;
    button.signature_hash = auth.signature_hash;
  }
  components.push({ type: 'BUTTONS', buttons: [button] });

  return components;
}

const CATEGORY_TO_META: Record<
  'Marketing' | 'Utility' | 'Authentication',
  MetaTemplateSubmitPayload['category']
> = {
  Marketing: 'MARKETING',
  Utility: 'UTILITY',
  Authentication: 'AUTHENTICATION',
};

/**
 * Assemble the full submit payload (name + category + language +
 * components in canonical order: HEADER → BODY → FOOTER → BUTTONS).
 */
export function buildMetaTemplatePayload(
  payload: TemplatePayload,
): MetaTemplateSubmitPayload {
  const components: MetaComponent[] =
    payload.category === 'Authentication'
      ? buildAuthComponents(payload)
      : payload.sub_category === 'ORDER_STATUS'
        ? buildOrderStatusComponents(payload)
        : payload.sub_category === 'CALL_PERMISSION_REQUEST'
          ? buildCallPermissionComponents(payload)
          : payload.catalog
            ? buildCommerceComponents(payload, 'CATALOG', payload.catalog.text)
            : payload.mpm
              ? buildCommerceComponents(payload, 'MPM', payload.mpm.text)
              : payload.order_details
                ? buildCommerceComponents(
                    payload,
                    'ORDER_DETAILS',
                    payload.order_details.text,
                  )
                : payload.offer
          ? buildLtoComponents(payload)
          : payload.cards && payload.cards.length > 0
            ? buildCarouselComponents(payload)
            : payload.flow
              ? buildFlowComponents(payload)
              : buildStandardComponents(payload);

  const out: MetaTemplateSubmitPayload = {
    name: payload.name,
    category: CATEGORY_TO_META[payload.category],
    language: payload.language,
    components,
  };
  if (payload.sub_category) {
    out.sub_category = payload.sub_category;
  }
  // Only sent when NAMED. Positional is Meta's default, so omitting it
  // keeps every existing template's payload byte-identical to before.
  if (payload.parameter_format === 'NAMED') {
    out.parameter_format = 'NAMED';
  }
  // Only send the TTL when set. Meta's default differs by category (10
  // minutes for authentication, 24 hours otherwise), so sending a value
  // we invented would silently change delivery behaviour.
  if (payload.message_send_ttl_seconds != null) {
    out.message_send_ttl_seconds = payload.message_send_ttl_seconds;
  }
  return out;
}

/**
 * Components for a media-card carousel.
 *
 * Shape: a top-level BODY, then a CAROUSEL whose cards each carry their
 * own HEADER (+ optional BODY, + optional BUTTONS). There is deliberately
 * no top-level HEADER or FOOTER — Meta rejects both on a carousel.
 *
 * Card headers carry `example.header_handle` only. A plain URL is not
 * accepted at creation, which is why ensureCarouselCardHandles must run
 * before this.
 *
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/media-card-carousel-templates
 */
function buildCarouselComponents(payload: TemplatePayload): MetaComponent[] {
  const cards = payload.cards ?? [];

  const components: MetaComponent[] = [buildBodyComponent(payload)];

  components.push({
    type: 'CAROUSEL',
    cards: cards.map((card) => {
      const cardComponents: MetaComponent[] = [
        {
          type: 'HEADER',
          format: card.header_format === 'video' ? 'VIDEO' : 'IMAGE',
          example: card.header_handle
            ? { header_handle: [card.header_handle] }
            : // Only reachable in dry-run, where nothing is uploaded.
              { header_url: [card.header_media_url ?? ''] },
        },
      ];

      if (card.body_text?.trim()) {
        const cardBody: MetaComponent = { type: 'BODY', text: card.body_text };
        const samples = (card.body_samples ?? []).filter((s) => s?.trim());
        if (samples.length > 0) {
          cardBody.example = { body_text: [samples] };
        }
        cardComponents.push(cardBody);
      }

      if (card.buttons && card.buttons.length > 0) {
        cardComponents.push({
          type: 'BUTTONS',
          buttons: card.buttons.map(buildButtonPayload),
        });
      }

      return { components: cardComponents };
    }),
  });

  return components;
}

/**
 * Components for a Flow template.
 *
 * Identical to a standard template except that the BUTTONS component
 * carries exactly one FLOW button, assembled from `payload.flow` rather
 * than from `payload.buttons`. `validateFlowTemplate` rejects a payload
 * that has both, so there is no merge to get wrong here.
 *
 * `navigate_screen` is included only for flow_action 'navigate' — Meta
 * requires it there and rejects it for 'data_exchange'.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/flows-templates
 */
function buildFlowComponents(payload: TemplatePayload): MetaComponent[] {
  const flow = payload.flow;
  if (!flow) {
    throw new Error('Flow templates require flow details.');
  }

  const components: MetaComponent[] = [];
  const header = buildHeaderComponent(payload);
  if (header) components.push(header);
  components.push(buildBodyComponent(payload));
  const footer = buildFooterComponent(payload);
  if (footer) components.push(footer);

  const button: MetaButtonPayload = {
    type: 'FLOW',
    text: flow.text,
    flow_id: flow.flow_id,
    flow_action: flow.flow_action,
  };
  if (flow.flow_action === 'navigate' && flow.navigate_screen?.trim()) {
    button.navigate_screen = flow.navigate_screen.trim();
  }
  components.push({ type: 'BUTTONS', buttons: [button] });

  return components;
}

/**
 * Components for an order-status template: a BODY and an optional FOOTER.
 *
 * Deliberately not routed through buildStandardComponents even though the
 * output would usually match — that builder emits a header and buttons
 * when the payload carries them, and Meta rejects both here. Sharing it
 * would mean a payload with a stray header silently producing an invalid
 * template instead of being refused by validateOrderStatus.
 */
function buildOrderStatusComponents(payload: TemplatePayload): MetaComponent[] {
  const components: MetaComponent[] = [buildBodyComponent(payload)];
  const footer = buildFooterComponent(payload);
  if (footer) components.push(footer);
  return components;
}

/**
 * Components for the three shapes whose only button is fixed by their type:
 * catalogue (CATALOG), multi-product (MPM) and order details
 * (ORDER_DETAILS).
 *
 * One builder because the difference between them is a single button type
 * and which components Meta permits — all enforced by the validators
 * already. Three near-identical builders would be three places to fix the
 * next time the header rules change.
 */
function buildCommerceComponents(
  payload: TemplatePayload,
  buttonType: 'CATALOG' | 'MPM' | 'ORDER_DETAILS',
  buttonText: string,
): MetaComponent[] {
  const components: MetaComponent[] = [];
  // Catalogue takes no header (WhatsApp uses a product image); MPM requires
  // a text one; order details allows any. The validators decide — this just
  // emits whatever survived them.
  const header = buildHeaderComponent(payload);
  if (header) components.push(header);
  components.push(buildBodyComponent(payload));
  const footer = buildFooterComponent(payload);
  if (footer) components.push(footer);
  components.push({
    type: 'BUTTONS',
    buttons: [{ type: buttonType, text: buttonText }],
  });
  return components;
}

/**
 * Components for a calling-permission request.
 *
 * Deliberately has NO buttons component: Meta supplies the three consent
 * options itself ("Allow", "Temporarily allow", "Not at this time"), and
 * sending a buttons array is rejected.
 */
function buildCallPermissionComponents(
  payload: TemplatePayload,
): MetaComponent[] {
  const components: MetaComponent[] = [];
  const header = buildHeaderComponent(payload);
  if (header) components.push(header);
  components.push(buildBodyComponent(payload));
  const footer = buildFooterComponent(payload);
  if (footer) components.push(footer);
  return components;
}

function buildStandardComponents(payload: TemplatePayload): MetaComponent[] {
  const components: MetaComponent[] = [];
  const header = buildHeaderComponent(payload);
  if (header) components.push(header);
  components.push(buildBodyComponent(payload));
  const footer = buildFooterComponent(payload);
  if (footer) components.push(footer);
  const buttons = buildButtonsComponent(payload);
  if (buttons) components.push(buttons);
  return components;
}
