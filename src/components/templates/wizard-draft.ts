/**
 * The wizard's working state, and how it becomes a TemplateDefinition.
 *
 * Kept in its own module rather than living on the wizard component
 * because all three steps need the type and two of them need the
 * conversion. Importing a function back out of `template-wizard.tsx`
 * (which imports the steps) would be a real circular dependency.
 *
 * The draft is intentionally FLAT — it mirrors the fields the Default
 * template type has, which is what the submit API still accepts. The
 * conversion below is the single place that turns it into Meta's nested
 * `components` shape, so the preview and the submitted payload are
 * derived from the same source and cannot disagree.
 */

import {
  componentsFromFlatColumns,
  definitionFromRow,
  findComponent,
  getBody,
  getButtons,
  getCarouselCards,
  getFooter,
  getHeader,
  type CarouselCard,
  type MetaTemplateButton,
  type ParameterFormat,
  type TemplateComponent,
  type TemplateDefinition,
  type TemplateRowLike,
  type TemplateType,
} from '@/lib/whatsapp/template-definition';
import { positionalValues } from '@/lib/whatsapp/template-preview-text';
import {
  extractNamedParams,
  extractVariableIndices,
} from '@/lib/whatsapp/template-variables';
import type { TemplateCategory } from '@/lib/whatsapp/template-types-catalogue';
import type { TemplateButton } from '@/types';

/**
 * The AUTHENTICATION-only fields.
 *
 * Meta owns the message wording for this category, so there is nothing
 * here about body, header or footer text — only the flags it composes
 * that wording from, plus the one-time-password button's behaviour.
 */
export interface AuthDraft {
  otpType: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
  buttonText: string;
  addSecurityRecommendation: boolean;
  /** Empty string means "no expiry warning". */
  codeExpirationMinutes: string;
  autofillText: string;
  packageName: string;
  signatureHash: string;
  /** Delivery time-to-live in seconds. Empty means Meta's default. */
  ttlSeconds: string;
}

/**
 * One carousel card in the editor.
 *
 * Meta requires every card to share the same header format and the same
 * button types in the same order, so the editor edits those two things
 * ONCE at the carousel level and applies them to every card — rather than
 * letting them diverge per card and failing validation later.
 */
export interface CardDraft {
  headerMediaUrl: string;
  bodyText: string;
  bodySamples: string[];
  /** Per-card values for the shared button shape. */
  buttonValues: { text: string; url: string; example: string; phone: string }[];
}

export function emptyCard(buttonCount: number): CardDraft {
  return {
    headerMediaUrl: '',
    bodyText: '',
    bodySamples: [],
    buttonValues: Array.from({ length: buttonCount }, () => ({
      text: '',
      url: '',
      example: '',
      phone: '',
    })),
  };
}

export interface CarouselDraft {
  /** Shared by every card — Meta rejects a mix. */
  headerFormat: 'image' | 'video';
  /** The shared button shape. Types and order are identical per card. */
  buttonTypes: ('QUICK_REPLY' | 'URL' | 'PHONE_NUMBER')[];
  cards: CardDraft[];
}

/**
 * The FLOW button that makes a template a "Flows" template.
 *
 * The Flow is one of META'S WhatsApp Flows, picked from the account's
 * WABA — not one of this app's own /flows automations, which cannot be
 * referenced by a template button at all.
 */
/** The three shapes whose single button is fixed by the template type. */
export type CommerceKind = 'catalogue' | 'multi_product' | 'order_details';

export interface FlowDraft {
  /** Meta's Flow ID. Empty until the operator picks one. */
  flowId: string;
  /** Kept only so the editor can show which Flow is attached. */
  flowName: string;
  /** The button label. Meta supplies no default. */
  buttonText: string;
  action: 'navigate' | 'data_exchange';
  /** The first Flow JSON screen. Used by 'navigate' only. */
  navigateScreen: string;
}

