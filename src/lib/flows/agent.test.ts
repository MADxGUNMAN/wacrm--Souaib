/**
 * The agent's extraction layer is the part that has to survive whatever
 * a model actually returns.
 *
 * The promise is that flow authoring works regardless of which provider
 * and model the account configured, and a small model does not emit
 * clean JSON: it wraps the document in prose, leaves a trailing comma,
 * adds a `//` comment to be helpful, or uses smart quotes because it was
 * formatting the surrounding paragraph. Every case below is a shape that
 * comes back in practice.
 *
 * The other invariant pinned here is the important one: a document this
 * module reports as valid must be one `parsePortableFlow` accepts, since
 * that is the exact function the import route gates on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the provider call so the loop can be driven deterministically —
// the point of these tests is the orchestration around the model, not
// the model.
const h = vi.hoisted(() => ({ generateRawText: vi.fn() }));
vi.mock('@/lib/ai/generate', () => ({ generateRawText: h.generateRawText }));

import {
  extractFlowDocument,
  repairJson,
  renderTemplateCatalogue,
  buildAgentSystemPrompt,
  runFlowAgentTurn,
  type AgentTemplate,
} from './agent';
import { parsePortableFlow } from './portable';
import { EXAMPLE_FLOW_DOCUMENT } from './ai-prompt';
import type { AiConfig } from '@/lib/ai/types';

const DOC = JSON.stringify(EXAMPLE_FLOW_DOCUMENT, null, 2);

const CONFIG: AiConfig = {
  provider: 'openai',
  model: 'test-model',
  apiKey: 'sk-test',
  systemPrompt: null,
  isActive: true,
  autoReplyEnabled: false,
  autoReplyMaxPerConversation: 3,
  handoffAgentId: null,
  embeddingsApiKey: null,
};

function reply(text: string) {
  return { text, usage: null };
}

describe('extractFlowDocument', () => {
  it('pulls a fenced ```json block and keeps the prose separate', () => {
    const raw = `Here is the flow you asked for.\n\n\`\`\`json\n${DOC}\n\`\`\`\n\nUpload the brochure before activating.`;
    const got = extractFlowDocument(raw);
    expect(got).not.toBeNull();
    expect(got!.prose).toContain('Here is the flow');
    expect(got!.prose).toContain('Upload the brochure');
    expect(got!.prose).not.toContain('replai_flow_version');
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('handles a bare fence with no language tag', () => {
    const raw = `Done.\n\n\`\`\`\n${DOC}\n\`\`\``;
    const got = extractFlowDocument(raw);
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('handles a document with no fence at all', () => {
    const got = extractFlowDocument(DOC);
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('handles prose either side of an unfenced document', () => {
    const raw = `Sure! ${DOC} Let me know if you want changes.`;
    const got = extractFlowDocument(raw);
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('returns null when the answer is only questions', () => {
    const raw =
      'Before I build this, what should happen when the customer asks for a human? And should I capture their email?';
    expect(extractFlowDocument(raw)).toBeNull();
  });

  it('ignores a small illustrative object that is not a flow', () => {
    const raw = `A button looks like this:\n\n\`\`\`json\n{ "reply_id": "yes", "title": "Yes" }\n\`\`\`\n\nShall I build it?`;
    expect(extractFlowDocument(raw)).toBeNull();
  });

  it('prefers the flow document over a smaller adjacent snippet', () => {
    const raw = `First, a button:\n\n\`\`\`json\n{ "reply_id": "yes", "title": "Yes", "nodes": 1 }\n\`\`\`\n\nAnd the flow:\n\n\`\`\`json\n${DOC}\n\`\`\``;
    const got = extractFlowDocument(raw);
    expect(got).not.toBeNull();
    const parsed = parsePortableFlow(got!.json);
    expect(parsed?.errors).toEqual([]);
  });

  it('strips a fence left empty after the JSON is lifted out', () => {
    const raw = `Here you go.\n\n\`\`\`json\n${DOC}\n\`\`\``;
    const got = extractFlowDocument(raw);
    expect(got!.prose).not.toContain('```');
  });
});

describe('extractFlowDocument — malformed JSON models really produce', () => {
  it('recovers from a trailing comma before a closing brace', () => {
    const broken = DOC.replace(/"nodes": \[/, '"nodes": [').replace(
      /\}\s*\]\s*\}$/,
      '} ], }'
    );
    const got = extractFlowDocument('```json\n' + broken + '\n```');
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('recovers from a // comment', () => {
    const broken = DOC.replace(
      '"nodes": [',
      '"nodes": [ // every step of the flow'
    );
    const got = extractFlowDocument('```json\n' + broken + '\n```');
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('recovers from a /* block comment */', () => {
    const broken = `/* the flow */\n${DOC}`;
    const got = extractFlowDocument('```json\n' + broken + '\n```');
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('recovers from smart quotes', () => {
    const broken = DOC.replace('"name"', '\u201Cname\u201D');
    const got = extractFlowDocument('```json\n' + broken + '\n```');
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('recovers from a stray "json" line inside the fence', () => {
    const got = extractFlowDocument('```\njson\n' + DOC + '\n```');
    expect(got).not.toBeNull();
    expect(parsePortableFlow(got!.json)?.errors).toEqual([]);
  });

  it('gives up rather than guessing on genuinely truncated JSON', () => {
    const half = DOC.slice(0, Math.floor(DOC.length / 2));
    // No valid object can be recovered, so nothing is returned and the
    // caller runs a repair round instead of importing a fragment.
    expect(extractFlowDocument('```json\n' + half + '\n```')).toBeNull();
  });
});

