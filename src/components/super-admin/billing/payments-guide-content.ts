// ============================================================
// In-app User Guide for /super-admin/payments (pure data, no React).
//
// One module per tab of the old nine-tab layout, in that order, each
// pointing at where it lives now (LEGACY_TAB_MAP). Location labels are
// never written by hand: the renderer derives them with locationLabel,
// so the guide cannot drift from the navigation.
//
// Every statement describes what the code does today. Sources are noted
// next to the claims that are easy to get wrong.
// ============================================================

import {
  LEGACY_TAB_MAP,
  type LegacyTab,
  type PaymentsSection,
  type PaymentsView,
} from './payments-nav';

export interface GuideTerm {
  term: string;
  meaning: string;
}

export interface GuideAction {
  name: string;
  what: string;
  when?: string;
  caution?: string;
}

export interface GuideModule {
  /** One per original tab. */
  id: LegacyTab;
  /** The original tab name. */
  title: string;
  /** Always LEGACY_TAB_MAP[id]. */
  location: { section: PaymentsSection; view: PaymentsView | null };
  summary: string;
  columns?: GuideTerm[];
  statuses?: GuideTerm[];
  actions?: GuideAction[];
  notes?: string[];
}

export interface GuideTopic {
  id: string;
  title: string;
  paragraphs: string[];
  terms?: GuideTerm[];
}

export interface GuideTask {
  id: string;
  title: string;
  steps: string[];
}

export interface PaymentsGuide {
  title: string;
  intro: string[];
  topics: GuideTopic[];
  modules: GuideModule[];
  tasks: GuideTask[];
}

function at(id: LegacyTab) {
  return LEGACY_TAB_MAP[id];
}

