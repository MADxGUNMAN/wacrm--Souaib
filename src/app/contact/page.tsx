import { Metadata } from 'next';
import {
  getSiteSettings,
  getContactPageSettings,
  getLegalPagesList,
} from '@/lib/cms/queries';
import { createClient } from '@/lib/supabase/server';
import { resolveSubscriptionState } from '@/lib/subscription/status';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ContactSection } from '@/components/landing/ContactSection';
import { UpgradeHeader } from '@/components/billing/upgrade-header';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const isNoIndex = settings?.no_index ?? false;

  return {
    title: `Contact Us | ${settings?.site_name || 'Replai'}`,
    description: `Get in touch with the ${settings?.site_name || 'Replai'} team. We'd love to hear from you — reach out for support, partnerships, or general inquiries.`,
    openGraph: {
      title: `Contact Us | ${settings?.site_name || 'Replai'}`,
      description: `Contact the ${settings?.site_name || 'Replai'} team for support, partnerships, or questions about our AI-powered WhatsApp CRM.`,
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
    robots: {
      index: !isNoIndex,
      follow: !isNoIndex,
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let backHref = '/upgrade-plan';
  let backLabel = 'Back to plans';
  let userName = '';
  const userEmail = user?.email || '';

  if (user) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, account_id, is_super_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.full_name) {
        userName = profile.full_name;
      }

      if (profile?.is_super_admin) {
        backHref = '/super-admin';
        backLabel = 'Back to super admin';
      } else if (profile?.account_id) {
        const { data: account } = await supabase
          .from('accounts')
          .select('subscription_status, trial_ends_at, subscription_ends_at')
          .eq('id', profile.account_id)
          .maybeSingle();

        if (account) {
          const state = resolveSubscriptionState(account);
          if (!state.isBlocked) {
            backHref = '/dashboard';
            backLabel = 'Back to dashboard';
          }
        }
      }
    } catch {
      // Fallback backHref to /upgrade-plan
    }
  }

  const [settings, contactSettings, legalPages] = await Promise.all([
    getSiteSettings(),
    getContactPageSettings(),
    getLegalPagesList(),
  ]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-slate-900 antialiased">
      {user ? (
        <UpgradeHeader backButton={{ href: backHref, label: backLabel }} />
      ) : (
        <LandingNavbar
          siteName={settings?.site_name}
          logoUrl={settings?.logo_url}
          links={settings?.header_links}
        />
      )}

      <main className="flex flex-1 flex-col">
        <ContactSection
          settings={contactSettings}
          siteName={settings?.site_name}
          initialName={userName}
          initialEmail={userEmail}
          isAuthenticated={!!user}
        />
      </main>

      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
