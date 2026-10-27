// ============================================================
// Navigation model for /super-admin/payments (pure, no React).
//
// Five sections, three of them with sub-views:
//   Overview
//   Manual UPI
//   Subscriptions      AutoPay mandates | Workspaces
//   Payments           All payments | Transactions | Invoices |
//                      Refunds & disputes
//   Activity & health  Activity log | Webhooks | Reconciliation
//
// Canonical URL: `?tab=<section>&view=<view>&sub=<uuid>`. `view` is only
// written for sections that have views and `sub` only while the AutoPay
// drawer is open. Every id of the old nine-tab layout still resolves:
// the ids whose meaning did not change are section ids themselves, the
// others map onto a section and view (LEGACY_TAB_MAP). The page rewrites
// a legacy or incomplete query once to the canonical form.
// ============================================================

import type { ManualIntake } from '@/lib/billing/razorpay/provider';

export type PaymentsSection =
  'overview' | 'manual' | 'subscriptions' | 'payments' | 'activity';

export type PaymentsView =
  | 'autopay'
  | 'workspaces'
  | 'ledger'
  | 'transactions'
  | 'invoices'
  | 'refunds'
  | 'log'
  | 'webhooks'
  | 'reconciliation';

/** The nine tab ids of the old layout, kept working for old links. */
export type LegacyTab =
  | 'overview'
  | 'subscriptions'
  | 'transactions'
  | 'invoices'
  | 'refunds'
  | 'webhooks'
  | 'subscribers'
  | 'activity'
  | 'manual';

export interface PaymentsViewDef {
  id: PaymentsView;
  label: string;
}

export interface PaymentsSectionDef {
  id: PaymentsSection;
  label: string;
  views: readonly PaymentsViewDef[];
}

/** Where to go. A missing or invalid view means the section default. */
export interface PaymentsTarget {
  section: PaymentsSection;
  view?: PaymentsView | null;
  sub?: string | null;
}

/** Where the page is, fully resolved. */
export interface PaymentsLocation {
  section: PaymentsSection;
  view: PaymentsView | null;
  sub: string | null;
}

export const PAYMENTS_SECTIONS: readonly PaymentsSectionDef[] = [
  { id: 'overview', label: 'Overview', views: [] },
  { id: 'manual', label: 'Manual UPI', views: [] },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    views: [
      { id: 'autopay', label: 'AutoPay mandates' },
      { id: 'workspaces', label: 'Workspaces' },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    views: [
      { id: 'ledger', label: 'All payments' },
      { id: 'transactions', label: 'Transactions' },
      { id: 'invoices', label: 'Invoices' },
      { id: 'refunds', label: 'Refunds & disputes' },
    ],
  },
  {
    id: 'activity',
    label: 'Activity & health',
    views: [
      { id: 'log', label: 'Activity log' },
      { id: 'webhooks', label: 'Webhooks' },
      { id: 'reconciliation', label: 'Reconciliation' },
    ],
  },
];

export const DEFAULT_VIEW: Readonly<
  Record<PaymentsSection, PaymentsView | null>
> = {
  overview: null,
  manual: null,
  subscriptions: 'autopay',
  payments: 'ledger',
  activity: 'log',
};

/** In the order the old tab bar showed them. */
export const LEGACY_TAB_IDS: readonly LegacyTab[] = [
  'overview',
  'subscriptions',
  'transactions',
  'invoices',
  'refunds',
  'webhooks',
  'subscribers',
  'activity',
  'manual',
];

export const LEGACY_TAB_MAP: Readonly<
  Record<LegacyTab, { section: PaymentsSection; view: PaymentsView | null }>
> = {
  overview: { section: 'overview', view: null },
  subscriptions: { section: 'subscriptions', view: 'autopay' },
  transactions: { section: 'payments', view: 'transactions' },
  invoices: { section: 'payments', view: 'invoices' },
  refunds: { section: 'payments', view: 'refunds' },
  webhooks: { section: 'activity', view: 'webhooks' },
  subscribers: { section: 'subscriptions', view: 'workspaces' },
  activity: { section: 'activity', view: 'log' },
  manual: { section: 'manual', view: null },
};

