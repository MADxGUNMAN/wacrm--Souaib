// ============================================================
// Portable flow JSON — the import/export format.
//
// One job: move a flow between accounts, environments and machines as a
// plain file, the way n8n moves a workflow. Everything here is pure; the
// routes do the I/O.
//
// ─── WHAT MAKES A FLOW PORTABLE ──────────────────────────────
//
// The graph itself already is. Edges reference `node_key` strings rather
// than row UUIDs (a deliberate choice in migration 010), so the node
// topology survives a round trip untouched.
//
// What is NOT portable is every UUID that points at a row in the SOURCE
// account. Three of them exist inside node configs, and each is handled
// differently because each fails differently:
//
//   set_tag.tag_id      A dangling tag id does not error — the engine
//                       logs `set_tag_failed` and advances. So the flow
//                       looks fine and silently stops tagging, which is
//                       the worst failure mode available. Exported
//                       ALONGSIDE the tag's name so import can re-resolve
//                       it, or create the tag.
//
//   handoff.assign_to   An agent user_id. Meaningless in another account,
//                       and assigning a conversation to a stranger is
//                       worse than not assigning it. Stripped on export.
//
//   send_media.media_url  A public bucket URL. Genuinely portable, so it
//                       is kept as-is — the receiving account fetches the
//                       same public object. Worth knowing it still points
//                       at the exporter's storage.
//
// ─── WHY IMPORT ALWAYS PRODUCES A DRAFT ──────────────────────
//
// An imported file is untrusted input describing outbound customer
// messaging. Activating it on arrival would let a pasted file start
// messaging real contacts before anyone had read it. The importer's job
// ends at "this is now editable in your account".
// ============================================================

import { validateFlowForActivation, type ValidationIssue } from './validate';

/**
 * Bumped only for a BREAKING shape change. Additive fields do not need a
 * bump — importers ignore what they do not recognise, which is what lets
 * a file written by a newer build still load in an older one.
 */
export const PORTABLE_FLOW_VERSION = 1;

/** Node types the DB CHECK constraint accepts. */
const KNOWN_NODE_TYPES = new Set([
  'start',
  'send_message',
  'send_buttons',
  'send_list',
  'send_media',
  'collect_input',
  'condition',
  'set_tag',
  'handoff',
  'ai_agent',
  'end',
]);

const TRIGGER_TYPES = new Set(['keyword', 'first_inbound_message', 'manual']);

export interface PortableFlowNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
}

export interface PortableFlow {
  replai_flow_version: number;
  /** Informational. Never trusted or used on import. */
  exported_at?: string;
  exported_from?: { app?: string; flow_id?: string };
  flow: {
    name: string;
    description: string | null;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    entry_node_id: string | null;
    fallback_policy: Record<string, unknown>;
  };
  nodes: PortableFlowNode[];
}

// ------------------------------------------------------------
// Export
// ------------------------------------------------------------

export interface ExportSourceFlow {
  id?: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  entry_node_id: string | null;
  fallback_policy: Record<string, unknown> | null;
}

export interface ExportSourceNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown> | null;
  position_x?: number | null;
  position_y?: number | null;
}

/**
 * Build the portable document.
 *
 * @param tagNames  tag_id -> tag name, resolved by the caller (which has
 *                  the DB). Passing it in keeps this function pure and
 *                  testable rather than reaching for a client.
 */
export function toPortableFlow(
  flow: ExportSourceFlow,
  nodes: ExportSourceNode[],
  tagNames: Map<string, { name: string; color?: string | null }> = new Map()
): PortableFlow {
  return {
    replai_flow_version: PORTABLE_FLOW_VERSION,
    exported_at: new Date().toISOString(),
    exported_from: { app: 'replai', flow_id: flow.id },
    flow: {
      name: flow.name,
      description: flow.description ?? null,
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config ?? {},
      entry_node_id: flow.entry_node_id ?? null,
      fallback_policy: flow.fallback_policy ?? {},
    },
    // Row ids, flow_id, created_at and account/user columns are all
    // dropped by only naming the four fields that describe the node.
    nodes: nodes.map((n) => ({
      node_key: n.node_key,
      node_type: n.node_type,
      config: sanitiseConfigForExport(n.node_type, n.config ?? {}, tagNames),
      position_x: n.position_x ?? 0,
      position_y: n.position_y ?? 0,
    })),
  };
}

function sanitiseConfigForExport(
  nodeType: string,
  config: Record<string, unknown>,
  tagNames: Map<string, { name: string; color?: string | null }>
): Record<string, unknown> {
  const out = { ...config };

  if (nodeType === 'set_tag') {
    const id = typeof out.tag_id === 'string' ? out.tag_id : null;
    const known = id ? tagNames.get(id) : undefined;
    // Name travels beside the id. The id is kept because re-importing
    // into the SAME account should resolve exactly, with no name
    // ambiguity if two tags happen to share a label.
    if (known) {
      out.tag_name = known.name;
      if (known.color) out.tag_color = known.color;
    }
  }

  if (nodeType === 'handoff') {
    // See the header note: a foreign user_id must not travel.
    delete out.assign_to;
  }

  return out;
}

