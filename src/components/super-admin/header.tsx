'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Menu,
  Bell,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileWarning,
  Loader2,
  Mail,
  Megaphone,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useSuperAdminNotifications,
  type SuperAdminNotificationType,
} from '@/hooks/use-super-admin-notifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SuperAdminHeaderProps {
  onOpenSidebar: () => void;
}

function relativeTime(ts: string): string {
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Per-type glyph and tint.
 *
 * Driven by the notification's own `type`, which the database CHECK
 * constrains, so a new type added in a migration shows up here as the
 * neutral fallback rather than crashing.
 */
function notificationIcon(type: SuperAdminNotificationType) {
  switch (type) {
    case 'account_created':
      return <UserPlus className="h-3.5 w-3.5 text-emerald-500" />;
    case 'account_banned':
      return <Ban className="h-3.5 w-3.5 text-red-500" />;
    case 'payment_requested':
      return <CreditCard className="h-3.5 w-3.5 text-amber-500" />;
    case 'payment_verified':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'payment_rejected':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'contact_submitted':
      return <Mail className="h-3.5 w-3.5 text-blue-500" />;
    case 'newsletter_subscribed':
      return <Megaphone className="h-3.5 w-3.5 text-purple-500" />;
    case 'template_rejected':
      return <FileWarning className="h-3.5 w-3.5 text-amber-500" />;
    case 'subscription_expiring':
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return <Building2 className="h-3.5 w-3.5 text-slate-400" />;
  }
}

function getSuperAdminTitle(pathname: string): {
  title: string;
  subtitle: string;
} {
  if (
    pathname.startsWith('/super-admin/accounts/') &&
    pathname !== '/super-admin/accounts'
  ) {
    return {
      title: 'Account Deep Dive',
      subtitle:
        'Inspect tenant metrics, team members, WABA connection, and logs',
    };
  }
  if (pathname.startsWith('/super-admin/accounts')) {
    return {
      title: 'Accounts Management',
      subtitle: 'Monitor and manage all tenant workspaces',
    };
  }
  if (pathname.startsWith('/super-admin/payments')) {
    return {
      title: 'Payments & Subscriptions',
      subtitle: 'Verify UPI payments manually and manage active subscriptions',
    };
  }
  if (pathname.startsWith('/super-admin/plans')) {
    return {
      title: 'Plans & Pricing',
      subtitle: 'Configure subscription tiers, limits, and pricing catalogue',
    };
  }
  if (pathname.startsWith('/super-admin/cms/settings')) {
    return {
      title: 'Global Settings',
      subtitle: 'Manage global site metadata and SEO configuration',
    };
  }
  if (pathname.startsWith('/super-admin/cms/sections')) {
    return {
      title: 'Landing Page Sections',
      subtitle: 'Edit and arrange hero, features, and marketing content',
    };
  }
  if (pathname.startsWith('/super-admin/cms/navigation')) {
    return {
      title: 'Navigation & Menus',
      subtitle: 'Configure header and footer navigation links',
    };
  }
  if (pathname.startsWith('/super-admin/cms/legal/')) {
    return {
      title: 'Edit Legal Document',
      subtitle: 'Update terms, privacy policy, and compliance text',
    };
  }
  if (pathname.startsWith('/super-admin/cms/legal')) {
    return {
      title: 'Legal Documents',
      subtitle: 'Manage Privacy Policy, Terms of Service, and compliance pages',
    };
  }
  if (pathname.startsWith('/super-admin/cms/docs')) {
    return {
      title: 'Documentation CMS',
      subtitle: 'Manage documentation articles, guides, and categories',
    };
  }
  if (pathname.startsWith('/super-admin/cms/contact')) {
    return {
      title: 'Contact Page CMS',
      subtitle: 'Manage contact details, FAQ, and office information',
    };
  }
  if (pathname.startsWith('/super-admin/cms')) {
    return {
      title: 'CMS & Landing Pages',
      subtitle: 'Manage public website content and legal documents',
    };
  }
  if (pathname.startsWith('/super-admin/template-library')) {
    return {
      title: 'Template Library',
      subtitle: 'Pre-built WhatsApp message templates catalogue',
    };
  }
  if (
    pathname.startsWith('/super-admin/contact-submissions') ||
    pathname.startsWith('/super-admin/contact')
  ) {
    return {
      title: 'Contact Submissions',
      subtitle: 'Inquiries and messages submitted from the public website',
    };
  }
  if (pathname.startsWith('/super-admin/auto-mail')) {
    return {
      title: 'Auto Mail',
      subtitle: 'Automated trial and renewal reminder emails',
    };
  }
  if (pathname.startsWith('/super-admin/newsletter')) {
    return {
      title: 'Newsletter Subscribers',
      subtitle: 'Manage email subscriber list and export contacts',
    };
  }
  if (pathname.startsWith('/super-admin/notification')) {
    return {
      title: 'Notification Center',
      subtitle:
        'Monitor important platform events and keep every admin action accounted for',
    };
  }
  if (pathname.startsWith('/super-admin/health')) {
    return {
      title: 'System Health',
      subtitle: 'Platform performance and infrastructure status',
    };
  }
  if (pathname.startsWith('/super-admin/settings')) {
    return {
      title: 'Platform Settings',
      subtitle: 'Global configuration and API limits',
    };
  }
  return {
    title: 'Dashboard',
    subtitle: 'Real-time overview of your Replai platform',
  };
}

export function SuperAdminHeader({ onOpenSidebar }: SuperAdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    unavailable,
    markAllRead,
    markRead,
  } = useSuperAdminNotifications();

  const { title, subtitle } = getSuperAdminTitle(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-slate-200 bg-white/80 px-4 shadow-sm backdrop-blur-md sm:gap-x-6 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="-m-2.5 p-2.5 text-slate-500 hover:text-slate-900 lg:hidden"
        onClick={onOpenSidebar}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      <div className="flex flex-1 items-center justify-between gap-x-4 lg:gap-x-6">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          {/* Notification Bell */}
          {/* Opening the bell no longer clears the badge. Read state is
              a real per-operator row now, so it is only cleared by an
              explicit "Mark all as read" or by opening an item — which
              is why it survives a refresh. */}
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <span className="sr-only">
                {unreadCount > 0
                  ? `View notifications, ${unreadCount} unread`
                  : 'View notifications'}
              </span>
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="bg-primary absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-80 rounded-xl border border-slate-200 bg-white p-0 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                      {unreadCount} unread
                    </span>
                  )}
                </h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-primary text-[11px] font-medium hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : unavailable ? (
                  <div className="flex flex-col items-center justify-center px-6 py-10 text-center text-slate-400">
                    <Bell className="mb-2 h-6 w-6 opacity-40" />
                    <p className="text-xs leading-relaxed">
                      Notifications are not set up on this deployment yet.
                    </p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <CheckCircle2 className="mb-2 h-6 w-6 opacity-40" />
                    <p className="text-xs">You&rsquo;re all caught up</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const body = (
                      <>
                        <div className="mt-0.5 flex-shrink-0 rounded-full bg-slate-100 p-1.5">
                          {notificationIcon(n.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs leading-snug ${
                              n.is_read
                                ? 'text-slate-600'
                                : 'font-semibold text-slate-900'
                            }`}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {n.account_name ? `${n.account_name} · ` : ''}
                            {relativeTime(n.created_at)}
                          </p>
                        </div>
                        {/* Unread dot, not a coloured row: the row still
                            has to be readable once read. */}
                        {!n.is_read && (
                          <span
                            className="bg-primary mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                            aria-label="Unread"
                          />
                        )}
                      </>
                    );

                    const onActivate = () => {
                      void markRead(n.id);
                      setIsOpen(false);
                      if (n.link) router.push(n.link);
                    };

                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={onActivate}
                        className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 ${
                          n.is_read ? '' : 'bg-primary/[0.03]'
                        }`}
                      >
                        {body}
                      </button>
                    );
                  })
                )}
              </div>
              {notifications.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2.5">
                  <Link
                    href="/super-admin/notifications"
                    onClick={() => setIsOpen(false)}
                    className="text-primary text-[11px] font-medium hover:underline"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Separator */}
          <div
            className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-200"
            aria-hidden="true"
          />

          {/* Avatar (name + email only, no actions) */}
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:ring-primary flex items-center gap-2 rounded-full outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900">
              <Avatar className="size-8.5 overflow-hidden rounded-full shadow-xs ring-1 ring-slate-200 dark:ring-slate-700">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? 'Admin avatar'}
                    className="size-full object-cover object-center"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-56 border-slate-200 bg-white text-slate-900 shadow-lg"
            >
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium text-slate-900">
                  {profile?.full_name ?? 'Super Admin'}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {profile?.email ?? ''}
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
