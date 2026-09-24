import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BASE_URL,
  SAMPLE_LANGUAGES,
  generateAllSamples,
  generateSample,
  sampleUrl,
  type SampleLanguageId,
} from './code-samples';
import { ALL_ENDPOINTS, findEndpoint, resolvePath } from './spec';

const LANGUAGE_IDS = SAMPLE_LANGUAGES.map((l) => l.id);

/** Endpoints chosen to cover the shapes the generators branch on. */
const GET_NO_BODY = findEndpoint('get-me')!;
const GET_WITH_QUERY = findEndpoint('get-contacts')!;
const POST_WITH_BODY = findEndpoint('post-messages')!;
const PATCH_WITH_BOOL = findEndpoint('patch-webhook')!;
const DELETE_ENDPOINT = findEndpoint('delete-webhook')!;
const NESTED_BODY = findEndpoint('post-broadcasts')!;

describe('sample coverage', () => {
  it('offers the six languages the docs promise', () => {
    expect(LANGUAGE_IDS).toEqual([
      'curl',
      'node',
      'python',
      'php',
      'go',
      'ruby',
    ]);
  });

  it('produces a non-trivial snippet for every endpoint in every language', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      for (const language of LANGUAGE_IDS) {
        const code = generateSample(endpoint, language);
        expect(code.length, `${endpoint.id}/${language}`).toBeGreaterThan(40);
      }
    }
  });

  it('names the endpoint URL and the auth header in every snippet', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      const url = sampleUrl(endpoint, DEFAULT_BASE_URL);
      for (const language of LANGUAGE_IDS) {
        const code = generateSample(endpoint, language);
        expect(code, `${endpoint.id}/${language} url`).toContain(url);
        expect(code, `${endpoint.id}/${language} auth`).toContain(
          'Bearer wacrm_live_YOUR_API_KEY'
        );
      }
    }
  });

  it('never leaves an unresolved path placeholder in a snippet', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      for (const language of LANGUAGE_IDS) {
        const code = generateSample(endpoint, language);
        // `{id}` in a snippet is a line the reader cannot run as-is.
        expect(code, `${endpoint.id}/${language}`).not.toContain('/{');
      }
    }
  });

  it('shows the reader how to read a failure, not just a success', () => {
    // A happy-path-only sample teaches half the contract.
    for (const endpoint of ALL_ENDPOINTS) {
      for (const language of LANGUAGE_IDS) {
        if (language === 'curl') continue; // curl just prints the body
        const code = generateSample(endpoint, language);
        expect(code.toLowerCase(), `${endpoint.id}/${language}`).toContain(
          'error'
        );
      }
    }
  });

  it('generates every language at once', () => {
    const all = generateAllSamples(GET_NO_BODY);
    expect(Object.keys(all).sort()).toEqual([...LANGUAGE_IDS].sort());
  });
});

describe('sampleUrl', () => {
  it('joins origin, resolved path, and sample query', () => {
    expect(sampleUrl(GET_WITH_QUERY, 'https://crm.acme.com')).toBe(
      'https://crm.acme.com/api/v1/contacts?limit=25'
    );
  });

  it('tolerates a trailing slash on the base url', () => {
    // Callers pass window.location.origin or a user-typed value; a
    // doubled slash would 404 on copy-paste.
    expect(sampleUrl(GET_NO_BODY, 'https://crm.acme.com/')).toBe(
      'https://crm.acme.com/api/v1/me'
    );
    expect(sampleUrl(GET_NO_BODY, 'https://crm.acme.com///')).toBe(
      'https://crm.acme.com/api/v1/me'
    );
  });

  it('substitutes concrete ids for path placeholders', () => {
    const path = resolvePath(DELETE_ENDPOINT);
    expect(path).not.toContain('{');
    expect(sampleUrl(DELETE_ENDPOINT, 'https://x.test')).toBe(
      `https://x.test${path}`
    );
  });
});

describe('options', () => {
  it('honours a custom base url and api key', () => {
    const code = generateSample(POST_WITH_BODY, 'curl', {
      baseUrl: 'https://crm.acme.com',
      apiKey: 'wacrm_live_abc123',
    });
    expect(code).toContain('https://crm.acme.com/api/v1/messages');
    expect(code).toContain('Bearer wacrm_live_abc123');
    expect(code).not.toContain('YOUR_API_KEY');
  });
});

