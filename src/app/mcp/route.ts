// ============================================================
// POST /mcp — Replai's remote MCP server for Claude and ChatGPT.
//
// Order of checks (all before the MCP SDK runs):
//   feature on → Origin allowlist → per-IP limit → 256 KB cap → JSON,
//   no batches → bearer gate (401 + WWW-Authenticate) → per-connection
//   limit → Claude-style step-up (403 + insufficient_scope).
// Then a fresh McpServer + stateless JSON transport handles the message.
// Audit rows and the last-used touch are written after the response.
// Plan: docs/ai-connector/01-architecture.md §5, 02-security.md §3.3.
// ============================================================

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { after, NextResponse } from 'next/server';
import type { AuditEntry } from '@/lib/ai-connector/audit';
import { writeAudit } from '@/lib/ai-connector/audit';
import { getConfig } from '@/lib/ai-connector/config';
import {
  consumeConfirmation,
  createConfirmation,
} from '@/lib/ai-connector/confirmations';
import {
  gateDeps,
  insufficientScopeChallenge,
  isAllowedMcpOrigin,
  runGate,
  userServiceContext,
} from '@/lib/ai-connector/gate';
import { getClientIp } from '@/lib/ai-connector/http';
import { decide, type ConnectionControl } from '@/lib/ai-connector/mcp/runtime';
import { buildMcpServer } from '@/lib/ai-connector/mcp/server';
import { stepUpStyleFor } from '@/lib/ai-connector/platforms';
import { privilegedOps } from '@/lib/ai-connector/privileged';
import {
  adminDb,
  findAccessToken,
  getClientById,
  getConnection,
  revokeConnection,
} from '@/lib/ai-connector/store';
import { isToolName } from '@/lib/ai-connector/tool-catalog';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getCachedGateConfig } from '@/lib/subscription/gate-cache';
import { resolveSubscriptionState } from '@/lib/subscription/status';

const MAX_BODY_BYTES = 256 * 1024;
const TOUCH_INTERVAL_MS = 60_000;

function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
        Vary: 'Origin',
      }
    : {};
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  origin: string | null,
  extra: Record<string, string> = {},
  id: unknown = null
) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeaders(origin),
        ...extra,
      },
    }
  );
}

function rateLimited(retryAt: number, origin: string | null) {
  const retry = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  return jsonRpcError(
    429,
    -32000,
    'Too many requests. Slow down and try again.',
    origin,
    {
      'Retry-After': String(retry),
    }
  );
}