// ------------------------------------------------------------
// Import
// ------------------------------------------------------------

export interface ParsedPortableFlow {
  doc: PortableFlow;
  /** Blocking. The document cannot become a flow. */
  errors: string[];
  /** Non-blocking. Imported anyway, surfaced to the user. */
  warnings: string[];
}

/**
 * Parse and structurally validate an untrusted document.
 *
 * The split between error and warning is the important part.
 *
 * ERRORS are things that make the file un-storable or un-runnable no
 * matter what the user does next: an unknown node_type (the DB CHECK
 * rejects it), a duplicate node_key (the unique index rejects it), an
 * edge pointing at a node that does not exist, an entry node that is
 * absent. Importing those would either fail at the INSERT with a raw
 * Postgres error, or succeed and strand a customer mid-conversation.
 *
 * WARNINGS are things the editor can fix — a keyword trigger with no
 * keywords yet, an unreachable node. Blocking on those would make it
 * impossible to move a work-in-progress between environments, which is
 * most of why anyone exports a flow.
 */
export function parsePortableFlow(raw: unknown): ParsedPortableFlow | null {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const doc = raw as Record<string, unknown>;

  const version = Number(doc.replai_flow_version);
  if (!Number.isFinite(version)) {
    errors.push(
      'This does not look like a Replai flow file — it has no "replai_flow_version".'
    );
  } else if (version > PORTABLE_FLOW_VERSION) {
    // Refused rather than attempted: a newer major version may move a
    // field this build would silently drop, and a half-imported flow is
    // harder to notice than a refused one.
    errors.push(
      `This file was exported by a newer version of Replai (format v${version}; this build understands v${PORTABLE_FLOW_VERSION}). Update, or export again from the older version.`
    );
  }

  const flowRaw = doc.flow;
  if (!flowRaw || typeof flowRaw !== 'object' || Array.isArray(flowRaw)) {
    errors.push('The file is missing its "flow" section.');
  }
  const f = (flowRaw ?? {}) as Record<string, unknown>;

  const name = typeof f.name === 'string' ? f.name.trim() : '';
  if (!name) errors.push('The flow has no name.');

  const triggerType =
    typeof f.trigger_type === 'string' ? f.trigger_type : 'keyword';
  if (!TRIGGER_TYPES.has(triggerType)) {
    errors.push(
      `Unknown trigger type "${triggerType}". Expected keyword, first_inbound_message or manual.`
    );
  }

  const nodesRaw = Array.isArray(doc.nodes) ? doc.nodes : null;
  if (!nodesRaw) {
    errors.push('The file is missing its "nodes" array.');
  }

  const nodes: PortableFlowNode[] = [];
  const seenKeys = new Set<string>();

  for (const [i, nRaw] of (nodesRaw ?? []).entries()) {
    if (!nRaw || typeof nRaw !== 'object' || Array.isArray(nRaw)) {
      errors.push(`Node ${i + 1} is not an object.`);
      continue;
    }
    const n = nRaw as Record<string, unknown>;
    const key = typeof n.node_key === 'string' ? n.node_key.trim() : '';
    const type = typeof n.node_type === 'string' ? n.node_type.trim() : '';

    if (!key) {
      errors.push(`Node ${i + 1} has no node_key.`);
      continue;
    }
    if (seenKeys.has(key)) {
      errors.push(`Two nodes share the key "${key}" — keys must be unique.`);
      continue;
    }
    seenKeys.add(key);

    if (!KNOWN_NODE_TYPES.has(type)) {
      errors.push(
        `Node "${key}" has an unsupported type "${type || '(blank)'}".`
      );
      continue;
    }

    nodes.push({
      node_key: key,
      node_type: type,
      config:
        n.config && typeof n.config === 'object' && !Array.isArray(n.config)
          ? (n.config as Record<string, unknown>)
          : {},
      position_x: Number.isFinite(Number(n.position_x))
        ? Number(n.position_x)
        : 0,
      position_y: Number.isFinite(Number(n.position_y))
        ? Number(n.position_y)
        : 0,
    });
  }

  if (nodesRaw && nodes.length === 0 && errors.length === 0) {
    errors.push('The file contains no usable nodes.');
  }

  const entry =
    typeof f.entry_node_id === 'string' && f.entry_node_id.trim()
      ? f.entry_node_id.trim()
      : null;
  if (entry && !seenKeys.has(entry)) {
    errors.push(
      `The entry node "${entry}" is not among the nodes in this file.`
    );
  }
  if (!entry) {
    warnings.push(
      'No entry node is set, so the flow cannot run until you pick one in the editor.'
    );
  }

  // Edge integrity. Checked here rather than left to the activation
  // validator because a broken edge fails the run at the moment a
  // customer is mid-conversation, which is the expensive place to
  // discover it.
  for (const node of nodes) {
    for (const { via, target } of outgoingTargets(node)) {
      if (!target) {
        errors.push(`Node "${node.node_key}" has an empty ${via}.`);
      } else if (!seenKeys.has(target)) {
        errors.push(
          `Node "${node.node_key}" points at "${target}" (${via}), which is not in this file.`
        );
      }
    }
  }

  // Richer, non-blocking feedback from the real activation validator, so
  // the user learns about Meta caps and empty triggers at import time
  // rather than when they press Activate.
  if (errors.length === 0) {
    try {
      const result: ValidationIssue[] = validateFlowForActivation(
        {
          name,
          trigger_type: triggerType as 'keyword',
          trigger_config: (f.trigger_config ?? {}) as Record<string, unknown>,
          entry_node_id: entry,
        },
        nodes.map((n) => ({
          node_key: n.node_key,
          node_type: n.node_type,
          config: configForPreCheck(n),
        }))
      );
      for (const issue of result) {
        const where = issue.node_key ? `${issue.node_key}: ` : '';
        warnings.push(`${where}${issue.message}`);
      }
    } catch {
      // The validator is advisory here. If it throws on a shape it did
      // not expect, that must not block an otherwise-structurally-sound
      // import.
      warnings.push('Could not fully pre-check this flow before importing.');
    }
  }

  return {
    doc: {
      replai_flow_version: Number.isFinite(version)
        ? version
        : PORTABLE_FLOW_VERSION,
      exported_at:
        typeof doc.exported_at === 'string' ? doc.exported_at : undefined,
      flow: {
        name,
        description:
          typeof f.description === 'string' && f.description.trim()
            ? f.description.trim()
            : null,
        trigger_type: triggerType,
        trigger_config:
          f.trigger_config &&
          typeof f.trigger_config === 'object' &&
          !Array.isArray(f.trigger_config)
            ? (f.trigger_config as Record<string, unknown>)
            : {},
        entry_node_id: entry,
        fallback_policy:
          f.fallback_policy &&
          typeof f.fallback_policy === 'object' &&
          !Array.isArray(f.fallback_policy)
            ? (f.fallback_policy as Record<string, unknown>)
            : {},
      },
      nodes,
    },
    errors,
    warnings,
  };
}