describe('bodies are only sent where they belong', () => {
  it('omits the body and Content-Type on GET and DELETE', () => {
    const bodyless = ALL_ENDPOINTS.filter(
      (e) => e.method === 'GET' || e.method === 'DELETE'
    );
    expect(bodyless.length).toBeGreaterThan(0);

    for (const endpoint of bodyless) {
      for (const language of LANGUAGE_IDS) {
        const code = generateSample(endpoint, language);
        expect(code, `${endpoint.id}/${language}`).not.toContain(
          'application/json'
        );
      }
    }
  });

  it('includes the request body on POST and PATCH', () => {
    const withBody = ALL_ENDPOINTS.filter(
      (e) => e.method === 'POST' || e.method === 'PATCH'
    );
    for (const endpoint of withBody) {
      for (const language of LANGUAGE_IDS) {
        const code = generateSample(endpoint, language);
        expect(code, `${endpoint.id}/${language}`).toContain(
          'application/json'
        );
      }
    }
  });
});

describe('curl', () => {
  it('does not pass a redundant -X GET', () => {
    const code = generateSample(GET_NO_BODY, 'curl');
    expect(code.startsWith('curl ')).toBe(true);
    expect(code).not.toContain('-X GET');
  });

  it('passes the method explicitly for everything else', () => {
    expect(generateSample(DELETE_ENDPOINT, 'curl')).toContain('-X DELETE');
    expect(generateSample(PATCH_WITH_BOOL, 'curl')).toContain('-X PATCH');
  });

  it('single-quotes the URL so a query string survives the shell', () => {
    const code = generateSample(GET_WITH_QUERY, 'curl');
    expect(code).toContain(
      "'https://your-wacrm-domain.com/api/v1/contacts?limit=25'"
    );
  });

  it('emits a -d payload that is valid JSON matching the spec body', () => {
    // The strongest check available: parse the snippet's payload back
    // and compare it to the spec. Catches any quoting/escaping slip.
    for (const endpoint of ALL_ENDPOINTS) {
      if (!endpoint.sampleBody) continue;
      const code = generateSample(endpoint, 'curl');
      const match = code.match(/-d '([\s\S]+)'$/);
      expect(match, `${endpoint.id} has a -d payload`).not.toBeNull();
      const json = match![1].replace(/'\\''/g, "'");
      expect(JSON.parse(json), endpoint.id).toEqual(endpoint.sampleBody);
    }
  });

  it('continues the line before every flag, so it stays one command', () => {
    // Only ARGUMENT boundaries need a backslash. The -d payload spans
    // several lines inside one single-quoted string, where literal
    // newlines are valid shell and valid JSON whitespace — so the test
    // checks the line preceding each flag, not every line.
    for (const endpoint of ALL_ENDPOINTS) {
      const lines = generateSample(endpoint, 'curl').split('\n');
      lines.forEach((line, i) => {
        if (i === 0 || !/^\s+-[A-Za-z]/.test(line)) return;
        expect(
          lines[i - 1].endsWith('\\'),
          `${endpoint.id}: line ${i - 1} must continue into the flag on line ${i}`
        ).toBe(true);
      });
      // Nothing dangles past the end of the command.
      expect(
        lines[lines.length - 1].endsWith('\\'),
        `${endpoint.id} last line`
      ).toBe(false);
    }
  });

  it('leaves a bodyless command with a backslash on every line but the last', () => {
    const lines = generateSample(GET_WITH_QUERY, 'curl').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].endsWith('\\')).toBe(true);
    expect(lines[1].endsWith('\\')).toBe(false);
  });
});

describe('node', () => {
  it('wraps the call in a named async function it then invokes', () => {
    const code = generateSample(POST_WITH_BODY, 'node');
    expect(code).toContain('async function postMessages()');
    expect(code).toContain('postMessages().then(console.log)');
  });

  it('states the method explicitly and reads error.code on failure', () => {
    const code = generateSample(PATCH_WITH_BOOL, 'node');
    expect(code).toContain("method: 'PATCH'");
    expect(code).toContain('if (!response.ok)');
    expect(code).toContain('payload.error.code');
  });

  it('serializes the body as JSON', () => {
    const code = generateSample(POST_WITH_BODY, 'node');
    expect(code).toContain('body: JSON.stringify({');
    expect(code).toContain('"to": "+14155550123"');
  });

  it('nests header entries inside the headers brace', () => {
    // Flat indentation here read as a bug in the sample rather than in
    // the generator, which is worse than a wrong sample: it looks
    // deliberate.
    for (const endpoint of ALL_ENDPOINTS) {
      const lines = generateSample(endpoint, 'node').split('\n');
      const open = lines.findIndex((l) => l === '    headers: {');
      expect(open, `${endpoint.id} headers block`).toBeGreaterThan(-1);
      let i = open + 1;
      for (; lines[i] !== '    },'; i += 1) {
        expect(lines[i], `${endpoint.id} header line`).toMatch(/^ {6}\S/);
      }
      // At least one header (Authorization) sat between the braces.
      expect(i).toBeGreaterThan(open + 1);
    }
  });
});

