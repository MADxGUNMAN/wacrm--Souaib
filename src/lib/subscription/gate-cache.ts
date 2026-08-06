// ============================================================
// Cached gate config for Proxy — SERVER ONLY.
//
// Proxy runs on effectively every authenticated request, so it
// cannot afford a fresh `subscription_settings` read each time just to
// learn two values (`is_enabled`, `grace_days`). Those change roughly
// never — an operator toggles them by hand — so a short TTL cache is
// the right trade: one read per minute per process instead of one per
// request.
//
// Consequence to be aware of: after flipping the billing master switch
// in the super admin panel, enforcement changes within TTL_MS rather
// than instantly. That is acceptable for a setting nobody toggles under
// time pressure, and `revoke` on an individual account is not affected
// (it writes `subscription_status`, which is read fresh from the
// accounts row every request).
//
// The cache is per-process, like the rate limiter. A multi-instance
// deploy simply gets one read per instance per minute.
// ============================================================

import { getGateConfig } from './queries';
import { DEFAULT_GATE_CONFIG, type SubscriptionGateConfig } from './status';

const TTL_MS = 60_000;

let cached: SubscriptionGateConfig | null = null;
let cachedAt = 0;
/** In-flight read, so a burst of concurrent requests triggers one query. */
let inFlight: Promise<SubscriptionGateConfig> | null = null;

/**
 * Read the gate config, cached for {@link TTL_MS}.
 *
 * FAILS OPEN on any error — including a missing service-role key, which
 * is why the whole call is wrapped rather than relying on
 * `getGateConfig`'s internal handling (constructing the admin client can
 * throw synchronously before any query runs).
 *
 * Failing open is deliberate: if we cannot determine the gate config, the
 * alternative is locking every customer out of the CRM over a
 * configuration blip. A lapsed account slipping through for a minute is
 * the far cheaper failure.
 */
export async function getCachedGateConfig(): Promise<SubscriptionGateConfig> {
  const now = Date.now();

  if (cached && now - cachedAt < TTL_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const config = await getGateConfig();
      cached = config;
      cachedAt = Date.now();
      return config;
    } catch (err) {
      console.error(
        '[subscription] gate config unavailable, failing open:',
        err instanceof Error ? err.message : err,
      );
      // Cache the fallback too, so a persistent outage doesn't retry on
      // every single request.
      cached = DEFAULT_GATE_CONFIG;
      cachedAt = Date.now();
      return DEFAULT_GATE_CONFIG;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Drop the cache — for tests and for an explicit admin-triggered refresh. */
export function resetGateConfigCache(): void {
  cached = null;
  cachedAt = 0;
  inFlight = null;
}