export async function POST(request: Request) {
  const config = getConfig();
  const origin = request.headers.get('origin');
  if (!config.enabled) {
    return jsonRpcError(
      503,
      -32000,
      'The Replai AI connector is not available.',
      null,
      { 'Retry-After': '300' }
    );
  }
  if (!isAllowedMcpOrigin(origin, config))
    return jsonRpcError(403, -32000, 'Origin not allowed.', null);

  const ipLimit = checkRateLimit(
    `mcp-ip:${getClientIp(request)}`,
    RATE_LIMITS.mcpIp
  );
  if (!ipLimit.success) return rateLimited(ipLimit.reset, origin);

  // Body: capped, JSON, one message (JSON-RPC batches were removed from MCP).
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) {
    return jsonRpcError(413, -32600, 'Request too large.', origin);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES)
    return jsonRpcError(413, -32600, 'Request too large.', origin);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonRpcError(400, -32700, 'Parse error.', origin);
  }
  if (Array.isArray(body))
    return jsonRpcError(
      400,
      -32600,
      'Batch requests are not supported.',
      origin
    );
  if (!body || typeof body !== 'object')
    return jsonRpcError(400, -32600, 'Invalid request.', origin);
  const message = body as {
    id?: unknown;
    method?: unknown;
    params?: { name?: unknown };
  };

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey)
    return jsonRpcError(
      503,
      -32000,
      'The Replai AI connector is not available.',
      origin
    );

  const db = adminDb();
  let gate;
  try {
    gate = await runGate(
      request,
      config,
      gateDeps(db, config, {
        findAccessToken,
        getConnection,
        getClientById,
        isSubscriptionBlocked: async (account) =>
          resolveSubscriptionState(account, await getCachedGateConfig())
            .isBlocked,
      })
    );
  } catch (err) {
    console.error(
      '[ai-connector] mcp gate failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return jsonRpcError(
      500,
      -32603,
      "Something went wrong on Replai's side. Please try again.",
      origin
    );
  }
  if (!gate.ok) {
    return jsonRpcError(
      401,
      -32001,
      'Sign in to Replai to continue.',
      origin,
      {
        'WWW-Authenticate': gate.challenge,
      },
      message.id
    );
  }
  const ctx = gate.ctx;

  const connLimit = checkRateLimit(
    `mcp-conn:${ctx.connectionId}`,
    RATE_LIMITS.mcpConnection
  );
  if (!connLimit.success) return rateLimited(connLimit.reset, origin);

  // Claude re-consents only on an HTTP 403 challenge (Phase 0, S4), so a
  // missing scope is answered here, before the SDK. ChatGPT gets the
  // in-result `_meta` challenge from withPolicy instead.
  const toolName =
    message.method === 'tools/call' ? message.params?.name : undefined;
  if (isToolName(toolName) && stepUpStyleFor(ctx.platform) === 'http_403') {
    const d = decide(toolName, ctx);
    if (!d.allowed && d.layer === 'scope') {
      return jsonRpcError(
        403,
        -32001,
        d.message,
        origin,
        {
          'WWW-Authenticate': insufficientScopeChallenge(
            config,
            d.requiredScopes ?? [],
            d.message
          ),
        },
        message.id
      );
    }
  }

  const audits: AuditEntry[] = [];
  const service = userServiceContext(ctx, config, anonKey);
  // Bound to this request's connection id: tools can't name another one.
  const connection: ConnectionControl = {
    async saveSettings(next) {
      const { error } = await db
        .from('ai_connections')
        .update({ settings: next, updated_at: new Date().toISOString() })
        .eq('id', ctx.connectionId)
        .is('revoked_at', null);
      if (error) throw new Error(`settings save failed: ${error.message}`);
    },
    createConfirmation: (tool, args, preview) =>
      createConfirmation(db, {
        connectionId: ctx.connectionId,
        tool,
        args,
        preview,
      }),
    async consumeConfirmation(id, tool, args) {
      const r = await consumeConfirmation(db, {
        id,
        connectionId: ctx.connectionId,
        tool,
        args,
      });
      return r.ok ? { preview: r.preview } : null;
    },
    revoke: () => revokeConnection(db, ctx.connectionId, 'user', ctx.userId),
  };
  const privileged = privilegedOps(db, ctx);
  const server = buildMcpServer(
    { gate: ctx, service, config, connection, privileged },
    (entry) => audits.push(entry)
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let response: Response;
  try {
    await server.connect(transport);
    response = await transport.handleRequest(request, { parsedBody: body });
  } catch (err) {
    console.error(
      '[ai-connector] mcp request failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    response = jsonRpcError(
      500,
      -32603,
      "Something went wrong on Replai's side. Please try again.",
      origin
    );
  }

  after(async () => {
    await Promise.all(audits.map((entry) => writeAudit(db, entry)));
    const last = ctx.lastUsedAt ? Date.parse(ctx.lastUsedAt) : 0;
    if (Date.now() - last > TOUCH_INTERVAL_MS) {
      await db
        .from('ai_connections')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', ctx.connectionId);
    }
    await server.close().catch(() => {});
  });

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function methodNotAllowed() {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method not allowed. Use POST.' },
    },
    {
      status: 405,
      headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' },
    }
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const config = getConfig();
  if (!config.enabled || !isAllowedMcpOrigin(origin, config))
    return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id',
      'Access-Control-Max-Age': '600',
    },
  });
}
