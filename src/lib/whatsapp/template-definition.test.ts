import { describe, expect, it } from 'vitest';

import {
  buildTemplateColumns,
  componentsFromFlatColumns,
  definitionFromRow,
  deriveFlatColumns,
  getButtons,
  getCarouselCards,
  type TemplateComponent,
  type TemplateDefinition,
  type TemplateRowLike,
} from './template-definition';

function definition(
  components: TemplateComponent[],
  over: Partial<TemplateDefinition> = {},
): TemplateDefinition {
  return {
    name: 'demo',
    category: 'Marketing',
    language: 'en_US',
    template_type: 'default',
    parameter_format: 'POSITIONAL',
    components,
    ...over,
  };
}

describe('deriveFlatColumns', () => {
  it('projects a text header, body, footer and buttons', () => {
    const flat = deriveFlatColumns(
      definition([
        {
          type: 'HEADER',
          format: 'TEXT',
          text: 'Hi {{1}}',
          example: { header_text: ['Souaib'] },
        },
        {
          type: 'BODY',
          text: 'Order {{1}} ships {{2}}',
          example: { body_text: [['A12', 'today']] },
        },
        { type: 'FOOTER', text: 'Replai' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Thanks' },
            { type: 'URL', text: 'Track', url: 'https://x.test/{{1}}', example: ['A12'] },
          ],
        },
      ]),
    );

    expect(flat.header_type).toBe('text');
    expect(flat.header_content).toBe('Hi {{1}}');
    expect(flat.body_text).toBe('Order {{1}} ships {{2}}');
    expect(flat.footer_text).toBe('Replai');
    expect(flat.sample_values).toEqual({
      body: ['A12', 'today'],
      header: ['Souaib'],
    });
    expect(flat.buttons).toEqual([
      { type: 'QUICK_REPLY', text: 'Thanks' },
      { type: 'URL', text: 'Track', url: 'https://x.test/{{1}}', example: 'A12' },
    ]);
  });

  it('prefers a media handle but keeps the url when that is all there is', () => {
    const withHandle = deriveFlatColumns(
      definition([
        { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['H1'] } },
        { type: 'BODY', text: 'hi' },
      ]),
    );
    expect(withHandle.header_type).toBe('image');
    expect(withHandle.header_handle).toBe('H1');
    expect(withHandle.header_media_url).toBeNull();
    // A text header must never leak into header_content for media.
    expect(withHandle.header_content).toBeNull();

    const withUrl = deriveFlatColumns(
      definition([
        { type: 'HEADER', format: 'VIDEO', example: { header_url: ['https://x.test/v.mp4'] } },
        { type: 'BODY', text: 'hi' },
      ]),
    );
    expect(withUrl.header_media_url).toBe('https://x.test/v.mp4');
    expect(withUrl.header_handle).toBeNull();
  });

  it('maps a LOCATION header, which has neither text nor media', () => {
    const flat = deriveFlatColumns(
      definition([
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'Your driver is here' },
      ]),
    );
    expect(flat.header_type).toBe('location');
    expect(flat.header_content).toBeNull();
    expect(flat.header_media_url).toBeNull();
    expect(flat.header_handle).toBeNull();
  });

  /**
   * The important one. A button reaching the flat column must be one the
   * send builder can actually handle — it switches exhaustively over
   * `TemplateButton`, so a type the union does not model would be a value
   * the type system says is impossible, and the send path would fall
   * through silently.
   *
   * The line is therefore NOT "rich types are excluded" but "types that
   * need send-time handling we cannot express are excluded". VOICE_CALL is
   * in the union and needs no send-time parameter at all, so it belongs in
   * the cache; OTP, FLOW and MPM each need handling the flat shape cannot
   * carry, so they stay in `components` only.
   */
  it('keeps only send-safe button types in the flat column, retaining the rest in components', () => {
    const def = definition([
      { type: 'BODY', text: '{{1}} is your code' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Stop' },
          { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' },
          { type: 'FLOW', text: 'Book', flow_id: '123' },
          { type: 'MPM', text: 'Products' },
          { type: 'VOICE_CALL', text: 'Call' },
        ],
      },
    ]);

    const flat = deriveFlatColumns(def);
    expect(flat.buttons).toEqual([
      { type: 'QUICK_REPLY', text: 'Stop' },
      { type: 'VOICE_CALL', text: 'Call' },
    ]);
    // Nothing was lost from the source of truth.
    expect(getButtons(def.components)).toHaveLength(5);
  });

  it('returns null rather than an empty array when there are no buttons', () => {
    const flat = deriveFlatColumns(definition([{ type: 'BODY', text: 'hi' }]));
    expect(flat.buttons).toBeNull();
    expect(flat.sample_values).toBeNull();
    expect(flat.footer_text).toBeNull();
  });

  it('treats a whitespace-only footer as absent', () => {
    const flat = deriveFlatColumns(
      definition([
        { type: 'BODY', text: 'hi' },
        { type: 'FOOTER', text: '   ' },
      ]),
    );
    expect(flat.footer_text).toBeNull();
  });

  /**
   * A carousel's headers and buttons live per-card and have no flat
   * column. The projection must still yield a usable body_text, because
   * template-row-guard throws without it and that would break broadcasts
   * for every other template in the account.
   */
  it('yields a usable body_text for a carousel even though cards cannot be flattened', () => {
    const flat = deriveFlatColumns(
      definition(
        [
          { type: 'BODY', text: 'Our new range' },
          {
            type: 'CAROUSEL',
            cards: [
              {
                components: [
                  { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h1'] } },
                  { type: 'BODY', text: 'Card one' },
                  { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Buy' }] },
                ],
              },
              {
                components: [
                  { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h2'] } },
                  { type: 'BODY', text: 'Card two' },
                ],
              },
            ],
          },
        ],
        { template_type: 'carousel' },
      ),
    );

    expect(flat.body_text).toBe('Our new range');
    // The top-level header slot stays empty — the cards own the headers.
    expect(flat.header_type).toBeNull();
  });
});

describe('componentsFromFlatColumns', () => {
  it('rebuilds components in canonical HEADER → BODY → FOOTER → BUTTONS order', () => {
    const components = componentsFromFlatColumns({
      name: 'legacy',
      category: 'Utility',
      header_type: 'text',
      header_content: 'Hi {{1}}',
      body_text: 'Body {{1}}',
      footer_text: 'Footer',
      buttons: [{ type: 'QUICK_REPLY', text: 'Yes' }],
      sample_values: { body: ['x'], header: ['y'] },
    });

    expect(components.map((c) => c.type)).toEqual([
      'HEADER',
      'BODY',
      'FOOTER',
      'BUTTONS',
    ]);
    // Body examples are 2D on the wire — outer is example sets.
    expect(components[1]).toEqual({
      type: 'BODY',
      text: 'Body {{1}}',
      example: { body_text: [['x']] },
    });
  });

  it('prefers the handle over the url for a media header', () => {
    const [header] = componentsFromFlatColumns({
      name: 'l',
      category: 'Marketing',
      header_type: 'image',
      header_handle: 'H',
      header_media_url: 'https://x.test/i.png',
      body_text: 'hi',
    });
    expect(header).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['H'] },
    });
  });

  it('omits an absent header and footer entirely', () => {
    const components = componentsFromFlatColumns({
      name: 'l',
      category: 'Marketing',
      body_text: 'just a body',
    });
    expect(components).toEqual([{ type: 'BODY', text: 'just a body' }]);
  });

  it('round-trips through deriveFlatColumns without losing anything', () => {
    const original: TemplateRowLike = {
      name: 'rt',
      category: 'Utility',
      header_type: 'text',
      header_content: 'H {{1}}',
      body_text: 'B {{1}} {{2}}',
      footer_text: 'F',
      buttons: [
        { type: 'URL', text: 'Go', url: 'https://x.test/{{1}}', example: ['e'] },
      ],
      sample_values: { body: ['b1', 'b2'], header: ['h1'] },
    };

    const flat = deriveFlatColumns(
      definition(componentsFromFlatColumns(original)),
    );

    expect(flat.header_type).toBe('text');
    expect(flat.header_content).toBe('H {{1}}');
    expect(flat.body_text).toBe('B {{1}} {{2}}');
    expect(flat.footer_text).toBe('F');
    expect(flat.sample_values).toEqual({ body: ['b1', 'b2'], header: ['h1'] });
    expect(flat.buttons).toEqual([
      { type: 'URL', text: 'Go', url: 'https://x.test/{{1}}', example: 'e' },
    ]);
  });
});

