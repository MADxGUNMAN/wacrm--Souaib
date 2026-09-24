// ============================================================
// "Copy as AI agent prompt" — build a self-contained integration brief.
//
// The output is pasted into ChatGPT / Claude / Cursor / Copilot, where
// the agent has NO access to this codebase and cannot ask us anything.
// So the brief has to carry every fact needed to write working code on
// the first try: base URL, auth, the response envelope, the error
// vocabulary, rate limits, the pagination loop, every endpoint with its
// scope and body shape, and the webhook signature algorithm.
//
// ─── Why this is generated, not written ──────────────────────────
//
// A hand-written prompt is a third copy of the API contract (after the
// handlers and the docs page) and would rot fastest, because nothing
// renders it — nobody notices it went stale. Generating it from the
// same spec the reference page uses means it cannot disagree with the
// docs, and spec.test.ts already forces the spec to agree with the
// route handlers.
//
// ─── What the wording is doing ───────────────────────────────────
//
// The instructions are deliberately imperative and closed ("do not ask
// follow-up questions", "never invent an endpoint"). Left open, agents
// reliably do two things that produce broken integrations: they invent
// plausible-but-absent endpoints (`/api/v1/messages/{id}` is a common
// one), and they retry 4xx failures that can never succeed. Both are
// called out explicitly below.
// ============================================================

import {
  API_GROUPS,
  PAGINATION,
  RATE_LIMIT,
  SCOPE_SPECS,
  SHARED_ERROR_CODES,
  WEBHOOK_DELIVERY,
  WEBHOOK_EVENT_SPECS,
  childrenAreArrayItems,
  endpointLabel,
  type BodyFieldSpec,
  type EndpointSpec,
} from './spec';
import {
  DEFAULT_BASE_URL,
  SAMPLE_LANGUAGES,
  generateSample,
  type SampleLanguageId,
} from './code-samples';

export interface AgentPromptOptions {
  /** Origin the integration will call. */
  baseUrl?: string;
  /**
   * Language for the worked example. The brief describes the API in
   * language-neutral terms, then anchors it with one real snippet.
   */
  language?: SampleLanguageId;
  /**
   * Narrow the brief to these endpoint ids. Omit for the whole API —
   * the default, because the point is that the agent needs nothing else.
   */
  endpointIds?: string[];
  /** Optional sentence about what the developer is building. */
  goal?: string;
}

// ───────────────────────── helpers ─────────────────────────

/** A markdown table, or a plain note when there are no rows. */
function table(headers: string[], rows: string[][], empty: string): string[] {
  if (rows.length === 0) return [empty];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
}

/** Flatten nested body fields into dotted rows, e.g. `template.name`. */
function flattenFields(
  fields: BodyFieldSpec[],
  prefix = ''
): Array<{ path: string; field: BodyFieldSpec }> {
  return fields.flatMap((field) => {
    const path = `${prefix}${field.name}`;
    return [
      { path, field },
      // `recipients[].to` reads as an array element, which is what the
      // caller actually has to build. Shared with the reference table via
      // spec.ts — this check used to be duplicated here, so one wrong
      // implementation shipped to both surfaces at once.
      ...flattenFields(
        field.children ?? [],
        childrenAreArrayItems(field.type) ? `${path}[].` : `${path}.`
      ),
    ];
  });
}

function renderEndpoint(endpoint: EndpointSpec): string[] {
  const out: string[] = [`### ${endpointLabel(endpoint)}`, ''];
  out.push(endpoint.summary, '');
  out.push(
    `- Required scope: ${endpoint.scope ? `\`${endpoint.scope}\`` : 'none (any valid key)'}`
  );
  if (endpoint.paginated) {
    out.push('- Paginated: yes, keyset via `meta.next_cursor`');
  }
  out.push('');

  if (endpoint.pathParams?.length) {
    out.push('Path parameters:');
    out.push(
      ...table(
        ['name', 'type', 'description'],
        endpoint.pathParams.map((p) => [
          `\`${p.name}\``,
          p.type,
          p.description,
        ]),
        '- none'
      )
    );
    out.push('');
  }

  if (endpoint.queryParams?.length) {
    out.push('Query parameters:');
    out.push(
      ...table(
        ['name', 'type', 'required', 'description'],
        endpoint.queryParams.map((p) => [
          `\`${p.name}\``,
          p.type,
          p.required ? 'yes' : 'no',
          p.description,
        ]),
        '- none'
      )
    );
    out.push('');
  }

  if (endpoint.bodyFields?.length) {
    out.push('Request body:');
    out.push(
      ...table(
        ['field', 'type', 'required', 'description'],
        flattenFields(endpoint.bodyFields).map(({ path, field }) => [
          `\`${path}\``,
          field.type,
          field.required ? 'yes' : 'no',
          field.description,
        ]),
        '- none'
      )
    );
    out.push('');
  }

  out.push('Responses:');
  for (const response of endpoint.responses) {
    out.push(`- \`${response.status}\` — ${response.description}`);
  }
  out.push('');

  const example = endpoint.responses.find((r) => r.example)?.example;
  if (example) {
    out.push('Example response:');
    out.push('```json');
    out.push(JSON.stringify(example, null, 2));
    out.push('```');
    out.push('');
  }

  if (endpoint.errors?.length) {
    out.push('Endpoint-specific errors:');
    for (const error of endpoint.errors) {
      out.push(`- \`${error.code}\` (${error.status}) — ${error.description}`);
    }
    out.push('');
  }

  if (endpoint.notes?.length) {
    out.push('Important:');
    for (const note of endpoint.notes) out.push(`- ${note}`);
    out.push('');
  }

  return out;
}

