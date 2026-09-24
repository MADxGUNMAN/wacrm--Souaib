'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Can this account have template insights at all?
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Meta refuses template analytics on a number connected through the WhatsApp
 * Business phone app — Coexistence, which Meta calls an "SMB business type":
 *
 *   (#10) This operation can not be performed on SMB business type
 *
 * It is a permanent product limit, not a setting. Yet the UI still offered an
 * Insights button on every template row, opened a dialog with period tabs and
 * a Refresh button, and only THEN reported that none of it could ever work.
 * Every one of those controls was a dead end, and the operator had to click
 * through all of them to find that out.
 *
 * We know the answer from the moment the number is connected —
 * `whatsapp_config.connection_mode` is set during onboarding and reconciled
 * against Meta's own `is_on_biz_app` (see `reconcileConnectionMode`). So the
 * entry point can simply not be rendered.
 *
 * ─── Why a tri-state and not a boolean ────────────────────────────
 *
 * `null` means "not known yet". Defaulting to `false` during the fetch would
 * hide the Insights column for a split second on every page load for accounts
 * that DO support it, which looks like a bug; defaulting to `true` would flash
 * a button that then vanishes. Callers should treat null as "keep showing what
 * you would have shown anyway" — the server still returns the honest reason,
 * so a brief optimistic render costs nothing.
 */
export function useInsightsSupport(): {
  /** false only when we positively know the account is Coexistence. */
  supported: boolean | null;
  loading: boolean;
} {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // RLS scopes this to the caller's account, so no account_id filter is
      // needed — and adding one would mean resolving the profile first.
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('connection_mode')
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // Stay at null. Guessing "unsupported" would hide a working feature
        // because of a transient read failure, which is the worse mistake.
        console.warn(
          '[use-insights-support] could not read the connection mode; ' +
            'leaving insights entry points visible:',
          error.message
        );
        setLoading(false);
        return;
      }

      setSupported(data ? data.connection_mode !== 'coexistence' : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { supported, loading };
}
