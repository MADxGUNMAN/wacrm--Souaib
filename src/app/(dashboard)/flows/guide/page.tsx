'use client';

/**
 * Flow guide — the "how do I actually build one of these" surface.
 *
 * Three tabs, three different jobs:
 *
 *  - **Nodes**: a reference for every step type, in plain English, with
 *    a worked example. Written for a business owner, not an engineer.
 *  - **Build with AI**: a prompt the user copies into ChatGPT / Gemini /
 *    Claude. The model then interviews them and returns a JSON file
 *    they import on the Flows page. This exists because describing a
 *    conversation in words is much easier than assembling it node by
 *    node, and the import path from task 1 already accepts the result.
 *  - **File format**: the JSON envelope, for anyone hand-editing or
 *    debugging a file that would not import.
 *
 * A separate route rather than a modal on the flows list: the node
 * reference is long, and people want to keep it open in a second tab
 * while they build. Deliberately linked from the editor with
 * `target="_blank"` for exactly that reason — navigating away from a
 * half-built flow would lose unsaved changes.
 *
 * Note the folder name: `guide` is a static segment, so `/flows/guide`
 * resolves here and never falls through to `/flows/[id]`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Braces,
  Download,
  Hourglass,
  Info,
  Sparkles,
  Upload,
  Variable,
  Zap,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  NODE_DOCS,
  NODE_DOC_ORDER,
  FLOW_LIMITATIONS,
} from '@/lib/flows/node-docs';
import {
  buildFlowAuthoringPrompt,
  EXAMPLE_FLOW_DOCUMENT,
} from '@/lib/flows/ai-prompt';
import { PORTABLE_FLOW_VERSION } from '@/lib/flows/portable';
import {
  NODE_META,
  NodeIconChip,
  groupNodeTypesByCategory,
  nodeColors,
  type NodeType,
} from '@/components/flows/shared';
import {
  CopyButton,
  JsonBlock,
  NodeDocPanel,
} from '@/components/flows/node-doc-panel';

type Tab = 'nodes' | 'ai' | 'format';

export default function FlowGuidePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('nodes');
  const [selected, setSelected] = useState<NodeType>('send_buttons');

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
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
              <BookOpen className="text-primary h-5 w-5" />
              Flow guide
            </h1>
            <p className="text-muted-foreground mt-1 max-w-[80ch] text-sm">
              What every step does, when to use it, and how to have an AI build
              a whole flow for you.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="nodes">
            <BookOpen className="mr-1.5 h-4 w-4" /> Nodes
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="mr-1.5 h-4 w-4" /> Build with AI
          </TabsTrigger>
          <TabsTrigger value="format">
            <Braces className="mr-1.5 h-4 w-4" /> File format
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="mt-5">
          <NodesTab selected={selected} onSelect={setSelected} />
        </TabsContent>

        <TabsContent value="ai" className="mt-5">
          <AiTab />
        </TabsContent>

        <TabsContent value="format" className="mt-5">
          <FormatTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Tab 1 — node reference
// ============================================================

function NodesTab({
  selected,
  onSelect,
}: {
  selected: NodeType;
  onSelect: (t: NodeType) => void;
}) {
  const groups = useMemo(
    () => groupNodeTypesByCategory([...NODE_DOC_ORDER] as NodeType[]),
    []
  );

  return (
    <div className="space-y-5">
      <Primer />

      <div className="grid gap-5 lg:grid-cols-[minmax(200px,260px)_1fr]">
        {/* ---- picker. Horizontal scroll strip on small screens, a
             sticky rail on desktop. ---- */}
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {groups.map((group) => (
              <div key={group.id} className="min-w-max lg:min-w-0">
                <p className="text-muted-foreground mb-1.5 px-1 text-[10px] font-semibold tracking-wider uppercase">
                  {group.label}
                </p>
                <div className="flex gap-1.5 lg:flex-col">
                  {group.types.map((type) => {
                    const isActive = type === selected;
                    const c = nodeColors(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onSelect(type)}
                        aria-current={isActive ? 'true' : undefined}
                        className={cn(
                          'flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors',
                          isActive
                            ? 'bg-card-2 text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground border-transparent'
                        )}
                        style={isActive ? { borderColor: c.ring } : undefined}
                      >
                        <NodeIconChip type={type} size={22} iconSize={12} />
                        {NODE_META[type].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-border bg-card rounded-xl border p-5">
          <NodeDocPanel type={selected} />
        </div>
      </div>
    </div>
  );
}

/**
 * The three ideas a first-time author has to hold before any individual
 * node makes sense: a flow only ever replies, most steps do not wait,
 * and answers are remembered as variables. Everything users get wrong
 * traces back to one of these.
 */
function Primer() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <PrimerCard
        icon={Zap}
        title="A flow replies, it never opens"
        body="Something the customer sends starts the flow — a keyword, or a tap on a button in a campaign you sent. A flow cannot message someone first; that is what Broadcasts are for."
      />
      <PrimerCard
        icon={Hourglass}
        title="Most steps do not wait"
        body="Only Send buttons, Send list, Collect input and AI Agent stop for a reply. Everything else fires instantly, so two messages in a row arrive together."
      />
      <PrimerCard
        icon={Variable}
        title="Answers become variables"
        body="Anything you capture can be repeated back later with {{vars.name}}. Set a variable on every question whose answer you want to reuse — otherwise the answer is gone."
      />
    </div>
  );
}

function PrimerCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Zap;
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-card-2 rounded-xl border p-4">
      <div className="text-primary bg-primary-soft mb-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-foreground text-[13px] font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

// ============================================================
// Tab 2 — build with AI
// ============================================================

function AiTab() {
  // Generated once per mount. It is a pure function of the node docs,
  // so there is nothing to re-run on render.
  const prompt = useMemo(() => buildFlowAuthoringPrompt(), []);

  function handleDownload() {
    const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'replai-flow-builder-prompt.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Bot className="text-primary h-4 w-4" />
          Let an AI build the flow
        </h2>
        <p className="text-muted-foreground mt-1 max-w-[85ch] text-[13px] leading-relaxed">
          The prompt below teaches any chat assistant everything about how flows
          work here — every step type, every field, every limit. Paste it in,
          describe the conversation you want, and it will hand back a file you
          can import. It is also told what this CRM cannot do, so it will say so
          plainly instead of inventing something that fails to import.
        </p>

        {/* The built-in agent does all of this without the copy-paste, so
            point at it first — but the prompt stays, because plenty of
            people have a ChatGPT subscription and no API key. */}
        <div className="border-primary/30 bg-primary-soft mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3.5">
          <Sparkles className="text-primary h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
            <strong className="font-medium">
              Already have an AI provider key set up?
            </strong>{' '}
            Skip the copy-paste — the built-in agent does this inside the app,
            already knows your templates, and checks the flow before it shows
            you anything.
          </p>
          <Link
            href="/flows/agent"
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Open the agent
          </Link>
        </div>

        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n={1}
            title="Copy the prompt"
            body="Use the Copy button below, or download it as a text file."
          />
          <Step
            n={2}
            title="Paste it into any AI"
            body="ChatGPT, Gemini, Claude, Copilot — it does not matter which."
          />
          <Step
            n={3}
            title="Describe your flow"
            body="Plain English. It will ask follow-up questions, then show you an outline to confirm."
          />
          <Step
            n={4}
            title="Import the JSON"
            body="Copy the JSON block it gives you, then Flows → Import. It arrives as a draft."
          />
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CopyButton
            text={prompt}
            label="Copy prompt"
            className="border-primary/40 bg-primary-soft text-primary px-3 py-1.5 text-[12.5px]"
          />
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Download .txt
          </Button>
          <Link
            href="/flows"
            className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Go to Flows to import
          </Link>
          <span className="text-muted-foreground ml-auto text-[11px]">
            {prompt.length.toLocaleString()} characters
          </span>
        </div>

        <textarea
          readOnly
          value={prompt}
          rows={16}
          spellCheck={false}
          aria-label="Flow builder prompt"
          onFocus={(e) => e.currentTarget.select()}
          className="border-border bg-muted text-muted-foreground focus:border-primary/50 mt-3 w-full resize-y rounded-lg border p-3 font-mono text-[11px] leading-relaxed outline-none"
        />
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Info className="text-muted-foreground h-4 w-4" />
          What a flow cannot do
        </h2>
        <p className="text-muted-foreground mt-1 max-w-[85ch] text-[13px]">
          Worth reading before you ask for something. The AI knows this list too
          and will tell you the same thing — this way you find out sooner.
        </p>
        <div className="mt-4 space-y-2.5">
          {FLOW_LIMITATIONS.map((l) => (
            <div
              key={l.cannot}
              className="border-border bg-card-2 rounded-lg border px-3.5 py-2.5"
            >
              <p className="text-foreground text-[12.5px] font-medium">
                {l.cannot}
              </p>
              <p className="text-muted-foreground mt-1 text-[12.5px] leading-relaxed">
                <span className="text-primary font-medium">Instead: </span>
                {l.instead}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="border-border bg-card-2 rounded-lg border p-3.5">
      <span className="bg-primary-soft text-primary mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold">
        {n}
      </span>
      <p className="text-foreground text-[12.5px] font-semibold">{title}</p>
      <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
        {body}
      </p>
    </li>
  );
}

// ============================================================
// Tab 3 — file format
// ============================================================

function FormatTab() {
  return (
    <div className="space-y-5">
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-base font-semibold tracking-tight">
          The flow file
        </h2>
        <p className="text-muted-foreground mt-1 max-w-[85ch] text-[13px] leading-relaxed">
          Export any flow and you get one of these. Import accepts the same
          shape, so a flow can move between accounts, be kept in version
          control, or be written from scratch by hand or by an AI. Imported
          flows always arrive as a <strong>draft</strong> — nothing goes live
          until you activate it.
        </p>

        <div className="mt-4 space-y-2.5">
          <FormatRow
            name="replai_flow_version"
            required
            what={`Must be ${PORTABLE_FLOW_VERSION}. A file from a newer version is refused rather than half-read.`}
          />
          <FormatRow
            name="flow.name"
            required
            what="Shown in the flows list. A name that already exists gets ' (imported)' appended rather than overwriting anything."
          />
          <FormatRow
            name="flow.description"
            what="Internal note. Customers never see it. May be null."
          />
          <FormatRow
            name="flow.trigger_type"
            required
            what="keyword, first_inbound_message, or manual."
          />
          <FormatRow
            name="flow.trigger_config"
            what='For keyword: { "keywords": [...], "match_type": "contains" | "exact", "case_sensitive": false }. Empty object for the other two.'
          />
          <FormatRow
            name="flow.entry_node_id"
            what="The node_key the flow starts at — a key, not an id. Must be one of the nodes in the file."
          />
          <FormatRow
            name="flow.fallback_policy"
            what="Leave as {} to accept the defaults: re-prompt twice, hand off after that, 24-hour timeout."
          />
          <FormatRow
            name="nodes[]"
            required
            what="Each entry is { node_key, node_type, config, position_x, position_y }. Connections live inside config — there is no separate edges list. Up to 200 nodes."
          />
        </div>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-base font-semibold tracking-tight">
          What blocks an import, and what only warns
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3.5">
            <p className="text-[12.5px] font-semibold text-red-400">
              Blocked — nothing is created
            </p>
            <ul className="text-muted-foreground mt-2 flex flex-col gap-1.5 text-[12.5px] leading-relaxed">
              {[
                'A node_type this CRM does not have.',
                'Two nodes sharing a node_key.',
                'A link pointing at a node_key that is not in the file, or an empty link.',
                'An entry_node_id that names a node not in the file.',
                'A missing flow name, or a trigger_type that is not one of the three.',
                'More than 200 nodes.',
              ].map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3.5">
            <p className="text-[12.5px] font-semibold text-amber-400">
              Imported anyway, with a note
            </p>
            <ul className="text-muted-foreground mt-2 flex flex-col gap-1.5 text-[12.5px] leading-relaxed">
              {[
                'No entry node set yet — pick one in the editor.',
                'A keyword trigger with no keywords.',
                'A node nothing can reach.',
                'A Send media node with no file uploaded.',
                'Anything over a WhatsApp character or option limit.',
                'A tag that did not exist here — it gets created for you.',
              ].map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-[12px] leading-relaxed">
          The split is deliberate: a broken link would strand a customer
          mid-conversation, so it has to be fixed before the flow exists. A
          missing keyword is something the editor can fix in ten seconds, and
          blocking on it would make it impossible to move a half-finished flow
          between accounts.
        </p>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-base font-semibold tracking-tight">
          A complete example
        </h2>
        <p className="text-muted-foreground mt-1 mb-3 max-w-[85ch] text-[13px]">
          A working bulk-enquiry flow: a template button starts it, a list
          captures quantity, two questions capture country and name, then it
          summarises and hands over. Copy it, import it, and edit from there.
        </p>
        <JsonBlock value={EXAMPLE_FLOW_DOCUMENT} maxHeight="560px" />
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-base font-semibold tracking-tight">
          Every node type at a glance
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-[10.5px] font-semibold tracking-wider uppercase">
                <th className="pr-3 pb-2 font-semibold">node_type</th>
                <th className="pr-3 pb-2 font-semibold">Step</th>
                <th className="pr-3 pb-2 font-semibold">Waits?</th>
                <th className="pb-2 font-semibold">Exits</th>
              </tr>
            </thead>
            <tbody>
              {NODE_DOC_ORDER.map((type) => {
                const doc = NODE_DOCS[type];
                return (
                  <tr key={type} className="border-border/60 border-b">
                    <td className="py-2 pr-3">
                      <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                        {type}
                      </code>
                    </td>
                    <td className="py-2 pr-3 text-[12.5px]">{doc.title}</td>
                    <td className="text-muted-foreground py-2 pr-3 text-[12.5px]">
                      {doc.waitsForCustomer ? 'Yes' : 'No'}
                    </td>
                    <td className="text-muted-foreground py-2 text-[12.5px]">
                      {doc.terminal
                        ? 'None — ends the flow'
                        : doc.branching.replace(/^One way out: /, '')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FormatRow({
  name,
  what,
  required = false,
}: {
  name: string;
  what: string;
  required?: boolean;
}) {
  return (
    <div className="border-border bg-card-2 flex flex-col gap-1 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
      <div className="flex shrink-0 items-center gap-2 sm:w-[190px]">
        <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
          {name}
        </code>
        {required && (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-red-400 uppercase">
            Req
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-[12.5px] leading-relaxed">
        {what}
      </p>
    </div>
  );
}
