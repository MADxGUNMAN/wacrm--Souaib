'use client';

// Global Settings → Marketing Copy: the login / signup showcase, the
// navbar buttons and the footer newsletter block
// (site_settings.marketing_copy, see lib/cms/marketing-copy).

import { Mail, MousePointerClick, PanelLeft } from 'lucide-react';
import {
  EditorCard,
  ResetButton,
  TextField,
  clone,
} from '@/components/super-admin/cms-editor-kit';
import {
  MARKETING_COPY_DEFAULTS,
  type AuthShowcaseCopy,
  type MarketingCopy,
  type NavbarCopy,
  type NewsletterCopy,
} from '@/lib/cms/marketing-copy';

interface Props {
  value: MarketingCopy;
  onChange: (next: MarketingCopy) => void;
}

type Group = keyof MarketingCopy;

export function MarketingCopyEditor({ value, onChange }: Props) {
  const setField = <G extends Group>(
    group: G,
    key: keyof MarketingCopy[G],
    v: string
  ) => onChange({ ...value, [group]: { ...value[group], [key]: v } });

  const resetGroup = (group: Group) =>
    onChange({ ...value, [group]: clone(MARKETING_COPY_DEFAULTS[group]) });

  const auth = (key: keyof AuthShowcaseCopy, label: string, rows?: number) => (
    <TextField
      label={label}
      value={value.auth[key]}
      onChange={(v) => setField('auth', key, v)}
      placeholder={MARKETING_COPY_DEFAULTS.auth[key]}
      rows={rows}
      className={rows ? 'md:col-span-2' : undefined}
    />
  );
  const nav = (key: keyof NavbarCopy, label: string) => (
    <TextField
      label={label}
      value={value.navbar[key]}
      onChange={(v) => setField('navbar', key, v)}
      placeholder={MARKETING_COPY_DEFAULTS.navbar[key]}
    />
  );
  const news = (key: keyof NewsletterCopy, label: string, rows?: number) => (
    <TextField
      label={label}
      value={value.newsletter[key]}
      onChange={(v) => setField('newsletter', key, v)}
      placeholder={MARKETING_COPY_DEFAULTS.newsletter[key]}
      rows={rows}
      className={rows ? 'md:col-span-2' : undefined}
    />
  );

  return (
    <div className="space-y-6">
      <EditorCard
        title="Login & Signup Showcase"
        icon={<PanelLeft className="h-5 w-5 text-emerald-500" />}
        description="The left-hand panel on /login and /signup (desktop). {site_name} is replaced with the site name."
        actions={<ResetButton onClick={() => resetGroup('auth')} />}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {auth('heading', 'Heading', 2)}
          {auth('description', 'Description', 2)}
          {auth('chat_title', 'Chat Title')}
          {auth('chat_subtitle', 'Chat Subtitle')}
          {auth('chat_status', 'Chat Status Badge')}
          {auth('footer_badge', 'Footer Badge')}
          {auth('customer_message', 'Customer Message', 2)}
          {auth('customer_time', 'Customer Message Time')}
          {auth('bot_time', 'Reply Time')}
          {auth('bot_reply', 'Bot Reply', 2)}
        </div>
      </EditorCard>

      <EditorCard
        title="Navbar Buttons"
        icon={<MousePointerClick className="h-5 w-5 text-emerald-500" />}
        description="Shown on every public page (home, docs, contact, legal, integrations)."
        actions={<ResetButton onClick={() => resetGroup('navbar')} />}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {nav('login_text', 'Login Button')}
          {nav('signup_text', 'Sign-up Button')}
        </div>
      </EditorCard>

      <EditorCard
        title="Footer Newsletter"
        icon={<Mail className="h-5 w-5 text-emerald-500" />}
        description="Only visible when the newsletter is switched on for the footer."
        actions={<ResetButton onClick={() => resetGroup('newsletter')} />}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {news('heading', 'Headline')}
          {news('placeholder', 'Email Placeholder')}
          {news('body', 'Description', 2)}
          {news('button_text', 'Button Text')}
          {news('success_message', 'Fallback Success Message')}
        </div>
      </EditorCard>
    </div>
  );
}
