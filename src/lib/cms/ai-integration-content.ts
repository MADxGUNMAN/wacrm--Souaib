// ============================================================
// /integrations/ai — CMS content model and defaults.
//
// The page lives in `integration_pages` (slug 'ai'), like the Google
// Sheets page. The generic columns cover the hero (badge, title,
// subtitle, CTAs), the hero highlights (`prerequisites`), the
// permission levels (`features`), the FAQs and SEO. Everything specific
// to this page sits in the `content` jsonb column, described by
// `AiPageContent`.
//
// The defaults below are the page's original copy. They are used to
// seed the row, to fill any field the super admin leaves empty, and by
// the editor's "Reset section" buttons, so the page can never render
// blank.
// ============================================================

import type {
  IntegrationFAQ,
  IntegrationFeature,
  IntegrationPage,
} from '@/types/super-admin';
import { list, nonEmpty, obj, text } from './content-helpers';

export const AI_PAGE_SLUG = 'ai';

export interface AiConnectCard {
  title: string;
  /** One step per line. Plain text; **bold** is not interpreted. */
  steps: string[];
}

export interface AiDataCard {
  title: string;
  body: string;
  icon: string;
}

/** One line of the hero chat mockup. `**bold**` is rendered as bold. */
export interface AiMockMessage {
  role: 'user' | 'assistant' | 'tool';
  /** Assistant: status line above the reply. Tool: the tool-call label. */
  label: string;
  /** Tool: the status pill (e.g. "Dispatched"). Ignored otherwise. */
  badge: string;
  body: string;
  /** Assistant only: bullet lines under the body. */
  items: string[];
}

export interface AiPageContent {
  breadcrumb_label: string;
  mockup_window_title: string;
  mockup_status_badge: string;
  mockup_user_label: string;
  mockup_messages: AiMockMessage[];
  examples_eyebrow: string;
  example_card_label: string;
  examples_heading: string;
  examples_subtitle: string;
  examples: string[];
  connect_eyebrow: string;
  connect_card_badge: string;
  connect_heading: string;
  connect_subtitle: string;
  connect_cards: AiConnectCard[];
  server_url_label: string;
  server_url_note: string;
  copy_button_text: string;
  permissions_eyebrow: string;
  permissions_heading: string;
  permissions_subtitle: string;
  safeguards_eyebrow: string;
  safeguards_heading: string;
  safeguards: string[];
  data_eyebrow: string;
  data_heading: string;
  data_cards: AiDataCard[];
  legal_note_prefix: string;
  privacy_link_text: string;
  terms_link_text: string;
  faq_eyebrow: string;
  faq_heading: string;
  faq_subtitle: string;
  support_heading: string;
  support_body: string;
  support_cta_text: string;
  support_cta_url: string;
  manage_cta_text: string;
  manage_cta_url: string;
  trademark_note: string;
}

/** Icon names the editor offers for permission levels and data cards. */
export const AI_PAGE_ICONS = [
  'Eye',
  'PencilLine',
  'Send',
  'Users',
  'Zap',
  'KeyRound',
  'Lock',
  'ListChecks',
  'ShieldCheck',
  'Bot',
  'MessageSquare',
  'Sparkles',
] as const;

