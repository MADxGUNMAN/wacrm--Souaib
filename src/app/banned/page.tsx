'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resetSubscriptionStore } from '@/hooks/use-subscription';
import { ShieldBan, LogOut, Mail } from 'lucide-react';

export default function BannedPage() {
  const [reason, setReason] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [iconUrl, setIconUrl] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('Replai');

  useEffect(() => {
    async function loadBranding() {
      try {
        const res = await fetch('/api/public/settings', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.settings?.favicon_url) setIconUrl(data.settings.favicon_url);
          if (data.settings?.site_name) setSiteName(data.settings.site_name);
        }
      } catch (err) {
        console.error('Failed to load branding in banned page:', err);
      }
    }
    loadBranding();
  }, []);

  useEffect(() => {
    async function fetchBanInfo() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          window.location.replace('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id')
          .eq('user_id', user.id)
          .single();

        if (profile?.account_id) {
          const { data: account } = await supabase
            .from('accounts')
            .select('name, is_banned, banned_reason')
            .eq('id', profile.account_id)
            .single();

          if (account) {
            if (!account.is_banned) {
              window.location.replace('/dashboard');
              return;
            }
            setAccountName(account.name || 'Your Workspace');
            setReason(account.banned_reason || 'Terms of Service violation');
          }
        }
      } catch (err) {
        console.error('Failed to fetch ban info:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchBanInfo();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetSubscriptionStore();
    window.location.replace('/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0F1A]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#25D366] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0F1A] p-6 text-white">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.08)_0%,rgba(10,15,26,0)_70%)]" />

      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        {/* Logo */}
        <div className="mb-12 flex items-center gap-2.5 opacity-60">
          {iconUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={iconUrl}
              alt={siteName}
              className="h-9 w-9 object-contain"
            />
          ) : null}
          <span className="text-xl font-black tracking-tight text-white/60">
            {siteName}
          </span>
        </div>

        {/* Ban Icon */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
          <ShieldBan className="h-10 w-10 text-red-400" />
        </div>

        {/* Title */}
        <h1 className="mb-3 text-3xl font-bold tracking-tight">
          Account Suspended
        </h1>

        {/* Subtitle */}
        <p className="mb-6 leading-relaxed text-white/50">
          The workspace{' '}
          {accountName && (
            <span className="font-medium text-white/70">
              &quot;{accountName}&quot;
            </span>
          )}{' '}
          has been suspended by a platform administrator. All users in this
          workspace are temporarily unable to access CRM features.
        </p>

        {/* Reason Card */}
        {reason && (
          <div className="mb-8 w-full rounded-xl border border-red-500/10 bg-red-500/5 p-4 text-left">
            <p className="mb-2 text-xs font-medium tracking-wider text-red-400 uppercase">
              Suspension Reason
            </p>
            <p className="text-sm leading-relaxed text-white/60">{reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href="mailto:support@junkiescoder.com"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            <Mail className="h-4 w-4" />
            Contact Support
          </a>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-6 py-3 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>

        {/* Footer note */}
        <p className="mt-10 text-xs text-white/30">
          If you believe this is an error, please reach out to{' '}
          <a
            href="mailto:support@junkiescoder.com"
            className="text-[#25D366]/60 transition-colors hover:text-[#25D366]"
          >
            support@junkiescoder.com
          </a>
        </p>
      </div>
    </div>
  );
}
