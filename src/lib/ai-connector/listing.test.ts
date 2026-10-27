// Keeps the directory listing materials in step with the server:
// every tool has a justification for each annotation, and the hint
// values the justifications argue for are the ones the server sends
// (the ChatGPT portal imports annotations from the live server and the
// justification text can't override them).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG, annotationsFor } from './tool-catalog';

const LISTING = path.join(process.cwd(), 'docs', 'ai-connector', 'listing');

type Entry = Record<
  'readOnlyHint' | 'openWorldHint' | 'destructiveHint',
  [boolean, string]
>;

const justifications = JSON.parse(
  fs.readFileSync(path.join(LISTING, 'tool-justifications.json'), 'utf8')
) as Record<string, Entry | string>;

describe('listing: tool justifications', () => {
  const tools = Object.keys(justifications).filter((k) => !k.startsWith('$'));

  it('cover exactly the catalog tools', () => {
    expect(tools.sort()).toEqual(Object.keys(TOOL_CATALOG).sort());
  });

  it('argue for the annotation values the server actually sends', () => {
    for (const name of tools) {
      const entry = justifications[name] as Entry;
      const sent = annotationsFor(
        TOOL_CATALOG[name as keyof typeof TOOL_CATALOG]
      );
      for (const hint of [
        'readOnlyHint',
        'openWorldHint',
        'destructiveHint',
      ] as const) {
        expect([name, hint, entry[hint][0]]).toEqual([name, hint, sent[hint]]);
        expect(entry[hint][1].trim().length).toBeGreaterThan(5);
      }
    }
  });
});

describe('listing: ChatGPT package', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(LISTING, 'chatgpt-plugin', '.codex-plugin', 'plugin.json'),
      'utf8'
    )
  );
  const mcp = JSON.parse(
    fs.readFileSync(path.join(LISTING, 'chatgpt-plugin', '.mcp.json'), 'utf8')
  );

  it('meets the final-submission field limits', () => {
    const i = manifest.interface;
    expect(manifest.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description.length).toBeLessThanOrEqual(1024);
    expect(i.displayName.length).toBeLessThanOrEqual(30);
    expect(i.shortDescription.length).toBeLessThanOrEqual(30);
    expect(i.longDescription.length).toBeLessThanOrEqual(4000);
    expect(i.developerName.length).toBeLessThanOrEqual(80);
    expect(i.capabilities.length).toBeLessThanOrEqual(20);
    for (const c of i.capabilities) expect(c.length).toBeLessThanOrEqual(120);
    expect(i.defaultPrompt.length).toBeLessThanOrEqual(3);
    for (const p of i.defaultPrompt) {
      expect(p.length).toBeLessThanOrEqual(128);
      expect(p).not.toContain('@');
    }
    for (const k of [
      'websiteURL',
      'privacyPolicyURL',
      'termsOfServiceURL',
      'supportURL',
    ])
      expect(i[k]).toMatch(/^https:\/\/wacrm\.junkiescoder\.com\//);
  });

  it('points at the production MCP server', () => {
    expect(manifest.mcpServers).toBe('./.mcp.json');
    const servers = Object.values(mcp.mcpServers) as { url: string }[];
    expect(servers).toHaveLength(1);
    expect(servers[0].url).toBe('https://wacrm.junkiescoder.com/mcp');
  });
});
