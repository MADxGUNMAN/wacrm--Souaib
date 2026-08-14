/**
 * The canonical template model — Meta's `components` shape, typed.
 *
 * ─── Why this replaces the flat columns ───────────────────────────
 *
 * `message_templates` stores a template as flat columns (header_type,
 * header_content, body_text, footer_text, buttons). That can express one
 * shape of template and no more. A carousel has up to ten CARDS, each
 * with its own header, body and buttons — there is no flat column that
 * holds ten of anything.
 *
 * So as of migration 061 the `components` column holds Meta's own array,
 * verbatim, and is the SOURCE OF TRUTH. It is exactly what we POST on
 * create and exactly what Meta returns on sync, which makes the round
 * trip lossless.
 *
 * ─── The flat columns are a derived cache ─────────────────────────
 *
 * They are kept because `template-row-guard.ts` throws without
 * `body_text` and the broadcast engine reads them on every send.
 * Removing them would stop sending working for every existing customer.
 *
 * THE INVARIANT: never write a flat column by hand. Build a
 * TemplateDefinition, then write `components` and
 * `deriveFlatColumns(definition)` together in the same update. Two
 * sources of truth that can disagree is how you get a preview showing
 * one thing and Meta receiving another.
 *
 * Spec: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components
 */

import type { TemplateButton, TemplateSampleValues } from '@/types';
import { extractVariableIndices } from './template-variables';

// ============================================================
// Enums
// ============================================================

/**
 * Which wizard flow produced this template.
 *
 * Meta has no such field — the type is implied by the component mix —
 * but the editor needs to know which form to reopen, and re-deriving it
 * from components on every read is guesswork we'd rather do once.
 */
export type TemplateType =
  | 'default'
  | 'carousel'
  | 'limited_time_offer'
  | 'order_details'
  | 'order_status'
  | 'authentication'
  | 'calling_permission_request'
  | 'catalogue'
  | 'multi_product'
  /**
   * A template whose call to action opens a WhatsApp Flow. Meta has no
   * distinct API type for this — on the wire it is an ordinary template
   * with a FLOW button — but Meta's wizard treats it as its own starting
   * point, and so must ours: reopening the editor needs to know to show
   * the Flow picker rather than a plain button list.
   */
  | 'flows';

/** `{{1}}` vs `{{order_id}}`. Meta forbids mixing within one template. */
export type ParameterFormat = 'POSITIONAL' | 'NAMED';

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

/** The flat-column spelling, which is lowercase for historical reasons. */
export type FlatHeaderType = 'text' | 'image' | 'video' | 'document' | 'location';

// ============================================================
// Buttons
// ============================================================

/**
 * Every button type Meta accepts.
 *
 * Wider than the legacy `TemplateButton` union in `@/types`, which only
 * covers the four the old UI could build. Sync currently DROPS the rest
 * on the floor; storing them here is what stops that data loss.
 */
export type MetaTemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string[] }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'COPY_CODE'; text: string; example?: string[] }
  /**
   * One-time password button. `otp_type` decides the UX:
   *   COPY_CODE — user taps to copy
   *   ONE_TAP   — autofills via your Android app
   *   ZERO_TAP  — delivered silently to your app (Android only)
   * Meta reports this back as type URL after creation, which is why sync
   * must trust `components` rather than re-deriving the type.
   */
  | {
      type: 'OTP';
      otp_type: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
      text?: string;
      autofill_text?: string;
      package_name?: string;
      signature_hash?: string;
    }
  | {
      type: 'FLOW';
      text: string;
      flow_id?: string;
      flow_name?: string;
      flow_json?: string;
      flow_action?: 'navigate' | 'data_exchange';
      navigate_screen?: string;
    }
  | { type: 'CATALOG'; text: string }
  | { type: 'MPM'; text: string }
  /** Opens an invoice the customer can pay inside WhatsApp. Needs WhatsApp Pay. */
  | { type: 'ORDER_DETAILS'; text: string }
  | { type: 'VOICE_CALL'; text: string };

// ============================================================
// Components
// ============================================================

export type HeaderComponent =
  | { type: 'HEADER'; format: 'TEXT'; text: string; example?: { header_text?: string[] } }
  | {
      type: 'HEADER';
      format: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      example?: { header_handle?: string[]; header_url?: string[] };
    }
  | { type: 'HEADER'; format: 'LOCATION' };

export interface BodyComponent {
  type: 'BODY';
  /**
   * Absent on AUTHENTICATION templates — Meta owns the wording there and
   * generates it from `add_security_recommendation`, so the create payload
   * carries no text at all. See authPresetBody().
   */
  text?: string;
  /** AUTHENTICATION only: appends "For your security, do not share this code." */
  add_security_recommendation?: boolean;
  example?: {
    /** 2D: outer is example sets, inner is one value per variable. */
    body_text?: string[][];
    /** Used when parameter_format is NAMED. */
    body_text_named_params?: { param_name: string; example: string }[];
  };
}

