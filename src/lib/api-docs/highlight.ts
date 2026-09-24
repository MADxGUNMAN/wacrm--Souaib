// ============================================================
// A small, dependency-free syntax highlighter for the docs samples.
//
// ─── Why not Shiki or Prism ───────────────────────────────────────
//
// Both are excellent and both are the wrong size for this job. Shiki
// ships a WASM regex engine plus TextMate grammars (hundreds of KB) and
// Prism wants a global registry and a CSS theme. We highlight six
// languages of GENERATED code — no user input, no exotic syntax, no
// nested templating — so the surface is a few hundred bytes of rules.
// Adding a dependency for that costs bundle size and a version to keep
// current, for output nobody can tell apart at this size.
//
// ─── The one invariant ───────────────────────────────────────────
//
// Concatenating every token's `value` MUST reproduce the input exactly.
// A highlighter that drops or rewrites a character turns a correct
// sample into a broken one the reader then copies, which is far worse
// than plain monospace text. `highlight.test.ts` asserts this
// round-trip for every generated sample in every language.
//
// Unknown grammars degrade to a single `plain` token rather than
// throwing, so a new language added to the samples renders unstyled
// instead of blanking the page.
// ============================================================

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'boolean'
  | 'variable'
  | 'punctuation';

export interface Token {
  kind: TokenKind;
  value: string;
}

interface Grammar {
  /** Sequences that begin a to-end-of-line comment. */
  lineComments: string[];
  /** Quote characters that open a string. */
  quotes: string[];
  /** Quotes inside which a backslash does NOT escape (POSIX shell). */
  rawQuotes: string[];
  keywords: string[];
  literals: string[];
  /** True where `$name` is a variable (PHP). */
  dollarVariables: boolean;
}

const JS: Grammar = {
  lineComments: ['//'],
  quotes: ['"', "'", '`'],
  rawQuotes: [],
  keywords: [
    'async',
    'await',
    'catch',
    'const',
    'else',
    'export',
    'function',
    'if',
    'import',
    'let',
    'new',
    'return',
    'throw',
    'try',
    'var',
  ],
  literals: ['true', 'false', 'null', 'undefined'],
  dollarVariables: false,
};

const GRAMMARS: Record<string, Grammar> = {
  javascript: JS,
  json: {
    lineComments: [],
    quotes: ['"'],
    rawQuotes: [],
    keywords: [],
    literals: ['true', 'false', 'null'],
    dollarVariables: false,
  },
  bash: {
    lineComments: ['#'],
    quotes: ['"', "'"],
    // In POSIX shell nothing is special inside single quotes, so a
    // backslash there is a literal backslash.
    rawQuotes: ["'"],
    keywords: ['curl', 'export', 'if', 'then', 'fi', 'echo'],
    literals: [],
    dollarVariables: true,
  },
  python: {
    lineComments: ['#'],
    quotes: ['"', "'"],
    rawQuotes: [],
    keywords: [
      'as',
      'def',
      'elif',
      'else',
      'except',
      'for',
      'from',
      'if',
      'import',
      'in',
      'not',
      'raise',
      'return',
      'try',
      'while',
      'with',
    ],
    literals: ['True', 'False', 'None'],
    dollarVariables: false,
  },
  php: {
    lineComments: ['//', '#'],
    quotes: ['"', "'"],
    rawQuotes: [],
    keywords: [
      'echo',
      'else',
      'function',
      'if',
      'new',
      'return',
      'throw',
      'try',
      'catch',
    ],
    literals: ['true', 'false', 'null'],
    dollarVariables: true,
  },
  go: {
    lineComments: ['//'],
    quotes: ['"', '`'],
    rawQuotes: ['`'],
    keywords: [
      'defer',
      'else',
      'func',
      'if',
      'import',
      'package',
      'panic',
      'range',
      'return',
      'var',
    ],
    literals: ['true', 'false', 'nil'],
    dollarVariables: false,
  },
  ruby: {
    lineComments: ['#'],
    quotes: ['"', "'"],
    rawQuotes: ["'"],
    keywords: [
      'def',
      'do',
      'else',
      'end',
      'if',
      'raise',
      'require',
      'return',
      'unless',
      'puts',
    ],
    literals: ['true', 'false', 'nil'],
    dollarVariables: false,
  },
};

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Push a token, merging into the previous one when the kind matches. */
function push(tokens: Token[], kind: TokenKind, value: string): void {
  if (value === '') return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) {
    last.value += value;
    return;
  }
  tokens.push({ kind, value });
}

/**
 * Tokenize `code` under `grammarName`. Never throws; an unrecognised
 * grammar yields one `plain` token covering the whole input.
 */
export function highlight(code: string, grammarName: string): Token[] {
  const grammar = GRAMMARS[grammarName];
  if (!grammar) return code === '' ? [] : [{ kind: 'plain', value: code }];

  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    // ── comments ──
    const comment = grammar.lineComments.find((c) => code.startsWith(c, i));
    if (comment) {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      push(tokens, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }

    // ── strings ──
    if (grammar.quotes.includes(ch)) {
      const raw = grammar.rawQuotes.includes(ch);
      let j = i + 1;
      while (j < code.length) {
        if (!raw && code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j += 1;
          break;
        }
        j += 1;
      }
      push(tokens, 'string', code.slice(i, Math.min(j, code.length)));
      i = Math.min(j, code.length);
      continue;
    }

    // ── PHP / shell variables ──
    if (
      grammar.dollarVariables &&
      ch === '$' &&
      isIdentifierStart(code[i + 1] ?? '')
    ) {
      let j = i + 1;
      while (j < code.length && isIdentifierPart(code[j])) j += 1;
      push(tokens, 'variable', code.slice(i, j));
      i = j;
      continue;
    }

    // ── numbers ──
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < code.length && /[0-9._]/.test(code[j])) j += 1;
      push(tokens, 'number', code.slice(i, j));
      i = j;
      continue;
    }

    // ── identifiers, keywords, literals ──
    if (isIdentifierStart(ch)) {
      let j = i;
      while (j < code.length && isIdentifierPart(code[j])) j += 1;
      const word = code.slice(i, j);
      const kind: TokenKind = grammar.literals.includes(word)
        ? 'boolean'
        : grammar.keywords.includes(word)
          ? 'keyword'
          : 'plain';
      push(tokens, kind, word);
      i = j;
      continue;
    }

    // ── punctuation vs whitespace ──
    // Whitespace is 'plain' so it merges with neighbours and doesn't
    // fragment the output into hundreds of tiny spans.
    push(tokens, /\s/.test(ch) ? 'plain' : 'punctuation', ch);
    i += 1;
  }

  return tokens;
}

/** Tailwind classes per token kind, tuned for the dark code surface. */
export const TOKEN_CLASSES: Record<TokenKind, string> = {
  plain: 'text-slate-200',
  comment: 'text-slate-500 italic',
  string: 'text-emerald-300',
  number: 'text-amber-300',
  keyword: 'text-sky-300',
  boolean: 'text-violet-300',
  variable: 'text-rose-300',
  punctuation: 'text-slate-400',
};