export interface WizardDraft {
  name: string;
  language: string;
  /**
   * 'location' takes no sample at creation — the pin is per message — so
   * it is neither the 'text' branch nor the media branch anywhere that
   * switches on this.
   */
  headerFormat: 'none' | 'text' | 'image' | 'video' | 'document' | 'location';
  headerContent: string;
  headerMediaUrl: string;
  headerSample: string;
  bodyText: string;
  bodySamples: string[];
  footerText: string;
  /**
   * Message validity period in seconds, as typed. Empty means Meta's
   * default. Authentication has its own field on `auth`, whose window is
   * narrower — they are separate because the limits differ.
   */
  ttlSeconds: string;
  /** `{{1}}` or `{{order_id}}`. Meta forbids mixing them in one template. */
  parameterFormat: ParameterFormat;
  /** NAMED only: example value per parameter name. */
  namedSamples: Record<string, string>;
  /**
   * The label on the single fixed button of a catalogue, multi-product or
   * order-details template. One field rather than three because a template
   * is only ever one of those shapes.
   */
  commerceButtonText: string;
  buttons: TemplateButton[];
  auth: AuthDraft;
  carousel: CarouselDraft;
  offer: OfferDraft;
  flow: FlowDraft;
}

/** The limited-time offer strip. The expiry itself is per-message. */
export interface OfferDraft {
  text: string;
  hasExpiration: boolean;
  code: string;
  urlButtonText: string;
  url: string;
  urlExample: string;
}

/** Assemble a card's buttons from the shared shape plus its own values. */
export function cardButtons(
  carousel: CarouselDraft,
  cardIndex: number,
): TemplateButton[] {
  const card = carousel.cards[cardIndex];
  if (!card) return [];
  return carousel.buttonTypes.map((type, i) => {
    const v = card.buttonValues[i] ?? {
      text: '',
      url: '',
      example: '',
      phone: '',
    };
    switch (type) {
      case 'QUICK_REPLY':
        return { type: 'QUICK_REPLY', text: v.text };
      case 'URL':
        return {
          type: 'URL',
          text: v.text,
          url: v.url,
          ...(v.example ? { example: v.example } : {}),
        };
      case 'PHONE_NUMBER':
        return { type: 'PHONE_NUMBER', text: v.text, phone_number: v.phone };
    }
  });
}

export const EMPTY_DRAFT: WizardDraft = {
  name: '',
  language: 'en_US',
  headerFormat: 'none',
  headerContent: '',
  headerMediaUrl: '',
  headerSample: '',
  bodyText: '',
  bodySamples: [],
  footerText: '',
  ttlSeconds: '',
  parameterFormat: 'POSITIONAL',
  namedSamples: {},
  commerceButtonText: '',
  buttons: [],
  auth: {
    otpType: 'COPY_CODE',
    buttonText: '',
    // Defaulted ON: it is Meta's own recommendation and costs nothing.
    addSecurityRecommendation: true,
    // Defaulted to 10, matching the button's own expiry when no warning
    // is shown — so the message text agrees with what actually happens.
    codeExpirationMinutes: '10',
    autofillText: '',
    packageName: '',
    signatureHash: '',
    ttlSeconds: '',
  },
  carousel: {
    headerFormat: 'image',
    buttonTypes: [],
    // Two is Meta's minimum, so the editor opens at a valid state rather
    // than one the operator has to fix before they can continue.
    cards: [emptyCard(0), emptyCard(0)],
  },
  offer: {
    text: 'Expiring offer!',
    // Defaulted on: without the countdown the template is just a coupon,
    // and the countdown is the reason to pick this type.
    hasExpiration: true,
    code: '',
    urlButtonText: '',
    url: '',
    urlExample: '',
  },
  flow: {
    flowId: '',
    flowName: '',
    buttonText: '',
    // 'navigate' is the simpler half and the only one that works without
    // a Flow endpoint deployed, so it is the safer default.
    action: 'navigate',
    navigateScreen: '',
  },
};

/**
 * Project the draft onto the canonical definition.
 *
 * Reuses `componentsFromFlatColumns` rather than assembling components
 * here: that function already encodes the canonical HEADER → BODY →
 * FOOTER → BUTTONS order and the handle-over-url rule, and it is covered
 * by tests. A second assembler would be a second thing to keep correct.
 */
