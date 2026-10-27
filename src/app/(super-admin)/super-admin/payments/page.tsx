'use client';

// ============================================================
// /super-admin/payments: the money screens.
//
// Five sections on the shared Tabs primitive, three with a secondary
// segmented control (see components/super-admin/billing/payments-nav):
//   Overview           Manual UPI, AutoPay and System health cards
//   Manual UPI         the manual UPI verification queue
//   Subscriptions      AutoPay mandates | Workspaces
//   Payments           All payments | Transactions | Invoices |
//                      Refunds & disputes
//   Activity & health  Activity log | Webhooks | Reconciliation
//
// URL: `?tab=<section>&view=<view>&sub=<uuid>`. Every id of the old
// nine-tab layout still resolves, and a legacy or incomplete query is
// rewritten once to the canonical form. Switching section or view clears
// `sub`; closing the AutoPay drawer clears only `sub`. The drawer opens
// over whichever view is showing, so Transactions and Invoices can open
// it in place. All payments (the default Payments view) merges Razorpay
// payments and manual UPI requests, each with its channel; the Overview
// Collected card opens it with a channel or status preset. Changes use replaceSearchParams, not router.replace: only
// this page's query string changes and a server navigation would be
// wasted (lib/url-state).
//
// The Razorpay overview is fetched once here and shared with the
// Overview cards, the Webhooks and Reconciliation views (server mode)
// and the "not set up" notice. Inactive panels unmount, so each list
// owns and refetches its own state when shown, as before.
// ============================================================

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Repeat,
} from 'lucide-react';

import { ActivityPanel } from '@/components/super-admin/billing/activity-panel';
import {
  ManualPaymentsPanel,
  readManualIntake,
  type ManualCounts,
} from '@/components/super-admin/billing/manual-payments-panel';
import {
  canonicalPaymentsQuery,
  manualSectionLabel,
  PAYMENTS_SECTIONS,
  paymentsSearchParams,
  resolvePaymentsLocation,
  viewsFor,
  type PaymentsSection,
  type PaymentsTarget,
  type PaymentsView,
} from '@/components/super-admin/billing/payments-nav';
import { PaymentsLedgerPanel } from '@/components/super-admin/billing/payments-ledger-panel';
import { RazorpayInvoicesPanel } from '@/components/super-admin/billing/razorpay-invoices-panel';
import {
  RazorpayOverviewPanel,
  type LedgerPreset,
} from '@/components/super-admin/billing/razorpay-overview-panel';
import { RazorpayRefundsDisputesPanel } from '@/components/super-admin/billing/razorpay-refunds-disputes-panel';
import {
  RazorpayNotConfiguredNotice,
  useAdminJson,
  type RazorpayOverviewResponse,
  type RazorpayServerMode,
} from '@/components/super-admin/billing/razorpay-shared';
import { RazorpaySubscriptionDrawer } from '@/components/super-admin/billing/razorpay-subscription-drawer';
import { RazorpaySubscriptionsPanel } from '@/components/super-admin/billing/razorpay-subscriptions-panel';
import { RazorpayTransactionsPanel } from '@/components/super-admin/billing/razorpay-transactions-panel';
import {
  RazorpayReconciliationPanel,
  RazorpayWebhookEventsPanel,
} from '@/components/super-admin/billing/razorpay-webhooks-panel';
import { SubscribersPanel } from '@/components/super-admin/billing/subscribers-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ManualIntake } from '@/lib/billing/razorpay/provider';
import { replaceSearchParams } from '@/lib/url-state';

const SECTION_ICON: Record<PaymentsSection, React.ElementType> = {
  overview: LayoutDashboard,
  manual: CreditCard,
  subscriptions: Repeat,
  payments: Receipt,
  activity: Activity,
};

// `useSearchParams` needs a Suspense boundary, or the production build
// fails with "missing Suspense with CSR bailout" (same split as
// /settings): a thin wrapper supplies it, the inner component reads the
// query string.
export default function SuperAdminPaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">Loading payments…</div>
      }
    >
      <SuperAdminPaymentsInner />
    </Suspense>
  );
}

