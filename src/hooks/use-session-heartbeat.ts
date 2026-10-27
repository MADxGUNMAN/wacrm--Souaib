'use client';

// Keeps this device's entry under Settings → Login & security →
// Logged-in devices current, and signs this tab out if the session was
// revoked from another device.

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendHeartbeat } from '@/lib/security/client';

/** While the tab is visible. The server also throttles writes. */
const INTERVAL_MS = 5 * 60_000;
/** Don't re-ping on rapid focus/visibility flips. */
const MIN_GAP_MS = 60_000;

export function useSessionHeartbeat(userId: string | null): void {
  const lastRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const beat = async (force = false) => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (!force && now - lastRef.current < MIN_GAP_MS) return;
      lastRef.current = now;

      const result = await sendHeartbeat();
      if (result === 'revoked' && !cancelled) {
        try {
          await createClient().auth.signOut({ scope: 'local' });
        } catch {
          // already gone
        }
        window.location.replace('/login?reason=session_revoked');
      }
    };

    void beat(true);
    const timer = setInterval(() => void beat(), INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [userId]);
}
