/**
 * Pure validators for message templates, run BEFORE the Meta submit
 * call so a misconfigured template fails at save time (with a specific
 * field-level error) rather than at the Meta API boundary (where the
 * error is a generic 400 + opaque rejection_reason hours later).
 *
 * Every validator throws `Error(message)` — callers catch and surface
 * to the UI. Caps follow Meta's published limits for the Cloud API
 * template surface (v21.0):
 *   https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 *
 * Per-element button validation lives here rather than as a JSONB CHECK
 * because Postgres CHECK constraints can't contain subqueries, and
 * generic CHECK violations don't give users an actionable error
 * ("button #3 has no `text`" beats "constraint violated").
 */

import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from '@/types';

// Limits and placeholder parsing live in their own pure modules so the
// client forms can import them WITHOUT pulling this module into the
// browser graph. Deliberately NOT re-exported from here: a second import
// path is what put this module back in the client bundle and broke it.
// Client components must import from './template-limits' and
// './template-variables' directly.
import {
  AUTH_LIMITS,
  CAROUSEL_LIMITS,
  CATALOGUE_LIMITS,
  FLOW_LIMITS,
  LTO_LIMITS,
  MPM_LIMITS,
  ORDER_DETAILS_LIMITS,
  TEMPLATE_LIMITS,
  TTL_LIMITS,
  VOICE_CALL_LIMITS,
} from './template-limits';
import {
  extractNamedParams,
  extractVariableIndices,
  isValidNamedParam,
} from './template-variables';

/**
 * AUTHENTICATION templates are a different shape entirely: Meta owns the
 * body wording and composes it from these flags, so there is no body
 * text, header, footer text or free-form button to validate.
 *
 * Carried as a sub-object rather than more optional top-level fields so
 * it is obvious at a glance which fields belong to which category, and so
 * `validateTemplatePayload` can branch cleanly instead of threading
 * "…unless authentication" through every rule.
 */
export interface AuthTemplateOptions {
  otp_type: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
  /** Copy-code button label. Meta localises a default if omitted. */
  button_text?: string;
  /** Appends "For your security, do not share this code." */
  add_security_recommendation?: boolean;
  /** Renders "This code expires in N minutes." 1–90. */
  code_expiration_minutes?: number | null;
  /** ONE_TAP / ZERO_TAP only — the Android handshake details. */
  autofill_text?: string;
  package_name?: string;
  signature_hash?: string;
}

/**
 * One carousel card. Meta requires every card in a template to share the
 * same shape, which `validateCarousel` enforces rather than leaving to
 * Meta's rejection message.
 */
export interface CarouselCardPayload {
  /** Meta accepts image or video only — no document, no text. */
  header_format: 'image' | 'video';
  /** The operator-supplied sample; converted to a handle before submit. */
  header_media_url?: string;
  header_handle?: string;
  body_text?: string;
  body_samples?: string[];
  /** Max 2. Quick reply, URL and phone only. */
  buttons?: TemplateButton[];
}

/**
 * The limited-time offer strip that sits above the body.
 *
 * `has_expiration` only controls whether the countdown is DISPLAYED — the
 * actual expiry timestamp is supplied per message at send time, because
 * it differs for every recipient.
 */
export interface LimitedTimeOfferOptions {
  /** The short label, e.g. "Expiring offer!". Max 16 chars. */
  text: string;
  /** Shows the running countdown in the delivered message. */
  has_expiration: boolean;
}

/**
 * The FLOW button that makes a template a "Flows" template.
 *
 * Modelled as its own field rather than as a member of `buttons` for the
 * same reason `offer` and `auth` are: `buttons` is the legacy four-type
 * union, and `buildButtonPayload` switches over it exhaustively. Widening
 * that union would force every switch in the codebase to grow a case for
 * a button only this one template shape can carry.
 *
 * The referenced Flow is a META Flow (see FLOW_LIMITS), identified by the
 * ID returned from GET /{waba_id}/flows.
 */
export interface FlowButtonOptions {
  /** Meta's Flow ID. */
  flow_id: string;
  /** Flow name, kept for the editor's display only — Meta ignores it. */
  flow_name?: string;
  /** The button label. Meta does not supply one. */
  text: string;
  /**
   * 'navigate' opens a screen straight away; 'data_exchange' calls the
   * Flow's endpoint first to decide what to show.
   */
  flow_action: 'navigate' | 'data_exchange';
  /** Required for 'navigate', forbidden otherwise. Names a Flow JSON screen. */
  navigate_screen?: string;
}

