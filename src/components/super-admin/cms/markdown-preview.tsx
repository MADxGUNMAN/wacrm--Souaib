'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  emptyPlaceholder?: string;
}

export function MarkdownPreview({
  content,
  className = '',
  emptyPlaceholder = 'Nothing to preview yet. Start typing your markdown on the left...',
}: MarkdownPreviewProps) {
  if (!content || !content.trim()) {
    return (
      <div
        className={`flex h-full min-h-[300px] items-center justify-center p-8 text-center text-sm text-slate-400 italic ${className}`}
      >
        {emptyPlaceholder}
      </div>
    );
  }

  return (
    <div className={`legal-prose text-slate-700 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => {
            const text =
              typeof children === 'string' ? children : String(children);
            const id = slugify(text);
            return (
              <h1
                id={id}
                className="mt-8 mb-4 border-b border-slate-200 pb-2 text-2xl font-bold tracking-tight text-slate-900 first:mt-0"
              >
                {children}
              </h1>
            );
          },
          h2: ({ children }) => {
            const text =
              typeof children === 'string' ? children : String(children);
            const id = slugify(text);
            return (
              <h2
                id={id}
                className="mt-7 mb-3 border-b border-slate-100 pb-2 text-xl font-bold text-slate-900 first:mt-0"
              >
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const text =
              typeof children === 'string' ? children : String(children);
            const id = slugify(text);
            return (
              <h3
                id={id}
                className="mt-6 mb-2 text-lg font-semibold text-slate-800"
              >
                {children}
              </h3>
            );
          },
          h4: ({ children }) => (
            <h4 className="mt-4 mb-2 text-base font-semibold text-slate-800">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="mt-3 mb-1 text-sm font-semibold tracking-wide text-slate-800 uppercase">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="mt-3 mb-1 text-xs font-semibold tracking-wider text-slate-700 uppercase">
              {children}
            </h6>
          ),
          p: ({ children }) => (
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mb-5 list-outside list-disc space-y-1.5 pl-6 text-sm text-slate-600">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-5 list-outside list-decimal space-y-1.5 pl-6 text-sm text-slate-600">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed text-slate-600">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900">{children}</strong>
          ),
          em: ({ children }) => <em className="text-slate-700">{children}</em>,
          u: ({ children }) => (
            <u className="underline underline-offset-2">{children}</u>
          ),
          del: ({ children }) => (
            <del className="text-slate-400 line-through">{children}</del>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium text-[#25D366] transition-colors hover:underline"
              target={href?.startsWith('/') ? undefined : '_blank'}
              rel={href?.startsWith('/') ? undefined : 'noreferrer'}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs sm:text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2.5 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-100 px-4 py-2.5 text-slate-600">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-5 rounded-r-lg border-l-4 border-[#25D366]/60 bg-emerald-50/40 py-2.5 pr-3 pl-4 text-sm text-slate-600 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded border border-slate-200/60 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-5 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100 shadow-xs">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-6 border-slate-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
