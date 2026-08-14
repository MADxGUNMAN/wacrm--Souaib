/**
 * Meta's template limits, as plain data.
 *
 * ─── Why these are not in template-validators.ts ──────────────────
 *
 * Three client components need these numbers for `maxLength` attributes
 * and character counters. They do NOT need the validator functions, which
 * only ever run server-side before the Meta submit call.
 *
 * Keeping the constants inside the validator module meant every form that
 * wanted a character count dragged the whole server-side validation layer
 * into the browser bundle. That is the reason for the split, and it is
 * sufficient on its own.
 *
 * Historical note, so nobody re-derives the wrong lesson: this split was
 * made while chasing a runtime "undefined constant" error that looked
 * like a bundler mis-split. It was NOT — the real cause was the browser
 * caching a Turbopack dev chunk whose filename is reused across rebuilds.
 * See the dev-only Cache-Control rule in next.config.ts. Moving these
 * constants did not fix that, and moving them back would not cause it.
 *
 * `template-validators.ts` imports from here, so the numbers used to
 * validate are by construction the numbers shown in the UI.
 */

export const TEMPLATE_LIMITS = {
  bodyMaxLength: 1024,
  footerMaxLength: 60,
  headerTextMaxLength: 60,
  buttonTextMaxLength: 25,
  maxButtonsTotal: 10,
  maxUrlButtons: 2,
  maxPhoneButtons: 1,
  maxCopyCodeButtons: 1,
  /** Meta: lowercase a-z, digits, underscore. Up to 512 chars. */
  nameRegex: /^[a-z0-9_]{1,512}$/,
} as const;

/**
 * CAROUSEL limits.
 *
 * The uniformity rules are Meta's, not ours, and they are unusually
 * strict: every card must have the SAME component shape — same header
 * format, same button types in the same order — and if one card has body
 * text then all of them must, so the cards render at equal heights.
 *
 * The card count is also frozen at approval: a template approved with 3
 * cards can only ever send 3 cards. Sending a different number returns
 * Meta error #132012 with the misleading message "header component
 * parameter should not be empty".
 */
export const CAROUSEL_LIMITS = {
  minCards: 2,
  maxCards: 10,
  /** Tighter than the 1024 of a normal body. */
  cardBodyMaxLength: 160,
  maxButtonsPerCard: 2,
  buttonTextMaxLength: 25,
} as const;

/**
 * LIMITED-TIME OFFER limits.
 *
 * Several are TIGHTER than the equivalents on a normal template, which is
 * the trap: a body that is fine elsewhere is rejected here at 601
 * characters. Footers are not supported at all.
 *
 * Also worth knowing, and surfaced in the editor: WhatsApp Web and
 * Desktop cannot render these. Those users see a note saying a message
 * arrived that they cannot view.
 */
export const LTO_LIMITS = {
  /** 600, not the usual 1024. */
  bodyMaxLength: 600,
  /** The little "Expiring offer!" label. Very short. */
  offerTextMaxLength: 16,
  offerCodeMaxLength: 15,
  urlButtonTextMaxLength: 25,
} as const;

/** AUTHENTICATION-only limits. See template-components.ts for the shape. */
export const AUTH_LIMITS = {
  /** Meta's window for the expiry warning. */
  minExpiryMinutes: 1,
  maxExpiryMinutes: 90,
  /**
   * Meta's window for an authentication template's time-to-live. Narrower
   * than other categories, which allow up to 30 days.
   */
  minTtlSeconds: 60,
  maxTtlSeconds: 600,
  buttonTextMaxLength: 25,
} as const;

