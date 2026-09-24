import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  CONNECTION_OPTIONS,
  WhatsAppConnectModal,
} from './whatsapp-connect-modal';

/**
 * The verification requirements are the point of this component: they tell
 * the operator WHERE to watch for a code. Getting them wrong sends someone
 * staring at their SMS inbox for a code Meta delivered inside the WhatsApp
 * Business app, which reads as "the connection is broken".
 *
 * These tests pin the per-path mapping so a future edit cannot quietly
 * collapse them back to one shared line.
 */

function optionById(id: string) {
  const option = CONNECTION_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`No connection option with id "${id}"`);
  return option;
}

function labelsFor(id: string): string[] {
  return optionById(id).requirements.map((r) => r.label);
}

describe('connection option ids', () => {
  it('exposes exactly the three ids the Meta flow maps to featureType', () => {
    // `launchFBLogin` switches on these strings to pick Meta's featureType.
    // Renaming one silently sends the wrong flow, so they are pinned here.
    expect(CONNECTION_OPTIONS.map((o) => o.id)).toEqual([
      'new',
      'existing',
      'migrate',
    ]);
  });

  it('gives every option a title and at least one requirement', () => {
    for (const option of CONNECTION_OPTIONS) {
      expect(option.title.length, option.id).toBeGreaterThan(20);
      expect(option.requirements.length, option.id).toBeGreaterThan(0);
    }
  });

  it('uses unique requirement ids within each option', () => {
    for (const option of CONNECTION_OPTIONS) {
      const ids = option.requirements.map((r) => r.id);
      expect(new Set(ids).size, option.id).toBe(ids.length);
    }
  });
});

describe('a brand new number verifies by SMS or call', () => {
  it('asks only about an SMS/call OTP', () => {
    const labels = labelsFor('new');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('OTP');
    expect(labels[0]).toContain('SMS or Call');
  });
});

describe('a number already on the WhatsApp Business app verifies in-app', () => {
  it('asks about the WhatsApp verification code', () => {
    const labels = labelsFor('existing');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('WhatsApp verification code');
  });

  it('does NOT mention SMS or Call', () => {
    // Coexistence sends no SMS at all. Mentioning one is the bug this
    // mapping exists to prevent.
    expect(labelsFor('existing')[0]).not.toContain('SMS');
    expect(labelsFor('existing')[0]).not.toContain('Call');
  });
});

describe('migrating from another provider has two conditions', () => {
  const labels = labelsFor('migrate');

  it('asks about the SMS/call OTP', () => {
    expect(labels.some((l) => l.includes('SMS or Call'))).toBe(true);
  });

  it('also requires two-factor authentication to be disabled', () => {
    // Meta rejects the migration outright while 2FA is on at the source
    // provider — the most common reason a provider move fails.
    expect(
      labels.some((l) => l.includes('two-factor authentication is disabled'))
    ).toBe(true);
  });

  it('asks for exactly these two and nothing more', () => {
    expect(labels).toHaveLength(2);
  });
});

describe('rendering', () => {
  const noop = () => {};

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(WhatsAppConnectModal, {
        open: false,
        onClose: noop,
        onContinue: noop,
        loading: false,
      })
    );
    expect(html).toBe('');
  });

  it('renders the three paths and defaults to the new-number requirement', () => {
    const html = renderToStaticMarkup(
      React.createElement(WhatsAppConnectModal, {
        open: true,
        onClose: noop,
        onContinue: noop,
        loading: false,
      })
    );

    expect(html).toContain('Connect WhatsApp Business API');
    expect(html).toContain('Verification Requirements');
    for (const option of CONNECTION_OPTIONS) {
      // Apostrophes are HTML-escaped in the output, so compare on a
      // punctuation-free fragment of each title.
      expect(html).toContain(option.title.split("'")[0]);
    }
    // 'new' is the default selection.
    expect(html).toContain('SMS or Call');
  });

  it('does not render the removed eligibility or warning panels', () => {
    const html = renderToStaticMarkup(
      React.createElement(WhatsAppConnectModal, {
        open: true,
        onClose: noop,
        onContinue: noop,
        loading: false,
      })
    );
    expect(html).not.toContain('Check you are eligible');
    expect(html).not.toContain('cannot be changed afterwards');
  });

  it('shows a spinner and disables continue while connecting', () => {
    const html = renderToStaticMarkup(
      React.createElement(WhatsAppConnectModal, {
        open: true,
        onClose: noop,
        onContinue: noop,
        loading: true,
      })
    );
    expect(html).toContain('Connecting');
    expect(html).toContain('animate-spin');
  });

  it('disables continue until the requirements are confirmed', () => {
    // Nothing is ticked on first render, so the button must start disabled.
    const html = renderToStaticMarkup(
      React.createElement(WhatsAppConnectModal, {
        open: true,
        onClose: noop,
        onContinue: noop,
        loading: false,
      })
    );
    expect(html).toContain('disabled');
    expect(html).toContain(
      'Confirm the verification requirements above to continue'
    );
  });
});
