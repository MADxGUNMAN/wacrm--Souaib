'use client';

/**
 * Renders the full reference for ONE node type.
 *
 * Mounted in two places on purpose:
 *   - the node reference page (`/flows/guide`), full width;
 *   - inside the builder's node inspector, collapsed behind a
 *     "What does this do?" toggle.
 *
 * Sharing the component means the help a user reads while configuring a
 * node is literally the same text as the reference — and both come from
 * `NODE_DOCS`, which also generates the AI prompt. Three surfaces, one
 * set of words.
 *
 * `compact` trims the panel for the inspector: no example JSON block
 * (the form beside it already shows the real values) and tighter type.
 */

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownRight,
  ExternalLink,
  Flag,
  Hourglass,
  Info,
  Zap,
} from 'lucide-react';

import { NODE_DOCS } from '@/lib/flows/node-docs';
import type { FlowNodeType } from '@/lib/flows/types';
import { cn } from '@/lib/utils';
import { NODE_META, NodeIconChip, nodeColors, type NodeType } from './shared';

export function NodeDocPanel({
  type,
  compact = false,
  className,
}: {
  type: NodeType;
  compact?: boolean;
  className?: string;
}) {
  const doc = NODE_DOCS[type as FlowNodeType];
  const meta = NODE_META[type];
  const c = nodeColors(type);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {!compact && (
        <div className="flex items-start gap-3">
          <NodeIconChip type={type} size={40} iconSize={20} />
          <div className="min-w-0">
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              {meta.label}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[13px]">
              {doc.oneLiner}
            </p>
            <code
              className="bg-muted mt-2 inline-block rounded px-1.5 py-0.5 font-mono text-[11px]"
              style={{ color: c.text }}
            >
              {type}
            </code>
          </div>
        </div>
      )}

      {/* ---- behaviour chips: the properties that change how you
           reason about the whole flow, not just this node ---- */}
      <div className="flex flex-wrap gap-1.5">
        <BehaviourChip
          icon={doc.waitsForCustomer ? Hourglass : Zap}
          tone={doc.waitsForCustomer ? 'wait' : 'instant'}
          label={
            doc.waitsForCustomer
              ? 'Waits for the customer'
              : 'Continues immediately'
          }
        />
        {doc.terminal && (
          <BehaviourChip icon={Flag} tone="terminal" label="Ends the flow" />
        )}
        <BehaviourChip
          icon={CornerDownRight}
          tone="neutral"
          label={doc.branching}
        />
      </div>

      <Section title="What it does">
        <p className="text-[13px] leading-relaxed">{doc.whatItDoes}</p>
      </Section>

      {doc.whenToUse.length > 0 && (
        <Section title="Use it when">
          <Bullets items={doc.whenToUse} />
        </Section>
      )}

      {doc.fields.length > 0 && (
        <Section title="Settings">
          <div className="border-border overflow-hidden rounded-lg border">
            {doc.fields.map((f, i) => (
              <div
                key={f.name}
                className={cn(
                  'flex flex-col gap-1 px-3 py-2.5',
                  i > 0 && 'border-border border-t'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
                    {f.name}
                  </code>
                  <span className="text-muted-foreground text-[10.5px]">
                    {f.type}
                  </span>
                  {f.required ? (
                    <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-red-400 uppercase">
                      Required
                    </span>
                  ) : (
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase">
                      Optional
                    </span>
                  )}
                  {f.isEdge && (
                    <span className="text-primary bg-primary-soft rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase">
                      Link
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                  {f.what}
                </p>
                {f.example && (
                  <p className="text-muted-foreground/80 font-mono text-[11px]">
                    e.g. {f.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {doc.limits.length > 0 && (
        <Section title="Limits">
          <Bullets items={doc.limits} />
        </Section>
      )}

      {doc.gotchas.length > 0 && (
        <Section title="Watch out for">
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <Bullets items={doc.gotchas} />
          </div>
        </Section>
      )}

      {!compact && (
        <Section title="Example">
          <p className="text-muted-foreground mb-2 text-[12.5px]">
            {doc.example.caption}
          </p>
          <JsonBlock value={doc.example.node} />
        </Section>
      )}
    </div>
  );
}

/**
 * Collapsed help for the node currently being configured.
 *
 * Sits at the top of the inspector in both the list view and the canvas
 * side sheet. Collapsed by default: someone editing their fifth
 * send_buttons node does not need the manual again, and an
 * always-expanded explanation would push the actual form below the fold
 * in the canvas sheet.
 *
 * Reuses `NodeDocPanel` rather than paraphrasing it, so the short help
 * beside the form and the full reference on /flows/guide can never
 * disagree — which is the usual fate of tooltip copy.
 */
export function NodeHelpDisclosure({ type }: { type: NodeType }) {
  const [open, setOpen] = useState(false);
  const doc = NODE_DOCS[type as FlowNodeType];
  const meta = NODE_META[type];

  return (
    <div className="border-border bg-card-2 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
      >
        <Info className="text-muted-foreground mt-[2px] h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block text-[12px] font-medium">
            How &ldquo;{meta.label}&rdquo; works
          </span>
          {!open && (
            <span className="text-muted-foreground mt-0.5 block text-[11.5px] leading-relaxed">
              {doc.oneLiner}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="text-muted-foreground mt-[2px] h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="text-muted-foreground mt-[2px] h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-border border-t px-3 py-3">
          <NodeDocPanel type={type} compact />
          <a
            href="/flows/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium hover:underline"
          >
            Full reference and examples
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function BehaviourChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  tone: 'wait' | 'instant' | 'terminal' | 'neutral';
}) {
  const tones = {
    wait: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    instant: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    terminal: 'border-border bg-muted text-muted-foreground',
    neutral: 'border-border bg-card-2 text-muted-foreground',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-tight',
        tones
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-1.5 text-[10.5px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
          <span className="text-muted-foreground mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
          <span className="text-muted-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A JSON snippet with a copy button.
 *
 * Copy matters more than it looks: the point of the example is that a
 * user can lift it into a file they are hand-editing, and re-typing
 * nested JSON from a screenshot-shaped block is how a stray comma gets
 * introduced.
 */
export function JsonBlock({
  value,
  maxHeight = 'none',
}: {
  value: unknown;
  maxHeight?: string;
}) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <CopyButton
        text={text}
        className="absolute top-2 right-2"
        label="Copy JSON"
      />
      <pre
        className="border-border bg-muted text-foreground overflow-auto rounded-lg border p-3 pr-24 font-mono text-[11.5px] leading-relaxed"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}

export function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked (insecure origin, or the user denied it).
      // The text is on screen and selectable, so a silent no-op beats a
      // scary toast about a permission the user cannot see.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={cn(
        'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        className
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}
