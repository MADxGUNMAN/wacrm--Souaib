'use client';

// ============================================================
// "View message" — the template as the customer receives it.
//
// Renders through `WhatsAppPreview` off `definitionFromRow`, i.e. the
// same path the wizard previews with, so what is shown here is the
// approved `components` array rather than the flat `body_text` cache.
// That distinction is the whole point of the dialog: a carousel, a
// limited-time offer or an authentication template has almost nothing
// useful in `body_text`, and a list row showing one line of text cannot
// tell an operator whether the thing Meta approved is what they meant.
//
// Sample values are passed as the preview's values, because for an
// approved template Meta's approved samples ARE the content — filling
// `{{1}}` with a placeholder here would show wording that was never
// reviewed.
// ============================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { Copy, Pencil, RotateCcw } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WhatsAppPreview } from '@/components/templates/whatsapp-preview';
import { definitionFromRow } from '@/lib/whatsapp/template-definition';
import { templateStatusConfig } from '@/lib/template-status';
import { cn } from '@/lib/utils';
import type { MessageTemplate } from '@/types';

export function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: MessageTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const definition = useMemo(
    () => (template ? definitionFromRow(template) : null),
    [template]
  );

  if (!template || !definition) return null;

  const statusKey = template.status ?? 'DRAFT';
  const status = templateStatusConfig[statusKey];
  const canEdit =
    statusKey === 'APPROVED' ||
    statusKey === 'REJECTED' ||
    statusKey === 'PAUSED';
  const isResubmit = statusKey !== 'APPROVED';
  const samples = template.sample_values ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-border border-b px-5 py-4 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-sm">{template.name}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn('border text-xs', status.classes)}>
              {status.label}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {template.category}
            </Badge>
            {template.language ? (
              <Badge
                variant="outline"
                className="text-xs font-normal uppercase"
              >
                {template.language}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* The preview is the only scrolling region, so the header and the
            actions stay put on a long carousel template. */}
        <div className="bg-muted/40 max-h-[60vh] overflow-y-auto px-5 py-5">
          <WhatsAppPreview
            definition={definition}
            values={
              samples.body?.length
                ? Object.fromEntries(
                    samples.body.map((value, i) => [String(i + 1), value])
                  )
                : {}
            }
            headerValues={
              samples.header?.length
                ? Object.fromEntries(
                    samples.header.map((value, i) => [String(i + 1), value])
                  )
                : undefined
            }
            headerMediaUrl={template.header_media_url}
          />
          <p className="text-muted-foreground mt-3 text-center text-[11px]">
            Variables show the sample values approved with this template.
          </p>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-5">
          <Link
            href={`/templates/new?copyFrom=${template.id}`}
            className="border-border text-foreground hover:bg-muted inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
          >
            <Copy className="size-3.5" />
            Duplicate
          </Link>
          {canEdit ? (
            <Link
              href={`/templates/${template.id}/edit`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors"
            >
              {isResubmit ? (
                <RotateCcw className="size-3.5" />
              ) : (
                <Pencil className="size-3.5" />
              )}
              {isResubmit ? 'Resubmit' : 'Edit'}
            </Link>
          ) : (
            // Meta refuses edits while a review is in flight, so the
            // button is absent rather than present-and-failing.
            <Button
              variant="outline"
              disabled
              title="Meta is still reviewing this template"
            >
              Edit unavailable while pending
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
