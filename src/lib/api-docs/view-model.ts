// ============================================================
// The server → client bridge for the API reference page.
//
// ─── Why a view model exists at all ──────────────────────────────
//
// `spec.ts` deliberately imports the LIVE constants it documents, so the
// docs cannot drift from the code: the rate limit comes from
// `@/lib/rate-limit`, the pagination bounds from `@/lib/api/v1/pagination`,
// the webhook thresholds from `@/lib/webhooks/deliver`. Those modules
// reach `next/server`, `Buffer`, and `node:crypto` respectively — all
// server-only. Importing `spec.ts` from a `'use client'` component would
// therefore drag Node built-ins into the browser bundle and fail the
// build.
//
// The alternative — copying the constants into a client-safe spec and
// asserting equality in a test — was rejected: it puts a second copy of
// every number in the tree and only catches drift when someone runs the
// suite. Serializing a view model on the server keeps ONE copy, keeps
// the live imports, and ships the browser nothing but plain JSON.
//
// So: this module runs on the server, flattens the spec into plain
// serializable data (including every code sample, pre-generated), and
// the client component renders it without importing the spec at all.
//
// Everything here is pure. Pass the base URL in; never read a header or
// an env var from this module, so it stays unit-testable.
// ============================================================

import {
  API_GROUPS,
  API_KEY_PREFIX,
  PAGINATION,
  RATE_LIMIT,
  SAMPLE_API_KEY,
  SCOPE_SPECS,
  SHARED_ERROR_CODES,
  WEBHOOK_DELIVERY,
  WEBHOOK_EVENT_SPECS,
  childrenAreArrayItems,
  type BodyFieldSpec,
  type EndpointSpec,
} from './spec';
import {
  SAMPLE_LANGUAGES,
  generateAllSamples,
  sampleUrl,
  type SampleLanguageId,
} from './code-samples';
import { buildAgentPrompt } from './agent-prompt';

export interface ParamRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface BodyRow {
  /** Dotted path, e.g. `template.name` or `recipients[].to`. */
  path: string;
  /** Leaf name, for a compact display. */
  name: string;
  /** Nesting level, so the table can indent instead of relying on dots. */
  depth: number;
  type: string;
  required: boolean;
  description: string;
}

export interface ResponseRow {
  status: number;
  description: string;
  /** Pretty-printed JSON, or null when the spec gives no example. */
  exampleJson: string | null;
}

export interface ErrorRow {
  code: string;
  status: number;
  description: string;
}

export interface EndpointView {
  id: string;
  method: string;
  path: string;
  title: string;
  summary: string;
  scope: string | null;
  paginated: boolean;
  /** Fully resolved sample URL, ids substituted. */
  url: string;
  pathParams: ParamRow[];
  queryParams: ParamRow[];
  bodyFields: BodyRow[];
  responses: ResponseRow[];
  errors: ErrorRow[];
  notes: string[];
  /** One runnable snippet per language, so switching needs no round trip. */
  samples: Record<SampleLanguageId, string>;
}

export interface GroupView {
  id: string;
  title: string;
  description: string;
  endpoints: EndpointView[];
}

export interface LanguageView {
  id: SampleLanguageId;
  label: string;
  highlight: string;
}

export interface WebhookView {
  events: { name: string; description: string }[];
  signatureHeader: string;
  eventHeader: string;
  idHeader: string;
  signatureFormat: string;
  signedPayload: string;
  algorithm: string;
  toleranceSeconds: number;
  timeoutMs: number;
  maxConsecutiveFailures: number;
  examplePayloadJson: string;
  notes: string[];
}

export interface ApiReferenceView {
  baseUrl: string;
  sampleApiKey: string;
  keyPrefix: string;
  languages: LanguageView[];
  groups: GroupView[];
  scopes: { name: string; description: string; endpointIds: string[] }[];
  errorCodes: ErrorRow[];
  rateLimit: { limit: number; windowSeconds: number; headers: string[] };
  pagination: { defaultLimit: number; maxLimit: number };
  webhooks: WebhookView;
  /** Quick-start snippets for `GET /api/v1/me`, per language. */
  quickStart: Record<SampleLanguageId, string>;
  /**
   * The whole-API AI brief. Pre-built because the client cannot import
   * the builder (it reaches the spec, and so the server-only modules).
   */
  agentPrompt: string;
}

/**
 * Flatten nested body fields into indentable rows.
 *
 * A field whose type is an array (`object[]`) contributes `parent[].child`
 * for its children, because that is the shape the caller actually
 * constructs — `recipients.to` would be a lie.
 */
function flattenBody(
  fields: BodyFieldSpec[],
  depth = 0,
  prefix = ''
): BodyRow[] {
  return fields.flatMap((field) => {
    const path = `${prefix}${field.name}`;
    const row: BodyRow = {
      path,
      name: field.name,
      depth,
      type: field.type,
      required: field.required,
      description: field.description,
    };
    const childPrefix = childrenAreArrayItems(field.type)
      ? `${path}[].`
      : `${path}.`;
    return [row, ...flattenBody(field.children ?? [], depth + 1, childPrefix)];
  });
}

