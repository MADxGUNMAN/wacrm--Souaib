/**
 * Opt-in / opt-out guide — the owner-facing explanation.
 *
 * Written for the person who owns the WhatsApp number and pays for the
 * messages, not for an engineer. It answers, in order, the questions they
 * actually arrive with: why should I care, what do I have to do, what stops
 * reaching people, and how do I check.
 *
 * A separate route rather than more copy inside the settings panel: the
 * panel is a form, and someone reading a policy explanation wants to keep
 * it open while they edit templates in another tab. `/settings/...` is
 * prefix-matched by the proxy's `protectedPaths`, so this inherits auth and
 * subscription gating with no extra wiring.
 *
 * Deliberately a server component — there is nothing interactive here, and
 * the whole point is that this page cannot drift out of step with
 * behaviour, so it states rules rather than reading live configuration.
 */

import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  BellOff,
  Check,
  Cpu,
  ListChecks,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import {
  DEFAULT_OPT_IN_KEYWORDS,
  DEFAULT_OPT_OUT_KEYWORDS,
  SUGGESTED_OPT_OUT_BUTTON_LABEL,
} from '@/lib/whatsapp/opt-out-keywords';

export const metadata = {
  title: 'Opt-in / opt-out guide',
};

const STOP = DEFAULT_OPT_OUT_KEYWORDS[0];
const START = DEFAULT_OPT_IN_KEYWORDS[0];

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
          <div className="text-muted-foreground mt-2 space-y-3 text-sm leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OptOutGuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        {/* A plain Link, not a Button — this repo's Button has no `asChild`,
            and nesting an anchor inside one would produce a button wrapping
            a link. */}
        <Link
          href="/settings?tab=opt-out"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to opt-in / opt-out settings
        </Link>
        <h1 className="text-foreground text-2xl font-semibold">
          Letting customers opt out
        </h1>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          A practical guide to how unsubscribing works on your account, what you
          need to put in your templates, and what it does and does not block.
        </p>
      </div>

      <Section
        icon={<ShieldCheck className="size-4" />}
        title="Why this matters commercially"
      >
        <p>
          A customer who wants your marketing to stop has two options: tell you,
          or block your number. If you make the first one easy, you keep a
          contactable customer who still receives their order updates. If you do
          not, they take the second.
        </p>
        <p>
          Blocks and &ldquo;report&rdquo; taps feed the quality rating Meta
          assigns your number. A falling rating reduces how many conversations
          you may start each day, and a poor one can stop you starting new
          conversations altogether. Recovering a restricted number is slow and
          largely out of your hands.
        </p>
        <p className="text-foreground">
          So an unsubscribe link is not a courtesy. It is the cheapest
          protection available for the asset your whole WhatsApp channel depends
          on.
        </p>
      </Section>

      <Section
        icon={<ListChecks className="size-4" />}
        title="The two ways a customer can opt out"
      >
        <p>
          Both are handled automatically. You do not need to build an automation
          or a flow for either, and you do not need to do anything when one
          fires.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-border bg-muted/30 rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">
              1. A &ldquo;{SUGGESTED_OPT_OUT_BUTTON_LABEL}&rdquo; button
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              A quick-reply button on the template itself. One tap, nothing to
              type, and no chance of a typo. This is the more reliable of the
              two and the one to prefer.
            </p>
          </div>
          <div className="border-border bg-muted/30 rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">
              2. Replying &ldquo;{STOP}&rdquo;
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              A line in your message body or footer telling people they can
              reply {STOP}. Works on every template, including ones already
              approved, and needs no button slot.
            </p>
          </div>
        </div>

        <p>
          Use both where you can. The button is what most people will tap; the
          written instruction is what someone reads when they are scrolling back
          through an old message.
        </p>
      </Section>

      <Section
        icon={<Cpu className="size-4" />}
        title="How a reply is recognised"
      >
        <p>
          The customer&rsquo;s message is compared with your opt-out keywords as
          a <strong className="text-foreground">whole message</strong>, ignoring
          capitals and surrounding punctuation. There is{' '}
          <strong className="text-foreground">no AI involved</strong> in this
          decision.
        </p>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <tbody className="divide-border divide-y">
              <tr>
                <td className="p-2.5 font-mono">stop</td>
                <td className="p-2.5 text-emerald-600 dark:text-emerald-400">
                  Unsubscribes
                </td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">&ldquo;STOP.&rdquo;</td>
                <td className="p-2.5 text-emerald-600 dark:text-emerald-400">
                  Unsubscribes
                </td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">please stop by tomorrow</td>
                <td className="text-muted-foreground p-2.5">
                  Does nothing — treated as an ordinary message
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          That last row is deliberate. Matching a keyword anywhere inside a
          sentence would unsubscribe customers who never asked to leave, which
          is a worse failure than missing an unusual phrasing.
        </p>
      </Section>

      <Section
        icon={<Check className="size-4" />}
        title="Setting up a marketing template"
      >
        <ol className="ml-4 list-decimal space-y-2">
          <li>
            Open <strong className="text-foreground">Templates</strong> and
            create or edit a template with the{' '}
            <strong className="text-foreground">Marketing</strong> category.
          </li>
          <li>
            In the editor, find the{' '}
            <strong className="text-foreground">Let people opt out</strong>{' '}
            panel. It shows which of the two routes your template currently
            offers.
          </li>
          <li>
            Use{' '}
            <strong className="text-foreground">
              Add &ldquo;{SUGGESTED_OPT_OUT_BUTTON_LABEL}&rdquo; button
            </strong>
            . It is placed where WhatsApp requires quick replies to sit, so it
            will not cause a rejection.
          </li>
          <li>
            Add a line such as{' '}
            <em>&ldquo;Reply {STOP} to unsubscribe&rdquo;</em> to the footer.
          </li>
          <li>Submit for approval as normal.</li>
        </ol>
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mr-1.5 inline size-3.5 align-text-bottom" />
          Label the button exactly &ldquo;
          {SUGGESTED_OPT_OUT_BUTTON_LABEL}&rdquo; unless you have also added
          your wording to the keyword list in settings. A button labelled
          &ldquo;Unsubscribe&rdquo; looks right to a customer but is not
          recognised on its own — the editor warns you when this happens.
        </p>
      </Section>

      <Section
        icon={<Ban className="size-4" />}
        title="What unsubscribing actually blocks"
      >
        <p>
          Only <strong className="text-foreground">marketing</strong> templates.
          This is the single most important thing to understand, because it is
          what makes the feature safe to switch on.
        </p>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="p-2.5 font-medium">Message type</th>
                <th className="p-2.5 font-medium">
                  Still reaches an unsubscribed customer?
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {[
                ['Marketing template (promotions, offers)', false],
                ['Utility template (order and delivery updates)', true],
                ['Authentication template (one-time passcodes)', true],
                ['A reply typed by your team', true],
                ['Flow and automation messages', true],
              ].map(([label, allowed]) => (
                <tr key={label as string}>
                  <td className="p-2.5">{label as string}</td>
                  <td className="p-2.5">
                    {allowed ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Yes
                      </span>
                    ) : (
                      <span className="text-destructive font-medium">
                        No — blocked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Nobody loses a message they actually need. Somebody who unsubscribes
          from your promotions still gets told their parcel is arriving.
        </p>
      </Section>

      <Section
        icon={<BellOff className="size-4" />}
        title="What you will see afterwards"
      >
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong className="text-foreground">In the inbox</strong>, the
            contact panel shows <em>Unsubscribed</em> with the date, and how it
            happened.
          </li>
          <li>
            <strong className="text-foreground">
              When building a broadcast
            </strong>
            , the recipient count already excludes them, with a note saying how
            many are being skipped. If everyone in an audience has unsubscribed,
            you are told before you send rather than after.
          </li>
          <li>
            <strong className="text-foreground">On a sent broadcast</strong>,
            skipped recipients are counted as neither sent nor failed — a
            respected opt-out is not a delivery failure, and your success rate
            should not be punished for it.
          </li>
          <li>
            <strong className="text-foreground">In settings</strong>, the
            unsubscribed list is searchable, with a total and a last-30-days
            figure. A rising figure is the earliest warning that a campaign is
            annoying people.
          </li>
        </ul>
      </Section>

      <Section
        icon={<Check className="size-4" />}
        title="Getting somebody back"
      >
        <p>
          The confirmation sent after an opt-out carries a{' '}
          <strong className="text-foreground">Resubscribe</strong> button, so
          returning takes one tap and works even if you have no opt-in keyword
          configured. A customer can also reply &ldquo;{START}&rdquo; if you
          keep that keyword.
        </p>
        <p>
          Your team can re-subscribe a contact from the inbox when somebody asks
          in conversation. Every change is recorded with who did it and when, so
          a re-subscribe is always accountable.
        </p>
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mr-1.5 inline size-3.5 align-text-bottom" />
          Only re-subscribe somebody who has asked to come back. Putting a
          customer back on your marketing list because a campaign underperformed
          is what produces the blocks and reports this whole feature exists to
          prevent.
        </p>
      </Section>

      <Section
        icon={<TriangleAlert className="size-4" />}
        title="Two things that surprise people"
      >
        <p>
          <strong className="text-foreground">
            Turning keyword watching off does not put anybody back on your list.
          </strong>{' '}
          That switch only stops watching for new replies. Customers who already
          unsubscribed stay unsubscribed, because withdrawn consent is not
          restored by changing a setting.
        </p>
        <p>
          <strong className="text-foreground">
            Meta sometimes reports an opt-out you never saw.
          </strong>{' '}
          A customer can opt out of marketing at the WhatsApp level, outside
          your chat. The first you learn of it is a rejected send, which is then
          recorded as <em>Reported by Meta</em> in your list. Nothing is wrong
          with your setup when this appears.
        </p>
      </Section>
    </div>
  );
}
