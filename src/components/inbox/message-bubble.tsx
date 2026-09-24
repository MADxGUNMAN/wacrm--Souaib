'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { Message, MessageReaction } from '@/types';
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Sparkles,
  Smartphone,
  Ban,
  Zap,
  Crown,
  User,
  UserPlus,
  ExternalLink,
  Forward,
  Star,
  HelpCircle,
  EyeOff,
  AlertTriangle,
  Megaphone,
} from 'lucide-react';
import { format } from 'date-fns';
import { ReplyQuote } from './reply-quote';
import { MessageReactions } from './message-reactions';
import { InteractivePreview } from '@/components/interactive/interactive-preview';
import { TemplateMessage, type TemplateRenderData } from './template-message';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { WhatsAppContactCard } from '@/lib/whatsapp/meta-api';
import { ContactForm } from '@/components/contacts/contact-form';
import { isOutboundSender } from '@/lib/messages/sender-type';
import type { BroadcastOrigin } from '@/lib/messages/broadcast-origin';
import {
  resolveMessageAuthorLabel,
  type AuthorDirectory,
} from '@/lib/messages/author-label';

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  isStarred?: boolean;
  onToggleReaction?: (emoji: string) => void;
  /**
   * Team members by `user_id`, for naming whoever sent an outbound
   * message. Built once per thread — resolving it per bubble would mean
   * one lookup per message.
   *
   * Optional so a caller that has not loaded profiles yet renders the
   * previous behaviour (no name) rather than flashing "Unknown".
   */
  authorDirectory?: AuthorDirectory;
  /**
   * Header / footer / buttons for a template message, resolved by the
   * thread from the account's templates and keyed by name.
   *
   * Passed in rather than fetched here because a bubble is rendered once
   * per message — a lookup inside would mean one request per message in
   * the thread. Optional, and absent is a normal state: a template that
   * has since been deleted or renamed cannot be resolved, in which case
   * the body still renders on its own.
   */
  template?: TemplateRenderData | null;
  /**
   * Where a bulk send came from, when this message was part of one.
   *
   * Resolved by the thread from `messages.broadcast_id` and passed in for
   * the same reason `template` is: one lookup per thread rather than one
   * request per bubble. Null is the normal case — a one-to-one template
   * send has no broadcast behind it, and gets no second badge.
   */
  broadcastOrigin?: BroadcastOrigin | null;
  /**
   * Sends a location request to this customer. Only reached from the
   * "Live Location Shared" limitation card, which used to *tell* the agent
   * to ask for a static pin without giving them any way to do it.
   *
   * Optional: when absent the card falls back to plain advice text, so a
   * caller with no send path (a read-only or exported view) still renders
   * something honest rather than a dead button.
   */
  onRequestLocation?: () => void;
}

/**
 * Stable empty directory for callers that pass none.
 *
 * A literal `new Map()` in the render body would be a fresh object every
 * render, which defeats any memoisation a caller adds later.
 */
const EMPTY_DIRECTORY: AuthorDirectory = new Map();

function StatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return <Clock className="text-muted-foreground h-3 w-3" />;
    case 'sent':
      return <Check className="text-muted-foreground h-3 w-3" />;
    case 'delivered':
      return <CheckCheck className="text-muted-foreground h-3 w-3" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

/**
 * Why a message failed, shown under the bubble in Meta's own words.
 *
 * Before this, a failure was a red cross and nothing else. The reason
 * appeared once in a toast and was then unrecoverable — reopening the
 * conversation, hovering, waiting a day, all gave the same silent cross.
 *
 * Rendered as visible text rather than only a tooltip, because a tooltip
 * is undiscoverable: nobody hovers a cross they do not already suspect
 * carries information. `fbtrace_id` goes in the `title` instead, since it
 * is meaningless to an operator but is the first thing Meta asks for on a
 * support ticket.
 *
 * Returns null when there is no recorded reason, which is the correct
 * state for failures from before migration 073.
 */
