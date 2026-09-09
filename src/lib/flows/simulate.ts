/**
 * Flow simulator — the engine that drives the playground.
 *
 * Pure and synchronous: no database, no network, no clock. State goes
 * in, new state comes out. That makes it safe to run in the browser
 * against the flow the user is *currently editing*, unsaved changes
 * included, which is the whole reason the playground is worth having.
 * Testing the saved copy would mean saving a half-finished flow to find
 * out whether it works.
 *
 * ── How this stays honest ────────────────────────────────────────────
 *
 * Every DECISION is delegated to the real engine's own helpers in
 * `./decide` and `./fallback`: which button matched, whether the
 * keyword fires, how a condition evaluates, what to do on an unmatched
 * reply. Only the PLUMBING is written twice — the walk from node to
 * node, and the "which config field holds the next key" lookup.
 *
 * That split matters. A simulator that re-implemented the decisions
 * would eventually disagree with production, and it would do so
 * silently: the playground says the flow works, the customer's actual
 * conversation dead-ends, and nothing points at the divergence because
 * it lives in two files that used to be identical. Plumbing drift, by
 * contrast, is loud — a mirrored `for` loop that stops advancing shows
 * up as a transcript that just stops.
 *
 * ── What it deliberately does NOT pretend to do ──────────────────────
 *
 * Three things cannot be honestly simulated, and each surfaces as an
 * explicit note in the transcript rather than a guess:
 *
 *   - `collect_input` with AI extraction. Production may run the reply
 *     through an LLM and store a cleaned value. Here the raw text is
 *     stored and the difference is flagged, because inventing what a
 *     model *would* have returned is worse than saying we don't know.
 *   - `ai_agent`. There is no deterministic answer to "what would the
 *     model say". The simulation stops and asks the tester to choose:
 *     the agent hands off, or it keeps chatting.
 *   - `send_media`. The bubble is shown; the file is never fetched, so
 *     a broken URL still looks fine here.
 *
 * Faking any of these would make the playground *feel* more complete
 * while making it less trustworthy, which is the opposite of the point.
 */

import {
  evaluateConditionPredicate,
  interpolateVars,
  matchReplyId,
  matchesKeywordTrigger,
  CONDITION_CONTACT_FIELDS,
  HANDOFF_CONTACT_FIELD_MAP,
  type ConditionContactField,
} from './decide';
import { decideFallback, resolveFallbackPolicy } from './fallback';
import type {
  AiAgentNodeConfig,
  CollectInputNodeConfig,
  ConditionNodeConfig,
  FlowNodeType,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMediaNodeConfig,
  SendMessageNodeConfig,
  SetTagNodeConfig,
  StartNodeConfig,
} from './types';

/**
 * Same defensive cap as the production advance loop
 * (`advanceFromNodeKey`). A flow may legally point backwards; nothing
 * validates against cycles, so both the engine and the simulator bail
 * rather than spin.
 */
export const SIM_STEP_CAP = 64;

// ------------------------------------------------------------
// Inputs
// ------------------------------------------------------------

/** The minimum a simulation needs to know about a flow. */
export interface SimFlow {
  name: string;
  trigger_type: 'keyword' | 'first_inbound_message' | 'manual';
  trigger_config: Record<string, unknown>;
  entry_node_id: string | null;
  fallback_policy?: Record<string, unknown> | null;
}

export interface SimNode {
  node_key: string;
  node_type: FlowNodeType | string;
  config: Record<string, unknown>;
}

/**
 * The pretend customer.
 *
 * Exists because three node types read the contact rather than the run:
 * `condition` on `contact_field`, `condition` on `tag`, and the
 * contact auto-fill inside `handoff`. Without a stand-in, every
 * condition in the flow would evaluate against nothing and the tester
 * would only ever see one branch.
 */
export interface SimContact {
  name: string;
  email: string;
  phone: string;
  company: string;
  /**
   * Tag ids the pretend contact already carries. Ids, not names,
   * because that is what `condition.subject_key` holds — the playground
   * UI offers exactly the ids the flow actually references.
   */
  tagIds: string[];
}

