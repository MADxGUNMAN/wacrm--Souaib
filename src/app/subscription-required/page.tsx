'use client';

// ============================================================
// /subscription-required — where a blocked NON-OWNER lands.
//
// Only the account owner can purchase, so sending a member to the
// pricing page would be a dead end: a form they're forbidden from
// submitting. They get this instead — what happened, who can fix it, and
// a one-click way to nudge them.
//
// Every string is admin-authored (`subscription_settings.member_blocked_*`)
// and resolved server-side, placeholders already substituted, so this
// component renders text without knowing the template vocabulary.
//
// Deliberately outside the (dashboard) route group: no sidebar, no
// header, nothing that implies the CRM is usable.
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogOut, Mail, RefreshCw, ShieldCheck } from 'lucide-react';

import {
  useSubscription,
  resetSubscriptionStore,
} from '@/hooks/use-subscription';
import { createClient } from '@/lib/supabase/client';

export default function SubscriptionRequiredPage() {
  const router = useRouter();
  const { data, loading, error, refresh } = useSubscription();
  const [iconUrl, setIconUrl] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('Replai');

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch('/api/public/settings', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.settings?.favicon_url) setIconUrl(json.settings.favicon_url);
          if (json.settings?.site_name) setSiteName(json.settings.site_name);
        }
      } catch {
        // Silently ignore
      }
    }
    loadBranding();
  }, []);

  // Self-healing: if the owner pays while this tab is open, the member
  // shouldn't have to work out that they need to reload. Once the
  // snapshot says unblocked, move them straight back into the CRM.
  useEffect(() => {
    if (data && !data.state.isBlocked) {
      router.replace('/dashboard');
    }
  }, [data, router]);

  // An owner who lands here (bookmark, shared link) belongs on the
  // pricing page — they can actually act there.
  useEffect(() => {
    if (data?.isOwner && data.state.isBlocked) {
      router.replace('/upgrade-plan');
    }
  }, [data, router]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetSubscriptionStore();
    window.location.replace('/login');
  };

  if (loading && !data) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  const copy = data?.copy.memberBlocked;
  const owner = data?.owner ?? null;
  const accountName = data?.account.name ?? '';
  const planName = data?.subscription?.planName ?? null;

  // Prefilled so the member doesn't have to compose it. `encodeURIComponent`
  // on both parts — an account name with an ampersand would otherwise
  // truncate the body.
  const mailtoHref = owner?.email
    ? `mailto:${owner.email}?subject=${encodeURIComponent(
        `Action needed: ${accountName || 'our workspace'} subscription has expired`
      )}&body=${encodeURIComponent(
        `Hi ${owner.name},\n\nOur ${siteName} workspace${
          accountName ? ` (${accountName})` : ''
        } is currently locked because the subscription has ended, so the team can't access the CRM.\n\nCould you renew it when you get a moment?\n\nThanks!`
      )}`
    : null;

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Brand — muted, so it reads as "your app, paused" rather than a
            marketing page. */}
        <div className="mb-10 flex items-center justify-center gap-2.5 opacity-70">
          {iconUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={iconUrl}
              alt={siteName}
              className="size-8 object-contain"
            />
          ) : null}
          <span className="text-foreground text-lg font-bold tracking-tight">
            {siteName}
          </span>
        </div>

        <div className="border-border bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Lock className="size-6 text-amber-500" />
          </div>

          <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            {copy?.heading ?? 'This workspace needs an active subscription'}
          </h1>

          {copy?.body ? (
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              {copy.body}
            </p>
          ) : null}

          {/* Owner contact card. Absent when the platform admin turned
              `member_blocked_show_owner_contact` off — the server withholds
              the details entirely in that case, so there is nothing to
              leak here. */}
          {owner ? (
            <div className="border-border bg-muted/40 mt-6 rounded-xl border p-4">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
                Workspace owner
              </p>
              <p className="text-foreground mt-1.5 text-sm font-medium">
                {owner.name}
              </p>
              {owner.email ? (
                <p className="text-muted-foreground text-sm">{owner.email}</p>
              ) : null}
            </div>
          ) : null}

          {planName ? (
            <p className="text-muted-foreground mt-4 text-xs">
              Last active plan:{' '}
              <span className="text-foreground font-medium">{planName}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            {mailtoHref ? (
              <a
                href={mailtoHref}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                <Mail className="size-4" />
                {copy?.contactLabel ?? 'Email account owner'}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh()}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <RefreshCw className="size-4" />
              Check again
            </button>
          </div>

          {copy?.note ? (
            <div className="border-border mt-6 flex items-start gap-2.5 border-t pt-5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                {copy.note}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive mt-4 text-xs">{error}</p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