export function definitionFromDraft(
  draft: WizardDraft,
  category: TemplateCategory,
  templateType: TemplateType,
): TemplateDefinition {
  // Authentication cannot go through the flat conversion: its BODY
  // carries no text at all, only the flag Meta composes the wording
  // from. Building it here keeps the preview showing exactly the
  // component shape that will be submitted.
  if (category === 'Authentication') {
    const expiry = Number.parseInt(draft.auth.codeExpirationMinutes, 10);
    const ttl = Number.parseInt(draft.auth.ttlSeconds, 10);
    const components: TemplateComponent[] = [
      {
        type: 'BODY',
        add_security_recommendation: draft.auth.addSecurityRecommendation,
      },
    ];
    if (Number.isFinite(expiry) && expiry > 0) {
      components.push({ type: 'FOOTER', code_expiration_minutes: expiry });
    }
    components.push({
      type: 'BUTTONS',
      buttons: [
        {
          type: 'OTP',
          otp_type: draft.auth.otpType,
          ...(draft.auth.buttonText.trim()
            ? { text: draft.auth.buttonText.trim() }
            : {}),
          ...(draft.auth.otpType !== 'COPY_CODE'
            ? {
                autofill_text: draft.auth.autofillText.trim() || undefined,
                package_name: draft.auth.packageName.trim() || undefined,
                signature_hash: draft.auth.signatureHash.trim() || undefined,
              }
            : {}),
        },
      ],
    });

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'authentication',
      parameter_format: 'POSITIONAL',
      components,
      message_send_ttl_seconds: Number.isFinite(ttl) ? ttl : null,
    };
  }

  // Limited-time offer: HEADER? → LIMITED_TIME_OFFER → BODY → BUTTONS,
  // in Meta's order, because the offer strip renders above the body.
  if (templateType === 'limited_time_offer') {
    const { offer } = draft;
    const bodySamples = draft.bodySamples.filter((v) => v.trim());
    const components: TemplateComponent[] = [];

    if (draft.headerFormat === 'image' || draft.headerFormat === 'video') {
      components.push({
        type: 'HEADER',
        format: draft.headerFormat === 'video' ? 'VIDEO' : 'IMAGE',
        ...(draft.headerMediaUrl
          ? { example: { header_url: [draft.headerMediaUrl] } }
          : {}),
      });
    }

    components.push({
      type: 'LIMITED_TIME_OFFER',
      limited_time_offer: {
        text: offer.text,
        has_expiration: offer.hasExpiration,
      },
    });

    components.push({
      type: 'BODY',
      text: draft.bodyText,
      ...(bodySamples.length > 0
        ? { example: { body_text: [bodySamples] } }
        : {}),
    });

    const buttons: MetaTemplateButton[] = [
      { type: 'COPY_CODE', text: 'Copy code', example: [offer.code] },
    ];
    if (offer.url.trim()) {
      buttons.push({
        type: 'URL',
        text: offer.urlButtonText || 'Shop now',
        url: offer.url,
        ...(offer.urlExample ? { example: [offer.urlExample] } : {}),
      });
    }
    components.push({ type: 'BUTTONS', buttons });

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'limited_time_offer',
      parameter_format: 'POSITIONAL',
      components,
    };
  }

  // Carousel: a top-level BODY plus a CAROUSEL of cards. Built directly
  // because the flat conversion has no way to express nested cards.
  if (templateType === 'carousel') {
    const { carousel } = draft;
    const bodySamples = draft.bodySamples.filter((v) => v.trim());
    const components: TemplateComponent[] = [
      {
        type: 'BODY',
        text: draft.bodyText,
        ...(bodySamples.length > 0
          ? { example: { body_text: [bodySamples] } }
          : {}),
      },
      {
        type: 'CAROUSEL',
        cards: carousel.cards.map((cardDraft, i) => {
          // Narrower than TemplateComponent: a card may only hold a
          // header, a body and buttons — never a footer or a nested
          // carousel.
          const parts: CarouselCard['components'] = [
            {
              type: 'HEADER',
              format: carousel.headerFormat === 'video' ? 'VIDEO' : 'IMAGE',
              // The URL, not a handle: handles are derived server-side at
              // submit and have no renderable form, and this definition
              // feeds the preview.
              ...(cardDraft.headerMediaUrl
                ? { example: { header_url: [cardDraft.headerMediaUrl] } }
                : {}),
            },
          ];
          if (cardDraft.bodyText.trim()) {
            const samples = cardDraft.bodySamples.filter((v) => v.trim());
            parts.push({
              type: 'BODY',
              text: cardDraft.bodyText,
              ...(samples.length > 0
                ? { example: { body_text: [samples] } }
                : {}),
            });
          }
          const buttons = cardButtons(carousel, i);
          if (buttons.length > 0) {
            parts.push({
              type: 'BUTTONS',
              buttons: buttons as MetaTemplateButton[],
            });
          }
          return { components: parts };
        }),
      },
    ];

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'carousel',
      parameter_format: 'POSITIONAL',
      components,
    };
  }

  const sampleValues: { body?: string[]; header?: string[] } = {};
  if (draft.bodySamples.some((v) => v.trim())) {
    sampleValues.body = draft.bodySamples;
  }
  if (draft.headerFormat === 'text' && draft.headerSample.trim()) {
    sampleValues.header = [draft.headerSample];
  }

  // Catalogue / multi-product / order details: a standard body with one
  // fixed button, built here because those button types cannot travel
  // through the flat `buttons` column (toLegacyButton drops them), and a
  // template rendered without its button would look wrong in the preview
  // and be rejected on submit.
  if (
    templateType === 'catalogue' ||
    templateType === 'multi_product' ||
    templateType === 'order_details'
  ) {
    const buttonType =
      templateType === 'catalogue'
        ? 'CATALOG'
        : templateType === 'multi_product'
          ? 'MPM'
          : 'ORDER_DETAILS';

    const components: TemplateComponent[] = componentsFromFlatColumns({
      name: draft.name,
      category,
      // A catalogue's header is a product image chosen by WhatsApp, so it
      // never carries one of ours.
      header_type:
        templateType === 'catalogue' || draft.headerFormat === 'none'
          ? null
          : draft.headerFormat,
      header_content: draft.headerContent,
      header_media_url: draft.headerMediaUrl || null,
      body_text: draft.bodyText,
      footer_text: draft.footerText || null,
      buttons: null,
      sample_values: sampleValues,
    });

    components.push({
      type: 'BUTTONS',
      buttons: [
        { type: buttonType, text: draft.commerceButtonText } as MetaTemplateButton,
      ],
    });

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: templateType,
      parameter_format: 'POSITIONAL',
      components,
    };
  }

  // Calling permission request: header/body/footer and NO buttons — Meta
  // supplies the three consent options itself.
  if (templateType === 'calling_permission_request') {
    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'calling_permission_request',
      parameter_format: 'POSITIONAL',
      components: componentsFromFlatColumns({
        name: draft.name,
        category,
        header_type: draft.headerFormat === 'text' ? 'text' : null,
        header_content: draft.headerContent,
        body_text: draft.bodyText,
        footer_text: draft.footerText || null,
        buttons: null,
        sample_values: sampleValues,
      }),
    };
  }

  // Order status: BODY plus an optional FOOTER, and nothing else. Meta
  // rejects a header or buttons here, so they are not passed through even
  // if the draft happens to carry them from an earlier type selection.
  if (templateType === 'order_status') {
    const components: TemplateComponent[] = componentsFromFlatColumns({
      name: draft.name,
      category,
      header_type: null,
      body_text: draft.bodyText,
      footer_text: draft.footerText || null,
      buttons: null,
      sample_values: sampleValues,
    });

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'order_status',
      parameter_format: 'POSITIONAL',
      components,
    };
  }

  // Flows: a standard template whose only button is a FLOW button.
  //
  // Built here rather than through componentsFromFlatColumns because a
  // FLOW button cannot travel through the flat `buttons` column — see
  // toLegacyButton in template-definition.ts, which drops it on purpose.
  // Routing it through the flat conversion would silently produce a
  // template with no button at all, and the preview would agree with the
  // mistake.
  if (templateType === 'flows') {
    const components: TemplateComponent[] = componentsFromFlatColumns({
      name: draft.name,
      category,
      header_type: draft.headerFormat === 'none' ? null : draft.headerFormat,
      header_content: draft.headerContent,
      header_media_url: draft.headerMediaUrl || null,
      body_text: draft.bodyText,
      footer_text: draft.footerText || null,
      // Deliberately none — the FLOW button is appended below.
      buttons: null,
      sample_values: sampleValues,
    });

    components.push({
      type: 'BUTTONS',
      buttons: [
        {
          type: 'FLOW',
          text: draft.flow.buttonText,
          ...(draft.flow.flowId ? { flow_id: draft.flow.flowId } : {}),
          ...(draft.flow.flowName ? { flow_name: draft.flow.flowName } : {}),
          flow_action: draft.flow.action,
          ...(draft.flow.action === 'navigate' &&
          draft.flow.navigateScreen.trim()
            ? { navigate_screen: draft.flow.navigateScreen.trim() }
            : {}),
        },
      ],
    });

    return {
      name: draft.name,
      category,
      language: draft.language,
      template_type: 'flows',
      parameter_format: 'POSITIONAL',
      components,
    };
  }

  const ttl = Number.parseInt(draft.ttlSeconds, 10);

  const definition: TemplateDefinition = {
    name: draft.name,
    category,
    language: draft.language,
    template_type: templateType,
    parameter_format: draft.parameterFormat,
    message_send_ttl_seconds: Number.isFinite(ttl) ? ttl : null,
    components: componentsFromFlatColumns({
      name: draft.name,
      category,
      header_type: draft.headerFormat === 'none' ? null : draft.headerFormat,
      header_content: draft.headerContent,
      // The preview shows the sample media, so the URL is what matters
      // here — the Resumable Upload handle is derived server-side at
      // submit time and has no renderable form.
      header_media_url: draft.headerMediaUrl || null,
      body_text: draft.bodyText,
      footer_text: draft.footerText || null,
      buttons: draft.buttons.length > 0 ? draft.buttons : null,
      sample_values: sampleValues,
    }),
  };

  // NAMED examples cannot travel through the flat `sample_values` column —
  // that holds a positional array with nowhere to put a parameter name — so
  // the BODY's example is replaced here. Without this the preview would
  // show unfilled placeholder chips for a template whose samples are set.
  if (draft.parameterFormat === 'NAMED') {
    const names = extractNamedParams(draft.bodyText);
    const pairs = names
      .map((param_name) => ({
        param_name,
        example: draft.namedSamples[param_name] ?? '',
      }))
      .filter((p) => p.example.trim() !== '');
    const body = getBody(definition.components);
    if (body) {
      body.example =
        pairs.length > 0 ? { body_text_named_params: pairs } : undefined;
    }
  }

  return definition;
}

