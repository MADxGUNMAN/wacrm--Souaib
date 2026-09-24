'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { SuperAdminSidebar } from '@/components/super-admin/sidebar';
import { SuperAdminHeader } from '@/components/super-admin/header';

function SuperAdminShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isSuperAdmin } = useAuth();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // Redirect to normal dashboard if not a super admin
    if (!loading && user && profile && !isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, profile, isSuperAdmin, router]);

  if (loading) {
    return (
      <div className="bg-background fixed inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <div
      data-mode="light"
      className="fixed inset-0 flex overflow-hidden bg-slate-50 text-slate-900"
    >
      <SuperAdminSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SuperAdminHeader onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
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
