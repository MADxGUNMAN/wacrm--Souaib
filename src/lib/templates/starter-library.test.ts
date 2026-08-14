import { describe, expect, it } from 'vitest';

import {
  matchesSearch,
  previewBody,
  resolveStarterTemplateType,
  toAppCategory,
  variableCount,
  type StarterTemplate,
} from './starter-library';
import { starterTemplateToDraft } from '@/components/templates/wizard-draft';
import {
  defaultTypeFor,
  TEMPLATE_TYPES,
} from '@/lib/whatsapp/template-types-catalogue';

/**
 * The starter template library's pure helpers.
 *
 * The behaviour worth protecting is that a library row becomes a wizard
 * draft WITHOUT losing anything and without producing something Meta would
 * reject — the point of the library is that the operator starts from
 * something already correct.
 */

function template(over: Partial<StarterTemplate> = {}): StarterTemplate {
  return {
    id: 't1',
    category_id: 'c1',
    slug: 'ec-order-confirmation',
    title: 'Order Confirmation',
    description: 'Instant order confirmation with tracking details.',
    emoji: '✅',
    meta_category: 'UTILITY',
    template_type: 'default',
    language: 'en_US',
    header_type: 'text',
    header_content: 'Order Confirmed',
    body_text: 'Hi {{1}}, your order {{2}} is confirmed.',
    footer_text: 'Questions? Just reply',
    buttons: [{ type: 'QUICK_REPLY', text: 'Track Order' }],
    sample_values: { body: ['Rahul', '#10234'], header: [] },
    tags: ['order', 'confirmation'],
    position: 10,
    is_active: true,
    ...over,
  };
}

describe('previewBody', () => {
  it('substitutes the shipped sample values', () => {
    // A card showing raw {{1}} makes every template look identical and
    // tells you nothing about whether it fits.
    expect(previewBody(template())).toBe(
      'Hi Rahul, your order #10234 is confirmed.',
    );
  });

  it('leaves a placeholder visible when no sample exists', () => {
    // Better to show {{2}} than an empty gap — the operator can see which
    // value is missing rather than reading a broken sentence.
    expect(
      previewBody(template({ sample_values: { body: ['Rahul'] } })),
    ).toBe('Hi Rahul, your order {{2}} is confirmed.');
  });

  it('handles a template with no variables at all', () => {
    expect(
      previewBody(template({ body_text: 'Your order shipped.', sample_values: null })),
    ).toBe('Your order shipped.');
  });
});

describe('variableCount', () => {
  it('counts distinct placeholders, not occurrences', () => {
    expect(
      variableCount(template({ body_text: 'Hi {{1}}, {{1}} — order {{2}}' })),
    ).toBe(2);
  });

  it('is zero for a static template', () => {
    expect(variableCount(template({ body_text: 'No variables here' }))).toBe(0);
  });
});

describe('matchesSearch', () => {
  const t = template();

  it('searches title, description, body and tags', () => {
    expect(matchesSearch(t, 'order confirmation')).toBe(true);
    expect(matchesSearch(t, 'tracking')).toBe(true); // description
    expect(matchesSearch(t, 'confirmed')).toBe(true); // body
    expect(matchesSearch(t, 'order')).toBe(true); // tag
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(matchesSearch(t, '  ORDER  ')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesSearch(t, '')).toBe(true);
    expect(matchesSearch(t, '   ')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesSearch(t, 'appointment')).toBe(false);
  });
});

describe('toAppCategory', () => {
  it('maps Meta’s uppercase enum onto the wizard’s casing', () => {
    // The library stores Meta's spelling; the payload and wizard use ours.
    expect(toAppCategory('MARKETING')).toBe('Marketing');
    expect(toAppCategory('UTILITY')).toBe('Utility');
    expect(toAppCategory('AUTHENTICATION')).toBe('Authentication');
  });
});

describe('resolveStarterTemplateType', () => {
  it('keeps a type the category actually offers', () => {
    expect(resolveStarterTemplateType('Marketing', 'carousel')).toBe('carousel');
    expect(resolveStarterTemplateType('Utility', 'default')).toBe('default');
  });

  it('falls back when the type belongs to a different category', () => {
    // Only Marketing offers Catalogue. Trusting the column would open
    // step 2 on an editor that does not belong to this category.
    expect(resolveStarterTemplateType('Utility', 'catalogue')).toBe('default');
  });

  it('keeps every type its own category currently offers', () => {
    // The library is edited by hand from the super admin panel, so the
    // guard must not quietly downgrade a type that IS legitimate. Driven
    // off the catalogue itself so adding a type cannot silently break the
    // prefill for it.
    for (const category of ['Marketing', 'Utility', 'Authentication'] as const) {
      for (const option of TEMPLATE_TYPES[category]) {
        expect(resolveStarterTemplateType(category, option.type)).toBe(
          option.available ? option.type : defaultTypeFor(category),
        );
      }
    }
  });

  it('falls back on junk, empty and missing values', () => {
    expect(resolveStarterTemplateType('Marketing', 'not_a_type')).toBe('default');
    expect(resolveStarterTemplateType('Marketing', '')).toBe('default');
    expect(resolveStarterTemplateType('Marketing', null)).toBe('default');
    expect(resolveStarterTemplateType('Marketing', undefined)).toBe('default');
  });

  it('resolves Authentication to its own only type', () => {
    // Authentication has no type step, so whatever the column says the
    // answer has to be the one type that category has.
    expect(resolveStarterTemplateType('Authentication', 'carousel')).toBe(
      'authentication',
    );
  });
});

describe('starterTemplateToDraft', () => {
  it('carries the whole template into the draft', () => {
    const draft = starterTemplateToDraft(template());
    expect(draft.bodyText).toBe('Hi {{1}}, your order {{2}} is confirmed.');
    expect(draft.bodySamples).toEqual(['Rahul', '#10234']);
    expect(draft.headerFormat).toBe('text');
    expect(draft.headerContent).toBe('Order Confirmed');
    expect(draft.footerText).toBe('Questions? Just reply');
    expect(draft.buttons).toEqual([{ type: 'QUICK_REPLY', text: 'Track Order' }]);
  });

  it('converts the prose title into a legal template name', () => {
    // "Order Confirmation" is not a valid Meta template name; leaving it
    // for the operator to discover would be a rejection on submit.
    expect(starterTemplateToDraft(template()).name).toBe('order_confirmation');
    expect(
      starterTemplateToDraft(template({ title: '  Fee Reminder — Term 2!  ' })).name,
    ).toBe('fee_reminder_term_2');
  });

  it('pads samples to the variable count so every input renders', () => {
    // A library row with fewer samples than variables must still show all
    // the sample fields, or the missing one is invisible.
    const draft = starterTemplateToDraft(
      template({ sample_values: { body: ['Rahul'] } }),
    );
    expect(draft.bodySamples).toEqual(['Rahul', '']);
  });

  it('maps a missing header to the form’s "none" sentinel', () => {
    const draft = starterTemplateToDraft(
      template({ header_type: null, header_content: null }),
    );
    expect(draft.headerFormat).toBe('none');
  });

  it('tolerates a row with no buttons or samples', () => {
    const draft = starterTemplateToDraft(
      template({ buttons: null, sample_values: null, body_text: 'Static text' }),
    );
    expect(draft.buttons).toEqual([]);
    expect(draft.bodySamples).toEqual([]);
  });
});
