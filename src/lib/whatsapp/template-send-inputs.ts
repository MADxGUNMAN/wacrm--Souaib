/**
 * What does THIS template need from the operator before it can be sent?
 *
 * ─── Why a plan object rather than per-form logic ──────────────────
 *
 * Three places collect send-time values: the inbox template picker, the
 * broadcast personalize step, and (soon) anything else that sends. Each
 * one had grown its own idea of what a template needs — the inbox picker
 * read the flat columns for body/header/button slots, and the broadcast
 * step read only `body_text` plus one media URL. Neither could see a
 * carousel's cards or a limited-time offer's expiry, because neither of
 * those exists in the flat columns at all.
 *
 * Adding two more shapes to two divergent forms would have meant writing
 * the same rules twice and getting them subtly different — which is the
 * failure mode that had a template sendable in one picker and blocked in
 * the other. So the rules live here once, as data, and the forms render
 * whatever the plan says.
 *
 * ─── The contract ─────────────────────────────────────────────────
 *
 * The plan mirrors `SendTimeParams` in `template-send-builder.ts`
 * field for field. A form that fills every slot the plan lists produces
 * params the builder accepts; `missingSendValues` is the same check the
 * builder performs, run early so the operator sees a disabled button with
 * a reason instead of a throw after they hit send.
 *
 * PURE MODULE — client components import this. No server-only imports,
 * so it must never reach into the send builder, the validators or
 * meta-api. See the note in `template-validators.ts` about the bundle
 * split that this convention exists to prevent.
 */

import {
  definitionFromRow,
  findComponent,
  getBody,
  getButtons,
  getCarouselCards,
  getHeader,
  type TemplateRowLike,
} from './template-definition';
import {
  extractNamedParams,
  extractVariableIndices,
} from './template-variables';

/** A URL button whose link carries a `{{1}}` suffix to fill in. */
export interface UrlButtonSlot {
  /** Index within the button list this slot belongs to (template or card). */
  index: number;
  text: string;
  url: string;
}

/** A COPY_CODE button. Has a default, so it is optional to override. */
export interface CopyCodeSlot {
  index: number;
  text: string;
  /** The approved example code, used when the operator types nothing. */
  defaultCode?: string;
}

export interface MediaSlot {
  format: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  /** Stored sample URL. When absent the operator MUST supply one. */
  defaultUrl?: string;
}

export interface CardSendPlan {
  /** Zero-based, and authoritative: card order is frozen at approval. */
  cardIndex: number;
  media: MediaSlot;
  /** The card's text, for labelling the inputs. */
  bodyText?: string;
  bodyVarCount: number;
  urlButtons: UrlButtonSlot[];
}

export interface OfferSendPlan {
  /** The offer label as approved, e.g. "10% off your next order". */
  text: string;
  /** Whether the countdown is displayed. The expiry is required either way. */
  hasExpiration: boolean;
  /** The copy-code button, which always exists on a valid offer. */
  code: CopyCodeSlot | null;
}

/**
 * The order states Meta accepts on an order-status send.
 *
 * Duplicated from `template-send-builder.ts` rather than imported: that
 * module is server-only and this one is imported by the pickers. The
 * builder's copy is the one Meta sees; a test asserts the two agree, which
 * is cheaper than dragging the send layer into the browser.
 */
export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending — not paid yet' },
  { value: 'processing', label: 'Processing — paid, being fulfilled' },
  { value: 'partially_shipped', label: 'Partially shipped' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
] as const;

export type OrderStatusOption = (typeof ORDER_STATUS_OPTIONS)[number]['value'];

