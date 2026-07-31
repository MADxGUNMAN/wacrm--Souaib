"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { hasSectionAccess } from "@/lib/auth/roles";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAccountBanned, bannedReason, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const mainSection = pathname.split('/')[1] || 'dashboard';
  const isProtectedSection = ["inbox", "dashboard", "contacts", "pipelines", "broadcasts", "automations", "settings"].includes(mainSection);
  const isSectionAllowed = mainSection === "settings" || hasSectionAccess(profile?.account_role, profile?.permissions, mainSection);

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!loading && user && profile && isProtectedSection && !isSectionAllowed) {
      const allowed = ["inbox", "contacts", "pipelines", "broadcasts", "automations", "dashboard"].find(
        (s) => hasSectionAccess(profile.account_role, profile.permissions, s)
      );
      router.push(`/${allowed || "inbox"}`);
    }
  }, [user, loading, profile, isProtectedSection, isSectionAllowed, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (isProtectedSection && profile && !isSectionAllowed) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-foreground">Access Restricted</p>
          <p className="text-sm text-muted-foreground">You do not have permission to access this section.</p>
        </div>
      </div>
    );
  }

  if (profile && profile.is_active === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Account Suspended</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your access to this workspace has been temporarily suspended by an administrator. Please contact your account owner for more information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -- Account-level ban (set by super admin via the super admin panel) --
  if (isAccountBanned) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Account Banned</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              This workspace has been suspended by the platform administrator.
              All members of this workspace are unable to access CRM features
              until the ban is lifted.
            </p>
            {bannedReason && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Reason</p>
                <p className="text-sm text-muted-foreground">{bannedReason}</p>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              If you believe this is an error, please contact support at{" "}
              <a href="mailto:support@junkiescoder.com" className="text-primary hover:underline">
                support@junkiescoder.com
              </a>
            </p>
          </div>
          <button
            onClick={signOut}
            className="mt-2 px-6 py-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

import { FloatingChatsProvider } from "@/components/inbox/floating-chats-context";
import { FloatingChatsRenderer } from "@/components/inbox/floating-chats-renderer";

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
