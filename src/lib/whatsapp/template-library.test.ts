import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMessageTemplateByName,
  listTemplateLibrary,
  submitLibraryTemplate,
} from './meta-api';

/**
 * Meta's Template Library.
 *
 * The value of a library template is that its CATEGORY IS ALREADY SETTLED
 * — a template we write can be reclassified as Marketing by Meta's
 * classifier, which changes what it costs to send. In exchange the wording
 * is fixed and all we supply is a name, a language and our button details.
 */

function captureFetch(response: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(response), { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listTemplateLibrary', () => {
  it('passes only the filters that were set', () => {
    const calls = captureFetch({ data: [] });
    void listTemplateLibrary({
      wabaId: 'waba1',
      accessToken: 'tok',
      search: '  delivery  ',
      topic: 'ORDER_MANAGEMENT',
    });
    const url = calls[0].url;
    expect(url).toContain('/waba1/message_template_library?');
    expect(url).toContain('search=delivery');
    expect(url).toContain('topic=ORDER_MANAGEMENT');
    // Unset filters must be absent, not empty: an empty enum is not a
    // valid value and would narrow the results to nothing.
    expect(url).not.toContain('usecase=');
    expect(url).not.toContain('industry=');
  });

  it('reads Meta’s shape, including the parameter samples', async () => {
    captureFetch({
      data: [
        {
          id: '714',
          name: 'delivery_update_1',
          language: 'en_US',
          category: 'UTILITY',
          topic: 'ORDER_MANAGEMENT',
          usecase: 'DELIVERY_UPDATE',
          industry: ['E_COMMERCE'],
          body: 'Your order {{1}} is on its way.',
          body_params: ['#12345'],
          body_param_types: ['TEXT'],
          buttons: [{ type: 'URL', text: 'Track', url: 'https://x.test/' }],
        },
        { name: '', id: 'broken' },
      ],
    });

    const templates = await listTemplateLibrary({
      wabaId: 'waba1',
      accessToken: 'tok',
    });

    // The unnamed row is dropped: library_template_name is what a create
    // call needs, so a row without one cannot be used.
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      name: 'delivery_update_1',
      usecase: 'DELIVERY_UPDATE',
      body: 'Your order {{1}} is on its way.',
      body_params: ['#12345'],
    });
  });

  it('defaults the category to UTILITY when Meta omits it', async () => {
    captureFetch({ data: [{ id: '1', name: 'x', language: 'en_US' }] });
    const [t] = await listTemplateLibrary({
      wabaId: 'w',
      accessToken: 't',
    });
    expect(t.category).toBe('UTILITY');
  });
});

describe('submitLibraryTemplate', () => {
  it('sends library_template_name and NO components', async () => {
    // Components alongside library_template_name is what makes this fail
    // confusingly, so the helper cannot express it.
    const calls = captureFetch({ id: 'hsm-1', status: 'APPROVED' });
    await submitLibraryTemplate({
      wabaId: 'waba1',
      accessToken: 'tok',
      name: 'my_delivery_update',
      language: 'en_US',
      libraryTemplateName: 'delivery_update_1',
    });

    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toContain('/waba1/message_templates');
    expect(body).toEqual({
      name: 'my_delivery_update',
      language: 'en_US',
      category: 'UTILITY',
      library_template_name: 'delivery_update_1',
    });
    expect(body.components).toBeUndefined();
  });

  it('sends button inputs as a real array', async () => {
    // Meta's own example shows a quoted string of single-quoted JSON, which
    // is not valid JSON; the array is what the Graph API parses.
    const calls = captureFetch({ id: 'hsm-2', status: 'APPROVED' });
    await submitLibraryTemplate({
      wabaId: 'w',
      accessToken: 't',
      name: 'n',
      language: 'en_US',
      libraryTemplateName: 'lib',
      buttonInputs: [
        {
          type: 'URL',
          url: {
            base_url: 'https://x.test/{{1}}',
            url_suffix_example: 'https://x.test/12345',
          },
        },
        { type: 'PHONE_NUMBER', phone_number: '+911234567890' },
      ],
    });

    const body = JSON.parse(String(calls[0].init?.body));
    expect(Array.isArray(body.library_template_button_inputs)).toBe(true);
    expect(body.library_template_button_inputs).toHaveLength(2);
  });

  it('does not assume PENDING — library templates are often approved at once', async () => {
    captureFetch({ id: 'hsm-3', status: 'APPROVED', category: 'UTILITY' });
    const out = await submitLibraryTemplate({
      wabaId: 'w',
      accessToken: 't',
      name: 'n',
      language: 'en_US',
      libraryTemplateName: 'lib',
    });
    expect(out).toEqual({ id: 'hsm-3', status: 'APPROVED', category: 'UTILITY' });
  });

  it('throws when Meta returns no id', async () => {
    captureFetch({ status: 'APPROVED' });
    await expect(
      submitLibraryTemplate({
        wabaId: 'w',
        accessToken: 't',
        name: 'n',
        language: 'en_US',
        libraryTemplateName: 'lib',
      }),
    ).rejects.toThrow(/no id/i);
  });

  it('surfaces Meta’s error message', async () => {
    captureFetch({ error: { message: 'Invalid library template name' } }, 400);
    await expect(
      submitLibraryTemplate({
        wabaId: 'w',
        accessToken: 't',
        name: 'n',
        language: 'en_US',
        libraryTemplateName: 'nope',
      }),
    ).rejects.toThrow('Invalid library template name');
  });
});

describe('fetchMessageTemplateByName', () => {
  it('picks the exact name and language, not just the first row', async () => {
    // `name=` is a FILTER, so Meta returns every language variant and can
    // return near-matches. Taking data[0] would store the wrong wording.
    captureFetch({
      data: [
        { id: '1', name: 'my_update', language: 'es_ES', components: [{ type: 'BODY', text: 'Hola' }] },
        { id: '2', name: 'my_update', language: 'en_US', components: [{ type: 'BODY', text: 'Hi' }] },
        { id: '3', name: 'my_update_v2', language: 'en_US', components: [] },
      ],
    });

    const hit = await fetchMessageTemplateByName({
      wabaId: 'w',
      accessToken: 't',
      name: 'my_update',
      language: 'en_US',
    });
    expect(hit?.id).toBe('2');
    expect(hit?.components).toEqual([{ type: 'BODY', text: 'Hi' }]);
  });

  it('returns null when nothing matches', async () => {
    captureFetch({ data: [{ id: '1', name: 'other', language: 'en_US' }] });
    expect(
      await fetchMessageTemplateByName({
        wabaId: 'w',
        accessToken: 't',
        name: 'missing',
      }),
    ).toBeNull();
  });
});
