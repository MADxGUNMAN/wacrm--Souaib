import { describe, expect, it } from 'vitest';

import {
  footerMentionsOptOut,
  hasOptOutButton,
  mismatchedOptOutLabels,
  withOptOutButton,
} from './opt-out-guidance';
import type { TemplateButton } from '@/types';

const qr = (text: string): TemplateButton => ({ type: 'QUICK_REPLY', text });
const url = (text: string): TemplateButton => ({
  type: 'URL',
  text,
  url: 'https://example.com',
});
const phone = (text: string): TemplateButton => ({
  type: 'PHONE_NUMBER',
  text,
  phone_number: '+911234567890',
});

/**
 * Meta's rule: quick replies must form ONE contiguous run. Collapse the
 * list to a boolean per button and count transitions — more than two runs
 * means a group was split, which Meta rejects.
 *
 * Reimplemented here rather than imported so the test is checking the
 * outcome against the RULE, not against the same helper the code uses.
 */
function quickReplyRuns(buttons: TemplateButton[]): number {
  let runs = 0;
  let previous: boolean | null = null;
  for (const b of buttons) {
    const isQr = b.type === 'QUICK_REPLY';
    if (isQr !== previous) {
      runs += 1;
      previous = isQr;
    }
  }
  return runs;
}

describe('withOptOutButton — placement', () => {
  it('appends to an empty button list', () => {
    expect(withOptOutButton([])).toEqual([
      { type: 'QUICK_REPLY', text: 'Stop' },
    ]);
  });

  it('appends after the last quick reply, not at the end', () => {
    // THE case that matters. Appending blindly to [QR, URL] produces
    // [QR, URL, QR] — three runs — which Meta rejects with a message about
    // button ordering that never mentions the real problem.
    const result = withOptOutButton([qr('Shop now'), url('Track order')]);

    expect(result.map((b) => b.text)).toEqual([
      'Shop now',
      'Stop',
      'Track order',
    ]);
    expect(quickReplyRuns(result)).toBeLessThanOrEqual(2);
  });

  it('appends at the end when there are no quick replies to join', () => {
    const result = withOptOutButton([url('Visit'), phone('Call us')]);

    expect(result.map((b) => b.text)).toEqual(['Visit', 'Call us', 'Stop']);
    expect(quickReplyRuns(result)).toBeLessThanOrEqual(2);
  });

  it('keeps the run contiguous for every arrangement of existing buttons', () => {
    const arrangements: TemplateButton[][] = [
      [],
      [qr('A')],
      [url('U')],
      [qr('A'), qr('B')],
      [qr('A'), url('U')],
      [url('U'), qr('A')],
      [url('U'), phone('P')],
      [qr('A'), qr('B'), url('U'), phone('P')],
      [url('U'), phone('P'), qr('A'), qr('B')],
    ];

    for (const buttons of arrangements) {
      const result = withOptOutButton(buttons);
      expect(result).toHaveLength(buttons.length + 1);
      expect(hasOptOutButton(result)).toBe(true);
      // The invariant Meta actually enforces.
      expect(quickReplyRuns(result)).toBeLessThanOrEqual(2);
    }
  });
});

describe('hasOptOutButton', () => {
  it('recognises the label regardless of case or padding', () => {
    for (const label of ['Stop', 'STOP', ' stop ', 'stop.']) {
      expect(hasOptOutButton([qr(label)])).toBe(true);
    }
  });

  it('does not count a URL button labelled Stop', () => {
    // Only a quick reply produces the webhook this feature reads.
    expect(hasOptOutButton([url('Stop')])).toBe(false);
  });

  it('does not match a label that merely contains the word', () => {
    expect(hasOptOutButton([qr('Stop these offers')])).toBe(false);
  });
});

describe('mismatchedOptOutLabels', () => {
  it('flags opt-out-ish wording the keyword list will not match', () => {
    expect(mismatchedOptOutLabels([qr('Unsubscribe')])).toEqual([
      'Unsubscribe',
    ]);
  });

  it('does not flag a correct Stop button', () => {
    expect(mismatchedOptOutLabels([qr('Stop')])).toEqual([]);
  });

  it('ignores empty and unrelated labels', () => {
    expect(mismatchedOptOutLabels([qr(''), qr('Shop now')])).toEqual([]);
  });
});

describe('footerMentionsOptOut', () => {
  it('detects the usual phrasings', () => {
    for (const text of [
      'Reply STOP to unsubscribe',
      'Send stop to opt out',
      'Reply CANCEL anytime',
      'Tap to opt-out',
    ]) {
      expect(footerMentionsOptOut(text)).toBe(true);
    }
  });

  it('does not mistake marketing copy for an opt-out instruction', () => {
    // The false PASS that matters: a plain \b boundary treats the hyphen in
    // "Non-stop" as a word start, which would mark a template as offering
    // an opt-out when it promises the opposite — silencing the warning on
    // exactly the template that needs it.
    expect(footerMentionsOptOut('Non-stop savings all week')).toBe(false);
    expect(footerMentionsOptOut('Nonstop savings all week')).toBe(false);
    expect(footerMentionsOptOut('Unstoppable deals')).toBe(false);
    expect(footerMentionsOptOut('Limited time only')).toBe(false);
  });
});
