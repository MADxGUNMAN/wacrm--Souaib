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

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogOut, Mail, RefreshCw, ShieldCheck } from 'lucide-react';

import { useSubscription } from '@/hooks/use-subscription';
import { createClient } from '@/lib/supabase/client';

export default function SubscriptionRequiredPage() {
  const router = useRouter();
  const { data, loading, error, refresh } = useSubscription();

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
    window.location.href = '/login';
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
        `Action needed: ${accountName || 'our workspace'} subscription has expired`,
      )}&body=${encodeURIComponent(
        `Hi ${owner.name},\n\nOur Replai workspace${
          accountName ? ` (${accountName})` : ''
        } is currently locked because the subscription has ended, so the team can't access the CRM.\n\nCould you renew it when you get a moment?\n\nThanks!`,
      )}`
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Brand — muted, so it reads as "your app, paused" rather than a
            marketing page. */}
        <div className="mb-10 flex items-center justify-center gap-2.5 opacity-70">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="" className="size-8 object-contain" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Replai
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Lock className="size-6 text-amber-500" />
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {copy?.heading ?? 'This workspace needs an active subscription'}
          </h1>

          {copy?.body ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {copy.body}
            </p>
          ) : null}

          {/* Owner contact card. Absent when the platform admin turned
              `member_blocked_show_owner_contact` off — the server withholds
              the details entirely in that case, so there is nothing to
              leak here. */}
          {owner ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Workspace owner
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                {owner.name}
              </p>
              {owner.email ? (
                <p className="text-sm text-muted-foreground">{owner.email}</p>
              ) : null}
            </div>
          ) : null}

          {planName ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Last active plan:{' '}
              <span className="font-medium text-foreground">{planName}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            {mailtoHref ? (
              <a
                href={mailtoHref}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Mail className="size-4" />
                {copy?.contactLabel ?? 'Email account owner'}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <RefreshCw className="size-4" />
              Check again
            </button>
          </div>

          {copy?.note ? (
            <div className="mt-6 flex items-start gap-2.5 border-t border-border pt-5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {copy.note}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-xs text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
