import { getSiteSettings, getLegalPagesList } from '@/lib/cms/queries';
import { createClient } from '@/lib/supabase/server';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { UpgradeHeader } from '@/components/billing/upgrade-header';

/**
 * Chrome for the resource centre.
 *
 * Deliberately identical to src/app/legal/layout.tsx — same navbar, same
 * `pt-28` offset to clear the fixed header, same footer — so /docs reads
 * as part of the marketing site rather than a bolted-on subsite.
 */
export default async function DocsLayout({
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
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900 antialiased">
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
