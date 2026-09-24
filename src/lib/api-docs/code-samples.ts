// ============================================================
// Runnable code samples, generated per endpoint per language.
//
// Pure functions over `EndpointSpec` — no React, no I/O — so the
// snippets are unit-testable and the docs page stays a thin renderer.
// Every sample is derived from the spec, which is itself checked
// against the real route handlers (see spec.test.ts), so a snippet
// cannot describe an endpoint that doesn't exist.
//
// ─── What "good sample" means here ───────────────────────────────
//
// A developer copies a snippet to find out two things: how to shape
// the request, and how to tell success from failure. So every sample
// includes the auth header, the real request body, AND the error
// branch — reading `error.code` / `error.message` out of the failure
// envelope. A happy-path-only snippet teaches half the contract and
// leaves the reader to discover the envelope by accident.
//
// Samples are intentionally dependency-free (curl, fetch, requests,
// libcurl, net/http, net/http) rather than showing an SDK we don't
// publish. Anything a reader must `npm install` before the first call
// is a barrier, not a sample.
// ============================================================

import {
  SAMPLE_API_KEY,
  endpointLabel,
  resolvePath,
  type EndpointSpec,
} from './spec';

export type SampleLanguageId =
  'curl' | 'node' | 'python' | 'php' | 'go' | 'ruby';

export interface SampleLanguage {
  id: SampleLanguageId;
  /** Shown in the language selector. */
  label: string;
  /** Grammar name for the syntax highlighter. */
  highlight: string;
}

/** Selector order: shell first, then by how often we expect it used. */
export const SAMPLE_LANGUAGES: readonly SampleLanguage[] = [
  { id: 'curl', label: 'cURL', highlight: 'bash' },
  { id: 'node', label: 'Node.js', highlight: 'javascript' },
  { id: 'python', label: 'Python', highlight: 'python' },
  { id: 'php', label: 'PHP', highlight: 'php' },
  { id: 'go', label: 'Go', highlight: 'go' },
  { id: 'ruby', label: 'Ruby', highlight: 'ruby' },
] as const;

/** Stand-in origin when the caller can't supply a real one. */
export const DEFAULT_BASE_URL = 'https://your-wacrm-domain.com';

export interface SampleOptions {
  /** Origin without a trailing slash, e.g. `https://crm.acme.com`. */
  baseUrl?: string;
  /** Substituted into the Authorization header. */
  apiKey?: string;
}

// ─────────────────── literal serialization ───────────────────

/**
 * How one language spells a nested literal. Parameterizing this
 * (rather than writing four near-identical printers) is what keeps a
 * Python sample from drifting into JSON's `true` / `null`.
 */
interface LiteralDialect {
  objectOpen: string;
  objectClose: string;
  arrayOpen: string;
  arrayClose: string;
  indentUnit: string;
  key: (name: string) => string;
  string: (value: string) => string;
  trueLiteral: string;
  falseLiteral: string;
  nullLiteral: string;
}

/** Escape for a double-quoted string in a C-family / JSON grammar. */
function doubleQuoted(value: string): string {
  return JSON.stringify(value);
}