/**
 * Turn a starter-library row into a wizard draft.
 *
 * The library row deliberately uses the SAME field names as the submit
 * payload, so this is a copy with two adjustments rather than a
 * translation: header format needs the 'none' sentinel the form uses, and
 * body samples are padded to the variable count so every sample input
 * renders even if the library row shipped fewer.
 *
 * Everything stays editable afterwards — a starter template is a starting
 * point, not a locked one, which is the whole difference between this and
 * Meta's library.
 */
/** A pre-filled starting point handed to the wizard in CREATE mode. */
export interface StarterWizardSeed {
  draft: WizardDraft;
  category: TemplateCategory;
  templateType: TemplateType;
}

export function starterTemplateToDraft(row: {
  title?: string;
  language?: string;
  header_type?: string | null;
  header_content?: string | null;
  body_text: string;
  footer_text?: string | null;
  buttons?: unknown;
  sample_values?: unknown;
}): WizardDraft {
  const samples = (row.sample_values ?? {}) as {
    body?: string[];
    header?: string[];
  };
  const varCount = extractVariableIndices(row.body_text).length;
  const bodySamples = Array.from(
    { length: varCount },
    (_, i) => samples.body?.[i] ?? '',
  );

  return {
    ...EMPTY_DRAFT,
    // The library title is prose ("Order Confirmation"); a template name
    // must be lowercase with underscores, so it is converted rather than
    // left for Meta to reject.
    name: (row.title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 512),
    language: row.language || 'en_US',
    headerFormat: (row.header_type ?? 'none') as WizardDraft['headerFormat'],
    headerContent: row.header_content ?? '',
    headerSample: samples.header?.[0] ?? '',
    bodyText: row.body_text,
    bodySamples,
    footerText: row.footer_text ?? '',
    buttons: Array.isArray(row.buttons) ? (row.buttons as TemplateButton[]) : [],
  };
}

