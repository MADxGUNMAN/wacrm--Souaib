/**
 * Flow runner.
 *
 * The single entry point `dispatchInboundToFlows` is called by the
 * WhatsApp webhook on every inbound message *for an account that has
 * opted into the Flows beta*. It decides whether the message belongs
 * to an active conversation flow (advance it) or matches the entry
 * trigger of an active flow (start a new run) — and reports back to
 * the webhook so the webhook knows whether to also fire automations.
 *
 * Architecture in a sentence: the runner walks the customer through
 * a DB-stored node graph, suspending only at nodes that need
 * customer input. Each tap or text reply wakes it back up.
 *
 * What lives here vs elsewhere:
 *   - Pure decision logic (which button matched, where to advance to,
 *     when to fallback) — here.
 *   - DB shape (table reads/writes) — here.
 *   - Meta API calls — `meta-send.ts` (engineSendInteractive*).
 *   - Policy resolution (reprompt vs handoff vs end) — `fallback.ts`.
 *   - Type definitions — `types.ts`.
 *
 * Concurrency model:
 *   - Idempotency on `meta_message_id`: the runner refuses to advance
 *     an active run twice for the same Meta message — protects against
 *     Meta's retries.
 *   - Optimistic UPDATE with `current_node_key` precondition: two
 *     simultaneous taps for the same run collide at the DB layer; the
 *     second is a no-op.
 *   - Partial unique index `idx_one_active_run_per_contact`: two
 *     simultaneous starts for the same contact collide; the second
 *     INSERT raises 23505 and the runner catches & exits.
 */

import { supabaseAdmin } from './admin-client';
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
  engineSendMedia,
  engineSendText,
} from './meta-send';
import { decideFallback, resolveFallbackPolicy } from './fallback';
import {
  CONDITION_CONTACT_FIELDS,
  HANDOFF_CONTACT_FIELD_MAP,
  evaluateConditionPredicate,
  extractEmailByRegex,
  interpolateVars,
  matchReplyId,
  matchesKeywordTrigger,
  type ConditionContactField,
} from './decide';
import { addContactTagAndDispatch } from '@/lib/contacts/tag-events';
import { removeContactTag } from '@/lib/contacts/tag-write';
import {
  type CollectInputNodeConfig,
  type ConditionNodeConfig,
  type DispatchInboundInput,
  type DispatchInboundResult,
  type FlowNodeRow,
  type FlowRow,
  type FlowRunRow,
  type ParsedInbound,
  type SendButtonsNodeConfig,
  type SendListNodeConfig,
  type SendMediaNodeConfig,
  type SendMessageNodeConfig,
  type SetTagNodeConfig,
  type StartNodeConfig,
  type KeywordTriggerConfig,
  type AiAgentNodeConfig,
} from './types';

// ============================================================
// Pure decision helpers now live in ./decide, which imports nothing
// but ./types so the builder UI and the playground simulator can use
// them too (this module cannot be client-bundled — meta-send pulls in
// node's crypto via the encryption helper).
//
// Re-exported here so every existing import site and engine.test.ts
// keep working unchanged, and so `@/lib/flows/engine` remains the one
// obvious place to look for engine behaviour.
// ============================================================

export {
  extractCleanValue,
  extractEmailByRegex,
  matchReplyId,
  matchesKeywordTrigger,
  isAutoAdvancing,
  isSuspending,
  isTerminal,
  evaluateConditionPredicate,
} from './decide';

/**
 * Use the account's configured AI to extract clean structured data
 * from a customer's natural-language reply.
 *
 * Uses the node's `extraction_prompt` when configured (dynamic, n8n-style),
 * or falls back to an auto-generated prompt based on var_key.
 *
 * Example:
 *   extractionPrompt = "Extract only the person's full name"
 *   raw = "My good name is Souaib Ansari did you understand?"
 *   → AI returns: "Souaib Ansari"
 *
 * For emails, we skip the AI and use a reliable regex instead.
 * Falls back to the raw trimmed text if AI is unavailable or errors.
 */
