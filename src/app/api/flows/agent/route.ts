import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { loadAiConfig } from '@/lib/ai/config';
import { AiError, type ChatMessage } from '@/lib/ai/types';
import { runFlowAgentTurn, type AgentTemplate } from '@/lib/flows/agent';

export const dynamic = 'force-dynamic';

/**
 * Keep the transcript bounded. Authoring conversations are short — a
 * request, maybe a clarification, then the flow — and every turn carries
 * a full flow document, so an unbounded history would blow the context
 * window on the user's own key.
 */
const MAX_TURNS = 12;

/** Guard against a pasted essay eating the context window. */
const MAX_MESSAGE_CHARS = 8000;

/**
 * POST /api/flows/agent  (member+)
 *
 * One turn of the flow-building agent. Reads the account's OWN provider
 * config, gives the model the real template list, and returns either
 * prose (a question, or a refusal with a template spec) or a VALIDATED
 * flow document the client can hand straight to `POST /api/flows/import`.
 *
 * Validation happens here with the same `parsePortableFlow` the import
 * route uses, so a document this endpoint returns is one import accepts.
 *
 * Stateless: the client sends the running transcript each turn, matching
 * `POST /api/ai/playground`.
 *
 * Deliberately does NOT touch `claim_ai_reply_slot` — that budget is a
 * per-conversation cap on the customer-facing auto-reply bot, and
 * authoring a flow has no conversation and must not spend it.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('member');

    // Two buckets, as on the draft route: one so a single user cannot
    // hold the button down, one so a whole team cannot collectively melt
    // the account's shared BYO key. Authoring calls are large, so this
    // matters more here than on a chat reply.
    const perUser = checkRateLimit(`flow-agent:${userId}`, RATE_LIMITS.aiDraft);
    if (!perUser.success) return rateLimitResponse(perUser);
    const perAccount = checkRateLimit(
      `flow-agent-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount
    );
    if (!perAccount.success) return rateLimitResponse(perAccount);

    const body = await request.json().catch(() => null);
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
    if (!rawMessages) {
      return NextResponse.json(
        { error: 'messages is required' },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = rawMessages
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === 'object' &&
          ((m as ChatMessage).role === 'user' ||
            (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string' &&
          (m as ChatMessage).content.trim().length > 0
      )
      .slice(-MAX_TURNS)
      .map((m: ChatMessage) => ({
        role: m.role,
        content: m.content.slice(0, MAX_MESSAGE_CHARS),
      }));

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Describe the conversation you want to automate.' },
        { status: 400 }
      );
    }

    // requireActive:false, same as the playground: authoring a flow is
    // not customer-facing, so it should work before the master switch is
    // flipped on.
    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch((err) => {
      console.error('[flows/agent] loadAiConfig error:', err);
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error:
            'No AI provider configured yet. Add your provider and API key under Agents → Setup, then come back.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }

    // Approved AND pending: users build the flow while the template is
    // still in review, and hiding pending ones would push them to
    // re-specify a template that already exists. RLS scopes this to the
    // account; the explicit filter is belt-and-braces.
    const { data: templateRows } = await supabase
      .from('message_templates')
      .select(
        'name, language, category, status, body_text, header_type, buttons'
      )
      .eq('account_id', accountId)
      .in('status', ['APPROVED', 'PENDING'])
      .order('status', { ascending: true })
      .limit(60);

    const templates = (templateRows ?? []) as AgentTemplate[];

    const result = await runFlowAgentTurn({ config, messages, templates });

    return NextResponse.json({
      reply: result.reply,
      flow: result.flow ?? null,
      warnings: result.warnings,
      issues: result.issues ?? null,
      attempts: result.attempts,
      provider: config.provider,
      model: config.model,
    });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    return toErrorResponse(err);
  }
}
