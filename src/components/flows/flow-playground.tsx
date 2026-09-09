'use client';

/**
 * Playground — run the flow you are looking at, end to end, without
 * sending a single WhatsApp message.
 *
 * It drives `@/lib/flows/simulate`, which is pure and synchronous, so
 * this runs entirely in the browser against the editor's LIVE state.
 * That is the point: you test the flow as currently edited, unsaved
 * changes included. Testing the saved copy would mean saving a
 * half-finished flow to find out whether it works.
 *
 * Three things shape the design:
 *
 *  - **Start at the trigger, not at the entry node.** The most common
 *    real failure is a keyword that never fires, so the simulation
 *    makes you send a first message and tells you whether it matched.
 *  - **Let the tester lie about the contact.** `condition` reads the
 *    contact's fields and tags, and `handoff` writes them back. Without
 *    a stand-in contact every condition evaluates against nothing and
 *    you only ever see one branch. The tag toggles are built from the
 *    ids the flow actually references, so there is no API call and no
 *    UUID to hunt down.
 *  - **Show the seams.** Notes and problems are rendered inline in the
 *    transcript rather than hidden in a console: an unmatched keyword,
 *    a question that captures nothing, a media step with no file, an
 *    AI step that cannot be predicted. A playground that only ever
 *    shows a happy path is worse than none, because it manufactures
 *    confidence.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  AlertTriangle,
  Bot,
  CornerDownLeft,
  FileText,
  Image as ImageIcon,
  Info,
  ListChecks,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Tag as TagIcon,
  UserRound,
  Video,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  EMPTY_SIM_CONTACT,
  startSimulation,
  stepSimulation,
  tagIdsReferencedBy,
  type SimContact,
  type SimEvent,
  type SimFlow,
  type SimNode,
  type SimState,
} from '@/lib/flows/simulate';
import type { KeywordTriggerConfig } from '@/lib/flows/types';
import { useFlowEditor } from './flow-editor-state';
import { NODE_META, NodeIconChip, type NodeType } from './shared';

export function FlowPlayground() {
  const { flow, state } = useFlowEditor();

  // The flow + nodes as the simulator wants them, straight from the
  // editor's live state.
  const simFlow: SimFlow = useMemo(
    () => ({
      name: state.name || 'Untitled flow',
      trigger_type: state.trigger_type,
      trigger_config: state.trigger_config as Record<string, unknown>,
      entry_node_id: state.entry_node_id,
      fallback_policy: flow.fallback_policy as unknown as Record<
        string,
        unknown
      >,
    }),
    [
      state.name,
      state.trigger_type,
      state.trigger_config,
      state.entry_node_id,
      flow.fallback_policy,
    ]
  );

  const simNodes: SimNode[] = useMemo(
    () =>
      state.nodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config,
      })),
    [state.nodes]
  );

  const flowTagIds = useMemo(() => tagIdsReferencedBy(simNodes), [simNodes]);

  // ---- setup the tester controls, applied on (re)start ----
  const [setupContact, setSetupContact] =
    useState<SimContact>(EMPTY_SIM_CONTACT);
  const [seedVars, setSeedVars] = useState<{ key: string; value: string }[]>(
    []
  );

  const [sim, setSim] = useState<SimState>(() =>
    startSimulation({ flow: simFlow, nodes: simNodes })
  );
  const [draft, setDraft] = useState('');
  const [aiDraft, setAiDraft] = useState('');

  function restart() {
    const seeds: Record<string, string> = {};
    for (const row of seedVars) {
      const k = row.key.trim();
      if (k) seeds[k] = row.value;
    }
    setSim(
      startSimulation({
        flow: simFlow,
        nodes: simNodes,
        contact: setupContact,
        seedVars: seeds,
      })
    );
    setDraft('');
    setAiDraft('');
  }

  function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSim((s) =>
      stepSimulation(s, { kind: 'text', text: trimmed }, simFlow, simNodes)
    );
    setDraft('');
  }

  function tap(reply_id: string, title: string) {
    setSim((s) =>
      stepSimulation(s, { kind: 'tap', reply_id, title }, simFlow, simNodes)
    );
  }

  const keywords = useMemo(() => {
    if (simFlow.trigger_type !== 'keyword') return [];
    const cfg = simFlow.trigger_config as unknown as KeywordTriggerConfig;
    return (cfg.keywords ?? []).filter(Boolean);
  }, [simFlow.trigger_type, simFlow.trigger_config]);

  return (
    <div className="absolute inset-0 grid grid-cols-1 overflow-hidden lg:grid-cols-[1fr_300px]">
      {/* ─────────────── conversation ─────────────── */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <StatusBar sim={sim} onRestart={restart} />
        <Transcript sim={sim} />
        <Composer
          sim={sim}
          draft={draft}
          setDraft={setDraft}
          aiDraft={aiDraft}
          setAiDraft={setAiDraft}
          keywords={keywords}
          onSendText={sendText}
          onTap={tap}
          onAi={(input) =>
            setSim((s) => stepSimulation(s, input, simFlow, simNodes))
          }
          onRestart={restart}
        />
      </div>

      {/* ─────────────── setup rail ─────────────── */}
      <aside className="border-border bg-card hidden min-h-0 flex-col overflow-y-auto border-l lg:flex">
        <SetupRail
          sim={sim}
          contact={setupContact}
          setContact={setSetupContact}
          seedVars={seedVars}
          setSeedVars={setSeedVars}
          flowTagIds={flowTagIds}
          onRestart={restart}
        />
      </aside>
    </div>
  );
}

