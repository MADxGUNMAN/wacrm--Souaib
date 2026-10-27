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

import { signOutWithAudit } from '@/lib/security/client';
import { ArrowLeft, LogOut } from 'lucide-react';

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

    await signOutWithAudit();
    resetSubscriptionStore();
    // Replace history entry rather than pushing: prevents the browser's
    // back button from returning to the protected page after logging out.
    window.location.replace('/login');
  };

  return (
    <header className="border-border/50 bg-background/80 sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 py-3.5 backdrop-blur-md transition-all sm:px-6">
      <Link
        href={backButton?.href ?? '/upgrade-plan'}
        className="group flex items-center gap-3 transition-opacity hover:opacity-90"
      >
        {iconUrl ? (
          <div className="border-border/60 bg-card/60 flex size-9 items-center justify-center rounded-xl border shadow-xs transition-transform group-hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl}
              alt={siteName}
              className="size-6 object-contain"
            />
          </div>
        ) : null}
        <div className="flex flex-col">
          <span className="text-foreground text-base font-bold tracking-tight">
            {siteName}
          </span>
          <span className="text-muted-foreground hidden text-[10px] font-medium tracking-wide uppercase sm:inline">
            Secure Payment Gateway
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-2.5">
        {backButton ? (
          <Link
            href={backButton.href}
            className="border-border/70 bg-card/80 text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all hover:shadow-sm"
          >
            <ArrowLeft className="size-3.5" />
            <span>{backButton.label}</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="border-border/70 bg-card/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-xs transition-all hover:shadow-sm"
        >
          <LogOut className="size-3.5" />
          Logout
        </button>
      </div>
    </header>
  );
}