/** Escape for a PHP single-quoted string (only \\ and \' are special). */
function singleQuoted(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

const JSON_DIALECT: LiteralDialect = {
  objectOpen: '{',
  objectClose: '}',
  arrayOpen: '[',
  arrayClose: ']',
  indentUnit: '  ',
  key: (name) => `${doubleQuoted(name)}: `,
  string: doubleQuoted,
  trueLiteral: 'true',
  falseLiteral: 'false',
  nullLiteral: 'null',
};

const PYTHON_DIALECT: LiteralDialect = {
  ...JSON_DIALECT,
  indentUnit: '    ',
  trueLiteral: 'True',
  falseLiteral: 'False',
  nullLiteral: 'None',
};

const PHP_DIALECT: LiteralDialect = {
  // PHP has no object literal; an associative array is the idiom.
  objectOpen: '[',
  objectClose: ']',
  arrayOpen: '[',
  arrayClose: ']',
  indentUnit: '    ',
  key: (name) => `${singleQuoted(name)} => `,
  string: singleQuoted,
  trueLiteral: 'true',
  falseLiteral: 'false',
  nullLiteral: 'null',
};

const RUBY_DIALECT: LiteralDialect = {
  ...JSON_DIALECT,
  key: (name) => `${doubleQuoted(name)} => `,
  nullLiteral: 'nil',
};

/** Render `value` as a literal in `dialect`, pretty-printed from col 0. */
function renderLiteral(
  value: unknown,
  dialect: LiteralDialect,
  depth = 0
): string {
  if (value === null || value === undefined) return dialect.nullLiteral;
  if (typeof value === 'boolean') {
    return value ? dialect.trueLiteral : dialect.falseLiteral;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return dialect.string(value);

  const pad = dialect.indentUnit.repeat(depth);
  const padInner = dialect.indentUnit.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${dialect.arrayOpen}${dialect.arrayClose}`;
    const items = value.map(
      (item) => `${padInner}${renderLiteral(item, dialect, depth + 1)}`
    );
    return `${dialect.arrayOpen}\n${items.join(',\n')}\n${pad}${dialect.arrayClose}`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return `${dialect.objectOpen}${dialect.objectClose}`;
  }
  const lines = entries.map(
    ([k, v]) =>
      `${padInner}${dialect.key(k)}${renderLiteral(v, dialect, depth + 1)}`
  );
  return `${dialect.objectOpen}\n${lines.join(',\n')}\n${pad}${dialect.objectClose}`;
}

/**
 * Re-indent a rendered block so it can be dropped inside surrounding
 * code. The FIRST line is left alone (it sits after `foo = `); every
 * continuation line gets `prefix`.
 */
function indentContinuation(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 || line === '' ? line : `${prefix}${line}`))
    .join('\n');
}

// ───────────────────────── helpers ─────────────────────────

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Full sample URL: origin + resolved path + sample query string. */
export function sampleUrl(endpoint: EndpointSpec, baseUrl: string): string {
  return `${stripTrailingSlash(baseUrl)}${resolvePath(endpoint)}${endpoint.sampleQuery ?? ''}`;
}

/** `post-campaign-send` → `postCampaignSend`, for a sample fn name. */
function camelFromId(id: string): string {
  const [first, ...rest] = id.split('-');
  return [first, ...rest.map((p) => p[0].toUpperCase() + p.slice(1))].join('');
}

/** Single-quote a value for a POSIX shell, closing/reopening on quotes. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveOptions(options?: SampleOptions): {
  baseUrl: string;
  apiKey: string;
} {
  return {
    baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
    apiKey: options?.apiKey ?? SAMPLE_API_KEY,
  };
}

// ──────────────────────── generators ────────────────────────

function curlSample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const lines: string[] = [];

  // `-X GET` is noise; curl defaults to GET.
  const method = endpoint.method === 'GET' ? '' : ` -X ${endpoint.method}`;
  lines.push(
    `curl${method} ${shellSingleQuote(sampleUrl(endpoint, baseUrl))} \\`
  );
  lines.push(`  -H ${shellSingleQuote(`Authorization: Bearer ${apiKey}`)}`);

  if (endpoint.sampleBody) {
    lines[lines.length - 1] += ' \\';
    lines.push(`  -H ${shellSingleQuote('Content-Type: application/json')} \\`);
    const json = renderLiteral(endpoint.sampleBody, JSON_DIALECT);
    lines.push(`  -d ${shellSingleQuote(json)}`);
  }

  return lines.join('\n');
}

function nodeSample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const fn = camelFromId(endpoint.id);
  // Six spaces: these sit one level inside `headers: {`, which is
  // itself indented four inside the fetch init object.
  const headers = [`      Authorization: 'Bearer ${apiKey}',`];
  if (endpoint.sampleBody) {
    headers.push(`      'Content-Type': 'application/json',`);
  }

  const init = [
    `    method: '${endpoint.method}',`,
    `    headers: {`,
    ...headers,
    `    },`,
  ];
  if (endpoint.sampleBody) {
    const body = indentContinuation(
      renderLiteral(endpoint.sampleBody, JSON_DIALECT),
      '    '
    );
    init.push(`    body: JSON.stringify(${body}),`);
  }

  return [
    `async function ${fn}() {`,
    `  const response = await fetch('${sampleUrl(endpoint, baseUrl)}', {`,
    ...init,
    `  });`,
    ``,
    `  const payload = await response.json();`,
    ``,
    `  if (!response.ok) {`,
    `    // Failures come back as { error: { code, message } }.`,
    '    throw new Error(`${payload.error.code}: ${payload.error.message}`);',
    `  }`,
    ``,
    `  return payload.data;`,
    `}`,
    ``,
    `${fn}().then(console.log).catch(console.error);`,
  ].join('\n');
}

function pythonSample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const lines = [
    `import requests`,
    ``,
    `url = "${sampleUrl(endpoint, baseUrl)}"`,
    `headers = {`,
    `    "Authorization": "Bearer ${apiKey}",`,
  ];
  if (endpoint.sampleBody) {
    lines.push(`    "Content-Type": "application/json",`);
  }
  lines.push(`}`);

  const callArgs = ['url', 'headers=headers'];
  if (endpoint.sampleBody) {
    lines.push(``);
    lines.push(
      `payload = ${renderLiteral(endpoint.sampleBody, PYTHON_DIALECT)}`
    );
    callArgs.push('json=payload');
  }
  callArgs.push('timeout=30');

  lines.push(``);
  lines.push(
    `response = requests.${endpoint.method.toLowerCase()}(${callArgs.join(', ')})`
  );
  lines.push(`body = response.json()`);
  lines.push(``);
  lines.push(`if not response.ok:`);
  lines.push(`    # Failures come back as {"error": {"code", "message"}}.`);
  lines.push(
    `    raise RuntimeError(f"{body['error']['code']}: {body['error']['message']}")`
  );
  lines.push(``);
  lines.push(`print(body["data"])`);

  return lines.join('\n');
}

function phpSample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const opts = [
    `    CURLOPT_RETURNTRANSFER => true,`,
    `    CURLOPT_CUSTOMREQUEST => '${endpoint.method}',`,
    `    CURLOPT_HTTPHEADER => [`,
    `        'Authorization: Bearer ${apiKey}',`,
  ];
  if (endpoint.sampleBody) {
    opts.push(`        'Content-Type: application/json',`);
  }
  opts.push(`    ],`);
  if (endpoint.sampleBody) {
    const body = indentContinuation(
      renderLiteral(endpoint.sampleBody, PHP_DIALECT),
      '    '
    );
    opts.push(`    CURLOPT_POSTFIELDS => json_encode(${body}),`);
  }

  return [
    `<?php`,
    ``,
    `$ch = curl_init('${sampleUrl(endpoint, baseUrl)}');`,
    `curl_setopt_array($ch, [`,
    ...opts,
    `]);`,
    ``,
    `$response = curl_exec($ch);`,
    `$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);`,
    `curl_close($ch);`,
    ``,
    `$body = json_decode($response, true);`,
    ``,
    `if ($status >= 400) {`,
    `    // Failures come back as { error: { code, message } }.`,
    `    throw new RuntimeException($body['error']['code'] . ': ' . $body['error']['message']);`,
    `}`,
    ``,
    `print_r($body['data']);`,
  ].join('\n');
}

function goSample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const hasBody = Boolean(endpoint.sampleBody);

  // Go fails to compile on an unused import, so the list must match
  // exactly what the generated body references.
  const imports = hasBody
    ? [`\t"bytes"`, `\t"fmt"`, `\t"io"`, `\t"net/http"`]
    : [`\t"fmt"`, `\t"io"`, `\t"net/http"`];

  const lines = [
    `package main`,
    ``,
    `import (`,
    ...imports,
    `)`,
    ``,
    `func main() {`,
  ];

  if (hasBody) {
    // A raw string literal keeps the JSON readable and needs no struct.
    const json = indentContinuation(
      renderLiteral(endpoint.sampleBody, JSON_DIALECT),
      `\t`
    );
    lines.push(`\tpayload := []byte(\`${json}\`)`);
    lines.push(``);
    lines.push(
      `\treq, err := http.NewRequest("${endpoint.method}", "${sampleUrl(endpoint, baseUrl)}", bytes.NewReader(payload))`
    );
  } else {
    lines.push(
      `\treq, err := http.NewRequest("${endpoint.method}", "${sampleUrl(endpoint, baseUrl)}", nil)`
    );
  }

  lines.push(`\tif err != nil {`);
  lines.push(`\t\tpanic(err)`);
  lines.push(`\t}`);
  lines.push(``);
  lines.push(`\treq.Header.Set("Authorization", "Bearer ${apiKey}")`);
  if (hasBody) {
    lines.push(`\treq.Header.Set("Content-Type", "application/json")`);
  }
  lines.push(``);
  lines.push(`\tres, err := http.DefaultClient.Do(req)`);
  lines.push(`\tif err != nil {`);
  lines.push(`\t\tpanic(err)`);
  lines.push(`\t}`);
  lines.push(`\tdefer res.Body.Close()`);
  lines.push(``);
  lines.push(`\tbody, err := io.ReadAll(res.Body)`);
  lines.push(`\tif err != nil {`);
  lines.push(`\t\tpanic(err)`);
  lines.push(`\t}`);
  lines.push(``);
  lines.push(`\t// Failures come back as { error: { code, message } }.`);
  lines.push(`\tif res.StatusCode >= 400 {`);
  lines.push(
    `\t\tpanic(fmt.Sprintf("request failed with %d: %s", res.StatusCode, body))`
  );
  lines.push(`\t}`);
  lines.push(``);
  lines.push(`\tfmt.Println(string(body))`);
  lines.push(`}`);

  return lines.join('\n');
}

/** `PATCH` → `Patch`, matching Net::HTTP's request class names. */
function rubyRequestClass(method: string): string {
  return method[0] + method.slice(1).toLowerCase();
}

function rubySample(endpoint: EndpointSpec, o: SampleOptions): string {
  const { baseUrl, apiKey } = resolveOptions(o);
  const lines = [
    `require "json"`,
    `require "net/http"`,
    ``,
    `uri = URI("${sampleUrl(endpoint, baseUrl)}")`,
    ``,
    `request = Net::HTTP::${rubyRequestClass(endpoint.method)}.new(uri)`,
    `request["Authorization"] = "Bearer ${apiKey}"`,
  ];

  if (endpoint.sampleBody) {
    lines.push(`request["Content-Type"] = "application/json"`);
    const body = renderLiteral(endpoint.sampleBody, RUBY_DIALECT);
    lines.push(`request.body = JSON.generate(${body})`);
  }

  lines.push(``);
  lines.push(
    `response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|`
  );
  lines.push(`  http.request(request)`);
  lines.push(`end`);
  lines.push(``);
  lines.push(`body = JSON.parse(response.body)`);
  lines.push(``);
  lines.push(`# Failures come back as { error: { code, message } }.`);
  lines.push(`if response.code.to_i >= 400`);
  lines.push(`  raise "#{body['error']['code']}: #{body['error']['message']}"`);
  lines.push(`end`);
  lines.push(``);
  lines.push(`puts body["data"]`);

  return lines.join('\n');
}

const GENERATORS: Record<
  SampleLanguageId,
  (endpoint: EndpointSpec, options: SampleOptions) => string
> = {
  curl: curlSample,
  node: nodeSample,
  python: pythonSample,
  php: phpSample,
  go: goSample,
  ruby: rubySample,
};

/**
 * Build a runnable snippet for one endpoint in one language.
 *
 * Deterministic and side-effect free: the same endpoint and options
 * always yield the same string, which is what lets the docs page
 * render it during SSR and the tests assert on it.
 */
export function generateSample(
  endpoint: EndpointSpec,
  language: SampleLanguageId,
  options: SampleOptions = {}
): string {
  return GENERATORS[language](endpoint, options);
}

/** Every language for one endpoint — used by the AI prompt builder. */
export function generateAllSamples(
  endpoint: EndpointSpec,
  options: SampleOptions = {}
): Record<SampleLanguageId, string> {
  const out = {} as Record<SampleLanguageId, string>;
  for (const language of SAMPLE_LANGUAGES) {
    out[language.id] = generateSample(endpoint, language.id, options);
  }
  return out;
}

/** A short human label for a snippet block, e.g. in a copied prompt. */
export function sampleHeading(endpoint: EndpointSpec): string {
  return `${endpoint.title} — ${endpointLabel(endpoint)}`;
}
