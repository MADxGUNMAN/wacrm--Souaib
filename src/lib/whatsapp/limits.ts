// ============================================================
// Meta messaging limits, throughput and usage — pure parsing.
//
// Everything here answers one question the setup screen could not:
// "Limited" told the customer they were restricted, but not to WHAT.
// Meta does publish the numbers, in three separate places.
//
// FIELD NOTES that shaped this module — each one is a mistake waiting to
// be made:
//
// 1. `messaging_limit_tier` IS DEPRECATED. Meta's rate-limit doc says so
//    explicitly and points at `whatsapp_business_manager_messaging_limit`
//    instead. Most third-party blog posts still tell you to use the old
//    one, which now returns nothing.
//
// 2. The limit is NOT "messages per day". It is the number of UNIQUE
//    customers you may START a conversation with in a rolling 24-hour
//    window, outside an open customer-service window. Replies inside an
//    open window do not count. Labelling it "messages/day" would be
//    actively misleading, so the copy here never does.
//
// 3. The limit belongs to the BUSINESS PORTFOLIO, not the phone number,
//    and is shared by every number in that portfolio. One number can
//    consume the whole allowance. The UI must not imply it is per-number.
//
// 4. Tier names are not a fixed list — Meta has shipped 250, 1K, 2K, 10K,
//    100K and UNLIMITED over time. Parsed generically rather than matched
//    against an enum, so a future TIER_500K needs no code change.
//
// Docs:
//   https://developers.facebook.com/docs/whatsapp/api/rate-limits
//   https://developers.facebook.com/docs/whatsapp/business-management-api/analytics/
// ============================================================

/** The portfolio's 24-hour conversation allowance. */
export interface MessagingLimit {
  /** Raw Meta value, e.g. "TIER_250". Kept for support conversations. */
  raw: string;
  /** Unique customers per rolling 24h. Null when unlimited. */
  perDay: number | null;
  /** Ready-to-render figure, e.g. "2,000" or "Unlimited". */
  label: string;
}

/**
 * Parse `whatsapp_business_manager_messaging_limit`.
 *
 * Returns null rather than a guess when the value is absent or in a shape
 * we don't recognise — an invented limit is worse than no limit, because
 * a customer would plan a campaign around it.
 */
export function parseMessagingLimit(raw: unknown): MessagingLimit | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const value = raw.trim().toUpperCase();
  const body = value.startsWith('TIER_') ? value.slice(5) : value;

  if (body === 'UNLIMITED') {
    return { raw: value, perDay: null, label: 'Unlimited' };
  }

  // Accepts 250, 1K, 2K, 10K, 100K, 1M…
  const match = /^(\d+(?:\.\d+)?)([KM]?)$/.exec(body);
  if (!match) return null;

  const magnitude = match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1_000 : 1;
  const perDay = Math.round(Number.parseFloat(match[1]) * magnitude);
  if (!Number.isFinite(perDay) || perDay <= 0) return null;

  return {
    raw: value,
    perDay,
    label: new Intl.NumberFormat('en-US').format(perDay),
  };
}

// ------------------------------------------------------------

/** Sending speed, as opposed to the daily volume allowance. */
export interface Throughput {
  /** e.g. "STANDARD" | "HIGH" | "NOT_APPLICABLE". */
  level: string;
  /** Human sentence, or null when the level means nothing to a user. */
  description: string | null;
}

/**
 * Parse the `throughput` field.
 *
 * Meta documents the request but not a stable response shape, and has
 * returned both `{ level: "STANDARD" }` and a bare string, so both are
 * accepted. The messages-per-second figures are Meta's published
 * defaults; deliberately hedged with "about" because Meta tunes them per
 * account and we are not reading an actual number.
 */
export function parseThroughput(raw: unknown): Throughput | null {
  const level =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && 'level' in raw
        ? String((raw as { level: unknown }).level ?? '')
        : '';

  const value = level.trim().toUpperCase();
  if (!value) return null;

  const descriptions: Record<string, string> = {
    STANDARD: 'About 80 messages per second',
    HIGH: 'About 500 messages per second',
  };

  return {
    level: value,
    description: descriptions[value] ?? null,
  };
}

// ------------------------------------------------------------

/**
 * Display name review state.
 *
 * Worth surfacing on its own because it is the single most common reason
 * a healthy account sits at the lowest messaging limit, and Meta's health
 * note about it gives no indication of where it stands or what happens
 * next.
 */
export type NameReviewState =
  | 'approved'
  | 'pending'
  | 'declined'
  | 'expired'
  | 'none'
  | 'unknown';

export interface NameReview {
  state: NameReviewState;
  label: string;
  /** What this means for the customer, in their terms. */
  detail: string | null;
}

/** Map `name_status`. Values per Meta's business phone numbers doc. */
export function parseNameStatus(raw: unknown): NameReview {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();

  switch (value) {
    case 'APPROVED':
      return {
        state: 'approved',
        label: 'Approved',
        detail: 'Your business name shows in chats instead of your number.',
      };
    case 'AVAILABLE_WITHOUT_REVIEW':
      return {
        state: 'approved',
        label: 'Approved',
        detail: 'Your name was accepted without needing a review.',
      };
    case 'PENDING_REVIEW':
      return {
        state: 'pending',
        label: 'In review',
        detail:
          'Meta is reviewing your display name. Your messaging limit stays at its current level until it is approved.',
      };
    case 'DECLINED':
      return {
        state: 'declined',
        label: 'Declined',
        detail:
          'Meta rejected this display name. Choose a name that matches your legal or trading name, then resubmit.',
      };
    case 'EXPIRED':
      return {
        state: 'expired',
        label: 'Expired',
        detail: 'The name certificate has expired and needs to be renewed.',
      };
    case 'NONE':
      return {
        state: 'none',
        label: 'Not submitted',
        detail: 'No display name has been submitted for this number yet.',
      };
    default:
      return { state: 'unknown', label: '—', detail: null };
  }
}

// ------------------------------------------------------------

/** Totals from the WABA `analytics` field. */
export interface UsageTotals {
  sent: number;
  delivered: number;
  /** Share of sent messages that reached a handset, 0-100. Null if none. */
  deliveryRate: number | null;
  /** How many days the window covers, for honest labelling. */
  days: number;
}

/**
 * Sum the `analytics` data points into one total.
 *
 * A daily series is what Meta returns; the setup screen wants a single
 * headline, so the points are summed here rather than charted. Kept
 * separate from the limit on purpose — these count MESSAGES, while the
 * limit counts unique CUSTOMERS, so the two must never be presented as a
 * fraction of one another. Showing "1,200 of 2,000 used" would be wrong
 * arithmetic on two different units.
 */
export function summarizeUsage(raw: unknown, days: number): UsageTotals | null {
  const root =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  if (!root) return null;

  const points = Array.isArray(root.data_points) ? root.data_points : null;
  if (!points) return null;

  let sent = 0;
  let delivered = 0;

  for (const entry of points) {
    if (!entry || typeof entry !== 'object') continue;
    const point = entry as Record<string, unknown>;
    if (typeof point.sent === 'number') sent += point.sent;
    if (typeof point.delivered === 'number') delivered += point.delivered;
  }

  return {
    sent,
    delivered,
    deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : null,
    days,
  };
}
