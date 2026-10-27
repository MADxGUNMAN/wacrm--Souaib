import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicSitemapRoutes, resolveSiteUrl } from '@/lib/cms/sitemap';
import { getSiteSettings, getLegalPagesList } from '@/lib/cms/queries';
import { createClient } from '@/lib/supabase/server';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { UpgradeHeader } from '@/components/billing/upgrade-header';
import { resolveMarketingCopy } from '@/lib/cms/marketing-copy';
import { SitemapExplorer } from '@/components/sitemap/sitemap-explorer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const siteName = settings?.site_name || 'Replai';
  const siteUrl = resolveSiteUrl(settings);

  return {
    title: 'Sitemap',
    description: `Complete directory of all active public pages, tools, native integrations, developer APIs, and legal compliance policies on ${siteName}.`,
    alternates: {
      canonical: `${siteUrl}/sitemap`,
    },
    openGraph: {
      title: `Sitemap — ${siteName}`,
      description: `Explore every public page, tool, and resource on ${siteName}.`,
      url: `${siteUrl}/sitemap`,
      type: 'website',
    },
  };
}

export default async function SitemapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sitemap, settings, legalPages] = await Promise.all([
    getPublicSitemapRoutes(),
    getSiteSettings(),
    getLegalPagesList(),
  ]);

  const siteName = settings?.site_name || 'Replai';

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-slate-900 antialiased selection:bg-[#25D366]/20 selection:text-emerald-900">
      {/* Navigation */}
      {user ? (
        <UpgradeHeader
          backButton={{ href: '/upgrade-plan', label: 'Back to plans' }}
        />
      ) : (
        <LandingNavbar
          siteName={siteName}
          logoUrl={settings?.logo_url}
          links={settings?.header_links}
          ctaLabels={resolveMarketingCopy(settings?.marketing_copy).navbar}
        />
      )}

      {/* Main Page Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-32 pb-16 lg:pt-36 lg:pb-20">
          {/* Ambient Emerald Mesh Glows */}
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-full max-w-5xl -translate-x-1/2 rounded-full bg-gradient-to-b from-[#25D366]/15 via-emerald-100/10 to-transparent blur-[120px]" />
          <div className="pointer-events-none absolute top-1/3 -right-48 -z-10 h-96 w-96 rounded-full bg-emerald-400/10 blur-[100px]" />

          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              {/* Breadcrumbs & Live Counter Pill */}
              <div className="mb-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-900/10 bg-white/80 px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-xs backdrop-blur-md">
                <Link
                  href="/"
                  className="transition-colors hover:text-emerald-700"
                >
                  Home
                </Link>
                <span className="text-slate-300">/</span>
                <span className="font-bold text-emerald-800">Sitemap</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#25D366]" />
                  </span>
                  {sitemap.routes.length} Live Public Pages
                </span>
              </div>

              {/* Page Title with Dual-Tone Gradient */}
              <h1 className="text-4xl leading-[1.12] font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Explore the{' '}
                <span className="bg-gradient-to-r from-emerald-600 via-[#25D366] to-teal-700 bg-clip-text text-transparent">
                  {siteName}
                </span>{' '}
                Directory
              </h1>

              {/* Subtitle */}
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                A complete and transparent directory of all live marketing
                pages, native integrations, developer API references, and legal
                compliance policies.
              </p>
            </div>

            {/* Sitemap Explorer Component */}
            <div className="mt-12 lg:mt-16">
              <SitemapExplorer sitemap={sitemap} />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <LandingFooter settings={settings} legalPages={legalPages} />
    </div>
  );
}
