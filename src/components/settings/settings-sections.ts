import {
  Coins,
  CreditCard,
  KeyRound,
  LayoutGrid,
  Palette,
  PlugZap,
  Shield,
  Smartphone,
  Tags,
  User,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'billing',
  'whatsapp-setup',
  'whatsapp',
  // NOTE: 'templates' deliberately absent. Templates moved to their own
  // top-level route (/templates) — a three-step creation wizard does not
  // belong in a settings pane, and templates are daily working material
  // rather than one-time configuration. `?tab=templates` redirects there;
  // see the settings page.
  'quick-replies',
  'fields',
  'deals',
  'members',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  // Workspace-scoped, not account-scoped: the subscription belongs to the
  // whole workspace, and only its owner can change it.
  billing: { id: 'billing', label: 'Billing & plan', icon: CreditCard, group: 'workspace' },
  'whatsapp-setup': { id: 'whatsapp-setup', label: 'WhatsApp Setup', icon: Smartphone, group: 'workspace' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  'quick-replies': { id: 'quick-replies', label: 'Quick replies', icon: Zap, group: 'workspace' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}

/**
 * Sections that are no longer panes here and live at their own route.
 *
 * Kept as an explicit map rather than letting `resolveSection` silently
 * fall back to Overview: an old bookmark to `?tab=templates` should land
 * on templates, not dump the user on a landing page wondering where the
 * feature went.
 */
export const RELOCATED_SECTIONS: Record<string, string> = {
  templates: '/templates',
};