export const PAYMENTS_GUIDE: PaymentsGuide = {
  title: 'Payments & Subscriptions guide',
  intro: [
    'This page is where super admins review payments, watch Razorpay AutoPay and manage workspace access. It is grouped into five sections: Overview, Manual UPI, Subscriptions, Payments, and Activity & health.',
    'Every entry says how it happened: Razorpay AutoPay, Manual UPI, Admin action, Customer action or System. Payments › All payments lists every payment from both channels in one place.',
    'Each module below explains one area: what it shows, what each status means and what every action does. Common tasks at the end walk through the jobs that come up most often.',
  ],
  topics: [
    {
      id: 'layout',
      title: 'How the page is organised',
      paragraphs: [
        'The tab bar at the top holds five sections. Subscriptions, Payments and Activity & health each have a second row of views underneath. The table below shows where each of the nine original tabs now lives.',
        'Old bookmarks and links still work. A link such as ?tab=transactions opens Payments › Transactions and the address is rewritten to the new form.',
        'The AutoPay details drawer opens over whichever view you are on, so opening an AutoPay from a payment or an invoice and closing it again brings you back to the same list.',
      ],
    },
    {
      id: 'modes',
      title: 'Test mode and live mode',
      paragraphs: [
        'Razorpay test and live records are stored in the same database. Every row carries its mode, and test rows get an amber Test pill and a light amber tint. Test mode never moves real money.',
        'Test and live figures are never added together. The Overview shows each mode in its own block, live first.',
        'Sync now, Cancel AutoPay and webhook Retry work only on rows of the mode this server is set up for. Rows from the other mode are shown for reference, and the buttons are disabled with the reason next to them.',
        'When Razorpay is not set up on this server, the stored records are still shown, for reference. Sync now, Cancel AutoPay, Retry and Run reconciliation are unavailable, and a notice above each Razorpay list says so.',
      ],
    },
    {
      id: 'channels',
      title: 'How each entry happened',
      paragraphs: [
        'Every billing event and every payment carries a channel badge with its own colour and icon. The channel is worked out on the server from the stored source, the Razorpay or payment request link and who acted, so every screen labels the same entry the same way.',
        'Initiated by names who started the entry: the customer, the super admin, Razorpay (a webhook), Reconciliation (the scheduled job) or System. A super admin acting on an AutoPay, such as Sync now or Cancel AutoPay, is an Admin action and still links to the AutoPay.',
        'An amount is shown as money only when money moved: Paid via AutoPay, Paid via manual UPI or Refunded. Other amounts are muted with a caption. Plan price, no payment marks AutoPay status changes and admin grants, where the number is the plan price and nothing was collected. Claimed, under review and Not accepted mark manual UPI claims. Amounts are in the row’s own currency, rupees for platform billing.',
      ],
      terms: [
        {
          term: 'Razorpay AutoPay',
          meaning:
            'Recorded by Razorpay checkout, webhooks or reconciliation: checkouts, authorisations, charges, failures, refunds, disputes and anomalies.',
        },
        {
          term: 'Manual UPI',
          meaning:
            'A customer paid by UPI QR and an admin reviewed it: submitted, approved and rejected payments, and the access an approval granted.',
        },
        {
          term: 'Admin action',
          meaning:
            'Done by a super admin, no money moved unless shown: access grants, extensions, trial changes, expiries and AutoPay sync or cancel.',
        },
        {
          term: 'Customer action',
          meaning:
            'Done by the customer, for example cancelling their own AutoPay.',
        },
        {
          term: 'System',
          meaning:
            'Automatic, nobody acted: for example a trial started at signup or an access window that lapsed.',
        },
      ],
    },
    {
      id: 'money',
      title: 'All payments and Collected',
      paragraphs: [
        'Payments › All payments is one read-only ledger of every Razorpay payment and every manual UPI payment request, newest first. Each row shows the channel, the type (first payment, renewal, AutoPay setup check or manual payment), the plan and cycle, the period it covered, the amount and any refund, the method, the status and its reference: the pay_ id for Razorpay or the UTR for manual UPI.',
        'Details expands a Razorpay row with the same payment details as Transactions, including Open AutoPay. On a manual row, Review opens the Manual UPI review drawer.',
        'The Razorpay mode filter applies to Razorpay rows only. Manual UPI payments have no mode, so choosing Live or Test hides them. Status Refunded also matches partly refunded payments.',
        'The Collected card on the Overview shows, for the last 30 days or all time, AutoPay collected (live), Manual UPI approved, Refunded (live) and Net collected (live). Test mode figures sit in their own amber block and are never added to live money. AutoPay setup checks are refunded automatically and are left out. Each tile opens All payments with the matching filters.',
      ],
      terms: [
        {
          term: 'Paid',
          meaning: 'Captured by Razorpay, or approved manual UPI.',
        },
        {
          term: 'Pending',
          meaning:
            'A Razorpay payment not captured yet, or a manual request awaiting review.',
        },
        { term: 'Failed', meaning: 'The Razorpay payment did not go through.' },
        { term: 'Rejected', meaning: 'The manual UPI claim was not accepted.' },
        {
          term: 'Refunded, Partly refunded',
          meaning: 'All or part of a captured payment was refunded.',
        },
      ],
    },
    {
      id: 'transition',
      title: 'Manual UPI and AutoPay together',
      paragraphs: [
        'The server decides per request which payment flow a workspace gets. A server without Razorpay keys, which is production today, offers manual UPI to everyone.',
        'A workspace that is on Razorpay AutoPay on this server cannot submit a manual UPI payment; the request is refused. Other workspaces can still pay by manual UPI until manual intake is retired.',
        'Reviewed manual requests are read-only. Approve and Reject only work on requests that are still pending, which after a cutover means requests that were pending at that moment.',
        'A customer cannot start AutoPay checkout while one of their manual payments is still waiting for review, so review pending requests promptly.',
        'Manual payment history is never deleted.',
      ],
      terms: [
        {
          term: 'Open',
          meaning: 'Manual UPI is taken from every workspace.',
        },
        {
          term: 'Partial',
          meaning:
            'Workspaces on AutoPay on this server can no longer pay by manual UPI. Others still can. The section is labelled Manual UPI (history).',
        },
        {
          term: 'Retired',
          meaning:
            'Manual UPI is no longer taken. The list is history, apart from requests still pending at cutover.',
        },
      ],
    },
  ],
  modules: [
    {
      id: 'overview',
      title: 'Overview',
      location: at('overview'),
      summary:
        'The first screen. A banner says which Razorpay mode this server uses, or that Razorpay is not set up here. Four cards follow: Collected, Manual UPI, AutoPay and System health, each with a way into its section.',
      columns: [
        {
          term: 'Collected card',
          meaning:
            'Money by channel for the last 30 days or all time: AutoPay collected (live), Manual UPI approved, Refunded (live) and Net collected (live), with test mode in a separate amber block. Setup checks are excluded. Each tile opens All payments filtered to match.',
        },
        {
          term: 'Manual UPI card',
          meaning:
            'Pending review, Approved and Rejected request counts. Review now opens the queue when something is waiting.',
        },
        {
          term: 'Trialing with AutoPay',
          meaning:
            'Workspaces still in their trial that have already authorised AutoPay.',
        },
        {
          term: 'Active, Authorised, Payment pending, Halted, Cancelled, Completed',
          meaning:
            'AutoPay mandates in each status, for that mode. Any other status with mandates in it, such as Awaiting authorisation or Paused, gets its own tile so the tiles add up to the AutoPay list.',
        },
        {
          term: 'Charges due in 7 days',
          meaning:
            'Authorised, Active or Payment pending mandates with a charge scheduled in the next seven days.',
        },
        {
          term: 'Failed payments in 7 days',
          meaning:
            'Razorpay payments that failed in the last seven days. View failed payments opens Payments › All payments filtered to failed Razorpay payments.',
        },
        {
          term: 'System health',
          meaning:
            'Per mode: when the last webhook arrived, how many events are failed or dead, anomalies in the last seven days, and the last reconciliation run with its result.',
        },
      ],
      actions: [
        {
          name: 'Refresh',
          what: 'Reloads the figures and the manual counts.',
        },
        {
          name: 'User Guide',
          what: 'Opens this guide.',
        },
      ],
    },
    {
      id: 'subscriptions',
      title: 'AutoPay subscriptions',
      location: at('subscriptions'),
      summary:
        'Every Razorpay AutoPay mandate, in both modes. Search by workspace name or by a sub_, plan_ or cust_ id, and filter by mode, status and method. Click a row or Details to open the AutoPay drawer.',
      columns: [
        {
          term: 'Workspace',
          meaning: 'The workspace, a Test pill for test rows, and any anomaly.',
        },
        { term: 'Plan', meaning: 'Plan name with the billing cycle below it.' },
        { term: 'Amount', meaning: 'What Razorpay charges each cycle.' },
        {
          term: 'Status',
          meaning:
            'The mandate status, with "Cancels at cycle end" when that is set.',
        },
        {
          term: 'Method',
          meaning: 'Card, UPI or eMandate as Razorpay reported it.',
        },
        { term: 'Next charge', meaning: 'The next scheduled charge, in IST.' },
        { term: 'Cycle ends', meaning: 'End of the current billing cycle.' },
        {
          term: 'Razorpay id',
          meaning:
            'The sub_ id with copy and Open in Razorpay, or "Not created at Razorpay".',
        },
      ],
      statuses: [
        {
          term: 'Starting checkout',
          meaning: 'Checkout started, not created at Razorpay yet.',
        },
        {
          term: 'Failed to create',
          meaning: 'Razorpay refused to create the mandate.',
        },
        {
          term: 'Awaiting authorisation',
          meaning: 'Created at Razorpay, the customer has not authorised it.',
        },
        {
          term: 'Authorised',
          meaning: 'Mandate authorised, first charge still to come.',
        },
        { term: 'Active', meaning: 'Charging normally.' },
        {
          term: 'Payment pending',
          meaning: 'A charge failed and Razorpay is retrying.',
        },
        {
          term: 'Halted',
          meaning: 'Razorpay stopped charging after repeated failures.',
        },
        { term: 'Paused', meaning: 'Paused at Razorpay.' },
        {
          term: 'Cancelled, Completed, Expired',
          meaning: 'Ended. No further charges.',
        },
        { term: 'Replaced', meaning: 'Replaced by a newer checkout.' },
        {
          term: 'Not ended yet (filter)',
          meaning:
            'Every status that can still charge or be authorised, in one filter.',
        },
      ],
      actions: [
        {
          name: 'Details',
          what: 'Opens the drawer with the summary, invoices, payments, the event timeline and the webhook events for this mandate.',
        },
        {
          name: 'Sync now',
          what: 'Reads the mandate and its recent invoices from Razorpay again and applies anything that was missed. It never changes what the customer is charged. Audited, up to 30 times in 10 minutes.',
        },
        {
          name: 'Cancel AutoPay',
          what: 'Stops the mandate at Razorpay immediately. Paid access already granted is not changed, and the customer is emailed.',
          when: 'Allowed for Awaiting authorisation, Authorised, Active, Payment pending, Halted and Paused. Needs a reason of 5 to 500 characters, your password, your authenticator code when two-factor sign-in is on, and a confirmation tick. Up to 5 times in 15 minutes.',
          caution: 'This cannot be undone.',
        },
        {
          name: 'Open in Razorpay',
          what: 'Opens the Razorpay Dashboard page for the mandate or payment in a new tab.',
        },
      ],
      notes: [
        'Sync now and Cancel AutoPay are disabled, with the reason shown, when this server cannot reach the row’s mode.',
      ],
    },
    {
      id: 'transactions',
      title: 'Transactions',
      location: at('transactions'),
      summary:
        'Every Razorpay payment, in both modes, with Razorpay’s own fields. The Payments section opens on All payments, which lists Razorpay and manual UPI payments together; Transactions is the Razorpay-only view next to it. Search by workspace or by a pay_ or sub_ id; filter by mode, status, kind and method.',
      columns: [
        {
          term: 'Payment',
          meaning: 'The pay_ id with copy and Open in Razorpay.',
        },
        {
          term: 'Charge',
          meaning:
            'First payment, Renewal or AutoPay setup check, then the plan and cycle.',
        },
        { term: 'Status', meaning: 'The payment status.' },
        {
          term: 'Amount',
          meaning: 'What was charged, and how much was refunded when any was.',
        },
        { term: 'Method', meaning: 'Card, UPI, netbanking or wallet details.' },
        {
          term: 'Error',
          meaning:
            'Razorpay’s own code, reason and description, so a customer-side decline can be told apart from a Razorpay error.',
        },
        { term: 'Created', meaning: 'When the payment was created, in IST.' },
        {
          term: 'Details',
          meaning:
            'Expands a row with the invoice, the AutoPay, the period the payment covers, its kind, fee and tax, card issuer, error source, capture time and when access was applied.',
        },
      ],
      statuses: [
        { term: 'Created', meaning: 'Started, not yet authorised.' },
        {
          term: 'Authorised',
          meaning: 'Authorised by the bank, not captured.',
        },
        { term: 'Captured', meaning: 'Money received.' },
        { term: 'Refunded', meaning: 'Fully refunded.' },
        { term: 'Failed', meaning: 'The payment did not go through.' },
      ],
      actions: [
        {
          name: 'Open AutoPay',
          what: 'In the details row, opens the AutoPay drawer for the mandate this payment belongs to, over the Transactions list.',
        },
      ],
      notes: [
        'The AutoPay setup check is a small authorisation payment that Razorpay refunds automatically. It is not a plan payment and never grants access.',
      ],
    },
    {
      id: 'invoices',
      title: 'Invoices',
      location: at('invoices'),
      summary:
        'Razorpay invoices for AutoPay charges, in both modes. Search by workspace or by an inv_, sub_ or pay_ id.',
      columns: [
        {
          term: 'Invoice',
          meaning: 'The inv_ id, and Open invoice for Razorpay’s invoice page.',
        },
        {
          term: 'Amount',
          meaning:
            'The invoice amount, with the amount still due when there is one. Hover for the tax.',
        },
        { term: 'Billing period', meaning: 'The period the invoice covers.' },
        { term: 'Issued', meaning: 'When it was issued.' },
        {
          term: 'Paid',
          meaning: 'When it was paid, when it expired, or Not paid.',
        },
        {
          term: 'Payment',
          meaning: 'The payment that settled it, with Open in Razorpay.',
        },
      ],
      statuses: [
        { term: 'Draft, Issued', meaning: 'Not paid yet.' },
        { term: 'Partly paid', meaning: 'Part of the amount is still due.' },
        { term: 'Paid', meaning: 'Settled in full.' },
        {
          term: 'Expired, Cancelled, Deleted',
          meaning: 'No longer payable.',
        },
      ],
      actions: [
        {
          name: 'Open AutoPay',
          what: 'Opens the AutoPay drawer for the invoice’s mandate, over the Invoices list.',
        },
      ],
    },
    {
      id: 'refunds',
      title: 'Refunds & disputes',
      location: at('refunds'),
      summary:
        'Two lists that share one search and mode filter: refunds and disputes. Refunds are made in the Razorpay Dashboard, not here, and are recorded from webhooks or a reconciliation run.',
      columns: [
        {
          term: 'Speed',
          meaning:
            'How fast Razorpay paid the refund out, or the speed that was requested.',
        },
        {
          term: 'Access',
          meaning:
            'What the refund did to the workspace’s access, with the reason underneath.',
        },
        {
          term: 'Created, Processed',
          meaning: 'When it was raised and paid out.',
        },
        {
          term: 'Respond by',
          meaning:
            'The dispute deadline. Rows due within 3 days are highlighted with Due in N days, Due today or Deadline passed.',
        },
      ],
      statuses: [
        {
          term: 'Access removed',
          meaning:
            'A full refund of a plan charge: the paid time that payment bought was taken off.',
        },
        {
          term: 'No change',
          meaning:
            'Nothing moved, for example a partial refund, the AutoPay setup check, or a period a later payment already covers.',
        },
        {
          term: 'Already removed',
          meaning: 'An earlier refund or dispute already removed that time.',
        },
        {
          term: 'Not applied yet',
          meaning: 'Recorded when the refund is processed.',
        },
        {
          term: 'Dispute: Open, Under review, Won, Lost, Closed',
          meaning:
            'Respond in the Razorpay Dashboard before the deadline. A lost dispute removes the paid time and stops AutoPay. A won dispute changes nothing.',
        },
      ],
      notes: [
        'A refund on its own does not cancel AutoPay. If the customer should not be charged again, cancel AutoPay in the drawer.',
      ],
    },
    {
      id: 'webhooks',
      title: 'Webhooks & reconciliation',
      location: at('webhooks'),
      summary:
        'Now two views under Activity & health. Webhooks lists the events Razorpay sent and opens on "Failed or dead", the ones that need a person. Reconciliation lists the runs that compare our records with Razorpay.',
      columns: [
        {
          term: 'Attempts, Last error',
          meaning: 'How often processing was tried and why it last failed.',
        },
        {
          term: 'Re-queued',
          meaning: 'Never, or how many times, when and by whom.',
        },
        {
          term: 'Run columns',
          meaning:
            'Started, Mode, Triggered by, Status, Checked, Changed, Errors and Took.',
        },
      ],
      statuses: [
        {
          term: 'Received, Processing',
          meaning: 'Waiting or being processed.',
        },
        { term: 'Processed', meaning: 'Applied.' },
        { term: 'Ignored', meaning: 'Not relevant to billing.' },
        { term: 'Failed', meaning: 'Will be retried automatically.' },
        { term: 'Dead', meaning: 'Automatic retries are exhausted.' },
      ],
      actions: [
        {
          name: 'Retry',
          what: 'Puts a failed or dead event back in the queue, resets its attempts and records who did it. It is processed again within about a minute and its last error stays on the row.',
          when: 'Failed or dead events only. Up to 30 times in 10 minutes.',
        },
        {
          name: 'Run reconciliation now',
          what: 'Asks Razorpay for the current state of every AutoPay in this server’s mode and applies any change that was missed. It does not charge or cancel anything. Audited.',
          when: 'Up to 3 runs in 10 minutes. A scheduled run also happens every 5 minutes.',
        },
      ],
      notes: [
        'The Anomalies only filter shows only events that were flagged with an anomaly while being processed. The anomaly text is shown on the row.',
      ],
    },
    {
      id: 'subscribers',
      title: 'Subscribers',
      location: at('subscribers'),
      summary:
        'Every workspace’s access, with manual control. The status shown is computed from the dates; the stored status can lag behind, in which case the row also says "Stored as".',
      columns: [
        {
          term: 'Workspace',
          meaning: 'Name, plus Banned or Blocked badges when they apply.',
        },
        { term: 'Owner', meaning: 'Owner phone and email.' },
        {
          term: 'Status',
          meaning:
            'Trialing, Active, Expired or Ungated, and any grace period.',
        },
        {
          term: 'Access via',
          meaning:
            'How the workspace has its access: Razorpay AutoPay, Manual UPI payment, Admin grant or Trial, from the newest grant recorded. Last access marks an expired workspace. Not recorded means nothing on file explains the access.',
        },
        {
          term: 'AutoPay',
          meaning:
            'The workspace’s mandate, its method and next charge. Unknown means the lookup failed, never that there is no AutoPay.',
        },
        {
          term: 'Ends',
          meaning: 'When access ends, days left, and any queued window.',
        },
      ],
      actions: [
        {
          name: 'Manage',
          what: 'Give access (paid months or days with an optional plan name, or trial days, added to the end of any remaining time); End access (let it expire now for the trial, the paid plan or both, or block immediately); Change end date (paid or trial); Advanced: set the status directly, for never-gated internal or demo workspaces. Recent billing history and a note for the audit trail are in the same dialog.',
          caution:
            'Manual changes do not move Razorpay’s charge date, and ending access does not cancel AutoPay. The amber warning in the dialog links to the AutoPay.',
        },
      ],
    },
    {
      id: 'activity',
      title: 'Activity',
      location: at('activity'),
      summary:
        'Every billing event, newest first: what happened in a plain sentence, its channel, the workspace and owner email, the access change, the status change when there was one, the amount with what it means, who initiated it and when, in IST. A tile per channel shows how many events match the other filters; clicking a tile filters the table.',
      columns: [
        {
          term: 'Filters',
          meaning:
            'Search (workspace, email, admin, reference or note), Channel, Event type (all 25 types, grouped by Razorpay AutoPay, Manual UPI, Access changes and Admin), Razorpay mode and Date (last 7, 30 or 90 days). Filters run on the server, so the tiles, the count and the pages agree.',
        },
        {
          term: 'Reference',
          meaning:
            'The one id an event is about, with copy: a sub_ or pay_ id with Open in Razorpay and Open AutoPay, or a UTR with Open request.',
        },
        {
          term: 'Razorpay mode',
          meaning:
            'Live or Test keeps only Razorpay-linked events. Manual UPI and admin grants have no mode, so they are hidden by either choice.',
        },
      ],
    },
    {
      id: 'manual',
      title: 'Manual payments',
      location: at('manual'),
      summary:
        'The manual UPI queue. Customers pay by UPI QR and submit a UTR; each request is approved or rejected here. The queue switches to Pending review on first load when something is waiting. The tiles filter the list.',
      columns: [
        {
          term: 'Amount',
          meaning:
            'What the customer says they paid. On a mismatch, a red line shows the expected amount and the shortfall or excess.',
        },
        { term: 'UTR', meaning: 'The bank reference the customer submitted.' },
        { term: 'Submitted', meaning: 'When the request arrived, in IST.' },
        {
          term: 'Action',
          meaning: 'Review for pending requests, View for reviewed ones.',
        },
      ],
      statuses: [
        { term: 'Pending review', meaning: 'Waiting for a decision.' },
        { term: 'Approved', meaning: 'Access was granted.' },
        {
          term: 'Rejected',
          meaning: 'Refused with a reason the customer saw.',
        },
      ],
      actions: [
        {
          name: 'Approve',
          what: 'Shows the exact window you are about to grant before you confirm. It extends from the current end date when time is left. You can override the months or days and add an internal note. The customer is emailed.',
        },
        {
          name: 'Reject',
          what: 'Needs a reason, which the customer sees. They can submit again with a corrected UTR.',
        },
      ],
      notes: [
        'The drawer compares the plan price with what the customer paid and warns on any under or over payment.',
        'Two admins cannot approve the same request twice, and reviewed requests are read-only.',
      ],
    },
  ],
  tasks: [
    {
      id: 'failed-payment',
      title: 'Investigate a failed AutoPay payment',
      steps: [
        'On the Overview, use View failed payments under Failed payments in 7 days, or open Payments › Transactions and set Status to Failed.',
        'Read the Error column: it is Razorpay’s own code and reason.',
        'Use Open in Razorpay for the full record.',
        'Open the details row, then Open AutoPay, and press Sync now to pull the latest state. Sync now is read-only.',
        'Payment pending means Razorpay is retrying. Halted means it stopped charging.',
      ],
    },
    {
      id: 'dispute',
      title: 'Respond to a dispute',
      steps: [
        'Open Payments › Refunds & disputes and sort disputes by "Respond by, soonest".',
        'Respond in the Razorpay Dashboard before the deadline.',
        'After a lost dispute, check the workspace end date in Subscriptions › Workspaces.',
      ],
    },
    {
      id: 'webhooks-failing',
      title: 'Webhooks are failing',
      steps: [
        'Check System health on the Overview: failed, dead and last received.',
        'Open Activity & health › Webhooks. It opens on Failed or dead.',
        'Read the last error and fix the cause first.',
        'Press Retry on the affected events.',
        'If Razorpay disabled the webhook after a day of failures, re-enable it in the Razorpay Dashboard, replay events up to 7 days old, then use Run reconciliation now.',
        'Customers do not lose access meanwhile: the scheduled reconciliation grants paid time from Razorpay’s records.',
      ],
    },
    {
      id: 'review-manual',
      title: 'Review a manual UPI payment',
      steps: [
        'Open Manual UPI and pick a Pending review row.',
        'Match the UTR and amount against the bank statement.',
        'Approve, or Reject with a reason the customer will read.',
      ],
    },
    {
      id: 'adjust-access',
      title: 'Change a workspace’s access by hand',
      steps: [
        'Open Subscriptions › Workspaces and press Manage on the workspace.',
        'Read the amber AutoPay warning first when the workspace has AutoPay.',
        'Choose Give access, End access or Change end date, add a note and confirm.',
      ],
    },
    {
      id: 'confirm-refund',
      title: 'Confirm a refund was applied',
      steps: [
        'Refund the payment in the Razorpay Dashboard.',
        'Search Payments › All payments for the pay_ id: the row shows the refunded amount and its status.',
        'Find the refund in Payments › Refunds & disputes and read its Access result.',
        'Check the workspace end date in Subscriptions › Workspaces.',
      ],
    },
  ],
};