export const EMPTY_SIM_CONTACT: SimContact = {
  name: '',
  email: '',
  phone: '',
  company: '',
  tagIds: [],
};

// ------------------------------------------------------------
// Transcript
// ------------------------------------------------------------

/** A message the customer would see, or a note only the tester sees. */
export type SimEvent =
  | { kind: 'bot_text'; nodeKey: string; text: string; ai?: boolean }
  | {
      kind: 'bot_media';
      nodeKey: string;
      mediaType: string;
      url: string;
      caption?: string;
      filename?: string;
    }
  | {
      kind: 'bot_buttons';
      nodeKey: string;
      body: string;
      header?: string;
      footer?: string;
      buttons: { reply_id: string; title: string }[];
    }
  | {
      kind: 'bot_list';
      nodeKey: string;
      body: string;
      header?: string;
      footer?: string;
      buttonLabel: string;
      sections: {
        title?: string;
        rows: { reply_id: string; title: string; description?: string }[];
      }[];
    }
  | { kind: 'customer_text'; text: string }
  | { kind: 'customer_tap'; replyId: string; title: string }
  /** Structural progress — node entered, branch taken, run ended. */
  | {
      kind: 'trace';
      nodeKey: string | null;
      nodeType?: string;
      detail: string;
    }
  | { kind: 'var_set'; nodeKey: string; key: string; value: string }
  | { kind: 'tag'; nodeKey: string; mode: 'add' | 'remove'; tagId: string }
  | {
      kind: 'handoff';
      nodeKey: string;
      note: string | null;
      contactUpdates: Record<string, string>;
    }
  | {
      kind: 'fallback';
      nodeKey: string | null;
      action: 'reprompt' | 'handoff' | 'end' | 'ignore';
      repromptCount: number;
    }
  | {
      kind: 'ended';
      status: 'completed' | 'handed_off' | 'failed';
      reason: string;
    }
  /** Something the simulation cannot faithfully reproduce. */
  | { kind: 'note'; nodeKey: string | null; message: string }
  /** Something that will break in production too. */
  | { kind: 'problem'; nodeKey: string | null; message: string };

/** What the simulation is waiting for, if anything. */
export type SimAwaiting =
  | null
  /** The flow has not started; the first message must fire the trigger. */
  | { type: 'trigger'; hint: string }
  /** A typed reply (collect_input). */
  | { type: 'text'; nodeKey: string }
  /** A tap (send_buttons / send_list). */
  | {
      type: 'tap';
      nodeKey: string;
      options: { reply_id: string; title: string }[];
    }
  /** An AI agent turn the tester has to stand in for. */
  | { type: 'ai_turn'; nodeKey: string };

export interface SimState {
  status: 'awaiting_trigger' | 'awaiting_reply' | 'ended';
  currentNodeKey: string | null;
  vars: Record<string, string>;
  contact: SimContact;
  repromptCount: number;
  events: SimEvent[];
  awaiting: SimAwaiting;
  endStatus?: 'completed' | 'handed_off' | 'failed';
  endReason?: string;
  /** Node keys entered, in order. Drives the canvas highlight. */
  visited: string[];
}

/** Everything the tester can send into a running simulation. */
export type SimInput =
  | { kind: 'text'; text: string }
  | { kind: 'tap'; reply_id: string; title: string }
  /** Stand in for the AI agent deciding it is done. */
  | { kind: 'ai_handoff' }
  /** Stand in for the AI agent replying and staying on the node. */
  | { kind: 'ai_continue'; reply: string };

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function nodeMap(nodes: SimNode[]): Map<string, SimNode> {
  const m = new Map<string, SimNode>();
  for (const n of nodes) m.set(n.node_key, n);
  return m;
}