export const AI_PAGE_DEFAULT_CONTENT: AiPageContent = {
  breadcrumb_label: 'Claude and ChatGPT',
  mockup_window_title: 'Claude & ChatGPT · Replai MCP Server',
  mockup_status_badge: 'Connected via OAuth 2.1',
  mockup_user_label: 'You',
  mockup_messages: [
    {
      role: 'user',
      label: '',
      badge: '',
      body: 'Show me leads who haven’t received a follow-up in 3 days.',
      items: [],
    },
    {
      role: 'assistant',
      label: 'Replai MCP: queried 32 deals across pipelines',
      badge: '',
      body: 'Found 3 high-intent leads waiting for follow-up on WhatsApp:',
      items: [
        '**Souaib Ansari** (Deal: ₹1,50,000 · Stage: Proposal Sent)',
        '**Rahul Sharma** (Deal: ₹85,000 · Stage: Demo Completed)',
        '**Priya Patel** (Deal: ₹45,000 · Stage: Pricing Review)',
      ],
    },
    {
      role: 'user',
      label: '',
      badge: '',
      body: 'Send the Welcome & Follow-up template to Souaib on WhatsApp.',
      items: [],
    },
    {
      role: 'tool',
      label: 'Tool Call: messages:send',
      badge: 'Dispatched',
      body: '✓ Delivered WhatsApp template **welcome_proposal** to **+91 98765 43210**. Delivery status logged in Replai CRM with blue ticks.',
      items: [],
    },
  ],
  examples_eyebrow: 'Natural Language Actions',
  example_card_label: 'Prompt',
  examples_heading: 'What you can ask',
  examples_subtitle:
    'Write in your own words. The AI app picks the right Replai action and shows you what it did.',
  examples: [
    'How many open conversations do I have, and which are unread?',
    'What did Ravi last say to us?',
    'Add a note on Ravi: called, wants a demo on Friday.',
    'Move Ravi’s deal to Won.',
    'Reply to Ravi: “Thanks, sending the invoice now.”',
    'Send the order_invoice_pdf template to Ravi for order ORD-5074.',
    'How did yesterday’s broadcast perform?',
  ],
  connect_eyebrow: 'Easy Setup',
  connect_card_badge: 'Step-by-step',
  connect_heading: 'How to connect',
  connect_subtitle:
    'You need a Replai account. When you connect, Replai opens in your browser so you can sign in and choose the permissions.',
  connect_cards: [
    {
      title: 'Claude',
      steps: [
        'In Claude, open Settings → Connectors.',
        'Choose Add custom connector and enter the server URL below. Replai is in review for the Claude directory and will be listed there soon.',
        'Select Connect, sign in to Replai and approve.',
      ],
    },
    {
      title: 'ChatGPT',
      steps: [
        'Open the Replai plugin in ChatGPT with the Add to ChatGPT button above, or search for Replai in the ChatGPT plugin directory.',
        'Select Connect, sign in to Replai and approve.',
      ],
    },
  ],
  server_url_label: 'Server URL:',
  server_url_note: 'Claude Code and Codex use the same URL.',
  copy_button_text: 'Copy URL',
  permissions_eyebrow: 'Granular Security',
  permissions_heading: 'What it may do',
  permissions_subtitle:
    'Viewing is always included. Each other level is a separate choice when you connect, and a switch you can turn off later.',
  safeguards_eyebrow: 'Safeguards',
  safeguards_heading: 'Safeguards',
  safeguards: [
    'The AI app acts as you, with your Replai role and permissions — never more.',
    'You choose what it may do when you connect, and can narrow it any time in Settings → AI Connectors.',
    'The workspace owner sets a policy for the whole workspace: which apps are allowed, whether members may connect, and whether sending, broadcasts and automation changes are allowed at all.',
    'Daily limits on messages and broadcast recipients (by default 100 messages per connection, 300 per workspace and 500 broadcast recipients per workspace).',
    'Broadcasts, and tag changes on more than 25 contacts, always need a preview and your confirmation. The owner can require a preview for every message.',
    'Messages sent this way are marked “via Claude” or “via ChatGPT” in the inbox, and every action is listed under Recent activity.',
    'Customers who opted out of marketing are skipped for marketing templates. The AI app can’t change the opt-out list.',
    'It can’t delete contacts or conversations, read API keys or WhatsApp credentials, change billing, or manage team members.',
  ],
  data_eyebrow: 'Zero Training',
  data_heading: 'Your data',
  data_cards: [
    {
      title: 'Sign-in',
      body: 'Standard OAuth 2.1 sign-in. The AI app never sees your Replai password; it gets a token that only works for this connection.',
      icon: 'KeyRound',
    },
    {
      title: 'What leaves Replai',
      body: 'Only what the AI app’s actions return while you use it. It is then processed by Anthropic or OpenAI under their terms.',
      icon: 'Lock',
    },
    {
      title: 'What Replai keeps',
      body: 'The connection, hashed tokens, and an activity log (ids and counts, not message text) for 90 days.',
      icon: 'ListChecks',
    },
  ],
  legal_note_prefix: 'Full details are available in our',
  privacy_link_text: 'privacy policy',
  terms_link_text: 'terms of service',
  faq_eyebrow: 'Support & FAQ',
  faq_heading: 'Questions',
  faq_subtitle:
    'Common questions about AI scopes, Anthropic & OpenAI directory compliance, and security.',
  support_heading: 'Need help?',
  support_body:
    'Questions about connecting, permissions or your data — we’re happy to help.',
  support_cta_text: 'Contact support',
  support_cta_url: '/contact',
  manage_cta_text: 'Manage connections',
  manage_cta_url: '/settings?tab=ai-connectors',
  trademark_note:
    'Claude is a trademark of Anthropic, PBC. ChatGPT is a trademark of OpenAI. WhatsApp is a trademark of Meta Platforms, Inc. Replai is not made or endorsed by Anthropic or OpenAI.',
};