export interface TemplatePayload {
  name: string;
  category: MessageTemplate['category'];
  language: string;
  header_type?: MessageTemplate['header_type'];
  header_content?: string;
  header_media_url?: string;
  header_handle?: string;
  /** Empty for AUTHENTICATION — Meta generates the wording. */
  body_text: string;
  footer_text?: string;
  buttons?: TemplateButton[];
  sample_values?: TemplateSampleValues;
  /** Required when category is 'Authentication', ignored otherwise. */
  auth?: AuthTemplateOptions;
  /** Present makes this a carousel template. Marketing only. */
  cards?: CarouselCardPayload[];
  /** Present makes this a limited-time offer template. Marketing only. */
  offer?: LimitedTimeOfferOptions;
  /** Present makes this a Flow template. Marketing or Utility. */
  flow?: FlowButtonOptions;
  /**
   * `{{1}}` (POSITIONAL, the default) or `{{order_id}}` (NAMED). Meta
   * forbids mixing them within one template.
   */
  parameter_format?: 'POSITIONAL' | 'NAMED';
  /**
   * NAMED only: example value per parameter name. Meta requires one for
   * every variable, and matches them by name rather than by position.
   */
  named_samples?: Record<string, string>;
  /**
   * A CATALOG button — opens the business's whole product catalogue.
   * Marketing only, and needs a catalogue linked to the WABA.
   */
  catalog?: { text: string };
  /**
   * An MPM button — opens a curated list of products. Marketing only, and
   * Meta REQUIRES a text header on this shape.
   */
  mpm?: { text: string };
  /**
   * An ORDER_DETAILS button — an invoice the customer pays inside
   * WhatsApp. Utility only, and needs WhatsApp Pay on the WABA.
   */
  order_details?: { text: string };
  /**
   * Meta's template sub-category. ORDER_STATUS and CALL_PERMISSION_REQUEST.
   *
   * An order-status template is an ordinary Utility template — a body and
   * an optional footer, nothing else — that Meta treats specially because
   * sending one UPDATES AN ORDER rather than just delivering text. The
   * distinction lives entirely in this field; the components look
   * unremarkable, which is why it cannot be inferred from them.
   */
  sub_category?: 'ORDER_STATUS' | 'CALL_PERMISSION_REQUEST';
  /** Delivery time-to-live in seconds. -1 means Meta's 24-hour default. */
  message_send_ttl_seconds?: number | null;
}

export function validateTemplateName(name: string): void {
  if (!name) throw new Error('Template name is required.');
  if (!TEMPLATE_LIMITS.nameRegex.test(name)) {
    throw new Error(
      'Template name must use only lowercase letters, digits, and underscores (1-512 chars).',
    );
  }
}



/**
 * Meta requires contiguous, 1-indexed variables. `{{1}} {{3}}` is
 * invalid — it must be `{{1}} {{2}}`.
 */
function assertContiguous(indices: number[], where: string): void {
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      throw new Error(
        `${where} variables must be contiguous starting at {{1}} — found ${indices
          .map((n) => `{{${n}}}`)
          .join(', ')}.`,
      );
    }
  }
}

export function validateBody(bodyText: string): number[] {
  if (!bodyText.trim()) throw new Error('Body text is required.');
  if (bodyText.length > TEMPLATE_LIMITS.bodyMaxLength) {
    throw new Error(
      `Body text exceeds ${TEMPLATE_LIMITS.bodyMaxLength} chars (got ${bodyText.length}).`,
    );
  }
  const indices = extractVariableIndices(bodyText);
  assertContiguous(indices, 'Body');
  return indices;
}

/**
 * Validate a NAMED-format body and return its parameter names in order.
 *
 * Named parameters replace the positional ones entirely — Meta FORBIDS
 * mixing the two in one template, and the mixed case is the one worth
 * catching locally: the rejection says only "The parameter name is
 * required", which points at neither the stray `{{1}}` nor the rule.
 */
export function validateNamedBody(
  bodyText: string,
  samples: Record<string, string> | undefined,
): string[] {
  if (!bodyText.trim()) throw new Error('Body text is required.');
  if (bodyText.length > TEMPLATE_LIMITS.bodyMaxLength) {
    throw new Error(
      `Body text exceeds ${TEMPLATE_LIMITS.bodyMaxLength} chars (got ${bodyText.length}).`,
    );
  }

  const positional = extractVariableIndices(bodyText);
  if (positional.length > 0) {
    throw new Error(
      `This template uses named variables, so it cannot also contain ${positional
        .map((n) => `{{${n}}}`)
        .join(', ')} — Meta does not allow both formats in one template.`,
    );
  }

  const names = extractNamedParams(bodyText);
  if (names.length === 0) return [];

  for (const name of names) {
    if (!isValidNamedParam(name)) {
      throw new Error(
        `"${name}" is not a valid variable name — use lowercase letters, numbers and underscores, e.g. {{order_id}}.`,
      );
    }
    if (!samples?.[name]?.trim()) {
      throw new Error(
        `Add an example value for {{${name}}} — Meta requires one for every variable.`,
      );
    }
  }

  return names;
}

export function validateFooter(footerText: string | undefined): void {
  if (!footerText) return;
  if (footerText.length > TEMPLATE_LIMITS.footerMaxLength) {
    throw new Error(
      `Footer text exceeds ${TEMPLATE_LIMITS.footerMaxLength} chars (got ${footerText.length}).`,
    );
  }
  if (extractVariableIndices(footerText).length > 0) {
    throw new Error('Footer text cannot contain {{N}} variables (Meta rule).');
  }
}

export interface HeaderValidationResult {
  /** number of {{N}} placeholders in a TEXT header — 0 or 1. */
  variableCount: number;
}