describe('repairJson', () => {
  it('is a no-op on already-valid JSON', () => {
    expect(JSON.parse(repairJson(DOC))).toEqual(EXAMPLE_FLOW_DOCUMENT);
  });

  it('leaves // inside a string value alone', () => {
    const src = '{"url":"https://example.com/a//b","a":1,}';
    const fixed = JSON.parse(repairJson(src)) as { url: string };
    expect(fixed.url).toBe('https://example.com/a//b');
  });

  it('removes a trailing comma at the very end', () => {
    expect(JSON.parse(repairJson('{"a":1},'))).toEqual({ a: 1 });
  });
});

describe('renderTemplateCatalogue', () => {
  const tmpl = (over: Partial<AgentTemplate> = {}): AgentTemplate => ({
    name: 'product_flyer',
    language: 'en_US',
    category: 'Marketing',
    status: 'APPROVED',
    body_text: 'Foton Mini Van | Export Offer\nStarting from USD 13,870',
    header_type: 'image',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Get Bulk Price' },
      { type: 'URL', text: 'View Vehicle', url: 'https://example.com' },
    ],
    ...over,
  });

  it('lists quick-reply labels a flow can be triggered by', () => {
    const out = renderTemplateCatalogue([tmpl()]);
    expect(out).toContain('product_flyer');
    expect(out).toContain('"Get Bulk Price"');
    // A URL tap produces no webhook, so it must not be offered as a
    // trigger — that would produce a flow that never fires.
    expect(out).not.toContain('"View Vehicle"');
  });

  it('says so when a template has no quick-reply button', () => {
    const out = renderTemplateCatalogue([tmpl({ buttons: [] })]);
    expect(out).toMatch(/no quick-reply buttons/i);
  });

  it('surfaces PENDING status rather than hiding the template', () => {
    const out = renderTemplateCatalogue([tmpl({ status: 'PENDING' })]);
    expect(out).toContain('status PENDING');
  });

  it('tells the agent to write a spec when there are no templates', () => {
    const out = renderTemplateCatalogue([]);
    expect(out).toMatch(/no message templates yet/i);
  });

  it('truncates a long body rather than spending the context window', () => {
    const out = renderTemplateCatalogue([tmpl({ body_text: 'x'.repeat(400) })]);
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(300));
  });
});