export const AI_PAGE_DEFAULT_FEATURES: IntegrationFeature[] = [
  {
    icon: 'Eye',
    title: 'View',
    description:
      'Contacts, tags, notes, inbox conversations and messages, deals, templates, broadcast results, automations and dashboard numbers.',
  },
  {
    icon: 'PencilLine',
    title: 'Edit records',
    description:
      'Create and update contacts, tags, notes and custom fields; change conversation status and assignment; create and move deals.',
  },
  {
    icon: 'Send',
    title: 'Send messages',
    description:
      'Send WhatsApp messages and approved templates as you. Free text only inside WhatsApp’s 24-hour reply window.',
  },
  {
    icon: 'Users',
    title: 'Broadcasts',
    description:
      'Send a template to many contacts. Always shown as a preview first, and only sent after you confirm it.',
  },
  {
    icon: 'Zap',
    title: 'Automations on/off',
    description:
      'Switch existing automations and flows on or off. Their steps can’t be edited from the AI app.',
  },
];

export const AI_PAGE_DEFAULT_FAQS: IntegrationFAQ[] = [
  {
    question: 'Do I need a Replai account?',
    answer:
      'Yes. You sign in to Replai when you connect, and the AI app only ever sees the workspace you signed in to.',
  },
  {
    question: 'What data does the AI app receive?',
    answer:
      'Only what its tool calls return while you use it — for example the contact, conversation or deal you asked about. That data is then processed by Anthropic (Claude) or OpenAI (ChatGPT) under their terms. Replai does not receive your chat with the AI app.',
  },
  {
    question: 'What does Replai store about the connection?',
    answer:
      'The connection itself (which app, which permissions, when it was last used), hashed access tokens, and an activity log of each action with ids and counts but not message text. Activity is kept for 90 days.',
  },
  {
    question: 'How do I disconnect?',
    answer:
      'In Replai, open Settings → AI Connectors and select Disconnect on the connection. You can also ask the AI app to disconnect, or remove the connector in Claude or ChatGPT. Unused connections disconnect themselves after 30 days by default.',
  },
  {
    question: 'Can my team members connect too?',
    answer:
      'If the workspace owner allows it. Each person connects their own AI app and it works with that person’s permissions. The owner sees every connection in the workspace and can disconnect any of them.',
  },
];

export const AI_PAGE_DEFAULTS = {
  title: 'Replai for Claude and ChatGPT',
  subtitle:
    'Connect Claude or ChatGPT to your Replai WhatsApp CRM. Ask about your inbox, contacts and deals, update records, and send WhatsApp messages — with your own permissions and the limits your workspace sets.',
  badge_text: 'AI connector',
  /** Hidden while the URL is empty; set to the Claude listing when live. */
  primary_cta_text: 'Add to Claude',
  primary_cta_url: '',
  /** ChatGPT plugin directory listing (published 24 Oct 2026). */
  secondary_cta_text: 'Add to ChatGPT',
  secondary_cta_url:
    'https://chatgpt.com/plugins/plugin_asdk_app_6ac8dee28e288191b785a43de4cac406',
  highlights: [
    'Sign in with your Replai account',
    'You choose what it may do',
    'Disconnect any time',
  ],
  seo_meta_title: 'Replai for Claude and ChatGPT',
  seo_meta_description:
    'Connect Claude or ChatGPT to your Replai WhatsApp CRM: look up contacts and conversations, update records and send WhatsApp messages with your own permissions.',
};

const MOCK_ROLES = ['user', 'assistant', 'tool'] as const;

function resolveMockMessages(v: unknown): AiMockMessage[] {
  return list<Record<string, unknown>>(
    v,
    AI_PAGE_DEFAULT_CONTENT.mockup_messages as unknown as Record<
      string,
      unknown
    >[],
    (m) => !!m && typeof m === 'object' && nonEmpty(m.body)
  ).map((m) => ({
    role: MOCK_ROLES.includes(m.role as AiMockMessage['role'])
      ? (m.role as AiMockMessage['role'])
      : 'user',
    label: typeof m.label === 'string' ? m.label : '',
    badge: typeof m.badge === 'string' ? m.badge : '',
    body: m.body as string,
    items: Array.isArray(m.items) ? m.items.filter(nonEmpty) : [],
  }));
}

