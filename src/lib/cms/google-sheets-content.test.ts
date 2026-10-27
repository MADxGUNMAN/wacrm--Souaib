import { describe, expect, it } from 'vitest';
import type { IntegrationPage } from '@/types/super-admin';
import {
  SHEETS_DEFAULT_CONTENT,
  SHEETS_DEFAULT_FEATURES,
  SHEETS_PAGE_DEFAULTS,
  resolveSheetsContent,
  resolveSheetsPage,
} from './google-sheets-content';

function row(overrides: Partial<IntegrationPage> = {}): IntegrationPage {
  return {
    id: 'id',
    slug: 'google-sheets',
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
    created_at: '',
    updated_at: '',
    content: {},
    ...overrides,
  };
}

describe('resolveSheetsContent', () => {
  it('returns the defaults for any non-object', () => {
    for (const raw of [null, undefined, [], 'x', 3]) {
      expect(resolveSheetsContent(raw)).toEqual(SHEETS_DEFAULT_CONTENT);
    }
  });

  it('merges field by field and keeps edits', () => {
    const c = resolveSheetsContent({
      features_heading: 'Custom heading',
      steps_subtitle: '   ',
      hero_checks: ['', 'Only one'],
    });
    expect(c.features_heading).toBe('Custom heading');
    expect(c.steps_subtitle).toBe(SHEETS_DEFAULT_CONTENT.steps_subtitle);
    expect(c.hero_checks).toEqual(['Only one']);
    expect(c.cta_heading).toBe(SHEETS_DEFAULT_CONTENT.cta_heading);
  });

  it('always returns five mockup columns, filling gaps', () => {
    const c = resolveSheetsContent({ mockup_columns: ['Name', '', 'Order'] });
    expect(c.mockup_columns).toEqual([
      'Name',
      SHEETS_DEFAULT_CONTENT.mockup_columns[1],
      'Order',
      SHEETS_DEFAULT_CONTENT.mockup_columns[3],
      SHEETS_DEFAULT_CONTENT.mockup_columns[4],
    ]);
  });

  it('normalises mockup rows and drops rows without a customer', () => {
    const c = resolveSheetsContent({
      mockup_rows: [
        { customer: 'Asha', tone: 'weird', phone: 7 },
        { customer: '' },
      ],
    });
    expect(c.mockup_rows).toEqual([
      {
        customer: 'Asha',
        phone: '',
        order_id: '',
        status: '',
        tone: 'success',
        delivery: '',
      },
    ]);
  });

  it('merges legal document headers per field', () => {
    const c = resolveSheetsContent({ privacy_doc: { heading: 'Privacy' } });
    expect(c.privacy_doc.heading).toBe('Privacy');
    expect(c.privacy_doc.intro).toBe(SHEETS_DEFAULT_CONTENT.privacy_doc.intro);
    expect(c.terms_doc).toEqual(SHEETS_DEFAULT_CONTENT.terms_doc);
  });
});

describe('resolveSheetsPage', () => {
  it('renders the defaults with no row', () => {
    const p = resolveSheetsPage(null);
    expect(p.title).toBe(SHEETS_PAGE_DEFAULTS.title);
    expect(p.features).toEqual(SHEETS_DEFAULT_FEATURES);
    expect(p.primary_cta_url).toBe(SHEETS_PAGE_DEFAULTS.primary_cta_url);
  });

  it('reuses the hero primary text for the banner when none is set', () => {
    const p = resolveSheetsPage(row({ primary_cta_text: 'Install now' }));
    expect(p.content.cta_primary_text).toBe('Install now');
    const q = resolveSheetsPage(
      row({
        primary_cta_text: 'Install now',
        content: { cta_primary_text: 'Get it' },
      })
    );
    expect(q.content.cta_primary_text).toBe('Get it');
  });
});
