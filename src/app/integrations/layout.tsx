import { getSiteSettings, getLegalPagesList } from '@/lib/cms/queries';
import { createClient } from '@/lib/supabase/server';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { UpgradeHeader } from '@/components/billing/upgrade-header';

export const dynamic = 'force-dynamic';

export default async function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [settings, legalPages] = await Promise.all([
    getSiteSettings(),
    getLegalPagesList(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {user ? (
        <UpgradeHeader
          backButton={{ href: '/broadcasts', label: 'Back to dashboard' }}
        />
      ) : (
        <LandingNavbar
          siteName={settings?.site_name}
          logoUrl={settings?.logo_url}
          links={settings?.header_links}
        />
      )}
      <main className={user ? 'px-4 py-8' : 'pt-24 pb-16'}>{children}</main>
      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