async function extractCleanValueWithAi(
  accountId: string,
  varKey: string,
  raw: string,
  extractionPrompt?: string
): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Emails are reliably extracted by regex — no need for AI.
  if (varKey === 'email' && !extractionPrompt)
    return extractEmailByRegex(trimmed);

  // If no extraction_prompt is configured AND no known field, store raw.
  const fieldLabels: Record<string, string> = {
    name: "person's full name",
    company: 'company or organization name',
    phone: 'phone number',
    address: 'address',
  };
  const instruction =
    extractionPrompt ||
    (fieldLabels[varKey]
      ? `Extract the ${fieldLabels[varKey]} from this message. Output ONLY the ${fieldLabels[varKey]}, nothing else.`
      : null);

  // No instruction and no known field → store raw text.
  if (!instruction) return trimmed;

  try {
    const { loadAiConfig } = await import('@/lib/ai/config');
    const db = supabaseAdmin();
    const config = await loadAiConfig(db, accountId, { requireActive: false });
    if (!config) return trimmed;

    const { generateReply } = await import('@/lib/ai/generate');
    const systemPrompt =
      'You are a data extraction assistant. Your ONLY job is to extract a specific piece of information from a customer message. ' +
      'Output ONLY the extracted value — no quotes, no explanation, no prefix, no extra words. ' +
      'If you cannot find the value, output the original message as-is.';

    const { text } = await generateReply({
      config,
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${instruction}\n\nCustomer message: "${trimmed}"`,
        },
      ],
    });

    const extracted = text?.trim();
    // Sanity: if AI returned empty or something weird, use raw.
    return extracted &&
      extracted.length > 0 &&
      extracted.length <= trimmed.length * 2
      ? extracted
      : trimmed;
  } catch (err) {
    console.error('[flow engine] AI extraction failed, using raw value:', err);
    return trimmed;
  }
}

// ============================================================
// DB I/O — wrapped in tiny helpers so the dispatch flow stays
// readable. Errors surface as thrown — the entry point catches.
// ============================================================

type AdminClient = ReturnType<typeof supabaseAdmin>;

async function loadActiveRunForContact(
  db: AdminClient,
  accountId: string,
  contactId: string
): Promise<FlowRunRow | null> {
  // The partial unique index `idx_one_active_run_per_contact` was
  // rebuilt in migration 017 over `(account_id, contact_id)` — so
  // "two active runs for one contact in one account" is impossible
  // by design. But a future migration glitch or manual SQL could
  // create one, and .maybeSingle() throws on >1 row — which would
  // kill dispatch for that contact's webhook entirely. .limit(1) is
  // forgiving: pick the newest, let the cron sweep clean up the
  // stale one.
  const { data, error } = await db
    .from('flow_runs')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[flows] loadActiveRunForContact error:', error.message);
    return null;
  }
  const rows = (data as FlowRunRow[] | null) ?? [];
  return rows[0] ?? null;
}

async function loadFlow(
  db: AdminClient,
  flowId: string
): Promise<FlowRow | null> {
  const { data, error } = await db
    .from('flows')
    .select('*')
    .eq('id', flowId)
    .maybeSingle();
  if (error) {
    console.error('[flows] loadFlow error:', error.message);
    return null;
  }
  return (data as FlowRow | null) ?? null;
}

/**
 * Load every node of a flow in one round trip and key them by
 * `node_key`. The advance loop is then in-memory — a 5-node
 * auto-advancing chain costs one SELECT, not five.
 *
 * Returns an empty map on error so the caller can still dispatch
 * cleanly (every subsequent .get() returns undefined → the run
 * fails with node_not_found, same as the old per-node lookup).
 */
async function loadAllNodes(
  db: AdminClient,
  flowId: string
): Promise<Map<string, FlowNodeRow>> {
  const { data, error } = await db
    .from('flow_nodes')
    .select('*')
    .eq('flow_id', flowId);
  if (error) {
    console.error('[flows] loadAllNodes error:', error.message);
    return new Map();
  }
  const map = new Map<string, FlowNodeRow>();
  for (const row of (data ?? []) as FlowNodeRow[]) {
    map.set(row.node_key, row);
  }
  return map;
}

async function logEvent(
  db: AdminClient,
  flowRunId: string,
  event_type:
    | 'started'
    | 'node_entered'
    | 'message_sent'
    | 'reply_received'
    | 'fallback_fired'
    | 'handoff'
    | 'timeout'
    | 'error'
    | 'completed',
  node_key: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await db.from('flow_run_events').insert({
    flow_run_id: flowRunId,
    event_type,
    node_key,
    payload,
  });
  if (error) {
    // Logging failure is non-fatal — surface but don't throw.
    console.error('[flows] logEvent error:', error.message);
  }
}

/**
 * Idempotency check — has a `reply_received` event with this Meta
 * message_id already been recorded for any of the contact's flow
 * runs? If yes, the inbound is a duplicate (Meta retry) and we
 * exit without re-advancing.
 *
 * Implementation note: scoped to runs belonging to this user/contact
 * so the lookup is cheap (the index on flow_run_events(flow_run_id,
 * event_type) plus the small set of runs per contact).
 */
async function isDuplicateInbound(
  db: AdminClient,
  accountId: string,
  contactId: string,
  metaMessageId: string
): Promise<boolean> {
  // Fetch ALL run ids for this contact in this account (active +
  // historical). Bounded by how many flows the customer has been
  // through — small.
  const { data: runs } = await db
    .from('flow_runs')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId);
  if (!runs?.length) return false;
  const runIds = runs.map((r) => (r as { id: string }).id);

  const { count } = await db
    .from('flow_run_events')
    .select('id', { count: 'exact', head: true })
    .in('flow_run_id', runIds)
    .eq('event_type', 'reply_received')
    .filter('payload->>meta_message_id', 'eq', metaMessageId);
  return (count ?? 0) > 0;
}

async function findEntryFlow(
  db: AdminClient,
  accountId: string,
  message: ParsedInbound,
  isFirstInbound: boolean
): Promise<FlowRow | null> {
  /**
   * What text, if anything, this inbound offers a trigger to match on.
   *
   * A plain message offers its body. An interactive reply offers the
   * LABEL of the option tapped — which is what makes the standard
   * WhatsApp lead-gen pattern work: a marketing template goes out with a
   * quick-reply CTA ("Get Bulk Price"), and Meta delivers the tap as an
   * interactive reply rather than as text.
   *
   * Before this, that pattern could not start a flow at all. The reply
   * arrived, no run existed for the contact, and this function returned
   * null on the `kind !== 'text'` check — so the customer tapped the
   * button the campaign was built around and nothing happened.
   *
   * Deliberately narrow: only KEYWORD triggers may match a tap. A
   * `first_inbound_message` flow must not, because a template tap is very
   * often a contact's first inbound, and letting it match would mean
   * every campaign reply got grabbed by whatever greeter flow happens to
   * be active — silently stealing the tap from the flow that was built
   * for it.
   */
  const triggerText =
    message.kind === 'text'
      ? message.text
      : message.reply_title?.trim() || message.reply_id;
  if (!triggerText) return null;
  const keywordOnly = message.kind !== 'text';

  // Pull all active flows for this account. Active set is bounded
  // (the builder discourages double-trigger overlap; partial index
  // makes the lookup index-supported).
  const { data: flows, error } = await db
    .from('flows')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error || !flows) return null;

  const typed = flows as FlowRow[];
  for (const flow of typed) {
    if (flow.trigger_type === 'keyword') {
      if (
        matchesKeywordTrigger(
          triggerText,
          flow.trigger_config as KeywordTriggerConfig
        )
      ) {
        return flow;
      }
    } else if (
      flow.trigger_type === 'first_inbound_message' &&
      isFirstInbound &&
      // See `keywordOnly` above — a button tap must not be claimed by a
      // greeter flow that was written for typed messages.
      !keywordOnly
    ) {
      return flow;
    }
    // 'manual' triggers do not auto-start from inbound messages.
  }
  return null;
}

// ============================================================
// Node executors — each handles ONE node type. send_buttons and
// send_list also persist `last_prompt_message_id` so the inbox
// thread can quote the prompt the customer is replying to.
// ============================================================

async function sendButtonsAndSuspend(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<{ outcome: 'advanced'; node_key: string }> {
  const cfg = node.config as unknown as SendButtonsNodeConfig;
  const { whatsapp_message_id } = await engineSendInteractiveButtons({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId: run.conversation_id!,
    contactId: run.contact_id!,
    // Interpolated, like send_message and collect_input already were.
    // The omission was a footgun: an author who wrote "{{vars.name}}"
    // in a button prompt got the braces sent to the customer verbatim,
    // with nothing at save time to warn them.
    bodyText: interpolateVars(cfg.text, run.vars),
    headerText: cfg.header_text
      ? interpolateVars(cfg.header_text, run.vars)
      : undefined,
    footerText: cfg.footer_text
      ? interpolateVars(cfg.footer_text, run.vars)
      : undefined,
    buttons: cfg.buttons.map((b) => ({ id: b.reply_id, title: b.title })),
  });
  await logEvent(db, run.id, 'message_sent', node.node_key, {
    node_type: 'send_buttons',
    whatsapp_message_id,
  });
  // Look up our internal message id so we can stash it on the run.
  // Cheap — indexed on `messages.message_id`.
  const { data: msg } = await db
    .from('messages')
    .select('id')
    .eq('message_id', whatsapp_message_id)
    .maybeSingle();
  await db
    .from('flow_runs')
    .update({
      last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
    })
    .eq('id', run.id);
  return { outcome: 'advanced', node_key: node.node_key };
}

async function sendListAndSuspend(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<{ outcome: 'advanced'; node_key: string }> {
  const cfg = node.config as unknown as SendListNodeConfig;
  const { whatsapp_message_id } = await engineSendInteractiveList({
    accountId: run.account_id,
    userId: run.user_id,
    conversationId: run.conversation_id!,
    contactId: run.contact_id!,
    // See the note in sendButtonsAndSuspend — lists interpolate for the
    // same reason.
    bodyText: interpolateVars(cfg.text, run.vars),
    buttonLabel: cfg.button_label,
    headerText: cfg.header_text
      ? interpolateVars(cfg.header_text, run.vars)
      : undefined,
    footerText: cfg.footer_text
      ? interpolateVars(cfg.footer_text, run.vars)
      : undefined,
    sections: cfg.sections.map((s) => ({
      title: s.title,
      rows: s.rows.map((r) => ({
        id: r.reply_id,
        title: r.title,
        description: r.description,
      })),
    })),
  });
  await logEvent(db, run.id, 'message_sent', node.node_key, {
    node_type: 'send_list',
    whatsapp_message_id,
  });
  const { data: msg } = await db
    .from('messages')
    .select('id')
    .eq('message_id', whatsapp_message_id)
    .maybeSingle();
  await db
    .from('flow_runs')
    .update({
      last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
    })
    .eq('id', run.id);
  return { outcome: 'advanced', node_key: node.node_key };
}

async function executeHandoff(
  db: AdminClient,
  run: FlowRunRow,
  node: FlowNodeRow
): Promise<void> {
  const cfg = node.config as { assign_to?: string; note?: string };

  // ── Auto-fill contact fields from captured flow vars ────────────
  // If the flow collected name / email / company via collect_input,
  // write them directly into the contacts row so the Contacts page
  // shows the data immediately — no manual entry needed.
  if (run.contact_id && Object.keys(run.vars).length > 0) {
    const contactUpdate: Record<string, string> = {};
    for (const [varKey, contactCol] of Object.entries(
      HANDOFF_CONTACT_FIELD_MAP
    )) {
      const val = run.vars[varKey];
      if (typeof val === 'string' && val.trim()) {
        contactUpdate[contactCol] = val.trim();
      }
    }
    if (Object.keys(contactUpdate).length > 0) {
      contactUpdate.updated_at = new Date().toISOString();
      await db.from('contacts').update(contactUpdate).eq('id', run.contact_id);
    }
  }

  // ── Hand off conversation ──────────────────────────────────────
  const convUpdate: Record<string, unknown> = {
    status: 'pending',
    updated_at: new Date().toISOString(),
  };
  if (cfg.assign_to) convUpdate.assigned_agent_id = cfg.assign_to;
  if (run.conversation_id) {
    await db
      .from('conversations')
      .update(convUpdate)
      .eq('id', run.conversation_id);
  }
  await logEvent(db, run.id, 'handoff', node.node_key, {
    // Interpolated. This was stored raw, so a note written as
    // "New lead — name={{vars.name}}" reached the agent with the braces
    // intact and no values — the one place the collected answers were
    // supposed to be handed over was the one place they were not.
    // The shipped `lead_capture` template has exactly that note, so this
    // was wrong for every flow cloned from it.
    note: cfg.note ? interpolateVars(cfg.note, run.vars) : null,
    assigned_to: cfg.assign_to ?? null,
  });
  await endRun(db, run.id, 'handed_off', 'handoff_node');
}

/**
 * Resolve a condition node's subject value from DB / run state, then
 * call the pure `evaluateConditionPredicate`. Splits out so the
 * predicate itself stays unit-testable without a Supabase mock.
 *
 * Subject sources:
 *   - `var` → `flow_runs.vars[subject_key]` (captured by collect_input
 *     or http_fetch in v2).
 *   - `tag` → present iff `contact_tags(contact_id, tag_id)` exists.
 *     `subject_key` IS the tag UUID; the SELECT returns 1 row or 0.
 *   - `contact_field` → one of name/email/phone/company on `contacts`.
 */
async function evaluateConditionNode(
  db: AdminClient,
  run: FlowRunRow,
  cfg: ConditionNodeConfig
): Promise<boolean> {
  let subjectValue: string | undefined;
  if (cfg.subject === 'var') {
    const v = run.vars[cfg.subject_key];
    subjectValue =
      typeof v === 'string' ? v : v === undefined ? undefined : String(v);
  } else if (cfg.subject === 'tag') {
    const { count } = await db
      .from('contact_tags')
      .select('contact_id', { count: 'exact', head: true })
      .eq('contact_id', run.contact_id!)
      .eq('tag_id', cfg.subject_key);
    // For tags, "present" really is the only meaningful test — the
    // `present`/`absent` operators are the natural fit. equals/contains
    // against a tag UUID would still work mechanically (compare its
    // existence to the value).
    subjectValue = (count ?? 0) > 0 ? cfg.subject_key : undefined;
  } else {
    if (
      !CONDITION_CONTACT_FIELDS.includes(
        cfg.subject_key as ConditionContactField
      )
    ) {
      throw new Error(`unsupported contact_field: ${cfg.subject_key}`);
    }
    const { data } = await db
      .from('contacts')
      .select(cfg.subject_key)
      .eq('id', run.contact_id!)
      .maybeSingle();
    const raw = (data as Record<string, unknown> | null)?.[cfg.subject_key];
    subjectValue = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
  return evaluateConditionPredicate({
    operator: cfg.operator,
    subjectValue,
    configValue: cfg.value,
  });
}

async function endRun(
  db: AdminClient,
  runId: string,
  status: 'completed' | 'handed_off' | 'timed_out' | 'failed',
  reason: string
): Promise<void> {
  await db
    .from('flow_runs')
    .update({
      status,
      ended_at: new Date().toISOString(),
      end_reason: reason,
    })
    .eq('id', runId);
}

// ============================================================
// The synchronous advance loop. Walks through auto-advance nodes
// until it hits one that suspends (send_buttons/send_list) or
// terminates (handoff/end). Each suspending node persists the
// new current_node_key before returning.
// ============================================================

async function advanceFromNodeKey(
  db: AdminClient,
  run: FlowRunRow,
  startNodeKey: string,
  nodes: Map<string, FlowNodeRow>
): Promise<{ outcome: 'advanced' | 'completed' | 'handed_off' }> {
  let currentKey: string | null = startNodeKey;
  // Defensive cap — if a flow has a cycle (which the validator
  // SHOULD catch but doesn't yet in v1), we bail rather than loop.
  for (let safety = 0; safety < 64; safety += 1) {
    if (!currentKey) {
      await logEvent(db, run.id, 'error', null, {
        reason: 'next_node_key was null mid-advance',
      });
      await endRun(db, run.id, 'failed', 'missing_next_node');
      return { outcome: 'completed' };
    }
    const node: FlowNodeRow | null = nodes.get(currentKey) ?? null;
    if (!node) {
      await logEvent(db, run.id, 'error', currentKey, {
        reason: 'node_not_found',
      });
      await endRun(db, run.id, 'failed', 'node_not_found');
      return { outcome: 'completed' };
    }
    await logEvent(db, run.id, 'node_entered', node.node_key, {
      node_type: node.node_type,
    });

    if (node.node_type === 'start') {
      currentKey = (node.config as unknown as StartNodeConfig).next_node_key;
      continue;
    }
    if (node.node_type === 'send_message') {
      const cfg = node.config as unknown as SendMessageNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: interpolateVars(cfg.text, run.vars),
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'send_message',
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_text_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, 'failed', 'send_text_failed');
        return { outcome: 'completed' };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'send_media') {
      const cfg = node.config as unknown as SendMediaNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendMedia({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          kind: cfg.media_type,
          link: cfg.media_url,
          caption: cfg.caption
            ? interpolateVars(cfg.caption, run.vars)
            : undefined,
          filename: cfg.filename,
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'send_media',
          media_type: cfg.media_type,
          whatsapp_message_id,
        });
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'send_media_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, 'failed', 'send_media_failed');
        return { outcome: 'completed' };
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'collect_input') {
      // Send the prompt and suspend. Customer's next TEXT reply will
      // wake us up via handleReplyForActiveRun's collect_input branch.
      const cfg = node.config as unknown as CollectInputNodeConfig;
      try {
        const { whatsapp_message_id } = await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: interpolateVars(cfg.prompt_text, run.vars),
        });
        await logEvent(db, run.id, 'message_sent', node.node_key, {
          node_type: 'collect_input',
          whatsapp_message_id,
        });
        const { data: msg } = await db
          .from('messages')
          .select('id')
          .eq('message_id', whatsapp_message_id)
          .maybeSingle();
        await db
          .from('flow_runs')
          .update({
            last_prompt_message_id: (msg as { id: string } | null)?.id ?? null,
          })
          .eq('id', run.id);
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'collect_input_prompt_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, 'failed', 'collect_input_prompt_failed');
        return { outcome: 'completed' };
      }
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'ai_agent') {
      const cfg = node.config as unknown as AiAgentNodeConfig;

      // If there's an initial prompt, send it to the customer.
      // E.g. "Hi, I'm an AI assistant. How can I help you today?"
      if (cfg.prompt_text && cfg.prompt_text.trim()) {
        try {
          const { whatsapp_message_id } = await engineSendText({
            accountId: run.account_id,
            userId: run.user_id,
            conversationId: run.conversation_id!,
            contactId: run.contact_id!,
            text: interpolateVars(cfg.prompt_text, run.vars),
            // The opening line of an AI agent. Human-authored, but sent
            // AS the assistant ("Hi, I'm an AI assistant…") and followed
            // by model-written turns. Badging the greeting differently
            // from the replies would split one conversational voice
            // across two labels for no reason the reader can see.
            aiGenerated: true,
          });
          await logEvent(db, run.id, 'message_sent', node.node_key, {
            node_type: 'ai_agent',
            whatsapp_message_id,
          });
          const { data: msg } = await db
            .from('messages')
            .select('id')
            .eq('message_id', whatsapp_message_id)
            .maybeSingle();
          await db
            .from('flow_runs')
            .update({
              last_prompt_message_id:
                (msg as { id: string } | null)?.id ?? null,
            })
            .eq('id', run.id);
        } catch (err) {
          await logEvent(db, run.id, 'error', node.node_key, {
            reason: 'ai_agent_prompt_failed',
            detail: err instanceof Error ? err.message : String(err),
          });
          await endRun(db, run.id, 'failed', 'ai_agent_prompt_failed');
          return { outcome: 'completed' };
        }
      }

      // Suspend the flow here. The next customer text reply wakes up the
      // capture branch, which will use `generateReply` with the system_prompt.
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'condition') {
      const cfg = node.config as unknown as ConditionNodeConfig;
      let branch: 'true' | 'false';
      try {
        branch = (await evaluateConditionNode(db, run, cfg)) ? 'true' : 'false';
      } catch (err) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'condition_evaluation_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
        await endRun(db, run.id, 'failed', 'condition_evaluation_failed');
        return { outcome: 'completed' };
      }
      currentKey = branch === 'true' ? cfg.true_next : cfg.false_next;
      await logEvent(db, run.id, 'node_entered', node.node_key, {
        condition_result: branch,
        advancing_to: currentKey,
      });
      continue;
    }
    if (node.node_type === 'set_tag') {
      const cfg = node.config as unknown as SetTagNodeConfig;
      try {
        if (cfg.mode === 'add') {
          await addContactTagAndDispatch({
            db,
            accountId: run.account_id,
            contactId: run.contact_id!,
            tagId: cfg.tag_id,
            context: {
              conversation_id: run.conversation_id ?? undefined,
              vars: run.vars,
            },
          });
        } else {
          await removeContactTag(db, {
            accountId: run.account_id,
            contactId: run.contact_id!,
            tagId: cfg.tag_id,
          });
        }
      } catch (err) {
        // Non-fatal — log + advance. A tag-write failure shouldn't
        // strand the customer mid-flow.
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'set_tag_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      currentKey = cfg.next_node_key;
      continue;
    }
    if (node.node_type === 'send_buttons') {
      await sendButtonsAndSuspend(db, run, node);
      // Persist the new current_node_key via optimistic UPDATE.
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'send_list') {
      await sendListAndSuspend(db, run, node);
      const advanced = await advanceCurrentNodeKey(
        db,
        run.id,
        run.current_node_key,
        node.node_key
      );
      if (!advanced) {
        await logEvent(db, run.id, 'error', node.node_key, {
          reason: 'lost_race_during_advance',
        });
      }
      return { outcome: 'advanced' };
    }
    if (node.node_type === 'handoff') {
      await executeHandoff(db, run, node);
      return { outcome: 'handed_off' };
    }
    if (node.node_type === 'end') {
      await logEvent(db, run.id, 'completed', node.node_key);
      await endRun(db, run.id, 'completed', 'end_node');
      return { outcome: 'completed' };
    }
    // Unknown node type — shouldn't happen given the CHECK constraint.
    await logEvent(db, run.id, 'error', node.node_key, {
      reason: `unknown_node_type:${node.node_type}`,
    });
    await endRun(db, run.id, 'failed', 'unknown_node_type');
    return { outcome: 'completed' };
  }
  // Safety break — log + fail.
  await logEvent(db, run.id, 'error', currentKey, {
    reason: 'advance_loop_safety_break',
  });
  await endRun(db, run.id, 'failed', 'advance_loop_overflow');
  return { outcome: 'completed' };
}

/**
 * Optimistic UPDATE — only advance current_node_key when it matches
 * the value we read at the top of dispatch. If another webhook beat
 * us, the row's pointer has already moved and our UPDATE returns
 * zero rows; we treat that as a no-op and let the other run continue.
 */
async function advanceCurrentNodeKey(
  db: AdminClient,
  runId: string,
  expectedOldKey: string | null,
  newKey: string
): Promise<boolean> {
  // PostgREST: when expectedOldKey is null we can't `.eq` (would match
  // any row); use `.is('current_node_key', null)` instead.
  let q = db
    .from('flow_runs')
    .update({
      current_node_key: newKey,
      last_advanced_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .eq('status', 'active');
  if (expectedOldKey === null) {
    q = q.is('current_node_key', null);
  } else {
    q = q.eq('current_node_key', expectedOldKey);
  }
  const { data, error } = await q.select('id');
  if (error) {
    console.error('[flows] advanceCurrentNodeKey error:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

// ============================================================
// Public entry point — the webhook calls this on every inbound.
// ============================================================

export async function dispatchInboundToFlows(
  input: DispatchInboundInput & { isFirstInboundMessage: boolean }
): Promise<DispatchInboundResult> {
  const db = supabaseAdmin();
  try {
    const activeRun = await loadActiveRunForContact(
      db,
      input.accountId,
      input.contactId
    );

    // Idempotency — only matters if there's already a run for this
    // contact. For new runs, the partial unique index catches duplicate
    // starts at INSERT time.
    if (activeRun) {
      const dupe = await isDuplicateInbound(
        db,
        input.accountId,
        input.contactId,
        input.message.meta_message_id
      );
      if (dupe) {
        return {
          consumed: true,
          flow_run_id: activeRun.id,
          outcome: 'duplicate_inbound_ignored',
        };
      }
      // One SELECT for the whole flow's nodes — advance loop is now
      // in-memory. See loadAllNodes.
      const nodes = await loadAllNodes(db, activeRun.flow_id);
      return handleReplyForActiveRun(db, activeRun, input.message, nodes);
    }

    // No active run → look for a flow whose entry trigger matches.
    const flow = await findEntryFlow(
      db,
      input.accountId,
      input.message,
      input.isFirstInboundMessage
    );
    if (!flow || !flow.entry_node_id) {
      return { consumed: false, outcome: 'no_match' };
    }
    const nodes = await loadAllNodes(db, flow.id);
    return startNewRun(db, flow, input, nodes);
  } catch (err) {
    console.error(
      '[flows] dispatchInboundToFlows threw:',
      err instanceof Error ? err.message : err
    );
    return { consumed: false, outcome: 'no_match' };
  }
}

async function handleReplyForActiveRun(
  db: AdminClient,
  run: FlowRunRow,
  message: ParsedInbound,
  nodes: Map<string, FlowNodeRow>
): Promise<DispatchInboundResult> {
  // Note: we intentionally do NOT persist the raw customer text. A
  // `collect_input` prompt that asks "what's your card number?" would
  // otherwise leave the PAN sitting in flow_run_events.payload forever,
  // visible to anyone with access to the runs viewer or the events
  // table. Length is enough for "did they actually reply?" debugging;
  // for the captured value itself, the `node_entered` event already
  // records `captured_key` + `captured_length` after the var is stored.
  await logEvent(db, run.id, 'reply_received', run.current_node_key, {
    meta_message_id: message.meta_message_id,
    reply_kind: message.kind,
    reply_id: message.kind === 'interactive_reply' ? message.reply_id : null,
    text_length: message.kind === 'text' ? message.text.length : null,
  });

  if (!run.current_node_key) {
    // Defensive — a run with status='active' but no current node is
    // malformed. Fail the run rather than spin.
    await endRun(db, run.id, 'failed', 'active_run_missing_current_node');
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: 'no_match',
    };
  }

  const currentNode = nodes.get(run.current_node_key) ?? null;
  if (!currentNode) {
    await endRun(db, run.id, 'failed', 'current_node_not_found');
    return { consumed: true, flow_run_id: run.id, outcome: 'no_match' };
  }

  // Two ways a reply can advance:
  //   1. Interactive button/list tap on a send_buttons/send_list node.
  //   2. Text reply on a collect_input node — capture into vars.
  //
  // Everything else falls through to the fallback policy below.
  let matched: string | null = null;
  if (
    message.kind === 'interactive_reply' &&
    (currentNode.node_type === 'send_buttons' ||
      currentNode.node_type === 'send_list')
  ) {
    matched = matchReplyId(currentNode, message.reply_id);

    /**
     * Record WHICH option was tapped, when the node asks us to.
     *
     * Branching alone loses the answer: the run walks down the right
     * path but nothing stores what the customer chose, so a downstream
     * summary interpolating {{vars.quantity}} came out blank. Opt-in via
     * `var_key` so existing flows are untouched.
     *
     * Stores the visible title, not the reply_id — these vars are read
     * back to humans, and "11–25" beats "qty_11_25".
     *
     * Mirrors the in-memory `run.vars` alongside the UPDATE for the same
     * reason the collect_input branch does: the advance loop interpolates
     * from the local copy and would otherwise need a re-SELECT.
     */
    if (matched) {
      const cfg = currentNode.config as unknown as {
        var_key?: string;
      };
      const varKey = cfg.var_key?.trim();
      if (varKey) {
        const chosen = message.reply_title?.trim() || message.reply_id;
        const newVars = { ...run.vars, [varKey]: chosen };
        const { error: capErr } = await db
          .from('flow_runs')
          .update({ vars: newVars })
          .eq('id', run.id);
        if (capErr) {
          // Non-fatal. Losing the label is a worse summary later, but
          // stranding the customer mid-questionnaire over a bookkeeping
          // write would be worse still — the branch itself is correct.
          await logEvent(db, run.id, 'error', currentNode.node_key, {
            reason: 'choice_capture_failed',
            detail: capErr.message,
          });
        } else {
          run.vars = newVars;
          await logEvent(db, run.id, 'node_entered', currentNode.node_key, {
            captured_key: varKey,
            captured_length: chosen.length,
          });
        }
      }
    }
  } else if (
    message.kind === 'text' &&
    currentNode.node_type === 'collect_input'
  ) {
    const cfg = currentNode.config as unknown as CollectInputNodeConfig;
    const rawText = message.text.trim();
    // AI-powered extraction: uses the node's extraction_prompt (if set)
    // or auto-generates one from var_key. Configurable from the flow
    // editor — no code changes needed.
    const captured = cfg.var_key
      ? await extractCleanValueWithAi(
          run.account_id,
          cfg.var_key,
          rawText,
          cfg.extraction_prompt
        )
      : rawText;
    if (captured.length > 0 && cfg.var_key) {
      // Persist captured value + reset reprompt count atomically.
      const newVars = { ...run.vars, [cfg.var_key]: captured };
      const { error: capErr } = await db
        .from('flow_runs')
        .update({
          vars: newVars,
          reprompt_count: 0,
        })
        .eq('id', run.id);
      if (!capErr) {
        // Mirror the UPDATE in-memory so downstream interpolation in
        // the advance loop sees the captured var without us having to
        // re-SELECT the whole row.
        run.vars = newVars;
        run.reprompt_count = 0;
        await logEvent(db, run.id, 'node_entered', currentNode.node_key, {
          captured_key: cfg.var_key,
          captured_length: captured.length,
        });
        matched = cfg.next_node_key;
      }
    }
  } else if (message.kind === 'text' && currentNode.node_type === 'ai_agent') {
    const cfg = currentNode.config as unknown as AiAgentNodeConfig;
    const { loadAiConfig } = await import('@/lib/ai/config');
    const { buildConversationContext } = await import('@/lib/ai/context');
    const { generateReply } = await import('@/lib/ai/generate');

    const config = await loadAiConfig(db, run.account_id, {
      requireActive: false,
    });
    if (config && run.conversation_id) {
      const messages = await buildConversationContext(db, run.conversation_id);
      const extractionPrompt = `\n\nWhen you have collected all the required information, output the [[HANDOFF]] marker followed immediately by a JSON block containing the collected info. Example: [[HANDOFF]]{\"name\": \"John\", \"email\": \"john@example.com\", \"company\": \"Acme\"}`;

      const { text, handoff, vars } = await generateReply({
        config,
        systemPrompt: (cfg.system_prompt || '') + extractionPrompt,
        messages,
      });

      if (text) {
        await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id,
          contactId: run.contact_id!,
          text,
          // A model wrote these words, so the inbox must say so. Omitting
          // this left every AI-agent reply indistinguishable from a
          // deterministic flow send AND from a human agent's message: the
          // AI badge exists precisely to answer "who wrote this?", and it
          // was dark for the one feature where the answer is not obvious.
          aiGenerated: true,
        });
      }

      if (handoff) {
        if (vars && Object.keys(vars).length > 0) {
          // ── Validate vars against what the customer ACTUALLY said ──
          // The AI is told to output a JSON block with collected info, but
          // nothing previously stopped it from fabricating values the
          // customer never provided. This created fake contact data (e.g.
          // "rahul@test.com" and "XYZ" on a contact that never said
          // either). Now we load the customer's own messages and only
          // accept a value if the customer actually wrote it.
          const { data: customerMsgs } = await db
            .from('messages')
            .select('content_text')
            .eq('conversation_id', run.conversation_id!)
            .eq('sender_type', 'customer')
            .eq('content_type', 'text')
            .order('created_at', { ascending: false })
            .limit(50);

          const customerCorpus = (customerMsgs ?? [])
            .map((m: { content_text: string | null }) => m.content_text ?? '')
            .join(' ')
            .toLowerCase();

          const verified: Record<string, string> = {};
          for (const [key, val] of Object.entries(vars)) {
            if (typeof val !== 'string' || !val.trim()) continue;
            const needle = val.trim().toLowerCase();
            if (customerCorpus.includes(needle)) {
              verified[key] = val.trim();
            } else {
              // The customer never said this value — the AI hallucinated it.
              console.warn(
                `[flow engine] Dropping AI-fabricated var "${key}" = "${val}" — not found in customer messages`
              );
            }
          }

          if (Object.keys(verified).length > 0) {
            const newVars = { ...run.vars, ...verified };
            const { error: capErr } = await db
              .from('flow_runs')
              .update({ vars: newVars })
              .eq('id', run.id);
            if (!capErr) {
              run.vars = newVars;
            }
          }
        }
        matched = cfg.next_node_key;
      } else {
        // AI responded but didn't hand off. Stay on this node and await next user message.
        // We reset reprompt_count so fallback isn't accidentally triggered by normal back-and-forth.
        if (run.reprompt_count !== 0) {
          const { error } = await db
            .from('flow_runs')
            .update({ reprompt_count: 0 })
            .eq('id', run.id);
          if (!error) run.reprompt_count = 0;
        }
        return { consumed: true, flow_run_id: run.id, outcome: 'advanced' };
      }
    }
  }

  if (matched) {
    // Reset reprompt count on a successful match. Skip the write when
    // already 0 — the collect_input capture branch above already
    // zeroed it, and interactive-reply matches against a fresh run
    // (post-prior-reset) are also already 0. The previous re-read of
    // the whole row was needed only because we weren't mirroring the
    // capture UPDATE into the in-memory `run`; now that we do, the
    // local copy is the source of truth.
    if (run.reprompt_count !== 0) {
      const { error } = await db
        .from('flow_runs')
        .update({ reprompt_count: 0 })
        .eq('id', run.id);
      if (!error) run.reprompt_count = 0;
    }
    const outcome = await advanceFromNodeKey(db, run, matched, nodes);
    return {
      consumed: true,
      flow_run_id: run.id,
      outcome: outcome.outcome,
    };
  }

  // No match → fallback. Apply the policy.
  const policy = resolveFallbackPolicy(
    (await loadFlow(db, run.flow_id))?.fallback_policy
  );
  const newReprompts = run.reprompt_count + 1;
  await db
    .from('flow_runs')
    .update({ reprompt_count: newReprompts })
    .eq('id', run.id);

  const action = decideFallback({ policy, reprompt_count: newReprompts });
  await logEvent(db, run.id, 'fallback_fired', run.current_node_key, {
    action: action.type,
    reprompt_count: newReprompts,
  });
  if (action.type === 'ignore') {
    // Don't consume — let automations have a shot at it.
    return { consumed: false, flow_run_id: run.id, outcome: 'no_match' };
  }
  if (action.type === 'reprompt') {
    // Re-send the same prompt. Same node, no current_node_key change.
    if (currentNode.node_type === 'send_buttons') {
      await sendButtonsAndSuspend(db, run, currentNode);
    } else if (currentNode.node_type === 'send_list') {
      await sendListAndSuspend(db, run, currentNode);
    } else if (currentNode.node_type === 'collect_input') {
      // Customer typed something we couldn't accept (empty after trim,
      // or var_key missing — rare). Re-send the prompt so they try again.
      const cfg = currentNode.config as unknown as CollectInputNodeConfig;
      try {
        await engineSendText({
          accountId: run.account_id,
          userId: run.user_id,
          conversationId: run.conversation_id!,
          contactId: run.contact_id!,
          text: interpolateVars(cfg.prompt_text, run.vars),
        });
      } catch (err) {
        await logEvent(db, run.id, 'error', currentNode.node_key, {
          reason: 'reprompt_send_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { consumed: true, flow_run_id: run.id, outcome: 'fallback_fired' };
  }
  if (action.type === 'handoff') {
    if (run.conversation_id) {
      await db
        .from('conversations')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', run.conversation_id);
    }
    await logEvent(db, run.id, 'handoff', run.current_node_key, {
      reason: 'fallback_exhausted',
    });
    await endRun(db, run.id, 'handed_off', 'fallback_exhausted');
    return { consumed: true, flow_run_id: run.id, outcome: 'handed_off' };
  }
  // action.type === 'end'
  await endRun(db, run.id, 'completed', 'fallback_exhausted_end');
  return { consumed: true, flow_run_id: run.id, outcome: 'completed' };
}

async function startNewRun(
  db: AdminClient,
  flow: FlowRow,
  input: DispatchInboundInput,
  nodes: Map<string, FlowNodeRow>
): Promise<DispatchInboundResult> {
  // INSERT — partial unique index `idx_one_active_run_per_contact`
  // catches concurrent inserts with 23505. We catch and return as
  // consumed:true (the parallel webhook handles it).
  const { data: inserted, error: insErr } = await db
    .from('flow_runs')
    .insert({
      flow_id: flow.id,
      // Tenancy: NOT NULL post-017. The partial unique index
      // `idx_one_active_run_per_contact` is over (account_id,
      // contact_id) WHERE status='active', so two accounts sharing
      // a contact phone number each run their own flows independently.
      account_id: flow.account_id,
      // Audit: preserves the flow's author on the run row for log
      // attribution.
      user_id: flow.user_id,
      contact_id: input.contactId,
      conversation_id: input.conversationId,
      status: 'active',
      current_node_key: flow.entry_node_id,
    })
    .select('*')
    .maybeSingle();
  if (insErr) {
    // 23505 = unique_violation → another webhook is starting the run.
    const msg = insErr.message ?? '';
    if (msg.includes('23505') || msg.includes('duplicate key')) {
      return { consumed: true, outcome: 'duplicate_inbound_ignored' };
    }
    console.error('[flows] startNewRun insert error:', insErr.message);
    return { consumed: false, outcome: 'no_match' };
  }
  const run = inserted as FlowRunRow;
  await logEvent(db, run.id, 'started', flow.entry_node_id, {
    flow_id: flow.id,
    trigger_type: flow.trigger_type,
    meta_message_id: input.message.meta_message_id,
  });
  // Bump the flow's execution counter — used by the builder UI to
  // surface "X runs since activation" on the flow card.
  //
  // Atomic RPC (migration 012) rather than read-modify-write: two
  // concurrent webhooks starting runs for different contacts on the
  // same flow would otherwise both read N and both write N+1, losing
  // a count. Mirrors the automations engine's use of
  // `increment_automation_execution_count` (migration 007).
  const { error: incErr } = await db.rpc('increment_flow_execution_count', {
    p_flow_id: flow.id,
  });
  if (incErr) {
    // Non-fatal — the run itself succeeded; only the counter is off.
    console.error('[flows] execution_count rpc error:', incErr.message);
  }

  // Run the advance loop starting from the entry node.
  const outcome = await advanceFromNodeKey(db, run, flow.entry_node_id!, nodes);
  return {
    consumed: true,
    flow_run_id: run.id,
    outcome: outcome.outcome === 'advanced' ? 'started' : outcome.outcome,
  };
}
