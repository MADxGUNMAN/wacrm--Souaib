import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BILLING_CHANNELS } from '@/lib/billing/event-channel';

import { CHANNEL_META } from './billing-labels';
import { PaymentsGuideBody, PaymentsGuideButton } from './payments-guide';
import { PAYMENTS_GUIDE } from './payments-guide-content';
import { LEGACY_TAB_IDS, LEGACY_TAB_MAP, locationLabel } from './payments-nav';

/** Every string anywhere in the guide object. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function actionsOf(id: string): string[] {
  return (
    PAYMENTS_GUIDE.modules
      .find((m) => m.id === id)
      ?.actions?.map((a) => a.name) ?? []
  );
}

describe('PAYMENTS_GUIDE', () => {
  it('has one module per original tab, in the old order', () => {
    expect(PAYMENTS_GUIDE.modules.map((m) => m.id)).toEqual([
      ...LEGACY_TAB_IDS,
    ]);
  });

  it.each(LEGACY_TAB_IDS)('places %s where the navigation does', (id) => {
    const guideModule = PAYMENTS_GUIDE.modules.find((m) => m.id === id);
    expect(guideModule?.location).toEqual(LEGACY_TAB_MAP[id]);
  });

  it('documents the actions that change or read billing', () => {
    expect(actionsOf('subscriptions')).toEqual(
      expect.arrayContaining(['Sync now', 'Cancel AutoPay', 'Open in Razorpay'])
    );
    expect(actionsOf('webhooks')).toEqual(
      expect.arrayContaining(['Retry', 'Run reconciliation now'])
    );
    expect(actionsOf('manual')).toEqual(
      expect.arrayContaining(['Approve', 'Reject'])
    );
  });

  it('includes the common tasks', () => {
    const ids = PAYMENTS_GUIDE.tasks.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['failed-payment', 'dispute', 'webhooks-failing'])
    );
  });

  it('explains channels and money, with every channel label', () => {
    const ids = PAYMENTS_GUIDE.topics.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['channels', 'money']));
    const all = strings(PAYMENTS_GUIDE).join('\n');
    for (const c of BILLING_CHANNELS) {
      expect(all).toContain(CHANNEL_META[c].label);
    }
    expect(all).toContain('All payments');
    expect(all).toContain('Collected');
  });

  it('no longer describes the old Paid or Manual source filter', () => {
    const activity = PAYMENTS_GUIDE.modules.find((m) => m.id === 'activity');
    const text = strings(activity).join('\n');
    expect(text).not.toContain('Paid or Manual');
    expect(text).not.toMatch(/filter by source/i);
    expect(text).toContain('Channel');
    expect(text).toContain('Razorpay mode');
  });

  it('uses plain prose: no exclamation marks or em dashes', () => {
    const all = strings(PAYMENTS_GUIDE);
    expect(all.length).toBeGreaterThan(50);
    for (const s of all) {
      expect(s, s).not.toContain('!');
      expect(s, s).not.toContain('\u2014');
    }
  });
});

describe('PaymentsGuideBody', () => {
  const html = renderToStaticMarkup(<PaymentsGuideBody />);

  it('renders every module title and where it lives now', () => {
    for (const m of PAYMENTS_GUIDE.modules) {
      expect(html).toContain(escapeHtml(m.title));
      expect(html).toContain(escapeHtml(locationLabel(m.location)));
    }
  });

  it('renders the topics and a contents list', () => {
    for (const t of PAYMENTS_GUIDE.topics) {
      expect(html).toContain(escapeHtml(t.title));
      expect(html).toContain(`id="guide-${t.id}"`);
    }
    expect(html).toContain('aria-label="Guide contents"');
    expect(html).toContain('Where everything lives');
  });
});

describe('PaymentsGuideButton', () => {
  it('renders a User Guide button that opens a dialog', () => {
    const html = renderToStaticMarkup(<PaymentsGuideButton />);
    expect(html).toMatch(/<button[^>]*>/);
    expect(html).toContain('User Guide');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });
});
