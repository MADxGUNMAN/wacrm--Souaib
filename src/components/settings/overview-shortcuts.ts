// Shortcut catalogue and layout helpers for Settings → Overview.
//
// The Overview landing shows a grid of shortcuts the user can add,
// remove and reorder. This module is pure (no React) so the layout rules
// are easy to test: what exists, what a user may see, and how a stored
// layout is cleaned up when the catalogue or their permissions change.

import {
  BarChart3,
  Bell,
  BookOpen,
  Cpu,
  FileText,
  Inbox,
  KanbanSquare,
  LifeBuoy,
  Megaphone,
  Sparkles,
  UsersRound,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

import { SECTION_META, type SettingsSection } from './settings-sections';

export type ShortcutGroup = 'workspace' | 'account' | 'app' | 'help';

export type ShortcutId =
  Exclude<SettingsSection, 'overview'> | `page:${PageId}`;

export type PageId =
  | 'dashboard'
  | 'inbox'
  | 'notifications'
  | 'contacts'
  | 'pipelines'
  | 'broadcasts'
  | 'templates'
  | 'automations'
  | 'flows'
  | 'agents'
  | 'api-docs'
  | 'help';

export interface ShortcutDef {
  id: ShortcutId;
  group: ShortcutGroup;
  icon: LucideIcon;
  /** Settings section to open, for in-page shortcuts. */
  section?: Exclude<SettingsSection, 'overview'>;
  /** Route to open, for app pages and help. */
  href?: string;
  /** Open in a new tab (documentation and help). */
  external?: boolean;
  /**
   * `hasSectionAccess` key that gates an app page, mirroring the main
   * sidebar. Absent means always visible.
   */
  pageAccess?: string;
}

const PAGES: {
  id: PageId;
  href: string;
  icon: LucideIcon;
  group: ShortcutGroup;
  pageAccess?: string;
  external?: boolean;
}[] = [
  {
    id: 'dashboard',
    href: '/dashboard',
    icon: BarChart3,
    group: 'app',
    pageAccess: 'dashboard',
  },
  {
    id: 'inbox',
    href: '/inbox',
    icon: Inbox,
    group: 'app',
    pageAccess: 'inbox',
  },
  { id: 'notifications', href: '/notifications', icon: Bell, group: 'app' },
  {
    id: 'contacts',
    href: '/contacts',
    icon: UsersRound,
    group: 'app',
    pageAccess: 'contacts',
  },
  {
    id: 'pipelines',
    href: '/pipelines',
    icon: KanbanSquare,
    group: 'app',
    pageAccess: 'pipelines',
  },
  {
    id: 'broadcasts',
    href: '/broadcasts',
    icon: Megaphone,
    group: 'app',
    pageAccess: 'broadcasts',
  },
  { id: 'templates', href: '/templates', icon: FileText, group: 'app' },
  {
    id: 'automations',
    href: '/automations',
    icon: Cpu,
    group: 'app',
    pageAccess: 'automations',
  },
  // Flows and AI agents are gated by the automations permission, like the sidebar.
  {
    id: 'flows',
    href: '/flows',
    icon: Waypoints,
    group: 'app',
    pageAccess: 'automations',
  },
  {
    id: 'agents',
    href: '/agents',
    icon: Sparkles,
    group: 'app',
    pageAccess: 'automations',
  },
  {
    id: 'api-docs',
    href: '/api-reference',
    icon: BookOpen,
    group: 'help',
    external: true,
  },
  {
    id: 'help',
    href: '/contact',
    icon: LifeBuoy,
    group: 'help',
    external: true,
  },
];

const SECTION_ORDER: Exclude<SettingsSection, 'overview'>[] = [
  'whatsapp',
  'members',
  'billing',
  'alerts',
  'quick-replies',
  'opt-out',
  'fields',
  'deals',
  'ai-connectors',
  'integrations',
  'api',
  'live-chat',
  'profile',
  'security',
  'appearance',
];

export const SHORTCUTS: readonly ShortcutDef[] = [
  ...SECTION_ORDER.map<ShortcutDef>((section) => ({
    id: section,
    section,
    icon: SECTION_META[section].icon,
    group: SECTION_META[section].group === 'account' ? 'account' : 'workspace',
  })),
  ...PAGES.map<ShortcutDef>((p) => ({
    id: `page:${p.id}`,
    href: p.href,
    icon: p.icon,
    group: p.group,
    pageAccess: p.pageAccess,
    external: p.external,
  })),
];

const BY_ID = new Map<string, ShortcutDef>(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: string): ShortcutDef | undefined {
  return BY_ID.get(id);
}

/** What a new user sees, before they customise anything. */
export const DEFAULT_SHORTCUTS: readonly ShortcutId[] = [
  'whatsapp',
  'members',
  'billing',
  'ai-connectors',
  'quick-replies',
  'fields',
  'deals',
  'page:templates',
  'page:broadcasts',
  'page:automations',
  'api',
  'appearance',
];

export type ShortcutView = 'cards' | 'compact';

export interface ShortcutLayout {
  items: ShortcutId[];
  view: ShortcutView;
}

export const DEFAULT_LAYOUT: ShortcutLayout = {
  items: [...DEFAULT_SHORTCUTS],
  view: 'cards',
};

/**
 * Clean a stored layout: drop unknown or duplicate ids, keep the order.
 * An empty list is valid (the user removed everything on purpose).
 */
export function normaliseLayout(raw: unknown): ShortcutLayout {
  if (!raw || typeof raw !== 'object')
    return { ...DEFAULT_LAYOUT, items: [...DEFAULT_LAYOUT.items] };
  const r = raw as { items?: unknown; view?: unknown };
  const seen = new Set<string>();
  const items: ShortcutId[] = [];
  if (Array.isArray(r.items)) {
    for (const id of r.items) {
      if (typeof id === 'string' && BY_ID.has(id) && !seen.has(id)) {
        seen.add(id);
        items.push(id as ShortcutId);
      }
    }
  } else {
    items.push(...DEFAULT_LAYOUT.items);
  }
  const view: ShortcutView = r.view === 'compact' ? 'compact' : 'cards';
  return { items, view };
}

/** Move the item at `from` to `to` (both clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export function storageKey(userId: string): string {
  return `replai.settings.shortcuts.v1:${userId}`;
}
