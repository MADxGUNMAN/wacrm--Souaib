// ============================================================
// Site-wide marketing copy stored in `site_settings.marketing_copy`
// (jsonb). Covers text that isn't tied to one landing section:
//   - auth:       the login / signup left-side showcase
//   - navbar:     the Login / Get Started buttons on every public page
//   - newsletter: the footer newsletter block
//
// Edited in Super Admin → CMS → Global Settings. Every field falls back
// to the defaults below, so an empty or older value never blanks a page.
// `{site_name}` in any string is replaced with the site name.
// ============================================================

import { obj, text } from './content-helpers';

export interface AuthShowcaseCopy {
  heading: string;
  description: string;
  chat_title: string;
  chat_subtitle: string;
  chat_status: string;
  customer_message: string;
  customer_time: string;
  bot_reply: string;
  bot_time: string;
  footer_badge: string;
}

export interface NavbarCopy {
  login_text: string;
  signup_text: string;
}

export interface NewsletterCopy {
  heading: string;
  body: string;
  placeholder: string;
  button_text: string;
  success_message: string;
}

export interface MarketingCopy {
  auth: AuthShowcaseCopy;
  navbar: NavbarCopy;
  newsletter: NewsletterCopy;
}

export const MARKETING_COPY_DEFAULTS: MarketingCopy = {
  auth: {
    heading: 'Scale your customer communication',
    description:
      'Join thousands of businesses using {site_name} to automate WhatsApp support, sales, and marketing.',
    chat_title: '{site_name} Assistant',
    chat_subtitle: 'Automated Bot Flow',
    chat_status: 'Active',
    customer_message:
      'Can I automate WhatsApp notifications for customer inquiries?',
    customer_time: '10:42 AM',
    bot_reply:
      'Yes! Connect your WhatsApp Business API and trigger smart workflows in under 2 minutes. ⚡',
    bot_time: '10:42 AM',
    footer_badge: 'Official WhatsApp Cloud API',
  },
  navbar: {
    login_text: 'Login',
    signup_text: 'Get Started',
  },
  newsletter: {
    heading: 'Subscribe to newsletter',
    body: 'Get the latest updates and product announcements directly to your inbox.',
    placeholder: 'Enter your email',
    button_text: 'Subscribe',
    success_message: 'Check your email to confirm!',
  },
};

function resolveGroup<T extends object>(raw: unknown, defaults: T): T {
  const r = obj(raw);
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    out[key] = text(r[key as string], defaults[key] as string) as T[keyof T];
  }
  return out;
}

/** Stored `site_settings.marketing_copy` (any shape) merged over defaults. */
export function resolveMarketingCopy(raw: unknown): MarketingCopy {
  const r = obj(raw);
  return {
    auth: resolveGroup(r.auth, MARKETING_COPY_DEFAULTS.auth),
    navbar: resolveGroup(r.navbar, MARKETING_COPY_DEFAULTS.navbar),
    newsletter: resolveGroup(r.newsletter, MARKETING_COPY_DEFAULTS.newsletter),
  };
}
