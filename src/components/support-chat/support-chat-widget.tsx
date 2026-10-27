'use client';

// ============================================================
// The floating Live chat bubble — a launcher in the bottom-right corner of
// every CRM page that opens the support thread in a panel, without leaving
// what you were doing.
//
// Visibility, in order:
//   1. Replai must offer Live chat to this user (tenant store)
//   2. Replai's bubble switch must be on          (availability.widgetEnabled)
//   3. The user must not have hidden it           (widget prefs)
//   4. Not on Settings → Live chat itself, which already IS the chat —
//      two live threads on one screen would both mark messages read and
//      race each other's scroll.
//
// ─── Placement ───────────────────────────────────────────────
//
// Always bottom-right. It lifts above the things that live along the
// bottom edge: the inbox composer (whose Send button is exactly where the
// bubble would otherwise sit) and the inbox's minimized floating chat tabs.
// On small screens the open panel takes the whole screen.
//
// ─── Why the thread stays mounted while collapsed ────────────
//
// Reopening is instant and keeps scroll, drafts and loaded images. The
// thread is told it is inactive while collapsed, which stops it marking
// replies read behind the user's back — otherwise the unread badge would
// clear for a message nobody saw.
// ============================================================

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  EyeOff,
  Headset,
  Maximize2,
  MessageCircle,
  Minimize2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useSupportTenant } from '@/hooks/use-support-tenant';
import { useWidgetPrefs } from '@/lib/support-chat/widget-prefs';
import { cn } from '@/lib/utils';
import { SupportThread } from './support-thread';

const LAUNCHER = 56;
const EDGE = 20;
const GAP = 12;
const PANEL_MAX_H = 580;
const PREVIEW_MS = 8000;

export function SupportChatWidget() {
  // useSearchParams needs a Suspense boundary or the whole dashboard
  // bails out of static rendering. The bubble is decorative at first
  // paint, so a null fallback costs nothing.
  return (
    <Suspense fallback={null}>
      <SupportChatWidgetInner />
    </Suspense>
  );
}

