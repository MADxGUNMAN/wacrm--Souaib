'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronDown, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { hasSectionAccess, canAccessSettingsSection } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import {
  RAIL_GROUPS,
  SECTION_META,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './settings-sections';

// Width at/above which the rail is a vertical column (already in view, so
// no auto-scroll needed). Mirrors the Tailwind `lg:` breakpoint that
// drives the row→column switch in the markup below — keep the two in sync.
const RAIL_DESKTOP_MIN_PX = 1024;

type RailGroup = (typeof RAIL_GROUPS)[number]['group'];

const GROUP_ICONS = {
  account: UserRound,
  workspace: Building2,
} as const;

/**
 * The settings left rail. On desktop it follows the Super Admin hierarchy:
 * a top-level Overview link followed by collapsible Account and Workspace
 * parent rows with indented children and vertical guide rails. On narrow
 * screens all permitted sections remain in the existing horizontal scroller.
 */
export function SettingsRail({
  active,
  hints,
}: {
  active: SettingsSection;
  hints?: Partial<Record<SettingsSection, ReactNode>>;
}) {
  const t = useTranslations('Settings');
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [groupExpansion, setGroupExpansion] = useState<
    Partial<Record<RailGroup, boolean>>
  >({});
  const { profile } = useAuth();
  const canAccessSettings = hasSectionAccess(
    profile?.account_role,
    profile?.permissions,
    'settings'
  );

  // When horizontal (mobile), keep the active chip in view. On desktop
  // the rail is a static column, so skip.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia(`(min-width: ${RAIL_DESKTOP_MIN_PX}px)`).matches)
      return;
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [active]);

  const toggleGroup = (group: RailGroup, expanded: boolean) => {
    setGroupExpansion((current) => ({
      ...current,
      [group]: !expanded,
    }));
  };

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        'border-border flex [scrollbar-width:none] gap-1 overflow-x-auto border-b pb-2 [&::-webkit-scrollbar]:hidden',
        'lg:sticky lg:top-4 lg:block lg:overflow-visible lg:border-b-0 lg:pb-0'
      )}
    >
      {RAIL_GROUPS.map(({ label, group }) => {
        if (!canAccessSettings && (group === 'top' || group === 'workspace')) {
          return null;
        }

        const items = SETTINGS_SECTIONS.filter(
          (section) =>
            SECTION_META[section].group === group &&
            canAccessSettingsSection(
              profile?.account_role,
              profile?.permissions,
              section
            )
        );
        if (items.length === 0) return null;

        const nested = group !== 'top';
        const groupIsActive = items.includes(active);
        const expanded = groupExpansion[group] ?? groupIsActive;
        const GroupIcon = nested ? GROUP_ICONS[group] : null;
        const panelId = `settings-nav-${group}`;

        return (
          <section
            key={group}
            className={cn(
              'flex shrink-0 gap-1 lg:block',
              !nested && 'lg:border-border/70 lg:mb-4 lg:border-b lg:pb-4'
            )}
          >
            {nested && label && GroupIcon ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleGroup(group, expanded)}
                className={cn(
                  'hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors lg:flex',
                  groupIsActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <GroupIcon
                  className={cn(
                    'size-4 shrink-0',
                    groupIsActive && 'text-primary'
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {t(`groups.${group}`)}
                </span>
                <ChevronDown
                  className={cn(
                    'text-muted-foreground/70 size-4 shrink-0 transition-transform duration-200',
                    expanded && 'text-muted-foreground rotate-180'
                  )}
                  aria-hidden="true"
                />
              </button>
            ) : null}

            <div
              id={panelId}
              className={cn(
                'flex shrink-0 gap-1',
                nested
                  ? 'lg:border-border lg:mt-0.5 lg:ml-5 lg:flex-col lg:gap-0.5 lg:border-l lg:py-1 lg:pl-2'
                  : 'lg:flex-col lg:gap-1',
                nested && !expanded && 'lg:hidden'
              )}
            >
              {items.map((section) => {
                const meta = SECTION_META[section];
                const Icon = meta.icon;
                const isActive = section === active;

                return (
                  <Link
                    key={section}
                    ref={isActive ? activeRef : undefined}
                    href={`/settings?tab=${section}`}
                    replace
                    scroll={false}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors duration-200',
                      'lg:w-full lg:gap-3',
                      !nested && 'lg:py-2.5',
                      isActive
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        isActive && 'text-primary'
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {t(`sections.${section}`)}
                    </span>
                    {hints?.[section] != null ? (
                      <span
                        className={cn(
                          'hidden items-center gap-1.5 text-xs lg:inline-flex',
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {hints[section]}
                      </span>
                    ) : null}
                    {isActive && nested ? (
                      <span
                        className="bg-primary hidden size-1.5 shrink-0 rounded-full lg:block"
                        aria-hidden="true"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