function FailureReason({ message }: { message: Message }) {
  if (message.status !== 'failed') return null;
  const reason = message.error_message?.trim();
  if (!reason) return null;

  const trace =
    message.error_details && typeof message.error_details === 'object'
      ? (message.error_details as Record<string, unknown>).fbtrace_id
      : null;

  return (
    <div
      className="mt-1 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5"
      // Meta quotes fbtrace_id back when investigating a report, so it is
      // kept reachable without cluttering the message.
      title={
        typeof trace === 'string' && trace
          ? `Meta reference (quote this to Meta support): ${trace}`
          : undefined
      }
    >
      <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
      <p className="text-[11px] leading-snug text-red-600 dark:text-red-400">
        <span className="font-medium">Not delivered. </span>
        {/* Meta's wording, unedited. */}
        {reason}
      </p>
    </div>
  );
}

/**
 * The little pill beside the timestamp saying who sent a message.
 *
 * Extracted because there were two of these (Phone, AI) with the same
 * className string copied between them, and this adds two more. Four
 * copies of a two-branch colour expression is three too many.
 *
 * `onFill` exists because an outbound bubble sits on a green fill and an
 * image bubble has none — the same badge has to read against both.
 */
function AuthorBadge({
  icon: Icon,
  label,
  title,
  onFill,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  title?: string;
  onFill: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[12rem] items-center gap-0.5 truncate rounded-full px-1.5 py-px text-[9px] leading-none font-semibold tracking-wide uppercase',
        onFill
          ? 'bg-emerald-200/60 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100'
          : 'bg-primary/10 text-primary'
      )}
      title={title}
    >
      {Icon ? <Icon className="h-2.5 w-2.5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

function MediaUnavailable({
  label,
  t,
}: {
  label: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
      <ImageOff className="text-muted-foreground h-4 w-4 shrink-0" />
      <span>{t('unavailable', { label })}</span>
    </div>
  );
}

function MediaImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadImage = useCallback(async () => {
    if (!url) return;

    // Proxy URLs need auth fetch to create blob URL
    if (url.startsWith('/api/whatsapp/media/')) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load media');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(url);
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    return (
      <div className="bg-muted flex h-40 w-60 items-center justify-center rounded-lg">
        <ImageOff className="text-muted-foreground h-8 w-8" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-muted flex h-40 w-60 items-center justify-center rounded-lg">
        <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger className="m-0 border-none bg-transparent p-0 focus:outline-none">
        <img
          src={src ?? ''}
          alt={alt}
          className="max-h-64 max-w-60 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
          onError={() => setError(true)}
        />
      </DialogTrigger>
      <DialogContent className="flex max-w-4xl justify-center border-none bg-transparent p-0 shadow-none [&>button]:text-white">
        <img
          src={src ?? ''}
          alt={alt}
          className="max-h-[90vh] object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

function ContactCardPreview({
  message,
  t,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
}) {
  const [addedMap, setAddedMap] = useState<Record<number, boolean>>({});
  /**
   * Which card's details are seeding the open form, plus the card index so
   * the right button can be ticked on save.
   *
   * Opening the real Add Contact dialog rather than saving silently is the
   * point: the agent gets to see and correct the number before it lands,
   * and gets the same duplicate warning, tag picker and custom fields as
   * the Contacts page. The previous version POSTed straight to
   * `/api/contacts/from-card` and created the row with no confirmation —
   * except it never even got that far, because that route looked the
   * profile up by `profiles.id = auth uid` when the column is `user_id`,
   * so it answered "Account not found" for every user who ever clicked it.
   */
  const [pending, setPending] = useState<{
    index: number;
    name: string;
    phone: string;
  } | null>(null);

  const rawPayload = message.contacts_payload;
  const contacts: WhatsAppContactCard[] = Array.isArray(rawPayload)
    ? (rawPayload as unknown as WhatsAppContactCard[])
    : rawPayload && typeof rawPayload === 'object'
      ? [rawPayload as unknown as WhatsAppContactCard]
      : [];

  const handleAddContact = (contact: WhatsAppContactCard, index: number) => {
    const name =
      contact.name?.formatted_name ||
      [contact.name?.first_name, contact.name?.last_name]
        .filter(Boolean)
        .join(' ') ||
      '';
    const phone = contact.phones?.[0]?.phone || '';

    // Name and phone only. Email and company are left empty on purpose:
    // everything else in the form should be the agent's decision, and a
    // card's `org` field is frequently a job title rather than a company.
    setPending({ index, name, phone });
  };

  if (contacts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <User className="text-muted-foreground h-4 w-4 shrink-0" />
        <span>{message.content_text || 'Contact Card'}</span>
      </div>
    );
  }

  const isInbound = message.sender_type === 'customer';

  return (
    <div className="max-w-[280px] min-w-[220px] space-y-2">
      {contacts.map((c, i) => {
        const name =
          c.name?.formatted_name ||
          [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') ||
          'Contact';
        const initials = name.slice(0, 2).toUpperCase();
        const primaryPhone = c.phones?.[0]?.phone;
        const primaryEmail = c.emails?.[0]?.email;
        const company = c.org?.company || c.org?.title;
        const isAdded = addedMap[i];

        return (
          <div
            key={i}
            className="border-border/60 bg-background/50 text-foreground space-y-2 rounded-lg border p-2.5 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <div className="bg-primary/20 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-tight font-semibold">
                  {name}
                </p>
                {company && (
                  <p className="text-muted-foreground truncate text-xs">
                    {company}
                  </p>
                )}
              </div>
            </div>

            <div className="border-border/40 space-y-1 border-t pt-2 text-xs">
              {primaryPhone && (
                <div className="text-muted-foreground flex items-center justify-between">
                  <span className="truncate">{primaryPhone}</span>
                  <a
                    href={`tel:${primaryPhone}`}
                    className="text-primary ml-1 shrink-0 text-[11px] hover:underline"
                  >
                    Call
                  </a>
                </div>
              )}
              {primaryEmail && (
                <div className="text-muted-foreground flex items-center justify-between">
                  <span className="truncate">{primaryEmail}</span>
                  <a
                    href={`mailto:${primaryEmail}`}
                    className="text-primary ml-1 shrink-0 text-[11px] hover:underline"
                  >
                    Email
                  </a>
                </div>
              )}
            </div>

            {isInbound && (
              <Button
                size="sm"
                variant={isAdded ? 'secondary' : 'outline'}
                className="h-7 w-full gap-1.5 text-xs"
                disabled={isAdded}
                onClick={() => handleAddContact(c, i)}
              >
                {isAdded ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    Added to Contacts
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3 w-3" />
                    Add to Contacts
                  </>
                )}
              </Button>
            )}
          </div>
        );
      })}

      {/* The real Add Contact dialog, not a copy of it. Reusing the
          Contacts page's form means the duplicate check, tag picker,
          custom fields and phone-required rule are all the ones the agent
          already knows, and there is only one place a contact gets
          created. Rendered only while open so its tag/custom-field fetches
          do not run for every contact card in the thread. */}
      {pending ? (
        <ContactForm
          open
          onOpenChange={(next) => {
            if (!next) setPending(null);
          }}
          initialValues={{ name: pending.name, phone: pending.phone }}
          onSaved={() => {
            setAddedMap((prev) => ({ ...prev, [pending.index]: true }));
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LocationCardPreview({ message }: { message: Message }) {
  const lat = message.latitude;
  const lng = message.longitude;
  const name = message.location_name;
  const address = message.location_address;

  // Fallback if coordinates were in content_text (e.g. from older messages)
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(message.content_text || '')}`;

  const handleCopyCoords = () => {
    if (hasCoords) {
      navigator.clipboard.writeText(`${lat}, ${lng}`);
      toast.success('Coordinates copied to clipboard');
    }
  };

  return (
    <div className="border-border/60 bg-background/50 text-foreground max-w-[280px] min-w-[220px] space-y-2 rounded-lg border p-2.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold">
            {name || 'Shared Location'}
          </p>
          {address && (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {address}
            </p>
          )}
        </div>
      </div>

      {hasCoords && (
        <div className="text-muted-foreground border-border/40 flex items-center justify-between border-t pt-1.5 font-mono text-xs">
          <span>
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
          <button
            onClick={handleCopyCoords}
            className="text-primary cursor-pointer text-[11px] hover:underline"
            title="Copy coordinates"
          >
            Copy
          </button>
        </div>
      )}

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium shadow-sm transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Maps
      </a>
    </div>
  );
}

function UnsupportedLimitationCard({
  message,
  onRequestLocation,
}: {
  message: Message;
  onRequestLocation?: () => void;
}) {
  const rawType = (message.content_text || '').toLowerCase();
  const isPoll = rawType.includes('poll');
  const isLiveLocation =
    rawType.includes('live_location') || rawType.includes('live location');
  const isViewOnce =
    rawType.includes('view_once') ||
    rawType.includes('view-once') ||
    rawType.includes('ephemeral');
  const isOrder = rawType.includes('order');

  if (isPoll) {
    return (
      <div className="max-w-[280px] space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs dark:bg-amber-950/20">
        <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
          <HelpCircle className="h-4 w-4 shrink-0" />
          Poll Received
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          WhatsApp does not deliver poll questions or votes to business
          platforms.
        </p>
        <div className="border-border/60 bg-background/80 text-muted-foreground rounded border p-2 text-[10px] italic">
          💡 Tip: Ask the customer to type their response directly, or send an
          interactive list message.
        </div>
      </div>
    );
  }

  if (isLiveLocation) {
    return (
      <div className="max-w-[280px] space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs dark:bg-amber-950/20">
        <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
          <MapPin className="h-4 w-4 shrink-0" />
          Live Location Shared
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          WhatsApp does not stream live location updates to business platforms.
        </p>
        {/* The whole point of this card is that it ends in something the
            agent can DO. It previously read "tap Request Location" as
            italic advice, with no such control anywhere near it — which is
            the difference between explaining a limitation and hitting a
            dead end. One tap sends the request; no dialog, because the
            customer's answer is the same either way. */}
        {onRequestLocation ? (
          <button
            type="button"
            onClick={onRequestLocation}
            className="border-border/60 bg-background/80 hover:bg-background text-foreground flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] font-medium transition-colors"
          >
            <MapPin className="text-primary size-3" />
            Request a location pin
          </button>
        ) : (
          <div className="border-border/60 bg-background/80 text-muted-foreground rounded border p-2 text-[10px] italic">
            💡 Tip: Ask the customer to send a static location pin.
          </div>
        )}
      </div>
    );
  }

  if (isViewOnce) {
    return (
      <div className="max-w-[280px] space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs dark:bg-amber-950/20">
        <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
          <EyeOff className="h-4 w-4 shrink-0" />
          View-Once Media
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          WhatsApp does not deliver view-once media or disappearing messages to
          business platforms.
        </p>
        <div className="border-border/60 bg-background/80 text-muted-foreground rounded border p-2 text-[10px] italic">
          💡 Tip: Ask the customer to send standard photos/videos so your team
          can view them.
        </div>
      </div>
    );
  }

  if (isOrder) {
    return (
      <div className="max-w-[280px] space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs dark:bg-amber-950/20">
        <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          WhatsApp Cart / Order
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Meta Commerce catalog order details are managed via Meta Commerce
          Manager.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[280px] space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs dark:bg-amber-950/20">
      <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Unsupported Message ({message.content_text || 'Unknown'})
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        This message format is not delivered to business platforms by the
        WhatsApp Cloud API.
      </p>
    </div>
  );
}

function MessageContent({
  message,
  t,
  template,
  broadcastOrigin,
  onRequestLocation,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
  template?: TemplateRenderData | null;
  broadcastOrigin?: BroadcastOrigin | null;
  onRequestLocation?: () => void;
}) {
  switch (message.content_type) {
    case 'text': {
      // History imports store some entries as bracketed system notes —
      // media WhatsApp did not export, or a message it could not convert.
      // Rendered as muted italic rather than normal text so an agent can
      // tell at a glance that this is a note about a missing message, not
      // something the customer literally typed in square brackets.
      const isSystemNote =
        message.content_text?.startsWith('[') &&
        message.content_text?.endsWith(']');

      if (isSystemNote) {
        return (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs break-words italic">
            <ImageOff className="h-3.5 w-3.5 shrink-0" />
            {message.content_text?.slice(1, -1)}
          </p>
        );
      }

      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text}
        </p>
      );
    }

    case 'image':
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" />
          ) : (
            <MediaUnavailable label={t('photo')} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              className="max-h-64 max-w-60 rounded-lg"
            />
          ) : (
            <MediaUnavailable label={t('video')} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div>
          {message.media_url ? (
            <audio src={message.media_url} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label={t('audio')} t={t} />
          )}
        </div>
      );

    case 'sticker':
      return (
        <div className="relative py-1 select-none">
          {message.media_url ? (
            <img
              src={message.media_url}
              alt="Sticker"
              className="h-36 max-h-40 w-36 max-w-40 object-contain drop-shadow-sm transition-transform hover:scale-105"
              loading="lazy"
            />
          ) : (
            <MediaUnavailable label="Sticker" t={t} />
          )}
        </div>
      );

    case 'document':
      if (!message.media_url) {
        return (
          <MediaUnavailable
            label={message.content_text || t('document')}
            t={t}
          />
        );
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-muted/50 hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <FileText className="text-muted-foreground h-5 w-5 shrink-0" />
          <span className="truncate">
            {message.content_text || t('document')}
          </span>
        </a>
      );

    case 'template':
      // Rendered the way the customer's handset renders it: bold header,
      // body, grey footer, then a divided column of tappable button rows.
      // Previously this was a "Template" badge plus the body and nothing
      // else, so an agent could not tell whether a Track Order button or a
      // discount code had even been sent.
      //
      // The badge is kept above the card because, unlike the customer, an
      // agent does need to know this was a template send — it is what
      // determines whether the 24-hour window applies.
      //
      // A SECOND badge sits beside it when the send was part of a bulk
      // run, naming the campaign or broadcast it came from. Without it,
      // three very different things looked identical in the thread: an
      // agent picking a template by hand, a dashboard broadcast, and a
      // Sheets rule firing automatically. When a customer asks "why did
      // you message me", that distinction is the answer.
      return (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <span className="bg-primary/20 text-primary inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
              <LayoutTemplate className="h-3 w-3" />
              {t('template')}
            </span>
            {broadcastOrigin && (
              <span
                className={cn(
                  'inline-flex max-w-[14rem] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  broadcastOrigin.kind === 'api_campaign'
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                )}
                // The label is the campaign or broadcast name, which can be
                // long; the title keeps it readable once truncated.
                title={`${
                  broadcastOrigin.kind === 'api_campaign'
                    ? t('viaApiCampaign')
                    : t('viaBroadcast')
                }: ${broadcastOrigin.label}`}
              >
                {broadcastOrigin.kind === 'api_campaign' ? (
                  <Zap className="h-3 w-3 shrink-0" />
                ) : (
                  <Megaphone className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">
                  {broadcastOrigin.kind === 'api_campaign'
                    ? t('viaApiCampaign')
                    : t('viaBroadcast')}
                </span>
              </span>
            )}
          </div>
          <TemplateMessage body={message.content_text} template={template} />
        </div>
      );

    case 'contacts':
      return <ContactCardPreview message={message} t={t} />;

    case 'location':
      return <LocationCardPreview message={message} />;

    case 'interactive': {
      const rawInteractive = message.interactive_payload as unknown as Record<
        string,
        unknown
      > | null;
      if (rawInteractive?.type === 'location_request_message') {
        const bodyText =
          (rawInteractive.body as { text?: string })?.text ||
          (typeof rawInteractive.body === 'string'
            ? rawInteractive.body
            : null) ||
          message.content_text ||
          'Please share your location with us.';
        return (
          <div className="border-primary/20 bg-primary/5 max-w-[280px] min-w-[220px] space-y-2 rounded-lg border p-2.5">
            <div className="text-primary flex items-center gap-1.5 text-xs font-semibold">
              <MapPin className="h-3.5 w-3.5" />
              Location Requested
            </div>
            <p className="text-sm break-words whitespace-pre-wrap">
              {bodyText}
            </p>
            <div className="border-primary/30 bg-background/80 text-muted-foreground flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-center text-xs font-medium">
              <MapPin className="text-primary h-3 w-3" />
              Send Location Button
            </div>
          </div>
        );
      }

      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === 'customer') {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
              <CornerDownLeft className="h-3 w-3" />
              {t('buttonReply')}
            </span>
            <p className="text-sm break-words whitespace-pre-wrap">
              {message.content_text || t('interactiveReply')}
            </p>
          </div>
        );
      }
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text || t('interactiveReply')}
        </p>
      );
    }

    case 'unsupported':
      return (
        <UnsupportedLimitationCard
          message={message}
          onRequestLocation={onRequestLocation}
        />
      );

    default:
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text || t('unsupported')}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  isStarred,
  onToggleReaction,
  template,
  broadcastOrigin,
  authorDirectory,
  onRequestLocation,
}: MessageBubbleProps) {
  const t = useTranslations('Inbox.bubble');

  // Covers 'business_app' too — a message typed in the WhatsApp Business
  // App on a phone is ours, and belongs on our side of the thread.
  const isAgent = isOutboundSender(message.sender_type);
  const author = resolveMessageAuthorLabel(
    message,
    authorDirectory ?? EMPTY_DIRECTORY
  );
  const isDeleted = Boolean(message.deleted_at);
  const isEdited = Boolean(message.edited_at);
  const time = format(new Date(message.created_at), 'HH:mm');
  const isImage = message.content_type === 'image';
  const isSticker = message.content_type === 'sticker';
  const isTemplate = message.content_type === 'template';
  const isBorderless = isImage || isSticker || isTemplate;

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div className={cn('flex flex-col', isAgent ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative',
          isBorderless ? '' : 'rounded-2xl px-3 py-2',
          !isBorderless && isAgent
            ? 'rounded-br-md bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50'
            : '',
          !isBorderless && !isAgent
            ? 'bg-muted text-foreground rounded-bl-md'
            : ''
        )}
      >
        {message.forwarded_from_message_id && (
          <div className="text-muted-foreground/90 mb-1 flex items-center gap-1 text-[11px] italic">
            <Forward className="h-3 w-3 shrink-0" />
            <span>Forwarded</span>
          </div>
        )}
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={false}
          />
        )}
        {/* A deleted message must NOT render its content. The text is
            still in the column (the delete is soft, so the thread keeps
            its shape and replies pointing here do not dangle), but
            showing it would display something the sender explicitly
            retracted — and would disagree with what WhatsApp shows on the
            phone. */}
        {isDeleted ? (
          <p className="flex items-center gap-1.5 text-sm italic opacity-60">
            <Ban className="size-3.5 shrink-0" />
            This message was deleted
          </p>
        ) : (
          <MessageContent
            message={message}
            broadcastOrigin={broadcastOrigin}
            t={t}
            template={template}
            onRequestLocation={onRequestLocation}
          />
        )}
        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isAgent ? 'justify-end' : 'justify-start'
          )}
        >
          {/* WHO SENT THIS.
              One badge, five possible answers, resolved in
              lib/messages/author-label.ts:

                a member's name  sent from the CRM by that teammate
                Owner           sent from the CRM by the account owner
                AI              a model wrote it
                Automation      a Flow or automation rule sent it
                Phone           typed in the WhatsApp Business App

              Renders nothing when there is no honest answer — an
              'agent' row with no sender_id (anything sent before
              migration 075, or a public-API send). A guessed name is
              worse than no name. */}
          {author ? (
            <AuthorBadge
              onFill={isAgent && !isBorderless}
              icon={
                author.kind === 'phone'
                  ? Smartphone
                  : author.kind === 'ai'
                    ? Sparkles
                    : author.kind === 'automation'
                      ? Zap
                      : author.kind === 'owner'
                        ? Crown
                        : User
              }
              label={
                author.kind === 'person'
                  ? author.name
                  : author.kind === 'owner'
                    ? t('ownerBadge')
                    : author.kind === 'ai'
                      ? t('aiBadge')
                      : author.kind === 'automation'
                        ? t('automationBadge')
                        : t('phoneBadge')
              }
              title={
                author.kind === 'person'
                  ? t('personBadgeTitle', { name: author.name })
                  : author.kind === 'owner'
                    ? t('ownerBadgeTitle')
                    : author.kind === 'ai'
                      ? t('aiBadgeTitle')
                      : author.kind === 'automation'
                        ? t('automationBadgeTitle')
                        : t('phoneBadgeTitle')
              }
            />
          ) : null}
          <span
            className={cn(
              'text-[10px]',
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent && !isImage
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground'
            )}
          >
            {/* WhatsApp marks an edited message beside its timestamp, so
                this matches. Without it the CRM shows corrected text with
                no hint it changed, and an agent reading back a thread
                cannot tell why their quote no longer matches. Suppressed
                on a deleted message, where it would be noise. */}
            {isEdited && !isDeleted ? 'edited · ' : null}
            {time}
          </span>
          {isStarred && (
            <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
          )}
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {/* Sits OUTSIDE the bubble, directly beneath it. Inside, it would
          inherit the bubble's green fill and the red would be unreadable —
          and it belongs to the delivery outcome rather than the message
          content the customer would have seen. */}
      <FailureReason message={message} />
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
