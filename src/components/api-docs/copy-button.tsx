'use client';

// ============================================================
// CopyButton — copy text, confirm it worked, say so when it didn't.
//
// The Clipboard API needs a secure context (https or localhost) and can
// be refused by the browser. A silent no-op there is the worst outcome:
// the reader thinks they have the snippet, pastes stale clipboard
// content, and blames the API. So failures surface as an error toast,
// and the tick only appears on a confirmed write.
//
// Two tones rather than a `className` override, because the two homes
// for this button sit on opposite surfaces: `code` lives in a code
// panel's header, which is dark in either mode, while `accent` sits on
// the themed page. Expressing that as a prop keeps the variants from
// half-merging into each other's hover states.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  /** Named in the success toast, e.g. "cURL example". */
  label: string;
  /** Render the word "Copy" next to the icon. */
  showLabel?: boolean;
  tone?: 'code' | 'accent';
  className?: string;
}

/** How long the tick stays up before reverting to the copy icon. */
const CONFIRM_MS = 1800;

const TONES = {
  // Always-dark code panel: fixed slate, not theme tokens.
  code: 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:ring-slate-400/60',
  // Themed page: follows the user's chosen accent.
  accent:
    'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 px-3 h-8',
} as const;

export function CopyButton({
  value,
  label,
  showLabel = false,
  tone = 'code',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending revert on unmount, so navigating away mid-confirm
  // can't set state on a gone component.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
    } catch {
      toast.error('Could not copy — select the text and copy manually');
    }
  }, [value, label]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:outline-none',
        TONES[tone],
        className
      )}
    >
      {copied ? (
        <Check
          className={cn(
            'size-3.5',
            tone === 'code' ? 'text-emerald-400' : undefined
          )}
          aria-hidden
        />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {showLabel ? <span>{copied ? 'Copied' : 'Copy'}</span> : null}
    </button>
  );
}