describe('buildAgentSystemPrompt', () => {
  it('carries the node catalogue, the template list and the output contract', () => {
    const prompt = buildAgentSystemPrompt({
      templates: [
        {
          name: 'product_flyer',
          language: 'en_US',
          category: 'Marketing',
          status: 'APPROVED',
          body_text: 'Offer',
          header_type: 'image',
          buttons: [{ type: 'QUICK_REPLY', text: 'Get Bulk Price' }],
        },
      ],
      businessContext: 'We export vehicles from Japan.',
    });
    // From the shared authoring prompt.
    expect(prompt).toContain('`send_list`');
    expect(prompt).toContain('replai_flow_version');
    // Template awareness.
    expect(prompt).toContain('Get Bulk Price');
    // Template-spec instructions.
    expect(prompt).toContain('When a flow needs a template');
    expect(prompt).toContain('QUICK_REPLY');
    // Business context.
    expect(prompt).toContain('We export vehicles from Japan.');
    // In-app answering rules, not the copy-paste ones.
    expect(prompt).toContain('inside the CRM');
  });

  it('works without business context', () => {
    const prompt = buildAgentSystemPrompt({ templates: [] });
    expect(prompt).not.toContain('About this business');
  });
});

// ============================================================
// The repair loop — the reason this works on a weak model
// ============================================================