/** Stored `content` (any shape) merged over the defaults, field by field. */
export function resolveAiContent(raw: unknown): AiPageContent {
  const r = obj(raw);
  const d = AI_PAGE_DEFAULT_CONTENT;
  return {
    breadcrumb_label: text(r.breadcrumb_label, d.breadcrumb_label),
    mockup_window_title: text(r.mockup_window_title, d.mockup_window_title),
    mockup_status_badge: text(r.mockup_status_badge, d.mockup_status_badge),
    mockup_user_label: text(r.mockup_user_label, d.mockup_user_label),
    mockup_messages: resolveMockMessages(r.mockup_messages),
    examples_eyebrow: text(r.examples_eyebrow, d.examples_eyebrow),
    example_card_label: text(r.example_card_label, d.example_card_label),
    examples_heading: text(r.examples_heading, d.examples_heading),
    examples_subtitle: text(r.examples_subtitle, d.examples_subtitle),
    examples: list<string>(r.examples, d.examples, nonEmpty),
    connect_eyebrow: text(r.connect_eyebrow, d.connect_eyebrow),
    connect_card_badge: text(r.connect_card_badge, d.connect_card_badge),
    connect_heading: text(r.connect_heading, d.connect_heading),
    connect_subtitle: text(r.connect_subtitle, d.connect_subtitle),
    connect_cards: list<AiConnectCard>(
      r.connect_cards,
      d.connect_cards,
      (c) =>
        !!c &&
        nonEmpty(c.title) &&
        Array.isArray(c.steps) &&
        c.steps.some(nonEmpty)
    ).map((c) => ({ title: c.title, steps: c.steps.filter(nonEmpty) })),
    server_url_label: text(r.server_url_label, d.server_url_label),
    server_url_note: text(r.server_url_note, d.server_url_note),
    copy_button_text: text(r.copy_button_text, d.copy_button_text),
    permissions_eyebrow: text(r.permissions_eyebrow, d.permissions_eyebrow),
    permissions_heading: text(r.permissions_heading, d.permissions_heading),
    permissions_subtitle: text(r.permissions_subtitle, d.permissions_subtitle),
    safeguards_eyebrow: text(r.safeguards_eyebrow, d.safeguards_eyebrow),
    safeguards_heading: text(r.safeguards_heading, d.safeguards_heading),
    safeguards: list<string>(r.safeguards, d.safeguards, nonEmpty),
    data_eyebrow: text(r.data_eyebrow, d.data_eyebrow),
    data_heading: text(r.data_heading, d.data_heading),
    data_cards: list<AiDataCard>(
      r.data_cards,
      d.data_cards,
      (c) => !!c && nonEmpty(c.title) && nonEmpty(c.body)
    ),
    legal_note_prefix: text(r.legal_note_prefix, d.legal_note_prefix),
    privacy_link_text: text(r.privacy_link_text, d.privacy_link_text),
    terms_link_text: text(r.terms_link_text, d.terms_link_text),
    faq_eyebrow: text(r.faq_eyebrow, d.faq_eyebrow),
    faq_heading: text(r.faq_heading, d.faq_heading),
    faq_subtitle: text(r.faq_subtitle, d.faq_subtitle),
    support_heading: text(r.support_heading, d.support_heading),
    support_body: text(r.support_body, d.support_body),
    support_cta_text: text(r.support_cta_text, d.support_cta_text),
    support_cta_url: text(r.support_cta_url, d.support_cta_url),
    manage_cta_text: text(r.manage_cta_text, d.manage_cta_text),
    manage_cta_url: text(r.manage_cta_url, d.manage_cta_url),
    trademark_note: text(r.trademark_note, d.trademark_note),
  };
}

/** Everything the public page renders, from the row (or null) plus defaults. */
export function resolveAiPage(page: IntegrationPage | null) {
  const d = AI_PAGE_DEFAULTS;
  return {
    title: text(page?.title, d.title),
    subtitle: text(page?.subtitle, d.subtitle),
    badge_text: text(page?.badge_text, d.badge_text),
    // CTAs are optional: shown only when both text and URL are set.
    primary_cta:
      page && nonEmpty(page.primary_cta_text) && nonEmpty(page.primary_cta_url)
        ? { text: page.primary_cta_text, url: page.primary_cta_url }
        : null,
    secondary_cta:
      page &&
      nonEmpty(page.secondary_cta_text) &&
      nonEmpty(page.secondary_cta_url)
        ? { text: page.secondary_cta_text, url: page.secondary_cta_url }
        : null,
    highlights: list<string>(page?.prerequisites, d.highlights, nonEmpty),
    levels: list<IntegrationFeature>(
      page?.features,
      AI_PAGE_DEFAULT_FEATURES,
      (f) => !!f && nonEmpty(f.title)
    ),
    faqs: list<IntegrationFAQ>(
      page?.faqs,
      AI_PAGE_DEFAULT_FAQS,
      (f) => !!f && nonEmpty(f.question) && nonEmpty(f.answer)
    ),
    seo_meta_title: text(page?.seo_meta_title, d.seo_meta_title),
    seo_meta_description: text(
      page?.seo_meta_description,
      d.seo_meta_description
    ),
    content: resolveAiContent(page?.content),
  };
}