// ============================================================
// Status
// ============================================================

function StatusBar({
  sim,
  onRestart,
}: {
  sim: SimState;
  onRestart: () => void;
}) {
  const label =
    sim.status === 'awaiting_trigger'
      ? 'Not started'
      : sim.status === 'ended'
        ? sim.endStatus === 'handed_off'
          ? 'Handed to a human'
          : sim.endStatus === 'failed'
            ? 'Stopped with a problem'
            : 'Finished'
        : sim.awaiting?.type === 'tap'
          ? 'Waiting for a tap'
          : sim.awaiting?.type === 'ai_turn'
            ? 'Waiting on the AI assistant'
            : 'Waiting for a typed reply';

  const tone =
    sim.status === 'ended'
      ? sim.endStatus === 'failed'
        ? 'border-red-500/30 bg-red-500/10 text-red-300'
        : sim.endStatus === 'handed_off'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : sim.status === 'awaiting_trigger'
        ? 'border-border bg-muted text-muted-foreground'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-300';

  return (
    <div className="border-border flex shrink-0 items-center gap-2.5 border-b px-4 py-2.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
          tone
        )}
      >
        {label}
      </span>
      {sim.currentNodeKey && sim.status !== 'ended' && (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px]">
          on
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10.5px]">
            {sim.currentNodeKey}
          </code>
        </span>
      )}
      {sim.endReason && (
        <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10.5px]">
          {sim.endReason}
        </code>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRestart}
        className="ml-auto"
        title="Start the conversation again from the trigger"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restart
      </Button>
    </div>
  );
}

// ============================================================
// Transcript
// ============================================================

function Transcript({ sim }: { sim: SimState }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows — a tester's attention is at
  // the bottom, where the next thing happens.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [sim.events.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {sim.events.length === 0 && (
        <div className="text-muted-foreground mx-auto max-w-md py-10 text-center">
          <Play className="mx-auto mb-3 h-6 w-6 opacity-50" />
          <p className="text-[13px] leading-relaxed">
            Send the first message below to see whether your trigger fires and
            walk the whole conversation, step by step. Nothing is sent to
            WhatsApp and nothing is saved.
          </p>
        </div>
      )}
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {sim.events.map((ev, i) => (
          <EventRow key={i} event={ev} />
        ))}
      </div>
      <div ref={endRef} />
    </div>
  );
}