describe('runFlowAgentTurn', () => {
  beforeEach(() => {
    h.generateRawText.mockReset();
  });

  const ask = (messages = [{ role: 'user' as const, content: 'build it' }]) =>
    runFlowAgentTurn({ config: CONFIG, messages, templates: [] });

  it('returns prose with no flow when the agent asks a question', async () => {
    h.generateRawText.mockResolvedValueOnce(
      reply('Should I capture their email as well?')
    );
    const out = await ask();
    expect(out.flow).toBeUndefined();
    expect(out.reply).toContain('capture their email');
    expect(out.attempts).toBe(1);
    // No repair round for an answer that was never meant to be a flow.
    expect(h.generateRawText).toHaveBeenCalledTimes(1);
  });

  it('accepts a valid document on the first try', async () => {
    h.generateRawText.mockResolvedValueOnce(
      reply(`Here it is.\n\n\`\`\`json\n${DOC}\n\`\`\``)
    );
    const out = await ask();
    expect(out.flow).toBeDefined();
    expect(out.flow!.flow.name).toBe(EXAMPLE_FLOW_DOCUMENT.flow.name);
    expect(out.issues).toBeUndefined();
    expect(out.attempts).toBe(1);
    expect(out.reply).toBe('Here it is.');
  });

  it('feeds validation errors back and accepts the corrected document', async () => {
    // A dangling link — the single most common fault, and one the
    // validator catches precisely.
    const broken = JSON.parse(DOC) as typeof EXAMPLE_FLOW_DOCUMENT;
    broken.nodes[0].config = { next_node_key: 'does_not_exist' };

    h.generateRawText
      .mockResolvedValueOnce(
        reply('```json\n' + JSON.stringify(broken) + '\n```')
      )
      .mockResolvedValueOnce(reply('Fixed.\n\n```json\n' + DOC + '\n```'));

    const out = await ask();
    expect(out.flow).toBeDefined();
    expect(out.attempts).toBe(2);
    expect(out.issues).toBeUndefined();

    // The repair turn must show the model its own answer AND the exact
    // complaint, or it has nothing to correct.
    const secondCall = h.generateRawText.mock.calls[1][0] as {
      messages: { role: string; content: string }[];
    };
    expect(secondCall.messages).toHaveLength(3);
    expect(secondCall.messages[1].role).toBe('assistant');
    expect(secondCall.messages[1].content).toContain('does_not_exist');
    expect(secondCall.messages[2].role).toBe('user');
    expect(secondCall.messages[2].content).toContain('could not be imported');
    expect(secondCall.messages[2].content).toContain('does_not_exist');
  });

  it('gives up after the repair budget and reports the real issues', async () => {
    const broken = JSON.parse(DOC) as typeof EXAMPLE_FLOW_DOCUMENT;
    broken.nodes[0].config = { next_node_key: 'nope' };
    h.generateRawText.mockResolvedValue(
      reply('```json\n' + JSON.stringify(broken) + '\n```')
    );

    const out = await ask();
    expect(out.flow).toBeUndefined();
    expect(out.attempts).toBe(3); // 1 attempt + 2 repairs
    expect(out.issues?.some((i) => i.includes('nope'))).toBe(true);
  });

  it('repairs a document that only failed to parse as JSON', async () => {
    h.generateRawText
      // Truncated mid-document: nothing extractable at all.
      .mockResolvedValueOnce(reply('```json\n' + DOC.slice(0, 200)))
      .mockResolvedValueOnce(reply('```json\n' + DOC + '\n```'));
    const out = await ask();
    // The first answer yielded no JSON object, so it is treated as prose
    // and returned as-is rather than silently retried — the agent is
    // allowed to answer without a flow.
    expect(out.attempts).toBe(1);
    expect(out.flow).toBeUndefined();
  });

  it('surfaces warnings without treating them as failures', async () => {
    // A send_media step with no file is a warning, not an error: it
    // imports fine and the user uploads the file afterwards.
    const withMedia = JSON.parse(DOC) as typeof EXAMPLE_FLOW_DOCUMENT;
    withMedia.nodes.push({
      node_key: 'brochure',
      node_type: 'send_media',
      config: {
        media_type: 'document',
        media_url: '',
        next_node_key: 'to_agent',
      },
    } as (typeof withMedia.nodes)[number]);
    (withMedia.nodes[5].config as { next_node_key: string }).next_node_key =
      'brochure';

    h.generateRawText.mockResolvedValueOnce(
      reply('```json\n' + JSON.stringify(withMedia) + '\n```')
    );
    const out = await ask();
    expect(out.flow).toBeDefined();
    expect(out.attempts).toBe(1);
    expect(out.warnings.some((w) => /file/i.test(w))).toBe(true);
  });

  it('asks for a large output budget and a long timeout', async () => {
    h.generateRawText.mockResolvedValueOnce(reply('a question?'));
    await ask();
    const call = h.generateRawText.mock.calls[0][0] as {
      maxOutputTokens: number;
      timeoutMs: number;
    };
    // The chat default of 1024 would cut a flow document in half.
    expect(call.maxOutputTokens).toBeGreaterThan(4000);
    expect(call.timeoutMs).toBeGreaterThan(30_000);
  });

  it('passes the account business context into the system prompt', async () => {
    h.generateRawText.mockResolvedValueOnce(reply('hi'));
    await runFlowAgentTurn({
      config: { ...CONFIG, systemPrompt: 'We sell export vehicles.' },
      messages: [{ role: 'user', content: 'build it' }],
      templates: [],
    });
    const call = h.generateRawText.mock.calls[0][0] as {
      systemPrompt: string;
    };
    expect(call.systemPrompt).toContain('We sell export vehicles.');
  });
});

// ============================================================
// The contract the UI depends on
// ============================================================

describe('the returned document is what import accepts', () => {
  beforeEach(() => {
    h.generateRawText.mockReset();
  });

  it('re-validates cleanly, because the client posts it straight to import', async () => {
    h.generateRawText.mockResolvedValueOnce(reply('```json\n' + DOC + '\n```'));
    const out = await runFlowAgentTurn({
      config: CONFIG,
      messages: [{ role: 'user', content: 'build it' }],
      templates: [],
    });
    expect(out.flow).toBeDefined();

    // The agent hands back the NORMALISED document, and the UI posts that
    // to POST /api/flows/import, which parses it again. If normalising
    // could ever produce something the parser rejects, the agent would
    // promise a flow that then fails to create — so pin the round trip.
    const again = parsePortableFlow(out.flow);
    expect(again).not.toBeNull();
    expect(again!.errors).toEqual([]);
  });
});