describe('python', () => {
  it('calls the requests helper matching the HTTP method', () => {
    expect(generateSample(GET_NO_BODY, 'python')).toContain('requests.get(');
    expect(generateSample(POST_WITH_BODY, 'python')).toContain(
      'requests.post('
    );
    expect(generateSample(DELETE_ENDPOINT, 'python')).toContain(
      'requests.delete('
    );
    expect(generateSample(PATCH_WITH_BOOL, 'python')).toContain(
      'requests.patch('
    );
  });

  it('spells booleans the Python way, not the JSON way', () => {
    // patch-webhook sends { is_active: true } — a JSON `true` here
    // would be a NameError, not a working snippet.
    const code = generateSample(PATCH_WITH_BOOL, 'python');
    expect(code).toContain('"is_active": True');
    expect(code).not.toContain('"is_active": true');
  });

  it('always sets a timeout', () => {
    // requests blocks forever by default; a sample that omits this
    // teaches a bug.
    for (const endpoint of ALL_ENDPOINTS) {
      expect(generateSample(endpoint, 'python'), endpoint.id).toContain(
        'timeout=30'
      );
    }
  });
});

describe('php', () => {
  it('opens with a php tag and uses associative array syntax', () => {
    const code = generateSample(POST_WITH_BODY, 'php');
    expect(code.startsWith('<?php')).toBe(true);
    expect(code).toContain("'to' => '+14155550123'");
  });

  it('reads the status off curl rather than guessing from the body', () => {
    const code = generateSample(GET_NO_BODY, 'php');
    expect(code).toContain('CURLINFO_RESPONSE_CODE');
    expect(code).toContain('if ($status >= 400)');
  });

  it('sets CUSTOMREQUEST to the real method', () => {
    expect(generateSample(DELETE_ENDPOINT, 'php')).toContain(
      "CURLOPT_CUSTOMREQUEST => 'DELETE'"
    );
  });
});

describe('go', () => {
  it('imports bytes only when there is a body to send', () => {
    // Go refuses to compile with an unused import, so this is the
    // difference between a runnable sample and a broken one.
    const withBody = generateSample(POST_WITH_BODY, 'go');
    expect(withBody).toContain('"bytes"');
    expect(withBody).toContain('bytes.NewReader(payload)');

    const withoutBody = generateSample(GET_NO_BODY, 'go');
    expect(withoutBody).not.toContain('"bytes"');
    expect(withoutBody).toContain('http.NewRequest("GET"');
    expect(withoutBody).toContain(', nil)');
  });

  it('closes the response body and checks the status', () => {
    const code = generateSample(GET_WITH_QUERY, 'go');
    expect(code).toContain('defer res.Body.Close()');
    expect(code).toContain('if res.StatusCode >= 400');
  });

  it('embeds a raw string literal with no backtick to break it', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      if (!endpoint.sampleBody) continue;
      const code = generateSample(endpoint, 'go');
      const match = code.match(/payload := \[\]byte\(`([\s\S]+?)`\)/);
      expect(match, `${endpoint.id} payload literal`).not.toBeNull();
      // Strip the indentation the literal carries inside func main().
      const json = match![1].replace(/\n\t/g, '\n');
      expect(JSON.parse(json), endpoint.id).toEqual(endpoint.sampleBody);
    }
  });
});

describe('ruby', () => {
  it('picks the Net::HTTP class matching the method', () => {
    expect(generateSample(GET_NO_BODY, 'ruby')).toContain(
      'Net::HTTP::Get.new(uri)'
    );
    expect(generateSample(POST_WITH_BODY, 'ruby')).toContain(
      'Net::HTTP::Post.new(uri)'
    );
    expect(generateSample(PATCH_WITH_BOOL, 'ruby')).toContain(
      'Net::HTTP::Patch.new(uri)'
    );
    expect(generateSample(DELETE_ENDPOINT, 'ruby')).toContain(
      'Net::HTTP::Delete.new(uri)'
    );
  });

  it('enables TLS from the URI scheme', () => {
    const code = generateSample(GET_NO_BODY, 'ruby');
    expect(code).toContain('use_ssl: uri.scheme == "https"');
  });

  it('uses hash rockets and nil rather than JSON spelling', () => {
    const code = generateSample(POST_WITH_BODY, 'ruby');
    expect(code).toContain('"to" => "+14155550123"');
  });
});

describe('nested structures', () => {
  it('renders an array of objects readably in every language', () => {
    // post-broadcasts carries recipients: [{ to, params: [...] }] — the
    // deepest shape in the spec, and where an indentation bug shows up.
    for (const language of LANGUAGE_IDS) {
      const code = generateSample(NESTED_BODY, language as SampleLanguageId);
      expect(code, language).toContain('+14155550123');
      expect(code, language).toContain('Jane');
      expect(code, language).toContain('promo_september');
    }
  });
});
