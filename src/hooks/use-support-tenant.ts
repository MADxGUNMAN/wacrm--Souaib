'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/use-auth';
import {
  getServerSnapshot,
  getSnapshot,
  setSupportTenantAccount,
  subscribe,
  type SupportTenantSnapshot,
} from '@/lib/support-chat/tenant-store';

/**
 * Live Chat availability + unread summary for the signed-in CRM user.
 *
 * Backed by one shared store (see lib/support-chat/tenant-store.ts), so any
 * number of components can call this without opening extra subscriptions.
 */
export function useSupportTenant(): SupportTenantSnapshot & {
  /** True only once the server has said yes. Loading counts as no. */
  available: boolean;
} {
  const { accountId } = useAuth();

  useEffect(() => {
    setSupportTenantAccount(accountId ?? null);
  }, [accountId]);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Guard against a snapshot left from a previous account in the frame
  // before the effect above re-points the store.
  const mine = snap.accountId === (accountId ?? null) ? snap : null;

  return {
    ...(mine ?? { ...snap, availability: null, unread: 0, preview: null }),
    // Hidden while loading on purpose: an entry point that appears and then
    // vanishes reads as a bug; one that appears a moment late does not.
    available: mine?.availability?.available === true,
  };
}
