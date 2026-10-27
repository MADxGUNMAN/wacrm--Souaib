// ============================================================
// /integrations/google-sheets — CMS content model and defaults.
//
// The generic `integration_pages` columns (slug 'google-sheets') hold the
// hero, CTAs, requirements list (`prerequisites`), feature cards, steps,
// FAQs, privacy/terms markdown and SEO. Everything else on the page —
// hero ticks, section eyebrows and headings, the spreadsheet mockup, the
// CTA banner and the footer — lives in the `content` jsonb column,
// described by `SheetsPageContent`.
//
// Every field falls back to the defaults below, field by field, so an
// older row or an empty input never blanks the page.
// ============================================================

import type {
  IntegrationFAQ,
  IntegrationFeature,
  IntegrationPage,
  IntegrationStep,
} from '@/types/super-admin';
import { list, nonEmpty, obj, text } from './content-helpers';

export const SHEETS_PAGE_SLUG = 'google-sheets';

export type SheetsRowTone = 'success' | 'pending';

export interface SheetsMockRow {
  customer: string;
  phone: string;
  order_id: string;
  status: string;
  /** Colours the status pill and the delivery cell. */
  tone: SheetsRowTone;
  delivery: string;
}

export interface SheetsPageContent {
  breadcrumb_label: string;
  hero_checks: string[];
  requirements_eyebrow: string;
  requirements_heading: string;
  requirements_body: string;
  mockup_window_title: string;
  mockup_status_badge: string;
  /** Exactly five headers: customer, phone, order, status, delivery. */
  mockup_columns: string[];
  mockup_rows: SheetsMockRow[];
  mockup_rule_title: string;
  mockup_rule_badge: string;
  mockup_template_name: string;
  mockup_template_meta: string;
  mockup_trigger: string;
  bubble_sender: string;
  bubble_time: string;
  /** `**bold**` is rendered as bold. */
  bubble_text: string;
  bubble_status: string;
  mockup_footer_left: string;
  mockup_footer_right: string;
  features_eyebrow: string;
  features_heading: string;
  features_subtitle: string;
  steps_eyebrow: string;
  steps_heading: string;
  steps_subtitle: string;
  faq_eyebrow: string;
  faq_heading: string;
  faq_subtitle: string;
  cta_heading: string;
  cta_body: string;
  /** Empty = reuse the hero primary button text. Link is always the hero primary link. */
  cta_primary_text: string;
  cta_secondary_text: string;
  cta_secondary_url: string;
  trademark_note: string;
  privacy_link_text: string;
  terms_link_text: string;
  /** Header chrome of /integrations/google-sheets/privacy and /terms. */
  privacy_doc: SheetsLegalDocCopy;
  terms_doc: SheetsLegalDocCopy;
  legal_back_link_text: string;
  legal_revised_label: string;
  legal_applies_to: string;
}

export interface SheetsLegalDocCopy {
  breadcrumb: string;
  eyebrow: string;
  heading: string;
  intro: string;
  meta_title: string;
  meta_description: string;
}

export const SHEETS_PAGE_DEFAULTS = {
  title: 'Replai for Google Sheets — Automated WhatsApp Messaging',
  subtitle:
    'Send WhatsApp messages, order confirmations, status alerts, and scheduled reminders directly from your Google Sheets spreadsheets.',
  badge_text: 'Google Workspace Marketplace Add-on',
  primary_cta_text: 'Install from Marketplace',
  primary_cta_url: 'https://workspace.google.com/marketplace',
  secondary_cta_text: 'Get Started Free',
  secondary_cta_url: '/signup',
  prerequisites: [
    'Active Replai CRM account with WhatsApp Business API connected',
    'Pre-approved Meta WhatsApp message templates',
    'Google Sheets document with contact numbers',
  ],
  seo_meta_title: 'Replai for Google Sheets — Automated WhatsApp Messaging',
  seo_meta_description:
    'Send WhatsApp messages, notifications, and reminders directly from Google Sheets with Replai. Trigger sends on new rows, cell changes, or schedules.',
};