describe('definitionFromRow', () => {
  it('uses stored components when present', () => {
    const def = definitionFromRow({
      name: 'n',
      category: 'Marketing',
      language: 'en',
      template_type: 'carousel',
      parameter_format: 'NAMED',
      components: [
        { type: 'BODY', text: 'from components' },
        { type: 'CAROUSEL', cards: [{ components: [] }] },
      ],
      // Deliberately different, to prove components win.
      body_text: 'from flat column',
    });

    expect(def.template_type).toBe('carousel');
    expect(def.parameter_format).toBe('NAMED');
    expect(getCarouselCards(def.components)).toHaveLength(1);
    expect(def.components[0]).toEqual({ type: 'BODY', text: 'from components' });
  });

  it('falls back to the flat columns for a pre-061 row', () => {
    const def = definitionFromRow({
      name: 'old',
      category: 'Utility',
      components: [],
      header_type: 'text',
      header_content: 'Legacy header',
      body_text: 'Legacy body',
    });

    expect(def.components.map((c) => c.type)).toEqual(['HEADER', 'BODY']);
    expect(def.template_type).toBe('default');
    expect(def.parameter_format).toBe('POSITIONAL');
  });

  it('defaults language and coerces an unknown template_type', () => {
    const def = definitionFromRow({
      name: 'x',
      category: 'Marketing',
      template_type: 'something_meta_added_later',
      body_text: 'hi',
    });
    expect(def.language).toBe('en_US');
    expect(def.template_type).toBe('default');
  });
});

describe('buildTemplateColumns', () => {
  it('emits components and the derived cache together', () => {
    const columns = buildTemplateColumns(
      definition(
        [
          { type: 'BODY', text: 'hi {{1}}', example: { body_text: [['there']] } },
          { type: 'FOOTER', text: 'bye' },
        ],
        { message_send_ttl_seconds: 600, template_type: 'default' },
      ),
    );

    expect(columns.components).toHaveLength(2);
    expect(columns.body_text).toBe('hi {{1}}');
    expect(columns.footer_text).toBe('bye');
    expect(columns.sample_values).toEqual({ body: ['there'] });
    expect(columns.message_send_ttl_seconds).toBe(600);
    expect(columns.parameter_format).toBe('POSITIONAL');
    expect(columns.library_template_name).toBeNull();
  });
});
