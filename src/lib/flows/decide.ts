/**
 * The flow engine's pure decision layer.
 *
 * Every function here is a total function of its arguments: no
 * database, no network, no clock, no imports beyond `./types`. That
 * constraint is the whole point of the module.
 *
 * Why it was split out of `engine.ts`: these helpers were already
 * written as pure functions and already carried comments saying the
 * builder UI should be able to reuse them ("stable enough that the v3
 * builder UI can preview matches by passing canned strings"). But they
 * could not actually be imported from the browser, because `engine.ts`
 * statically imports `./meta-send`, which imports
 * `@/lib/whatsapp/encryption`, which imports node's `crypto`. Pulling
 * the engine into a client bundle fails outright.
 *
 * Moving them here lets three consumers share one copy of every
 * decision:
 *   - `engine.ts`, the production runner (re-exports these so no
 *     existing caller or test changes);
 *   - `simulate.ts`, the playground's flow simulator;
 *   - the builder UI, directly, for anything it wants to preview.
 *
 * The alternative was for the simulator to re-implement "which button
 * matched", "does this keyword fire", "is this condition true". That is
 * the drift that makes a test harness lie: the playground says the flow
 * works and production disagrees, and the difference is invisible
 * because it lives in two files that were once identical.
 */

import type {
  ConditionNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
} from './types';

/**
 * Quick regex fallback for email extraction — used when AI is
 * unavailable or for the email field (where regex is reliable).
 */
export function extractEmailByRegex(raw: string): string {
  const match = raw.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : raw.trim();
}

/**
 * Synchronous value cleanup.
 *
 * The production capture path uses the async, AI-backed
 * `extractCleanValueWithAi` in `engine.ts`. This is the deterministic
 * subset: reliable for email, raw text for everything else.
 */
export function extractCleanValue(varKey: string, raw: string): string {
  if (varKey === 'email') return extractEmailByRegex(raw);
  return raw.trim();
}

/**
 * Given a node + the customer's reply_id, return the next_node_key
 * to advance to, or `null` if no option matches.
 */
export function matchReplyId(
  node: { node_type: string; config: Record<string, unknown> },
  reply_id: string
): string | null {
  if (node.node_type === 'send_buttons') {
    const cfg = node.config as unknown as SendButtonsNodeConfig;
    const hit = cfg.buttons?.find((b) => b.reply_id === reply_id);
    return hit?.next_node_key ?? null;
  }
  if (node.node_type === 'send_list') {
    const cfg = node.config as unknown as SendListNodeConfig;
    for (const section of cfg.sections ?? []) {
      const hit = section.rows?.find((r) => r.reply_id === reply_id);
      if (hit) return hit.next_node_key;
    }
    return null;
  }
  return null;
}

/**
 * Case-insensitive contains/exact match against a list of keywords.
 * Used by the trigger evaluator. Stable enough that the builder UI can
 * preview matches by passing canned strings.
 */
export function matchesKeywordTrigger(
  text: string,
  cfg: KeywordTriggerConfig
): boolean {
  if (!text || !cfg.keywords?.length) return false;
  const matchType = cfg.match_type ?? 'contains';
  const haystack = cfg.case_sensitive ? text : text.toLowerCase();
  for (const raw of cfg.keywords) {
    if (!raw) continue;
    const needle = cfg.case_sensitive ? raw : raw.toLowerCase();
    if (
      matchType === 'exact' ? haystack === needle : haystack.includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

/** Nodes that advance to a next_node_key without waiting for input. */
export function isAutoAdvancing(node_type: string): boolean {
  return (
    node_type === 'start' ||
    node_type === 'send_message' ||
    node_type === 'send_media' ||
    node_type === 'condition' ||
    node_type === 'set_tag'
  );
}

/**
 * Nodes that send a prompt and suspend awaiting a customer reply.
 *
 * `ai_agent` belongs here: the runner sends its opening line, persists
 * `current_node_key` and returns, exactly as `collect_input` does, then
 * wakes on the customer's next text. It was originally omitted, and the
 * exhaustiveness test that should have caught it enumerated only ten of
 * the eleven node types — so the classifier disagreed with the runner it
 * describes, silently. Nothing in production read it at the time, which
 * is why nobody noticed; the simulator does read it, so it has to be
 * true.
 */
export function isSuspending(node_type: string): boolean {
  return (
    node_type === 'send_buttons' ||
    node_type === 'send_list' ||
    node_type === 'collect_input' ||
    node_type === 'ai_agent'
  );
}

/** Nodes that end the run. */
export function isTerminal(node_type: string): boolean {
  return node_type === 'handoff' || node_type === 'end';
}

/**
 * Evaluate a `condition` node's predicate against already-resolved
 * values. The caller does any lookup — the production engine hits the
 * DB for `tag` / `contact_field` subjects, the simulator reads its
 * in-memory pretend contact — so the comparison itself stays pure and
 * identical for both.
 */
export function evaluateConditionPredicate(args: {
  operator: ConditionNodeConfig['operator'];
  /**
   * Resolved value of the subject. `undefined` means the subject is
   * absent (no var with that key / no such tag / contact field is
   * null).
   */
  subjectValue: string | undefined;
  /** The configured comparison value, when applicable. */
  configValue: string | undefined;
}): boolean {
  switch (args.operator) {
    case 'present':
      return args.subjectValue !== undefined && args.subjectValue !== '';
    case 'absent':
      return args.subjectValue === undefined || args.subjectValue === '';
    case 'equals':
      if (args.subjectValue === undefined) return false;
      return args.subjectValue === (args.configValue ?? '');
    case 'contains':
      if (args.subjectValue === undefined) return false;
      return args.subjectValue.includes(args.configValue ?? '');
  }
}

/**
 * `{{vars.foo}}` interpolation. Missing vars render as the empty
 * string — the same behaviour as the automations engine.
 *
 * Note the character class: only `[a-zA-Z0-9_]` is matched, which is
 * why `VAR_KEY_PATTERN` in `validate.ts` rejects anything else. A
 * var_key with a space stores fine and then can never be read back.
 */
export function interpolateVars(
  template: string,
  vars: Record<string, unknown>
): string {
  if (!template) return '';
  return template.replace(/\{\{vars\.([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Contact columns a `handoff` node auto-fills from captured vars, keyed
 * by the var name it looks for.
 *
 * Exported so the playground can show the user "this handoff would set
 * the contact's name and email" using the same mapping the engine
 * applies, rather than a hardcoded list in the UI that quietly stops
 * matching when a fourth field is added.
 */
export const HANDOFF_CONTACT_FIELD_MAP: Record<string, string> = {
  name: 'name',
  email: 'email',
  company: 'company',
};

/** Contact fields a `condition` node may read via `subject: 'contact_field'`. */
export const CONDITION_CONTACT_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
] as const;

export type ConditionContactField = (typeof CONDITION_CONTACT_FIELDS)[number];