/**
 * Rebuild a draft from a stored template row — the inverse of
 * `definitionFromDraft`, used to open the wizard on an existing template.
 *
 * Reads `components` (the source of truth) via `definitionFromRow`, so a
 * row written before migration 061 still opens correctly by falling back
 * to its flat columns.
 *
 * Returns the category and type alongside the draft because both are
 * derived from the row, not chosen by the operator when editing: Meta
 * fixes a template's name and language at creation, and its shape is
 * whatever was approved.
 */
export function draftFromRow(row: TemplateRowLike): {
  draft: WizardDraft;
  category: TemplateCategory;
  templateType: TemplateType;
} {
  const definition = definitionFromRow(row);
  const { components } = definition;
  const draft: WizardDraft = {
    ...EMPTY_DRAFT,
    name: definition.name,
    language: definition.language,
  };

  const header = getHeader(components);
  const body = getBody(components);
  const footer = getFooter(components);
  const buttons = getButtons(components);
  const cards = getCarouselCards(components);

  // ---- Authentication ----
  if (definition.category === 'Authentication') {
    const otp = buttons.find((b) => b.type === 'OTP');
    draft.auth = {
      ...EMPTY_DRAFT.auth,
      otpType: otp && otp.type === 'OTP' ? otp.otp_type : 'COPY_CODE',
      buttonText: otp && otp.type === 'OTP' ? (otp.text ?? '') : '',
      addSecurityRecommendation: body?.add_security_recommendation === true,
      codeExpirationMinutes: footer?.code_expiration_minutes
        ? String(footer.code_expiration_minutes)
        : '',
      autofillText:
        otp && otp.type === 'OTP' ? (otp.autofill_text ?? '') : '',
      packageName: otp && otp.type === 'OTP' ? (otp.package_name ?? '') : '',
      signatureHash:
        otp && otp.type === 'OTP' ? (otp.signature_hash ?? '') : '',
      ttlSeconds:
        definition.message_send_ttl_seconds != null &&
        definition.message_send_ttl_seconds > 0
          ? String(definition.message_send_ttl_seconds)
          : '',
    };
    return { draft, category: 'Authentication', templateType: 'authentication' };
  }

  const category =
    definition.category === 'Utility' ? 'Utility' : 'Marketing';

  // ---- Limited-time offer ----
  const lto = findComponent(components, 'LIMITED_TIME_OFFER');
  if (lto) {
    const copyCode = buttons.find((b) => b.type === 'COPY_CODE');
    const urlButton = buttons.find((b) => b.type === 'URL');
    if (header && header.format !== 'TEXT' && header.format !== 'LOCATION') {
      draft.headerFormat = header.format.toLowerCase() as WizardDraft['headerFormat'];
      draft.headerMediaUrl = header.example?.header_url?.[0] ?? '';
    }
    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.offer = {
      text: lto.limited_time_offer.text,
      hasExpiration: lto.limited_time_offer.has_expiration,
      code:
        copyCode && copyCode.type === 'COPY_CODE'
          ? (copyCode.example?.[0] ?? '')
          : '',
      urlButtonText: urlButton && urlButton.type === 'URL' ? urlButton.text : '',
      url: urlButton && urlButton.type === 'URL' ? urlButton.url : '',
      urlExample:
        urlButton && urlButton.type === 'URL'
          ? (urlButton.example?.[0] ?? '')
          : '',
    };
    return { draft, category, templateType: 'limited_time_offer' };
  }

  // ---- Carousel ----
  if (cards.length > 0) {
    const firstCardButtons = getButtons(cards[0].components);
    // The shared shape lives on card 1 — Meta guarantees every card
    // matches it, which is what makes reading it from one card safe.
    const buttonTypes = firstCardButtons
      .map((b) => b.type)
      .filter(
        (t): t is 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' =>
          t === 'QUICK_REPLY' || t === 'URL' || t === 'PHONE_NUMBER',
      );
    const firstCardHeader = getHeader(cards[0].components);

    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.carousel = {
      headerFormat: firstCardHeader?.format === 'VIDEO' ? 'video' : 'image',
      buttonTypes,
      cards: cards.map((card) => {
        const cardHeader = getHeader(card.components);
        const cardBody = getBody(card.components);
        const cardButtonList = getButtons(card.components);
        return {
          // Only the sample URL survives a round trip — the upload handle
          // is single-use at creation and has no renderable form, so an
          // edit re-uploads from the URL.
          headerMediaUrl:
            cardHeader && cardHeader.format !== 'TEXT' &&
            cardHeader.format !== 'LOCATION'
              ? (cardHeader.example?.header_url?.[0] ?? '')
              : '',
          bodyText: cardBody?.text ?? '',
          bodySamples: cardBody?.example?.body_text?.[0] ?? [],
          buttonValues: buttonTypes.map((_, i) => {
            const b = cardButtonList[i];
            return {
              text: b && 'text' in b ? (b.text ?? '') : '',
              url: b && b.type === 'URL' ? b.url : '',
              example: b && b.type === 'URL' ? (b.example?.[0] ?? '') : '',
              phone: b && b.type === 'PHONE_NUMBER' ? b.phone_number : '',
            };
          }),
        };
      }),
    };
    return { draft, category, templateType: 'carousel' };
  }

  // ---- Order status ----
  //
  // The ONLY type that must be read from `template_type` rather than from
  // the components: an order-status template is a body and an optional
  // footer, which is indistinguishable from a plain Utility template. Meta
  // records the difference as a sub_category we do not store separately,
  // so a row synced from Meta reopens as Default — reported to the
  // operator rather than guessed at.
  if (definition.template_type === 'order_status') {
    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.footerText = footer?.text ?? '';
    return { draft, category, templateType: 'order_status' };
  }

  // ---- Catalogue / multi-product / order details ----
  //
  // Detected from the button in `components`, which is where these live —
  // the flat column drops them.
  const commerceButton = buttons.find(
    (b) => b.type === 'CATALOG' || b.type === 'MPM' || b.type === 'ORDER_DETAILS',
  );
  if (commerceButton) {
    if (header) {
      if (header.format === 'TEXT') {
        draft.headerFormat = 'text';
        draft.headerContent = header.text;
        draft.headerSample = header.example?.header_text?.[0] ?? '';
      } else if (header.format !== 'LOCATION') {
        draft.headerFormat =
          header.format.toLowerCase() as WizardDraft['headerFormat'];
        draft.headerMediaUrl = header.example?.header_url?.[0] ?? '';
      }
    }
    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.footerText = footer?.text ?? '';
    draft.commerceButtonText = 'text' in commerceButton ? commerceButton.text : '';
    return {
      draft,
      category,
      templateType:
        commerceButton.type === 'CATALOG'
          ? 'catalogue'
          : commerceButton.type === 'MPM'
            ? 'multi_product'
            : 'order_details',
    };
  }

  // ---- Calling permission request ----
  //
  // Like order status, this has to come from `template_type`: it is a body
  // with no buttons, indistinguishable from a plain Utility template.
  if (definition.template_type === 'calling_permission_request') {
    if (header && header.format === 'TEXT') {
      draft.headerFormat = 'text';
      draft.headerContent = header.text;
      draft.headerSample = header.example?.header_text?.[0] ?? '';
    }
    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.footerText = footer?.text ?? '';
    return { draft, category, templateType: 'calling_permission_request' };
  }

  // ---- Flows ----
  //
  // Detected from the components, not from `template_type`, so a row
  // synced from Meta still opens in the right editor. Meta reports the
  // stored button back as FLOW, and rows created before this editor
  // existed carry no 'flows' type at all.
  const flowButton = buttons.find((b) => b.type === 'FLOW');
  if (flowButton && flowButton.type === 'FLOW') {
    if (header) {
      if (header.format === 'TEXT') {
        draft.headerFormat = 'text';
        draft.headerContent = header.text;
        draft.headerSample = header.example?.header_text?.[0] ?? '';
      } else if (header.format !== 'LOCATION') {
        draft.headerFormat =
          header.format.toLowerCase() as WizardDraft['headerFormat'];
        draft.headerMediaUrl = header.example?.header_url?.[0] ?? '';
      }
    }
    draft.bodyText = body?.text ?? '';
    draft.bodySamples = body?.example?.body_text?.[0] ?? [];
    draft.footerText = footer?.text ?? '';
    draft.flow = {
      flowId: flowButton.flow_id ?? '',
      flowName: flowButton.flow_name ?? '',
      buttonText: flowButton.text ?? '',
      // Meta omits flow_action when it is the default; treat a missing
      // value as 'navigate' to match what this editor submits.
      action: flowButton.flow_action === 'data_exchange'
        ? 'data_exchange'
        : 'navigate',
      navigateScreen: flowButton.navigate_screen ?? '',
    };
    return { draft, category, templateType: 'flows' };
  }

  // ---- Standard ----
  if (header) {
    if (header.format === 'TEXT') {
      draft.headerFormat = 'text';
      draft.headerContent = header.text;
      draft.headerSample = header.example?.header_text?.[0] ?? '';
    } else if (header.format !== 'LOCATION') {
      draft.headerFormat = header.format.toLowerCase() as WizardDraft['headerFormat'];
      draft.headerMediaUrl = header.example?.header_url?.[0] ?? '';
    }
  }
  draft.bodyText = body?.text ?? '';
  draft.bodySamples = body?.example?.body_text?.[0] ?? [];
  draft.footerText = footer?.text ?? '';
  // A stored -1 is Meta's "30 days" sentinel and a real value the operator
  // may want to keep, so it is shown rather than treated as unset.
  draft.ttlSeconds =
    definition.message_send_ttl_seconds != null
      ? String(definition.message_send_ttl_seconds)
      : '';
  draft.parameterFormat = definition.parameter_format;
  // Named examples live in their own example shape, keyed by name.
  draft.namedSamples = Object.fromEntries(
    (body?.example?.body_text_named_params ?? []).map((p) => [
      p.param_name,
      p.example,
    ]),
  );
  draft.buttons = buttons.flatMap((b): TemplateButton[] => {
    switch (b.type) {
      case 'QUICK_REPLY':
        return [{ type: 'QUICK_REPLY' as const, text: b.text }];
      case 'URL':
        return [
          {
            type: 'URL' as const,
            text: b.text,
            url: b.url,
            ...(b.example?.[0] ? { example: b.example[0] } : {}),
          },
        ];
      case 'PHONE_NUMBER':
        return [
          {
            type: 'PHONE_NUMBER' as const,
            text: b.text,
            phone_number: b.phone_number,
          },
        ];
      case 'COPY_CODE':
        return [
          {
            type: 'COPY_CODE' as const,
            text: b.text,
            example: b.example?.[0] ?? '',
          },
        ];
      case 'VOICE_CALL':
        return [{ type: 'VOICE_CALL' as const, text: b.text }];
      default:
        // Rich types (FLOW, MPM, CATALOG, OTP) have no editor yet. They
        // are dropped from the DRAFT only — `components` still holds
        // them, so viewing a template does not destroy them. Saving
        // would, which is why the wizard blocks editing those types.
        return [];
    }
  });

  return { draft, category, templateType: 'default' };
}

/**
 * Sample values keyed for the preview.
 *
 * The header's own `{{1}}` is a separate namespace from the body's in
 * Meta's model — a text header may only ever use `{{1}}` — so the header
 * sample is not merged into the body map. The preview renders the two
 * components with their own value sets.
 */
export function draftBodyValues(draft: WizardDraft) {
  // NAMED templates resolve by name, so the samples map is already the
  // right shape. Passing the positional array here would leave every
  // named placeholder rendered as an unfilled chip.
  if (draft.parameterFormat === 'NAMED') return draft.namedSamples;
  return positionalValues(draft.bodySamples);
}

export function draftHeaderValues(draft: WizardDraft) {
  return positionalValues([draft.headerSample]);
}