/**
 * FLOW-button limits.
 *
 * ─── Read this before touching Flow templates ─────────────────────
 *
 * A FLOW button opens one of META'S WhatsApp Flows — a multi-screen form
 * that runs inside WhatsApp, built in Meta's Flow Builder and stored on
 * the WhatsApp Business Account. It is NOT this app's own /flows feature,
 * which is an in-house chatbot graph sending ordinary interactive
 * messages. A template button can only reference a Meta Flow, by its Flow
 * ID, so there is nothing about the internal builder to "wire up".
 *
 * Two rules that produce confusing rejections when broken:
 *
 *   - The Flow must be PUBLISHED. A DRAFT Flow can only be sent in test
 *     mode, which template sends do not use — so a template referencing a
 *     draft is approved and then fails on every send.
 *   - `navigate_screen` is REQUIRED when flow_action is 'navigate' and
 *     must be omitted otherwise. It names the first screen in the Flow
 *     JSON, not the Flow.
 *
 * https://developers.facebook.com/docs/whatsapp/flows/reference/flowsapi
 */
export const FLOW_LIMITS = {
  buttonTextMaxLength: 25,
  /** Meta allows exactly one FLOW button per template. */
  maxFlowButtons: 1,
  /** Only a Flow in this status can be sent from a template. */
  sendableStatus: 'PUBLISHED',
} as const;

/**
 * Message validity period (`message_send_ttl_seconds`).
 *
 * How long Meta keeps retrying before it gives up and drops the message.
 * The allowed WINDOW DIFFERS BY CATEGORY, which is the trap: 60 seconds
 * is valid on a utility template and rejected on a marketing one.
 *
 * `-1` is a sentinel meaning "30 days" and is valid for every category —
 * migration 063 exists because an earlier CHECK constraint rejected it,
 * which broke "Sync from Meta" for any template that carried it.
 *
 * Authentication's window lives in AUTH_LIMITS and is narrower still;
 * Meta recommends setting it at or below the code expiry so a customer
 * never receives a code that has already stopped working.
 */
export const TTL_LIMITS = {
  /** Meta's sentinel for "30 days". Valid everywhere. */
  defaultSentinel: -1,
  Utility: { min: 30, max: 43_200 },
  Marketing: { min: 43_200, max: 2_592_000 },
} as const;

/**
 * VOICE_CALL button.
 *
 * Lets the customer place a WhatsApp voice call to the business from the
 * template. Needs WhatsApp Business Calling ENABLED ON THE PHONE NUMBER
 * in WhatsApp Manager — the template will be approved either way, and the
 * button simply will not work until it is, so the editor says so.
 */
export const VOICE_CALL_LIMITS = {
  buttonTextMaxLength: 25,
  /** Meta allows one per template. */
  maxVoiceCallButtons: 1,
} as const;

/**
 * CATALOG and MULTI-PRODUCT (MPM) limits.
 *
 * Both need an ecommerce catalogue with inventory linked to the WhatsApp
 * Business Account — that is a Meta Commerce Manager setup step, not
 * something this app can do, and without it Meta refuses the template.
 *
 * The difference between them: a CATALOG button opens your whole
 * catalogue, so it needs nothing at send time. An MPM button opens a
 * curated list, so every send names the exact products and the sections
 * they sit in.
 */
export const CATALOGUE_LIMITS = {
  buttonTextMaxLength: 25,
  /** Meta allows one catalogue button per template. */
  maxCatalogButtons: 1,
} as const;

export const MPM_LIMITS = {
  buttonTextMaxLength: 25,
  maxSections: 10,
  /** Across ALL sections, not per section. */
  maxProductsTotal: 30,
  sectionTitleMaxLength: 24,
} as const;

/**
 * ORDER DETAILS limits.
 *
 * An order-details message is an invoice the customer can pay inside
 * WhatsApp, so it needs WhatsApp Pay set up and approved on the WABA.
 *
 * Amounts use Meta's OFFSET-AND-VALUE form, which is the part everyone
 * gets wrong: `{ offset: 100, value: 250 }` means 250/100 = 2.50. The
 * offset is the number of minor units in one major unit, so 100 for
 * rupees and paise. Sending 250 with no offset would charge 250 times too
 * much, which is why this app computes it rather than accepting a raw
 * value.
 */
export const ORDER_DETAILS_LIMITS = {
  buttonTextMaxLength: 25,
  /** Minor units per major unit. 100 = paise in a rupee, cents in a dollar. */
  amountOffset: 100,
  maxItems: 30,
} as const;