/** Options a suspending node offers, for the tap affordance. */
export function optionsForNode(
  node: SimNode
): { reply_id: string; title: string }[] {
  if (node.node_type === 'send_buttons') {
    const cfg = node.config as unknown as SendButtonsNodeConfig;
    return (cfg.buttons ?? []).map((b) => ({
      reply_id: b.reply_id,
      title: b.title,
    }));
  }
  if (node.node_type === 'send_list') {
    const cfg = node.config as unknown as SendListNodeConfig;
    return (cfg.sections ?? []).flatMap((s) =>
      (s.rows ?? []).map((r) => ({ reply_id: r.reply_id, title: r.title }))
    );
  }
  return [];
}

/**
 * Every distinct tag id the flow reads or writes.
 *
 * The playground uses this to build its "pretend the contact has these
 * tags" toggles. Enumerating from the flow rather than from the
 * account's tag list is deliberate: those are the only ids that can
 * change the outcome, and it keeps the simulator free of any API call.
 */
export function tagIdsReferencedBy(nodes: SimNode[]): string[] {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.node_type === 'set_tag') {
      const cfg = n.config as unknown as SetTagNodeConfig;
      if (cfg.tag_id) ids.add(cfg.tag_id);
    }
    if (n.node_type === 'condition') {
      const cfg = n.config as unknown as ConditionNodeConfig;
      if (cfg.subject === 'tag' && cfg.subject_key) ids.add(cfg.subject_key);
    }
  }
  return [...ids];
}

/** A human description of what has to happen for the flow to start. */
export function triggerHint(flow: SimFlow): string {
  if (flow.trigger_type === 'keyword') {
    const cfg = flow.trigger_config as unknown as KeywordTriggerConfig;
    const words = (cfg.keywords ?? []).filter(Boolean);
    if (words.length === 0) {
      return 'This flow has a keyword trigger but no keywords, so nothing can start it. Add one in the Trigger panel.';
    }
    const how = cfg.match_type === 'exact' ? 'exactly' : 'containing';
    return `Send a message ${how} ${words.map((w) => `"${w}"`).join(' or ')} to start the flow.${
      cfg.case_sensitive ? ' Case matters.' : ''
    }`;
  }
  if (flow.trigger_type === 'first_inbound_message') {
    return 'This flow starts on a contact\u2019s very first message, so anything you send here starts it.';
  }
  return 'This flow is triggered manually by an agent, so anything you send here stands in for that.';
}

function endedState(
  state: SimState,
  status: 'completed' | 'handed_off' | 'failed',
  reason: string,
  extra: SimEvent[] = []
): SimState {
  return {
    ...state,
    status: 'ended',
    awaiting: null,
    endStatus: status,
    endReason: reason,
    events: [...state.events, ...extra, { kind: 'ended', status, reason }],
  };
}

/**
 * Resolve a condition's subject from simulated state.
 *
 * The shape mirrors `evaluateConditionNode` in the engine exactly —
 * same three subject kinds, same "absent means undefined, not empty
 * string" convention, same rejection of unknown contact fields — with
 * the DB reads swapped for the pretend contact. The comparison itself
 * is the engine's own `evaluateConditionPredicate`.
 */
function resolveConditionSubject(
  cfg: ConditionNodeConfig,
  state: SimState
): { value: string | undefined } | { error: string } {
  if (cfg.subject === 'var') {
    const v = state.vars[cfg.subject_key];
    return { value: v === undefined || v === '' ? undefined : v };
  }
  if (cfg.subject === 'tag') {
    return {
      value: state.contact.tagIds.includes(cfg.subject_key)
        ? cfg.subject_key
        : undefined,
    };
  }
  if (
    !CONDITION_CONTACT_FIELDS.includes(cfg.subject_key as ConditionContactField)
  ) {
    return { error: `unsupported contact_field: ${cfg.subject_key}` };
  }
  const raw = state.contact[cfg.subject_key as ConditionContactField];
  return { value: raw && raw.length > 0 ? raw : undefined };
}

// ------------------------------------------------------------
// The advance loop — mirrors `advanceFromNodeKey`
// ------------------------------------------------------------

