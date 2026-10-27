'use client';

// ============================================================
// /super-admin/plans — the pricing catalogue editor.
//
// Everything the customer sees on /upgrade-plan is authored here: the
// plans, the cycle toggle, the prices, and every string. Saving takes
// effect on the next page load — no deploy, no cache to bust.
//
// That immediacy is the requirement (change a price, the next QR asks for
// the new amount) and also the hazard, so each panel states the
// consequence of its fields rather than presenting them as neutral
// settings.
//
// Localized pricing: the selector at the right of the tabs picks the
// pricing region, kept in `?region=` so a reload stays put. "Global
// (Universal)" is today's catalogue and the fallback for every country
// without an enabled localized plan. A country opens blank and is shown
// to its customers only once enabled (see the country header). Global has
// its own header with the Global currency, changed together with every
// Global price (global-region-header.tsx).
// ============================================================

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, LayoutList, Settings2 } from 'lucide-react';

import { BillingConfigPanel } from '@/components/super-admin/billing/billing-config-panel';
import { CyclesPanel } from '@/components/super-admin/billing/cycles-panel';
import { GlobalRegionHeader } from '@/components/super-admin/billing/global-region-header';
import { PlansPanel } from '@/components/super-admin/billing/plans-panel';
import {
  RegionHeader,
  type RazorpayDeployment,
} from '@/components/super-admin/billing/region-header';
import {
  RegionSelector,
  type RegionSummary,
} from '@/components/super-admin/billing/region-selector';
import { GLOBAL_REGION, parseRegionParam } from '@/lib/billing/pricing/regions';
import { replaceSearchParams } from '@/lib/url-state';
import { cn } from '@/lib/utils';

type Tab = 'plans' | 'cycles' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'plans', label: 'Plans & prices', icon: LayoutList },
  { id: 'cycles', label: 'Billing cycles', icon: CreditCard },
  { id: 'settings', label: 'Page & UPI settings', icon: Settings2 },
];

async function fetchRegions(): Promise<{
  regions: RegionSummary[];
  razorpay: RazorpayDeployment;
} | null> {
  const res = await fetch('/api/super-admin/billing/regions');
  if (!res.ok) return null;
  return res.json();
}

// `useSearchParams` needs a Suspense boundary, or the production build
// fails with "missing Suspense with CSR bailout" (same split as
// /super-admin/payments).
export default function SuperAdminPlansPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">Loading plans…</div>
      }
    >
      <SuperAdminPlansInner />
    </Suspense>
  );
}

function SuperAdminPlansInner() {
  const searchParams = useSearchParams();
  const region = parseRegionParam(searchParams.get('region')) ?? GLOBAL_REGION;
  const isGlobal = region === GLOBAL_REGION;

  const [tab, setTab] = useState<Tab>('plans');
  const [summaries, setSummaries] = useState<Map<string, RegionSummary>>(
    () => new Map()
  );
  const [razorpay, setRazorpay] = useState<RazorpayDeployment | null>(null);
  // Bumped after a country change so every tab reloads from the server.
  const [nonce, setNonce] = useState(0);

  const loadRegions = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const data = await fetchRegions();
      if (!data || isCancelled?.()) return;
      setSummaries(new Map(data.regions.map((r) => [r.code, r])));
      setRazorpay(data.razorpay);
    } catch {
      // The selector still works without status dots.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchRegions().catch(() => null);
      if (cancelled || !data) return;
      setSummaries(new Map(data.regions.map((r) => [r.code, r])));
      setRazorpay(data.razorpay);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectRegion = (code: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (code === GLOBAL_REGION) params.delete('region');
    else params.set('region', code);
    replaceSearchParams(params);
  };

  const summary = summaries.get(region);
  // Prefixed so a panel never shares a key with its sibling region header
  // (both used to be `global-<nonce>` on Global).
  const panelKey = `panel-${region}-${nonce}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-slate-200">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-[#25D366] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="pb-1.5">
          <RegionSelector
            value={region}
            onChange={selectRegion}
            summaries={summaries}
          />
        </div>
      </div>

      {isGlobal ? (
        <GlobalRegionHeader
          key={`header-global-${nonce}`}
          onChanged={async () => {
            await loadRegions();
            setNonce((n) => n + 1);
          }}
        />
      ) : (
        <RegionHeader
          key={`header-${region}-${summary?.currency ?? ''}-${summary?.is_enabled ?? false}`}
          code={region}
          summary={summary}
          razorpay={razorpay}
          onChanged={async () => {
            await loadRegions();
            setNonce((n) => n + 1);
          }}
        />
      )}

      {tab === 'plans' ? <PlansPanel key={panelKey} region={region} /> : null}
      {tab === 'cycles' ? <CyclesPanel key={panelKey} region={region} /> : null}
      {tab === 'settings' ? (
        <BillingConfigPanel key={panelKey} region={region} />
      ) : null}
    </div>
  );
}