export const SHEETS_DEFAULT_FEATURES: IntegrationFeature[] = [
  {
    title: 'Send on New Rows & Form Submissions',
    description:
      'Automatically send customized WhatsApp messages whenever a new row is appended or submitted through Google Forms.',
    icon: 'PlusCircle',
  },
  {
    title: 'Trigger on Cell Changes',
    description:
      'Watch specific columns like Status and automatically dispatch messages when a cell changes to Pass, Shipped, or Approved.',
    icon: 'RefreshCw',
  },
  {
    title: 'Time-Based & Recurring Reminders',
    description:
      'Automate birthday greetings, monthly rent/EMI dues, and appointment reminders with 9 smart date-aware comparison operators.',
    icon: 'Calendar',
  },
  {
    title: 'Dynamic Variable & Media Mapping',
    description:
      'Map spreadsheet columns directly to {{1}}, {{2}} template placeholders and attach dynamic invoice PDFs or image URLs.',
    icon: 'FileText',
  },
  {
    title: 'Live Status Feedback in Your Sheet',
    description:
      'The add-on creates a Replai Status column and logs real-time delivery timestamps directly on the row.',
    icon: 'CheckCircle2',
  },
  {
    title: 'Strict Duplicate Protection',
    description:
      'Cryptographically hashed idempotency keys guarantee that rows matching a rule send exactly once and never double-charge.',
    icon: 'ShieldCheck',
  },
];

export const SHEETS_DEFAULT_STEPS: IntegrationStep[] = [
  {
    step_number: 1,
    title: 'Install & Connect',
    description:
      'Install the add-on from Google Workspace Marketplace and link your Replai account using your secure API key.',
  },
  {
    step_number: 2,
    title: 'Build Automation Rule',
    description:
      'Select your target sheet, choose your trigger condition (New Row, On Change, or Reminder), and map your columns.',
  },
  {
    step_number: 3,
    title: 'Automatic & Instant Delivery',
    description:
      'Edit or append rows in Google Sheets. Replai evaluates your rules in real time and delivers the WhatsApp template message instantly.',
  },
];

export const SHEETS_DEFAULT_FAQS: IntegrationFAQ[] = [
  {
    question: 'Does this add-on require a Replai account?',
    answer:
      'Yes. The add-on connects to your Replai account via an API key to securely send messages through the official Meta WhatsApp Business Cloud API.',
  },
  {
    question: 'What WhatsApp message templates can I send?',
    answer:
      'You can send any Meta-approved WhatsApp template created in your Replai dashboard or Meta Business Manager, complete with dynamic variables and media.',
  },
  {
    question: 'What data does the add-on access in my Google Sheets?',
    answer:
      'The add-on accesses only the current spreadsheet you open (spreadsheets.currentonly). We never access other files in your Google Drive.',
  },
];

/** Icon names offered by the editor for feature cards. */
export const SHEETS_FEATURE_ICONS = [
  'PlusCircle',
  'RefreshCw',
  'Calendar',
  'FileText',
  'CheckCircle2',
  'ShieldCheck',
  'Zap',
  'Sparkles',
  'MessageSquare',
  'Clock',
  'Layers',
] as const;

