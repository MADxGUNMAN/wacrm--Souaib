'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  Contact,
} from 'lucide-react';
import { format } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
  onMediaClick?: (message: Message) => void;
}

function StatusIcon({ status, isAgent }: { status: Message['status']; isAgent: boolean }) {
  const defaultColor = isAgent ? 'text-white/70' : 'text-muted-foreground';
  
  switch (status) {
    case 'sending':
      return <Clock className={cn("h-3 w-3", defaultColor)} />;
    case 'sent':
      return <Check className={cn("h-3 w-3", defaultColor)} />;
    case 'delivered':
      return <CheckCheck className={cn("h-3 w-3", defaultColor)} />;
    case 'read':
      return <CheckCheck className={cn("h-3 w-3", isAgent ? 'text-white' : 'text-blue-600')} />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-600" />;
    default:
      return null;
  }
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-700/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label} unavailable</span>
    </div>
  );
}

function MediaImage({ url, alt, onClick }: { url: string; alt: string; onClick?: () => void }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-slate-700">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn("max-h-64 max-w-60 rounded-lg object-cover", onClick && "cursor-pointer hover:opacity-90 transition-opacity")}
      onError={() => setError(true)}
      onClick={onClick}
    />
  );
}

function MessageContent({ message, onMediaClick }: { message: Message; onMediaClick?: (message: Message) => void }) {
  switch (message.content_type) {
    case 'text':
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text}
        </p>
      );

    case 'image':
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" onClick={onMediaClick ? () => onMediaClick(message) : undefined} />
          ) : (
            <MediaUnavailable label="Image" />
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
        <div className="relative">
          {message.media_url ? (
            <video
              src={message.media_url}
              controls
              className={cn("max-h-64 max-w-60 rounded-lg", onMediaClick && "cursor-pointer hover:opacity-90 transition-opacity")}
              onClick={(e) => {
                if (onMediaClick) {
                  e.preventDefault();
                  onMediaClick(message);
                }
              }}
            />
          ) : (
            <MediaUnavailable label="Video" />
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
            <MediaUnavailable label="Audio" />
          )}
        </div>
      );

    case 'document':
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || 'Document'} />;
      }
      return (
        <a
          href={message.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2 text-sm hover:bg-slate-700"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">{message.content_text || 'Document'}</span>
        </a>
      );

    case 'template':
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
            <LayoutTemplate className="h-3 w-3" />
            Template
          </span>
          {message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'location':
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || 'Location shared'}</span>
        </div>
      );

    case 'contact_card':
      return (
        <div className="flex items-center gap-2 rounded-lg bg-slate-700/40 px-3 py-2 text-sm">
          <Contact className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="break-words">
            {message.content_text || 'Contact shared'}
          </span>
        </div>
      );

    default:
      return (
        <p className="text-sm break-words whitespace-pre-wrap">
          {message.content_text || '[Unsupported message type]'}
        </p>
      );
  }
}

export function MessageBubble({ message, onMediaClick }: MessageBubbleProps) {
  const isAgent =
    message.sender_type === 'agent' || message.sender_type === 'bot';
  const time = format(new Date(message.created_at), 'HH:mm');

  return (
    <div
      className={cn('flex w-full', isAgent ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'relative max-w-[75%] rounded-2xl px-3 py-2',
          isAgent
            ? 'rounded-br-md bg-emerald-600 text-white'
            : 'rounded-bl-md bg-slate-200 text-slate-900'
        )}
      >
        <MessageContent message={message} onMediaClick={onMediaClick} />
        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isAgent ? 'justify-end text-white/70' : 'justify-start text-foreground/60'
          )}
        >
          <span className="text-[10px]">{time}</span>
          {isAgent && <StatusIcon status={message.status} isAgent={isAgent} />}
        </div>
      </div>
    </div>
  );
}
