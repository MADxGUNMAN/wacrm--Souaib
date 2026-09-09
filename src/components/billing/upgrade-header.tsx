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
import { useBranding } from '@/hooks/use-branding';
import { resetSubscriptionStore } from '@/hooks/use-subscription';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function UpgradeHeader({
  backButton,
}: {
  backButton?: { href: string; label: string } | null;
}) {
  const { faviconUrl: iconUrl, siteName } = useBranding();
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out of your account?',
      description:
        'Are you sure you want to sign out? You will need to sign in again to access your workspace.',
      confirmText: 'Sign out',
      cancelText: 'Cancel',
      variant: 'destructive',
      icon: LogOut,
    });
    if (!ok) return;

    const supabase = createClient();
    await supabase.auth.signOut();
    resetSubscriptionStore();
    // Replace history entry rather than pushing: prevents the browser's
    // back button from returning to the protected page after logging out.
    window.location.replace('/login');
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <Link
        href={backButton?.href ?? '/upgrade-plan'}
        className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        {iconUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={iconUrl} alt={siteName} className="size-8 object-contain" />
        ) : null}
        <span className="text-foreground text-lg font-bold tracking-tight">
          {siteName}
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {backButton ? (
          <Link
            href={backButton.href}
            className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold shadow-sm transition-all"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{backButton.label}</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold shadow-sm transition-all"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