function advance(
  state: SimState,
  startNodeKey: string,
  nodes: Map<string, SimNode>
): SimState {
  let s: SimState = state;
  let currentKey: string | null = startNodeKey;

  for (let safety = 0; safety < SIM_STEP_CAP; safety += 1) {
    if (!currentKey) {
      return endedState(s, 'failed', 'missing_next_node', [
        {
          kind: 'problem',
          nodeKey: null,
          message:
            'A step had no onward link, so the run stopped here. In production this fails the run and the customer is left waiting.',
        },
      ]);
    }
    // Annotated for the same reason the engine's loop annotates it:
    // without it TS infers `any` through the reassigned `currentKey`.
    const node: SimNode | null = nodes.get(currentKey) ?? null;
    if (!node) {
      return endedState(s, 'failed', 'node_not_found', [
        {
          kind: 'problem',
          nodeKey: currentKey,
          message: `Nothing points at an existing step called "${currentKey}". Production fails the run at this point.`,
        },
      ]);
    }

    s = {
      ...s,
      currentNodeKey: node.node_key,
      visited: [...s.visited, node.node_key],
      events: [
        ...s.events,
        {
          kind: 'trace',
          nodeKey: node.node_key,
          nodeType: node.node_type,
          detail: 'entered',
        },
      ],
    };

    switch (node.node_type) {
      case 'start': {
        currentKey = (node.config as unknown as StartNodeConfig).next_node_key;
        continue;
      }

      case 'send_message': {
        const cfg = node.config as unknown as SendMessageNodeConfig;
        s = {
          ...s,
          events: [
            ...s.events,
            {
              kind: 'bot_text',
              nodeKey: node.node_key,
              text: interpolateVars(cfg.text, s.vars),
            },
          ],
        };
        currentKey = cfg.next_node_key;
        continue;
      }

      case 'send_media': {
        const cfg = node.config as unknown as SendMediaNodeConfig;
        const events: SimEvent[] = [
          {
            kind: 'bot_media',
            nodeKey: node.node_key,
            mediaType: cfg.media_type,
            url: cfg.media_url ?? '',
            caption: cfg.caption
              ? interpolateVars(cfg.caption, s.vars)
              : undefined,
            filename: cfg.filename,
          },
        ];
        if (!cfg.media_url?.trim()) {
          events.push({
            kind: 'problem',
            nodeKey: node.node_key,
            message:
              'No file is attached to this step. The flow cannot be activated until one is uploaded.',
          });
        } else {
          events.push({
            kind: 'note',
            nodeKey: node.node_key,
            message:
              'The file is not fetched here, so a broken link would still look fine in the playground.',
          });
        }
        s = { ...s, events: [...s.events, ...events] };
        currentKey = cfg.next_node_key;
        continue;
      }

      case 'condition': {
        const cfg = node.config as unknown as ConditionNodeConfig;
        const resolved = resolveConditionSubject(cfg, s);
        if ('error' in resolved) {
          return endedState(s, 'failed', 'condition_evaluation_failed', [
            {
              kind: 'problem',
              nodeKey: node.node_key,
              message: `${resolved.error}. Production fails the run here.`,
            },
          ]);
        }
        const branch = evaluateConditionPredicate({
          operator: cfg.operator,
          subjectValue: resolved.value,
          configValue: cfg.value,
        })
          ? 'true'
          : 'false';
        currentKey = branch === 'true' ? cfg.true_next : cfg.false_next;
        s = {
          ...s,
          events: [
            ...s.events,
            {
              kind: 'trace',
              nodeKey: node.node_key,
              nodeType: 'condition',
              detail: `${describeConditionSubject(cfg)} \u2192 ${branch}, going to "${currentKey || '(nothing)'}"`,
            },
          ],
        };
        continue;
      }

      case 'set_tag': {
        const cfg = node.config as unknown as SetTagNodeConfig;
        const mode = cfg.mode === 'remove' ? 'remove' : 'add';
        // Applied to the pretend contact so a later condition-on-tag
        // sees it, exactly as the real contact_tags write would.
        const tagIds =
          mode === 'add'
            ? [...new Set([...s.contact.tagIds, cfg.tag_id])]
            : s.contact.tagIds.filter((t) => t !== cfg.tag_id);
        const events: SimEvent[] = [
          {
            kind: 'tag',
            nodeKey: node.node_key,
            mode,
            tagId: cfg.tag_id ?? '',
          },
        ];
        if (!cfg.tag_id) {
          events.push({
            kind: 'problem',
            nodeKey: node.node_key,
            message:
              'No tag is selected on this step, so it would tag nobody. Production treats a failed tag write as non-fatal, so the flow would appear to work.',
          });
        }
        s = {
          ...s,
          contact: { ...s.contact, tagIds },
          events: [...s.events, ...events],
        };
        currentKey = cfg.next_node_key;
        continue;
      }

      case 'send_buttons': {
        const cfg = node.config as unknown as SendButtonsNodeConfig;
        return suspend(
          {
            ...s,
            events: [
              ...s.events,
              {
                kind: 'bot_buttons',
                nodeKey: node.node_key,
                body: interpolateVars(cfg.text, s.vars),
                header: cfg.header_text
                  ? interpolateVars(cfg.header_text, s.vars)
                  : undefined,
                footer: cfg.footer_text
                  ? interpolateVars(cfg.footer_text, s.vars)
                  : undefined,
                buttons: (cfg.buttons ?? []).map((b) => ({
                  reply_id: b.reply_id,
                  title: b.title,
                })),
              },
            ],
          },
          node
        );
      }

      case 'send_list': {
        const cfg = node.config as unknown as SendListNodeConfig;
        return suspend(
          {
            ...s,
            events: [
              ...s.events,
              {
                kind: 'bot_list',
                nodeKey: node.node_key,
                body: interpolateVars(cfg.text, s.vars),
                header: cfg.header_text
                  ? interpolateVars(cfg.header_text, s.vars)
                  : undefined,
                footer: cfg.footer_text
                  ? interpolateVars(cfg.footer_text, s.vars)
                  : undefined,
                buttonLabel: cfg.button_label ?? '',
                sections: (cfg.sections ?? []).map((sec) => ({
                  title: sec.title,
                  rows: (sec.rows ?? []).map((r) => ({
                    reply_id: r.reply_id,
                    title: r.title,
                    description: r.description,
                  })),
                })),
              },
            ],
          },
          node
        );
      }

      case 'collect_input': {
        const cfg = node.config as unknown as CollectInputNodeConfig;
        return suspend(
          {
            ...s,
            events: [
              ...s.events,
              {
                kind: 'bot_text',
                nodeKey: node.node_key,
                text: interpolateVars(cfg.prompt_text, s.vars),
              },
            ],
          },
          node
        );
      }

      case 'ai_agent': {
        const cfg = node.config as unknown as AiAgentNodeConfig;
        const events: SimEvent[] = [];
        if (cfg.prompt_text?.trim()) {
          events.push({
            kind: 'bot_text',
            nodeKey: node.node_key,
            text: interpolateVars(cfg.prompt_text, s.vars),
            ai: true,
          });
        }
        events.push({
          kind: 'note',
          nodeKey: node.node_key,
          message:
            'An AI assistant takes over here. There is no way to predict what it would say, so choose what happens next yourself: it hands off, or it keeps chatting.',
        });
        return suspend({ ...s, events: [...s.events, ...events] }, node);
      }

      case 'handoff': {
        const cfg = node.config as { note?: string; assign_to?: string };
        const contactUpdates: Record<string, string> = {};
        for (const [varKey, col] of Object.entries(HANDOFF_CONTACT_FIELD_MAP)) {
          const val = s.vars[varKey];
          if (typeof val === 'string' && val.trim()) {
            contactUpdates[col] = val.trim();
          }
        }
        return endedState(s, 'handed_off', 'handoff_node', [
          {
            kind: 'handoff',
            nodeKey: node.node_key,
            note: cfg.note ? interpolateVars(cfg.note, s.vars) : null,
            contactUpdates,
          },
        ]);
      }

      case 'end':
        return endedState(s, 'completed', 'end_node');

      default:
        return endedState(s, 'failed', 'unknown_node_type', [
          {
            kind: 'problem',
            nodeKey: node.node_key,
            message: `"${node.node_type}" is not a step type this CRM understands.`,
          },
        ]);
    }
  }

  return endedState(s, 'failed', 'advance_loop_overflow', [
    {
      kind: 'problem',
      nodeKey: currentKey,
      message: `The flow took more than ${SIM_STEP_CAP} steps without finishing or waiting for a reply — usually a loop that never exits. Production stops the run at the same point.`,
    },
  ]);
}

