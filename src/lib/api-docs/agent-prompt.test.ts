import { describe, expect, it } from 'vitest';

import { buildAgentPrompt, buildEndpointAgentPrompt } from './agent-prompt';
import {
  ALL_ENDPOINTS,
  PAGINATION,
  RATE_LIMIT,
  SHARED_ERROR_CODES,
  WEBHOOK_EVENT_SPECS,
  endpointLabel,
  findEndpoint,
} from './spec';
import { API_SCOPES } from '@/lib/api-keys/scopes';

const prompt = buildAgentPrompt();

describe('the brief is self-contained', () => {
  it('documents every endpoint by method and path', () => {
    // The whole promise of the button is that the agent needs nothing
    // else, so a missing endpoint is a silent failure of the feature.
    for (const endpoint of ALL_ENDPOINTS) {
      expect(prompt, endpoint.id).toContain(endpointLabel(endpoint));
    }
  });

  it('names the scope each endpoint needs', () => {
    for (const scope of API_SCOPES) {
      expect(prompt, scope).toContain(scope);
    }
    // And says plainly that one endpoint needs no scope at all.
    expect(prompt).toContain('none (any valid key)');
  });

  it('explains all three envelope shapes', () => {
    expect(prompt).toContain('"data"');
    expect(prompt).toContain('next_cursor');
    expect(prompt).toContain('"error"');
  });

  it('lists every shared error code with its status', () => {
    for (const error of SHARED_ERROR_CODES) {
      expect(prompt, error.code).toContain(error.code);
      expect(prompt, `${error.code} status`).toContain(String(error.status));
    }
  });

  it('states the real rate limit and pagination bounds', () => {
    expect(prompt).toContain(
      `${RATE_LIMIT.limit} requests per ${RATE_LIMIT.windowSeconds} seconds`
    );
    expect(prompt).toContain(String(PAGINATION.maxLimit));
    expect(prompt).toContain(String(PAGINATION.defaultLimit));
    expect(prompt).toContain('Retry-After');
  });

  it('covers webhooks: events, envelope, and how to verify a signature', () => {
    for (const event of WEBHOOK_EVENT_SPECS) {
      expect(prompt, event.name).toContain(event.name);
    }
    expect(prompt).toContain('X-Wacrm-Signature');
    expect(prompt).toContain('HMAC-SHA256');
    expect(prompt).toContain('constant-time');
    // The single most common webhook bug: verifying a re-serialized body.
    expect(prompt).toContain('RAW request body');
  });

  it('includes a runnable worked example with an error branch', () => {
    expect(prompt).toContain('Worked example');
    expect(prompt).toContain('async function');
    expect(prompt).toContain('response.ok');
  });

  it('tells the agent not to guess', () => {
    // Agents reliably invent plausible endpoints; the brief must forbid it.
    expect(prompt).toContain('Do not ask follow-up questions');
    expect(prompt).toContain('not invent endpoints');
  });

  it('warns about the operational traps a first integration hits', () => {
    expect(prompt).toContain('E.164');
    expect(prompt).toContain('idempotency_key');
    expect(prompt).toContain('24-hour');
    expect(prompt).toContain('Never hard-code it');
    // 4xx retries are the classic wasted-loop bug.
    expect(prompt).toContain('Do NOT');
  });

  it('is substantial enough to actually brief an agent', () => {
    expect(prompt.length).toBeGreaterThan(8000);
  });
});

describe('options', () => {
  it('uses the supplied base url everywhere, and not the placeholder', () => {
    const scoped = buildAgentPrompt({ baseUrl: 'https://crm.acme.com' });
    expect(scoped).toContain('https://crm.acme.com');
    expect(scoped).not.toContain('your-wacrm-domain.com');
  });

  it('strips a trailing slash from the base url in the example call', () => {
    const scoped = buildAgentPrompt({ baseUrl: 'https://crm.acme.com/' });
    expect(scoped).not.toContain('crm.acme.com//api');
  });

  it('renders the worked example in the requested language', () => {
    const py = buildAgentPrompt({ language: 'python' });
    expect(py).toContain('Worked example (Python)');
    expect(py).toContain('import requests');

    const go = buildAgentPrompt({ language: 'go' });
    expect(go).toContain('Worked example (Go)');
    expect(go).toContain('net/http');
  });

  it('includes the stated goal so the agent knows what to build', () => {
    const scoped = buildAgentPrompt({
      goal: 'sync new Shopify orders into WhatsApp notifications',
    });
    expect(scoped).toContain(
      'What the developer wants to build: sync new Shopify orders into WhatsApp notifications'
    );
  });

  it('is deterministic for the same options', () => {
    expect(buildAgentPrompt({ baseUrl: 'https://x.test' })).toBe(
      buildAgentPrompt({ baseUrl: 'https://x.test' })
    );
  });
});

describe('narrowing to one endpoint', () => {
  const send = findEndpoint('post-messages')!;
  const focused = buildEndpointAgentPrompt(send);

  it('keeps the target endpoint', () => {
    expect(focused).toContain('POST /api/v1/messages');
  });

  it('drops unrelated endpoints', () => {
    expect(focused).not.toContain('DELETE /api/v1/webhooks/{id}');
    expect(focused).not.toContain('GET /api/v1/campaigns');
  });

  it('still carries the global contract, since the agent needs it', () => {
    // A focused brief that omits auth or the envelope is not usable.
    expect(focused).toContain('Authorization: Bearer');
    expect(focused).toContain('Error codes');
    expect(focused).toContain('Rate limiting');
    expect(focused).toContain('Pagination');
  });

  it('documents nested body fields in dotted form', () => {
    // `template.name` is what the caller actually has to construct.
    expect(focused).toContain('template.name');
    expect(focused).toContain('template.params');
  });

  it('renders array-element fields with a [] marker', () => {
    const broadcast = buildEndpointAgentPrompt(
      findEndpoint('post-broadcasts')!
    );
    expect(broadcast).toContain('recipients[].to');
    expect(broadcast).toContain('recipients[].params');
  });

  it('documents template.params keys as object keys, not array items', () => {
    // This prompt is pasted into an AI to have it write integration code,
    // so a wrong path here becomes wrong code in someone's project. The
    // union type `string[] | object` was being read as an array, producing
    // `template.params[].headerMediaUrl` — a shape the endpoint rejects.
    const send = buildEndpointAgentPrompt(findEndpoint('post-messages')!);

    expect(send).toContain('template.params.headerMediaUrl');
    expect(send).not.toContain('template.params[]');
  });

  it('lists the endpoint-specific error codes', () => {
    expect(focused).toContain('recipient_opted_out');
    expect(focused).toContain('meta_error');
    expect(focused).toContain('whatsapp_not_configured');
  });

  it('drops empty groups rather than leaving bare headings', () => {
    expect(focused).not.toContain('## Webhooks\n\nRegister an HTTPS');
  });
});
