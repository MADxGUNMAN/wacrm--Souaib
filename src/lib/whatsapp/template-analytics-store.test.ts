import { describe, expect, it } from 'vitest';

import {
  URL_BUTTON_CLICK_TYPE,
  mergeDailyRow,
  totalsFromSeries,
  urlClicksFromSeries,
} from './template-analytics-store';
import type { DailyTemplateMetrics } from './template-analytics';

/**
 * These fixtures are Meta's ACTUAL template_analytics response for the
 * `product_flyer` template (id 1529094412296880), captured from the Graph
 * API while investigating the reported bug. Keeping the real payload means
 * the regression cannot be "fixed" against an invented shape.
 *
 * Meta returned, per day:
 *   Aug 27 — sent/delivered 6, quick_reply 6 taps, url 1 tap,
 *            amount_spent 5.18, cost_per_delivered 0.86,
 *            cost_per_url_button_click 5.18
 *   Aug 31 — sent/delivered 1, quick_reply 1 tap, no url button,
 *            amount_spent 0.86, cost_per_delivered 0.86
 *
 * Independently confirmed via pricing_analytics: 7 MARKETING messages cost
 * 6.0417, i.e. a rate of 0.8631 each. So the window truly spent 6.04 and
 * received exactly ONE link tap.
 */
function day(overrides: Partial<DailyTemplateMetrics>): DailyTemplateMetrics {
  return {
    date: '2026-08-27',
    sent: 0,
    delivered: 0,
    read: 0,
    clicked: 0,
    uniqueClicked: 0,
    amountSpent: null,
    costPerDelivered: null,
    costPerUrlClick: null,
    buttons: null,
    ...overrides,
  };
}

const AUG_27 = day({
  date: '2026-08-27',
  sent: 6,
  delivered: 6,
  read: 6,
  clicked: 7, // 6 quick-reply taps + 1 link tap
  uniqueClicked: 1,
  amountSpent: 5.18,
  costPerDelivered: 0.86,
  costPerUrlClick: 5.18,
  buttons: [
    {
      type: 'quick_reply_button',
      label: 'Get Bulk Price',
      clicks: 6,
      uniqueClicks: 0,
    },
    { type: 'url_button', label: 'View Vehicle', clicks: 1, uniqueClicks: 1 },
  ],
});

const AUG_31 = day({
  date: '2026-08-31',
  sent: 1,
  delivered: 1,
  read: 1,
  clicked: 1,
  uniqueClicked: 0,
  amountSpent: 0.86,
  costPerDelivered: 0.86,
  costPerUrlClick: null,
  buttons: [
    {
      type: 'quick_reply_button',
      label: 'Get Bulk Price',
      clicks: 1,
      uniqueClicks: 0,
    },
  ],
});

const QUIET = day({ date: '2026-08-28' });

describe('urlClicksFromSeries', () => {
  it('counts website-button taps only, never quick replies', () => {
    // 7 taps happened in total; only 1 was a link.
    expect(urlClicksFromSeries([AUG_27, AUG_31, QUIET])).toBe(1);
  });

  it('is zero when a template has no website button', () => {
    expect(urlClicksFromSeries([AUG_31])).toBe(0);
  });

  it('is zero for an empty or button-less series', () => {
    expect(urlClicksFromSeries([])).toBe(0);
    expect(urlClicksFromSeries([QUIET])).toBe(0);
  });

  it('adds link taps across days', () => {
    const second = day({
      date: '2026-09-01',
      buttons: [
        {
          type: URL_BUTTON_CLICK_TYPE,
          label: 'View Vehicle',
          clicks: 3,
          uniqueClicks: 2,
        },
      ],
    });
    expect(urlClicksFromSeries([AUG_27, second])).toBe(4);
  });
});

