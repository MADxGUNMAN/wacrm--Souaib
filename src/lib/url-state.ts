// ============================================================
// Client-only URL state (tabs, sub-views, filters).
//
// Use this, NOT router.replace / router.push, when only the query string
// of the CURRENT page changes and the page reads it with useSearchParams.
//
// Why: a statically prerendered page (e.g. /settings) has ONE cached
// server payload for every query string. router.replace('?view=x') makes
// Next do a server navigation, which resolves to that cached entry and
// snaps the URL back to the view you started on — the click "does
// nothing" in production while working in dev (dev renders per request).
//
// window.history.replaceState is the documented way to change the URL
// without a server round trip; Next keeps useSearchParams / usePathname
// in sync with it (docs: Linking and Navigating → Native History API).
// ============================================================

/** Replace the current URL's query string, keeping the path and hash. */
export function replaceSearchParams(params: URLSearchParams): void {
  if (typeof window === 'undefined') return;
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}
