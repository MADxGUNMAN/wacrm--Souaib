// ============================================================
// Public sitemap — one source of truth for every live public page.
//
// `getPublicSitemapRoutes()` returns the categorized list of public pages
// (URL, title, description, last-modified date, change frequency and
// priority). It drives:
//   - src/app/sitemap.ts      → /sitemap.xml
//   - the HTML /sitemap page   (built separately on top of this helper)
//
// A route is only listed when it actually renders for an anonymous
// visitor: unpublished CMS rows, empty add-on legal documents and a
// disabled AI connector are left out. App system screens (/banned,
// /subscription-required, /upgrade-plan, /join, /oauth/consent) and
// auth pages are never listed.
//
// Server-only: it reads the CMS with the service-role client.
// ============================================================

import type { SiteSettings } from '@/types/super-admin';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getConfig } from '@/lib/ai-connector/config';
import {
  getContactPageSettings,
  getDocsPageSettings,
  getIntegrationPage,
  getSiteSettings,
} from './queries';
import { AI_PAGE_SLUG, resolveAiPage } from './ai-integration-content';
import {
  SHEETS_PAGE_SLUG,
  resolveSheetsContent,
  resolveSheetsPage,
} from './google-sheets-content';

export const FALLBACK_SITE_URL = 'https://wacrm.junkiescoder.com';

/** The HTML sitemap route, listed in sitemap.xml and in its own output. */
export const HTML_SITEMAP_PATH = '/sitemap';

export type SitemapCategory = 'main' | 'integrations' | 'developers' | 'legal';

export type SitemapChangeFrequency =
  'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface PublicSitemapRoute {
  /** Site-relative path, e.g. "/integrations/ai". */
  path: string;
  /** Absolute URL on the canonical origin. */
  url: string;
  title: string;
  description?: string;
  category: SitemapCategory;
  lastModified: Date;
  changeFrequency: SitemapChangeFrequency;
  /** 0.0 – 1.0, as used in sitemap.xml. */
  priority: number;
}

export interface PublicSitemapGroup {
  category: SitemapCategory;
  label: string;
  routes: PublicSitemapRoute[];
}

export interface PublicSitemap {
  siteUrl: string;
  siteName: string;
  /** CMS "no_index" switch. sitemap.xml is emptied when true. */
  noIndex: boolean;
  generatedAt: Date;
  /** Non-empty groups, in display order. */
  groups: PublicSitemapGroup[];
  /** Every route, flattened in the same order as `groups`. */
  routes: PublicSitemapRoute[];
}

export const SITEMAP_CATEGORY_LABELS: Record<SitemapCategory, string> = {
  main: 'Main pages',
  integrations: 'Integrations',
  developers: 'Developers',
  legal: 'Legal',
};

const CATEGORY_ORDER: SitemapCategory[] = [
  'main',
  'integrations',
  'developers',
  'legal',
];

/** Canonical origin without a trailing slash. */
export function resolveSiteUrl(
  settings: Pick<SiteSettings, 'canonical_url'> | null | undefined
): string {
  return (
    settings?.canonical_url ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    FALLBACK_SITE_URL
  ).replace(/\/+$/, '');
}

/** Latest valid date among the inputs, else `fallback`. */
function latest(
  fallback: Date,
  ...values: (string | null | undefined)[]
): Date {
  let best: Date | null = null;
  for (const v of values) {
    if (!v) continue;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best ?? fallback;
}

interface LegalRow {
  slug: string;
  title: string;
  updated_at: string | null;
  last_updated_at: string | null;
}

async function getPublishedLegalPages(): Promise<LegalRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('legal_pages')
    .select('slug, title, updated_at, last_updated_at')
    .eq('is_published', true)
    .order('slug', { ascending: true });
  if (error) {
    console.error('[cms] getPublishedLegalPages error:', error);
    return [];
  }
  return (data ?? []) as LegalRow[];
}

const hasText = (s: string | null | undefined) => !!s && s.trim().length > 0;

/**
 * Every live public page, categorized. Never throws: a failed CMS read
 * drops only the routes that depend on it.
 */
