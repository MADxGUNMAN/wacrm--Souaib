'use client';

import {
  CheckCheck,
  CornerDownLeft,
  ExternalLink,
  ListFilter,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';

export interface InteractivePreviewProps {
  payload: InteractiveMessagePayload;
  className?: string;
  /**
   * When true, renders inside an authentic WhatsApp chat canvas
   * with chat header, wallpaper pattern, and timestamp. Ideal for builders and preview sidebars.
   * Default: false (compact card format, for message bubbles).
   */
  showCanvas?: boolean;
  timestamp?: string;
}

/**
 * WhatsApp-style read-only render of an interactive message. Used both
 * in the builder's live preview and by the inbox message bubble so a
 * sent buttons/list message shows the same way it does on the phone.
 *
 * Purely presentational — the buttons/rows are not clickable here (the
 * customer taps them on their own device). Kept namespace-free (plain
 * English) so it can be dropped into the composer, the automation
 * builder, and the quick-replies manager without namespace coupling.
 */
export function InteractivePreview({
  payload,
  className,
  showCanvas = false,
  timestamp = '10:42 AM',
}: InteractivePreviewProps) {
  // If showCanvas is requested, render the authentic WhatsApp chat frame
  if (showCanvas) {
    return (
      <div
        className={cn(
          'mx-auto flex w-full max-w-[320px] flex-col select-none',
          className
        )}
      >
        {/* WhatsApp Chat Preview Card */}
        <div className="border-border/80 overflow-hidden rounded-2xl border bg-[#EFEAE2] shadow-md dark:bg-[#0b141a]">
          {/* WhatsApp Chat Header */}
          <div className="flex items-center justify-between border-b border-black/5 bg-[#008069] px-3.5 py-2.5 text-white dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">
                <Smartphone className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-xs leading-tight font-semibold">
                  Customer View
                </p>
                <p className="text-[10px] leading-tight text-white/80">
                  WhatsApp Outgoing
                </p>
              </div>
            </div>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-medium text-white/90">
              Live Preview
            </span>
          </div>

          {/* Chat Canvas with WhatsApp subtle pattern */}
          <div className="relative flex min-h-[260px] flex-col justify-end p-3.5">
            {/* Background subtle doodle pattern */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.03]"
              style={{
                backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
                backgroundSize: '16px 16px',
              }}
            />

            {/* Outbound WhatsApp Message Bubble */}
            <div className="relative z-10 w-full self-end overflow-hidden rounded-2xl rounded-tr-xs bg-[#d9fdd3] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] dark:bg-[#005c4b] dark:text-[#e9edef]">
              {/* Header */}
              {payload.header ? (
                <div className="px-3 pt-2.5 pb-0.5">
                  <p className="text-[13.5px] leading-snug font-bold break-words text-[#111b21] dark:text-[#e9edef]">
                    {payload.header}
                  </p>
                </div>
              ) : null}

              {/* Message Body */}
              <div className="px-3 py-1">
                <p className="text-[13px] leading-[18.5px] break-words whitespace-pre-wrap text-[#111b21] dark:text-[#e9edef]">
                  {payload.body || (
                    <span className="text-[#667781] italic dark:text-[#8696a0]">
                      Message body will appear here…
                    </span>
                  )}
                </p>
              </div>

              {/* Footer */}
              {payload.footer ? (
                <div className="px-3 pt-0.5">
                  <p className="text-[11px] leading-[15px] break-words text-[#667781] dark:text-[#8696a0]">
                    {payload.footer}
                  </p>
                </div>
              ) : null}

              {/* Timestamp & Double Blue Ticks */}
              <div className="flex items-center justify-end gap-1 px-3 pt-0.5 pb-2 text-[10px] text-[#667781] dark:text-[#8696a0]">
                <span>{timestamp}</span>
                <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
              </div>

              {/* Action Buttons Section */}
              {renderActionButtons(payload, true)}
            </div>
          </div>
        </div>

        {/* Footer info tip */}
        <p className="text-muted-foreground mt-2 text-center text-[11px]">
          Customers tap buttons on their device to respond or view options.
        </p>
      </div>
    );
  }

  // Compact format (showCanvas = false), used inside message bubbles
  return (
    <div
      className={cn(
        'bg-card/95 text-card-foreground border-border/70 w-full max-w-[280px] overflow-hidden rounded-xl border shadow-xs backdrop-blur-xs',
        className
      )}
    >
      <div className="px-3.5 py-2.5">
        {payload.header ? (
          <p className="mb-1 text-sm font-semibold break-words">
            {payload.header}
          </p>
        ) : null}
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {payload.body || (
            <span className="text-muted-foreground italic">Message body…</span>
          )}
        </p>
        {payload.footer ? (
          <p className="text-muted-foreground mt-1.5 text-[11px] break-words">
            {payload.footer}
          </p>
        ) : null}
      </div>

      {renderActionButtons(payload, false)}
    </div>
  );
}

function renderActionButtons(
  payload: InteractiveMessagePayload,
  isCanvas: boolean
) {
  const borderClass = isCanvas
    ? 'border-[#d1d7db]/80 dark:border-[#13493f]'
    : 'border-border';

  const buttonColor = isCanvas
    ? 'text-[#00a884] dark:text-[#25d366]'
    : 'text-primary';

  const bgHoverClass = isCanvas
    ? 'bg-white/40 hover:bg-white/60 dark:bg-black/10 dark:hover:bg-black/20'
    : 'hover:bg-muted/50';

  if (payload.kind === 'buttons') {
    return (
      <div className={cn('flex flex-col border-t', borderClass)}>
        {payload.buttons.map((b, i) => (
          <button
            key={b.id || i}
            type="button"
            disabled
            className={cn(
              'flex items-center justify-center gap-1.5 border-t px-3 py-2.5 text-[13px] font-medium transition-colors first:border-t-0',
              borderClass,
              buttonColor,
              bgHoverClass
            )}
          >
            <CornerDownLeft className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{b.title || `Button ${i + 1}`}</span>
          </button>
        ))}
      </div>
    );
  }

  if (payload.kind === 'cta_url') {
    return (
      <div className={cn('border-t', borderClass)}>
        <button
          type="button"
          disabled
          className={cn(
            'flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors',
            buttonColor,
            bgHoverClass
          )}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {payload.button_label || 'Open link'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn('border-t', borderClass)}>
      <button
        type="button"
        disabled
        className={cn(
          'flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors',
          buttonColor,
          bgHoverClass
        )}
      >
        <ListFilter className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{payload.button_label || 'View Menu'}</span>
      </button>
    </div>
  );
}
