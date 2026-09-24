'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useBranding } from '@/hooks/use-branding';
import { hasSectionAccess } from '@/lib/auth/roles';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import {
  Bell,
  Crown,
  LayoutDashboard,
  LogOut,
  User,
  UserCog,
  UsersRound,
  X,
  FileText,
  Inbox,
  KanbanSquare,
  Megaphone,
  Cpu,
  Waypoints,
  Sparkles,
  Settings2,
  Settings,
} from 'lucide-react';
import type { AccountRole } from '@/lib/auth/roles';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: 'roleOwner',
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  member: {
    icon: UserCog,
    labelKey: 'roleMember',
    // Neutral slate: the operational default.
    className: 'border-border bg-muted text-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/inbox', labelKey: 'inbox', icon: Inbox },
  { href: '/notifications', labelKey: 'notifications', icon: Bell },
  { href: '/contacts', labelKey: 'contacts', icon: UsersRound },
  { href: '/pipelines', labelKey: 'pipelines', icon: KanbanSquare },
  { href: '/broadcasts', labelKey: 'broadcasts', icon: Megaphone },
  // Sits next to Broadcasts because that is where templates get used —
  // you pick one every time you send. It used to be a Settings tab,
  // which framed it as one-time configuration rather than daily work.
  { href: '/templates', labelKey: 'templates', icon: FileText },
  { href: '/automations', labelKey: 'automations', icon: Cpu },
  { href: '/flows', labelKey: 'flows', icon: Waypoints, beta: true },
  { href: '/agents', labelKey: 'aiAgents', icon: Sparkles },
];

const bottomNavItems = [
  { href: '/settings', labelKey: 'settings', icon: Settings2 },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
  /** When true on desktop (e.g. on the Inbox page), the sidebar collapses to an icon-only strip. */
  collapsed?: boolean;
}

import { useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function Sidebar({
  open = false,
  onClose,
  collapsed = false,
}: SidebarProps) {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const ok = await confirm({
      title: t('confirmSignOutTitle'),
      description: t('confirmSignOutDesc'),
      confirmText: t('confirmSignOutBtn'),
      cancelText: t('confirmCancelBtn'),
      variant: 'destructive',
      icon: LogOut,
    });
    if (ok) {
      signOut();
    }
  };
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading && !!account?.name && account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const { mode } = useTheme();
  const { logoUrl, logoDarkUrl, faviconUrl, siteName, loaded } = useBranding();
  const activeLogo = mode === 'dark' ? logoDarkUrl || logoUrl : logoUrl;

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onClose}
        className={cn(
          'bg-background/70 fixed inset-0 z-30 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      {/* Drawer surface on mobile; persistent column on desktop. */}
      <aside
        className={cn(
          'border-border bg-card fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-all duration-200 ease-out lg:static lg:translate-x-0',
          open ? 'w-72 translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-16' : 'lg:w-64'
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div
          className={cn(
            'border-border flex shrink-0 items-center border-b transition-all',
            collapsed
              ? 'h-16 justify-center px-2 py-3'
              : 'h-20 justify-between gap-2 px-4 py-3'
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center',
              collapsed ? 'justify-center' : 'gap-2'
            )}
          >
            {collapsed ? (
              faviconUrl ? (
                <img
                  src={faviconUrl}
                  alt={siteName}
                  className="h-8 w-8 rounded-lg object-contain"
                />
              ) : activeLogo ? (
                <img
                  src={activeLogo}
                  alt={siteName}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
                  {siteName?.charAt(0) || 'R'}
                </div>
              )
            ) : activeLogo ? (
              <img
                src={activeLogo}
                alt={siteName}
                className="h-12 w-auto max-w-[200px] object-contain"
              />
            ) : !loaded ? (
              <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
            ) : (
              <span className="text-foreground text-xl font-bold tracking-tight">
                {siteName}
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closeMenu')}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Main navigation */}
        <nav
          className={cn(
            'scrollbar-sidebar flex-1 overflow-y-auto py-3',
            collapsed ? 'px-2' : 'px-3'
          )}
        >
          <TooltipProvider delay={80}>
            <ul className="flex flex-col gap-1.5">
              {navItems
                .filter((item) => {
                  const section = item.href.replace('/', '');
                  if (
                    [
                      'dashboard',
                      'inbox',
                      'contacts',
                      'pipelines',
                      'broadcasts',
                      'automations',
                    ].includes(section)
                  ) {
                    return hasSectionAccess(
                      accountRole,
                      profile?.permissions,
                      section
                    );
                  }
                  if (section === 'flows' || section === 'agents') {
                    return hasSectionAccess(
                      accountRole,
                      profile?.permissions,
                      'automations'
                    );
                  }
                  return true;
                })
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' &&
                      pathname.startsWith(item.href));

                  const showUnreadDot =
                    item.href === '/inbox' && totalUnread > 0 && !isActive;

                  const showNotificationBadge =
                    item.href === '/notifications' && unreadNotifications > 0;

                  const label = t(item.labelKey as string);

                  const linkEl = (
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center rounded-xl font-medium transition-all',
                        collapsed
                          ? 'mx-auto h-10 w-10 justify-center'
                          : 'gap-3 px-3 py-2.5 text-sm lg:py-2',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <div className="relative flex items-center justify-center">
                        <item.icon
                          className={cn(collapsed ? 'h-5 w-5' : 'h-4 w-4')}
                        />
                        {collapsed && showUnreadDot && (
                          <span
                            aria-label={t('unreadConversations', {
                              count: totalUnread,
                            })}
                            className="absolute -top-1 -right-1 flex h-2.5 w-2.5"
                          >
                            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                            <span className="bg-primary ring-card relative inline-flex h-2.5 w-2.5 rounded-full ring-2" />
                          </span>
                        )}
                        {collapsed && showNotificationBadge && (
                          <span
                            aria-label={t('unreadNotifications', {
                              count: unreadNotifications,
                            })}
                            className="bg-primary text-primary-foreground ring-card absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ring-2"
                          >
                            {unreadNotifications > 9
                              ? '9+'
                              : unreadNotifications}
                          </span>
                        )}
                      </div>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{label}</span>
                          {item.beta && (
                            <span
                              aria-label={t('beta')}
                              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
                            >
                              {t('beta')}
                            </span>
                          )}
                          {showUnreadDot && (
                            <span
                              aria-label={t('unreadConversations', {
                                count: totalUnread,
                              })}
                              className="relative flex h-2 w-2"
                            >
                              <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
                            </span>
                          )}
                          {showNotificationBadge && (
                            <span
                              aria-label={t('unreadNotifications', {
                                count: unreadNotifications,
                              })}
                              className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                            >
                              {unreadNotifications > 9
                                ? '9+'
                                : unreadNotifications}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger render={linkEl} />
                          <TooltipContent side="right" sideOffset={10}>
                            {label} {item.beta ? '(Beta)' : ''}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        linkEl
                      )}
                    </li>
                  );
                })}
            </ul>

            <div className="border-border my-3 border-t" />

            <ul className="flex flex-col gap-1.5">
              {bottomNavItems
                .filter((item) => {
                  if (item.href === '/settings') {
                    return hasSectionAccess(
                      accountRole,
                      profile?.permissions,
                      'settings'
                    );
                  }
                  return true;
                })
                .map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const label = t(item.labelKey as string);

                  const settingsLink = (
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center rounded-xl font-medium transition-all',
                        collapsed
                          ? 'mx-auto h-10 w-10 justify-center'
                          : 'gap-3 px-3 py-2.5 text-sm lg:py-2',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(collapsed ? 'h-5 w-5' : 'h-4 w-4')}
                      />
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger render={settingsLink} />
                          <TooltipContent side="right" sideOffset={10}>
                            {label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        settingsLink
                      )}
                    </li>
                  );
                })}
            </ul>
          </TooltipProvider>
        </nav>

        {/* User section */}
        <div
          className={cn(
            'border-border shrink-0 border-t',
            collapsed ? 'flex justify-center p-2' : 'p-3'
          )}
        >
          {!collapsed && showAccountStrip && account?.name ? (
            <div className="text-muted-foreground mb-2 flex items-center gap-2 px-3 text-xs">
              <UsersRound className="size-3.5 shrink-0" />
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole
                ? (() => {
                    const meta = ROLE_CHIP[accountRole];
                    const Icon = meta.icon;
                    return (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase ${meta.className}`}
                      >
                        <Icon className="size-3" />
                        {t(meta.labelKey as string)}
                      </span>
                    );
                  })()
                : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted/60 focus:bg-muted/60 data-popup-open:bg-muted/60 flex cursor-pointer items-center rounded-lg transition-colors focus:outline-none',
                collapsed
                  ? 'justify-center p-1'
                  : 'w-full gap-3 px-3 py-2 text-left'
              )}
            >
              <Avatar className="ring-border/60 size-8.5 shrink-0 overflow-hidden rounded-full shadow-xs ring-1 dark:ring-white/15">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t('defaultAvatar')}
                    className="size-full object-cover object-center"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    'U'}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {profile?.full_name ?? t('defaultUser')}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {profile?.email ?? ''}
                  </p>
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={collapsed ? 'center' : 'end'}
              side={collapsed ? 'right' : 'top'}
              sideOffset={collapsed ? 10 : 6}
              className="bg-popover text-popover-foreground ring-border min-w-56"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t('menuProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t('menuSettings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
              >
                <LogOut className="size-4" />
                {t('menuSignOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
