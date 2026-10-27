// ============================================================
// Money collected, by channel and mode (pure).
//
// Definitions (kept deliberately strict, because these read as revenue):
//   AutoPay collected  billing_payments captured (status captured or
//                      refunded), excluding kind 'authorization': the ₹5
//                      AutoPay setup check is refunded by design and is
//                      not a sale. Dated by captured_at, else created_at.
//   Setup checks       those authorisation payments, shown as a footnote.
//   Refunds            billing_refunds processed, excluding access_effect
//                      'none_not_a_charge' (the setup-check refunds), so a
//                      setup check never nets against revenue. Dated by
//                      processed_at, else created_at.
//   Manual UPI         payment_requests approved, paid_amount. Real money
//                      outside Razorpay: never added to test figures.
//                      Dated by reviewed_at, else created_at.
//   Net (live)         AutoPay live + Manual UPI - Refunds live.
// Test and live are never summed, and currencies are never summed: each
// figure is a list of per-currency lines.
// Windows: rolling 30 x 24 h before `now`, and all time.
// ============================================================

export interface MoneyLine {
  currency: string;
  amountMinor: number;
  count: number;
}

export interface ByMode {
  live: MoneyLine[];
  test: MoneyLine[];
}

export interface CollectedWindow {
  autopay: ByMode;
  manualUpi: MoneyLine[];
  refunds: ByMode;
  setupChecks: ByMode;
  netLive: MoneyLine[];
}

export interface CollectedResponse {
  generatedAt: string;
  last30d: CollectedWindow;
  allTime: CollectedWindow;
}

export interface CollectedPayment {
  mode: string;
  kind: string | null;
  status: string;
  captured: boolean;
  amountMinor: number;
  currency: string;
  capturedAt: string | null;
  createdAt: string;
}

export interface CollectedRefund {
  mode: string;
  status: string;
  amountMinor: number;
  currency: string;
  accessEffect: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface CollectedManual {
  status: string;
  paidMinor: number;
  currency: string;
  reviewedAt: string | null;
  createdAt: string;
}

const DAY_MS = 86400000;

class Lines {
  private map = new Map<string, MoneyLine>();
  add(currency: string, amountMinor: number) {
    const code = (currency || 'INR').toUpperCase();
    const line = this.map.get(code) ?? {
      currency: code,
      amountMinor: 0,
      count: 0,
    };
    line.amountMinor += amountMinor;
    line.count += 1;
    this.map.set(code, line);
  }
  addLine(line: MoneyLine, sign: 1 | -1) {
    const cur = this.map.get(line.currency) ?? {
      currency: line.currency,
      amountMinor: 0,
      count: 0,
    };
    cur.amountMinor += sign * line.amountMinor;
    cur.count += line.count;
    this.map.set(line.currency, cur);
  }
  toArray(): MoneyLine[] {
    // INR first (platform currency), then alphabetical.
    return [...this.map.values()].sort((a, b) =>
      a.currency === 'INR'
        ? -1
        : b.currency === 'INR'
          ? 1
          : a.currency.localeCompare(b.currency)
    );
  }
}

function modeOf(mode: string): 'live' | 'test' | null {
  return mode === 'live' || mode === 'test' ? mode : null;
}

function windowFor(
  input: {
    payments: readonly CollectedPayment[];
    refunds: readonly CollectedRefund[];
    manual: readonly CollectedManual[];
  },
  since: number | null
): CollectedWindow {
  const inWindow = (iso: string | null) =>
    since === null || (iso !== null && Date.parse(iso) >= since);

  const autopay = { live: new Lines(), test: new Lines() };
  const setup = { live: new Lines(), test: new Lines() };
  const refunds = { live: new Lines(), test: new Lines() };
  const manual = new Lines();

  for (const p of input.payments) {
    const mode = modeOf(p.mode);
    if (!mode) continue;
    const captured =
      p.captured || p.status === 'captured' || p.status === 'refunded';
    if (!captured) continue;
    if (!inWindow(p.capturedAt ?? p.createdAt)) continue;
    if (p.kind === 'authorization') setup[mode].add(p.currency, p.amountMinor);
    else autopay[mode].add(p.currency, p.amountMinor);
  }
  for (const r of input.refunds) {
    const mode = modeOf(r.mode);
    if (!mode || r.status !== 'processed') continue;
    if (r.accessEffect === 'none_not_a_charge') continue;
    if (!inWindow(r.processedAt ?? r.createdAt)) continue;
    refunds[mode].add(r.currency, r.amountMinor);
  }
  for (const m of input.manual) {
    if (m.status !== 'approved') continue;
    if (!inWindow(m.reviewedAt ?? m.createdAt)) continue;
    manual.add(m.currency, m.paidMinor);
  }

  const net = new Lines();
  for (const l of autopay.live.toArray()) net.addLine(l, 1);
  for (const l of manual.toArray()) net.addLine(l, 1);
  for (const l of refunds.live.toArray()) net.addLine(l, -1);

  return {
    autopay: { live: autopay.live.toArray(), test: autopay.test.toArray() },
    manualUpi: manual.toArray(),
    refunds: { live: refunds.live.toArray(), test: refunds.test.toArray() },
    setupChecks: { live: setup.live.toArray(), test: setup.test.toArray() },
    netLive: net.toArray(),
  };
}

export function summariseCollected(
  input: {
    payments: readonly CollectedPayment[];
    refunds: readonly CollectedRefund[];
    manual: readonly CollectedManual[];
  },
  now: Date
): CollectedResponse {
  return {
    generatedAt: now.toISOString(),
    last30d: windowFor(input, now.getTime() - 30 * DAY_MS),
    allTime: windowFor(input, null),
  };
}
