'use client';

/**
 * Insights guide — "why is this section empty, and what do I switch on".
 *
 * ─── Why this page exists ─────────────────────────────────────────
 *
 * An empty analytics section has several completely different causes,
 * and only one of them is a mistake:
 *
 *   • template metrics need an irreversible opt-in on the WABA,
 *   • calling metrics need WhatsApp Business Calling registered,
 *   • cost is withheld outright from accounts billed through a
 *     partner's credit line,
 *   • and Meta forgets reads after 7 days and everything after 90.
 *
 * The insights page states each of those where the section sits, but a
 * one-line hint cannot carry the consequences — particularly for
 * template insights, which cannot be undone and also opts the business
 * into Meta's link tracking. That belongs somewhere with room to
 * explain, which the operator reaches by choice.
 *
 * A route rather than a modal, matching /flows/guide: it is read while
 * clicking around WhatsApp Manager in another tab, and a modal would
 * close the moment they went to look.
 *
 * Note the folder name: `guide` is a static segment under
 * /settings/whatsapp-insights, and `/settings/...` is prefix-matched by
 * the proxy's protectedPaths, so auth gating comes for free.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCheck,
  Clock,
  ExternalLink,
  Eye,
  Info,
  Lock,
  Phone,
  Sparkles,
  Wallet,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'templates' | 'sections' | 'limits';

export default function InsightsGuidePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('templates');

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push('/settings/whatsapp-insights')}
            aria-label="Back to insights"
            className="text-muted-foreground hover:bg-muted hover:text-foreground mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <BookOpen className="text-primary h-5 w-5" />
              Turning on every insight
            </h1>
            <p className="text-muted-foreground mt-1 max-w-[80ch] text-sm">
              Which numbers Meta reports by default, which ones you have to ask
              for, and why a section can be empty without anything being broken.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="templates">
            <Sparkles className="mr-1.5 h-4 w-4" /> Template insights
          </TabsTrigger>
          <TabsTrigger value="sections">
            <BarChart3 className="mr-1.5 h-4 w-4" /> Section by section
          </TabsTrigger>
          <TabsTrigger value="limits">
            <Clock className="mr-1.5 h-4 w-4" /> Why numbers go missing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-5">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="sections" className="mt-5">
          <SectionsTab />
        </TabsContent>

        <TabsContent value="limits" className="mt-5">
          <LimitsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab 1 — template insights, the one that needs an opt-in
// ============================================================

function TemplatesTab() {
  return (
    <div className="space-y-5">
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Sparkles className="text-primary h-4 w-4" />
          Read and click metrics are off until you ask for them
        </h2>
        <p className="text-muted-foreground mt-1 max-w-[85ch] text-[13px] leading-relaxed">
          Every WhatsApp Business account starts with per-template analytics
          switched off. Until it is switched on, Meta records nothing at all —
          so{' '}
          <strong className="text-foreground font-medium">
            Template performance
          </strong>{' '}
          on the insights page and the{' '}
          <strong className="text-foreground font-medium">Insights</strong>{' '}
          button on each template will stay empty no matter which time period
          you pick. Message volume, delivery and spend are unaffected and keep
          working.
        </p>
        <p className="text-muted-foreground mt-2 max-w-[85ch] text-[13px] leading-relaxed">
          This is a per-account setting. If you have more than one WhatsApp
          Business account — say one for sales and one for support — turning it
          on for one does nothing for the other. Each has to be switched on
          separately, which is the usual reason one login shows the numbers and
          another does not.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Read this before you switch it on
        </h3>
        <ul className="text-muted-foreground mt-2.5 space-y-2 text-[12.5px] leading-relaxed">
          <li className="flex gap-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">
                It cannot be undone.
              </strong>{' '}
              Meta provides no way to switch it back off, through this CRM or
              through their own tools.
            </span>
          </li>
          <li className="flex gap-2">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">
                It enables more than counting.
              </strong>{' '}
              Meta also begins tracking clicks on links in your messages and
              analysing chat content in anonymised form. That is Meta&apos;s
              condition for providing the metrics, not something this CRM adds.
            </span>
          </li>
          <li className="flex gap-2">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">
                Nothing is backfilled.
              </strong>{' '}
              Collection starts the moment you enable it. Campaigns you already
              sent will never have read or click figures, so expect the screen
              to still look empty until your next send.
            </span>
          </li>
          <li className="flex gap-2">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">
                Only the workspace owner can do it.
              </strong>{' '}
              Because it is permanent and changes what Meta may collect for the
              whole business, team members are deliberately blocked from making
              that call on the owner&apos;s behalf.
            </span>
          </li>
        </ul>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h3 className="text-[13px] font-semibold">
          Option A — switch it on from here (recommended)
        </h3>
        <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
          One button, no Meta account switching. Sign in as the workspace owner
          first.
        </p>
        <div className="mt-3.5 space-y-3">
          <Step n={1}>
            Go to{' '}
            <Link
              href="/templates"
              className="text-primary font-medium hover:underline"
            >
              Templates
            </Link>{' '}
            and press{' '}
            <strong className="text-foreground font-medium">Insights</strong> on
            any template that Meta has approved.
          </Step>
          <Step n={2}>
            The dialog will say{' '}
            <em>Template insights aren&apos;t switched on yet</em> and explain
            the consequences again.
          </Step>
          <Step n={3}>
            Press{' '}
            <strong className="text-foreground font-medium">
              Enable template insights
            </strong>
            . It applies to the whole WhatsApp Business account, not just that
            one template.
          </Step>
          <Step n={4}>
            Send a broadcast or a template message. Figures appear within a few
            hours of the first send after enabling — there is nothing to see
            before that.
          </Step>
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h3 className="text-[13px] font-semibold">
          Option B — switch it on in Meta&apos;s own tools
        </h3>
        <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
          Useful if the WhatsApp Business account belongs to a client whose
          Business Manager you have access to but whose CRM login you do not.
        </p>
        <div className="mt-3.5 space-y-3">
          <Step n={1}>
            Open{' '}
            <a
              href="https://business.facebook.com/latest/whatsapp_manager"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
            >
              WhatsApp Manager
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            and pick the right business at the top left. Getting the wrong
            account here is the single most common reason this appears not to
            work.
          </Step>
          <Step n={2}>
            Go to{' '}
            <strong className="text-foreground font-medium">Insights</strong> in
            the left menu.
          </Step>
          <Step n={3}>
            Meta shows a prompt asking you to confirm analytics collection for
            the account. Accept it.
          </Step>
          <Step n={4}>
            Come back to{' '}
            <Link
              href="/settings/whatsapp-insights"
              className="text-primary font-medium hover:underline"
            >
              WhatsApp insights
            </Link>{' '}
            and press refresh. The CRM reads the setting live from Meta, so
            there is nothing to re-enter here.
          </Step>
        </div>
      </div>

      <Callout>
        Enabled it and still see nothing? That is expected until you send
        something new. Meta has no record of earlier sends, and read and click
        events for a message are only kept for 7 days after it goes out.
      </Callout>
    </div>
  );
}

// ============================================================
// Tab 2 — what each section needs
// ============================================================

function SectionsTab() {
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground max-w-[85ch] text-[13px] leading-relaxed">
        Each section of the insights page is a separate report from Meta with
        its own availability, which is why one can be missing while the rest are
        fine. A missing section is explained where it sits rather than replacing
        the whole page with an error.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionRow
          icon={CheckCheck}
          title="Messages and delivery"
          requirement="Nothing to enable"
          body="Sent, delivered and failed counts are reported for every account from the day it connects. If this is empty, no messages were sent in the period you picked."
        />
        <SectionRow
          icon={BarChart3}
          title="Conversations"
          requirement="Nothing to enable"
          body="Available by default, but genuinely empty on accounts Meta has moved to per-message pricing — there are no conversation windows to count. Use Message pricing instead on those accounts."
        />
        <SectionRow
          icon={Wallet}
          title="Message pricing"
          requirement="Not available on partner billing"
          body="Meta withholds cost entirely from accounts billed through a Solution Partner's credit line. Nothing can switch it on; the partner's invoice is the only source. Costs show as a dash rather than zero, because free and unknown are different things."
        />
        <SectionRow
          icon={Phone}
          title="Calls"
          requirement="Needs WhatsApp Business Calling"
          body="Only exists once calling is registered on your phone number in WhatsApp Manager. Until then Meta has no call data to report, which is normal for a messaging-only account."
        />
        <SectionRow
          icon={Sparkles}
          title="Template performance"
          requirement="Needs the insights opt-in"
          body="The one section that requires a deliberate, permanent switch. See the Template insights tab."
        />
        <SectionRow
          icon={Eye}
          title="Reads and clicks"
          requirement="Needs the insights opt-in"
          body="Reported only for template messages, never for ordinary replies you type in the inbox. A chat conversation will never show read counts here."
        />
      </div>

      <Callout>
        Cost figures come from Meta verbatim and are shown in your
        account&apos;s own currency. If a figure here disagrees with WhatsApp
        Manager, check that both are looking at the same date range — the CRM
        caps the range to what Meta will actually answer and labels itself with
        the range it used, not the one you asked for.
      </Callout>
    </div>
  );
}

// ============================================================
// Tab 3 — Meta's limits, so gaps stop looking like bugs
// ============================================================

function LimitsTab() {
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground max-w-[85ch] text-[13px] leading-relaxed">
        These are Meta&apos;s rules, not this CRM&apos;s. Each one produces a
        gap that looks like a broken integration the first time you meet it.
      </p>

      <div className="space-y-3">
        <LimitRow
          icon={Eye}
          title="Reads and clicks vanish after 7 days"
          body="Meta keeps engagement events for only a week after a message is sent. Ask for a 60-day window and you can legitimately see thousands delivered and zero read — the sends are remembered, the opens are not. Check engagement within the week, or rely on the figures this CRM has already stored."
        />
        <LimitRow
          icon={CalendarClock}
          title="Nothing older than 90 days"
          body="Template analytics stop at 90 days and asking for more silently returns less rather than erroring. The period selector shows the window that was actually used, so if you pick a range and the label comes back shorter, that is Meta trimming it."
        />
        <LimitRow
          icon={Clock}
          title="Daily buckets only"
          body="There is no hourly breakdown for templates. A campaign sent at 11pm and read at 1am spans two days in these numbers."
        />
        <LimitRow
          icon={CalendarClock}
          title="No backfill, ever"
          body="Every switch described in this guide starts collection from the moment it is flipped. There is no way to recover metrics for messages already sent."
        />
        <LimitRow
          icon={Info}
          title="Clicks only count on templates with buttons"
          body="Click figures show a dash for template categories where Meta does not report them, rather than a zero that would read as nobody clicking."
        />
      </div>

      <Callout>
        The CRM stores a daily snapshot of what Meta reports, so history stays
        readable after Meta itself has forgotten it. That is why a template can
        show all-time figures reaching further back than Meta&apos;s own 90-day
        limit — but only for the period since insights were enabled and the CRM
        started taking snapshots.
      </Callout>
    </div>
  );
}

// ============================================================
// Shared presentation
// ============================================================

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="bg-primary-soft text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
        {n}
      </span>
      <p className="text-muted-foreground min-w-0 flex-1 text-[12.5px] leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function SectionRow({
  icon: Icon,
  title,
  requirement,
  body,
}: {
  icon: typeof Wallet;
  title: string;
  requirement: string;
  body: string;
}) {
  return (
    <div className="border-border bg-card-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground flex items-center gap-2 text-[13px] font-semibold">
          <Icon className="text-primary h-4 w-4 shrink-0" />
          {title}
        </p>
      </div>
      <p className="text-muted-foreground/90 mt-1.5 text-[11px] font-medium tracking-wide uppercase">
        {requirement}
      </p>
      <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function LimitRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Clock;
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <p className="text-foreground flex items-center gap-2 text-[13px] font-semibold">
        <Icon className="text-primary h-4 w-4 shrink-0" />
        {title}
      </p>
      <p className="text-muted-foreground mt-1.5 max-w-[90ch] text-[12.5px] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-primary/30 bg-primary-soft flex items-start gap-3 rounded-lg border p-3.5">
      <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed">{children}</p>
    </div>
  );
}
