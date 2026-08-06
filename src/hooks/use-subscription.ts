'use client';

// ============================================================
// useSubscription — shared client view of the account's billing state.
//
// Four surfaces need this: the trial banner, the Billing settings tab,
// /upgrade-plan, and /subscription-required. Two of those live inside
// the dashboard shell and two do not, so a React context provider would
// have to be mounted twice (or hoisted awkwardly into the root layout).
//
// Instead this is a tiny module-level store with a subscriber set: the
// first component to mount triggers ONE fetch, every other component
// reads the same snapshot, and `refresh()` updates all of them. Same
// benefit as a provider without the plumbing, and it works identically
// inside and outside the shell.
// ============================================================

import { useCallback, useEffect, useState } from 'react';

import type { SubscriptionStatus } from '@/lib/subscription/types';

export interface SubscriptionSnapshot {
  role: 'owner' | 'member';
  isOwner: boolean;
  account: { id: string; name: string };
  state: {
    status: SubscriptionStatus;
    isTrialing: boolean;
    isActive: boolean;
    isExpired: boolean;
    isBlocked: boolean;
    inGracePeriod: boolean;
    billingDisabled: boolean;
    daysLeft: number | null;
    endsAt: string | null;
  };
  subscription: {
    planName: string | null;
    cycleLabel: string | null;
    startedAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
  } | null;
  copy: {
    trialBanner: string | null;
    trialBannerCta: string;
    freePlanLabel: string;
    freePlanSubtitle: string;
    expiredHeading: string | null;
    pendingReviewMessage: string | null;
    supportNote: string | null;
    memberBlocked: {
      heading: string;
      body: string;
      note: string;
      contactLabel: string;
    };
  };
  owner: { name: string; email: string | null } | null;
  pendingPayment: {
    id: string;
    planName: string;
    cycleLabel: string;
    expectedAmount: number;
    paidAmount: number;
    currency: string;
    transactionRef: string;
    submittedAt: string;
  } | null;
  lastPayment: {
    id: string;
    status: 'approved' | 'rejected';
    planName: string;
    cycleLabel: string;
    reviewNote: string | null;
    reviewedAt: string | null;
  } | null;
}

interface Store {
  data: SubscriptionSnapshot | null;
  loading: boolean;
  error: string | null;
}

let store: Store = { data: null, loading: false, error: null };
const listeners = new Set<() => void>();
/** Shared in-flight request so N mounting components make one call. */
let inFlight: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function setStore(next: Partial<Store>) {
  store = { ...store, ...next };
  emit();
}

async function load(): Promise<void> {
  if (inFlight) return inFlight;

  setStore({ loading: true, error: null });

  inFlight = (async () => {
    try {
      const res = await fetch('/api/billing/subscription', {
        // Billing state gates access, so a stale cached copy is worse
        // than a round trip.
        cache: 'no-store',
      });

      if (!res.ok) {
        // 401 is expected on the signed-out path (a redirect is already
        // in flight); don't surface it as an error banner.
        if (res.status === 401) {
          setStore({ data: null, loading: false, error: null });
          return;
        }
        const body = await res.json().catch(() => ({}));
        setStore({
          loading: false,
          error: body?.error ?? 'Could not load subscription details',
        });
        return;
      }

      const data = (await res.json()) as SubscriptionSnapshot;
      setStore({ data, loading: false, error: null });
    } catch {
      setStore({ loading: false, error: 'Could not load subscription details' });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Clear the shared snapshot — call on sign-out so the next user starts clean. */
export function resetSubscriptionStore(): void {
  store = { data: null, loading: false, error: null };
  inFlight = null;
  emit();
}

export interface UseSubscriptionResult extends Store {
  refresh: () => Promise<void>;
  /**
   * True only when we KNOW the account is in trial. Guarded on `data`
   * so the banner never flashes during the initial load.
   */
  showTrialBanner: boolean;
}

export function useSubscription(): UseSubscriptionResult {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);

    // Only the first subscriber triggers a load; later mounts reuse the
    // snapshot already in the store.
    if (!store.data && !store.loading && !inFlight) {
      void load();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    // Bypass the in-flight guard's early return by clearing it first, so
    // an explicit refresh after submitting a payment always re-reads.
    inFlight = null;
    await load();
  }, []);

  const state = store.data?.state;

  return {
    ...store,
    refresh,
    showTrialBanner: Boolean(
      state &&
        !state.billingDisabled &&
        state.isTrialing &&
        !state.isBlocked &&
        state.daysLeft !== null,
    ),
  };
}
