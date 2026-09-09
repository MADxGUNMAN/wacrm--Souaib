import { getSiteSettings, getLegalPagesList } from '@/lib/cms/queries';
import { createClient } from '@/lib/supabase/server';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { UpgradeHeader } from '@/components/billing/upgrade-header';

export default async function LegalLayout({
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
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {user ? (
        <UpgradeHeader
          backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
        />
      ) : (
        <LandingNavbar
          siteName={settings?.site_name}
          logoUrl={settings?.logo_url}
          links={settings?.header_links}
        />
      )}
      <main className={user ? 'px-6 py-8' : 'pt-28 pb-16'}>{children}</main>
      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
