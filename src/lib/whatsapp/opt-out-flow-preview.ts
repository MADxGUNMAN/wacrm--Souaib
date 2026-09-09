/**
 * The built-in opt-out behaviour, expressed as a flow graph.
 *
 * WHY THIS EXISTS
 *
 * Opt-out handling is hardcoded, not an automation an operator builds —
 * that is deliberate, and `docs/marketing-opt-out.md` records why: an
 * automation is opt-in per account (so accounts that never build one have
 * no opt-out path at all), is skipped when a Flow already consumed the
 * message, cannot stop the AI auto-reply, and matches by substring.
 *
 * The cost of that decision is that the behaviour is invisible. Owners
 * cannot open it, so they cannot check what it does. This module pays that
 * cost back by describing the same behaviour in the Flows builder's own
 * vocabulary, so it can be rendered on the real canvas rather than
 * explained in prose beside it.
 *
 * IT IS AN ILLUSTRATION, NOT THE IMPLEMENTATION. Nothing reads this at
 * runtime. It is generated from the account's live keyword configuration so
 * it cannot show `STOP` while the account actually matches `CANCEL`, but it
 * is still a drawing of code that lives in `opt-out-inbound.ts`. If that
 * handler changes, this must be updated by hand — hence the pointer in both
 * files.
 *
 * Two things the graph deliberately cannot express, and which the preview
 * dialog states in text instead:
 *
 *   1. Recording the suppression itself. There is no node type for "add
 *      this number to the suppression list", and inventing a `set_tag` step
 *      for it would be a lie — opt-outs are keyed on phone precisely so
 *      they survive contact deletion, which a tag would not.
 *   2. Pausing the running flow and muting the AI. Those are side effects
 *      of the same step, with no node vocabulary of their own.
 *
 * Both are folded into the confirmation node's header line, where they read
 * as consequences rather than as separate steps that could be reordered.
 */

import {
  DEFAULT_FALLBACK_POLICY,
  type FlowNodeRow,
  type FlowRow,
} from '@/lib/flows/types';
import {
  RESERVED_OPT_IN_PAYLOAD,
  SUGGESTED_OPT_IN_BUTTON_LABEL,
} from '@/lib/whatsapp/opt-out-keywords';

/** Node keys, named so the canvas cards read as sentences. */
const KEYS = {
  start: 'customer_replies',
  matchOptOut: 'matches_opt_out_word',
  confirmOptOut: 'unsubscribed_confirmation',
  matchOptIn: 'matches_opt_in_word',
  confirmOptIn: 'resubscribed_confirmation',
  endNormal: 'continues_as_normal',
} as const;

const FLOW_ID = 'opt-out-preview';
const TIMESTAMP = '1970-01-01T00:00:00.000Z';

function node(
  nodeKey: string,
  nodeType: FlowNodeRow['node_type'],
  config: Record<string, unknown>
): FlowNodeRow {
  return {
    id: `${FLOW_ID}-${nodeKey}`,
    flow_id: FLOW_ID,
    node_key: nodeKey,
    node_type: nodeType,
    config,
    // All zero on purpose: the canvas runs dagre top-to-bottom whenever
    // EVERY node sits at the origin, so the preview lays itself out and
    // there are no hand-tuned coordinates to drift as nodes are added.
    position_x: 0,
    position_y: 0,
    created_at: TIMESTAMP,
  };
}

/** Human-readable keyword list for a node summary: STOP, CANCEL. */
function joinKeywords(keywords: string[], fallback: string): string {
  const list = keywords.filter(Boolean);
  return list.length > 0 ? list.join(', ') : fallback;
}

export interface OptOutPreviewGraph {
  flow: FlowRow;
  nodes: FlowNodeRow[];
}

/**
 * Build the preview graph from the account's live configuration.
 *
 * Takes the DRAFT keywords from the settings form rather than the saved
 * row, so an owner editing keywords sees the preview follow along. That is
 * the whole reason this is generated instead of being a static asset.
 */
export function buildOptOutPreviewGraph(args: {
  optOutKeywords: string[];
  optInKeywords: string[];
  optOutMessage: string;
  optInMessage: string;
}): OptOutPreviewGraph {
  const optOutWords = joinKeywords(args.optOutKeywords, 'STOP');
  const hasOptInKeywords = args.optInKeywords.filter(Boolean).length > 0;

  const nodes: FlowNodeRow[] = [
    node(KEYS.start, 'start', { next_node_key: KEYS.matchOptOut }),

    node(KEYS.matchOptOut, 'condition', {
      subject: 'var',
      subject_key: 'the whole message',
      operator: 'equals',
      value: optOutWords,
      true_next: KEYS.confirmOptOut,
      false_next: KEYS.matchOptIn,
    }),

    // The confirmation IS the unsubscribe step. Its header carries the two
    // side effects the node vocabulary cannot represent.
    node(KEYS.confirmOptOut, 'send_buttons', {
      header_text:
        'Number added to the suppression list · running flow paused · AI muted',
      text: args.optOutMessage,
      // The ONLY outgoing edge is the button, and that is accurate: after
      // the confirmation nothing else happens automatically. Deliberately no
      // `next_node_key` here — `deriveCanvasEdges` ignores it on
      // `send_buttons` nodes, so adding one would leave whatever it pointed
      // at floating on the canvas with no arrow into it.
      buttons: [
        {
          reply_id: RESERVED_OPT_IN_PAYLOAD,
          title: SUGGESTED_OPT_IN_BUTTON_LABEL,
          next_node_key: KEYS.confirmOptIn,
        },
      ],
    }),

    node(KEYS.matchOptIn, 'condition', {
      subject: 'var',
      subject_key: 'the whole message',
      operator: 'equals',
      value: hasOptInKeywords
        ? joinKeywords(args.optInKeywords, 'START')
        : 'nothing — no opt-in keywords set',
      true_next: KEYS.confirmOptIn,
      false_next: KEYS.endNormal,
    }),

    node(KEYS.confirmOptIn, 'send_message', {
      text: args.optInMessage,
      next_node_key: KEYS.endNormal,
    }),

    node(KEYS.endNormal, 'end', {}),
  ];

  const flow: FlowRow = {
    id: FLOW_ID,
    account_id: FLOW_ID,
    user_id: FLOW_ID,
    name: 'Opt-in / opt-out (built in)',
    description:
      'Runs automatically while keyword watching is on. Not editable.',
    // 'active' so the canvas does not badge it as a draft — it genuinely is
    // running, it simply is not stored as a flow row.
    status: 'active',
    trigger_type: 'keyword',
    trigger_config: { keywords: args.optOutKeywords, match_type: 'exact' },
    entry_node_id: KEYS.start,
    fallback_policy: DEFAULT_FALLBACK_POLICY,
    execution_count: 0,
    last_executed_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  };

  return { flow, nodes };
}
