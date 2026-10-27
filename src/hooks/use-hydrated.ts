'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true afterwards.
 *
 * For values that something outside React may rewrite in the server HTML
 * — e.g. an email address that Cloudflare's Email Obfuscation or a browser
 * extension replaces — render them only once this is true, so hydration
 * never sees the rewritten markup.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
