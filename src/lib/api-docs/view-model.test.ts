import { describe, expect, it } from 'vitest';

import { buildApiReferenceView, resolveDocsBaseUrl } from './view-model';
import { ALL_ENDPOINTS, API_GROUPS, findEndpoint } from './spec';
import { SAMPLE_LANGUAGES, DEFAULT_BASE_URL } from './code-samples';
import { API_SCOPES } from '@/lib/api-keys/scopes';
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events';

const BASE = 'https://crm.acme.com';
const view = buildApiReferenceView(BASE);

describe('the view model covers the whole spec', () => {
  it('carries every group and endpoint', () => {
    expect(view.groups.map((g) => g.id)).toEqual(API_GROUPS.map((g) => g.id));
    const ids = view.groups.flatMap((g) => g.endpoints.map((e) => e.id));
    expect(ids).toEqual(ALL_ENDPOINTS.map((e) => e.id));
  });

  it('carries a sample for every language on every endpoint', () => {
    const languageIds = SAMPLE_LANGUAGES.map((l) => l.id).sort();
    for (const group of view.groups) {
      for (const endpoint of group.endpoints) {
        expect(Object.keys(endpoint.samples).sort(), endpoint.id).toEqual(
          languageIds
        );
        for (const [lang, code] of Object.entries(endpoint.samples)) {
          expect(code.length, `${endpoint.id}/${lang}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it('describes every scope, error code, and webhook event', () => {
    expect(view.scopes.map((s) => s.name)).toEqual([...API_SCOPES]);
    expect(view.errorCodes.length).toBeGreaterThan(0);
    expect(view.webhooks.events.map((e) => e.name)).toEqual([
      ...WEBHOOK_EVENTS,
    ]);
  });

  it('includes the quick-start snippets and the AI brief', () => {
    expect(Object.keys(view.quickStart).sort()).toEqual(
      SAMPLE_LANGUAGES.map((l) => l.id).sort()
    );
    expect(view.quickStart.curl).toContain('/api/v1/me');
    expect(view.agentPrompt.length).toBeGreaterThan(8000);
  });

  it('reports the real rate limit and pagination bounds', () => {
    expect(view.rateLimit.limit).toBe(120);
    expect(view.rateLimit.windowSeconds).toBe(60);
    expect(view.rateLimit.headers).toContain('Retry-After');
    expect(view.pagination.defaultLimit).toBe(50);
    expect(view.pagination.maxLimit).toBe(100);
  });

  it('reports the real webhook delivery thresholds', () => {
    expect(view.webhooks.maxConsecutiveFailures).toBe(15);
    expect(view.webhooks.timeoutMs).toBe(5000);
    expect(view.webhooks.signatureHeader).toBe('X-Wacrm-Signature');
    expect(view.webhooks.algorithm).toBe('HMAC-SHA256');
  });
});

describe('it is safe to send over the wire', () => {
  it('survives a JSON round trip unchanged', () => {
    // The whole point of the view model is that it crosses the RSC
    // boundary, which only passes serializable data.
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('contains no functions, class instances, or undefined values', () => {
    const walk = (value: unknown, path: string): void => {
      if (value === undefined) {
        throw new Error(`undefined at ${path}`);
      }
      if (typeof value === 'function') {
        throw new Error(`function at ${path}`);
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (value !== null && typeof value === 'object') {
        expect(Object.getPrototypeOf(value), path).toBe(Object.prototype);
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
    };
    expect(() => walk(view, 'view')).not.toThrow();
  });

  it('stays a reasonable size for a docs page payload', () => {
    // Not a hard requirement, just a tripwire: if this doubles, the
    // per-endpoint samples probably grew a copy each.
    const bytes = JSON.stringify(view).length;
    expect(bytes).toBeGreaterThan(20_000);
    expect(bytes).toBeLessThan(400_000);
  });
});

describe('urls and samples use the supplied origin', () => {
  it('resolves every endpoint url against the base', () => {
    for (const group of view.groups) {
      for (const endpoint of group.endpoints) {
        expect(endpoint.url.startsWith(`${BASE}/api/v1`), endpoint.id).toBe(
          true
        );
        // No placeholder left for the reader to fill in.
        expect(endpoint.url, endpoint.id).not.toContain('{');
      }
    }
  });

  it('never leaks the placeholder domain when a real base is given', () => {
    expect(JSON.stringify(view)).not.toContain(DEFAULT_BASE_URL);
  });
});

describe('body field flattening', () => {
  const send = view.groups
    .flatMap((g) => g.endpoints)
    .find((e) => e.id === 'post-messages')!;

  it('indents nested object fields', () => {
    const name = send.bodyFields.find((f) => f.path === 'template.name');
    expect(name).toBeDefined();
    expect(name!.depth).toBe(1);
    expect(name!.name).toBe('name');

    const template = send.bodyFields.find((f) => f.path === 'template');
    expect(template!.depth).toBe(0);
  });

  it('marks array element children with []', () => {
    const broadcast = view.groups
      .flatMap((g) => g.endpoints)
      .find((e) => e.id === 'post-broadcasts')!;
    const paths = broadcast.bodyFields.map((f) => f.path);
    expect(paths).toContain('recipients');
    expect(paths).toContain('recipients[].to');
    expect(paths).toContain('recipients[].params');
  });

  it('does not treat a union type containing an array as an array', () => {
    // `template.params` is `string[] | object`: the ARRAY member fills body
    // variables and carries no children, while the OBJECT member carries
    // all of them. Sniffing the type for a `[]` substring read the union as
    // an array and documented every child as `template.params[].headerX`,
    // telling readers to send an array of objects — which the endpoint
    // rejects. A reader following that cannot succeed, so this is worse
    // than leaving the keys undocumented.
    const paths = send.bodyFields.map((f) => f.path);

    expect(paths).toContain('template.params.headerMediaUrl');
    expect(paths).toContain('template.params.headerMediaId');
    expect(paths).toContain('template.params.body');
    expect(paths).not.toContain('template.params[].headerMediaUrl');
    expect(paths.some((p) => p.startsWith('template.params[]'))).toBe(false);
  });

  it('documents the media-header key a DOCUMENT template needs', () => {
    // The ticket this whole block exists for: a caller put headerMediaUrl at
    // the top level of the request body, where nothing reads it.
    const field = send.bodyFields.find(
      (f) => f.path === 'template.params.headerMediaUrl'
    );
    expect(field).toBeDefined();
    expect(field!.depth).toBe(2);
    expect(field!.description).toMatch(/DOCUMENT/);
  });

  it('keeps every spec field, parents included', () => {
    const spec = findEndpoint('post-messages')!;
    const topLevel = spec.bodyFields!.map((f) => f.name);
    for (const name of topLevel) {
      expect(send.bodyFields.map((f) => f.path)).toContain(name);
    }
  });

  it('is empty for endpoints that take no body', () => {
    const me = view.groups
      .flatMap((g) => g.endpoints)
      .find((e) => e.id === 'get-me')!;
    expect(me.bodyFields).toEqual([]);
  });
});

describe('responses', () => {
  it('pretty-prints examples as JSON strings', () => {
    const me = view.groups
      .flatMap((g) => g.endpoints)
      .find((e) => e.id === 'get-me')!;
    const ok = me.responses.find((r) => r.status === 200)!;
    expect(ok.exampleJson).toContain('\n');
    expect(() => JSON.parse(ok.exampleJson!)).not.toThrow();
  });

  it('uses null, not undefined, when there is no example', () => {
    const rows = view.groups
      .flatMap((g) => g.endpoints)
      .flatMap((e) => e.responses);
    expect(rows.some((r) => r.exampleJson === null)).toBe(true);
    expect(rows.every((r) => r.exampleJson !== undefined)).toBe(true);
  });
});

describe('resolveDocsBaseUrl', () => {
  const fallback = 'https://placeholder.test';

  it('prefers an explicit operator setting', () => {
    expect(
      resolveDocsBaseUrl({
        envUrl: 'https://configured.test/',
        forwardedHost: 'proxy.test',
        host: 'origin.test',
        fallback,
      })
    ).toBe('https://configured.test');
  });

  it('falls back to the forwarded host from a proxy', () => {
    expect(
      resolveDocsBaseUrl({
        forwardedHost: 'proxy.test',
        forwardedProto: 'https',
        host: 'internal.test',
        fallback,
      })
    ).toBe('https://proxy.test');
  });

  it('takes the first entry when a proxy chain appends several', () => {
    expect(
      resolveDocsBaseUrl({
        forwardedHost: 'first.test, second.test',
        forwardedProto: 'https, http',
        fallback,
      })
    ).toBe('https://first.test');
  });

  it('assumes https for a forwarded host with no proto', () => {
    expect(resolveDocsBaseUrl({ forwardedHost: 'proxy.test', fallback })).toBe(
      'https://proxy.test'
    );
  });

  it('uses the request host when there is no proxy', () => {
    expect(resolveDocsBaseUrl({ host: 'crm.acme.com', fallback })).toBe(
      'https://crm.acme.com'
    );
  });

  it('uses http for localhost so dev snippets actually run', () => {
    expect(resolveDocsBaseUrl({ host: 'localhost:3000', fallback })).toBe(
      'http://localhost:3000'
    );
    expect(resolveDocsBaseUrl({ host: '127.0.0.1:3000', fallback })).toBe(
      'http://127.0.0.1:3000'
    );
  });

  it('does not mistake a real host containing "localhost" for local', () => {
    expect(resolveDocsBaseUrl({ host: 'localhost.evil.com', fallback })).toBe(
      'https://localhost.evil.com'
    );
  });

  it('falls back when nothing is available, without a trailing slash', () => {
    expect(resolveDocsBaseUrl({ fallback: 'https://x.test/' })).toBe(
      'https://x.test'
    );
    expect(resolveDocsBaseUrl({ envUrl: '   ', host: null, fallback })).toBe(
      fallback
    );
  });
});
