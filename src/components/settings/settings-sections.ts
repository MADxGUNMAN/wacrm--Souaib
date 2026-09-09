import {
  Coins,
  CreditCard,
  KeyRound,
  LayoutGrid,
  Palette,
  Shield,
  Smartphone,
  Tags,
  User,
  UsersRound,
  Zap,
  BellRing,
  BellOff,
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
  // NOTE: 'whatsapp-setup' deliberately absent. Guided Embedded Signup and
  // the manual credential form are two ways to connect the same number, not
  // two features, so they are one section with a mode tab —
  // `?tab=whatsapp&mode=manual`. `?tab=whatsapp-setup` resolves here; see
  // resolveSection below.
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
  // Owner-only by default. Unlike every other pane, an absent
  // `settings_alerts` permission DENIES — see
  // OWNER_ONLY_SETTINGS_SECTIONS in @/lib/auth/roles.
  'alerts',
  // NOTE the id: exactly ONE hyphen, deliberately. Section permission
  // keys are derived as `settings_${section.replace('-', '_')}` in
  // canAccessSettingsSection, and `String.replace` with a string pattern
  // swaps only the FIRST match — so an id like 'opt-in-out' would derive
  // the broken key `settings_opt_in-out` and never match the stored
  // permission. 'opt-out' derives `settings_opt_out`.
  'opt-out',
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
  overview: {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    group: 'top',
  },
  profile: {
    id: 'profile',
    label: 'Your profile',
    icon: User,
    group: 'account',
  },
  security: {
    id: 'security',
    label: 'Login & security',
    icon: Shield,
    group: 'account',
  },
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    group: 'account',
  },
  // Workspace-scoped, not account-scoped: the subscription belongs to the
  // whole workspace, and only its owner can change it.
  billing: {
    id: 'billing',
    label: 'Billing & plan',
    icon: CreditCard,
    group: 'workspace',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: Smartphone,
    group: 'workspace',
  },
  'quick-replies': {
    id: 'quick-replies',
    label: 'Quick replies',
    icon: Zap,
    group: 'workspace',
  },
  fields: {
    id: 'fields',
    label: 'Fields & tags',
    icon: Tags,
    group: 'workspace',
  },
  deals: {
    id: 'deals',
    label: 'Deals & currency',
    icon: Coins,
    group: 'workspace',
  },
  members: {
    id: 'members',
    label: 'Team members',
    icon: UsersRound,
    group: 'workspace',
  },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
  alerts: {
    id: 'alerts',
    label: 'Usage alerts',
    icon: BellRing,
    group: 'workspace',
  },
  'opt-out': {
    id: 'opt-out',
    label: 'Opt-in / opt-out',
    icon: BellOff,
    group: 'workspace',
  },
};

export const RAIL_GROUPS: {
  label: string | null;
  group: SectionMeta['group'];
}[] = [
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
  // The guided setup pane merged into the WhatsApp section (it is now the
  // default tab there), so old links land on exactly what they asked for.
  if (raw === 'whatsapp-setup') return 'whatsapp';
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
