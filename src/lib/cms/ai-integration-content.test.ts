import { describe, expect, it } from 'vitest';
import type { IntegrationPage } from '@/types/super-admin';
import {
  AI_PAGE_DEFAULTS,
  AI_PAGE_DEFAULT_CONTENT,
  AI_PAGE_DEFAULT_FAQS,
  AI_PAGE_DEFAULT_FEATURES,
  resolveAiContent,
  resolveAiPage,
} from './ai-integration-content';

function row(overrides: Partial<IntegrationPage> = {}): IntegrationPage {
  return {
    id: 'id',
    slug: 'ai',
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

describe('resolveAiPage', () => {
  it('renders the defaults when there is no row', () => {
    const p = resolveAiPage(null);
    expect(p.title).toBe(AI_PAGE_DEFAULTS.title);
    expect(p.highlights).toEqual(AI_PAGE_DEFAULTS.highlights);
    expect(p.levels).toEqual(AI_PAGE_DEFAULT_FEATURES);
    expect(p.faqs).toEqual(AI_PAGE_DEFAULT_FAQS);
    expect(p.content).toEqual(AI_PAGE_DEFAULT_CONTENT);
    expect(p.primary_cta).toBeNull();
    expect(p.secondary_cta).toBeNull();
  });

  it('fills empty fields from the defaults and keeps edits', () => {
    const p = resolveAiPage(
      row({ title: 'Custom title', subtitle: '   ', faqs: [] })
    );
    expect(p.title).toBe('Custom title');
    expect(p.subtitle).toBe(AI_PAGE_DEFAULTS.subtitle);
    expect(p.faqs).toEqual(AI_PAGE_DEFAULT_FAQS);
  });

  it('shows a CTA only when both text and link are set', () => {
    const p = resolveAiPage(
      row({
        primary_cta_text: 'Add to Claude',
        primary_cta_url: 'https://claude.ai/x',
        secondary_cta_text: 'Add to ChatGPT',
        secondary_cta_url: '',
      })
    );
    expect(p.primary_cta).toEqual({
      text: 'Add to Claude',
      url: 'https://claude.ai/x',
    });
    expect(p.secondary_cta).toBeNull();
  });

  it('drops blank list items, falling back when none remain', () => {
    const p = resolveAiPage(
      row({
        prerequisites: ['', 'One'],
        faqs: [{ question: 'Q', answer: '' }],
      })
    );
    expect(p.highlights).toEqual(['One']);
    expect(p.faqs).toEqual(AI_PAGE_DEFAULT_FAQS);
  });
});

describe('resolveAiContent mockup', () => {
  it('normalises mockup messages and keeps defaults when none are valid', () => {
    const c = resolveAiContent({
      mockup_messages: [
        { role: 'robot', body: 'Hi', items: ['', 'one'] },
        { role: 'tool', body: '' },
      ],
      examples_eyebrow: 'Try it',
    });
    expect(c.mockup_messages).toEqual([
      { role: 'user', label: '', badge: '', body: 'Hi', items: ['one'] },
    ]);
    expect(c.examples_eyebrow).toBe('Try it');
    expect(c.faq_eyebrow).toBe(AI_PAGE_DEFAULT_CONTENT.faq_eyebrow);
    expect(resolveAiContent({ mockup_messages: [] }).mockup_messages).toEqual(
      AI_PAGE_DEFAULT_CONTENT.mockup_messages
    );
  });
});

describe('resolveAiContent', () => {
  it('tolerates any stored shape', () => {
    expect(resolveAiContent(null)).toEqual(AI_PAGE_DEFAULT_CONTENT);
    expect(resolveAiContent([])).toEqual(AI_PAGE_DEFAULT_CONTENT);
    expect(resolveAiContent('x')).toEqual(AI_PAGE_DEFAULT_CONTENT);
  });

  it('merges field by field and trims blank connect steps', () => {
    const c = resolveAiContent({
      examples_heading: 'Ask anything',
      examples: ['  ', 'Hello'],
      connect_cards: [
        { title: 'Claude', steps: ['One', '', 'Two'] },
        { title: '', steps: ['ignored'] },
      ],
      data_cards: [{ title: 'No body', body: '', icon: 'Lock' }],
    });
    expect(c.examples_heading).toBe('Ask anything');
    expect(c.examples).toEqual(['Hello']);
    expect(c.connect_cards).toEqual([
      { title: 'Claude', steps: ['One', 'Two'] },
    ]);
    expect(c.data_cards).toEqual(AI_PAGE_DEFAULT_CONTENT.data_cards);
    expect(c.safeguards).toEqual(AI_PAGE_DEFAULT_CONTENT.safeguards);
  });
});