/** Park the run on a node that waits for the customer. */
function suspend(state: SimState, node: SimNode): SimState {
  const awaiting: SimAwaiting =
    node.node_type === 'send_buttons' || node.node_type === 'send_list'
      ? { type: 'tap', nodeKey: node.node_key, options: optionsForNode(node) }
      : node.node_type === 'ai_agent'
        ? { type: 'ai_turn', nodeKey: node.node_key }
        : { type: 'text', nodeKey: node.node_key };
  return {
    ...state,
    status: 'awaiting_reply',
    currentNodeKey: node.node_key,
    awaiting,
  };
}

function describeConditionSubject(cfg: ConditionNodeConfig): string {
  const subject =
    cfg.subject === 'tag'
      ? `tag ${cfg.subject_key.slice(0, 8)}`
      : cfg.subject === 'contact_field'
        ? `contact.${cfg.subject_key}`
        : `vars.${cfg.subject_key}`;
  const value =
    cfg.operator === 'equals' || cfg.operator === 'contains'
      ? ` "${cfg.value ?? ''}"`
      : '';
  return `${subject} ${cfg.operator}${value}`;
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * A fresh simulation, parked before the trigger.
 *
 * Nothing runs yet even for `first_inbound_message` and `manual`
 * triggers: seeing the trigger fire is half of what a tester came to
 * check, and starting automatically would hide the most common real
 * failure — a keyword that never matches.
 */
export function startSimulation(input: {
  flow: SimFlow;
  nodes: SimNode[];
  contact?: SimContact;
  /** Pre-set variables, for jumping straight at a branch. */
  seedVars?: Record<string, string>;
}): SimState {
  const events: SimEvent[] = [];

  if (!input.flow.entry_node_id) {
    events.push({
      kind: 'problem',
      nodeKey: null,
      message:
        'This flow has no entry step, so it cannot run. Pick one before activating.',
    });
  } else if (
    !input.nodes.some((n) => n.node_key === input.flow.entry_node_id)
  ) {
    events.push({
      kind: 'problem',
      nodeKey: null,
      message: `The entry step "${input.flow.entry_node_id}" does not exist in this flow.`,
    });
  }

  const seeded = input.seedVars ?? {};
  if (Object.keys(seeded).length > 0) {
    events.push({
      kind: 'note',
      nodeKey: null,
      message: `Starting with ${Object.keys(seeded)
        .map((k) => `{{vars.${k}}}`)
        .join(
          ', '
        )} already set. A real conversation would have to capture these first.`,
    });
  }

  return {
    status: 'awaiting_trigger',
    currentNodeKey: null,
    vars: { ...seeded },
    contact: input.contact ?? EMPTY_SIM_CONTACT,
    repromptCount: 0,
    events,
    awaiting: { type: 'trigger', hint: triggerHint(input.flow) },
    visited: [],
  };
}

/**
 * Feed one customer action into the simulation.
 *
 * Mirrors `handleReplyForActiveRun`: match the reply against the node
 * the run is parked on, capture into vars where the node asks for it,
 * and fall through to the fallback policy when nothing matches.
 */
export function stepSimulation(
  state: SimState,
  input: SimInput,
  flow: SimFlow,
  nodes: SimNode[]
): SimState {
  if (state.status === 'ended') return state;
  const map = nodeMap(nodes);

  // ── Trigger ───────────────────────────────────────────────────────
  if (state.status === 'awaiting_trigger') {
    if (input.kind !== 'text') return state;
    const text = input.text;
    let s: SimState = {
      ...state,
      events: [...state.events, { kind: 'customer_text', text }],
    };

    if (flow.trigger_type === 'keyword') {
      const cfg = flow.trigger_config as unknown as KeywordTriggerConfig;
      if (!matchesKeywordTrigger(text, cfg)) {
        return {
          ...s,
          events: [
            ...s.events,
            {
              kind: 'note',
              nodeKey: null,
              message: `No keyword matched, so the flow would not start. ${triggerHint(flow)}`,
            },
          ],
        };
      }
      s = {
        ...s,
        events: [
          ...s.events,
          {
            kind: 'trace',
            nodeKey: null,
            detail: `keyword matched \u2014 starting "${flow.name}"`,
          },
        ],
      };
    } else {
      s = {
        ...s,
        events: [
          ...s.events,
          {
            kind: 'trace',
            nodeKey: null,
            detail: `${flow.trigger_type === 'manual' ? 'started manually' : 'first message'} \u2014 starting "${flow.name}"`,
          },
        ],
      };
    }

    if (!flow.entry_node_id || !map.has(flow.entry_node_id)) {
      return endedState(s, 'failed', 'node_not_found', [
        {
          kind: 'problem',
          nodeKey: null,
          message:
            'There is no valid entry step, so the flow stops immediately.',
        },
      ]);
    }
    return advance(s, flow.entry_node_id, map);
  }

  // ── Reply to a suspended node ─────────────────────────────────────
  const currentNode = state.currentNodeKey
    ? (map.get(state.currentNodeKey) ?? null)
    : null;
  if (!currentNode) {
    return endedState(state, 'failed', 'current_node_not_found', [
      {
        kind: 'problem',
        nodeKey: state.currentNodeKey,
        message: 'The step the run was waiting on no longer exists.',
      },
    ]);
  }

  let s: SimState = {
    ...state,
    events: [
      ...state.events,
      input.kind === 'tap'
        ? { kind: 'customer_tap', replyId: input.reply_id, title: input.title }
        : input.kind === 'text'
          ? { kind: 'customer_text', text: input.text }
          : input.kind === 'ai_continue'
            ? { kind: 'customer_text', text: input.reply }
            : {
                kind: 'trace',
                nodeKey: currentNode.node_key,
                detail: 'AI assistant handed off',
              },
    ],
  };

  let matched: string | null = null;

  if (
    input.kind === 'tap' &&
    (currentNode.node_type === 'send_buttons' ||
      currentNode.node_type === 'send_list')
  ) {
    matched = matchReplyId(currentNode, input.reply_id);
    if (matched) {
      const cfg = currentNode.config as { var_key?: string };
      const varKey = cfg.var_key?.trim();
      if (varKey) {
        // Production stores the tapped option's TITLE, not its id.
        const chosen = input.title?.trim() || input.reply_id;
        s = {
          ...s,
          vars: { ...s.vars, [varKey]: chosen },
          events: [
            ...s.events,
            {
              kind: 'var_set',
              nodeKey: currentNode.node_key,
              key: varKey,
              value: chosen,
            },
          ],
        };
      } else {
        s = {
          ...s,
          events: [
            ...s.events,
            {
              kind: 'note',
              nodeKey: currentNode.node_key,
              message:
                'This question has no variable set, so the answer is used to pick the branch and then forgotten. Add one if a later step needs to repeat it back.',
            },
          ],
        };
      }
    }
  } else if (
    input.kind === 'text' &&
    currentNode.node_type === 'collect_input'
  ) {
    const cfg = currentNode.config as unknown as CollectInputNodeConfig;
    const raw = input.text.trim();
    if (raw.length > 0 && cfg.var_key) {
      const events: SimEvent[] = [
        {
          kind: 'var_set',
          nodeKey: currentNode.node_key,
          key: cfg.var_key,
          value: raw,
        },
      ];
      // Production may pass the reply through AI first. Guessing what a
      // model would return would make the transcript look authoritative
      // when it isn't, so say so instead.
      if (cfg.extraction_prompt?.trim()) {
        events.push({
          kind: 'note',
          nodeKey: currentNode.node_key,
          message: `Stored as typed. In production AI would clean it up first ("${cfg.extraction_prompt.trim()}"), so the saved value may differ.`,
        });
      } else if (cfg.var_key === 'email') {
        events.push({
          kind: 'note',
          nodeKey: currentNode.node_key,
          message:
            'Production pulls just the email address out of this reply before saving it.',
        });
      }
      s = {
        ...s,
        vars: { ...s.vars, [cfg.var_key]: raw },
        repromptCount: 0,
        events: [...s.events, ...events],
      };
      matched = cfg.next_node_key;
    }
  } else if (currentNode.node_type === 'ai_agent') {
    const cfg = currentNode.config as unknown as AiAgentNodeConfig;
    if (input.kind === 'ai_handoff') {
      matched = cfg.next_node_key;
    } else {
      // The agent replied and stays put — production returns without
      // moving current_node_key.
      return {
        ...s,
        repromptCount: 0,
        events: [
          ...s.events,
          {
            kind: 'trace',
            nodeKey: currentNode.node_key,
            detail: 'AI assistant replied and is still handling the chat',
          },
        ],
      };
    }
  }

  if (matched) {
    return advance({ ...s, repromptCount: 0 }, matched, map);
  }

  // ── No match → fallback policy ────────────────────────────────────
  const policy = resolveFallbackPolicy(flow.fallback_policy);
  const newReprompts = s.repromptCount + 1;
  const action = decideFallback({ policy, reprompt_count: newReprompts });

  s = {
    ...s,
    repromptCount: newReprompts,
    events: [
      ...s.events,
      {
        kind: 'fallback',
        nodeKey: currentNode.node_key,
        action: action.type,
        repromptCount: newReprompts,
      },
      {
        kind: 'note',
        nodeKey: currentNode.node_key,
        message: mismatchExplanation(currentNode, input),
      },
    ],
  };

  if (action.type === 'ignore') {
    return {
      ...s,
      events: [
        ...s.events,
        {
          kind: 'note',
          nodeKey: currentNode.node_key,
          message:
            'The flow ignores replies it does not recognise, so the message is handed to your automations instead and the flow keeps waiting.',
        },
      ],
    };
  }

  if (action.type === 'reprompt') {
    // Re-send the same prompt, node unchanged. Re-running advance from
    // this node would re-enter it, which is exactly what production
    // does on a reprompt.
    return advance(s, currentNode.node_key, map);
  }

  if (action.type === 'handoff') {
    return endedState(s, 'handed_off', 'fallback_exhausted', [
      {
        kind: 'handoff',
        nodeKey: currentNode.node_key,
        note: 'Too many unrecognised replies \u2014 handed to a human.',
        contactUpdates: {},
      },
    ]);
  }

  return endedState(s, 'completed', 'fallback_exhausted_end');
}

/** Why the reply did not move the flow on. */
function mismatchExplanation(node: SimNode, input: SimInput): string {
  if (node.node_type === 'send_buttons' || node.node_type === 'send_list') {
    if (input.kind === 'text') {
      return 'This step waits for a tap, not typed text. A customer who types instead of tapping lands here.';
    }
    return `"${input.kind === 'tap' ? input.reply_id : ''}" is not one of this step\u2019s options.`;
  }
  if (node.node_type === 'collect_input') {
    return 'Nothing usable was captured \u2014 an empty reply, or the step has no variable to store it under.';
  }
  return `A reply arrived while the flow was on a "${node.node_type}" step, which does not accept one.`;
}
