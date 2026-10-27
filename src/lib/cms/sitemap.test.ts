import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks: the CMS reads and the AI connector flag ────────────────
const queries = vi.hoisted(() => ({
  getSiteSettings: vi.fn(),
  getIntegrationPage: vi.fn(),
  getContactPageSettings: vi.fn(),
  getDocsPageSettings: vi.fn(),
}));
const legalRows = vi.hoisted(() => ({
  data: [] as unknown[],
  error: null as unknown,
}));
const aiConfig = vi.hoisted(() => ({ enabled: true }));

vi.mock('./queries', () => queries);
vi.mock('@/lib/ai-connector/config', () => ({
  getConfig: () => ({ enabled: aiConfig.enabled, issuer: '' }),
}));
vi.mock('@/lib/auth/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: legalRows.data, error: legalRows.error }),
        }),
      }),
    }),
  }),
}));

import { getPublicSitemapRoutes, resolveSiteUrl } from './sitemap';

function integrationRow(slug: string, extra: Record<string, unknown> = {}) {
  return {
    id: slug,
    slug,
    title: '',
    subtitle: '',
    badge_text: '',
    primary_cta_text: '',
    primary_cta_url: '',
    secondary_cta_text: '',
    secondary_cta_url: '',
    prerequisites: [],
    features: [],
    how_it_works: [],
    faqs: [],
    privacy_markdown: '',
    terms_markdown: '',
    seo_meta_title: '',
    seo_meta_description: '',
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    content: {},
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  aiConfig.enabled = true;
  legalRows.error = null;
  legalRows.data = [
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      updated_at: '2026-10-07T12:00:00Z',
      last_updated_at: '2026-10-01T00:00:00Z',
    },
  ];
  queries.getSiteSettings.mockResolvedValue({
    site_name: 'Replai',
    canonical_url: 'https://example.com/',
    no_index: false,
    meta_title: null,
    meta_description: null,
    updated_at: '2026-08-01T00:00:00Z',
  });
  queries.getContactPageSettings.mockResolvedValue({
    heading: 'Talk to us',
    subheading: 'We reply fast',
    updated_at: '2026-07-01T00:00:00Z',
  });
  queries.getDocsPageSettings.mockResolvedValue(null);
  queries.getIntegrationPage.mockImplementation(async (slug: string) =>
    slug === 'google-sheets'
      ? integrationRow(slug, { privacy_markdown: '# Privacy' })
      : integrationRow(slug)
  );
});

describe('getPublicSitemapRoutes', () => {
  it('lists every live public page on the canonical origin', async () => {
    const map = await getPublicSitemapRoutes();
    expect(map.siteUrl).toBe('https://example.com');
    expect(map.routes.map((r) => r.path)).toEqual([
      '/',
      '/docs',
      '/contact',
      '/sitemap',
      '/integrations/google-sheets',
      '/integrations/ai',
      '/api-reference',
      '/integrations/google-sheets/privacy',
      '/legal/privacy-policy',
    ]);
    expect(
      map.routes.every((r) => r.url.startsWith('https://example.com/'))
    ).toBe(true);
    expect(map.groups.map((g) => g.category)).toEqual([
      'main',
      'integrations',
      'developers',
      'legal',
    ]);
  });

  it('uses CMS titles and the newest timestamp', async () => {
    const map = await getPublicSitemapRoutes();
    const byPath = new Map(map.routes.map((r) => [r.path, r]));
    expect(byPath.get('/contact')?.title).toBe('Talk to us');
    expect(byPath.get('/docs')?.title).toBe('Docs & Resources');
    expect(
      byPath.get('/legal/privacy-policy')?.lastModified.toISOString()
    ).toBe('2026-10-07T12:00:00.000Z');
    expect(byPath.get('/integrations/google-sheets')?.title).toContain(
      'Google Sheets'
    );
  });

  it('skips empty add-on documents, unpublished pages and a disabled connector', async () => {
    aiConfig.enabled = false;
    queries.getIntegrationPage.mockImplementation(async (slug: string) =>
      slug === 'google-sheets' ? integrationRow(slug) : null
    );
    const paths = (await getPublicSitemapRoutes()).routes.map((r) => r.path);
    expect(paths).toContain('/integrations/google-sheets');
    expect(paths).not.toContain('/integrations/google-sheets/privacy');
    expect(paths).not.toContain('/integrations/google-sheets/terms');
    expect(paths).not.toContain('/integrations/ai');
  });

  it('drops the AI page when its row is unpublished even if enabled', async () => {
    queries.getIntegrationPage.mockImplementation(async (slug: string) =>
      slug === 'ai' ? null : integrationRow(slug)
    );
    const paths = (await getPublicSitemapRoutes()).routes.map((r) => r.path);
    expect(paths).not.toContain('/integrations/ai');
  });

  it('never lists system or auth screens', async () => {
    const paths = (await getPublicSitemapRoutes()).routes.map((r) => r.path);
    for (const blocked of [
      '/login',
      '/signup',
      '/banned',
      '/subscription-required',
      '/upgrade-plan',
      '/oauth/consent',
      '/privacy',
      '/terms',
    ]) {
      expect(paths).not.toContain(blocked);
    }
  });

  it('reports no_index and survives failed CMS reads', async () => {
    queries.getSiteSettings.mockResolvedValue({ no_index: true });
    queries.getContactPageSettings.mockResolvedValue(null);
    legalRows.error = { message: 'boom' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const map = await getPublicSitemapRoutes();
    expect(map.noIndex).toBe(true);
    expect(map.routes.some((r) => r.path.startsWith('/legal/'))).toBe(false);
    expect(map.routes.map((r) => r.path)).toContain('/contact');
  });
});

describe('resolveSiteUrl', () => {
  it('strips trailing slashes and falls back', () => {
    expect(resolveSiteUrl({ canonical_url: 'https://a.com///' })).toBe(
      'https://a.com'
    );
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(resolveSiteUrl(null)).toBe('https://wacrm.junkiescoder.com');
    process.env.NEXT_PUBLIC_SITE_URL = prev;
  });
});
