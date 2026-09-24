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
import { WhatsAppSettings } from '@/components/settings/whatsapp-settings';

import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { AppIntegrations } from '@/components/settings/app-integrations';
import { UsageAlertsPanel } from '@/components/settings/usage-alerts-panel';
import { OptInOutPanel } from '@/components/settings/opt-in-out-panel';
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
    <Suspense
      fallback={
        <div className="text-muted-foreground p-6 text-sm">
          Loading settings...
        </div>
      }
    >
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
  const canAccessSettings = hasSectionAccess(
    profile?.account_role,
    profile?.permissions,
    'settings'
  );
  const canAccessThisSection = canAccessSettingsSection(
    profile?.account_role,
    profile?.permissions,
    rawSection
  );
  const section =
    (!canAccessSettings && SECTION_META[rawSection]?.group !== 'account') ||
    !canAccessThisSection
      ? 'profile'
      : rawSection;

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    // `mode` belongs to the WhatsApp section's guided/manual tab. Leaving it
    // behind would pin a stale sub-tab onto the next section you open.
    params.delete('mode');
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (!loading && profile) {
      if (
        (!canAccessSettings && SECTION_META[rawSection]?.group !== 'account') ||
        !canAccessSettingsSection(
          profile.account_role,
          profile.permissions,
          rawSection
        )
      ) {
        go('profile');
      }
    }
  }, [loading, profile, canAccessSettings, rawSection]);

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      whatsapp: (
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-600 shadow-sm dark:text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          ONLINE
        </span>
      ),
      security: (
        <span className="text-muted-foreground/80 group-hover:text-muted-foreground flex items-center gap-1 text-[10px] font-medium transition-colors">
          <svg
            className="h-3 w-3 opacity-75"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
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
    whatsapp: <WhatsAppSettings />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
    integrations: <AppIntegrations />,
    alerts: <UsageAlertsPanel />,
    'opt-out': <OptInOutPanel />,
  };

  return (
    <div>
      <p className="text-muted-foreground text-sm">{t('pageDesc')}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[256px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <SettingsRail active={section} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