export interface TemplateSendPlan {
  /** Number of `{{n}}` in the top-level body. Zero for a NAMED template. */
  bodyVarCount: number;
  /**
   * Parameter names for a NAMED-format body, in the order they appear in
   * the text — so the form's inputs read in the same order as the sentence.
   * Empty for a positional template.
   */
  bodyParamNames: string[];
  /** Number of `{{n}}` in a TEXT header. Meta allows at most one. */
  headerVarCount: number;
  /** Present for IMAGE/VIDEO/DOCUMENT headers, which Meta requires on every send. */
  headerMedia: MediaSlot | null;
  /**
   * True for a LOCATION header. The template stores no coordinates, so all
   * four pin fields are required on every send.
   */
  needsHeaderLocation: boolean;
  urlButtons: UrlButtonSlot[];
  copyCodeButtons: CopyCodeSlot[];
  /** Non-null for a limited-time offer, which needs a per-message expiry. */
  offer: OfferSendPlan | null;
  /**
   * True for an order-status template, which needs the reference id of the
   * order it updates plus the new status. Neither can be defaulted.
   */
  isOrderStatus: boolean;
  /** One entry per approved card. Empty for non-carousels. */
  cards: CardSendPlan[];
  /**
   * Authentication templates take one value — the code — and nothing
   * else. Meta owns the wording, so there are no body variables to show
   * even though the synthesised `body_text` contains `{{1}}`.
   */
  isAuthentication: boolean;
  /** 'catalog' | 'mpm' | 'order_details' when the template carries one of those buttons. */
  commerce: 'catalog' | 'mpm' | 'order_details' | null;
  /** True when the operator has nothing to fill in and we can send straight away. */
  needsNoInput: boolean;
}

/**
 * Narrow a header to the media variants.
 *
 * Written against the header rather than its `format` string on purpose:
 * `HeaderComponent` is a discriminated union and only the media members
 * carry `example`, so a guard on the string alone type-checks but leaves
 * `example` inaccessible.
 */
function asMediaHeader(
  header: ReturnType<typeof getHeader>,
): Extract<
  NonNullable<ReturnType<typeof getHeader>>,
  { format: 'IMAGE' | 'VIDEO' | 'DOCUMENT' }
> | null {
  if (!header) return null;
  if (header.format === 'TEXT' || header.format === 'LOCATION') return null;
  return header;
}

function urlSlots(
  buttons: ReturnType<typeof getButtons>,
): UrlButtonSlot[] {
  const out: UrlButtonSlot[] = [];
  buttons.forEach((b, index) => {
    // A static URL is already baked into the approved template; only a
    // variable suffix needs a value.
    if (b.type === 'URL' && extractVariableIndices(b.url).length > 0) {
      out.push({ index, text: b.text, url: b.url });
    }
  });
  return out;
}

function copyCodeSlots(
  buttons: ReturnType<typeof getButtons>,
): CopyCodeSlot[] {
  const out: CopyCodeSlot[] = [];
  buttons.forEach((b, index) => {
    if (b.type === 'COPY_CODE') {
      out.push({ index, text: b.text, defaultCode: b.example?.[0] });
    }
  });
  return out;
}

/**
 * Read a template row and describe what a send needs.
 *
 * Reads `components` (via definitionFromRow, which falls back to the flat
 * columns for pre-061 rows) rather than the flat columns directly —
 * carousel cards and the offer strip exist nowhere else.
 */