export function validateHeader(
  payload: Pick<
    TemplatePayload,
    'header_type' | 'header_content' | 'header_media_url' | 'header_handle'
  >,
): HeaderValidationResult {
  const { header_type, header_content, header_media_url, header_handle } = payload;
  if (!header_type) return { variableCount: 0 };

  if (header_type === 'text') {
    if (!header_content || !header_content.trim()) {
      throw new Error('Text header requires header_content.');
    }
    if (header_content.length > TEMPLATE_LIMITS.headerTextMaxLength) {
      throw new Error(
        `Header text exceeds ${TEMPLATE_LIMITS.headerTextMaxLength} chars (got ${header_content.length}).`,
      );
    }
    const indices = extractVariableIndices(header_content);
    if (indices.length > 1) {
      throw new Error(
        `Text header supports at most one variable — found ${indices.length} (Meta rule).`,
      );
    }
    if (indices.length === 1 && indices[0] !== 1) {
      throw new Error('Text header variable must be {{1}} (Meta rule).');
    }
    return { variableCount: indices.length };
  }

  // A location header takes nothing at creation: the pin is a per-message
  // value, so there is no sample URL and no variable to count.
  if (header_type === 'location') {
    return { variableCount: 0 };
  }

  // image / video / document need either a public URL or a Resumable
  // Upload handle. Either one — Meta accepts both example forms.
  if (!header_media_url && !header_handle) {
    throw new Error(
      `${header_type} header requires either a public sample URL (header_media_url) or a Resumable Upload handle (header_handle).`,
    );
  }
  if (header_media_url) {
    try {
      const u = new URL(header_media_url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('header_media_url must use http(s) scheme.');
      }
    } catch {
      throw new Error('header_media_url must be a valid URL.');
    }
  }
  return { variableCount: 0 };
}

function countButtonsByType(
  buttons: TemplateButton[],
): Record<TemplateButton['type'], number> {
  const counts: Record<TemplateButton['type'], number> = {
    QUICK_REPLY: 0,
    URL: 0,
    PHONE_NUMBER: 0,
    COPY_CODE: 0,
    VOICE_CALL: 0,
  };
  for (const b of buttons) counts[b.type]++;
  return counts;
}

export function validateButtons(buttons: TemplateButton[] | undefined): void {
  if (!buttons || buttons.length === 0) return;
  if (buttons.length > TEMPLATE_LIMITS.maxButtonsTotal) {
    throw new Error(
      `Templates can have at most ${TEMPLATE_LIMITS.maxButtonsTotal} buttons (got ${buttons.length}).`,
    );
  }

  const counts = countButtonsByType(buttons);
  if (counts.URL > TEMPLATE_LIMITS.maxUrlButtons) {
    throw new Error(
      `At most ${TEMPLATE_LIMITS.maxUrlButtons} URL buttons allowed (got ${counts.URL}).`,
    );
  }
  if (counts.PHONE_NUMBER > TEMPLATE_LIMITS.maxPhoneButtons) {
    throw new Error(
      `At most ${TEMPLATE_LIMITS.maxPhoneButtons} PHONE_NUMBER button allowed (got ${counts.PHONE_NUMBER}).`,
    );
  }
  if (counts.COPY_CODE > TEMPLATE_LIMITS.maxCopyCodeButtons) {
    throw new Error(
      `At most ${TEMPLATE_LIMITS.maxCopyCodeButtons} COPY_CODE button allowed (got ${counts.COPY_CODE}).`,
    );
  }
  if (counts.VOICE_CALL > VOICE_CALL_LIMITS.maxVoiceCallButtons) {
    throw new Error(
      `At most ${VOICE_CALL_LIMITS.maxVoiceCallButtons} voice call button allowed (got ${counts.VOICE_CALL}).`,
    );
  }

  // Meta rule: buttons must form exactly TWO groups — quick replies and
  // non-quick-replies — in EITHER order. Quoting the components doc:
  //
  //   "If using quick reply buttons with other buttons, buttons must be
  //    organized into two groups: quick reply buttons and non-quick reply
  //    buttons."
  //
  //   Valid:   Quick Reply, Quick Reply
  //            Quick Reply, Quick Reply, URL, Phone
  //            URL, Phone, Quick Reply, Quick Reply
  //   Invalid: Quick Reply, URL, Quick Reply
  //            URL, Quick Reply, URL
  //
  // This previously required quick replies to come FIRST, rejecting
  // "URL, Quick Reply" — which Meta's own examples list as valid. The
  // effect was that library templates with a CTA followed by a quick
  // reply (shipping update, order confirmation, and others) could not be
  // submitted at all: the builder refused them before Meta ever saw them.
  //
  // The real constraint is contiguity, not ordering. Count the runs after
  // collapsing each button to "is it a quick reply"; more than two runs
  // means a group was split.
  let groupRuns = 0;
  let previousWasQuickReply: boolean | null = null;
  for (const b of buttons) {
    const isQuickReply = b.type === 'QUICK_REPLY';
    if (isQuickReply !== previousWasQuickReply) {
      groupRuns++;
      previousWasQuickReply = isQuickReply;
    }
  }
  if (groupRuns > 2) {
    throw new Error(
      'QUICK_REPLY buttons must be kept together. Meta allows quick replies ' +
        'before or after URL / PHONE_NUMBER / COPY_CODE buttons, but not split ' +
        'across them.',
    );
  }

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b.text?.trim()) {
      throw new Error(`Button #${i + 1} (${b.type}) is missing text.`);
    }
    if (b.text.length > TEMPLATE_LIMITS.buttonTextMaxLength) {
      throw new Error(
        `Button #${i + 1} text exceeds ${TEMPLATE_LIMITS.buttonTextMaxLength} chars.`,
      );
    }
    switch (b.type) {
      case 'URL': {
        if (!b.url?.trim()) {
          throw new Error(`URL button #${i + 1} is missing url.`);
        }
        try {
          new URL(b.url);
        } catch {
          throw new Error(`URL button #${i + 1} has an invalid url.`);
        }
        const urlVars = extractVariableIndices(b.url);
        if (urlVars.length > 1) {
          throw new Error(
            `URL button #${i + 1} can have at most one variable (Meta rule).`,
          );
        }
        if (urlVars.length === 1) {
          if (urlVars[0] !== 1) {
            throw new Error(
              `URL button #${i + 1} variable must be {{1}} (Meta rule).`,
            );
          }
          if (!b.example?.trim()) {
            throw new Error(
              `URL button #${i + 1} uses {{1}} — Meta requires an example value.`,
            );
          }
        }
        break;
      }
      case 'PHONE_NUMBER':
        if (!b.phone_number?.trim()) {
          throw new Error(
            `PHONE_NUMBER button #${i + 1} is missing phone_number.`,
          );
        }
        break;
      case 'COPY_CODE':
        if (!b.example?.trim()) {
          throw new Error(
            `COPY_CODE button #${i + 1} is missing example value.`,
          );
        }
        break;
    }
  }
}