export interface FooterComponent {
  type: 'FOOTER';
  text?: string;
  /**
   * AUTHENTICATION only: renders "This code expires in N minutes." and
   * disables the copy button after that long. 1–90.
   */
  code_expiration_minutes?: number;
}

export interface ButtonsComponent {
  type: 'BUTTONS';
  buttons: MetaTemplateButton[];
}

/** One swipeable card. Meta allows 2–10 per carousel. */
export interface CarouselCard {
  components: (HeaderComponent | BodyComponent | ButtonsComponent)[];
}

export interface CarouselComponent {
  type: 'CAROUSEL';
  cards: CarouselCard[];
}

export interface LimitedTimeOfferComponent {
  type: 'LIMITED_TIME_OFFER';
  limited_time_offer: {
    text: string;
    /** Shows a live countdown when true. Needs an expiry at send time. */
    has_expiration: boolean;
  };
}

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonsComponent
  | CarouselComponent
  | LimitedTimeOfferComponent;

// ============================================================
// The definition
// ============================================================

/**
 * A complete template as the editor and the Meta payload both see it.
 * `components` is ordered exactly as Meta expects it on the wire.
 */
export interface TemplateDefinition {
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language: string;
  template_type: TemplateType;
  parameter_format: ParameterFormat;
  components: TemplateComponent[];
  /** Validity period in seconds. NULL means Meta's default. */
  message_send_ttl_seconds?: number | null;
  /** Set when created from Meta's pre-approved Template Library. */
  library_template_name?: string | null;
}

// ============================================================
// Component lookup
// ============================================================

export function findComponent<T extends TemplateComponent['type']>(
  components: TemplateComponent[],
  type: T,
): Extract<TemplateComponent, { type: T }> | null {
  const hit = components.find((c) => c.type === type);
  return (hit as Extract<TemplateComponent, { type: T }> | undefined) ?? null;
}

export function getHeader(components: TemplateComponent[]): HeaderComponent | null {
  return findComponent(components, 'HEADER');
}

export function getBody(components: TemplateComponent[]): BodyComponent | null {
  return findComponent(components, 'BODY');
}

export function getFooter(components: TemplateComponent[]): FooterComponent | null {
  return findComponent(components, 'FOOTER');
}

export function getButtons(components: TemplateComponent[]): MetaTemplateButton[] {
  return findComponent(components, 'BUTTONS')?.buttons ?? [];
}

export function getCarouselCards(components: TemplateComponent[]): CarouselCard[] {
  return findComponent(components, 'CAROUSEL')?.cards ?? [];
}

// ============================================================
// Authentication preset text
// ============================================================

/**
 * WhatsApp's fixed wording for authentication templates.
 *
 * Meta does not accept body text for this category — it composes the
 * message itself from flags. We reproduce the exact strings locally for
 * two reasons:
 *
 *   1. `body_text` is NOT NULL, and `template-row-guard.ts` throws
 *      without it. An authentication row with an empty body would break
 *      the broadcast engine's guard for the whole account.
 *   2. The preview and the send-time pickers have to show the operator
 *      something truthful. An empty bubble for a template that will very
 *      much contain text is worse than showing nothing.
 *
 * These are the en_US strings. Meta localises them per template
 * language; reproducing every locale is not worth it, so the preview is
 * approximate for non-English templates and says so in the UI.
 */
export function authPresetBody(addSecurityRecommendation?: boolean): string {
  const base = '{{1}} is your verification code.';
  return addSecurityRecommendation
    ? `${base} For your security, do not share this code.`
    : base;
}

export function authPresetFooter(
  codeExpirationMinutes?: number | null,
): string | null {
  if (!codeExpirationMinutes) return null;
  return `This code expires in ${codeExpirationMinutes} minutes.`;
}

/**
 * Resolve a body component's display text, whichever category it is.
 * Authentication bodies have no `text`, so the preset is synthesised.
 */
export function resolveBodyText(body: BodyComponent | null): string {
  if (!body) return '';
  if (typeof body.text === 'string' && body.text.length > 0) return body.text;
  if (body.add_security_recommendation !== undefined) {
    return authPresetBody(body.add_security_recommendation);
  }
  return '';
}

export function resolveFooterText(footer: FooterComponent | null): string | null {
  if (!footer) return null;
  if (footer.text?.trim()) return footer.text;
  return authPresetFooter(footer.code_expiration_minutes);
}

