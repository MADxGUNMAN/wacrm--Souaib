// ============================================================
// Reading a JSON API response without ever showing the user a parser
// error.
//
// The bug this exists to kill: `const data = await res.json()` throws
// `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` whenever the
// response is HTML rather than JSON. That string then becomes the
// message shown to the user, which is the worst possible outcome —
// it replaces a diagnosable failure (an HTTP status, a gateway, an
// expired session) with a sentence about JSON syntax that tells nobody
// anything, and actively misleads: it reads like a bug in the data the
// user typed.
//
// A response body starting with `<` means the request never reached, or
// never returned from, our own route handler. Every API route in this
// app returns JSON — including the auth and subscription gates in
// `proxy.ts`, which deliberately return JSON 401/403 for `/api/**`
// rather than redirecting. So HTML means something in front of the app
// answered instead: a dev server serving a compile-error page, a
// reverse proxy or Cloudflare tunnel returning its own 502/504 page, or
// a platform 413/404 page.
//
// That distinction is exactly what the user needs to be told, because it
// decides what they should do: retry, sign in again, shrink an
// attachment, or report it.
// ============================================================

export type FailureBlame =
  /** The user can fix it by changing something they entered or chose. */
  | 'you'
  /** A connection/config problem — reconnect, sign in, ask an admin. */
  | 'connection'
  /** Upstream (Meta, network, our server). Retrying is the move. */
  | 'upstream'
  /** We could not classify it. Say so rather than guessing. */
  | 'unknown';

export interface ApiReadResult<T> {
  ok: boolean;
  /** Parsed body when the response was JSON. Null otherwise. */
  data: T | null;
  /** Ready-to-display message. Null only when `ok`. */
  error: string | null;
  /** Extra guidance, when we can be confident enough to offer it. */
  hint: string | null;
  blame: FailureBlame;
  status: number;
  /** True when the body was HTML — i.e. our route never answered. */
  wasHtml: boolean;
}

/**
 * Explain a non-JSON response using its status code.
 *
 * Deliberately says whether anything was saved. After a failed submit the
 * first question is "do I try again or will I get two of them?", and only
 * the status can answer it: a gateway error means the request may or may
 * not have reached the server, while a 401 means it definitely did not.
 */
function explainNonJson(
  status: number,
  wasHtml: boolean,
  action: string
): { error: string; hint: string | null; blame: FailureBlame } {
  const page = wasHtml
    ? 'The server returned a web page instead of data'
    : 'The server returned an unreadable response';

  switch (status) {
    case 401:
      return {
        error: 'Your session has expired.',
        hint: `Sign in again, then retry — nothing was ${action}.`,
        blame: 'connection',
      };
    case 403:
      return {
        error: 'You do not have permission to do this.',
        hint: 'If you think you should, ask the workspace owner to check your role.',
        blame: 'connection',
      };
    case 404:
      return {
        error: `${page} (404 — the endpoint was not found).`,
        hint: 'This is a problem on our side, not with what you entered. Please report it.',
        blame: 'unknown',
      };
    case 413:
      return {
        error: 'The request was too large for the server to accept.',
        hint: 'If you attached an image, video or document, try a smaller file.',
        blame: 'you',
      };
    case 429:
      return {
        error: 'Too many requests in a short time.',
        hint: 'Wait a minute and try again.',
        blame: 'upstream',
      };
    case 502:
    case 503:
    case 504:
      return {
        error: `${page} (${status}).`,
        hint:
          'The app server could not be reached — it may be restarting, or a proxy/tunnel dropped the request. ' +
          `Wait a few seconds and retry; check afterwards whether it was ${action} before trying twice.`,
        blame: 'upstream',
      };
    case 500:
      return {
        error: `${page} (500 — server error).`,
        hint: `Nothing you entered caused this. Retry, and report it if it keeps happening.`,
        blame: 'unknown',
      };
    default:
      if (status >= 500) {
        return {
          error: `${page} (${status}).`,
          hint: 'A server-side problem, not something you entered. Please retry.',
          blame: 'upstream',
        };
      }
      return {
        error: `${page} (HTTP ${status}).`,
        hint: null,
        blame: 'unknown',
      };
  }
}

/**
 * Read a `fetch` response as JSON, or explain in plain words why it
 * could not be.
 *
 * Never throws and never returns a parser error as the message.
 *
 * @param action Past-tense verb for the thing being attempted, used in
 *               the guidance text: 'saved', 'submitted', 'created'.
 */
export async function readApiResponse<T = Record<string, unknown>>(
  res: Response,
  action = 'saved'
): Promise<ApiReadResult<T>> {
  // Read as text FIRST. A body can only be consumed once, so calling
  // `res.json()` and falling back to `res.text()` in a catch is not
  // possible — the stream is already spent. Text-then-parse is the only
  // ordering that keeps the raw body available to inspect.
  let raw = '';
  try {
    raw = await res.text();
  } catch {
    return {
      ok: false,
      data: null,
      error: 'The connection dropped before the server finished responding.',
      hint: `Retry, and check whether it was ${action} before trying twice.`,
      blame: 'upstream',
      status: res.status,
      wasHtml: false,
    };
  }

  const trimmed = raw.trim();
  const wasHtml = trimmed.startsWith('<');

  let parsed: T | null = null;
  if (trimmed && !wasHtml) {
    try {
      parsed = JSON.parse(trimmed) as T;
    } catch {
      parsed = null;
    }
  }

  if (parsed !== null) {
    if (res.ok) {
      return {
        ok: true,
        data: parsed,
        error: null,
        hint: null,
        blame: 'unknown',
        status: res.status,
        wasHtml: false,
      };
    }

    // Our own route answered with a JSON error — it knows far more about
    // what went wrong than we can infer out here, so its wording wins.
    const body = parsed as Record<string, unknown>;
    const message =
      typeof body.error === 'string' && body.error.trim()
        ? body.error
        : `Request failed (HTTP ${res.status}).`;
    return {
      ok: false,
      data: parsed,
      error: message,
      hint:
        typeof body.hint === 'string' && body.hint.trim() ? body.hint : null,
      blame:
        body.blame === 'you' ||
        body.blame === 'connection' ||
        body.blame === 'upstream'
          ? body.blame
          : 'unknown',
      status: res.status,
      wasHtml: false,
    };
  }

  // A 2xx with an unparseable body is its own (rare) bug — a route that
  // returned nothing, or a proxy that replaced a good response.
  if (res.ok) {
    return {
      ok: false,
      data: null,
      error: 'The server replied with something we could not read.',
      hint: `It may have been ${action} anyway — reload to check before trying again.`,
      blame: 'unknown',
      status: res.status,
      wasHtml,
    };
  }

  const explained = explainNonJson(res.status, wasHtml, action);
  return {
    ok: false,
    data: null,
    error: explained.error,
    hint: explained.hint,
    blame: explained.blame,
    status: res.status,
    wasHtml,
  };
}