/**
 * Sample values must be supplied 1:1 with the variables in the body
 * (and header, if it has one). Meta uses these for human review.
 */
export function validateSampleValues(
  payload: TemplatePayload,
  bodyVarCount: number,
  headerVarCount: number,
): void {
  const samples = payload.sample_values ?? {};
  const body = samples.body ?? [];
  const header = samples.header ?? [];

  if (body.length !== bodyVarCount) {
    throw new Error(
      `Body has ${bodyVarCount} variable(s) — supply exactly ${bodyVarCount} sample value(s) (got ${body.length}).`,
    );
  }
  if (header.length !== headerVarCount) {
    throw new Error(
      `Header has ${headerVarCount} variable(s) — supply exactly ${headerVarCount} sample value(s) (got ${header.length}).`,
    );
  }
  for (let i = 0; i < body.length; i++) {
    if (!body[i] || !body[i].trim()) {
      throw new Error(`Body sample value #${i + 1} is empty.`);
    }
  }
  for (let i = 0; i < header.length; i++) {
    if (!header[i] || !header[i].trim()) {
      throw new Error(`Header sample value #${i + 1} is empty.`);
    }
  }
}

/**
 * Run every validator. Throws on the first failure with a specific,
 * field-level message. Returns the variable counts so callers can
 * reuse them when building the Meta components payload.
 */
/**
 * Validate an AUTHENTICATION template.
 *
 * Deliberately separate from the standard rules: there is no body text,
 * header, footer text or button list to check, so running those
 * validators would reject a perfectly valid template for missing a body
 * Meta does not want.
 */
export function validateAuthTemplate(payload: TemplatePayload): void {
  const auth = payload.auth;
  if (!auth) {
    throw new Error(
      'Authentication templates need one-time-password options (auth).',
    );
  }

  if (!['COPY_CODE', 'ONE_TAP', 'ZERO_TAP'].includes(auth.otp_type)) {
    throw new Error(
      'One-time password type must be COPY_CODE, ONE_TAP or ZERO_TAP.',
    );
  }

  // Meta requires the copy-code label even for one-tap buttons: if it
  // cannot verify the Android handshake at delivery time it silently
  // falls back to a copy-code button, and an unlabelled button then.
  if (auth.button_text && auth.button_text.length > AUTH_LIMITS.buttonTextMaxLength) {
    throw new Error(
      `Button text exceeds ${AUTH_LIMITS.buttonTextMaxLength} chars (got ${auth.button_text.length}).`,
    );
  }

  if (auth.code_expiration_minutes != null) {
    const n = auth.code_expiration_minutes;
    if (
      !Number.isInteger(n) ||
      n < AUTH_LIMITS.minExpiryMinutes ||
      n > AUTH_LIMITS.maxExpiryMinutes
    ) {
      throw new Error(
        `Code expiry must be a whole number of minutes between ${AUTH_LIMITS.minExpiryMinutes} and ${AUTH_LIMITS.maxExpiryMinutes}.`,
      );
    }
  }

  if (auth.otp_type === 'ONE_TAP' || auth.otp_type === 'ZERO_TAP') {
    if (!auth.package_name?.trim()) {
      throw new Error(
        `${auth.otp_type} buttons need your Android app's package name.`,
      );
    }
    if (!auth.signature_hash?.trim()) {
      throw new Error(
        `${auth.otp_type} buttons need your app's signing key hash.`,
      );
    }
  }

  // The TTL window is narrower for authentication than for other
  // categories, and -1 (Meta's "use 24 hours" sentinel) stays legal.
  const ttl = payload.message_send_ttl_seconds;
  if (ttl != null && ttl !== -1) {
    if (ttl < AUTH_LIMITS.minTtlSeconds || ttl > AUTH_LIMITS.maxTtlSeconds) {
      throw new Error(
        `Authentication templates accept a validity period of ${AUTH_LIMITS.minTtlSeconds}–${AUTH_LIMITS.maxTtlSeconds} seconds (got ${ttl}).`,
      );
    }
  }
}

/**
 * Validate a carousel template's cards.
 *
 * Meta's uniformity rules are strict and its rejection messages for them
 * are unhelpful, so they are checked here where the error can name the
 * offending card. The rules:
 *
 *   - 2 to 10 cards, and the count is FROZEN at approval.
 *   - Every card has an image or video header (no document, no text).
 *   - Every card has the SAME header format.
 *   - Either every card has body text or none does — Meta needs it for
 *     equal card heights.
 *   - Every card has the same button TYPES in the same ORDER, because at
 *     send time buttons are addressed by index and the indexes must line
 *     up across cards.
 */