/**
 * Does this carousel need per-card values supplied at send time?
 *
 * False for the common case — fixed product cards whose media is the
 * sample URL already stored on the template and whose text and links are
 * static. Those can be sent with no extra input at all.
 *
 * True as soon as a card's text or URL button carries a variable, or a
 * card has no stored media URL to fall back on. Errs toward "needs input"
 * rather than sending something wrong.
 *
 * Lives here rather than in `template-send-builder.ts` because the
 * carousel EDITOR and the send-time pickers both ask it, and both are
 * client components — importing the send builder into the browser would
 * drag the whole send layer along for one predicate.
 */
export function carouselNeedsSendInput(
  definition: TemplateDefinition,
): boolean {
  const cards = getCarouselCards(definition.components);
  if (cards.length === 0) return false;

  return cards.some((card) => {
    const header = getHeader(card.components);
    const hasMedia =
      header &&
      header.format !== 'TEXT' &&
      header.format !== 'LOCATION' &&
      Boolean(header.example?.header_url?.[0]);
    if (!hasMedia) return true;

    const body = getBody(card.components);
    if (body?.text && extractVariableIndices(body.text).length > 0) return true;

    return getButtons(card.components).some(
      (b) => b.type === 'URL' && extractVariableIndices(b.url).length > 0,
    );
  });
}

// ============================================================
// components → flat columns
// ============================================================

const HEADER_FORMAT_TO_FLAT: Record<HeaderFormat, FlatHeaderType> = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  LOCATION: 'location',
};

/**
 * The subset of button types the legacy `TemplateButton` union models.
 *
 * Only these reach the flat `buttons` column. That is deliberate:
 * `template-send-builder.ts` and `template-components.ts` switch
 * exhaustively over `TemplateButton`, so writing an OTP or FLOW button
 * into that column would put a value there that the type system says is
 * impossible — and the send path would fall through its switch silently.
 *
 * Rich button types live in `components` only, and Phase 6 teaches the
 * send path to read from there.
 */
function toLegacyButton(b: MetaTemplateButton): TemplateButton | null {
  switch (b.type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: b.text };
    case 'URL':
      return {
        type: 'URL',
        text: b.text,
        url: b.url,
        ...(b.example?.[0] ? { example: b.example[0] } : {}),
      };
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
    case 'COPY_CODE':
      return { type: 'COPY_CODE', text: b.text, example: b.example?.[0] ?? '' };
    case 'VOICE_CALL':
      // Safe in the flat cache: it needs no send-time parameter, so the
      // send path's switch handles it rather than falling through.
      return { type: 'VOICE_CALL', text: b.text };
    default:
      return null;
  }
}

export interface FlatTemplateColumns {
  header_type: FlatHeaderType | null;
  header_content: string | null;
  header_media_url: string | null;
  header_handle: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: TemplateButton[] | null;
  sample_values: TemplateSampleValues | null;
}

/**
 * Project a definition down onto the legacy flat columns.
 *
 * Lossy by design — a carousel's per-card headers and buttons have
 * nowhere to go here. That is fine: `components` retains everything, and
 * these columns exist only to keep `isMessageTemplate` and the current
 * send path working. Never treat the result as the template.
 */
export function deriveFlatColumns(
  definition: TemplateDefinition,
): FlatTemplateColumns {
  const { components } = definition;
  const header = getHeader(components);
  const body = getBody(components);
  const footer = getFooter(components);
  const buttons = getButtons(components);

  const legacyButtons = buttons
    .map(toLegacyButton)
    .filter((b): b is TemplateButton => b !== null);

  const sample: TemplateSampleValues = {};
  const bodyExample = body?.example?.body_text?.[0];
  if (bodyExample?.length) sample.body = bodyExample;
  if (header && header.format === 'TEXT' && header.example?.header_text?.length) {
    sample.header = header.example.header_text;
  }

  return {
    header_type: header ? HEADER_FORMAT_TO_FLAT[header.format] : null,
    header_content:
      header && header.format === 'TEXT' ? header.text : null,
    header_media_url:
      header && header.format !== 'TEXT' && header.format !== 'LOCATION'
        ? header.example?.header_url?.[0] ?? null
        : null,
    header_handle:
      header && header.format !== 'TEXT' && header.format !== 'LOCATION'
        ? header.example?.header_handle?.[0] ?? null
        : null,
    // body_text is NOT NULL in the schema and template-row-guard throws
    // without it. resolveBodyText synthesises Meta's preset wording for
    // AUTHENTICATION templates, whose components carry no text at all —
    // without that, every auth row would trip the guard and take the
    // account's broadcasts down with it.
    body_text: resolveBodyText(body),
    footer_text: resolveFooterText(footer),
    buttons: legacyButtons.length > 0 ? legacyButtons : null,
    sample_values: Object.keys(sample).length > 0 ? sample : null,
  };
}