function toParamRows(
  params: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[]
): ParamRow[] {
  return params.map((p) => ({
    name: p.name,
    type: p.type,
    required: p.required,
    description: p.description,
  }));
}

function toEndpointView(endpoint: EndpointSpec, baseUrl: string): EndpointView {
  return {
    id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    title: endpoint.title,
    summary: endpoint.summary,
    scope: endpoint.scope,
    paginated: Boolean(endpoint.paginated),
    url: sampleUrl(endpoint, baseUrl),
    pathParams: toParamRows(endpoint.pathParams ?? []),
    queryParams: toParamRows(endpoint.queryParams ?? []),
    bodyFields: flattenBody(endpoint.bodyFields ?? []),
    responses: endpoint.responses.map((r) => ({
      status: r.status,
      description: r.description,
      exampleJson: r.example ? JSON.stringify(r.example, null, 2) : null,
    })),
    errors: endpoint.errors ?? [],
    notes: endpoint.notes ?? [],
    samples: generateAllSamples(endpoint, { baseUrl }),
  };
}

/**
 * Build everything the reference page needs, as plain JSON.
 *
 * `baseUrl` should be the origin the reader's integration will call, so
 * the snippets are copy-runnable rather than pointing at a placeholder.
 */
export function buildApiReferenceView(baseUrl: string): ApiReferenceView {
  const meEndpoint = API_GROUPS.flatMap((g) => g.endpoints).find(
    (e) => e.id === 'get-me'
  );

  return {
    baseUrl,
    sampleApiKey: SAMPLE_API_KEY,
    keyPrefix: API_KEY_PREFIX,
    languages: SAMPLE_LANGUAGES.map((l) => ({
      id: l.id,
      label: l.label,
      highlight: l.highlight,
    })),
    groups: API_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      endpoints: group.endpoints.map((e) => toEndpointView(e, baseUrl)),
    })),
    scopes: SCOPE_SPECS.map((s) => ({
      name: s.name,
      description: s.description,
      endpointIds: s.endpointIds,
    })),
    errorCodes: SHARED_ERROR_CODES.map((e) => ({
      code: e.code,
      status: e.status,
      description: e.description,
    })),
    rateLimit: {
      limit: RATE_LIMIT.limit,
      windowSeconds: RATE_LIMIT.windowSeconds,
      headers: [...RATE_LIMIT.headers],
    },
    pagination: {
      defaultLimit: PAGINATION.defaultLimit,
      maxLimit: PAGINATION.maxLimit,
    },
    webhooks: {
      events: WEBHOOK_EVENT_SPECS.map((e) => ({
        name: e.name,
        description: e.description,
      })),
      signatureHeader: WEBHOOK_DELIVERY.signatureHeader,
      eventHeader: WEBHOOK_DELIVERY.eventHeader,
      idHeader: WEBHOOK_DELIVERY.idHeader,
      signatureFormat: WEBHOOK_DELIVERY.signatureFormat,
      signedPayload: WEBHOOK_DELIVERY.signedPayload,
      algorithm: WEBHOOK_DELIVERY.algorithm,
      toleranceSeconds: WEBHOOK_DELIVERY.recommendedToleranceSeconds,
      timeoutMs: WEBHOOK_DELIVERY.timeoutMs,
      maxConsecutiveFailures: WEBHOOK_DELIVERY.maxConsecutiveFailures,
      examplePayloadJson: JSON.stringify(
        WEBHOOK_DELIVERY.examplePayload,
        null,
        2
      ),
      notes: [...WEBHOOK_DELIVERY.notes],
    },
    quickStart: meEndpoint
      ? generateAllSamples(meEndpoint, { baseUrl })
      : ({} as Record<SampleLanguageId, string>),
    agentPrompt: buildAgentPrompt({ baseUrl }),
  };
}

/**
 * Resolve the origin to show in snippets.
 *
 * Order mirrors `getBaseUrl` in the invitations route, which is this
 * codebase's existing convention: an explicit operator setting wins,
 * then the proxy's forwarded host, then the request host. Falls back to
 * a clearly-fake placeholder rather than a real domain, so a reader can
 * see at a glance that it needs replacing.
 */
export function resolveDocsBaseUrl(input: {
  envUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
  fallback: string;
}): string {
  const explicit = input.envUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const forwardedHost = input.forwardedHost?.split(',')[0]?.trim();
  if (forwardedHost) {
    const proto = input.forwardedProto?.split(',')[0]?.trim() || 'https';
    return `${proto}://${forwardedHost}`;
  }

  const host = input.host?.trim();
  if (host) {
    // Localhost is the one case where http is the right guess; anything
    // else behind no proxy is assumed to be served over TLS.
    const proto = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
      ? 'http'
      : 'https';
    return `${proto}://${host}`;
  }

  return input.fallback.replace(/\/+$/, '');
}
