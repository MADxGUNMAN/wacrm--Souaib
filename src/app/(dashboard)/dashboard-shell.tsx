'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { hasSectionAccess } from '@/lib/auth/roles';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { SupportTitleSignal } from '@/components/support-chat/support-title-signal';
import { SupportChatWidget } from '@/components/support-chat/support-chat-widget';
import { TrialBanner } from '@/components/billing/trial-banner';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAccountBanned, bannedReason, signOut } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const mainSection = pathname.split('/')[1] || 'dashboard';
  const isProtectedSection = [
    'inbox',
    'dashboard',
    'contacts',
    'pipelines',
    'broadcasts',
    'automations',
    'settings',
  ].includes(mainSection);
  const isSectionAllowed =
    mainSection === 'settings' ||
    hasSectionAccess(profile?.account_role, profile?.permissions, mainSection);

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (
      !loading &&
      user &&
      profile &&
      isProtectedSection &&
      !isSectionAllowed
    ) {
      const allowed = [
        'inbox',
        'contacts',
        'pipelines',
        'broadcasts',
        'automations',
        'dashboard',
      ].find((s) =>
        hasSectionAccess(profile.account_role, profile.permissions, s)
      );
      router.push(`/${allowed || 'inbox'}`);
    }
  }, [user, loading, profile, isProtectedSection, isSectionAllowed, router]);

  if (loading) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (isProtectedSection && profile && !isSectionAllowed) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-foreground text-base font-medium">
            Access Restricted
          </p>
          <p className="text-muted-foreground text-sm">
            You do not have permission to access this section.
          </p>
        </div>
      </div>
    );
  }

  if (profile && profile.is_active === false) {
    return (
      <div className="bg-background flex h-screen items-center justify-center p-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-foreground text-lg font-semibold">
              Account Suspended
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Your access to this workspace has been temporarily suspended by an
              administrator. Please contact your account owner for more
              information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -- Account-level ban (set by super admin via the super admin panel) --
  if (isAccountBanned) {
    return (
      <div className="bg-background flex h-screen items-center justify-center p-4">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-foreground text-xl font-bold">
              Account Banned
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              This workspace has been suspended by the platform administrator.
              All members of this workspace are unable to access CRM features
              until the ban is lifted.
            </p>
            {bannedReason && (
              <div className="mt-4 rounded-lg border border-red-500/10 bg-red-500/5 p-3">
                <p className="mb-1 text-xs font-medium tracking-wider text-red-400 uppercase">
                  Reason
                </p>
                <p className="text-muted-foreground text-sm">{bannedReason}</p>
              </div>
            )}
            <p className="text-muted-foreground mt-4 text-xs">
              If you believe this is an error, please contact support at{' '}
              <a
                href="mailto:support@junkiescoder.com"
                className="text-primary hover:underline"
              >
                support@junkiescoder.com
              </a>
            </p>
          </div>
          <button
            onClick={signOut}
            className="mt-2 rounded-lg bg-red-500/10 px-6 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Auto-collapse the sidebar when the user is on the Inbox page —
  // the inbox has its own conversation list + thread + contact panel,
  // so the full sidebar label text wastes valuable horizontal space.
  const isInbox = pathname === '/inbox' || pathname.startsWith('/inbox');

  return (
    // App shell: the ONLY scroll container is <main>. `fixed inset-0` (not
    // `h-screen`) makes the root a positioned box, and `relative` on <main>
    // keeps absolutely-positioned descendants (e.g. `sr-only` labels) inside
    // the scroll area. Without both, such an element sized itself against the
    // page instead, made the document taller than the viewport and produced
    // a second, window-level scrollbar. `data-app-shell` also locks the
    // document scroll in globals.css as a backstop.
    <div
      data-app-shell
      className="bg-background fixed inset-0 flex overflow-hidden"
    >
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />

      {/* Mirrors unread support replies into the tab title, so a reply is
          noticeable from another browser tab. Headless — renders nothing. */}
      <SupportTitleSignal />

      {/* Floating Live chat bubble. Renders nothing unless Replai offers
          Live chat to this workspace and the user hasn't hidden it. */}
      <SupportChatWidget />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={isInbox} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <TrialBanner />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

import { FloatingChatsProvider } from '@/components/inbox/floating-chats-context';
import { FloatingChatsRenderer } from '@/components/inbox/floating-chats-renderer';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FloatingChatsProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
        <FloatingChatsRenderer />
      </FloatingChatsProvider>
    </AuthProvider>
  );
}
