'use client';

// ============================================================
// Resolve one support attachment to a usable, short-lived URL.
//
// Support media has no permanent URL by design — `media_url` is never
// populated, and the object is only reachable through a presigned GET
// that the server mints per request after checking the caller is on this
// conversation. So a bubble cannot render `src={media_url}`; it has to
// ask for a URL and then refresh it before it dies.
//
// ─── Why fetch lazily rather than with the message page ──────
//
// A thread can hold dozens of screenshots. Signing every one on every
// page read would be N signature operations and N URLs in a JSON
// response for images that are mostly scrolled past — and each would
// start its five-minute clock at fetch time rather than at view time, so
// the ones the reader actually reaches would be the ones most likely to
// have expired.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

interface AttachmentState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * The resolved result, tagged with the request it belongs to.
 *
 * Storing the tag is what lets `loading` be DERIVED — it is simply "the
 * result I hold is not for the request I am making" — instead of being a
 * third piece of state that has to be reset at the top of the effect.
 * That reset was a synchronous setState in an effect body, i.e. a
 * guaranteed extra render on every message the reader scrolls past.
 */
interface TaggedResult {
  /** `messageId|accountId` — which FILE this result is for. */
  subjectKey: string;
  /** `subjectKey|attempt` — which REQUEST produced it. */
  requestKey: string;
  url: string | null;
  error: string | null;
  /** Epoch ms the URL stops working. 0 when there is no URL. */
  expiresAt: number;
}

// ─── Surviving a reload ──────────────────────────────────────
//
// A signed URL is good for five minutes, but a page refresh threw it away
// and every image in the thread re-signed from scratch — a spinner, a round
// trip, then the picture. Caching the URL for the rest of its own lifetime
// removes that entirely: a refresh, or a navigation away and back, reuses a
// URL that is still perfectly valid.
//
// `sessionStorage`, not `localStorage`, on purpose. These URLs grant read
// access to a support attachment, so they should not outlive the tab that
// obtained them, and they must not be shared with other tabs or survive the
// browser closing. It is no more exposed than the `src` attribute already
// sitting in the DOM.
const CACHE_PREFIX = 'support-attachment:';

interface CachedUrl {
  url: string;
  expiresAt: number;
}

function readCachedUrl(subjectKey: string): CachedUrl | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + subjectKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUrl;
    if (
      typeof parsed?.url !== 'string' ||
      typeof parsed?.expiresAt !== 'number'
    )
      return null;
    return parsed;
  } catch {
    // Unavailable in some privacy modes, and a quota error is possible.
    // A cache miss is always a safe answer.
    return null;
  }
}

function writeCachedUrl(subjectKey: string, value: CachedUrl): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + subjectKey, JSON.stringify(value));
  } catch {
    // Ignore — the URL still works for this render, it just will not
    // survive a reload.
  }
}

/**
 * Re-sign this far before the URL actually expires.
 *
 * A URL that dies mid-render shows a broken image with no explanation, so
 * the refresh is scheduled early rather than on failure. 30s of slack
 * covers a slow round trip and any clock skew between browser and S3.
 */
const REFRESH_MARGIN_MS = 30_000;

/**
 * Fetch (and keep fresh) a presigned URL for a message's attachment.
 *
 * @param messageId  The support message holding the attachment.
 * @param accountId  Required when the viewer is a super admin, because
 *   the route resolves which thread they mean from it. Ignored for a
 *   tenant, whose thread comes from their session.
 * @param enabled    Pass false to hold off — e.g. while the element is
 *   still outside the viewport, or for a deleted message.
 */
