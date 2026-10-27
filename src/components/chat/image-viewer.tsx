'use client';

// ============================================================
// Full-screen image viewer for chat attachments (WhatsApp Inbox & Support Chat).
//
// Modelled on WhatsApp Web's viewer: opaque backdrop, header naming who sent
// it and when, zoom (buttons, keyboard +/-, 0, Ctrl+wheel, double-click),
// rotate, download, previous/next navigation across the thread's images,
// and a thumbnail filmstrip.
//
// Portalled to document.body so overflow-hidden ancestors never clip it.
// ============================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ViewerImage {
  messageId: string;
  url: string;
  filename?: string | null;
  /** Already-formatted, e.g. "Source Vehicle · 28 Sep, 12:53". */
  caption: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const SCALE_STEP = 0.5;

export function ImageViewer({
  images,
  startIndex,
  onClose,
}: {
  /** Every image in the thread, so the arrows and filmstrip can navigate them. */
  images: ViewerImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const current = images[index];

  const resetView = useCallback(() => {
    setScale(MIN_SCALE);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        const next = prev + delta;
        if (next < 0 || next >= images.length) return prev;
        return next;
      });
      resetView();
    },
    [images.length, resetView]
  );

  const zoom = useCallback((delta: number) => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Lock the page behind the overlay and trap focus.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlayRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
          e.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          go(-1);
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoom(SCALE_STEP);
          break;
        case '-':
          e.preventDefault();
          zoom(-SCALE_STEP);
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, zoom, resetView]);

  // Ctrl/⌘ + wheel zooms
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
    },
    [zoom]
  );

  const onPointerDown = (e: ReactMouseEvent) => {
    if (scale === MIN_SCALE) return;
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    setIsDragging(true);
  };
  const onPointerMove = (e: ReactMouseEvent) => {
    const start = dragRef.current;
    if (!start) return;
    setOffset({ x: e.clientX - start.x, y: e.clientY - start.y });
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (scale > MIN_SCALE) {
      resetView();
    } else {
      zoom(1.5);
    }
  };

  if (!current) return null;

  const viewer = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.filename ?? 'Image'}
      tabIndex={-1}
      onWheel={onWheel}
      className="fixed inset-0 z-[100] flex flex-col bg-neutral-950/95 backdrop-blur-sm outline-none"
    >
      {/* Header. Dark and opaque so light images cannot wash out controls */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {current.filename ?? 'Image'}
          </p>
          <p className="truncate text-xs text-white/60">{current.caption}</p>
        </div>

        {images.length > 1 ? (
          <span className="shrink-0 text-xs text-white/60 tabular-nums">
            {index + 1} / {images.length}
          </span>
        ) : null}

        <ViewerButton
          label="Zoom out"
          onClick={() => zoom(-SCALE_STEP)}
          disabled={scale <= MIN_SCALE}
        >
          <ZoomOut className="size-4" />
        </ViewerButton>
        <ViewerButton
          label="Zoom in"
          onClick={() => zoom(SCALE_STEP)}
          disabled={scale >= MAX_SCALE}
        >
          <ZoomIn className="size-4" />
        </ViewerButton>
        <ViewerButton label="Rotate" onClick={() => setRotation((r) => r + 90)}>
          <RotateCw className="size-4" />
        </ViewerButton>
        <ViewerButton label="Reset view" onClick={resetView}>
          <Maximize2 className="size-4" />
        </ViewerButton>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          download={current.filename ?? 'image'}
          aria-label="Download"
          title="Download"
          className="inline-flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Download className="size-4" />
        </a>
        <ViewerButton label="Close" onClick={onClose}>
          <X className="size-5" />
        </ViewerButton>
      </div>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onMouseMove={onPointerMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {images.length > 1 ? (
          <>
            <ArrowButton
              side="left"
              label="Previous image"
              disabled={index === 0}
              onClick={() => go(-1)}
            />
            <ArrowButton
              side="right"
              label="Next image"
              disabled={index === images.length - 1}
              onClick={() => go(1)}
            />
          </>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.messageId}
          src={current.url}
          alt={current.filename ?? 'Shared image'}
          draggable={false}
          onMouseDown={onPointerDown}
          onDoubleClick={handleDoubleClick}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          className={cn(
            'max-h-full max-w-full object-contain select-none',
            isDragging ? '' : 'transition-transform duration-150',
            scale > MIN_SCALE
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-zoom-in'
          )}
        />
      </div>

      {/* Filmstrip */}
      {images.length > 1 ? (
        <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3">
          {images.map((image, i) => (
            <button
              key={image.messageId}
              type="button"
              aria-label={`View ${image.filename ?? `image ${i + 1}`}`}
              aria-current={i === index}
              onClick={() => {
                setIndex(i);
                resetView();
              }}
              className={cn(
                'size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                i === index
                  ? 'border-white'
                  : 'border-transparent opacity-60 hover:opacity-100'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return createPortal(viewer, document.body);
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ArrowButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'absolute top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0',
        side === 'left' ? 'left-4' : 'right-4'
      )}
    >
      {side === 'left' ? (
        <ChevronLeft className="size-5" />
      ) : (
        <ChevronRight className="size-5" />
      )}
    </button>
  );
}
