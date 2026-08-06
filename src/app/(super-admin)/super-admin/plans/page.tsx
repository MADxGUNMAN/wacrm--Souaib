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
// ============================================================

import { useState } from 'react';
import { CreditCard, LayoutList, Settings2 } from 'lucide-react';

import { BillingConfigPanel } from '@/components/super-admin/billing/billing-config-panel';
import { CyclesPanel } from '@/components/super-admin/billing/cycles-panel';
import { PlansPanel } from '@/components/super-admin/billing/plans-panel';
import { cn } from '@/lib/utils';

type Tab = 'plans' | 'cycles' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'plans', label: 'Plans & prices', icon: LayoutList },
  { id: 'cycles', label: 'Billing cycles', icon: CreditCard },
  { id: 'settings', label: 'Page & UPI settings', icon: Settings2 },
];

export default function SuperAdminPlansPage() {
  const [tab, setTab] = useState<Tab>('plans');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Plans &amp; pricing
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Everything on the customer upgrade page — plans, prices, cycles and
          copy.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === id
                ? 'border-[#25D366] text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'plans' ? <PlansPanel /> : null}
      {tab === 'cycles' ? <CyclesPanel /> : null}
      {tab === 'settings' ? <BillingConfigPanel /> : null}
    </div>
  );
}
