// ============================================================
// sitemap.ts — Dynamic sitemap.xml
//
// Lists all public-facing pages:
//   - Landing page (/)
//   - Contact page (/contact)
//   - Docs page (/docs)
//   - Legal pages (/legal/[slug]) — fetched from DB
//
// Private routes (dashboard, auth, api, super-admin) are
// deliberately excluded.
//
// This file uses the Next.js `sitemap.ts` file convention — see
// node_modules/next/dist/docs/01-app/03-api-reference/
//   03-file-conventions/01-metadata/sitemap.md
// ============================================================

import type { MetadataRoute } from 'next';
import {
  getSiteSettings,
  getLegalPagesList,
  getIntegrationPage,
} from '@/lib/cms/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settings, legalPages, sheetsPage] = await Promise.all([
    getSiteSettings(),
    getLegalPagesList(),
    getIntegrationPage('google-sheets'),
  ]);

  // If no_index is on, return an empty sitemap — crawlers are already
  // blocked by robots.txt, but an empty sitemap avoids contradicting it.
  if (settings?.no_index) {
    return [];
  }

  const siteUrl = (
    settings?.canonical_url ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://wacrm.junkiescoder.com'
  ).replace(/\/+$/, '');

  const now = new Date();

  // Static public pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: settings?.updated_at ? new Date(settings.updated_at) : now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  // Dynamic legal pages from the CMS
  const legalEntries: MetadataRoute.Sitemap = legalPages.map((page) => ({
    url: `${siteUrl}/legal/${page.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  // Integration pages
  const integrationEntries: MetadataRoute.Sitemap = [];
  if (sheetsPage && sheetsPage.is_published) {
    const pageMod = sheetsPage.updated_at
      ? new Date(sheetsPage.updated_at)
      : now;
    integrationEntries.push(
      {
        url: `${siteUrl}/integrations/google-sheets`,
        lastModified: pageMod,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: `${siteUrl}/integrations/google-sheets/privacy`,
        lastModified: pageMod,
        changeFrequency: 'monthly',
        priority: 0.5,
      },
      {
        url: `${siteUrl}/integrations/google-sheets/terms`,
        lastModified: pageMod,
        changeFrequency: 'monthly',
        priority: 0.5,
      }
    );
  }

  return [...staticPages, ...legalEntries, ...integrationEntries];
}
