'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Info,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Copy,
  Check as CheckIcon,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Message } from '@/types';
import { isOutboundSender } from '@/lib/messages/sender-type';

interface MessageInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
}

export function MessageInfoDialog({
  open,
  onOpenChange,
  message,
}: MessageInfoDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!message) return null;

  const isAgent = isOutboundSender(message.sender_type);

  const handleCopyWamid = () => {
    if (!message.message_id) return;
    navigator.clipboard.writeText(message.message_id);
    setCopied(true);
    toast.success('WhatsApp Message ID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'MMM d, yyyy · h:mm:ss a');
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Info className="h-4 w-4 text-primary" />
            Message Info
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* Message Preview */}
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <Badge variant="secondary" className="capitalize text-[10px]">
                {message.content_type}
              </Badge>
              <Badge
                variant={
                  message.status === 'read'
                    ? 'default'
                    : message.status === 'failed'
                      ? 'destructive'
                      : 'outline'
                }
                className="capitalize text-[10px]"
              >
                {message.status}
              </Badge>
            </div>
            <p className="text-foreground line-clamp-3 whitespace-pre-wrap">
              {message.content_text ||
                message.location_name ||
                message.media_filename ||
                `[${message.content_type} message]`}
            </p>
          </div>

          {/* Delivery Lifecycle (Outbound messages) */}
          {isAgent && (
            <div className="rounded-lg border border-border/80 bg-card p-3 space-y-3">
              <h4 className="font-semibold text-foreground text-xs">Delivery Details</h4>

              {/* Read */}
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                  <CheckCheck className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Read</p>
                  <p className="text-muted-foreground text-[11px]">
                    {message.read_at ? formatTimestamp(message.read_at) : 'Not read yet'}
                  </p>
                </div>
              </div>

              {/* Delivered */}
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCheck className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Delivered</p>
                  <p className="text-muted-foreground text-[11px]">
                    {message.delivered_at
                      ? formatTimestamp(message.delivered_at)
                      : message.status === 'read'
                        ? 'Delivered'
                        : 'Pending delivery'}
                  </p>
                </div>
              </div>

              {/* Sent */}
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Sent</p>
                  <p className="text-muted-foreground text-[11px]">
                    {formatTimestamp(message.sent_at || message.created_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Failure Details (if failed) */}
          {message.status === 'failed' && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-1.5 text-destructive">
              <div className="flex items-center gap-1.5 font-semibold text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Failed to send ({message.error_code || 'Meta error'})
              </div>
              <p className="text-[11px] leading-relaxed">
                {message.error_message || 'The message could not be delivered.'}
              </p>
            </div>
          )}

          {/* Technical Diagnostics */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Internal ID:</span>
              <span className="font-mono text-[10px] text-foreground truncate max-w-[200px]">
                {message.id}
              </span>
            </div>

            {message.message_id && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">WhatsApp ID:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-foreground truncate max-w-[180px]">
                    {message.message_id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyWamid}
                    className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Copy WhatsApp ID"
                  >
                    {copied ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )}

            {message.forwarded_from_message_id && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Forwarded from:</span>
                <span className="font-mono text-[10px] text-foreground truncate max-w-[200px]">
                  {message.forwarded_from_message_id}
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