export function validateCarousel(payload: TemplatePayload): void {
  const cards = payload.cards ?? [];

  if (payload.category !== 'Marketing') {
    throw new Error('Carousel templates must use the Marketing category.');
  }
  if (
    cards.length < CAROUSEL_LIMITS.minCards ||
    cards.length > CAROUSEL_LIMITS.maxCards
  ) {
    throw new Error(
      `A carousel needs between ${CAROUSEL_LIMITS.minCards} and ${CAROUSEL_LIMITS.maxCards} cards (got ${cards.length}).`,
    );
  }

  // The message body above the cards is required and follows the normal
  // rules; the carousel replaces the header/footer, not the body.
  const bodyVars = validateBody(payload.body_text);
  const bodySamples = payload.sample_values?.body ?? [];
  if (bodySamples.length !== bodyVars.length) {
    throw new Error(
      `The message body has ${bodyVars.length} variable(s) — supply exactly that many example values (got ${bodySamples.length}).`,
    );
  }

  const firstFormat = cards[0].header_format;
  const cardsWithBody = cards.filter((c) => c.body_text?.trim()).length;
  // Signature = the button types in order, which must match on every card.
  const firstSignature = (cards[0].buttons ?? []).map((b) => b.type).join(',');

  cards.forEach((card, i) => {
    const where = `Card ${i + 1}`;

    if (card.header_format !== 'image' && card.header_format !== 'video') {
      throw new Error(`${where}: carousel headers must be an image or a video.`);
    }
    if (card.header_format !== firstFormat) {
      throw new Error(
        `${where} is a ${card.header_format} but card 1 is a ${firstFormat}. Every card must use the same header format.`,
      );
    }
    if (!card.header_media_url?.trim() && !card.header_handle?.trim()) {
      throw new Error(`${where}: add a sample ${card.header_format}.`);
    }
    if (card.header_media_url?.trim()) {
      try {
        const u = new URL(card.header_media_url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
          throw new Error('bad protocol');
        }
      } catch {
        throw new Error(`${where}: the sample media URL is not a valid URL.`);
      }
    }

    // All-or-nothing body text.
    const hasBody = Boolean(card.body_text?.trim());
    if (cardsWithBody > 0 && !hasBody) {
      throw new Error(
        `${where} has no text, but other cards do. Either give every card text or none — Meta requires it so the cards render at the same height.`,
      );
    }
    if (hasBody) {
      const text = card.body_text as string;
      if (text.length > CAROUSEL_LIMITS.cardBodyMaxLength) {
        throw new Error(
          `${where}: text exceeds ${CAROUSEL_LIMITS.cardBodyMaxLength} chars (got ${text.length}).`,
        );
      }
      const vars = extractVariableIndices(text);
      assertContiguous(vars, `${where} text`);
      const samples = card.body_samples ?? [];
      if (samples.filter((s) => s?.trim()).length !== vars.length) {
        throw new Error(
          `${where}: has ${vars.length} variable(s) — supply exactly that many example values.`,
        );
      }
    }

    const buttons = card.buttons ?? [];
    if (buttons.length > CAROUSEL_LIMITS.maxButtonsPerCard) {
      throw new Error(
        `${where}: at most ${CAROUSEL_LIMITS.maxButtonsPerCard} buttons per card (got ${buttons.length}).`,
      );
    }
    const signature = buttons.map((b) => b.type).join(',');
    if (signature !== firstSignature) {
      throw new Error(
        `${where}: its buttons must match card 1 in type and order. Meta addresses card buttons by position, so they have to line up across every card.`,
      );
    }
    buttons.forEach((b, bi) => {
      const btnWhere = `${where}, button ${bi + 1}`;
      if (b.type === 'COPY_CODE') {
        throw new Error(
          `${btnWhere}: carousel cards support quick reply, website and call buttons only.`,
        );
      }
      if (!b.text?.trim()) throw new Error(`${btnWhere} is missing a label.`);
      if (b.text.length > CAROUSEL_LIMITS.buttonTextMaxLength) {
        throw new Error(
          `${btnWhere}: label exceeds ${CAROUSEL_LIMITS.buttonTextMaxLength} chars.`,
        );
      }
      if (b.type === 'URL') {
        if (!b.url?.trim()) throw new Error(`${btnWhere} is missing a URL.`);
        try {
          new URL(b.url);
        } catch {
          throw new Error(`${btnWhere}: the URL is not valid.`);
        }
        const urlVars = extractVariableIndices(b.url);
        if (urlVars.length > 1) {
          throw new Error(`${btnWhere}: a URL can hold at most one variable.`);
        }
        if (urlVars.length === 1 && !b.example?.trim()) {
          throw new Error(
            `${btnWhere}: uses a variable, so Meta needs an example value.`,
          );
        }
      }
      if (b.type === 'PHONE_NUMBER' && !b.phone_number?.trim()) {
        throw new Error(`${btnWhere} is missing a phone number.`);
      }
    });
  });
}

/**
 * Validate a limited-time offer template.
 *
 * The limits here are deliberately checked rather than inherited, because
 * several are TIGHTER than a normal template's and getting one wrong is a
 * rejection whose message does not say which limit was exceeded.
 */
