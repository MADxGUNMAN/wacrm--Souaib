/**
 * The category → template-type catalogue that drives step 1 of the
 * template wizard.
 *
 * ─── Why this is hardcoded rather than CMS-driven ─────────────────
 *
 * Everything in here describes META'S product, not ours: which template
 * types Meta accepts, what each one is for, and which areas of it Meta
 * lets you customise. An operator cannot change any of it by editing a
 * field — if Meta adds a type, code has to be written to support it
 * anyway. Making it editable would be a control that looks like it does
 * something and doesn't.
 *
 * Contrast with the pricing page copy, which is genuinely ours to word
 * and therefore lives in the database.
 *
 * ─── Availability ─────────────────────────────────────────────────
 *
 * `available: false` types are shown but not selectable. They are listed
 * because the point of this screen is to mirror Meta's, and hiding them
 * would misrepresent what WhatsApp can do — but they are visibly
 * disabled rather than selectable-and-broken.
 *
 * Meta's own type lists differ per category, which is why this is keyed
 * by category rather than being one flat list: Marketing offers
 * Catalogue, Utility offers Order status, and Authentication has no type
 * step at all.
 */

import type { TemplateType } from './template-definition';

export type TemplateCategory = 'Marketing' | 'Utility' | 'Authentication';

export interface TemplateTypeOption {
  /** Maps to message_templates.template_type. */
  type: TemplateType;
  title: string;
  /** The one-liner under the title, as Meta words it. */
  description: string;
  /**
   * Preview artwork shown in the right-hand rail when selected.
   * Files live in /public/template-types.
   */
  image: string;
  /** True for the animated assets — they must not be optimised. */
  animated?: boolean;
  /** Plain-language list of what this type suits. */
  goodFor: string;
  /** Which parts of the message the operator can edit. */
  customisable: string;
  /**
   * Whether the editor can actually build this yet. Disabled options
   * carry `unavailableReason` so the UI never shows a dead control
   * without saying why.
   */
  available: boolean;
  unavailableReason?: string;
}

const ORDER_DETAILS: Omit<TemplateTypeOption, 'description'> = {
  type: 'order_details',
  title: 'Order details',
  image: '/template-types/order-details.webp',
  goodFor: 'Payment requests, invoices, checkout links, membership renewals',
  customisable: 'Header, body, footer, order items, total, payment button',
  // Buildable here. Whether a customer can actually PAY depends on
  // WhatsApp Pay being set up and approved on the WABA, which is a Meta
  // onboarding process — the editor says so rather than hiding the type,
  // because the template itself is legitimate to create and submit first.
  available: true,
};

const CALLING_PERMISSIONS: TemplateTypeOption = {
  type: 'calling_permission_request',
  title: 'Calling permissions request',
  description: 'Ask customers if they can call you on WhatsApp.',
  image: '/template-types/calling-permissions.gif',
  animated: true,
  goodFor: 'Asking permission before placing a WhatsApp voice call',
  customisable: 'Body text only — Meta fixes the buttons',
  available: true,
};