function SuperAdminPaymentsInner() {
  const searchParams = useSearchParams();
  const loc = resolvePaymentsLocation(searchParams);
  const query = searchParams.toString();

  const [manualCounts, setManualCounts] = useState<ManualCounts | null>(null);
  // open | partial | retired, from the server. Null until known, which
  // renders the plain "Manual UPI" label and no notice.
  const [manualIntake, setManualIntake] = useState<ManualIntake | null>(null);
  const [manualNonce, setManualNonce] = useState(0);
  const [subsReloadKey, setSubsReloadKey] = useState(0);
  const [overviewNonce, setOverviewNonce] = useState(0);
  // Channel/status preset for All payments, set by the Overview tiles.
  // The nonce remounts the ledger so the preset applies again.
  const [ledgerPreset, setLedgerPreset] = useState<{
    preset: LedgerPreset;
    nonce: number;
  }>({ preset: {}, nonce: 0 });

  const overview = useAdminJson<RazorpayOverviewResponse>(
    '/api/super-admin/billing/razorpay/overview'
  );
  const serverMode: RazorpayServerMode = overview.data
    ? overview.data.configured
      ? overview.data.mode
      : null
    : undefined;
  const notConfigured = overview.data?.configured === false;

  // Rewrite a legacy or incomplete query once to the canonical form.
  useEffect(() => {
    const canonical = canonicalPaymentsQuery(new URLSearchParams(query));
    if (canonical !== null) {
      replaceSearchParams(new URLSearchParams(canonical));
    }
  }, [query]);

  // The counts sit on the Manual UPI tab and the Overview card, so they
  // are fetched here; the queue updates them again whenever it loads.
  useEffect(() => {
    let cancelled = false;
    fetch(
      '/api/super-admin/billing/payment-requests?status=pending&pageSize=10'
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setManualCounts({
            pending: data.counts?.pending ?? 0,
            approved: data.counts?.approved ?? 0,
            rejected: data.counts?.rejected ?? 0,
          });
          setManualIntake(readManualIntake(data.manualIntake));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manualNonce]);

  const go = useCallback(
    (target: PaymentsTarget) => {
      // Client-only switch: no server navigation (see lib/url-state).
      replaceSearchParams(paymentsSearchParams(target, query));
    },
    [query]
  );

  const openSubscription = useCallback(
    (id: string) => go({ ...loc, sub: id }),
    [go, loc]
  );
  const openAutopayList = useCallback(
    (id: string) => go({ section: 'subscriptions', view: 'autopay', sub: id }),
    [go]
  );
  const openManual = useCallback(() => go({ section: 'manual' }), [go]);
  const openLedger = useCallback(
    (preset: LedgerPreset) => {
      setLedgerPreset((p) => ({ preset, nonce: p.nonce + 1 }));
      go({ section: 'payments', view: 'ledger' });
    },
    [go]
  );

  const pending = manualCounts?.pending ?? 0;
  const notice = notConfigured ? (
    <RazorpayNotConfiguredNotice onOpenManual={openManual} />
  ) : null;

  return (
    <div className="space-y-3">
      <Tabs
        value={loc.section}
        onValueChange={(value) => go({ section: value as PaymentsSection })}
        className="gap-3"
      >
        <TabsList
          variant="line"
          aria-label="Payments sections"
          className="h-auto w-full flex-wrap justify-start gap-1 border-b border-slate-200 pb-1"
        >
          {PAYMENTS_SECTIONS.map((s) => {
            const Icon = SECTION_ICON[s.id];
            return (
              <TabsTrigger
                key={s.id}
                value={s.id}
                className="flex-none px-3 py-1.5 text-sm text-slate-500 after:bg-[#25D366] hover:text-slate-800 data-active:text-slate-900"
              >
                <Icon className="hidden xl:inline-block" aria-hidden />
                {s.id === 'manual' ? manualSectionLabel(manualIntake) : s.label}
                {s.id === 'manual' && pending > 0 ? (
                  <span className="ml-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] leading-4 font-semibold text-amber-700">
                    {pending}
                    <span className="sr-only"> pending</span>
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview">
          <RazorpayOverviewPanel
            overview={overview}
            manualCounts={manualCounts}
            manualIntake={manualIntake}
            onRefresh={() => {
              overview.reload();
              setManualNonce((n) => n + 1);
              setOverviewNonce((n) => n + 1);
            }}
            onNavigate={go}
            onOpenLedger={openLedger}
            refreshKey={overviewNonce}
          />
        </TabsContent>

        <TabsContent value="manual">
          <ManualPaymentsPanel
            onCountsChange={setManualCounts}
            manualIntake={manualIntake}
            onManualIntakeChange={setManualIntake}
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SectionViews
            section="subscriptions"
            view={loc.view}
            onView={(view) => go({ section: 'subscriptions', view })}
            panels={{
              autopay: (
                <div className="space-y-3">
                  {notice}
                  <RazorpaySubscriptionsPanel
                    selectedId={loc.sub}
                    onOpen={openSubscription}
                    reloadKey={subsReloadKey}
                  />
                </div>
              ),
              workspaces: <SubscribersPanel onOpenAutopay={openAutopayList} />,
            }}
          />
        </TabsContent>

        <TabsContent value="payments">
          <SectionViews
            section="payments"
            view={loc.view}
            onView={(view) => go({ section: 'payments', view })}
            panels={{
              ledger: (
                <div className="space-y-3">
                  {notice}
                  <PaymentsLedgerPanel
                    key={ledgerPreset.nonce}
                    initialChannel={ledgerPreset.preset.channel}
                    initialStatus={ledgerPreset.preset.status}
                    initialMode={ledgerPreset.preset.mode}
                    onOpenSubscription={openSubscription}
                  />
                </div>
              ),
              transactions: (
                <div className="space-y-3">
                  {notice}
                  <RazorpayTransactionsPanel
                    onOpenSubscription={openSubscription}
                  />
                </div>
              ),
              invoices: (
                <div className="space-y-3">
                  {notice}
                  <RazorpayInvoicesPanel
                    onOpenSubscription={openSubscription}
                  />
                </div>
              ),
              refunds: (
                <div className="space-y-3">
                  {notice}
                  <RazorpayRefundsDisputesPanel />
                </div>
              ),
            }}
          />
        </TabsContent>

        <TabsContent value="activity">
          <SectionViews
            section="activity"
            view={loc.view}
            onView={(view) => go({ section: 'activity', view })}
            panels={{
              log: <ActivityPanel onOpenSubscription={openSubscription} />,
              webhooks: (
                <div className="space-y-3">
                  {notice}
                  <RazorpayWebhookEventsPanel serverMode={serverMode} />
                </div>
              ),
              reconciliation: (
                <div className="space-y-3">
                  {notice}
                  <RazorpayReconciliationPanel serverMode={serverMode} />
                </div>
              ),
            }}
          />
        </TabsContent>
      </Tabs>

      {loc.sub ? (
        <RazorpaySubscriptionDrawer
          key={loc.sub}
          id={loc.sub}
          onClose={() =>
            go({ section: loc.section, view: loc.view, sub: null })
          }
          onChanged={() => setSubsReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

/** The secondary segmented control of a section, and its panels. */
function SectionViews({
  section,
  view,
  onView,
  panels,
}: {
  section: PaymentsSection;
  view: PaymentsView | null;
  onView: (view: PaymentsView) => void;
  panels: Partial<Record<PaymentsView, React.ReactNode>>;
}) {
  const views = viewsFor(section);
  const label = PAYMENTS_SECTIONS.find((s) => s.id === section)?.label;
  return (
    <Tabs
      value={view ?? views[0]?.id}
      onValueChange={(value) => onView(value as PaymentsView)}
      className="gap-3"
    >
      <TabsList
        aria-label={`${label} views`}
        className="h-auto flex-wrap bg-slate-100"
      >
        {views.map((v) => (
          <TabsTrigger
            key={v.id}
            value={v.id}
            className="flex-none px-3 py-1 text-xs text-slate-600 data-active:text-slate-900"
          >
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {views.map((v) => (
        <TabsContent key={v.id} value={v.id}>
          {panels[v.id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