export function validateLimitedTimeOffer(payload: TemplatePayload): void {
  const offer = payload.offer;
  if (!offer) {
    throw new Error('Limited-time offer templates need offer details.');
  }
  if (payload.category !== 'Marketing') {
    throw new Error(
      'Limited-time offer templates must use the Marketing category.',
    );
  }
  if (payload.footer_text?.trim()) {
    throw new Error(
      'Limited-time offer templates cannot have a footer — Meta does not support one.',
    );
  }

  if (!offer.text?.trim()) {
    throw new Error('Add the offer label, e.g. "Expiring offer!".');
  }
  if (offer.text.length > LTO_LIMITS.offerTextMaxLength) {
    throw new Error(
      `The offer label must be ${LTO_LIMITS.offerTextMaxLength} characters or fewer (got ${offer.text.length}).`,
    );
  }

  // Body follows the normal variable rules but a shorter limit.
  const bodyVars = validateBody(payload.body_text);
  if (payload.body_text.length > LTO_LIMITS.bodyMaxLength) {
    throw new Error(
      `Body text exceeds ${LTO_LIMITS.bodyMaxLength} chars (got ${payload.body_text.length}). Limited-time offers allow less than a normal template.`,
    );
  }
  const samples = payload.sample_values?.body ?? [];
  if (samples.length !== bodyVars.length) {
    throw new Error(
      `Body has ${bodyVars.length} variable(s) — supply exactly that many example values (got ${samples.length}).`,
    );
  }

  // Header is optional but image/video only.
  if (payload.header_type) {
    if (payload.header_type !== 'image' && payload.header_type !== 'video') {
      throw new Error(
        'A limited-time offer header can only be an image or a video.',
      );
    }
    if (!payload.header_media_url?.trim() && !payload.header_handle?.trim()) {
      throw new Error(`Add a sample ${payload.header_type} for the header.`);
    }
  }

  const buttons = payload.buttons ?? [];
  const copyCode = buttons.filter((b) => b.type === 'COPY_CODE');
  const urls = buttons.filter((b) => b.type === 'URL');

  if (copyCode.length !== 1) {
    throw new Error(
      'A limited-time offer needs exactly one copy-code button — the offer code is the point of the template.',
    );
  }
  if (buttons.length !== copyCode.length + urls.length) {
    throw new Error(
      'Limited-time offers support a copy-code button and an optional website button only.',
    );
  }
  if (urls.length > 1) {
    throw new Error('At most one website button is allowed.');
  }

  const code = copyCode[0];
  if (code.type === 'COPY_CODE') {
    if (!code.example?.trim()) {
      throw new Error('Add an example offer code.');
    }
    if (code.example.length > LTO_LIMITS.offerCodeMaxLength) {
      throw new Error(
        `The offer code must be ${LTO_LIMITS.offerCodeMaxLength} characters or fewer (got ${code.example.length}).`,
      );
    }
  }

  for (const url of urls) {
    if (url.type !== 'URL') continue;
    if (!url.text?.trim()) throw new Error('The website button needs a label.');
    if (url.text.length > LTO_LIMITS.urlButtonTextMaxLength) {
      throw new Error(
        `The website button label must be ${LTO_LIMITS.urlButtonTextMaxLength} characters or fewer.`,
      );
    }
    if (!url.url?.trim()) throw new Error('The website button needs a URL.');
    try {
      new URL(url.url);
    } catch {
      throw new Error('The website button URL is not valid.');
    }
    const vars = extractVariableIndices(url.url);
    if (vars.length > 1) {
      throw new Error('The website button URL can hold at most one variable.');
    }
    if (vars.length === 1 && !url.example?.trim()) {
      throw new Error(
        'The website button URL uses a variable, so Meta needs an example value.',
      );
    }
  }
}

/**
 * Validate an order-status template.
 *
 * Meta's shape is unusually narrow: Utility category, a BODY, an optional
 * FOOTER, and nothing else. No header, no buttons — the call-to-action is
 * implied by the sub-category, and the order reference and status are
 * supplied per message at send time.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/payments-api/payments-in/orderstatustemplate
 */
export function validateOrderStatus(payload: TemplatePayload): void {
  if (payload.category !== 'Utility') {
    throw new Error('Order status templates must use the Utility category.');
  }
  if (payload.header_type) {
    throw new Error(
      'Order status templates cannot have a header — body and footer only.',
    );
  }
  if (payload.buttons && payload.buttons.length > 0) {
    throw new Error(
      'Order status templates cannot have buttons — the order card is built by WhatsApp.',
    );
  }
  if (payload.flow || payload.offer || (payload.cards?.length ?? 0) > 0) {
    // Guards against a payload that claims two shapes at once, which
    // would otherwise be resolved by whichever branch happened to run
    // first in buildMetaTemplatePayload.
    throw new Error(
      'An order status template cannot also be a Flow, offer or carousel template.',
    );
  }

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  validateSampleValues(payload, bodyVars.length, 0);
}

/**
 * Shared rules for the three commerce shapes and the calling-permission
 * request: each is a standard template whose BUTTONS component is fixed by
 * its type, so a payload carrying `buttons` as well would be a second,
 * conflicting source.
 */
function assertNoManualButtons(payload: TemplatePayload, what: string): void {
  if (payload.buttons && payload.buttons.length > 0) {
    throw new Error(
      `A ${what} template carries only its own button — remove the other buttons.`,
    );
  }
}

