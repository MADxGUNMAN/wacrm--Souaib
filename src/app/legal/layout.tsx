import { getSiteSettings, getLegalPagesList } from "@/lib/cms/queries";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, legalPages] = await Promise.all([
    getSiteSettings(),
    getLegalPagesList(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
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