export async function getPublicSitemapRoutes(): Promise<PublicSitemap> {
  const [settings, legalPages, sheetsRow, aiRow, contact, docs] =
    await Promise.all([
      getSiteSettings(),
      getPublishedLegalPages(),
      getIntegrationPage(SHEETS_PAGE_SLUG),
      getIntegrationPage(AI_PAGE_SLUG),
      getContactPageSettings(),
      getDocsPageSettings(),
    ]);

  const siteUrl = resolveSiteUrl(settings);
  const siteName = settings?.site_name || 'Replai';
  const now = new Date();
  const routes: PublicSitemapRoute[] = [];

  const add = (route: Omit<PublicSitemapRoute, 'url'>) =>
    routes.push({ ...route, url: `${siteUrl}${route.path}` });

  // ── Main pages ───────────────────────────────────────────────
  add({
    path: '/',
    title: settings?.meta_title || siteName,
    description: settings?.meta_description || undefined,
    category: 'main',
    lastModified: latest(now, settings?.updated_at),
    changeFrequency: 'weekly',
    priority: 1,
  });
  add({
    path: '/docs',
    title: docs?.heading || 'Docs & Resources',
    description: docs?.subheading || undefined,
    category: 'main',
    lastModified: latest(now, docs?.updated_at),
    changeFrequency: 'monthly',
    priority: 0.7,
  });
  add({
    path: '/contact',
    title: contact?.heading || 'Contact',
    description: contact?.subheading || undefined,
    category: 'main',
    lastModified: latest(now, contact?.updated_at),
    changeFrequency: 'monthly',
    priority: 0.7,
  });
  add({
    path: HTML_SITEMAP_PATH,
    title: 'Sitemap',
    description: `Every public page on ${siteName}.`,
    category: 'main',
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.3,
  });

  // ── Integrations ─────────────────────────────────────────────
  // getIntegrationPage only returns published rows.
  if (sheetsRow) {
    const sheets = resolveSheetsPage(sheetsRow);
    const docsCopy = resolveSheetsContent(sheetsRow.content);
    const mod = latest(now, sheetsRow.updated_at);
    add({
      path: '/integrations/google-sheets',
      title: sheets.title,
      description: sheets.seo_meta_description,
      category: 'integrations',
      lastModified: mod,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    // The add-on documents only go in once they have content; an empty
    // one renders a "not configured yet" placeholder.
    if (hasText(sheetsRow.privacy_markdown)) {
      add({
        path: '/integrations/google-sheets/privacy',
        title: docsCopy.privacy_doc.heading,
        description: docsCopy.privacy_doc.meta_description,
        category: 'legal',
        lastModified: mod,
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
    if (hasText(sheetsRow.terms_markdown)) {
      add({
        path: '/integrations/google-sheets/terms',
        title: docsCopy.terms_doc.heading,
        description: docsCopy.terms_doc.meta_description,
        category: 'legal',
        lastModified: mod,
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  }

  // Listed once the connector is switched on in this deployment AND the
  // CMS row is published.
  if (getConfig().enabled && aiRow) {
    const ai = resolveAiPage(aiRow);
    add({
      path: '/integrations/ai',
      title: ai.title,
      description: ai.seo_meta_description,
      category: 'integrations',
      lastModified: latest(now, aiRow.updated_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // ── Developers ───────────────────────────────────────────────
  add({
    path: '/api-reference',
    title: 'API reference',
    description:
      'Developer reference for the public REST API: endpoints, scopes, errors, rate limits and webhooks.',
    category: 'developers',
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  });

  // ── Legal (CMS legal pages) ──────────────────────────────────
  for (const page of legalPages) {
    add({
      path: `/legal/${encodeURIComponent(page.slug)}`,
      title: page.title,
      category: 'legal',
      lastModified: latest(now, page.last_updated_at, page.updated_at),
      changeFrequency: 'monthly',
      priority: 0.5,
    });
  }

  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: SITEMAP_CATEGORY_LABELS[category],
    routes: routes.filter((r) => r.category === category),
  })).filter((g) => g.routes.length > 0);

  return {
    siteUrl,
    siteName,
    noIndex: settings?.no_index ?? false,
    generatedAt: now,
    groups,
    routes: groups.flatMap((g) => g.routes),
  };
}