function EventRow({ event }: { event: SimEvent }) {
  switch (event.kind) {
    case 'bot_text':
      return (
        <Bubble side="bot" nodeKey={event.nodeKey} ai={event.ai}>
          <p className="text-[13px] break-words whitespace-pre-wrap">
            {event.text || (
              <span className="text-muted-foreground italic">
                (empty message)
              </span>
            )}
          </p>
        </Bubble>
      );

    case 'bot_media': {
      const Icon =
        event.mediaType === 'video'
          ? Video
          : event.mediaType === 'document'
            ? FileText
            : ImageIcon;
      return (
        <Bubble side="bot" nodeKey={event.nodeKey}>
          <div className="border-border bg-muted/60 mb-1.5 flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2">
            <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground min-w-0 truncate text-[11.5px]">
              {event.filename ||
                event.url.split('/').pop() ||
                `${event.mediaType} (no file)`}
            </span>
          </div>
          {event.caption && (
            <p className="text-[13px] break-words whitespace-pre-wrap">
              {event.caption}
            </p>
          )}
        </Bubble>
      );
    }

    case 'bot_buttons':
      return (
        <Bubble side="bot" nodeKey={event.nodeKey}>
          {event.header && (
            <p className="mb-1 text-[12.5px] font-semibold">{event.header}</p>
          )}
          <p className="text-[13px] break-words whitespace-pre-wrap">
            {event.body}
          </p>
          {event.footer && (
            <p className="text-muted-foreground mt-1 text-[11px]">
              {event.footer}
            </p>
          )}
          <div className="mt-2 flex flex-col gap-1">
            {event.buttons.map((b) => (
              <span
                key={b.reply_id}
                className="border-border text-muted-foreground rounded-md border px-2 py-1 text-center text-[11.5px]"
              >
                {b.title}
              </span>
            ))}
          </div>
        </Bubble>
      );

    case 'bot_list':
      return (
        <Bubble side="bot" nodeKey={event.nodeKey}>
          {event.header && (
            <p className="mb-1 text-[12.5px] font-semibold">{event.header}</p>
          )}
          <p className="text-[13px] break-words whitespace-pre-wrap">
            {event.body}
          </p>
          {event.footer && (
            <p className="text-muted-foreground mt-1 text-[11px]">
              {event.footer}
            </p>
          )}
          <span className="border-border text-muted-foreground mt-2 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]">
            <ListChecks className="h-3 w-3" />
            {event.buttonLabel || '(no button label)'}
          </span>
        </Bubble>
      );

    case 'customer_text':
      return (
        <Bubble side="customer">
          <p className="text-[13px] break-words whitespace-pre-wrap">
            {event.text}
          </p>
        </Bubble>
      );

    case 'customer_tap':
      return (
        <Bubble side="customer">
          <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase opacity-70">
            <CornerDownLeft className="h-3 w-3" />
            Tapped
          </span>
          <p className="text-[13px] break-words">{event.title}</p>
        </Bubble>
      );

    case 'var_set':
      return (
        <Meta tone="good">
          Saved <code className="font-mono">{`{{vars.${event.key}}}`}</code> ={' '}
          <strong className="font-medium">{event.value}</strong>
        </Meta>
      );

    case 'tag':
      return (
        <Meta tone="plain" icon={TagIcon}>
          Would {event.mode === 'add' ? 'add' : 'remove'} tag{' '}
          <code className="font-mono">
            {event.tagId ? `${event.tagId.slice(0, 8)}…` : '(none chosen)'}
          </code>
        </Meta>
      );

    case 'handoff':
      return (
        <div className="my-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-400">
            <UserRound className="h-3.5 w-3.5" />
            Handed to a human
          </p>
          {event.note && (
            <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
              Agent sees: “{event.note}”
            </p>
          )}
          {Object.keys(event.contactUpdates).length > 0 && (
            <p className="text-muted-foreground mt-1.5 text-[12px]">
              Contact updated:{' '}
              {Object.entries(event.contactUpdates)
                .map(([k, v]) => `${k} = ${v}`)
                .join(', ')}
            </p>
          )}
        </div>
      );

    case 'fallback':
      return (
        <Meta tone="warn" icon={AlertTriangle}>
          Reply not recognised ({event.repromptCount}) →{' '}
          {event.action === 'reprompt'
            ? 'asking again'
            : event.action === 'ignore'
              ? 'ignoring, flow keeps waiting'
              : event.action === 'handoff'
                ? 'handing over'
                : 'ending the flow'}
        </Meta>
      );

    case 'ended':
      return (
        <div className="my-2 flex items-center gap-2">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {event.status === 'failed'
              ? 'Stopped'
              : event.status === 'handed_off'
                ? 'Handed off'
                : 'Finished'}
          </span>
          <span className="bg-border h-px flex-1" />
        </div>
      );

    case 'note':
      return (
        <Meta tone="plain" icon={Info}>
          {event.message}
        </Meta>
      );

    case 'problem':
      return (
        <div className="my-1 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
          <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-red-300">
            <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            {event.message}
          </p>
        </div>
      );

    case 'trace':
      // Node-entered noise stays in the step trace on the rail rather
      // than in the conversation; only the interesting traces (branch
      // taken, trigger fired) carry a detail worth reading inline.
      if (event.detail === 'entered') return null;
      return <Meta tone="plain">{event.detail}</Meta>;
  }
}

