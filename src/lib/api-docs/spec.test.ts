// ============================================================
// Drift guard for the API docs spec.
//
// The docs page, the code samples, and the AI prompt are all generated
// from `spec.ts`, so a stale entry there becomes wrong documentation
// shipped to developers — the exact failure mode prose docs have.
// These tests read the REAL route files off disk and fail if the spec
// and the handlers disagree about which endpoints exist, which methods
// they expose, or which scope they require.
//
// So: add a route, and this suite tells you to document it. Delete
// one, and it tells you to remove it.
// ============================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ALL_ENDPOINTS,
  API_GROUPS,
  RATE_LIMIT,
  SCOPE_SPECS,
  endpointLabel,
  findEndpoint,
  resolvePath,
} from './spec';
import { API_SCOPES } from '@/lib/api-keys/scopes';
import { RATE_LIMITS } from '@/lib/rate-limit';

const V1_ROOT = resolve(process.cwd(), 'src/app/api/v1');
const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

interface DiscoveredRoute {
  /** URL path in spec form, e.g. `/api/v1/contacts/{id}`. */
  path: string;
  methods: string[];
  /** Scopes passed to `requireApiKey` anywhere in the file. */
  scopes: string[];
}

/** Recursively collect every `route.ts` under `src/app/api/v1`. */
function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

/** `…/api/v1/contacts/[id]/route.ts` → `/api/v1/contacts/{id}`. */
function toApiPath(file: string): string {
  const rel = file.slice(V1_ROOT.length).split(sep).filter(Boolean);
  rel.pop(); // drop 'route.ts'
  const segments = rel.map((s) =>
    s.startsWith('[') && s.endsWith(']') ? `{${s.slice(1, -1)}}` : s
  );
  return ['/api/v1', ...segments].join('/');
}

function discoverRoutes(): DiscoveredRoute[] {
  return findRouteFiles(V1_ROOT).map((file) => {
    const source = readFileSync(file, 'utf8');
    const methods = HTTP_METHODS.filter((m) =>
      new RegExp(`export\\s+async\\s+function\\s+${m}\\s*\\(`).test(source)
    );
    const scopes = [
      ...source.matchAll(/requireApiKey\(\s*request\s*,\s*'([^']+)'/g),
    ].map((m) => m[1]);
    return { path: toApiPath(file), methods, scopes: [...new Set(scopes)] };
  });
}

const discovered = discoverRoutes();

describe('api docs spec — coverage against the real route handlers', () => {
  it('finds the route files it is meant to check', () => {
    // A broken walker would make every assertion below vacuously true.
    expect(discovered.length).toBeGreaterThan(0);
    expect(discovered.every((r) => r.methods.length > 0)).toBe(true);
  });

  it('documents every method of every /api/v1 route, and nothing extra', () => {
    const onDisk = discovered
      .flatMap((r) => r.methods.map((m) => `${m} ${r.path}`))
      .sort();
    const inSpec = ALL_ENDPOINTS.map(endpointLabel).sort();

    // One assertion on sorted lists, so a failure prints exactly which
    // endpoint is undocumented or over-documented.
    expect(inSpec).toEqual(onDisk);
  });

  it('records the same required scope the handler enforces', () => {
    for (const route of discovered) {
      const documented = new Set(
        ALL_ENDPOINTS.filter((e) => e.path === route.path)
          .map((e) => e.scope)
          .filter((s): s is (typeof API_SCOPES)[number] => s !== null)
      );
      expect([...documented].sort(), `scopes for ${route.path}`).toEqual(
        [...route.scopes].sort()
      );
    }
  });

  it('marks GET /api/v1/me as the only scope-free endpoint', () => {
    const scopeFree = ALL_ENDPOINTS.filter((e) => e.scope === null);
    expect(scopeFree.map(endpointLabel)).toEqual(['GET /api/v1/me']);
  });
});

describe('api docs spec — internal consistency', () => {
  it('gives every endpoint a unique, url-safe id', () => {
    const ids = ALL_ENDPOINTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every group a unique id and at least one endpoint', () => {
    const ids = API_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of API_GROUPS) {
      expect(group.endpoints.length, `group ${group.id}`).toBeGreaterThan(0);
    }
  });

  it('declares a path param for every placeholder in a path', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      const placeholders = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map(
        (m) => m[1]
      );
      const declared = (endpoint.pathParams ?? []).map((p) => p.name);
      expect(
        declared.sort(),
        `path params for ${endpointLabel(endpoint)}`
      ).toEqual(placeholders.sort());
    }
  });

  it('resolves every path placeholder to a concrete value in samples', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      // A leftover `{id}` in a sample is a snippet the reader cannot run.
      expect(resolvePath(endpoint), endpointLabel(endpoint)).not.toMatch(
        /[{}]/
      );
    }
  });

  it('documents at least one response per endpoint', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      expect(
        endpoint.responses.length,
        `responses for ${endpointLabel(endpoint)}`
      ).toBeGreaterThan(0);
    }
  });

  it('only carries a request body on methods that take one', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      if (endpoint.method === 'GET' || endpoint.method === 'DELETE') {
        expect(
          endpoint.sampleBody,
          `${endpointLabel(endpoint)} should not send a body`
        ).toBeUndefined();
      }
    }
  });

  it('gives every write endpoint a sample body to show', () => {
    const writes = ALL_ENDPOINTS.filter(
      (e) => e.method === 'POST' || e.method === 'PATCH'
    );
    for (const endpoint of writes) {
      expect(
        endpoint.sampleBody,
        `${endpointLabel(endpoint)} needs a sampleBody`
      ).toBeDefined();
    }
  });

  it('describes every scope the product defines', () => {
    expect(SCOPE_SPECS.map((s) => s.name)).toEqual([...API_SCOPES]);
    // Every scope should unlock something, or it is dead vocabulary.
    for (const scope of SCOPE_SPECS) {
      expect(scope.endpointIds.length, `scope ${scope.name}`).toBeGreaterThan(
        0
      );
    }
  });

  it('reads the rate limit off the live limiter rather than a copy', () => {
    expect(RATE_LIMIT.limit).toBe(RATE_LIMITS.publicApi.limit);
    expect(RATE_LIMIT.windowSeconds).toBe(
      RATE_LIMITS.publicApi.windowMs / 1000
    );
  });

  it('looks an endpoint up by id', () => {
    expect(findEndpoint('get-me')?.path).toBe('/api/v1/me');
    expect(findEndpoint('nope')).toBeUndefined();
  });
});