describe('totalsFromSeries — cost per website button click', () => {
  const totals = totalsFromSeries([AUG_27, QUIET, AUG_31]);

  it('sums spend across the window', () => {
    // 7 marketing messages at 0.8631 each, per pricing_analytics.
    expect(totals.amountSpent).toBeCloseTo(6.04, 2);
  });

  it("applies Meta's formula to the window: spend over taps", () => {
    // Meta's tooltip: "amount spent divided by the number of button
    // clicks". 6.04 spent, 1 tap.
    expect(totals.costPerUrlClick).toBeCloseTo(6.04, 2);
  });

  it("keeps Meta's per-day rate alongside, since the two differ", () => {
    // Meta priced Aug 27's tap at 5.18. Aug 31 then spent 0.86 and earned
    // no tap, which a per-day rate structurally cannot see. Both figures
    // are shown so the difference is legible.
    expect(totals.metaCostPerUrlClick).toBeCloseTo(5.18, 2);
  });

  it('exposes the denominator both figures rest on', () => {
    expect(totals.urlClicks).toBe(1);
  });

  it('reports cost per message delivered as spend over delivered', () => {
    // 6.04 / 7 delivered = 0.863, Meta's own formula, which here agrees
    // with the per-day rate Meta also publishes.
    expect(totals.costPerDelivered).toBeCloseTo(0.86, 2);
    expect(totals.metaCostPerDelivered).toBeCloseTo(0.86, 2);
  });

  it('lets all three cost figures reconcile against one spend', () => {
    // The property that makes the block checkable: both rates multiply
    // back up to the same amount spent.
    expect(totals.costPerDelivered! * totals.delivered).toBeCloseTo(
      totals.amountSpent!,
      2
    );
    expect(totals.costPerUrlClick! * totals.urlClicks).toBeCloseTo(
      totals.amountSpent!,
      2
    );
  });

  it('keeps the engagement counts untouched', () => {
    expect(totals.sent).toBe(7);
    expect(totals.delivered).toBe(7);
    expect(totals.read).toBe(7);
    // Every tap, links and quick replies together.
    expect(totals.clicked).toBe(8);
    expect(totals.uniqueClicked).toBe(1);
  });

  it('stays self-consistent: rate x taps returns the spend', () => {
    // The property that makes the headline checkable by hand against the
    // daily table.
    expect(totals.costPerUrlClick! * totals.urlClicks).toBeCloseTo(
      totals.amountSpent!,
      2
    );
  });
});

describe('totalsFromSeries — edge cases', () => {
  it('reports no click rate when nobody tapped a link', () => {
    // Spend with zero link taps is not an infinite or zero rate, it is
    // simply not a rate at all.
    const totals = totalsFromSeries([AUG_31]);
    expect(totals.urlClicks).toBe(0);
    expect(totals.costPerUrlClick).toBeNull();
    expect(totals.metaCostPerUrlClick).toBeNull();
  });

  it('falls back to Meta\u2019s daily rate when spend is withheld', () => {
    // WABAs billed through a Solution Partner's credit line get no
    // amount_spent, but Meta still reports the rate — dropping it would
    // lose the only cost signal those accounts have.
    const creditLine = day({
      date: '2026-08-27',
      delivered: 6,
      clicked: 7,
      amountSpent: null,
      costPerUrlClick: 5.18,
      buttons: [
        {
          type: 'quick_reply_button',
          label: 'Get Bulk Price',
          clicks: 6,
          uniqueClicks: 0,
        },
        {
          type: URL_BUTTON_CLICK_TYPE,
          label: 'View Vehicle',
          clicks: 1,
          uniqueClicks: 1,
        },
      ],
    });
    const totals = totalsFromSeries([creditLine]);
    expect(totals.amountSpent).toBeNull();
    // With no spend there is nothing to divide, so Meta's own per-day
    // rate stands in as the headline rather than the row going blank.
    expect(totals.costPerUrlClick).toBeCloseTo(5.18, 2);
    expect(totals.metaCostPerUrlClick).toBeCloseTo(5.18, 2);
  });

  it('weights the rate by link taps, not by every tap', () => {
    // Two days, same link-tap count, very different rates. The mean of
    // the rates is the answer; quick replies must not tilt it.
    const a = day({
      date: '2026-09-01',
      clicked: 100, // mostly quick replies
      amountSpent: null,
      costPerUrlClick: 10,
      buttons: [
        {
          type: 'quick_reply_button',
          label: 'Q',
          clicks: 99,
          uniqueClicks: 0,
        },
        { type: URL_BUTTON_CLICK_TYPE, label: 'L', clicks: 1, uniqueClicks: 1 },
      ],
    });
    const b = day({
      date: '2026-09-02',
      clicked: 1,
      amountSpent: null,
      costPerUrlClick: 20,
      buttons: [
        { type: URL_BUTTON_CLICK_TYPE, label: 'L', clicks: 1, uniqueClicks: 1 },
      ],
    });
    // Weighted by link taps (1 and 1) => 15. Weighted by `clicked`
    // (100 and 1) it would have been ~10.1.
    expect(totalsFromSeries([a, b]).metaCostPerUrlClick).toBeCloseTo(15, 2);
  });

  it('returns nulls for a window Meta reported nothing about', () => {
    const totals = totalsFromSeries([QUIET, day({ date: '2026-08-29' })]);
    expect(totals.amountSpent).toBeNull();
    expect(totals.costPerDelivered).toBeNull();
    expect(totals.metaCostPerDelivered).toBeNull();
    expect(totals.costPerUrlClick).toBeNull();
    expect(totals.metaCostPerUrlClick).toBeNull();
    expect(totals.urlClicks).toBe(0);
  });

  it('handles an empty series', () => {
    const totals = totalsFromSeries([]);
    expect(totals.sent).toBe(0);
    expect(totals.amountSpent).toBeNull();
    expect(totals.costPerUrlClick).toBeNull();
    expect(totals.metaCostPerUrlClick).toBeNull();
  });
});