const SECTION_BY_ID = new Map(PAYMENTS_SECTIONS.map((s) => [s.id, s]));

/**
 * Old ids that are not section ids. They always land on one exact view,
 * so a `view` param next to them is ignored.
 */
const LEGACY_ONLY = new Set<string>(
  LEGACY_TAB_IDS.filter((id) => !SECTION_BY_ID.has(id as PaymentsSection))
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A billing_subscriptions.id, the only thing `?sub=` may carry. */
export function isBillingSubscriptionId(
  value: string | null | undefined
): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function sectionDef(section: PaymentsSection): PaymentsSectionDef {
  return SECTION_BY_ID.get(section) ?? PAYMENTS_SECTIONS[0];
}

export function viewsFor(section: PaymentsSection): readonly PaymentsViewDef[] {
  return sectionDef(section).views;
}

function isSection(value: string | null): value is PaymentsSection {
  return value !== null && SECTION_BY_ID.has(value as PaymentsSection);
}

/** `view` when it belongs to `section`, else the section's default. */
function viewFor(
  section: PaymentsSection,
  view: string | null | undefined
): PaymentsView | null {
  const views = viewsFor(section);
  if (views.length === 0) return null;
  const match = views.find((v) => v.id === view);
  return match ? match.id : DEFAULT_VIEW[section];
}

/** Section, view and drawer id for a query string, old ids included. */
export function resolvePaymentsLocation(params: {
  get(name: string): string | null;
}): PaymentsLocation {
  const tab = params.get('tab');
  const rawSub = params.get('sub');
  const sub = isBillingSubscriptionId(rawSub) ? rawSub : null;

  if (tab !== null && LEGACY_ONLY.has(tab)) {
    const mapped = LEGACY_TAB_MAP[tab as LegacyTab];
    return { section: mapped.section, view: mapped.view, sub };
  }
  if (isSection(tab)) {
    return { section: tab, view: viewFor(tab, params.get('view')), sub };
  }
  // No tab, or one we do not know. An AutoPay link without a tab still
  // opens the drawer, over the list it belongs to.
  if (sub) return { section: 'subscriptions', view: 'autopay', sub };
  return { section: 'overview', view: null, sub: null };
}

/**
 * Copies `base`, removes tab/view/sub, then appends tab, view (only for
 * sections with views; the default when omitted or invalid) and sub
 * (only a valid id). Other params keep their order.
 */
export function paymentsSearchParams(
  target: PaymentsTarget,
  base?: string | URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(
    typeof base === 'string' ? base : (base?.toString() ?? '')
  );
  params.delete('tab');
  params.delete('view');
  params.delete('sub');
  params.append('tab', target.section);
  const view = viewFor(target.section, target.view);
  if (view) params.append('view', view);
  if (isBillingSubscriptionId(target.sub)) params.append('sub', target.sub);
  return params;
}

/** "?tab=subscriptions&view=autopay&sub=<id>", with no other params. */
export function paymentsHref(target: PaymentsTarget): string {
  return `?${paymentsSearchParams(target).toString()}`;
}

/**
 * The canonical query string when the current one needs rewriting
 * (legacy id, missing or invalid view, invalid sub), else null. Null as
 * well when none of tab/view/sub is present: a bare page URL stays bare.
 */
export function canonicalPaymentsQuery(params: URLSearchParams): string | null {
  if (!params.has('tab') && !params.has('view') && !params.has('sub')) {
    return null;
  }
  const canonical = paymentsSearchParams(
    resolvePaymentsLocation(params),
    params
  ).toString();
  return canonical === params.toString() ? null : canonical;
}

/** "Overview", "Subscriptions › AutoPay mandates". */
export function locationLabel(loc: {
  section: PaymentsSection;
  view?: PaymentsView | null;
}): string {
  const def = sectionDef(loc.section);
  const view = loc.view ? def.views.find((v) => v.id === loc.view) : null;
  return view ? `${def.label} › ${view.label}` : def.label;
}

/** The Manual UPI tab label: "(history)" once intake is not fully open. */
export function manualSectionLabel(intake: ManualIntake | null): string {
  return intake === 'partial' || intake === 'retired'
    ? 'Manual UPI (history)'
    : 'Manual UPI';
}