export function buildSendPlan(row: TemplateRowLike): TemplateSendPlan {
  const definition = definitionFromRow(row);
  const { components } = definition;

  const isAuthentication = definition.category === 'Authentication';

  const header = getHeader(components);
  const mediaHeader = asMediaHeader(header);
  const headerMedia: MediaSlot | null = mediaHeader
    ? {
        format: mediaHeader.format,
        // `header_handle` is deliberately ignored: it is a creation-time
        // upload handle and Meta rejects it as a send-time media id.
        defaultUrl: mediaHeader.example?.header_url?.[0],
      }
    : null;

  const headerVarCount =
    header && header.format === 'TEXT'
      ? extractVariableIndices(header.text).length
      : 0;

  const body = getBody(components);
  const isNamed = definition.parameter_format === 'NAMED';
  const bodyVarCount =
    isAuthentication || isNamed
      ? 0
      : extractVariableIndices(body?.text ?? '').length;
  const bodyParamNames =
    isNamed && !isAuthentication ? extractNamedParams(body?.text ?? '') : [];

  const buttons = getButtons(components);
  const offerComponent = findComponent(components, 'LIMITED_TIME_OFFER');
  const codeSlots = copyCodeSlots(buttons);

  const offer: OfferSendPlan | null = offerComponent
    ? {
        text: offerComponent.limited_time_offer.text,
        hasExpiration: offerComponent.limited_time_offer.has_expiration,
        code: codeSlots[0] ?? null,
      }
    : null;

  const cards: CardSendPlan[] = getCarouselCards(components).map(
    (card, cardIndex) => {
      const cardHeader = asMediaHeader(getHeader(card.components));
      const cardBody = getBody(card.components);
      return {
        cardIndex,
        media: {
          // validateCarousel guarantees a media header on every card, so
          // IMAGE is a safe label fallback for a malformed legacy row
          // rather than a reason to throw inside a picker.
          format: cardHeader?.format ?? 'IMAGE',
          defaultUrl: cardHeader?.example?.header_url?.[0],
        },
        bodyText: cardBody?.text,
        bodyVarCount: extractVariableIndices(cardBody?.text ?? '').length,
        urlButtons: urlSlots(getButtons(card.components)),
      };
    },
  );

  const plan: Omit<TemplateSendPlan, 'needsNoInput'> = {
    bodyVarCount,
    bodyParamNames,
    headerVarCount,
    headerMedia,
    urlButtons: urlSlots(buttons),
    // The offer's copy-code button is presented inside `offer`, not twice.
    copyCodeButtons: offer ? [] : codeSlots,
    offer,
    // Read from the row's type, not the components: an order-status
    // template's components are indistinguishable from a plain one's.
    isOrderStatus: definition.template_type === 'order_status',
    needsHeaderLocation: header?.format === 'LOCATION',
    // Read from the buttons rather than template_type so a row synced from
    // Meta is recognised too.
    commerce: buttons.some((b) => b.type === 'MPM')
      ? 'mpm'
      : buttons.some((b) => b.type === 'ORDER_DETAILS')
        ? 'order_details'
        : buttons.some((b) => b.type === 'CATALOG')
          ? 'catalog'
          : null,
    cards,
    isAuthentication,
  };

  return { ...plan, needsNoInput: planNeedsNoInput(plan) };
}

function planNeedsNoInput(
  plan: Omit<TemplateSendPlan, 'needsNoInput'>,
): boolean {
  // Authentication always needs the code.
  if (plan.isAuthentication) return false;
  // An offer always needs an expiry — there is no defensible default.
  if (plan.offer) return false;
  // An order update always needs the order and the new status.
  if (plan.isOrderStatus) return false;
  // A location header has no stored pin to fall back on.
  if (plan.needsHeaderLocation) return false;
  // An MPM template stores no products and an invoice stores no order, so
  // neither can ever be sent without input. A catalogue button CAN — the
  // thumbnail is optional and Meta falls back to the first catalogue item.
  if (plan.commerce === 'mpm' || plan.commerce === 'order_details') return false;
  if (plan.bodyVarCount > 0) return false;
  if (plan.bodyParamNames.length > 0) return false;
  if (plan.headerVarCount > 0) return false;
  if (plan.urlButtons.length > 0) return false;
  // A media header with a stored sample URL rides along on its own; one
  // without needs the operator to supply a link.
  if (plan.headerMedia && !plan.headerMedia.defaultUrl) return false;
  return plan.cards.every(
    (card) =>
      card.bodyVarCount === 0 &&
      card.urlButtons.length === 0 &&
      Boolean(card.media.defaultUrl),
  );
}

// ============================================================
// Completeness
// ============================================================

// ============================================================
// datetime-local <-> epoch ms
// ============================================================

/**
 * `<input type="datetime-local">` speaks "YYYY-MM-DDTHH:mm" in the
 * BROWSER'S timezone; Meta wants epoch milliseconds. `new Date(str)` on
 * that format parses as local time, which is what the operator means —
 * they set the deadline by their own clock.
 *
 * Lives in this pure module rather than beside the input component
 * because the broadcast send hook needs the same conversion, and a hook
 * importing a function out of a component is a dependency pointing the
 * wrong way.
 */
