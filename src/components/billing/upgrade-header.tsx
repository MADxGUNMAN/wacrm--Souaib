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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

export function UpgradeHeader({
  backButton,
}: {
  backButton?: { href: string; label: string } | null;
}) {
  const [iconUrl, setIconUrl] = useState<string>('/logo-icon.png');
  const [siteName, setSiteName] = useState<string>('Replai');

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch('/api/super-admin/cms/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.favicon_url) setIconUrl(data.settings.favicon_url);
          if (data.settings?.site_name) setSiteName(data.settings.site_name);
        }
      } catch (err) {
        console.error('Failed to load branding in UpgradeHeader:', err);
      }
    }
    loadBranding();
  }, []);

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
      <Link href={backButton?.href ?? '/upgrade-plan'} className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt={siteName} className="size-8 object-contain" />
        <span className="text-lg font-bold tracking-tight text-foreground">
          {siteName}
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {backButton ? (
          <Link
            href={backButton.href}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{backButton.label}</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition-all hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
