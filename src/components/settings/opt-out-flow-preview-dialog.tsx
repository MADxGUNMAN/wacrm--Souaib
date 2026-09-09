'use client';

// ============================================================
// The opt-out behaviour, rendered on the real Flows canvas.
//
// WHY THE ACTUAL CANVAS AND NOT A DRAWING
//
// A hand-built diagram would drift. It would also teach a second visual
// language for the same concept — an owner who has used the Flows builder
// already knows what a Start card, an If/else fork and a button node look
// like, and reusing them means there is nothing new to learn here.
//
// So this mounts `FlowCanvas` itself in read-only mode, fed a synthetic
// graph through `FlowEditorProvider`. No flow row is created, nothing is
// persisted, and no request is made: the provider reads its props once into
// state, and every network call it owns is triggered by save/activate/delete
// buttons that read-only mode does not render.
//
// The height is explicit. React Flow collapses to zero in an auto-height
// parent, which is the failure mode to expect if this ever renders blank.
// ============================================================

import { useMemo } from 'react';
import { BellOff, Info } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FlowCanvas } from '@/components/flows/flow-canvas';
import { FlowEditorProvider } from '@/components/flows/flow-editor-state';
import { buildOptOutPreviewGraph } from '@/lib/whatsapp/opt-out-flow-preview';

export function OptOutFlowPreviewDialog({
  open,
  onOpenChange,
  isActive,
  optOutKeywords,
  optInKeywords,
  optOutMessage,
  optInMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActive: boolean;
  optOutKeywords: string[];
  optInKeywords: string[];
  optOutMessage: string;
  optInMessage: string;
}) {
  // Rebuilt from the live draft config, so editing a keyword and reopening
  // the preview shows the new word rather than a stale snapshot.
  const graph = useMemo(
    () =>
      buildOptOutPreviewGraph({
        optOutKeywords,
        optInKeywords,
        optOutMessage,
        optInMessage,
      }),
    [optOutKeywords, optInKeywords, optOutMessage, optInMessage]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-border shrink-0 border-b px-6 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
              <BellOff className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                Opt-in / opt-out flow
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Built in and{' '}
                {isActive ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    currently running
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-500">
                    paused — keyword watching is off
                  </span>
                )}
                . View only, so it cannot be edited into not working.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Explicit height: React Flow renders nothing in an auto-height
            parent. min-h-0 lets it shrink inside the flex column. */}
        <div className="border-border bg-card-2 mx-6 mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border">
          <div className="h-[440px] w-full">
            <FlowEditorProvider
              initialFlow={graph.flow}
              initialNodes={graph.nodes}
            >
              <FlowCanvas readOnly />
            </FlowEditorProvider>
          </div>
        </div>

        {/* The two things the node vocabulary cannot show. Stated here
            rather than faked as extra cards, because there is no node type
            for "add this number to the suppression list" and inventing one
            would misrepresent how suppression is stored. */}
        <div className="shrink-0 px-6 pt-3 pb-6">
          <div className="border-border bg-muted/40 flex items-start gap-2 rounded-lg border p-3">
            <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              This is a diagram of built-in behaviour, not an editable flow —
              there is no AI in the matching step, and it needs no setup. Two
              details it cannot draw: the unsubscribe is recorded against the{' '}
              <strong>phone number</strong> (so it survives the contact being
              deleted and re-imported), and the same step pauses any running
              flow and mutes AI replies for that conversation. Suppression
              applies to <strong>marketing templates only</strong>.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