function Bubble({
  side,
  nodeKey,
  ai,
  children,
}: {
  side: 'bot' | 'customer';
  nodeKey?: string;
  ai?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex w-full',
        side === 'customer' ? 'justify-end' : 'justify-start'
      )}
    >
      <div className="max-w-[86%] sm:max-w-[70%]">
        {side === 'bot' && nodeKey && (
          <div className="mb-1 flex items-center gap-1.5">
            <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
              {nodeKey}
            </code>
            {ai && (
              <span className="text-primary inline-flex items-center gap-1 text-[10px] font-medium">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            'rounded-xl px-3 py-2',
            side === 'customer'
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'border-border bg-card rounded-bl-sm border'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Meta({
  children,
  tone,
  icon: Icon,
}: {
  children: React.ReactNode;
  tone: 'plain' | 'good' | 'warn';
  icon?: typeof Info;
}) {
  return (
    <p
      className={cn(
        'mx-auto flex max-w-[92%] items-start gap-1.5 text-center text-[11.5px] leading-relaxed',
        tone === 'good'
          ? 'text-emerald-400/90'
          : tone === 'warn'
            ? 'text-amber-400/90'
            : 'text-muted-foreground'
      )}
    >
      {Icon && <Icon className="mt-[2px] h-3 w-3 shrink-0" />}
      <span className="text-left">{children}</span>
    </p>
  );
}

// ============================================================
// Composer — changes shape with what the flow is waiting for
// ============================================================

function Composer({
  sim,
  draft,
  setDraft,
  aiDraft,
  setAiDraft,
  keywords,
  onSendText,
  onTap,
  onAi,
  onRestart,
}: {
  sim: SimState;
  draft: string;
  setDraft: (v: string) => void;
  aiDraft: string;
  setAiDraft: (v: string) => void;
  keywords: string[];
  onSendText: (text: string) => void;
  onTap: (reply_id: string, title: string) => void;
  onAi: (
    input: { kind: 'ai_handoff' } | { kind: 'ai_continue'; reply: string }
  ) => void;
  onRestart: () => void;
}) {
  if (sim.status === 'ended') {
    return (
      <div className="border-border flex shrink-0 items-center justify-center gap-3 border-t px-4 py-4">
        <p className="text-muted-foreground text-[12.5px]">
          The conversation is over.
        </p>
        <Button size="sm" variant="outline" onClick={onRestart}>
          <RotateCcw className="h-3.5 w-3.5" />
          Run it again
        </Button>
      </div>
    );
  }

  const awaiting = sim.awaiting;

  return (
    <div className="border-border shrink-0 space-y-2.5 border-t px-4 py-3">
      {awaiting?.type === 'trigger' && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11.5px]">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{awaiting.hint}</span>
          {keywords.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onSendText(k)}
              className="border-primary/40 bg-primary-soft text-primary rounded-md border px-2 py-0.5 text-[11px] font-medium"
            >
              Send “{k}”
            </button>
          ))}
        </div>
      )}

      {awaiting?.type === 'tap' && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Tap an option
          </p>
          <div className="flex flex-wrap gap-1.5">
            {awaiting.options.length === 0 && (
              <span className="text-[12px] text-red-400">
                This step offers no options, so the customer would be stuck
                here.
              </span>
            )}
            {awaiting.options.map((o) => (
              <button
                key={o.reply_id}
                type="button"
                onClick={() => onTap(o.reply_id, o.title)}
                className="border-border bg-card hover:border-primary/50 hover:bg-muted rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
              >
                {o.title || o.reply_id}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-[11px]">
            Or type something instead, to see what happens when a customer
            ignores the buttons.
          </p>
        </div>
      )}

      {awaiting?.type === 'ai_turn' && (
        <div className="space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-violet-300">
            <Bot className="h-3.5 w-3.5" />
            Stand in for the AI assistant
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={aiDraft}
              onChange={(e) => setAiDraft(e.target.value)}
              placeholder="What the assistant replies…"
              className="bg-muted h-8 flex-1 text-[12.5px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && aiDraft.trim()) {
                  onAi({ kind: 'ai_continue', reply: aiDraft.trim() });
                  setAiDraft('');
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!aiDraft.trim()}
              onClick={() => {
                onAi({ kind: 'ai_continue', reply: aiDraft.trim() });
                setAiDraft('');
              }}
            >
              It replies, keeps chatting
            </Button>
            <Button size="sm" onClick={() => onAi({ kind: 'ai_handoff' })}>
              It is done — move on
            </Button>
          </div>
        </div>
      )}

      {awaiting?.type !== 'ai_turn' && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              awaiting?.type === 'trigger'
                ? 'Type the first message a customer sends…'
                : 'Type the customer’s reply…'
            }
            className="bg-muted"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSendText(draft);
            }}
          />
          <Button
            size="icon"
            onClick={() => onSendText(draft)}
            disabled={!draft.trim()}
            aria-label="Send as the customer"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Setup rail