export function localInputToMs(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/** The inverse, for seeding a field from an existing value. */
export function msToLocalInput(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Now + n hours as a datetime-local string. A starting point, not a default. */
export function defaultOfferExpiryLocal(hoursFromNow = 24): string {
  return msToLocalInput(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

/** The map pin for a LOCATION header. All four fields are required. */
export interface HeaderLocationValues {
  latitude: string;
  longitude: string;
  name: string;
  address: string;
}

export const EMPTY_HEADER_LOCATION: HeaderLocationValues = {
  latitude: '',
  longitude: '',
  name: '',
  address: '',
};

/** Per-card values an operator supplies at send time. */
export interface CardValues {
  headerMediaUrl?: string;
  body?: string[];
  buttonParams?: Record<number, string>;
}

/**
 * Send-time values that are the SAME for every recipient of a broadcast.
 *
 * Body variables are deliberately absent: those resolve per contact from
 * the field mappings. An offer's deadline and a carousel card's image are
 * broadcast-wide by nature — there is one countdown for the whole send.
 */
export interface BroadcastSendExtras {
  /** datetime-local string. Converted to epoch ms at send time. */
  offerExpiryLocal: string;
  cards: CardValues[];
  /** Button overrides (the offer code), keyed by button index. */
  buttonParams: Record<number, string>;
  /**
   * The map pin for a LOCATION header. One pin for the whole broadcast —
   * per-recipient addresses would need a per-contact field, which is what
   * sending from a conversation is for.
   */
  headerLocation?: HeaderLocationValues;
}

export const EMPTY_SEND_EXTRAS: BroadcastSendExtras = {
  offerExpiryLocal: '',
  cards: [],
  buttonParams: {},
};

/** The values a form collects. Mirrors SendTimeParams, minus media ids. */
export interface SendValues {
  body?: string[];
  /** NAMED format: values keyed by parameter name. */
  namedBody?: Record<string, string>;
  headerText?: string;
  headerMediaUrl?: string;
  headerLocation?: HeaderLocationValues;
  buttonParams?: Record<number, string>;
  offerExpiresAtMs?: number;
  cards?: CardValues[];
  orderReferenceId?: string;
  orderStatus?: OrderStatusOption | '';
  orderStatusDescription?: string;
  catalogThumbnailProductId?: string;
  mpm?: MpmValues;
  orderDetails?: OrderDetailsValues;
}

/** Curated product list for a multi-product send. */
export interface MpmValues {
  thumbnailProductId: string;
  sections: { title: string; productIds: string }[];
}

export const EMPTY_MPM: MpmValues = {
  thumbnailProductId: '',
  sections: [{ title: '', productIds: '' }],
};

/**
 * The invoice for an order-details send, as typed.
 *
 * Amounts are strings because they come from text inputs; they are parsed
 * once, at the boundary, rather than being coerced in several places.
 */
export interface OrderDetailsValues {
  referenceId: string;
  currency: string;
  goodsType: 'physical-goods' | 'digital-goods';
  items: { name: string; amount: string; quantity: string; retailerId: string }[];
  taxAmount: string;
  shippingAmount: string;
  discountAmount: string;
  paymentConfiguration: string;
}

export const EMPTY_ORDER_DETAILS: OrderDetailsValues = {
  referenceId: '',
  currency: 'INR',
  goodsType: 'physical-goods',
  items: [{ name: '', amount: '', quantity: '1', retailerId: '' }],
  taxAmount: '',
  shippingAmount: '',
  discountAmount: '',
  paymentConfiguration: '',
};

/** Sum the invoice as the send builder will, so the form can show the total. */
export function orderDetailsTotal(values: OrderDetailsValues): number {
  const subtotal = values.items.reduce((sum, i) => {
    const amount = Number.parseFloat(i.amount);
    const qty = Number.parseInt(i.quantity, 10);
    if (!Number.isFinite(amount) || !Number.isFinite(qty)) return sum;
    return sum + amount * qty;
  }, 0);
  const num = (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return (
    subtotal + num(values.taxAmount) + num(values.shippingAmount) - num(values.discountAmount)
  );
}

function filled(v: string | undefined): boolean {
  return Boolean(v && v.trim().length > 0);
}

/**
 * Which required values are still missing, phrased for the operator.
 *
 * Deliberately the same set of rules the send builder throws on, checked
 * before the request rather than after: the builder's message arrives as
 * a failed send in a list of results, which is a much worse place to read
 * "Card 3 needs a media link" than next to the field.
 *
 * Returns an empty array when the send can go ahead.
 */
export function missingSendValues(
  plan: TemplateSendPlan,
  values: SendValues,
): string[] {
  const missing: string[] = [];

  if (plan.isAuthentication) {
    if (!filled(values.body?.[0])) missing.push('The one-time code');
    return missing;
  }

  for (let i = 0; i < plan.bodyVarCount; i++) {
    if (!filled(values.body?.[i])) missing.push(`Message variable {{${i + 1}}}`);
  }

  for (const name of plan.bodyParamNames) {
    if (!filled(values.namedBody?.[name])) {
      missing.push(`Message variable {{${name}}}`);
    }
  }

  if (plan.headerVarCount > 0 && !filled(values.headerText)) {
    missing.push('The header text');
  }

  if (plan.headerMedia) {
    if (!filled(values.headerMediaUrl) && !plan.headerMedia.defaultUrl) {
      missing.push(`A ${plan.headerMedia.format.toLowerCase()} for the header`);
    }
  }

  if (plan.needsHeaderLocation) {
    const loc = values.headerLocation;
    // Meta rejects a partial location object, so each field is named
    // rather than reported as one vague "location missing".
    const labels: Record<string, string> = {
      latitude: 'the latitude',
      longitude: 'the longitude',
      name: 'the place name',
      address: 'the address',
    };
    for (const key of ['latitude', 'longitude', 'name', 'address'] as const) {
      if (!filled(loc?.[key])) {
        missing.push(`The map pin: ${labels[key]}`);
      }
    }
  }

  for (const slot of plan.urlButtons) {
    if (!filled(values.buttonParams?.[slot.index])) {
      missing.push(`The link value for the "${slot.text}" button`);
    }
  }

  if (plan.commerce === 'mpm') {
    const sections = (values.mpm?.sections ?? []).map((s) => ({
      title: s.title.trim(),
      ids: s.productIds
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    }));
    const withProducts = sections.filter((s) => s.ids.length > 0);
    if (withProducts.length === 0) {
      missing.push('At least one product to show');
    }
    withProducts.forEach((s, i) => {
      if (!s.title) missing.push(`A title for section ${i + 1}`);
    });
    const total = withProducts.reduce((n, s) => n + s.ids.length, 0);
    if (total > 30) {
      missing.push(`No more than 30 products in total (you have ${total})`);
    }
  }

  if (plan.commerce === 'order_details') {
    const order = values.orderDetails;
    if (!filled(order?.referenceId)) missing.push('Your order reference id');
    if (!filled(order?.currency)) missing.push('The currency');
    const items = (order?.items ?? []).filter(
      (i) =>
        i.name.trim() !== '' &&
        Number.isFinite(Number.parseFloat(i.amount)) &&
        Number.parseInt(i.quantity, 10) > 0,
    );
    if (items.length === 0) {
      missing.push('At least one item with a name, price and quantity');
    } else if (order && orderDetailsTotal(order) <= 0) {
      missing.push('A total above zero (check the discount)');
    }
  }

  if (plan.isOrderStatus) {
    if (!filled(values.orderReferenceId)) {
      missing.push('The reference id of the order being updated');
    }
    if (!filled(values.orderStatus)) {
      missing.push('The new order status');
    }
  }

  if (plan.offer) {
    const expiry = values.offerExpiresAtMs;
    if (!expiry || !Number.isFinite(expiry)) {
      missing.push('The offer expiry date and time');
    } else if (expiry <= Date.now()) {
      // The builder refuses this too. Caught here so the operator is not
      // told "sent" for an offer that is already dead on arrival.
      missing.push('An offer expiry in the future (the one set has passed)');
    }
    if (plan.offer.code && !filled(values.buttonParams?.[plan.offer.code.index])) {
      if (!plan.offer.code.defaultCode) missing.push('The offer code');
    }
  }

  for (const slot of plan.copyCodeButtons) {
    if (
      !filled(values.buttonParams?.[slot.index]) &&
      !slot.defaultCode
    ) {
      missing.push(`The code for the "${slot.text}" button`);
    }
  }

  plan.cards.forEach((card) => {
    const given = values.cards?.[card.cardIndex] ?? {};
    const label = `Card ${card.cardIndex + 1}`;
    if (!filled(given.headerMediaUrl) && !card.media.defaultUrl) {
      missing.push(`${label}: a ${card.media.format.toLowerCase()} link`);
    }
    for (let i = 0; i < card.bodyVarCount; i++) {
      if (!filled(given.body?.[i])) {
        missing.push(`${label}: variable {{${i + 1}}}`);
      }
    }
    for (const btn of card.urlButtons) {
      if (!filled(given.buttonParams?.[btn.index])) {
        missing.push(`${label}: link value for "${btn.text}"`);
      }
    }
  });

  return missing;
}
