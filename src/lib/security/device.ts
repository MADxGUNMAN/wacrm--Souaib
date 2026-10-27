// ============================================================
// Device and location details for sessions and security events.
// Pure functions, no I/O — safe on server and client, unit-tested.
//
//   platform     OS family: Windows, macOS, iOS, Android, Linux, …
//   device_type  Desktop | Mobile | Tablet | TV | Bot | Unknown
//   browser      Chrome, Edge, Firefox, Safari, …
//   country      ISO-3166 alpha-2. From an edge geo header when one is
//                present (Cloudflare / Vercel / an nginx GeoIP module),
//                otherwise derived from the device's IANA timezone.
//                No IP address is ever sent to a third-party service.
// ============================================================

import Bowser from 'bowser';
import ct from 'countries-and-timezones';

export interface DeviceInfo {
  platform: string | null;
  device_type: string;
  browser: string | null;
  browser_version: string | null;
}

const MAX_UA_LENGTH = 512;

/** Shorten "Microsoft Edge" style names to what people recognise. */
const BROWSER_ALIASES: Record<string, string> = {
  'Microsoft Edge': 'Edge',
  'Samsung Internet for Android': 'Samsung Internet',
  'Opera Touch': 'Opera',
};

const OS_ALIASES: Record<string, string> = {
  'Chrome OS': 'ChromeOS',
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet',
  tv: 'TV',
  bot: 'Bot',
};

export function clampUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  return trimmed ? trimmed.slice(0, MAX_UA_LENGTH) : null;
}

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const value = clampUserAgent(ua);
  if (!value) {
    return {
      platform: null,
      device_type: 'Unknown',
      browser: null,
      browser_version: null,
    };
  }
  try {
    const parsed = Bowser.parse(value);
    const osName = parsed.os?.name || null;
    const browserName = parsed.browser?.name || null;
    const type = parsed.platform?.type;
    const version = parsed.browser?.version?.split('.')[0] || null;
    return {
      platform: osName ? (OS_ALIASES[osName] ?? osName) : null,
      device_type: (type && DEVICE_LABELS[type]) || 'Desktop',
      browser: browserName
        ? (BROWSER_ALIASES[browserName] ?? browserName)
        : null,
      browser_version: version,
    };
  } catch {
    return {
      platform: null,
      device_type: 'Unknown',
      browser: null,
      browser_version: null,
    };
  }
}

/** A real IANA zone name (e.g. "Asia/Kolkata"), or null. */
export function normalizeTimezone(tz: unknown): string | null {
  if (typeof tz !== 'string') return null;
  const value = tz.trim();
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) {
    return null;
  }
  try {
    // Throws RangeError for unknown zones.
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Primary country for an IANA timezone ("Asia/Kolkata" → "IN"). */
export function countryForTimezone(
  tz: string | null | undefined
): string | null {
  if (!tz) return null;
  const zone = ct.getTimezone(tz);
  const code = zone?.countries?.[0];
  return code ? String(code) : null;
}

/** "IN" → "India". Falls back to the code itself. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const fromDb = ct.getCountry(upper as Parameters<typeof ct.getCountry>[0]);
  if (fromDb?.name) return fromDb.name;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/** Country code from a trusted edge geo header, when the proxy adds one. */
export function headerCountry(headers: Headers): string | null {
  for (const name of [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-country-code',
  ]) {
    const raw = headers.get(name)?.trim().toUpperCase();
    // Cloudflare uses XX (unknown) and T1 (Tor).
    if (raw && /^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1') {
      return raw;
    }
  }
  return null;
}

/**
 * Best-effort client IP. nginx (prod) sets X-Real-IP, the Cloudflare
 * tunnel (devcrm) sets CF-Connecting-IP.
 */
export function clientIp(headers: Headers): string | null {
  const candidates = [
    headers.get('x-real-ip'),
    headers.get('cf-connecting-ip'),
    headers.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip)) return ip;
  }
  return null;
}

export interface RequestDeviceMeta extends DeviceInfo {
  ip: string | null;
  user_agent: string | null;
  timezone: string | null;
  country_code: string | null;
}

/**
 * Everything we record about the device behind a request. `timezone` is
 * reported by the browser (Intl), so it is only as trustworthy as the
 * device's own clock settings; it is shown as such.
 */
export function requestDeviceMeta(
  headers: Headers,
  reportedTimezone?: unknown
): RequestDeviceMeta {
  const user_agent = clampUserAgent(headers.get('user-agent'));
  const timezone = normalizeTimezone(reportedTimezone);
  return {
    ...parseUserAgent(user_agent),
    ip: clientIp(headers),
    user_agent,
    timezone,
    country_code: headerCountry(headers) ?? countryForTimezone(timezone),
  };
}