export function useSupportAttachment(
  messageId: string,
  accountId: string | undefined,
  enabled: boolean
): AttachmentState & { reload: () => void } {
  // Bumped to force a re-fetch, both for the scheduled refresh and for a
  // manual retry after an error.
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subjectKey = `${messageId}|${accountId ?? ''}`;
  const requestKey = `${subjectKey}|${attempt}`;

  /**
   * Seeded from the cache, so a reload paints the image on the first render
   * instead of spinning through a round trip for a URL it already had.
   *
   * The initialiser runs once, which is exactly right: `messageId` is fixed
   * for the lifetime of a bubble.
   */
  const [result, setResult] = useState<TaggedResult | null>(() => {
    if (!enabled || !messageId || typeof window === 'undefined') return null;
    const cached = readCachedUrl(`${messageId}|${accountId ?? ''}`);
    if (!cached || cached.expiresAt - Date.now() <= REFRESH_MARGIN_MS) {
      return null;
    }
    return {
      subjectKey: `${messageId}|${accountId ?? ''}`,
      requestKey: `${messageId}|${accountId ?? ''}|0`,
      url: cached.url,
      error: null,
      expiresAt: cached.expiresAt,
    };
  });

  /**
   * Mirror of `result` for the effect below.
   *
   * The effect needs to know what it already holds, but listing `result` as
   * a dependency would re-run it on every `setResult` — and the effect's
   * own job is to call `setResult`, so that is an infinite loop. A ref is
   * the way to read current state without depending on it.
   */
  const resultRef = useRef(result);
  useEffect(() => {
    resultRef.current = result;
  });

  useEffect(() => {
    if (!enabled || !messageId) return;

    let cancelled = false;

    // Already holding a live URL for exactly this request — which is the
    // reload case, seeded above. Skip the fetch and just arrange to
    // re-sign before it lapses.
    const held = resultRef.current;
    if (
      held &&
      held.requestKey === requestKey &&
      held.url &&
      held.expiresAt - Date.now() > REFRESH_MARGIN_MS
    ) {
      timerRef.current = setTimeout(
        () => setAttempt((n) => n + 1),
        Math.max(30_000, held.expiresAt - Date.now() - REFRESH_MARGIN_MS)
      );
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }

    (async () => {
      try {
        const params = new URLSearchParams({ messageId });
        if (accountId) params.set('accountId', accountId);

        const res = await fetch(`/api/support-chat/attachment?${params}`, {
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          expiresIn?: number;
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok || !data.url) {
          setResult({
            subjectKey,
            requestKey,
            url: null,
            error: data.error ?? 'Could not load this file.',
            expiresAt: 0,
          });
          return;
        }

        const lifetimeMs = (data.expiresIn ?? 300) * 1000;
        const expiresAt = Date.now() + lifetimeMs;

        setResult({
          subjectKey,
          requestKey,
          url: data.url,
          error: null,
          expiresAt,
        });
        writeCachedUrl(subjectKey, { url: data.url, expiresAt });

        // Schedule the next signature before this one lapses. Clamped to
        // at least 30s so a surprisingly short expiry cannot turn this
        // into a request loop.
        const delay = Math.max(30_000, lifetimeMs - REFRESH_MARGIN_MS);
        timerRef.current = setTimeout(() => setAttempt((n) => n + 1), delay);
      } catch {
        if (!cancelled) {
          setResult({
            subjectKey,
            requestKey,
            url: null,
            error: 'Could not reach the server.',
            expiresAt: 0,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [messageId, accountId, enabled, subjectKey, requestKey]);

  // Two different questions, so two different comparisons:
  //
  //   sameFile    — is what I hold about the file I am being asked about?
  //   sameRequest — is it from the CURRENT attempt?
  //
  // The URL survives a refresh (same file, newer attempt), so re-signing
  // does not flash a spinner over an image the reader is already looking
  // at. Errors do not survive, because a stale failure next to a retry in
  // flight is just noise.
  const sameFile = result?.subjectKey === subjectKey;
  const sameRequest = result?.requestKey === requestKey;

  const state: AttachmentState = {
    url: sameFile ? (result?.url ?? null) : null,
    // Derived rather than stored. Storing it meant a synchronous setState
    // at the top of the effect — a guaranteed extra render for every
    // message the reader scrolls past.
    loading: enabled && Boolean(messageId) && !sameFile,
    error: sameRequest ? (result?.error ?? null) : null,
  };

  return { ...state, reload };
}