describe('totalsFromSeries — days priced differently', () => {
  /**
   * Meta's real response for `welcome_message` (id 1041974535476154) over
   * the same window. Two days, two different rates:
   *   Sep 9  — 3 delivered, amount_spent 2.59, cost_per_delivered 0.86
   *   Sep 11 — 2 delivered, amount_spent 1.73, cost_per_delivered 0.87
   *
   * This series is the reference point for the whole module: WhatsApp
   * Manager's own "Amount spent" card reads 4.32 for it, so summing
   * Meta's daily figures is demonstrably what Meta itself does.
   */
  const SEP_9 = day({
    date: '2026-09-09',
    sent: 3,
    delivered: 3,
    read: 3,
    clicked: 3,
    amountSpent: 2.59,
    costPerDelivered: 0.86,
  });
  const SEP_11 = day({
    date: '2026-09-11',
    sent: 2,
    delivered: 2,
    read: 2,
    clicked: 1,
    amountSpent: 1.73,
    costPerDelivered: 0.87,
  });

  it("matches WhatsApp Manager's amount spent", () => {
    expect(totalsFromSeries([SEP_9, SEP_11]).amountSpent).toBeCloseTo(4.32, 2);
  });

  it('weights differing rates by the volume each applied to', () => {
    // 0.86 priced 3 messages and 0.87 priced 2, so the window rate leans
    // toward 0.86. A plain mean of the two rates would give 0.865 and let
    // a one-message day count as much as a thousand-message one.
    const totals = totalsFromSeries([SEP_9, SEP_11]);
    expect(totals.costPerDelivered).toBeCloseTo(0.864, 3);
    expect(totals.metaCostPerDelivered).toBeCloseTo(0.864, 3);
    expect(totals.costPerDelivered! * totals.delivered).toBeCloseTo(
      totals.amountSpent!,
      2
    );
  });

  it('lets messages Meta billed at nothing pull the average down', () => {
    // Meta bills some sends at zero — service replies inside the 24-hour
    // customer service window come back as FREE_CUSTOMER_SERVICE with
    // cost 0. Dividing real spend by real deliveries expresses that on
    // its own; assuming a flat per-message rate could not.
    const mostlyFree = day({
      date: '2026-09-12',
      sent: 5,
      delivered: 5,
      amountSpent: 0.86,
      costPerDelivered: 0.86,
    });
    const totals = totalsFromSeries([mostlyFree]);
    expect(totals.costPerDelivered).toBeCloseTo(0.172, 3);
    // Meta's per-day rate still reads 0.86, which is why both are shown.
    expect(totals.metaCostPerDelivered).toBeCloseTo(0.86, 2);
  });
});

describe('mergeDailyRow', () => {
  const stored = day({
    date: '2026-08-27',
    sent: 6,
    delivered: 6,
    read: 6,
    clicked: 7,
    uniqueClicked: 1,
    amountSpent: 5.18,
    costPerDelivered: 0.86,
    costPerUrlClick: 5.18,
  });

  it('keeps stored counts when a later fetch reports them decayed', () => {
    // Meta zeroes reads and clicks 7 days after a send. The newer, worse
    // observation must not erase the only copy of the real number.
    const decayed = day({
      date: '2026-08-27',
      sent: 6,
      delivered: 6,
      read: 0,
      clicked: 0,
      uniqueClicked: 0,
    });
    const merged = mergeDailyRow(decayed, stored);
    expect(merged.read).toBe(6);
    expect(merged.clicked).toBe(7);
    expect(merged.uniqueClicked).toBe(1);
  });

  it('takes a re-priced rate from Meta even when it went down', () => {
    // The point of the change: a price is not a count. Keeping the max
    // would pin the template to the highest rate it was ever charged and
    // ignore every reduction, so a Meta re-price would never show up.
    const repriced = day({
      date: '2026-08-27',
      costPerDelivered: 0.7,
      costPerUrlClick: 4.2,
    });
    const merged = mergeDailyRow(repriced, stored);
    expect(merged.costPerDelivered).toBeCloseTo(0.7, 2);
    expect(merged.costPerUrlClick).toBeCloseTo(4.2, 2);
  });

  it('keeps the stored rate when the newer response omits it', () => {
    // The read path merges an all-null skeleton against storage, so a
    // missing rate must never be read as "the price is now nothing".
    const merged = mergeDailyRow(day({ date: '2026-08-27' }), stored);
    expect(merged.costPerDelivered).toBeCloseTo(0.86, 2);
    expect(merged.costPerUrlClick).toBeCloseTo(5.18, 2);
  });

  it('keeps the higher spend, guarding against a truncated response', () => {
    const partial = day({ date: '2026-08-27', amountSpent: 0.86 });
    expect(mergeDailyRow(partial, stored).amountSpent).toBeCloseTo(5.18, 2);
  });
});
