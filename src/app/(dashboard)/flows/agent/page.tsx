'use client';

/**
 * Flow agent — describe a conversation, get a working flow.
 *
 * Runs on the account's OWN provider and key (the `ai_configs` row that
 * powers the inbox assistant), so there is no vendor to pick and no
 * second bill.
 *
 * Two things shape the UI:
 *
 *  - **The flow is shown, not just linked.** The agent's answer is only
 *    useful if the user can judge it before it becomes a draft, so a
 *    validated document renders as a step-by-step preview with the
 *    trigger, every node in order, and anything still to finish by hand.
 *  - **Failure is legible.** The agent is allowed to ask questions and to
 *    refuse, and a weak model can still fail after its repair rounds. All
 *    three read differently here: prose, prose, and an explicit list of
 *    what the validator rejected with a retry.
 *
 * Creating the flow posts to the existing `POST /api/flows/import`
 * rather than a bespoke endpoint. The document was already validated
 * server-side with the same `parsePortableFlow` import gates on, so
 * there is exactly one persistence path, already tested, and an
 * AI-authored flow lands as a reviewable draft for free.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  Loader2,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  NODE_META,
  NodeIconChip,
  type NodeType,
} from '@/components/flows/shared';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface PortableNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
}

interface PortableDoc {
  flow: {
    name: string;
    description: string | null;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    entry_node_id: string | null;
  };
  nodes: PortableNode[];
}

interface AgentResponse {
  reply: string;
  flow: PortableDoc | null;
  warnings: string[];
  issues: string[] | null;
  attempts: number;
  provider?: string;
  model?: string;
}

const STARTERS = [
  'Qualify bulk enquiries: ask how many units, which country, what kind of buyer they are, then hand over to sales with a summary.',
  'A support triage flow: ask whether it is an order problem, a product question, or something else, and route each one to a human with a note.',
  'Greet a first-time customer, ask what they are looking for, tag them by interest, then hand over.',
  'After someone taps the quick-reply button on my marketing template, collect their name and email and confirm we will be in touch.',
];

export default function FlowAgentPage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [creating, setCreating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    const next: Turn[] = [...turns, { role: 'user', content: message }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch('/api/flows/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json.code === 'ai_not_configured') {
          setNotConfigured(true);
          setTurns(turns);
          return;
        }
        toast.error(json.error ?? `The agent failed (${res.status}).`);
        // Keep the user's message in the transcript so they can retry
        // without retyping it.
        setTurns([
          ...next,
          {
            role: 'assistant',
            content: `I could not answer that: ${json.error ?? `error ${res.status}`}`,
          },
        ]);
        return;
      }

      const data = json as AgentResponse;
      setResult(data);
      setTurns([...next, { role: 'assistant', content: data.reply }]);
    } catch {
      toast.error('Could not reach the server.');
      setTurns(turns);
    } finally {
      setBusy(false);
    }
  }

  async function createFlow() {
    if (!result?.flow) return;
    setCreating(true);
    try {
      const res = await fetch('/api/flows/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: result.flow }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Should not happen — the agent validated with the same code the
        // import route gates on — so surface it loudly rather than
        // swallowing it.
        toast.error(
          Array.isArray(json.issues) && json.issues.length > 0
            ? json.issues[0]
            : (json.error ?? `Could not create the flow (${res.status}).`)
        );
        return;
      }
      toast.success(
        `Created "${json.flow?.name}" as a draft with ${json.node_count} step(s).`
      );
      router.push(`/flows/${json.flow.id}`);
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  }

  if (notConfigured) {
    return <NotConfigured onBack={() => router.push('/flows')} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push('/flows')}
            aria-label="Back to Flows"
            className="text-muted-foreground hover:bg-muted hover:text-foreground mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles className="text-primary h-5 w-5" />
              Build a flow with AI
            </h1>
            <p className="text-muted-foreground mt-1 max-w-[80ch] text-sm">
              Describe the conversation you want to automate. The agent knows
              every step type this CRM has and your approved templates, and runs
              on your own provider key.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result?.model && (
            <span className="border-border bg-card-2 text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11px]">
              {result.provider} · {result.model}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open('/flows/guide', '_blank')}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Guide
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden px-6 pb-6 lg:grid-cols-[1fr_380px]">
        {/* ─────────── conversation ─────────── */}
        <div className="border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-xl border">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {turns.length === 0 ? (
              <Starters onPick={send} disabled={busy} />
            ) : (
              <div className="flex flex-col gap-3">
                {turns.map((t, i) => (
                  <ChatTurn key={i} turn={t} />
                ))}
                {busy && (
                  <div className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Designing the flow, checking it, and fixing anything the
                    validator rejects…
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-border shrink-0 border-t p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={
                  turns.length === 0
                    ? 'e.g. Ask how many units they want, which country, then hand over to sales…'
                    : 'Ask for a change, or answer the question above…'
                }
                disabled={busy}
                className="border-border bg-muted text-foreground placeholder-muted-foreground focus:border-primary/50 max-h-40 min-h-[52px] w-full resize-y rounded-lg border p-2.5 text-[13px] outline-none disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
              />
              <Button
                onClick={() => void send(draft)}
                disabled={busy || !draft.trim()}
                size="icon"
                aria-label="Send to the agent"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-muted-foreground mt-1.5 text-[10.5px]">
              Enter to send, Shift+Enter for a new line. Uses your own provider
              key.
            </p>
          </div>
        </div>

        {/* ─────────── result ─────────── */}
        <aside className="min-h-0 overflow-y-auto">
          {result?.flow ? (
            <FlowPreview
              doc={result.flow}
              warnings={result.warnings}
              attempts={result.attempts}
              creating={creating}
              onCreate={createFlow}
            />
          ) : result?.issues && result.issues.length > 0 ? (
            <IssuesCard
              issues={result.issues}
              attempts={result.attempts}
              onRetry={() =>
                void send(
                  'That did not validate. Please try again and be strict about the rules — every link must name a step that exists, and every path must end at a handoff or an end step.'
                )
              }
              disabled={busy}
            />
          ) : (
            <EmptyResult />
          )}
        </aside>
      </div>
    </div>
  );
}

// ============================================================

function Starters({
  onPick,
  disabled,
}: {
  onPick: (t: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="text-primary bg-primary-soft mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
        <Bot className="h-5 w-5" />
      </div>
      <p className="text-center text-[13px] leading-relaxed">
        Tell the agent what conversation you want. It will ask anything it
        needs, then build the flow and check it before showing you.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="border-border bg-card-2 hover:border-primary/40 hover:bg-muted rounded-lg border px-3 py-2.5 text-left text-[12.5px] leading-relaxed transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatTurn({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-[13px] break-words whitespace-pre-wrap">
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <span className="text-primary bg-primary-soft mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
        {turn.content}
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="border-border text-muted-foreground rounded-xl border border-dashed p-5 text-center">
      <Workflow className="mx-auto mb-2 h-5 w-5 opacity-50" />
      <p className="text-[12.5px] leading-relaxed">
        The flow will appear here once the agent has built and checked one. You
        can review every step before it is created.
      </p>
    </div>
  );
}

function FlowPreview({
  doc,
  warnings,
  attempts,
  creating,
  onCreate,
}: {
  doc: PortableDoc;
  warnings: string[];
  attempts: number;
  creating: boolean;
  onCreate: () => void;
}) {
  const keywords = Array.isArray(doc.flow.trigger_config?.keywords)
    ? (doc.flow.trigger_config.keywords as unknown[]).filter(
        (k): k is string => typeof k === 'string'
      )
    : [];

  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-4">
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300">
          <Check className="h-3 w-3" />
          Checked and importable
        </p>
        <h2 className="mt-2 text-[15px] font-semibold tracking-tight">
          {doc.flow.name}
        </h2>
        {doc.flow.description && (
          <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
            {doc.flow.description}
          </p>
        )}
      </div>

      <div className="border-border bg-card-2 rounded-lg border px-3 py-2.5">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          Starts when
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed">
          {doc.flow.trigger_type === 'keyword' ? (
            keywords.length > 0 ? (
              <>
                a customer sends{' '}
                {keywords.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' or '}
                    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
                      {k}
                    </code>
                  </span>
                ))}
              </>
            ) : (
              'a keyword matches — but no keywords are set yet'
            )
          ) : doc.flow.trigger_type === 'first_inbound_message' ? (
            'a contact messages you for the very first time'
          ) : (
            'an agent runs it manually'
          )}
        </p>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wider uppercase">
          {doc.nodes.length} steps
        </p>
        <ol className="flex flex-col gap-1">
          {doc.nodes.map((n) => {
            const known = NODE_META[n.node_type as NodeType];
            return (
              <li
                key={n.node_key}
                className={cn(
                  'flex items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px]',
                  n.node_key === doc.flow.entry_node_id && 'bg-primary-soft'
                )}
              >
                {known ? (
                  <NodeIconChip
                    type={n.node_type as NodeType}
                    size={18}
                    iconSize={10}
                  />
                ) : (
                  <span className="h-[18px] w-[18px]" />
                )}
                <code className="min-w-0 flex-1 truncate font-mono">
                  {n.node_key}
                </code>
                <span className="text-muted-foreground shrink-0">
                  {known?.label ?? n.node_type}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Finish these by hand
          </p>
          <ul className="text-muted-foreground mt-1.5 flex flex-col gap-1 text-[11.5px] leading-relaxed">
            {warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-current" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button className="w-full" onClick={onCreate} disabled={creating}>
        {creating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Workflow className="h-4 w-4" />
        )}
        Create this flow as a draft
      </Button>
      <p className="text-muted-foreground text-center text-[10.5px] leading-relaxed">
        Nothing goes live until you activate it.
        {attempts > 1 &&
          ` The agent corrected itself ${attempts - 1} time${attempts === 2 ? '' : 's'} before this passed.`}
      </p>
    </div>
  );
}

function IssuesCard({
  issues,
  attempts,
  onRetry,
  disabled,
}: {
  issues: string[];
  attempts: number;
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-red-300">
        <AlertTriangle className="h-4 w-4" />
        The flow it produced would not import
      </p>
      <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">
        It tried {attempts} time{attempts === 1 ? '' : 's'}. These are the exact
        problems the validator found:
      </p>
      <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-[11.5px] leading-relaxed">
        {issues.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-current" />
            {s}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={onRetry}
        disabled={disabled}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Ask it to try again
      </Button>
      <p className="text-muted-foreground mt-2 text-[10.5px] leading-relaxed">
        A smaller model can struggle with a long flow. Asking for something
        simpler, or switching to a stronger model under Agents → Setup, usually
        fixes it.
      </p>
    </div>
  );
}

function NotConfigured({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="border-border bg-card max-w-md rounded-xl border p-6 text-center">
        <div className="text-primary bg-primary-soft mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
          <Settings2 className="h-5 w-5" />
        </div>
        <h1 className="text-base font-semibold tracking-tight">
          Add an AI provider first
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
          The flow agent runs on your own provider key — the same one the inbox
          assistant uses. Add a provider, model and key under Agents → Setup and
          come back.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back to Flows
          </Button>
          <Button size="sm" onClick={() => router.push('/agents')}>
            <Settings2 className="h-3.5 w-3.5" />
            Go to Setup
          </Button>
        </div>
        <p className="text-muted-foreground mt-4 text-[11.5px] leading-relaxed">
          No key yet? The Guide has a prompt you can paste into any chat
          assistant instead, and import the result.
        </p>
      </div>
    </div>
  );
}