/** Catalogue: body, optional footer, one CATALOG button. Marketing only. */
export function validateCatalogTemplate(payload: TemplatePayload): void {
  const catalog = payload.catalog;
  if (!catalog) throw new Error('Catalogue templates need a button label.');
  if (payload.category !== 'Marketing') {
    throw new Error('Catalogue templates must use the Marketing category.');
  }
  if (payload.header_type) {
    // Meta builds the header from a product thumbnail, so supplying one is
    // rejected — and the thumbnail is chosen at send time, not here.
    throw new Error(
      'Catalogue templates cannot have a header — WhatsApp uses a product image.',
    );
  }
  if (!catalog.text?.trim()) throw new Error('Add the button label, e.g. "View catalogue".');
  if (catalog.text.length > CATALOGUE_LIMITS.buttonTextMaxLength) {
    throw new Error(
      `The button label must be ${CATALOGUE_LIMITS.buttonTextMaxLength} characters or fewer.`,
    );
  }
  assertNoManualButtons(payload, 'catalogue');

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  validateSampleValues(payload, bodyVars.length, 0);
}

/**
 * Multi-product: text header REQUIRED, body, optional footer, one MPM
 * button. Marketing only.
 *
 * The required header is the rule worth checking locally — every other
 * template treats a header as optional, so its absence here comes back as
 * a generic component error.
 */
export function validateMpmTemplate(payload: TemplatePayload): void {
  const mpm = payload.mpm;
  if (!mpm) throw new Error('Multi-product templates need a button label.');
  if (payload.category !== 'Marketing') {
    throw new Error('Multi-product templates must use the Marketing category.');
  }
  if (payload.header_type !== 'text' || !payload.header_content?.trim()) {
    throw new Error(
      'Multi-product templates require a text header — Meta rejects them without one.',
    );
  }
  if (!mpm.text?.trim()) throw new Error('Add the button label, e.g. "View items".');
  if (mpm.text.length > MPM_LIMITS.buttonTextMaxLength) {
    throw new Error(
      `The button label must be ${MPM_LIMITS.buttonTextMaxLength} characters or fewer.`,
    );
  }
  assertNoManualButtons(payload, 'multi-product');

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  const headerResult = validateHeader(payload);
  validateSampleValues(payload, bodyVars.length, headerResult.variableCount);
}

/** Order details: optional header, body, optional footer, one button. Utility. */
export function validateOrderDetailsTemplate(payload: TemplatePayload): void {
  const button = payload.order_details;
  if (!button) throw new Error('Order details templates need a button label.');
  if (payload.category !== 'Utility') {
    throw new Error('Order details templates must use the Utility category.');
  }
  if (!button.text?.trim()) throw new Error('Add the button label, e.g. "Review and pay".');
  if (button.text.length > ORDER_DETAILS_LIMITS.buttonTextMaxLength) {
    throw new Error(
      `The button label must be ${ORDER_DETAILS_LIMITS.buttonTextMaxLength} characters or fewer.`,
    );
  }
  assertNoManualButtons(payload, 'order details');

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  const headerResult = validateHeader(payload);
  validateSampleValues(payload, bodyVars.length, headerResult.variableCount);
}

/**
 * Calling permission request: optional text header, body, optional footer,
 * and NO buttons at all — Meta supplies the three consent options
 * ("Allow", "Temporarily allow", "Not at this time") itself.
 */
export function validateCallPermissionTemplate(payload: TemplatePayload): void {
  if (payload.category !== 'Utility') {
    throw new Error(
      'Calling permission requests must use the Utility category.',
    );
  }
  if (payload.header_type && payload.header_type !== 'text') {
    throw new Error(
      'A calling permission request can only have a text header, or none.',
    );
  }
  assertNoManualButtons(payload, 'calling permission request');

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  const headerResult = validateHeader(payload);
  validateSampleValues(payload, bodyVars.length, headerResult.variableCount);
}

/**
 * Validate a Flow template.
 *
 * The content rules are the standard ones — header, body, footer all
 * behave normally — so the only bespoke part is the FLOW button itself.
 * Checked here rather than left to Meta because two of these come back as
 * generic parameter errors that name neither the field nor the reason.
 */
export function validateFlowTemplate(payload: TemplatePayload): void {
  const flow = payload.flow;
  if (!flow) {
    throw new Error('Flow templates need a Flow to open.');
  }
  if (payload.category === 'Authentication') {
    // Authentication templates have a fixed shape with an OTP button;
    // there is no room for a Flow button in it.
    throw new Error(
      'Flow templates must use the Marketing or Utility category.',
    );
  }
  if (!flow.flow_id?.trim()) {
    throw new Error(
      'Pick a published Flow — its ID is what the button opens.',
    );
  }
  if (!flow.text?.trim()) {
    throw new Error('Add the button label, e.g. "Book now".');
  }
  if (flow.text.length > FLOW_LIMITS.buttonTextMaxLength) {
    throw new Error(
      `The button label must be ${FLOW_LIMITS.buttonTextMaxLength} characters or fewer (got ${flow.text.length}).`,
    );
  }
  if (extractVariableIndices(flow.text).length > 0) {
    throw new Error('The button label cannot contain {{N}} variables.');
  }

  if (flow.flow_action !== 'navigate' && flow.flow_action !== 'data_exchange') {
    throw new Error(
      "The Flow action must be either 'navigate' or 'data_exchange'.",
    );
  }
  // Meta requires the starting screen for 'navigate' and rejects it for
  // 'data_exchange', where the endpoint decides what to show first.
  if (flow.flow_action === 'navigate' && !flow.navigate_screen?.trim()) {
    throw new Error(
      "A 'navigate' Flow button needs the name of the first screen from your Flow JSON.",
    );
  }
  if (flow.flow_action === 'data_exchange' && flow.navigate_screen?.trim()) {
    throw new Error(
      "A 'data_exchange' Flow button must not name a screen — the Flow's endpoint chooses it.",
    );
  }

  // The FLOW button is assembled from `flow`, so anything in `buttons`
  // would be a second, conflicting source. Meta also allows only one
  // Flow button per template.
  if (payload.buttons && payload.buttons.length > 0) {
    throw new Error(
      'A Flow template carries only its Flow button — remove the other buttons.',
    );
  }

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  const headerResult = validateHeader(payload);
  validateSampleValues(payload, bodyVars.length, headerResult.variableCount);
}

