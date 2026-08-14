import { describe, expect, it } from 'vitest';

import { humaniseFlowFieldName, parseFlowResponse } from './flow-response';

/**
 * Completed Meta WhatsApp Flow submissions.
 *
 * Before this parser existed the webhook stored '[Interactive reply]' for
 * these, so a customer could fill in a form and the business would receive
 * a placeholder with the answers thrown away. Every case below is about
 * not losing what the customer typed.
 */

describe('humaniseFlowFieldName', () => {
  it('strips Meta’s screen prefix and component index', () => {
    expect(humaniseFlowFieldName('screen_0_Your_name_0')).toBe('Your name');
    expect(humaniseFlowFieldName('screen_12_Email_address_3')).toBe(
      'Email address',
    );
  });

  it('leaves an unrecognised key alone', () => {
    // A mangled label is recoverable; a dropped field is not.
    expect(humaniseFlowFieldName('custom_key')).toBe('custom key');
    expect(humaniseFlowFieldName('name')).toBe('name');
  });

  it('falls back to the raw key when stripping leaves no words', () => {
    // `screen_0_0` reduces to "0", which labels an answer worse than the
    // raw key does.
    expect(humaniseFlowFieldName('screen_0_0')).toBe('screen_0_0');
    expect(humaniseFlowFieldName('screen_1_2')).toBe('screen_1_2');
  });
});

describe('parseFlowResponse', () => {
  it('reads the answers out of the JSON STRING', () => {
    // response_json is a string, not an object. Treating it as an object
    // is how the answers get silently lost.
    const out = parseFlowResponse({
      name: 'flow',
      body: 'Sent',
      response_json: JSON.stringify({
        flow_token: 'session-abc',
        screen_0_Your_name_0: 'Aisha',
        screen_0_Preferred_time_1: '10:30',
      }),
    });

    expect(out.flowToken).toBe('session-abc');
    expect(out.answers).toEqual([
      { label: 'Your name', value: 'Aisha' },
      { label: 'Preferred time', value: '10:30' },
    ]);
    expect(out.text).toBe('Your name: Aisha\nPreferred time: 10:30');
  });

  it('does not report flow_token as an answer', () => {
    const out = parseFlowResponse({
      response_json: JSON.stringify({ flow_token: 't', screen_0_A_0: 'x' }),
    });
    expect(out.answers).toEqual([{ label: 'A', value: 'x' }]);
  });

  it('flattens multi-select arrays', () => {
    const out = parseFlowResponse({
      response_json: JSON.stringify({
        screen_0_Interests_0: ['Shoes', 'Bags'],
      }),
    });
    expect(out.answers[0]).toEqual({ label: 'Interests', value: 'Shoes, Bags' });
  });

  it('renders booleans and numbers rather than dropping them', () => {
    // `false` and `0` are real answers. A truthiness filter would discard
    // both, which is the classic version of this bug.
    const out = parseFlowResponse({
      response_json: JSON.stringify({
        screen_0_Subscribe_0: false,
        screen_0_Guests_1: 0,
      }),
    });
    expect(out.text).toBe('Subscribe: false\nGuests: 0');
  });

  it('renders an object answer as JSON, not [object Object]', () => {
    const out = parseFlowResponse({
      response_json: JSON.stringify({
        screen_0_Address_0: { city: 'Pune' },
      }),
    });
    expect(out.answers[0].value).toBe('{"city":"Pune"}');
  });

  it('keeps the raw string when the JSON is malformed', () => {
    const out = parseFlowResponse({ response_json: '{not json' });
    expect(out.text).toBe('{not json');
    expect(out.answers).toEqual([]);
  });

  it('falls back to a readable line when there is no response_json', () => {
    expect(parseFlowResponse({ body: 'Sent' }).text).toBe('Sent');
    expect(parseFlowResponse({}).text).toBe('Form submitted');
  });

  it('still reports the token when every field was left blank', () => {
    const out = parseFlowResponse({
      body: 'Sent',
      response_json: JSON.stringify({ flow_token: 'tok', screen_0_A_0: '' }),
    });
    expect(out.flowToken).toBe('tok');
    expect(out.answers).toEqual([]);
    expect(out.text).toBe('Sent');
  });

  it('ignores a JSON array or primitive payload', () => {
    expect(parseFlowResponse({ response_json: '[1,2]' }).answers).toEqual([]);
    expect(parseFlowResponse({ response_json: '"hi"' }).answers).toEqual([]);
  });
});