// ============================================================

function SetupRail({
  sim,
  contact,
  setContact,
  seedVars,
  setSeedVars,
  flowTagIds,
  onRestart,
}: {
  sim: SimState;
  contact: SimContact;
  setContact: (c: SimContact) => void;
  seedVars: { key: string; value: string }[];
  setSeedVars: (v: { key: string; value: string }[]) => void;
  flowTagIds: string[];
  onRestart: () => void;
}) {
  const liveVars = Object.entries(sim.vars);
  const started = sim.status !== 'awaiting_trigger';

  return (
    <div className="flex flex-col gap-4 p-4">
      <RailSection
        title="Variables so far"
        hint="What a summary or handoff note would interpolate right now."
      >
        {liveVars.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">
            Nothing captured yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {liveVars.map(([k, v]) => (
              <div
                key={k}
                className="border-border bg-card-2 flex items-baseline gap-2 rounded-md border px-2 py-1"
              >
                <code className="text-primary shrink-0 font-mono text-[10.5px]">
                  {k}
                </code>
                <span className="min-w-0 truncate text-[11.5px]">{v}</span>
              </div>
            ))}
          </div>
        )}
      </RailSection>

      <RailSection
        title="Pretend contact"
        hint="Read by If/else steps, and filled in by a Handoff."
      >
        <div className="flex flex-col gap-1.5">
          {(['name', 'email', 'phone', 'company'] as const).map((field) => (
            <Input
              key={field}
              value={contact[field]}
              onChange={(e) =>
                setContact({ ...contact, [field]: e.target.value })
              }
              placeholder={field}
              className="bg-muted h-7 text-[11.5px]"
            />
          ))}
        </div>
      </RailSection>

      {flowTagIds.length > 0 && (
        <RailSection
          title="Tags on the contact"
          hint="Only the tags this flow actually reads or writes."
        >
          <div className="flex flex-col gap-1">
            {flowTagIds.map((id) => {
              const on = contact.tagIds.includes(id);
              const liveOn = sim.contact.tagIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setContact({
                      ...contact,
                      tagIds: on
                        ? contact.tagIds.filter((t) => t !== id)
                        : [...contact.tagIds, id],
                    })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1 text-left text-[11.5px] transition-colors',
                    on
                      ? 'border-primary/40 bg-primary-soft text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  <TagIcon className="h-3 w-3 shrink-0" />
                  <code className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
                    {id.slice(0, 12)}…
                  </code>
                  {liveOn && !on && (
                    <span
                      className="text-emerald-400"
                      title="Added during this run"
                    >
                      +
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </RailSection>
      )}

      <RailSection
        title="Start with variables"
        hint="Skip ahead to test a branch without answering every question."
      >
        <div className="flex flex-col gap-1.5">
          {seedVars.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={row.key}
                onChange={(e) => {
                  const next = [...seedVars];
                  next[i] = { ...row, key: e.target.value };
                  setSeedVars(next);
                }}
                placeholder="name"
                className="bg-muted h-7 flex-1 font-mono text-[11px]"
              />
              <Input
                value={row.value}
                onChange={(e) => {
                  const next = [...seedVars];
                  next[i] = { ...row, value: e.target.value };
                  setSeedVars(next);
                }}
                placeholder="value"
                className="bg-muted h-7 flex-1 text-[11px]"
              />
              <button
                type="button"
                onClick={() => setSeedVars(seedVars.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground shrink-0 px-1 text-[13px]"
                aria-label="Remove variable"
              >
                ×
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setSeedVars([...seedVars, { key: '', value: '' }])}
          >
            + Add a variable
          </Button>
        </div>
      </RailSection>

      {started && (
        <p className="text-muted-foreground border-border rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-relaxed">
          Changes above apply the next time you restart.
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onRestart}>
        <RotateCcw className="h-3.5 w-3.5" />
        Restart with these settings
      </Button>

      <StepTrace sim={sim} />
    </div>
  );
}

function RailSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {hint && (
        <p className="text-muted-foreground/80 mt-0.5 mb-1.5 text-[10.5px] leading-relaxed">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * Every node the run passed through, in order.
 *
 * Separate from the conversation on purpose: the transcript answers
 * "what does the customer see", this answers "which steps ran" — and
 * a flow with four auto-advancing steps between two questions looks
 * like one message in the transcript.
 */
function StepTrace({ sim }: { sim: SimState }) {
  if (sim.visited.length === 0) return null;
  return (
    <RailSection title={`Steps taken (${sim.visited.length})`}>
      <ol className="flex flex-col gap-0.5">
        {sim.visited.map((key, i) => {
          const type = sim.events.find(
            (e) => e.kind === 'trace' && e.nodeKey === key && e.nodeType
          );
          const nodeType =
            type && type.kind === 'trace' ? type.nodeType : undefined;
          const isCurrent =
            i === sim.visited.length - 1 && sim.status !== 'ended';
          return (
            <li
              key={`${key}-${i}`}
              className={cn(
                'flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]',
                isCurrent
                  ? 'bg-primary-soft text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <span className="w-4 shrink-0 text-right font-mono text-[9.5px] opacity-60">
                {i + 1}
              </span>
              {nodeType && NODE_META[nodeType as NodeType] ? (
                <NodeIconChip
                  type={nodeType as NodeType}
                  size={16}
                  iconSize={9}
                />
              ) : (
                <span className="w-4" />
              )}
              <code className="min-w-0 flex-1 truncate font-mono">{key}</code>
            </li>
          );
        })}
      </ol>
    </RailSection>
  );
}
