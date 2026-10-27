// ============================================================
// sitemap.ts — Dynamic sitemap.xml
//
// Every live public page, from the shared helper in
// src/lib/cms/sitemap.ts (also used by the HTML /sitemap page), so the
// two can never disagree. That helper decides what counts as live:
// published CMS rows only, add-on legal documents only when they have
// content, the AI connector page only when the connector is enabled.
//
// Private routes (dashboard, auth, api, super-admin) and app system
// screens are deliberately excluded.
//
// This file uses the Next.js `sitemap.ts` file convention — see
// node_modules/next/dist/docs/01-app/03-api-reference/
//   03-file-conventions/01-metadata/sitemap.md
// ============================================================

import type { MetadataRoute } from 'next';
import { getPublicSitemapRoutes } from '@/lib/cms/sitemap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { noIndex, routes } = await getPublicSitemapRoutes();

  // If no_index is on, return an empty sitemap — crawlers are already
  // blocked by robots.txt, but an empty sitemap avoids contradicting it.
  if (noIndex) return [];

  return routes.map((route) => ({
    url: route.url,
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