export const SHEETS_DEFAULT_CONTENT: SheetsPageContent = {
  breadcrumb_label: 'Google Sheets',
  hero_checks: [
    'Official Meta Cloud API',
    'No-Code Automation',
    'End-to-End Encrypted',
  ],
  requirements_eyebrow: 'Integration Requirements',
  requirements_heading: 'What you need to get started',
  requirements_body:
    'This Google Sheets editor add-on transmits row data over secure HTTPS strictly to deliver WhatsApp messages through your authorized account.',
  mockup_window_title: 'Google Sheets · Orders & Delivery Automation',
  mockup_status_badge: 'Add-on Active',
  mockup_columns: [
    'Customer',
    'WhatsApp Phone',
    'Order ID',
    'Status',
    'Replai Delivery',
  ],
  mockup_rows: [
    {
      customer: 'Souaib Ansari',
      phone: '+91 98765 43210',
      order_id: 'ORD-8921',
      status: 'Shipped',
      tone: 'success',
      delivery: '✓ Sent · 12:45 PM',
    },
    {
      customer: 'Rahul Sharma',
      phone: '+91 98111 22233',
      order_id: 'ORD-8922',
      status: 'Pending',
      tone: 'pending',
      delivery: 'Waiting for trigger',
    },
    {
      customer: 'Priya Patel',
      phone: '+91 98222 33344',
      order_id: 'ORD-8923',
      status: 'Shipped',
      tone: 'success',
      delivery: '✓ Sent · 12:47 PM',
    },
  ],
  mockup_rule_title: 'Replai Rule Active',
  mockup_rule_badge: 'Real-time',
  mockup_template_name: 'Order Notification Template',
  mockup_template_meta: 'Sheet1 • order_shipped_v2',
  mockup_trigger: 'Trigger: Status == "Shipped"',
  bubble_sender: 'WhatsApp Cloud API',
  bubble_time: 'Now',
  bubble_text:
    'Hi Souaib! Your order **ORD-8921** has shipped. Track: replai.io/track/8921 🚀',
  bubble_status: '✓✓ Delivered',
  mockup_footer_left: 'Connected to Meta API',
  mockup_footer_right: 'v0.5.0',
  features_eyebrow: 'Capabilities',
  features_heading: 'Powerful WhatsApp Triggers for Spreadsheets',
  features_subtitle:
    'Everything you need to automate customer follow-ups, order alerts, and notifications without writing a single line of code.',
  steps_eyebrow: 'Workflow',
  steps_heading: 'Get Started in 3 Simple Steps',
  steps_subtitle:
    'Set up your first automated workflow in less than two minutes.',
  faq_eyebrow: 'Support & FAQ',
  faq_heading: 'Frequently Asked Questions',
  faq_subtitle: 'Common questions about security, templates, and permissions.',
  cta_heading: 'Ready to automate WhatsApp from your spreadsheets?',
  cta_body:
    'Install the Replai add-on from the Google Workspace Marketplace and start dispatching automated messages in seconds.',
  cta_primary_text: '',
  cta_secondary_text: 'Contact Support',
  cta_secondary_url: '/contact',
  trademark_note:
    'WhatsApp™ is a trademark of Meta Platforms, Inc. Google Sheets™ is a trademark of Google LLC.',
  privacy_link_text: 'Add-on Privacy Policy',
  terms_link_text: 'Add-on Terms of Service',
  privacy_doc: {
    breadcrumb: 'Privacy Policy',
    eyebrow: 'Google Workspace Add-on Compliance',
    heading: 'Privacy Policy for Google Sheets Add-on',
    intro:
      'Official data privacy disclosures, Google API user data compliance, and data retention policies for Replai for Google Sheets.',
    meta_title: 'Privacy Policy — Replai for Google Sheets Add-on',
    meta_description:
      'Privacy Policy and Google API Services User Data Disclosure for the Replai Google Sheets Add-on.',
  },
  terms_doc: {
    breadcrumb: 'Terms of Service',
    eyebrow: 'Google Workspace Add-on Terms',
    heading: 'Terms of Service for Google Sheets Add-on',
    intro:
      'End-user license terms, acceptable use requirements, service commitments, and WhatsApp policy compliance for Replai for Google Sheets.',
    meta_title: 'Terms of Service — Replai for Google Sheets Add-on',
    meta_description:
      'Terms of Service and Acceptable Use Policy for the Replai Google Sheets Add-on.',
  },
  legal_back_link_text: 'Back to Google Sheets Overview',
  legal_revised_label: 'Last revised:',
  legal_applies_to: 'Applies to: Replai Workspace Add-on',
};

function resolveDoc(v: unknown, d: SheetsLegalDocCopy): SheetsLegalDocCopy {
  const r = obj(v);
  return {
    breadcrumb: text(r.breadcrumb, d.breadcrumb),
    eyebrow: text(r.eyebrow, d.eyebrow),
    heading: text(r.heading, d.heading),
    intro: text(r.intro, d.intro),
    meta_title: text(r.meta_title, d.meta_title),
    meta_description: text(r.meta_description, d.meta_description),
  };
}

const MOCK_COLUMN_COUNT = 5;

function resolveRows(v: unknown): SheetsMockRow[] {
  return list<Record<string, unknown>>(
    v,
    SHEETS_DEFAULT_CONTENT.mockup_rows as unknown as Record<string, unknown>[],
    (r) => !!r && typeof r === 'object' && nonEmpty(r.customer)
  ).map((r) => ({
    customer: r.customer as string,
    phone: typeof r.phone === 'string' ? r.phone : '',
    order_id: typeof r.order_id === 'string' ? r.order_id : '',
    status: typeof r.status === 'string' ? r.status : '',
    tone: r.tone === 'pending' ? 'pending' : 'success',
    delivery: typeof r.delivery === 'string' ? r.delivery : '',
  }));
}

function resolveColumns(v: unknown): string[] {
  const d = SHEETS_DEFAULT_CONTENT.mockup_columns;
  const stored = Array.isArray(v) ? v : [];
  // Always five headers; each empty slot keeps its default.
  return Array.from({ length: MOCK_COLUMN_COUNT }, (_, i) =>
    text(stored[i], d[i])
  );
}

