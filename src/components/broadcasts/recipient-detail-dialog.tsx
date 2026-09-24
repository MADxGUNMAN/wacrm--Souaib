'use client';

import {
  AlertCircle,
  CheckCheck,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  MessageCircle,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { explainMetaSendError } from '@/lib/whatsapp/meta-send-errors';
import { getRecipientStatus } from '@/lib/broadcast-status';
import type { BroadcastRecipient } from '@/types';

interface RecipientDetailDialogProps {
  recipient: BroadcastRecipient | null;
  onOpenChange: (open: boolean) => void;
}

/** One row of the delivery timeline. */
function TimelineRow({
  icon,
  label,
  at,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  at?: string | null;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
          at
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground/60'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${at ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
        >
          {label}
        </p>
        <p className="text-muted-foreground text-xs">
          {at ? new Date(at).toLocaleString() : (note ?? 'Not reported')}
        </p>
      </div>
    </div>
  );
}

/**
 * Everything Meta told us about one recipient of a broadcast.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * The recipients table could show a red "Failed" badge with an empty
 * Error column and no way to learn more. Two separate causes fed that:
 * the reason genuinely was not being stored for webhook-reported
 * failures (fixed alongside this), and even when it WAS stored the
 * column truncated it to a width that hid the useful half.
 *
 * A failure is also not one fact but several — Meta's code, its own
 * wording, the more specific `error_data.details`, and whether the
 * message was rejected outright or accepted and failed later. Those need
 * room, so they get a dialog rather than a cell.
 *
 * Successful recipients open the same dialog deliberately: "did this
 * actually arrive, and when was it read" is the same question asked with
 * a happier answer, and the delivery timeline answers it.
 */
export function RecipientDetailDialog({
  recipient,
  onOpenChange,
}: RecipientDetailDialogProps) {
  if (!recipient) return null;

  const status = getRecipientStatus(recipient.status);
  const failed = recipient.status === 'failed';
  const details = recipient.error_details ?? null;

  // The plain-English cause+fix for known Meta codes. Reuses the existing
  // 27-code table rather than a second copy of the same knowledge, and
  // returns null for a code it does not know — in which case Meta's own
  // wording below is all there is, and pretending otherwise would be
  // worse than saying nothing.
  const explained = explainMetaSendError(
    recipient.error_message ?? recipient.error_code ?? null
  );

  /** Meta's most specific sentence, preferred over its generic one. */
  const metaReason =
    details?.details?.trim() ||
    details?.user_message?.trim() ||
    details?.raw_message?.trim() ||
    recipient.error_message?.trim() ||
    null;

  const sourceLabel =
    details?.source === 'status_webhook'
      ? 'Meta accepted this message, then reported it failed afterwards.'
      : details?.source === 'send_time'
        ? 'Meta rejected this message when we tried to send it.'
        : null;

  async function copyDiagnostics() {
    const lines = [
      `Recipient: ${recipient!.contact?.name ?? 'Unknown'} (${recipient!.contact?.phone ?? 'no phone'})`,
      `Status: ${recipient!.status}`,
      `Meta message id: ${recipient!.whatsapp_message_id ?? 'none'}`,
      `Error code: ${recipient!.error_code ?? 'none'}`,
      `Error message: ${recipient!.error_message ?? 'none'}`,
      details?.fbtrace_id ? `fbtrace_id: ${details.fbtrace_id}` : null,
      recipient!.error_details
        ? `Raw: ${JSON.stringify(recipient!.error_details)}`
        : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Diagnostics copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  return (
    <Dialog open={Boolean(recipient)} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground flex items-center gap-2">
            {recipient.contact?.name ?? 'Unknown contact'}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
            >
              {status.label}
            </span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {recipient.contact?.phone ?? 'No phone number on record'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Why it failed ───────────────────────────────────── */}
          {failed && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-400" />
                <p className="text-sm font-semibold text-red-300">
                  Why this failed
                </p>
              </div>

              {metaReason ? (
                <>
                  {/*
                    PLAIN ENGLISH FIRST.

                    Meta's own wording is frequently unreadable to the
                    person who has to act on it — 131049 arrives as "In
                    order to maintain a healthy ecosystem engagement, the
                    message failed to be delivered", which does not tell an
                    operator what happened or what to do. So the
                    explanation leads, and Meta's exact text moves below
                    under its own heading where it is still fully available
                    for the record and for support tickets.

                    When we have no explanation for the code, Meta's own
                    sentence is promoted into this slot rather than leaving
                    the operator with nothing.
                  */}
                  <p className="text-foreground text-sm leading-relaxed">
                    {explained ? explained.message : metaReason}
                  </p>

                  {explained && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {explained.retryable
                        ? 'This is usually temporary — sending again later can work.'
                        : 'Sending again straight away will fail the same way.'}
                    </p>
                  )}

                  {sourceLabel && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {sourceLabel}
                    </p>
                  )}

                  {/*
                    Meta's exact words, always shown and never paraphrased —
                    the operator asked for the real upstream message, and it
                    is what Meta support will recognise.
                  */}
                  <div className="border-border/60 mt-3 rounded-md border bg-black/20 p-2.5">
                    <p className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wide uppercase">
                      What Meta reported
                    </p>
                    <p className="text-foreground/90 text-xs leading-relaxed">
                      {metaReason}
                    </p>
                    {(recipient.error_code || details?.title) && (
                      <p className="text-muted-foreground mt-1.5 font-mono text-[11px]">
                        {recipient.error_code
                          ? `Error code ${recipient.error_code}`
                          : ''}
                        {details?.title ? ` — ${details.title}` : ''}
                      </p>
                    )}
                  </div>

                  {details?.href && (
                    <a
                      href={details.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      Meta&apos;s documentation for this error
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </>
              ) : (
                // No stored reason. Say what is actually known and where
                // the reason can still be found, rather than a dead end.
                <div className="space-y-1.5">
                  <p className="text-foreground text-sm">
                    {recipient.sent_at
                      ? 'WhatsApp accepted this message but did not deliver it, and no reason was recorded against this recipient.'
                      : 'This message was never accepted by WhatsApp, and no reason was recorded.'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Reasons are captured from Meta&apos;s delivery notice, which
                    is sent once, to whichever server is configured to receive
                    it. If that server was running an older version when this
                    failed, the reason was not saved. Opening this contact in
                    the Inbox often shows the same failure on the message
                    itself.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Delivery timeline ───────────────────────────────── */}
          <div>
            <p className="text-foreground mb-3 text-sm font-medium">
              Delivery timeline
            </p>
            <div className="space-y-3">
              <TimelineRow
                icon={<Send className="size-3" />}
                label="Sent to Meta"
                at={recipient.sent_at}
                note={failed ? 'Never accepted by Meta' : 'Not yet sent'}
              />
              <TimelineRow
                icon={<CheckCheck className="size-3" />}
                label="Delivered to handset"
                at={recipient.delivered_at}
                note={
                  failed
                    ? 'Never delivered'
                    : 'Not reported yet — the phone may be offline'
                }
              />
              <TimelineRow
                icon={<Eye className="size-3" />}
                label="Read"
                at={recipient.read_at}
                note="Not read yet, or read receipts are off"
              />
              <TimelineRow
                icon={<MessageCircle className="size-3" />}
                label="Replied"
                at={recipient.replied_at}
                note="No reply to this campaign"
              />
            </div>
          </div>

          {/* ── Identifiers, for support conversations with Meta ── */}
          <div className="border-border border-t pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-foreground text-sm font-medium">
                Technical details
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={copyDiagnostics}
                className="h-7 gap-1.5 text-xs"
              >
                <Copy className="size-3" />
                Copy
              </Button>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-28 shrink-0">
                  Message id
                </dt>
                <dd className="text-foreground min-w-0 font-mono break-all">
                  {recipient.whatsapp_message_id ?? (
                    <span className="text-muted-foreground font-sans">
                      Never issued — Meta did not accept the send
                    </span>
                  )}
                </dd>
              </div>
              {details?.fbtrace_id && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-28 shrink-0">
                    fbtrace id
                  </dt>
                  <dd className="text-foreground min-w-0 font-mono break-all">
                    {details.fbtrace_id}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-28 shrink-0">
                  Queued at
                </dt>
                <dd className="text-foreground">
                  {new Date(recipient.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>
            {recipient.whatsapp_message_id && (
              <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px]">
                <Clock className="mt-0.5 size-3 shrink-0" />
                Quote the message id if you raise this with Meta support — it is
                how they locate the exact send.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
