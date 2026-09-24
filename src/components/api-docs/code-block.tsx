'use client';

// ============================================================
// CodeBlock — a highlighted, copyable snippet.
//
// The surface is dark in both themes on purpose. Code is the one thing
// on a docs page readers scan for shape rather than read linearly, and a
// constant dark panel keeps that shape recognisable when the rest of the
// page follows the app theme. Every serious API reference does the same.
//
// Highlighting runs in a `useMemo` over the pure tokenizer in
// `@/lib/api-docs/highlight`, whose round-trip invariant guarantees the
// rendered text equals the copied text — the reader never copies
// something different from what they read.
// ============================================================

import { useMemo } from 'react';

import { TOKEN_CLASSES, highlight } from '@/lib/api-docs/highlight';
import { cn } from '@/lib/utils';

import { CopyButton } from './copy-button';

interface CodeBlockProps {
  code: string;
  /** Grammar name for the tokenizer, e.g. `javascript`, `json`. */
  grammar: string;
  /** Shown in the panel header, e.g. "Request" or "cURL". */
  title?: string;
  /** Used in the copy confirmation toast. */
  copyLabel?: string;
  className?: string;
}

export function CodeBlock({
  code,
  grammar,
  title,
  copyLabel,
  className,
}: CodeBlockProps) {
  const tokens = useMemo(() => highlight(code, grammar), [code, grammar]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-800 bg-slate-950',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/60 px-3 py-1.5">
        <span className="font-mono text-[11px] tracking-wide text-slate-400 uppercase">
          {title ?? grammar}
        </span>
        <CopyButton value={code} label={copyLabel ?? title ?? 'Snippet'} />
      </div>

      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.65]">
        <code className="font-mono">
          {tokens.map((token, i) => (
            // Index keys are safe here: the token list is derived purely
            // from `code`, so it only changes when the whole block does.
            <span key={i} className={TOKEN_CLASSES[token.kind]}>
              {token.value}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
