import { getSiteSettings, getLegalPagesList } from "@/lib/cms/queries";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";

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
  const [settings, legalPages] = await Promise.all([
    getSiteSettings(),
    getLegalPagesList(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden">
      <LandingNavbar
        siteName={settings?.site_name}
        logoUrl={settings?.logo_url}
        links={settings?.header_links}
      />
      <main className="pt-28 pb-16">{children}</main>
      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