/**
 * The config to hand the activation validator during the advisory
 * pre-check — NOT the config that gets stored.
 *
 * Only difference: a `set_tag` carrying a `tag_name` but no `tag_id` is
 * given a stand-in id. The importer resolves that name to a real tag
 * (creating it when absent) immediately after this check, so the
 * validator's "needs a tag" error describes a state that never reaches
 * the database. Left alone it surfaced as a warning on every
 * hand-written or AI-authored flow, telling the user to go fix
 * something that was already correct — the fastest way to teach people
 * that import warnings are noise worth ignoring.
 */
function configForPreCheck(node: PortableFlowNode): Record<string, unknown> {
  if (node.node_type !== 'set_tag') return node.config;
  const hasId =
    typeof node.config.tag_id === 'string' && node.config.tag_id.trim() !== '';
  const hasName =
    typeof node.config.tag_name === 'string' &&
    node.config.tag_name.trim() !== '';
  if (hasId || !hasName) return node.config;
  return { ...node.config, tag_id: '__resolved_on_import__' };
}

/** Every outgoing edge on a node, wherever the config hides it. */
export function outgoingTargets(
  node: PortableFlowNode
): { via: string; target: string | null }[] {
  const cfg = node.config;
  const out: { via: string; target: string | null }[] = [];

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  switch (node.node_type) {
    case 'start':
    case 'send_message':
    case 'send_media':
    case 'collect_input':
    case 'set_tag':
    case 'ai_agent':
      out.push({ via: 'next_node_key', target: str(cfg.next_node_key) });
      break;
    case 'condition':
      out.push({ via: 'true_next', target: str(cfg.true_next) });
      out.push({ via: 'false_next', target: str(cfg.false_next) });
      break;
    case 'send_buttons':
      for (const b of Array.isArray(cfg.buttons) ? cfg.buttons : []) {
        const btn = b as Record<string, unknown>;
        out.push({
          via: `button "${String(btn.title ?? '?')}"`,
          target: str(btn.next_node_key),
        });
      }
      break;
    case 'send_list':
      for (const s of Array.isArray(cfg.sections) ? cfg.sections : []) {
        const sec = s as Record<string, unknown>;
        for (const r of Array.isArray(sec.rows) ? sec.rows : []) {
          const row = r as Record<string, unknown>;
          out.push({
            via: `list row "${String(row.title ?? '?')}"`,
            target: str(row.next_node_key),
          });
        }
      }
      break;
    // handoff and end are terminal — no outgoing edges by design.
    default:
      break;
  }

  return out;
}

/**
 * A filename a human can find again later.
 *
 * Slugged because the flow name is free text and may contain characters
 * that browsers or filesystems mangle — a name like "Q4 / promo" would
 * otherwise produce a path separator in a Content-Disposition header.
 */
export function portableFlowFilename(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'flow';
  return `${slug}.replai-flow.json`;
}
