/**
 * api.js — the only place this add-on talks to the network.
 *
 * Contract: nothing in here throws for an HTTP or network failure. Every
 * call resolves to a plain result object:
 *
 *   { ok: true,  status, data, headers }
 *   { ok: false, status, code, message, retryAfter }
 *
 * WHY RESULTS INSTEAD OF EXCEPTIONS
 * These calls are made from two places that both need to render a
 * message rather than blow up: a sidebar/dialog handler (where an
 * uncaught throw surfaces as Apps Script's generic red toast, losing the
 * server's actual reason) and a background trigger (where a throw ends
 * the whole run and skips every remaining rule). A result object forces
 * the caller to look at the failure.
 *
 * `code` mirrors the CRM's public API envelope
 * (src/lib/api/v1/respond.ts): unauthorized | forbidden | rate_limited |
 * bad_request | not_found | internal, plus domain codes like
 * campaign_paused / subscription_inactive. Two codes are minted here for
 * failures that never reach the server: `network_error` and
 * `invalid_response`.
 */
const ReplaiApi = {
  /** Attempts INCLUDING the first. Kept low: Apps Script caps a run at 6 min. */
  MAX_ATTEMPTS: 3,

  /** Base backoff in ms; doubled per attempt, plus jitter. */
  BACKOFF_MS: 700,

  /** Longest we will honour a server's Retry-After before giving up. */
  MAX_RETRY_AFTER_MS: 10000,

  /**
   * @param {string} method    'get' | 'post' | 'patch' | 'delete'
   * @param {string} path      API path after the /api/v1 prefix, e.g. '/me'
   * @param {Object} [options]
   * @param {Object} [options.payload]  JSON body (POST/PATCH)
   * @param {string} [options.apiKey]   Overrides the stored key. Used at
   *   setup time to validate a candidate key WITHOUT persisting it first.
   * @returns {{ok: boolean, status: number, data: *, code: string,
   *            message: string, retryAfter: number, headers: Object}}
   */
  request: function (method, path, options) {
    const opts = options || {};
    const key = opts.apiKey || ReplaiAuth.getKey();

    if (!key) {
      return ReplaiApi.failure_(
        0,
        'unauthorized',
        'No API key saved. Open Extensions → Replai → Set up API key.'
      );
    }

    const url = ReplaiConfig.BASE_URL + ReplaiConfig.API_PREFIX + path;
    const params = {
      method: method,
      // Read the real status instead of letting UrlFetchApp throw on
      // 4xx/5xx — the body carries the error code we want to surface.
      muteHttpExceptions: true,
      followRedirects: false,
      headers: {
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
        // Lets the CRM attribute traffic to the add-on in its logs.
        'X-Replai-Client': 'sheets-addon/' + ReplaiConfig.VERSION,
      },
    };

    if (opts.payload !== undefined && opts.payload !== null) {
      params.contentType = 'application/json';
      params.payload = JSON.stringify(opts.payload);
    }

    let last = null;

    for (let attempt = 1; attempt <= ReplaiApi.MAX_ATTEMPTS; attempt++) {
      last = ReplaiApi.attempt_(url, params);

      if (last.ok) return last;
      if (!ReplaiApi.isRetryable_(last)) return last;

      if (attempt < ReplaiApi.MAX_ATTEMPTS) {
        Utilities.sleep(ReplaiApi.backoffFor_(last, attempt));
      }
    }

    return last;
  },

  /** Convenience wrappers. */
  get: function (path, options) {
    return ReplaiApi.request('get', path, options);
  },

  post: function (path, payload, options) {
    const opts = options || {};
    opts.payload = payload;
    return ReplaiApi.request('post', path, opts);
  },

  /**
   * Call an endpoint that needs NO API key.
   *
   * WHY THIS EXISTS AS A SEPARATE PATH
   * `request` above hard-requires a stored key and short-circuits to
   * `unauthorized` without one. That is correct for every data endpoint
   * and must stay that way — relaxing it would let a scoped call slip
   * through unauthenticated.
   *
   * But the Help & Support dialog cannot require a key. The user most
   * likely to open it is the one whose key will not validate, and a
   * support screen that demands working credentials is no use to them.
   * So the two public endpoints get their own narrow door rather than a
   * hole in the main one.
   *
   * Note the path is NOT prefixed with API_PREFIX: these live under
   * /api/public, outside the versioned key-authenticated surface.
   *
   * @param {string} method  'get' | 'post'
   * @param {string} path    Full path from the host root, e.g. '/api/public/x'
   * @param {Object} [payload] JSON body for POST
   * @param {Object} [options]
   * @param {string} [options.apiKey] Sent as a bearer token IF present, so
   *   the server can attribute the call to an account. Optional by
   *   design: the endpoint accepts the request either way, and the key
   *   travels in the Authorization header rather than the JSON body so it
   *   is never written into a request log or a stored record.
   * @returns {{ok: boolean, status: number, data: *, code: string,
   *            message: string, retryAfter: number, headers: Object}}
   */
  public_: function (method, path, payload, options) {
    const opts = options || {};
    const url = ReplaiConfig.BASE_URL + path;
    const params = {
      method: method,
      muteHttpExceptions: true,
      followRedirects: false,
      headers: {
        Accept: 'application/json',
        // Still identify the client. It is how a report gets stamped
        // with the add-on version when the body omits it.
        'X-Replai-Client': 'sheets-addon/' + ReplaiConfig.VERSION,
      },
    };

    if (opts.apiKey) {
      params.headers.Authorization = 'Bearer ' + opts.apiKey;
    }

    if (payload !== undefined && payload !== null) {
      params.contentType = 'application/json';
      params.payload = JSON.stringify(payload);
    }

    // Same retry policy as the authenticated path: the failure modes
    // (DNS, TLS, 5xx, 429) are identical and a support dialog that gives
    // up on one dropped packet is worse than one that waits a moment.
    let last = null;
    for (let attempt = 1; attempt <= ReplaiApi.MAX_ATTEMPTS; attempt++) {
      last = ReplaiApi.attempt_(url, params);
      if (last.ok) return last;
      if (!ReplaiApi.isRetryable_(last)) return last;
      if (attempt < ReplaiApi.MAX_ATTEMPTS) {
        Utilities.sleep(ReplaiApi.backoffFor_(last, attempt));
      }
    }
    return last;
  },

  // ----------------------------------------------------------------
  // internals
  // ----------------------------------------------------------------

  /** One round trip. Never throws. */
  attempt_: function (url, params) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, params);
    } catch (err) {
      // DNS failure, TLS failure, a blocked (non-allowlisted) URL, or
      // Apps Script's own fixed fetch deadline — UrlFetchApp exposes no
      // timeout option, so a slow server lands here too.
      return ReplaiApi.failure_(
        0,
        'network_error',
        'Could not reach ' + ReplaiConfig.BASE_URL + '. ' + String(err)
      );
    }

    const status = response.getResponseCode();
    const headers = response.getAllHeaders();
    const text = response.getContentText();

    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (err) {
        // An HTML error page from a proxy, a maintenance splash, etc.
        // Logged (not surfaced) because the raw body is the only clue to
        // WHICH hop broke, and it can be pages long.
        console.error('[replai] non-JSON response from ' + url + ': ' + err);
        return ReplaiApi.failure_(
          status,
          'invalid_response',
          'The server did not return JSON (HTTP ' + status + ').',
          headers
        );
      }
    }

    if (status >= 200 && status < 300) {
      return {
        ok: true,
        status: status,
        data:
          body && Object.prototype.hasOwnProperty.call(body, 'data')
            ? body.data
            : body,
        meta: body && body.meta ? body.meta : null,
        headers: headers,
      };
    }

    const envelope = (body && body.error) || {};
    return ReplaiApi.failure_(
      status,
      envelope.code || 'internal',
      envelope.message || 'Request failed with HTTP ' + status + '.',
      headers
    );
  },

  failure_: function (status, code, message, headers) {
    return {
      ok: false,
      status: status,
      code: code,
      message: message,
      retryAfter: ReplaiApi.retryAfterMs_(headers),
      headers: headers || {},
    };
  },

  /**
   * Retry only what a retry can actually fix. Deliberately excluded:
   * 401 (the key is wrong and will stay wrong), 403 (missing scope,
   * paused campaign, lapsed subscription), 400 and 404 — hammering
   * those wastes the run's budget and, on a send, delays every later
   * rule.
   */
  isRetryable_: function (result) {
    if (result.code === 'network_error') return true;
    if (result.status === 429) return true;
    return result.status >= 500 && result.status <= 599;
  },

  backoffFor_: function (result, attempt) {
    // A 429 carries the server's own Retry-After (respond.ts sets it);
    // honour it in preference to our guess.
    if (result.retryAfter > 0) {
      return Math.min(result.retryAfter, ReplaiApi.MAX_RETRY_AFTER_MS);
    }
    const base = ReplaiApi.BACKOFF_MS * Math.pow(2, attempt - 1);
    // Jitter so two triggers that fire together do not retry in lockstep.
    return base + Math.floor(Math.random() * 300);
  },

  retryAfterMs_: function (headers) {
    if (!headers) return 0;
    // Header casing is not guaranteed across proxies.
    const raw = headers['Retry-After'] || headers['retry-after'];
    const seconds = parseInt(raw, 10);
    return isNaN(seconds) || seconds < 0 ? 0 : seconds * 1000;
  },
};
