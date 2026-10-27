'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

interface CopyMcpUrlProps {
  url: string;
  label?: string;
  note?: string;
  buttonText?: string;
}

export function CopyMcpUrl({
  url,
  label = 'MCP Server URL',
  note = 'Paste this into Claude or ChatGPT when configuring custom tools.',
  buttonText = 'Copy URL',
}: CopyMcpUrlProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API is restricted
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="relative mt-8 overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-b from-white to-emerald-50/20 p-6 shadow-sm backdrop-blur-md sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
            <Terminal className="h-4 w-4 text-emerald-600" />
            <span>{label}</span>
          </div>
          <p className="text-xs text-slate-500 sm:text-sm">{note}</p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all duration-300 sm:text-sm ${
            copied
              ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(37,211,102,0.35)]'
              : 'border border-emerald-900/15 bg-white text-slate-800 shadow-xs hover:border-emerald-500/40 hover:bg-emerald-50/40 hover:text-emerald-900 active:scale-95'
          }`}
          aria-label="Copy server URL"
        >
          {copied ? (
            <>
              <Check className="animate-in zoom-in-50 h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 text-emerald-600" />
              <span>{buttonText}</span>
            </>
          )}
        </button>
      </div>

      <div
        onClick={handleCopy}
        className="group mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-900 px-4 py-3.5 font-mono text-xs text-emerald-400 shadow-inner transition-colors hover:border-emerald-500/50 sm:text-sm"
        title="Click to copy"
      >
        <span className="truncate selection:bg-emerald-500 selection:text-slate-950">
          {url}
        </span>
        <span className="hidden shrink-0 text-xs text-slate-400 transition-colors group-hover:text-emerald-300 sm:inline">
          {copied ? '✓ Copied' : 'Click to copy'}
        </span>
      </div>
    </div>
  );
}
