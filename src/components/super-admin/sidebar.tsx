'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/hooks/use-branding';
import {
  Activity,
  Bell,
  ChevronDown,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  LifeBuoy,
  LogOut,
  Mail,
  Newspaper,
  Send,
  Settings,
  Table2,
  Tag,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface SuperAdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const dashboardItem: NavItem = {
  href: '/super-admin',
  label: 'Dashboard',
  icon: LayoutDashboard,
};

const navGroups: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Users,
    items: [{ href: '/super-admin/accounts', label: 'Accounts', icon: Users }],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: CreditCard,
    items: [
      { href: '/super-admin/payments', label: 'Payments', icon: CreditCard },
      { href: '/super-admin/plans', label: 'Plans & Pricing', icon: Tag },
    ],
  },
  {
    id: 'content',
    label: 'Content & Communication',
    icon: FileText,
    items: [
      { href: '/super-admin/cms', label: 'CMS & Landing', icon: FileText },
      {
        href: '/super-admin/template-library',
        label: 'Template Library',
        icon: LibraryBig,
      },
      {
        href: '/super-admin/contact-submissions',
        label: 'Contact submissions',
        icon: Mail,
      },
      { href: '/super-admin/auto-mail', label: 'Auto Mail', icon: Send },
      { href: '/super-admin/newsletter', label: 'Newsletter', icon: Newspaper },
    ],
  },
  {
    id: 'sheets-addon',
    label: 'Sheet Add-on',
    icon: Table2,
    items: [
      {
        href: '/super-admin/sheets-addon/help',
        label: 'Help Content',
        icon: LifeBuoy,
      },
      {
        href: '/super-admin/sheets-addon/reports',
        label: 'Issue Reports',
        icon: Inbox,
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: Activity,
    items: [
      { href: '/super-admin/health', label: 'Health', icon: Activity },
      {
        href: '/super-admin/notifications',
        label: 'Notifications',
        icon: Bell,
      },
      { href: '/super-admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === '/super-admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
  nested?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
        nested ? 'px-3 py-2' : 'px-3 py-2.5',
        active
          ? 'bg-[#25D366]/10 text-[#159947]'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-[#159947]')} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active && nested ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#25D366]"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

export function SuperAdminSidebar({ open, onClose }: SuperAdminSidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { faviconUrl, siteName } = useBranding();
  const confirm = useConfirm();
  const [groupExpansion, setGroupExpansion] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  const toggleGroup = (groupId: string, isExpanded: boolean) => {
    setGroupExpansion((current) => ({
      ...current,
      [groupId]: !isExpanded,
    }));
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out of Super Admin?',
      description:
        'You will need to sign in again to access the admin dashboard.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      variant: 'destructive',
      icon: LogOut,
    });
    if (ok) signOut();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        aria-label="Super admin navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white px-4 py-6 shadow-2xl transition-transform duration-300 lg:static lg:w-64 lg:translate-x-0 lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-6 flex items-center justify-between gap-3 px-2">
          <div className="flex min-w-0 items-center gap-3">
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt={siteName}
                className="h-10 w-10 shrink-0 object-contain"
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight text-[#25D366]">
                {siteName}
              </h1>
              <p className="text-xs font-medium text-slate-500">Super Admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-slate-500 hover:text-slate-900 lg:hidden"
            onClick={onClose}
          >
            <span className="sr-only">Close navigation menu</span>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav
          className="scrollbar-sidebar flex-1 overflow-y-auto pr-1"
          aria-label="Main navigation"
        >
          <div className="space-y-1">
            <SidebarLink
              item={dashboardItem}
              pathname={pathname}
              onNavigate={onClose}
            />
          </div>

          <div className="my-4 border-t border-slate-100" />

          <div className="space-y-1.5">
            {navGroups.map((group) => {
              const groupIsActive = group.items.some((item) =>
                isActive(pathname, item.href)
              );
              // Active groups default to open for direct/deep links. An
              // explicit user toggle remains respected while staying here.
              const expanded = groupExpansion[group.id] ?? groupIsActive;
              const GroupIcon = group.icon;
              const panelId = `super-admin-nav-${group.id}`;

              return (
                <section key={group.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleGroup(group.id, expanded)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                      groupIsActive
                        ? 'text-slate-900'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    )}
                  >
                    <GroupIcon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        groupIsActive && 'text-[#159947]'
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {group.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                        expanded && 'rotate-180 text-slate-600'
                      )}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    id={panelId}
                    hidden={!expanded}
                    className="mt-0.5 ml-5 border-l border-slate-200 pl-2"
                  >
                    <div className="space-y-0.5 py-1">
                      {group.items.map((item) => (
                        <SidebarLink
                          key={item.href}
                          item={item}
                          pathname={pathname}
                          onNavigate={onClose}
                          nested
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
