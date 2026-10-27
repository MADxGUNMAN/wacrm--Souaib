// ============================================================
// AI connector — tool runtime: definitions, the policy wrapper, results.
//
// Every tool is a ToolDefinition (strict Zod input + output schema and a
// `run` function over the service layer). `withPolicy` wraps `run`:
//
//   1. evaluateToolAccess — the same check that filters tools/list
//   2. step-up challenge in the result `_meta` (ChatGPT / Codex style;
//      Claude gets an HTTP 403 from the route before the SDK runs)
//   3. 15 s timeout
//   4. error mapping — known service errors become actionable messages,
//      anything else a short reference id that maps to the server log
//   5. one audit row per call (pushed to a sink; the route writes them
//      after the response is sent)
//
// Plan: docs/ai-connector/03-tools.md §1, §7; 02-security.md §3.3–3.6.
// ============================================================

import { randomBytes } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ServiceError, type ServiceContext } from '@/lib/services/context';
import type { PrivilegedOps } from '@/lib/services/privileged';
import type { AuditEntry } from '../audit';
import type { AiConnectorConfig } from '../config';
import { insufficientScopeChallenge } from '../gate';
import type { GateContext } from '../gate';
import { stepUpStyleFor } from '../platforms';
import { evaluateToolAccess, type AccessDecision } from '../policy';
import type { ToolName } from '../tool-catalog';

export const TOOL_TIMEOUT_MS = 15_000;

/**
 * Changes to THIS connection only (restrict_my_permissions, disconnect).
 * Bound by the route to the gate's connection id, so a tool can never
 * name another connection. Backed by the service-role client because
 * ai_connections has no write grant for the AI's JWT.
 */
export interface ConnectionControl {
  saveSettings(next: GateContext['settings']): Promise<void>;
  revoke(): Promise<void>;
  /** Two-step (D9): store a preview bound to this connection + tool + args. */
  createConfirmation(
    tool: string,
    args: unknown,
    preview: unknown
  ): Promise<{ id: string; expiresAt: Date }>;
  /**
   * Use a confirmation once. Returns its stored preview, or null when
   * wrong, expired or already used.
   */
  consumeConfirmation(
    id: string,
    tool: string,
    args: unknown
  ): Promise<{ preview: unknown } | null>;
}

export interface ToolEnv {
  gate: GateContext;
  service: ServiceContext;
  config: Pick<AiConnectorConfig, 'issuer' | 'mcpUrl'>;
  connection: ConnectionControl;
  /** Service-role operations bound to this account + connection (sends). */
  privileged: PrivilegedOps;
  now: Date;
}

export interface ToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  name: ToolName;
  title: string;
  description: string;
  input: I;
  output: O;
  /** Extra descriptor `_meta` (e.g. `openai/profile`). */
  meta?: Record<string, unknown>;
  /** Repeating the call has no extra effect (defaults to read-only). */
  idempotent?: boolean;
  /** Record ids this call changed, for the audit row (02 §3.6). */
  affectedIds?: (input: z.infer<I>, output: z.infer<O>) => string[];
  run(input: z.infer<I>, env: ToolEnv): Promise<z.infer<O>>;
}

/** Identity helper so each tool file gets full type inference. */
export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(
  def: ToolDefinition<I, O>
): ToolDefinition<I, O> {
  return def;
}

export type AuditSink = (entry: AuditEntry) => void;

/** Access decision for `tool` under this request's gate context. */
export function decide(tool: ToolName, gate: GateContext): AccessDecision {
  return evaluateToolAccess({
    tool,
    grantedScopes: gate.scopes,
    settings: gate.settings,
    policy: gate.policy,
    role: gate.role,
    memberPermissions: gate.memberPermissions,
    platform: gate.platform,
    account: gate.account,
  });
}

export function referenceId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function errorResult(
  message: string,
  meta?: Record<string, unknown>
): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    ...(meta ? { _meta: meta } : {}),
  };
}