function SupportChatWidgetInner() {
  const { user, isOwner } = useAuth();
  const { available, availability, unread, preview, replyPulse } =
    useSupportTenant();
  const { prefs, update } = useWidgetPrefs(user?.id);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** Mount the thread on first open, then keep it (see header). */
  const [hasOpened, setHasOpened] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const onLiveChatPage =
    pathname === '/settings' && searchParams.get('tab') === 'live-chat';

  const visible =
    available &&
    availability?.widgetEnabled === true &&
    !prefs.hidden &&
    !onLiveChatPage;

  // ---- Reply preview -------------------------------------------------
  //
  // The store's replyPulse ticks only for a NEW reply arriving live, never
  // for unread already waiting at page load, so this never pops over the
  // page just because the CRM was opened.
  //
  // Derived during render (React's "adjust state when a prop changes"
  // pattern) rather than in an effect, so there is no extra commit.
  const [seenPulse, setSeenPulse] = useState(replyPulse);
  if (replyPulse !== seenPulse) {
    setSeenPulse(replyPulse);
    if (!open && visible) {
      setPreviewText(preview || 'New message from Replai Support');
    }
  }

  useEffect(() => {
    if (!previewText) return;
    const t = setTimeout(() => setPreviewText(null), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [previewText]);

  const openPanel = useCallback(() => {
    setHasOpened(true);
    setOpen(true);
    setPreviewText(null);
  }, []);

  // Escape collapses full view first, or collapses the panel — unless a modal
  // inside it (the image viewer) is open, which owns Escape and must close first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (expanded) {
        setExpanded(false);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, expanded]);

  // Lock background scroll when expanded into full view.
  useEffect(() => {
    if (!open || !expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, expanded]);

  if (!visible) return null;

  // Uniform bottom offset matching dashboard and other pages.
  const launcherBottom = EDGE;
  const aboveLauncher = launcherBottom + LAUNCHER + GAP;

  const hideBubble = () => {
    setExpanded(false);
    setOpen(false);
    setPreviewText(null);
    update({ hidden: true });
    toast('Chat bubble hidden', {
      description: 'Bring it back any time in Settings → Live chat.',
      action: { label: 'Undo', onClick: () => update({ hidden: false }) },
    });
  };

  const welcome =
    availability?.welcomeMessage || 'Ask us anything — we reply right here.';

  return (
    <>
      {/* ---- Panel ---- */}
      {hasOpened ? (
        <div
          role="dialog"
          aria-label="Live chat with Replai Support"
          aria-hidden={!open}
          className={cn(
            'bg-background border-border fixed flex flex-col overflow-hidden border shadow-2xl transition-[opacity,transform] duration-200',
            // Full screen when expanded; on phones full screen; compact card above launcher otherwise.
            expanded
              ? 'inset-0 z-50 h-full w-full rounded-none border-0'
              : 'z-40 max-sm:inset-0 sm:right-5 sm:bottom-(--panel-bottom) sm:h-(--panel-h) sm:w-[380px] sm:rounded-2xl',
            open
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-3 opacity-0'
          )}
          style={
            !expanded
              ? ({
                  '--panel-bottom': `${aboveLauncher}px`,
                  '--panel-h': `min(${PANEL_MAX_H}px, calc(100vh - ${aboveLauncher + GAP}px))`,
                } as React.CSSProperties)
              : undefined
          }
          // `inert` on the collapsed panel keeps its buttons out of the tab
          // order; opacity alone would leave invisible focusable controls.
          {...(!open ? { inert: true } : {})}
        >
          <div className="bg-primary text-primary-foreground flex shrink-0 items-center gap-2 px-4 py-3">
            <span className="bg-primary-foreground/15 mr-1 flex size-9 shrink-0 items-center justify-center rounded-full">
              <Headset className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Replai Support</p>
              <p className="text-primary-foreground/80 truncate text-xs">
                {welcome}
              </p>
            </div>

            <HeaderButton
              label={expanded ? 'Exit full view' : 'Open in full view'}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </HeaderButton>

            <HeaderButton label="Hide chat bubble" onClick={hideBubble}>
              <EyeOff className="size-4" />
            </HeaderButton>

            {/* Mobile close button: on small screens the panel is full screen and the launcher is hidden */}
            <HeaderButton
              label="Close"
              onClick={() => {
                setExpanded(false);
                setOpen(false);
              }}
              className="sm:hidden"
            >
              <X className="size-4" />
            </HeaderButton>
          </div>

          <SupportThread
            viewerKind="account"
            currentUserId={user?.id}
            canManageAll={isOwner}
            allowExpand={false}
            active={open}
            emptyHint={welcome}
            className="min-h-0 flex-1"
          />
        </div>
      ) : null}

      {/* ---- Reply preview ---- */}
      {previewText && !open ? (
        <div
          role="status"
          className="bg-card border-border fixed right-5 z-40 w-72 max-w-[calc(100vw-40px)] rounded-2xl border p-3 shadow-xl"
          style={{ bottom: aboveLauncher }}
        >
          <button
            type="button"
            onClick={openPanel}
            className="flex w-full items-start gap-3 pr-5 text-left"
          >
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
              <Headset className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-xs font-semibold">
                Replai Support
              </span>
              <span className="text-muted-foreground line-clamp-2 text-sm">
                {previewText}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewText(null)}
            aria-label="Dismiss"
            className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-full"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* ---- Launcher ---- */}
      <button
        type="button"
        onClick={() => {
          if (open) {
            setExpanded(false);
            setOpen(false);
          } else {
            openPanel();
          }
        }}
        aria-label={
          open
            ? 'Close Live chat'
            : unread > 0
              ? `Open Live chat, ${unread} unread`
              : 'Open Live chat'
        }
        aria-expanded={open}
        title="Live chat"
        className={cn(
          'bg-primary text-primary-foreground ring-background fixed right-5 z-40 flex items-center justify-center rounded-full shadow-lg ring-4 transition-transform hover:scale-105 focus-visible:ring-offset-2 focus-visible:outline-none',
          // On phones the open panel is full screen and has its own close
          // button, so the launcher would only sit on top of the composer.
          // In full view on desktop, also hide the launcher.
          open && (expanded ? 'hidden' : 'max-sm:hidden')
        )}
        style={{ bottom: launcherBottom, width: LAUNCHER, height: LAUNCHER }}
      >
        {unread > 0 && !open ? (
          <span
            aria-hidden="true"
            className="bg-primary absolute inset-0 animate-ping rounded-full opacity-30"
          />
        ) : null}
        <span
          className={cn(
            'relative transition-transform duration-200',
            open && 'rotate-90'
          )}
        >
          {open ? (
            <X className="size-6" />
          ) : (
            <MessageCircle className="size-6" />
          )}
        </span>
        {unread > 0 && !open ? (
          <span
            aria-hidden="true"
            className="bg-destructive ring-background absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
    </>
  );
}

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'text-primary-foreground/90 hover:bg-primary-foreground/15 inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
        className
      )}
    >
      {children}
    </button>
  );
}
