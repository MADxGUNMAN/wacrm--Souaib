/**
 * Helper utility for validating text in notes fields (e.g. Deal notes).
 * Enforces word limits and restricts code/HTML snippet injections.
 */

/**
 * Counts the number of words in a string.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Comprehensive patterns matching code snippets, HTML/XML tags, script injections,
 * programming language constructs, JSON objects, and code syntax.
 */
const CODE_PATTERNS = [
  // HTML / XML / JSX tags: e.g. <div>, <script>, </p>, <a href="...">, <Component />
  /<\/?\s*[a-zA-Z][^>]*>/i,

  // Backticks (inline code `...` or code blocks ```...```)
  /`/,

  // JS/TS/C/Java function declarations: e.g. function foo(), function(), async function
  /\b(async\s+)?function\b/i,

  // Class declarations: e.g. class Foo, class extends
  /\bclass\s+[A-Za-z_$]/i,

  // Variable declarations: e.g. const x, let y, var z, const { a }
  /\b(const|let|var)\s+[\{\[\w_$]/i,

  // Import / Export statements: e.g. import foo from 'bar', export default, export const
  /\b(import\s+.*?from|export\s+(default|const|let|var|function|class|type|interface))\b/i,

  // Python definitions & imports: e.g. def foo():, import os, from x import y
  /\bdef\s+[a-zA-Z_]\w*\s*\(|\bfrom\s+\w+\s+import\b/i,

  // Common function calls: e.g. alert(...), eval(...), console.log(...), exec(...), require(...)
  /\b(alert|eval|exec|prompt|confirm|require|console\.(log|warn|error|info|debug))\s*\(/i,

  // DOM / Window / Process objects: e.g. document.getElementById, window.location, process.env
  /\b(document\.|window\.|process\.|global\.)/i,

  // Code operators & arrows: e.g. =>, ===, !==
  /=>|===|!==/,

  // Code blocks / JSON objects with key-value pairs inside curly braces: e.g. { ... }
  /\{[\s\S]*?\}/,

  // SQL queries: e.g. SELECT ... FROM, INSERT INTO, DELETE FROM, DROP TABLE, UPDATE ... SET
  /\b(SELECT\s+.*?FROM|INSERT\s+INTO|UPDATE\s+.*?SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/i,

  // CSS rules: e.g. .classname { color: red; } or #id { ... }
  /[.#][a-zA-Z0-9_-]+\s*\{[^}]*\}/,

  // Inline script / data URIs: e.g. javascript:, data:text/html
  /(javascript|data)\s*:/i,
];

export interface NotesValidationResult {
  isValid: boolean;
  error: string | null;
  wordCount: number;
}

export const MAX_NOTES_WORDS = 1000;

/**
 * Validates a notes string against length limits and code restriction rules.
 */
export function validateNotes(text: string): NotesValidationResult {
  const wordCount = countWords(text);

  if (wordCount > MAX_NOTES_WORDS) {
    return {
      isValid: false,
      error: `Notes cannot exceed ${MAX_NOTES_WORDS} words (currently ${wordCount} words).`,
      wordCount,
    };
  }

  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isValid: false,
        error:
          'Notes must contain plain text only. Code snippets, HTML tags, or scripts are not allowed.',
        wordCount,
      };
    }
  }

  return {
    isValid: true,
    error: null,
    wordCount,
  };
}