// ───────────────────────── builder ─────────────────────────

/**
 * Build the full brief. Deterministic for a given set of options, so
 * the tests can assert on it and the button copies the same text every
 * time.
 */
export function buildAgentPrompt(options: AgentPromptOptions = {}): string {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const language = options.language ?? 'node';
  const languageLabel =
    SAMPLE_LANGUAGES.find((l) => l.id === language)?.label ?? language;

  const groups = options.endpointIds
    ? API_GROUPS.map((g) => ({
        ...g,
        endpoints: g.endpoints.filter((e) =>
          options.endpointIds!.includes(e.id)
        ),
      })).filter((g) => g.endpoints.length > 0)
    : API_GROUPS;

  const endpoints = groups.flatMap((g) => g.endpoints);
  const lines: string[] = [];

  // ── Framing ──
  lines.push(
    '# Replai WhatsApp CRM — public REST API (v1) integration brief',
    '',
    'You are helping a developer integrate with the Replai WhatsApp CRM public REST API.',
    'This brief is complete and self-contained: it lists every endpoint, its required',
    'scope, its request and response shapes, the error vocabulary, the rate limit, the',
    'pagination scheme, and the webhook signature algorithm.',
    '',
    'Work from this document only. Do not ask follow-up questions about the API, and do',
    'not invent endpoints, fields, or query parameters that are not listed here — if a',
    'capability is absent, say so instead of guessing at a URL.',
    ''
  );

  if (options.goal) {
    lines.push(`What the developer wants to build: ${options.goal}`, '');
  }

  // ── Connection ──
  lines.push(
    '## 1. Connection and authentication',
    '',
    `- Base URL: \`${baseUrl}\``,
    '- Every endpoint is under `/api/v1`.',
    '- Authenticate with a bearer token: `Authorization: Bearer <API_KEY>`.',
    '- API keys look like `wacrm_live_...`. They are created in the CRM under Settings → API keys, and the full key is shown only once at creation.',
    '- A key is bound to ONE account. It can never read or write another account\u2019s data.',
    '- Send `Content-Type: application/json` on any request with a body.',
    '- Scopes are fixed when the key is created. To add a capability, mint a new key.',
    '- Never put an API key in client-side code, a mobile app, or a public repository. Call from a server you control.',
    ''
  );

  // ── Envelope ──
  lines.push(
    '## 2. Response envelope',
    '',
    'Every response uses one of three shapes, so a single parser handles all of them.',
    '',
    'Success:',
    '```json',
    '{ "data": { "...": "..." } }',
    '```',
    '',
    'List (paginated):',
    '```json',
    '{ "data": [], "meta": { "next_cursor": null } }',
    '```',
    '',
    'Failure:',
    '```json',
    '{ "error": { "code": "bad_request", "message": "Human readable explanation" } }',
    '```',
    '',
    'Branch on the HTTP status first, then on `error.code`. `error.code` is stable and safe',
    'to match in code; `error.message` is for humans and may be reworded at any time.',
    ''
  );

  // ── Errors ──
  lines.push('## 3. Error codes', '');
  lines.push(
    ...table(
      ['code', 'status', 'meaning'],
      SHARED_ERROR_CODES.map((e) => [
        `\`${e.code}\``,
        String(e.status),
        e.description,
      ]),
      '- none'
    )
  );
  lines.push(
    '',
    'Some endpoints add domain-specific codes; those are listed with the endpoint below.',
    'Retry rules: retry `internal` (500) and `rate_limited` (429) with backoff. Do NOT',
    'blind-retry a 4xx — the request is wrong and will fail identically. A `502 meta_error`',
    'means WhatsApp itself rejected the send; read the message before deciding.',
    ''
  );

  // ── Rate limits ──
  lines.push(
    '## 4. Rate limiting',
    '',
    `- ${RATE_LIMIT.limit} requests per ${RATE_LIMIT.windowSeconds} seconds, counted per API key.`,
    `- Exceeding it returns \`429\` with code \`rate_limited\` and these headers: ${RATE_LIMIT.headers.map((h) => `\`${h}\``).join(', ')}.`,
    '- Honour `Retry-After` (seconds). Implement exponential backoff with jitter rather than a tight retry loop.',
    ''
  );

  // ── Pagination ──
  lines.push(
    '## 5. Pagination',
    '',
    `- List endpoints are keyset-paginated, newest first, with \`?limit=\` (1–${PAGINATION.maxLimit}, default ${PAGINATION.defaultLimit}).`,
    '- Read `meta.next_cursor` and pass it back as `?cursor=` for the next page.',
    '- `meta.next_cursor` is `null` on the last page — that is the loop\u2019s exit condition.',
    '- Cursors are opaque. Pass them back verbatim; never parse, build, or modify one.',
    '- Keyset paging is stable while rows are being inserted, so a full scan will not skip or repeat records the way an offset would.',
    '',
    'Pagination loop, in words: start with no cursor; request a page; process `data`; if',
    '`meta.next_cursor` is not null, request again with that cursor; stop when it is null.',
    ''
  );

  // ── Scopes ──
  lines.push('## 6. Scopes', '');
  lines.push(
    ...table(
      ['scope', 'grants'],
      SCOPE_SPECS.map((s) => [`\`${s.name}\``, s.description]),
      '- none'
    )
  );
  lines.push('');

  // ── Endpoints ──
  lines.push('## 7. Endpoints', '');
  for (const group of groups) {
    lines.push(`## ${group.title}`, '', group.description, '');
    for (const endpoint of group.endpoints) {
      lines.push(...renderEndpoint(endpoint));
    }
  }

  // ── Webhooks ──
  lines.push(
    '## 8. Webhooks (inbound events)',
    '',
    'Register an HTTPS endpoint to receive events instead of polling.',
    '',
    'Events you can subscribe to:',
    ''
  );
  lines.push(
    ...table(
      ['event', 'meaning'],
      WEBHOOK_EVENT_SPECS.map((e) => [`\`${e.name}\``, e.description]),
      '- none'
    )
  );
  lines.push(
    '',
    'Every delivery is a POST with this JSON envelope:',
    '```json',
    JSON.stringify(WEBHOOK_DELIVERY.examplePayload, null, 2),
    '```',
    '',
    'Delivery headers:',
    `- \`${WEBHOOK_DELIVERY.eventHeader}\` — the event name`,
    `- \`${WEBHOOK_DELIVERY.idHeader}\` — the endpoint id that was called`,
    `- \`${WEBHOOK_DELIVERY.signatureHeader}\` — \`${WEBHOOK_DELIVERY.signatureFormat}\``,
    '',
    'How to verify a delivery (do this before trusting the payload):',
    `1. Read the \`t\` and \`v1\` values out of the \`${WEBHOOK_DELIVERY.signatureHeader}\` header.`,
    `2. Reject the request if \`t\` is more than ${WEBHOOK_DELIVERY.recommendedToleranceSeconds} seconds from now — that is the replay guard.`,
    `3. Compute \`${WEBHOOK_DELIVERY.algorithm}\` over the exact string \`${WEBHOOK_DELIVERY.signedPayload}\`, keyed with the endpoint\u2019s signing secret, and hex-encode it.`,
    '4. Compare your hex digest to `v1` using a constant-time comparison.',
    '',
    'Critical implementation details:',
    ...WEBHOOK_DELIVERY.notes.map((n) => `- ${n}`),
    `- Verify against the RAW request body. Most frameworks parse JSON automatically; you must keep the unparsed bytes, because re-serializing changes them and the HMAC will not match.`,
    `- The signing secret is returned once, when the endpoint is created (\`POST /api/v1/webhooks\`). Store it then; it cannot be retrieved later.`,
    ''
  );

  // ── Worked example ──
  const exampleEndpoint = endpoints[0];
  if (exampleEndpoint) {
    lines.push(
      `## 9. Worked example (${languageLabel})`,
      '',
      `A complete, runnable call to \`${endpointLabel(exampleEndpoint)}\`, including the failure branch. Match this shape — especially the error handling — in the code you write.`,
      '',
      '```',
      generateSample(exampleEndpoint, language, { baseUrl }),
      '```',
      ''
    );
  }

  // ── Rules ──
  lines.push(
    '## 10. Rules for the code you write',
    '',
    '1. Read the API key from an environment variable or secret store. Never hard-code it.',
    '2. Check the HTTP status on every call and surface `error.code` and `error.message` on failure. Do not assume success.',
    '3. Use only the endpoints, fields, and query parameters listed above.',
    '4. Set a request timeout, and retry only `429` and `5xx`, with backoff.',
    '5. Phone numbers must be E.164, e.g. `+14155550123`.',
    '6. When paginating, follow `meta.next_cursor` until it is null. Do not assume one page is everything.',
    '7. Outside WhatsApp\u2019s 24-hour customer service window, only an approved template message can be sent. A free-form text send will be rejected by Meta.',
    '8. For repeated sends through a campaign, always pass a deterministic `idempotency_key` derived from the source row or event, so a retry cannot double-send.',
    '9. Treat `201`/`202` as success. `202` in particular means accepted-and-in-progress, not finished — poll for the final state where the endpoint says so.',
    ''
  );

  return lines.join('\n');
}

/** Focused brief for a single endpoint, with all the global context kept. */
export function buildEndpointAgentPrompt(
  endpoint: EndpointSpec,
  options: AgentPromptOptions = {}
): string {
  return buildAgentPrompt({ ...options, endpointIds: [endpoint.id] });
}