/** Stored `content` (any shape) merged over the defaults, field by field. */
export function resolveSheetsContent(raw: unknown): SheetsPageContent {
  const r = obj(raw);
  const d = SHEETS_DEFAULT_CONTENT;
  const t = (k: keyof SheetsPageContent) =>
    text(r[k], d[k] as unknown as string);
  return {
    breadcrumb_label: t('breadcrumb_label'),
    hero_checks: list<string>(r.hero_checks, d.hero_checks, nonEmpty),
    requirements_eyebrow: t('requirements_eyebrow'),
    requirements_heading: t('requirements_heading'),
    requirements_body: t('requirements_body'),
    mockup_window_title: t('mockup_window_title'),
    mockup_status_badge: t('mockup_status_badge'),
    mockup_columns: resolveColumns(r.mockup_columns),
    mockup_rows: resolveRows(r.mockup_rows),
    mockup_rule_title: t('mockup_rule_title'),
    mockup_rule_badge: t('mockup_rule_badge'),
    mockup_template_name: t('mockup_template_name'),
    mockup_template_meta: t('mockup_template_meta'),
    mockup_trigger: t('mockup_trigger'),
    bubble_sender: t('bubble_sender'),
    bubble_time: t('bubble_time'),
    bubble_text: t('bubble_text'),
    bubble_status: t('bubble_status'),
    mockup_footer_left: t('mockup_footer_left'),
    mockup_footer_right: t('mockup_footer_right'),
    features_eyebrow: t('features_eyebrow'),
    features_heading: t('features_heading'),
    features_subtitle: t('features_subtitle'),
    steps_eyebrow: t('steps_eyebrow'),
    steps_heading: t('steps_heading'),
    steps_subtitle: t('steps_subtitle'),
    faq_eyebrow: t('faq_eyebrow'),
    faq_heading: t('faq_heading'),
    faq_subtitle: t('faq_subtitle'),
    cta_heading: t('cta_heading'),
    cta_body: t('cta_body'),
    // Empty is meaningful here (reuse the hero text), so keep it as stored.
    cta_primary_text:
      typeof r.cta_primary_text === 'string' ? r.cta_primary_text.trim() : '',
    cta_secondary_text: t('cta_secondary_text'),
    cta_secondary_url: t('cta_secondary_url'),
    trademark_note: t('trademark_note'),
    privacy_link_text: t('privacy_link_text'),
    terms_link_text: t('terms_link_text'),
    privacy_doc: resolveDoc(r.privacy_doc, d.privacy_doc),
    terms_doc: resolveDoc(r.terms_doc, d.terms_doc),
    legal_back_link_text: t('legal_back_link_text'),
    legal_revised_label: t('legal_revised_label'),
    legal_applies_to: t('legal_applies_to'),
  };
}

/** Everything the public page renders, from the row (or null) plus defaults. */
export function resolveSheetsPage(page: IntegrationPage | null) {
  const d = SHEETS_PAGE_DEFAULTS;
  const content = resolveSheetsContent(page?.content);
  const primaryCtaText = text(page?.primary_cta_text, d.primary_cta_text);
  return {
    title: text(page?.title, d.title),
    subtitle: text(page?.subtitle, d.subtitle),
    badge_text: text(page?.badge_text, d.badge_text),
    primary_cta_text: primaryCtaText,
    primary_cta_url: text(page?.primary_cta_url, d.primary_cta_url),
    secondary_cta_text: text(page?.secondary_cta_text, d.secondary_cta_text),
    secondary_cta_url: text(page?.secondary_cta_url, d.secondary_cta_url),
    prerequisites: list<string>(page?.prerequisites, d.prerequisites, nonEmpty),
    features: list<IntegrationFeature>(
      page?.features,
      SHEETS_DEFAULT_FEATURES,
      (f) => nonEmpty(f.title)
    ),
    how_it_works: list<IntegrationStep>(
      page?.how_it_works,
      SHEETS_DEFAULT_STEPS,
      (s) => nonEmpty(s.title)
    ),
    faqs: list<IntegrationFAQ>(
      page?.faqs,
      SHEETS_DEFAULT_FAQS,
      (f) => nonEmpty(f.question) && nonEmpty(f.answer)
    ),
    seo_meta_title: text(page?.seo_meta_title, d.seo_meta_title),
    seo_meta_description: text(
      page?.seo_meta_description,
      d.seo_meta_description
    ),
    content: {
      ...content,
      cta_primary_text: content.cta_primary_text || primaryCtaText,
    },
  };
}