export function okResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
}

class ToolTimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new ToolTimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The SDK callback for `def`, with every check, mapping and audit applied. */
export function withPolicy<I extends z.ZodObject, O extends z.ZodObject>(
  def: ToolDefinition<I, O>,
  env: Omit<ToolEnv, 'now'>,
  audit: AuditSink,
  opts: { timeoutMs?: number; now?: () => Date } = {}
): (args: z.infer<I>) => Promise<CallToolResult> {
  return async (args) => {
    const started = Date.now();
    const base = {
      accountId: env.gate.accountId,
      connectionId: env.gate.connectionId,
      userId: env.gate.userId,
      platform: env.gate.platform,
      action: def.name,
      args,
    } as const;

    const decision = decide(def.name, env.gate);
    if (!decision.allowed) {
      audit({
        ...base,
        outcome: 'denied',
        denyReason: decision.code,
        durationMs: Date.now() - started,
      });
      const fix = decision.fixPath
        ? ` Manage it here: ${env.config.issuer}${decision.fixPath}`
        : '';
      if (
        decision.layer === 'scope' &&
        stepUpStyleFor(env.gate.platform) === 'tool_meta'
      ) {
        return errorResult(decision.message, {
          'mcp/www_authenticate': [
            insufficientScopeChallenge(
              env.config,
              decision.requiredScopes ?? [],
              decision.message
            ),
          ],
        });
      }
      return errorResult(decision.message + fix);
    }

    try {
      const out = await withTimeout(
        def.run(args, { ...env, now: opts.now?.() ?? new Date() }),
        opts.timeoutMs ?? TOOL_TIMEOUT_MS
      );
      const pending =
        (out as { confirmation_required?: unknown }).confirmation_required ===
        true;
      audit({
        ...base,
        outcome: pending ? 'confirmation_required' : 'ok',
        affectedIds: pending ? [] : (def.affectedIds?.(args, out) ?? []),
        durationMs: Date.now() - started,
      });
      return okResult(out as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ServiceError && err.code !== 'internal') {
        audit({
          ...base,
          outcome: 'error',
          denyReason: err.code,
          durationMs: Date.now() - started,
        });
        const hint =
          err.code === 'not_found'
            ? `${err.message}. It may have been deleted, or it isn't in this workspace. Search again to get a current id.`
            : `${err.message}.`;
        return errorResult(hint);
      }
      const ref = referenceId();
      const timedOut = err instanceof ToolTimeoutError;
      console.error(
        `[ai-connector] tool ${def.name} failed (ref ${ref}):`,
        timedOut ? 'timeout' : err instanceof Error ? err.message : 'unknown'
      );
      audit({
        ...base,
        outcome: 'error',
        denyReason: timedOut ? `timeout (ref ${ref})` : `internal (ref ${ref})`,
        durationMs: Date.now() - started,
      });
      return errorResult(
        timedOut
          ? `Replai took too long to answer. Please try again (ref ${ref}).`
          : `Something went wrong on Replai's side (ref ${ref}). Please try again.`
      );
    }
  };
}

// ------------------------------------------------------------
// Untrusted text
// ------------------------------------------------------------

// Control characters except tab and newline; bidi overrides used to
// disguise text.
const UNSAFE_CHARS =
  /[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Customer- or third-party-written text, cleaned and length-capped. The
 * caller puts it in a field named `untrusted_text` (or lists the field in
 * `untrusted_fields`) so the server instructions can tell the model it is
 * data, never instructions (02 §3.4).
 */
export function untrusted(value: unknown, max = 2000): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(UNSAFE_CHARS, '').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Zod helpers shared by tool schemas. */
export const zId = z.string().uuid();
export const zLimit = z.number().int().min(1).max(50).optional();
export const zCursor = z.string().min(1).max(500).optional();
export const zNextCursor = z.string().nullable();