/**
 * Validate the message validity period.
 *
 * The allowed window DIFFERS BY CATEGORY, which is the whole reason this
 * is checked locally: 60 seconds is fine on a Utility template and
 * rejected on a Marketing one, and Meta's error does not mention the
 * category. Authentication has its own narrower window, already enforced
 * by validateAuthTemplate.
 */
export function validateTtl(payload: TemplatePayload): void {
  const ttl = payload.message_send_ttl_seconds;
  if (ttl == null) return;
  // Meta's sentinel for "30 days". Valid for every category, and the
  // reason migration 063 exists — an earlier CHECK rejected it and broke
  // syncing any template that carried it.
  if (ttl === TTL_LIMITS.defaultSentinel) return;
  if (payload.category === 'Authentication') return;

  const window = TTL_LIMITS[payload.category];
  if (!Number.isInteger(ttl) || ttl < window.min || ttl > window.max) {
    throw new Error(
      `A ${payload.category} template's validity period must be between ${window.min} and ${window.max} seconds (or -1 for 30 days) — got ${ttl}.`,
    );
  }
}

export function validateTemplatePayload(payload: TemplatePayload): {
  bodyVarCount: number;
  headerVarCount: number;
} {
  validateTemplateName(payload.name);
  if (!payload.language?.trim()) {
    throw new Error('Language is required.');
  }
  validateTtl(payload);

  // Limited-time offer: tighter limits and no footer, so it gets its own
  // rules rather than the standard ones plus exceptions.
  if (payload.offer) {
    validateLimitedTimeOffer(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: 0,
    };
  }

  // Authentication short-circuits the standard content rules — its body
  // is generated by Meta, so there is nothing here to validate against.
  if (payload.category === 'Authentication') {
    validateAuthTemplate(payload);
    return { bodyVarCount: 1, headerVarCount: 0 };
  }

  // The commerce shapes and the calling-permission request each own their
  // BUTTONS component, so they are checked before the standard path — which
  // would happily accept a payload with no buttons and never notice the
  // type-specific button was missing.
  if (payload.catalog) {
    validateCatalogTemplate(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: 0,
    };
  }
  if (payload.mpm) {
    validateMpmTemplate(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: extractVariableIndices(payload.header_content ?? '').length,
    };
  }
  if (payload.order_details) {
    validateOrderDetailsTemplate(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount:
        payload.header_type === 'text'
          ? extractVariableIndices(payload.header_content ?? '').length
          : 0,
    };
  }
  if (payload.sub_category === 'CALL_PERMISSION_REQUEST') {
    validateCallPermissionTemplate(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: extractVariableIndices(payload.header_content ?? '').length,
    };
  }

  // Order status: narrower than a standard Utility template (no header,
  // no buttons), so its own rules rather than the standard ones plus
  // exceptions.
  if (payload.sub_category === 'ORDER_STATUS') {
    validateOrderStatus(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: 0,
    };
  }

  // A Flow template is a standard template whose only button opens a Meta
  // Flow. Checked before the standard path because that path would reject
  // a template with no buttons at all as fine, and never notice the Flow.
  if (payload.flow) {
    validateFlowTemplate(payload);
    const headerVars =
      payload.header_type === 'text'
        ? extractVariableIndices(payload.header_content ?? '').length
        : 0;
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: headerVars,
    };
  }

  // A carousel has no top-level header or footer, so the standard header
  // and button rules do not apply either.
  if (payload.cards && payload.cards.length > 0) {
    validateCarousel(payload);
    return {
      bodyVarCount: extractVariableIndices(payload.body_text).length,
      headerVarCount: 0,
    };
  }

  // NAMED bodies have their own rules: no index contiguity to check, and
  // the examples are matched by name rather than by position, so the
  // positional sample-count check does not apply.
  if (payload.parameter_format === 'NAMED') {
    const names = validateNamedBody(payload.body_text, payload.named_samples);
    validateFooter(payload.footer_text);
    const headerResult = validateHeader(payload);
    validateButtons(payload.buttons);
    return {
      bodyVarCount: names.length,
      headerVarCount: headerResult.variableCount,
    };
  }

  const bodyVars = validateBody(payload.body_text);
  validateFooter(payload.footer_text);
  const headerResult = validateHeader(payload);
  validateButtons(payload.buttons);
  validateSampleValues(payload, bodyVars.length, headerResult.variableCount);
  return {
    bodyVarCount: bodyVars.length,
    headerVarCount: headerResult.variableCount,
  };
}
