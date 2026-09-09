/**
 * Pull coordinates out of whatever a user pastes. Pure, no network.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * "Auto-detect current GPS" is the wrong primary input for this feature.
 * The agent is at a desk, and the pin they need to send is almost never
 * where they are sitting — it is the warehouse, the showroom, the customer's
 * delivery address. Browser geolocation on a desktop is also genuinely
 * unreliable: Chrome falls back to network-based lookup, which returns
 * POSITION_UNAVAILABLE often enough that "it doesn't work" is the normal
 * experience rather than the exception.
 *
 * What an agent CAN always do is find the place in Google Maps and copy
 * the link. So that becomes the main path, and GPS stays as a convenience
 * for the case where the office really is the pin.
 *
 * No map SDK, no geocoding API key, no third-party script. Parsing a URL
 * the user already has is the whole feature.
 *
 * ─── Formats handled ──────────────────────────────────────────────
 *
 *   19.0760, 72.8777                        bare coordinates
 *   19.0760 72.8777                         space separated
 *   https://maps.google.com/?q=19.07,72.87
 *   https://www.google.com/maps/@19.07,72.87,15z
 *   https://www.google.com/maps/place/Name/@19.07,72.87,17z/data=!3d19.07!4d72.87
 *   https://www.google.com/maps/search/?api=1&query=19.07,72.87
 *   geo:19.07,72.87
 *
 * Short links (`maps.app.goo.gl`, `goo.gl/maps`) cannot be resolved here —
 * they are opaque until followed — so they are REPORTED as such rather
 * than silently failing, and the caller expands them server-side.
 */

export interface ParsedLocation {
  latitude: number;
  longitude: number;
  /** Place name recovered from a `/maps/place/<Name>/` URL, when present. */
  name?: string;
}

export type ParseLocationResult =
  | { ok: true; value: ParsedLocation }
  | {
      ok: false;
      reason: 'empty' | 'short-link' | 'no-coordinates' | 'out-of-range';
    };

/** Hosts whose links are opaque until followed. */
const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];

/** Where a Maps link is allowed to point, or to land after redirects. */
const ALLOWED_MAPS_HOSTS = [
  'google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
  'g.co',
];

function hostOf(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  // http/https only. A redirect to `file:` or `gopher:` is not something to
  // follow, and neither is one we should report as a valid Maps target.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isGoogleShortLink(input: string): boolean {
  const host = hostOf(input);
  return host !== null && hostMatches(host, SHORT_LINK_HOSTS);
}

/**
 * Is this URL somewhere the link expander may talk to?
 *
 * Lives here, next to `isGoogleShortLink`, specifically so it is testable
 * without standing up a request. An endpoint that fetches a URL supplied by
 * a caller is a server-side request forgery primitive: unchecked, it will
 * happily read `http://169.254.169.254/latest/meta-data/` (cloud instance
 * credentials) or reach `http://localhost:3000/api/...` with this server's
 * network position. The expander applies this to the INPUT and again to
 * wherever the redirect chain lands, because the destination is chosen by
 * the remote side rather than by us.
 */
export function isAllowedMapsTarget(input: string): boolean {
  const host = hostOf(input);
  return host !== null && hostMatches(host, ALLOWED_MAPS_HOSTS);
}

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * `!3d<lat>!4d<lng>` — Google's encoding of the PLACE's own coordinates.
 *
 * Preferred over the `@lat,lng` segment in the same URL, because `@` is the
 * map viewport centre. Those differ by enough to drop a pin on the wrong
 * side of a road once the user has panned at all.
 */
function fromDataParam(input: string): ParsedLocation | null {
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(input);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { latitude: lat, longitude: lng } : null;
}

/** `/@<lat>,<lng>,<zoom>z` — the viewport centre. */
function fromAtSegment(input: string): ParsedLocation | null {
  const m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(input);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { latitude: lat, longitude: lng } : null;
}

/** `?q=`, `&query=`, `?ll=`, `?center=` — only when they hold coordinates. */
function fromQueryParam(input: string): ParsedLocation | null {
  const m =
    /[?&](?:q|query|ll|center|destination|daddr)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(
      input
    );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { latitude: lat, longitude: lng } : null;
}

/** `geo:<lat>,<lng>` — what an Android share sheet produces. */
function fromGeoUri(input: string): ParsedLocation | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(input.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { latitude: lat, longitude: lng } : null;
}

/**
 * A bare pair, comma or whitespace separated.
 *
 * Anchored to the whole string on purpose. Left unanchored it would happily
 * pull two numbers out of the middle of an unrelated URL and report a
 * confident, wrong pin.
 */
function fromBarePair(input: string): ParsedLocation | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
    input
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { latitude: lat, longitude: lng } : null;
}

/** Place name from `/maps/place/<Name>/`, tidied for display. */
function placeName(input: string): string | undefined {
  const m = /\/maps\/place\/([^/@?#]+)/i.exec(input);
  if (!m) return undefined;
  try {
    const decoded = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim();
    return decoded || undefined;
  } catch {
    // A malformed escape sequence is not worth failing the whole parse for —
    // the coordinates are the part that matters.
    return m[1].replace(/\+/g, ' ').trim() || undefined;
  }
}

export function parseLocationInput(raw: string): ParseLocationResult {
  const input = (raw ?? '').trim();
  if (!input) return { ok: false, reason: 'empty' };

  if (isGoogleShortLink(input)) return { ok: false, reason: 'short-link' };

  const found =
    fromGeoUri(input) ??
    fromBarePair(input) ??
    // Place coordinates before viewport centre, then query params.
    fromDataParam(input) ??
    fromAtSegment(input) ??
    fromQueryParam(input);

  if (!found) {
    // Distinguish "there were numbers but they were nonsense" from "there
    // were no coordinates at all", so the message can be specific.
    const anyPair =
      /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(input) ??
      /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(input);
    if (anyPair) return { ok: false, reason: 'out-of-range' };
    return { ok: false, reason: 'no-coordinates' };
  }

  const name = placeName(input);
  return { ok: true, value: name ? { ...found, name } : found };
}

/** Human-readable reason, for a toast. */
export function describeParseFailure(
  reason: Exclude<ParseLocationResult, { ok: true }>['reason']
): string {
  switch (reason) {
    case 'empty':
      return 'Paste a Google Maps link or coordinates first.';
    case 'short-link':
      return 'Expanding that short link…';
    case 'out-of-range':
      return 'Those coordinates are outside the valid range (latitude -90 to 90, longitude -180 to 180).';
    case 'no-coordinates':
      return 'No coordinates in that text. Open the place in Google Maps, copy the address-bar link, and paste it here.';
  }
}
