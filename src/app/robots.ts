// ============================================================
// robots.ts — Dynamic robots.txt controlled by admin panel
//
// Reads `no_index` from site_settings (the same toggle shown in
// Super Admin → CMS → Settings). When `no_index` is TRUE, the
// entire site is disallowed; when FALSE, public pages are allowed
// and private routes (dashboard, auth, api, super-admin) are
// blocked.
//
// This file uses the Next.js `robots.ts` file convention — see
// node_modules/next/dist/docs/01-app/03-api-reference/
//   03-file-conventions/01-metadata/robots.md
// ============================================================

import type { MetadataRoute } from 'next';
import { getSiteSettings } from '@/lib/cms/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSiteSettings();
  const noIndex = settings?.no_index ?? false;
  const siteUrl = (
    settings?.canonical_url ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://wacrm.junkiescoder.com'
  ).replace(/\/+$/, '');

  if (noIndex) {
    // Admin toggled indexing OFF — block everything
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // Indexing ON — allow public pages, block private routes
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/login',
        '/register',
        '/forgot-password',
        '/super-admin/',
        '/api/',
        '/banned',
        '/subscription-required',
        '/upgrade-plan/',
        '/join/',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