export const TEMPLATE_TYPES: Record<TemplateCategory, TemplateTypeOption[]> = {
  Marketing: [
    {
      type: 'default',
      title: 'Default',
      description:
        'Send messages with media and customised buttons to engage your customers.',
      image: '/template-types/marketing-default.webp',
      goodFor:
        'Welcome messages, promotions, offers, coupons, newsletters, announcements',
      customisable: 'Media, header, body, footer, buttons',
      available: true,
    },
    {
      type: 'catalogue',
      title: 'Catalogue',
      description:
        'Send messages that drive sales by connecting your product catalogue.',
      image: '/template-types/catalogue.gif',
      animated: true,
      goodFor: 'Product launches, seasonal ranges, browsing your whole catalogue',
      customisable: 'Body, footer — the catalogue card is built by WhatsApp',
      available: true,
    },
    {
      type: 'carousel',
      title: 'Carousel',
      description:
        'Send up to ten swipeable cards, each with its own image and buttons.',
      image: '/template-types/marketing-default.webp',
      goodFor: 'Showing several products, offers or options in one message',
      customisable: 'Message text, plus media, text and two buttons per card',
      available: true,
    },
    {
      type: 'limited_time_offer',
      title: 'Limited-time offer',
      description:
        'Show an expiry date and a live countdown timer on an offer code.',
      image: '/template-types/marketing-default.webp',
      goodFor: 'Flash sales, expiring discount codes, time-boxed promotions',
      customisable:
        'Media, body, offer label, countdown, offer code and a website button',
      available: true,
    },
    {
      type: 'flows',
      title: 'Flows',
      // "WhatsApp Flow" is named explicitly because this app also has a
      // feature called Flows (the automation builder), and the two are
      // unrelated — a template button can only open a Meta Flow.
      description:
        'Send a WhatsApp Flow form to capture customer interests, appointment requests or run surveys.',
      image: '/template-types/marketing-flows.gif',
      animated: true,
      goodFor: 'Lead capture, appointment booking, surveys, sign-ups',
      customisable: 'Header, body, footer, and which Flow the button opens',
      available: true,
    },
    {
      ...ORDER_DETAILS,
      description: 'Send messages through which customers can pay you.',
    },
    CALLING_PERMISSIONS,
  ],

  Utility: [
    {
      type: 'default',
      title: 'Default',
      description: 'Send messages about an existing order or account.',
      image: '/template-types/utility-default.webp',
      goodFor:
        'Order confirmations, account updates, receipts, appointment reminders, billing',
      customisable: 'Media, header, body, footer, buttons',
      available: true,
    },
    {
      type: 'flows',
      title: 'Flows',
      description:
        'Send a WhatsApp Flow form to collect feedback, send reminders or manage orders.',
      image: '/template-types/utility-flows.gif',
      animated: true,
      goodFor: 'Feedback requests, order management, reminders',
      customisable: 'Header, body, footer, and which Flow the button opens',
      available: true,
    },
    {
      type: 'order_status',
      title: 'Order status',
      description:
        'Send messages to tell customers about the progress of their orders.',
      image: '/template-types/order-status.webp',
      goodFor: 'Processing, shipped, out for delivery and delivered updates',
      customisable: 'Body text and footer — the order card comes from WhatsApp',
      available: true,
    },
    {
      ...ORDER_DETAILS,
      description: 'Send messages through which customers can pay you.',
    },
    CALLING_PERMISSIONS,
  ],

  /**
   * Meta shows no type chooser for Authentication — there is exactly one
   * shape, a fixed body plus a one-time-password button. The single entry
   * keeps the wizard's data shape uniform so step 1 does not need a
   * special case; the UI skips the radio list when there is only one.
   */
  Authentication: [
    {
      type: 'authentication',
      title: 'One-time passcode',
      description:
        'Send a verification code with a button that copies or autofills it.',
      image: '/template-types/authentication.webp',
      goodFor: 'Login codes, account verification, password resets',
      customisable:
        'Code expiry, the security disclaimer, and the button wording — Meta fixes the message text itself',
      available: true,
    },
  ],
};

export const CATEGORY_ORDER: TemplateCategory[] = [
  'Marketing',
  'Utility',
  'Authentication',
];

/** What each category means for the operator, in Meta's framing. */
export const CATEGORY_DESCRIPTIONS: Record<TemplateCategory, string> = {
  Marketing:
    'Promotions, offers and anything that sells. The most expensive category to send.',
  Utility:
    'Updates about an order or account the customer already has. Cheaper than marketing.',
  Authentication:
    'One-time passcodes only. The cheapest category, and the most restricted.',
};

export function findTypeOption(
  category: TemplateCategory,
  type: TemplateType,
): TemplateTypeOption | null {
  return TEMPLATE_TYPES[category].find((t) => t.type === type) ?? null;
}

/** The type pre-selected when a category is opened. */
export function defaultTypeFor(category: TemplateCategory): TemplateType {
  const options = TEMPLATE_TYPES[category];
  return (options.find((o) => o.available) ?? options[0]).type;
}
