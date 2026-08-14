'use client';

import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { hasSectionAccess, canAccessSettingsSection } from '@/lib/auth/roles';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { BillingSettings } from '@/components/settings/billing-settings';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { WhatsAppSetup } from '@/components/settings/whatsapp-setup';
import { MetaSDKProvider } from '@/components/providers/meta-sdk-provider';

import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import {
  RELOCATED_SECTIONS,
  SECTION_META,
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=whatsapp`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading settings...</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, profile, loading } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const tabParam = searchParams.get('tab');
  const rawSection = resolveSection(tabParam);

  // Sections that graduated to their own route. Without this an old
  // bookmark to ?tab=templates would quietly land on Overview and look
  // like the feature had been removed.
  const relocatedTo = tabParam ? RELOCATED_SECTIONS[tabParam] : undefined;
  useEffect(() => {
    if (relocatedTo) router.replace(relocatedTo);
  }, [relocatedTo, router]);
  const canAccessSettings = hasSectionAccess(profile?.account_role, profile?.permissions, 'settings');
  const canAccessThisSection = canAccessSettingsSection(profile?.account_role, profile?.permissions, rawSection);
  const section = (!canAccessSettings && SECTION_META[rawSection]?.group !== 'account') || !canAccessThisSection ? 'profile' : rawSection;

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!loading && profile) {
      if ((!canAccessSettings && SECTION_META[rawSection]?.group !== 'account') || !canAccessSettingsSection(profile.account_role, profile.permissions, rawSection)) {
        go('profile');
      }
    }
  }, [loading, profile, canAccessSettings, rawSection]);

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      'whatsapp': (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium tracking-wide shadow-sm border border-emerald-500/20 text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          ONLINE
        </span>
      ),
      'security': (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80 group-hover:text-muted-foreground font-medium transition-colors">
          <svg className="w-3 h-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          2FA
        </span>
      ),
    }),
    []
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    billing: <BillingSettings />,
    'whatsapp-setup': (
      <MetaSDKProvider appId={process.env.NEXT_PUBLIC_META_APP_ID || '3141459766059334'}>
        <WhatsAppSetup />
      </MetaSDKProvider>
    ),
    whatsapp: <WhatsAppConfig />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pageDesc')}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
