'use client';

// ============================================================
// Top bar for the purchase flow — brand on the left, escape hatches on
// the right.
//
// The "Back to dashboard" link is conditional on purpose: showing it to
// a BLOCKED owner would be a trap, since Proxy immediately bounces
// them back here. It only appears once the account has access, i.e. when
// someone is voluntarily changing or renewing a live plan.
// ============================================================

import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

export function UpgradeHeader({
  showBackToDashboard = false,
}: {
  showBackToDashboard?: boolean;
}) {
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation rather than router.push: it clears every module-
    // level cache (auth, subscription store) so the next user starts
    // from a genuinely clean slate.
    window.location.href = '/login';
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <Link href={showBackToDashboard ? '/dashboard' : '/upgrade-plan'} className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.png" alt="" className="size-8 object-contain" />
        <span className="text-lg font-bold tracking-tight text-foreground">
          Replai
        </span>
      </Link>

      <div className="flex items-center gap-2">
        {showBackToDashboard ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to dashboard</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
