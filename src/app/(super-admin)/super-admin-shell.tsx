"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SuperAdminSidebar } from "@/components/super-admin/sidebar";
import { SuperAdminHeader } from "@/components/super-admin/header";

function SuperAdminShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isSuperAdmin } = useAuth();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    
    // Redirect to normal dashboard if not a super admin
    if (!loading && user && profile && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [user, loading, profile, isSuperAdmin, router]);

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

  if (!user || !isSuperAdmin) return null;

  return (
    <div data-mode="light" className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <SuperAdminSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SuperAdminHeader onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SuperAdminShellInner>{children}</SuperAdminShellInner>
    </AuthProvider>
  );
}
