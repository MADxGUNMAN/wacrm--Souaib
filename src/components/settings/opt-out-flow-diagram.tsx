'use client';

// ============================================================
// What actually happens when a customer replies STOP.
//
// WHY A DIAGRAM AND NOT A FLOW YOU CAN EDIT
//
// Other products ship this as a draggable flow in their builder. That is a
// worse fit here for one reason: an editable opt-out path is an opt-out
// path that can be edited into not working. This is a compliance control —
// the thing that stops a customer who wants to leave from blocking the
// number instead — so it is built in, always on when capture is enabled,
// and not something a mis-drag can break.
//
// What the diagram gives instead is the honesty an editable flow would
// have provided for free: you can see every branch, and the keywords shown
// are the ones actually in the boxes above, live as they are edited. So it
// cannot drift from the configuration the way a screenshot in a help page
// would.
//
// NO AI IS INVOLVED, and the diagram says so. Worth stating plainly
// because this account has an AI auto-reply feature and an AI agent flow
// node, so "the bot decides" is a reasonable assumption to arrive with. It
// is exact whole-message matching, evaluated before any model runs.
// ============================================================

import {
  ArrowDown,
  Ban,
  BellOff,
  Bot,
  Check,
  Cpu,
  MessageSquare,
  Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';

function KeywordChips({
  keywords,
  tone,
}: {
  keywords: string[];
  tone: 'out' | 'in';
}) {
  if (keywords.length === 0) {
    return (
      <span className="text-muted-foreground text-[11px] italic">
        none configured
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keywords.map((k) => (
        <code
          key={k}
          className={cn(
            'rounded border px-1 py-0.5 font-mono text-[10px] font-semibold',
            tone === 'out'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          )}
        >
          {k}
        </code>
      ))}
    </span>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <ArrowDown className="text-muted-foreground/50 size-3.5" />
    </div>
  );
}

function Node({
  icon,
  title,
  children,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  tone?: 'neutral' | 'out' | 'in' | 'muted';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3',
        tone === 'out' && 'border-destructive/30 bg-destructive/5',
        tone === 'in' && 'border-emerald-500/30 bg-emerald-500/5',
        tone === 'muted' && 'border-border bg-muted/30',
        tone === 'neutral' && 'border-border bg-card'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md',
          tone === 'out' && 'bg-destructive/10 text-destructive',
          tone === 'in' &&
            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          (tone === 'neutral' || tone === 'muted') &&
            'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-foreground text-xs font-semibold">{title}</p>
        {children ? (
          <div className="text-muted-foreground mt-1 space-y-1 text-[11px] leading-relaxed">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OptOutFlowDiagram({
  isActive,
  optOutKeywords,
  optInKeywords,
  onOpenPreview,
}: {
  isActive: boolean;
  optOutKeywords: string[];
  optInKeywords: string[];
  /** Opens the same behaviour on the real Flows canvas. */
  onOpenPreview?: () => void;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-foreground text-sm font-semibold">
            How it works
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Built in and always running while keyword watching is on. Not an
            automation you have to create, and nothing here can be edited into
            not working.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onOpenPreview ? (
            <button
              type="button"
              onClick={onOpenPreview}
              className="text-muted-foreground hover:text-foreground border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
            >
              <Workflow className="size-3.5" />
              Preview as a flow
            </button>
          ) : null}
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              isActive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
              )}
              aria-hidden="true"
            />
            {isActive ? 'Running' : 'Paused'}
          </span>
        </div>
      </div>

      {!isActive ? (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          Keyword watching is off, so new replies are not checked. Contacts who
          already unsubscribed <strong>stay unsubscribed</strong> — this switch
          does not put anybody back on your list.
        </p>
      ) : null}

      {/* An ordered list, not a decorative graphic: this conveys real
          information a screen-reader user needs, unlike the WhatsApp message
          preview elsewhere which only duplicates labelled form fields. */}
      <ol className="mt-4 space-y-0">
        <li>
          <Node
            icon={<MessageSquare className="size-3.5" />}
            title="A customer replies, or taps a button"
          >
            <p>
              Any inbound message on your WhatsApp number. Button taps are
              matched on their hidden payload as well as their label, so an
              opt-out button keeps working even if it is renamed or translated.
            </p>
          </Node>
        </li>

        <Connector />

        <li>
          <Node
            icon={<Cpu className="size-3.5" />}
            title="The whole message is compared with your keywords"
            tone="muted"
          >
            <p>
              <strong>No AI is involved.</strong> It is an exact match on the
              entire message, ignoring case and surrounding punctuation — so{' '}
              <code className="font-mono">stop</code>,{' '}
              <code className="font-mono">STOP.</code> and{' '}
              <code className="font-mono">&ldquo;Stop&rdquo;</code> all count,
              while <em>&ldquo;please stop by tomorrow&rdquo;</em> does not.
            </p>
          </Node>
        </li>

        <Connector />

        {/* The two branches, side by side — they are alternatives, and
            stacking them would read as sequential steps. */}
        <li className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-0">
            <Node
              icon={<Ban className="size-3.5" />}
              title="Matches an opt-out word"
              tone="out"
            >
              <p>
                Currently: <KeywordChips keywords={optOutKeywords} tone="out" />
              </p>
            </Node>
            <Connector />
            <Node
              icon={<BellOff className="size-3.5" />}
              title="Unsubscribed, then confirmed"
              tone="out"
            >
              <p>Four things happen, in this order:</p>
              <ol className="ml-3 list-decimal space-y-0.5">
                <li>the number goes on your suppression list</li>
                <li>any running flow is paused and AI replies are muted</li>
                <li>
                  your confirmation is sent, with a <strong>Resubscribe</strong>{' '}
                  button
                </li>
                <li>marketing broadcasts skip them from then on</li>
              </ol>
            </Node>
          </div>

          <div className="space-y-0">
            <Node
              icon={<Check className="size-3.5" />}
              title="Matches an opt-in word"
              tone="in"
            >
              <p>
                Currently: <KeywordChips keywords={optInKeywords} tone="in" />
              </p>
              {optInKeywords.length === 0 ? (
                <p>
                  With none set, only your team — or the{' '}
                  <strong>Resubscribe</strong> button on the confirmation — can
                  put somebody back on.
                </p>
              ) : null}
            </Node>
            <Connector />
            <Node
              icon={<Check className="size-3.5" />}
              title="Back on your list"
              tone="in"
            >
              <p>
                The number comes off the suppression list and your opt-in
                confirmation is sent. Flows and AI are <strong>not</strong>{' '}
                paused — somebody opting back in wants to hear from you.
              </p>
            </Node>
          </div>
        </li>

        <Connector />

        <li>
          <Node
            icon={<Bot className="size-3.5" />}
            title="Anything else carries on as normal"
            tone="muted"
          >
            <p>
              A message matching neither list is untouched by this feature and
              continues to your flows, automations and AI auto-reply exactly as
              before.
            </p>
          </Node>
        </li>
      </ol>

      <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
        Unsubscribing blocks <strong>marketing templates only</strong>. Order
        updates, delivery notifications, one-time passcodes and replies your
        team types by hand all still reach the customer.
      </p>
    </div>
  );
}