// ============================================================
// row → definition
// ============================================================

/** The row fields this module needs. Kept narrow so tests can fake it. */
export interface TemplateRowLike {
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language?: string | null;
  template_type?: string | null;
  parameter_format?: string | null;
  components?: unknown;
  message_send_ttl_seconds?: number | null;
  library_template_name?: string | null;
  // Legacy flat columns, for rows written before migration 061.
  header_type?: string | null;
  header_content?: string | null;
  header_media_url?: string | null;
  header_handle?: string | null;
  body_text?: string | null;
  footer_text?: string | null;
  buttons?: unknown;
  sample_values?: unknown;
}

function isTemplateType(v: unknown): v is TemplateType {
  return (
    typeof v === 'string' &&
    [
      'default',
      'carousel',
      'limited_time_offer',
      'order_details',
      'order_status',
      'authentication',
      'calling_permission_request',
      'catalogue',
      'multi_product',
      'flows',
    ].includes(v)
  );
}

/**
 * Rebuild the components array from the legacy flat columns.
 *
 * Only used for rows that predate migration 061 and somehow escaped its
 * backfill (a row restored from an old dump, say). Mirrors the SQL
 * backfill exactly, in canonical HEADER → BODY → FOOTER → BUTTONS order.
 */
export function componentsFromFlatColumns(
  row: TemplateRowLike,
): TemplateComponent[] {
  const components: TemplateComponent[] = [];
  const samples = (row.sample_values ?? {}) as TemplateSampleValues;

  const flatHeader = row.header_type?.toLowerCase();
  if (flatHeader === 'text' && row.header_content) {
    components.push({
      type: 'HEADER',
      format: 'TEXT',
      text: row.header_content,
      ...(samples.header?.length
        ? { example: { header_text: samples.header } }
        : {}),
    });
  } else if (
    flatHeader === 'image' ||
    flatHeader === 'video' ||
    flatHeader === 'document'
  ) {
    const format = flatHeader.toUpperCase() as 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    // Prefer the handle: it's what Meta accepts at create time.
    const example = row.header_handle
      ? { header_handle: [row.header_handle] }
      : row.header_media_url
        ? { header_url: [row.header_media_url] }
        : undefined;
    components.push({ type: 'HEADER', format, ...(example ? { example } : {}) });
  } else if (flatHeader === 'location') {
    components.push({ type: 'HEADER', format: 'LOCATION' });
  }

  components.push({
    type: 'BODY',
    text: row.body_text ?? '',
    ...(samples.body?.length ? { example: { body_text: [samples.body] } } : {}),
  });

  if (row.footer_text?.trim()) {
    components.push({ type: 'FOOTER', text: row.footer_text });
  }

  const legacyButtons = Array.isArray(row.buttons)
    ? (row.buttons as MetaTemplateButton[])
    : [];
  if (legacyButtons.length > 0) {
    components.push({ type: 'BUTTONS', buttons: legacyButtons });
  }

  return components;
}

/**
 * Read a database row as a TemplateDefinition.
 *
 * Prefers `components`. Falls back to rebuilding from the flat columns
 * only when it is missing or empty, so a row that predates migration 061
 * still renders instead of appearing blank.
 */
export function definitionFromRow(row: TemplateRowLike): TemplateDefinition {
  const stored = Array.isArray(row.components)
    ? (row.components as TemplateComponent[])
    : [];
  const components =
    stored.length > 0 ? stored : componentsFromFlatColumns(row);

  return {
    name: row.name,
    category: row.category,
    language: row.language ?? 'en_US',
    template_type: isTemplateType(row.template_type)
      ? row.template_type
      : 'default',
    parameter_format: row.parameter_format === 'NAMED' ? 'NAMED' : 'POSITIONAL',
    components,
    message_send_ttl_seconds: row.message_send_ttl_seconds ?? null,
    library_template_name: row.library_template_name ?? null,
  };
}

// ============================================================
// Persistence helper
// ============================================================

/**
 * The columns to write for a template, flat cache included.
 *
 * Every write path goes through this so `components` and the flat
 * columns can never drift. Callers add tenancy (`account_id`,
 * `user_id`) and lifecycle (`status`, `meta_template_id`) fields.
 */
export function buildTemplateColumns(definition: TemplateDefinition) {
  return {
    name: definition.name,
    category: definition.category,
    language: definition.language,
    template_type: definition.template_type,
    parameter_format: definition.parameter_format,
    components: definition.components,
    message_send_ttl_seconds: definition.message_send_ttl_seconds ?? null,
    library_template_name: definition.library_template_name ?? null,
    ...deriveFlatColumns(definition),
  };
}
