import {
  BadgeCheck,
  BookOpen,
  Bot,
  Code,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Megaphone,
  Rocket,
  Scale,
  Shield,
  Smartphone,
  Sparkles,
  SquareKanban,
  Tags,
  Terminal,
  Users,
  UsersRound,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Allowlisted Lucide icons for CMS-authored icon names.
 *
 * An allowlist rather than a dynamic lookup on purpose: `icon_name` is
 * free text typed by an admin, and resolving it dynamically against the
 * whole Lucide export would either pull the entire icon set into the
 * bundle or crash the page on a typo. Unknown names fall back to
 * {@link FALLBACK_ICON} so a mistake in the CMS costs a generic glyph,
 * never a broken page.
 */
export const DOCS_ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  BookOpen,
  Bot,
  Code,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  GitBranch,
  Inbox,
  // Lucide renamed this glyph from `KanbanSquare` to `SquareKanban`, and
  // only the new name is exported by the installed version. Both keys are
  // mapped because an admin may reasonably type either, and the seeded
  // data uses the older spelling.
  KanbanSquare: SquareKanban,
  SquareKanban,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Megaphone,
  Rocket,
  Scale,
  Shield,
  Smartphone,
  Sparkles,
  Tags,
  Terminal,
  Users,
  UsersRound,
  Workflow,
  Zap,
};

export const FALLBACK_ICON: LucideIcon = Sparkles;

/** Resolve a CMS icon name, tolerating an unknown or empty value. */
export function resolveDocsIcon(name: string | null | undefined): LucideIcon {
  if (!name) return FALLBACK_ICON;
  return DOCS_ICONS[name] ?? FALLBACK_ICON;
}

/** The icon names offered in the Super Admin picker. */
export const DOCS_ICON_NAMES = Object.keys(DOCS_ICONS).sort();
