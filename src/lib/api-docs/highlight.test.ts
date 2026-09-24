import { describe, expect, it } from 'vitest';

import { TOKEN_CLASSES, highlight, type TokenKind } from './highlight';
import { SAMPLE_LANGUAGES, generateSample } from './code-samples';
import { ALL_ENDPOINTS } from './spec';

/** Rebuild the source from tokens — the invariant everything rests on. */
function reassemble(code: string, grammar: string): string {
  return highlight(code, grammar)
    .map((t) => t.value)
    .join('');
}

function kindsOf(code: string, grammar: string): TokenKind[] {
  return highlight(code, grammar).map((t) => t.kind);
}

function valuesOfKind(
  code: string,
  grammar: string,
  kind: TokenKind
): string[] {
  return highlight(code, grammar)
    .filter((t) => t.kind === kind)
    .map((t) => t.value);
}

describe('the round-trip invariant', () => {
  it('reproduces every generated sample exactly, in every language', () => {
    // If this ever fails, the docs are showing code that differs from
    // the code the generators produced — a reader would copy a broken
    // snippet. This is the single most important test in the module.
    for (const endpoint of ALL_ENDPOINTS) {
      for (const language of SAMPLE_LANGUAGES) {
        const code = generateSample(endpoint, language.id);
        expect(
          reassemble(code, language.highlight),
          `${endpoint.id}/${language.id}`
        ).toBe(code);
      }
    }
  });

  it('reproduces the response examples highlighted as JSON', () => {
    for (const endpoint of ALL_ENDPOINTS) {
      for (const response of endpoint.responses) {
        if (!response.example) continue;
        const json = JSON.stringify(response.example, null, 2);
        expect(reassemble(json, 'json'), endpoint.id).toBe(json);
      }
    }
  });

  it('survives inputs designed to trip a tokenizer', () => {
    const nasty = [
      '', // empty
      '   \n\t  ', // whitespace only
      '"unterminated string',
      "'", // a lone quote
      '// comment with no newline',
      '#',
      '`',
      '\\',
      '$',
      '$$$',
      '{"a":"\\"escaped\\""}',
      'x = 1_000.50',
      'emoji 🎉 and üñïçødé',
    ];
    for (const grammar of [
      'javascript',
      'json',
      'bash',
      'python',
      'php',
      'go',
      'ruby',
    ]) {
      for (const input of nasty) {
        expect(reassemble(input, grammar), `${grammar}: ${input}`).toBe(input);
      }
    }
  });

  it('returns no tokens for empty input and never an empty token', () => {
    expect(highlight('', 'javascript')).toEqual([]);
    for (const language of SAMPLE_LANGUAGES) {
      const code = generateSample(ALL_ENDPOINTS[0], language.id);
      for (const token of highlight(code, language.highlight)) {
        expect(token.value.length, language.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('unknown grammars degrade instead of failing', () => {
  it('returns the whole input as one plain token', () => {
    const code = 'some::unknown <lang> code';
    expect(highlight(code, 'brainfuck')).toEqual([
      { kind: 'plain', value: code },
    ]);
  });

  it('still returns nothing for empty input', () => {
    expect(highlight('', 'brainfuck')).toEqual([]);
  });
});

describe('javascript', () => {
  it('marks keywords, strings, and comments', () => {
    const code = "const x = 'hi'; // note\nawait fetch(x);";
    expect(valuesOfKind(code, 'javascript', 'keyword')).toContain('const');
    expect(valuesOfKind(code, 'javascript', 'keyword')).toContain('await');
    expect(valuesOfKind(code, 'javascript', 'string')).toContain("'hi'");
    expect(valuesOfKind(code, 'javascript', 'comment')).toContain('// note');
  });

  it('treats an escaped quote as part of the string', () => {
    const code = '"a \\" b"';
    expect(valuesOfKind(code, 'javascript', 'string')).toEqual([code]);
  });

  it('marks true/false/null as literals, not identifiers', () => {
    expect(valuesOfKind('a = true', 'javascript', 'boolean')).toEqual(['true']);
    expect(valuesOfKind('a = null', 'javascript', 'boolean')).toEqual(['null']);
  });
});

describe('python', () => {
  it('uses Python literal spelling', () => {
    const code = 'x = True\ny = None\nz = False';
    const literals = valuesOfKind(code, 'python', 'boolean');
    expect(literals).toEqual(['True', 'None', 'False']);
  });

  it('does not treat lowercase true as a literal', () => {
    // In Python `true` is just a name, and colouring it like a keyword
    // would misinform the reader.
    expect(valuesOfKind('x = true', 'python', 'boolean')).toEqual([]);
  });

  it('keeps an f-string with nested quotes as one string token', () => {
    const code = `f"{body['error']['code']}"`;
    // The generated Python samples rely on this exact shape.
    const strings = valuesOfKind(code, 'python', 'string');
    expect(strings).toEqual([`"{body['error']['code']}"`]);
  });

  it('treats # as a comment', () => {
    expect(valuesOfKind('x = 1  # why', 'python', 'comment')).toEqual([
      '# why',
    ]);
  });
});

describe('bash', () => {
  it('does not honour backslash escapes inside single quotes', () => {
    // POSIX shell: nothing is special inside '...'. Treating \' as an
    // escape would swallow the closing quote and mis-colour the rest
    // of the command.
    const code = "curl 'a\\' rest";
    expect(valuesOfKind(code, 'bash', 'string')).toEqual(["'a\\'"]);
    expect(reassemble(code, 'bash')).toBe(code);
  });

  it('does not start a comment inside a quoted string', () => {
    const code = "curl 'http://x/#frag'";
    expect(valuesOfKind(code, 'bash', 'comment')).toEqual([]);
  });

  it('highlights curl itself', () => {
    expect(valuesOfKind('curl -X POST', 'bash', 'keyword')).toEqual(['curl']);
  });
});

describe('go', () => {
  it('treats a backtick raw string as one token, quotes and all', () => {
    const code = 'payload := []byte(`{"a": "b"}`)';
    expect(valuesOfKind(code, 'go', 'string')).toEqual(['`{"a": "b"}`']);
  });

  it('does not process escapes inside a raw string', () => {
    const code = '`a\\`';
    expect(valuesOfKind(code, 'go', 'string')).toEqual(['`a\\`']);
  });

  it('marks nil as a literal and func as a keyword', () => {
    expect(valuesOfKind('func main() { return nil }', 'go', 'boolean')).toEqual(
      ['nil']
    );
    expect(valuesOfKind('func main()', 'go', 'keyword')).toEqual(['func']);
  });
});

describe('php', () => {
  it('marks $variables distinctly', () => {
    const code = '$ch = curl_init();';
    expect(valuesOfKind(code, 'php', 'variable')).toEqual(['$ch']);
  });

  it('does not treat a bare $ as a variable', () => {
    expect(valuesOfKind('$ alone', 'php', 'variable')).toEqual([]);
    expect(reassemble('$ alone', 'php')).toBe('$ alone');
  });
});

describe('ruby', () => {
  it('marks nil and require', () => {
    expect(valuesOfKind('require "json"', 'ruby', 'keyword')).toEqual([
      'require',
    ]);
    expect(valuesOfKind('x = nil', 'ruby', 'boolean')).toEqual(['nil']);
  });
});

describe('json', () => {
  it('has no comment syntax', () => {
    // A `#` or `//` inside a JSON body is data, not a comment.
    const code = '{"url": "https://x/#frag"}';
    expect(valuesOfKind(code, 'json', 'comment')).toEqual([]);
  });

  it('marks strings and numbers', () => {
    const code = '{"a": "b", "n": 42}';
    expect(valuesOfKind(code, 'json', 'string')).toEqual(['"a"', '"b"', '"n"']);
    expect(valuesOfKind(code, 'json', 'number')).toEqual(['42']);
  });
});

describe('token merging', () => {
  it('coalesces adjacent same-kind tokens to keep spans few', () => {
    // Whitespace joins its neighbours rather than splitting the run,
    // so a long sample does not become hundreds of DOM nodes.
    const kinds = kindsOf('const a = 1', 'javascript');
    expect(kinds).toEqual([
      'keyword',
      'plain',
      'punctuation',
      'plain',
      'number',
    ]);
  });

  it('produces far fewer tokens than characters on a real sample', () => {
    const code = generateSample(ALL_ENDPOINTS[1], 'node');
    expect(highlight(code, 'javascript').length).toBeLessThan(code.length / 3);
  });
});

describe('styling', () => {
  it('has a class for every token kind the tokenizer can emit', () => {
    const kinds: TokenKind[] = [
      'plain',
      'comment',
      'string',
      'number',
      'keyword',
      'boolean',
      'variable',
      'punctuation',
    ];
    for (const kind of kinds) {
      expect(TOKEN_CLASSES[kind], kind).toBeTruthy();
    }
  });
});
