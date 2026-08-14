import { describe, expect, it } from 'vitest';

import { EMPTY_DRAFT, definitionFromDraft, draftFromRow } from './wizard-draft';
import { getButtons } from '@/lib/whatsapp/template-definition';

/**
 * The Flow button's round trip through the wizard.
 *
 * This is the test that matters most for Flow templates, because the
 * failure it guards against is silent: a FLOW button cannot travel through
 * the flat `buttons` column (toLegacyButton drops it on purpose), so a
 * conversion that routed it that way would produce a template with NO
 * button, and the preview would agree with the mistake rather than reveal
 * it. Meta would then reject the submit — or worse, approve a useless
 * template — with nothing pointing at the cause.
 */

const draft = {
  ...EMPTY_DRAFT,
  name: 'appointment_booking',
  bodyText: 'Hi {{1}}, tap below to pick a time.',
  bodySamples: ['Aisha'],
  footerText: 'Takes a minute',
  flow: {
    flowId: '1234567890',
    flowName: 'Booking',
    buttonText: 'Book now',
    action: 'navigate' as const,
    navigateScreen: 'WELCOME_SCREEN',
  },
};

describe('definitionFromDraft — flows', () => {
  it('carries the FLOW button into components', () => {
    const definition = definitionFromDraft(draft, 'Marketing', 'flows');
    expect(definition.template_type).toBe('flows');
    expect(getButtons(definition.components)).toEqual([
      {
        type: 'FLOW',
        text: 'Book now',
        flow_id: '1234567890',
        flow_name: 'Booking',
        flow_action: 'navigate',
        navigate_screen: 'WELCOME_SCREEN',
      },
    ]);
  });

  it('produces exactly one BUTTONS component', () => {
    // The flat conversion is called with buttons:null and the FLOW button
    // appended after, so a second BUTTONS block would mean the flat path
    // had emitted one too.
    const definition = definitionFromDraft(draft, 'Marketing', 'flows');
    expect(
      definition.components.filter((c) => c.type === 'BUTTONS'),
    ).toHaveLength(1);
  });

  it('keeps the header, body and footer in Meta’s order', () => {
    const definition = definitionFromDraft(
      { ...draft, headerFormat: 'text', headerContent: 'Book your slot' },
      'Utility',
      'flows',
    );
    expect(definition.components.map((c) => c.type)).toEqual([
      'HEADER',
      'BODY',
      'FOOTER',
      'BUTTONS',
    ]);
  });

  it('omits the screen name for data_exchange', () => {
    const definition = definitionFromDraft(
      { ...draft, flow: { ...draft.flow, action: 'data_exchange' } },
      'Marketing',
      'flows',
    );
    const button = getButtons(definition.components)[0];
    expect(button).toMatchObject({ flow_action: 'data_exchange' });
    expect(button && 'navigate_screen' in button).toBe(false);
  });
});

describe('draftFromRow — flows', () => {
  it('reopens a stored Flow template in the Flow editor', () => {
    const definition = definitionFromDraft(draft, 'Marketing', 'flows');
    const { draft: back, category, templateType } = draftFromRow({
      name: definition.name,
      category: 'Marketing',
      language: definition.language,
      template_type: 'flows',
      components: definition.components,
      body_text: draft.bodyText,
    });

    expect(templateType).toBe('flows');
    expect(category).toBe('Marketing');
    expect(back.flow).toEqual(draft.flow);
    expect(back.bodyText).toBe(draft.bodyText);
    expect(back.footerText).toBe('Takes a minute');
  });

  it('detects a Flow template from its components, not its type', () => {
    // A row synced from Meta has no template_type of ours. Relying on the
    // column would reopen it as a Default template, whose editor cannot
    // represent the button — and saving would drop it.
    const definition = definitionFromDraft(draft, 'Marketing', 'flows');
    const { templateType } = draftFromRow({
      name: definition.name,
      category: 'Marketing',
      components: definition.components,
      body_text: draft.bodyText,
    });
    expect(templateType).toBe('flows');
  });

  it('treats a missing flow_action as navigate', () => {
    // Meta omits the field when it holds the default, and that is what
    // this editor submits, so the two must agree.
    const { draft: back } = draftFromRow({
      name: 'x',
      category: 'Utility',
      body_text: 'Hi',
      components: [
        { type: 'BODY', text: 'Hi' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'FLOW', text: 'Open', flow_id: '9', navigate_screen: 'S' },
          ],
        },
      ],
    });
    expect(back.flow.action).toBe('navigate');
    expect(back.flow.navigateScreen).toBe('S');
  });
});
