'use client';

// ============================================================
// Settings → Live chat. The customer's end of the support thread.
//
// One thread per workspace, not per user: anyone with access to this pane
// sees the same conversation, and every message is stamped with who on
// the team wrote it. A per-user thread would give the support side N
// threads to triage for one workspace's problem while hiding what a
// colleague already asked.
//
// Also where the floating chat bubble is configured. It has to live here
// and not only in the bubble's own menu: a user who hides the bubble has,
// by definition, no bubble left to click to bring it back.
// ============================================================

import { Headset, Loader2, MessageCircleOff } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useSupportTenant } from '@/hooks/use-support-tenant';
import { SupportThread } from '@/components/support-chat/support-thread';
import { Switch } from '@/components/ui/switch';
import { useWidgetPrefs } from '@/lib/support-chat/widget-prefs';

const DEFAULT_EMPTY_HINT =
  "Send the first message and we'll get back to you here.";

export function LiveChatPanel() {
  const { user, isOwner } = useAuth();
  const { availability, available } = useSupportTenant();
  const { prefs, update } = useWidgetPrefs(user?.id);

  const heading = (
    <div>
      <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold">
        <Headset className="text-primary h-5 w-5" />
        Live chat
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Message the Replai team directly. Replies land here and everyone on your
        team with access to this page can follow along.
      </p>
    </div>
  );

  // Handled here, not only by hiding the rail item: someone can still
  // arrive on ?tab=live-chat from a bookmark or an old email link.
  if (!availability) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="border-border bg-card flex h-64 items-center justify-center rounded-xl border">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="border-border bg-card flex flex-col items-center justify-center gap-2 rounded-xl border px-6 py-12 text-center">
          <MessageCircleOff className="text-muted-foreground/70 h-8 w-8" />
          <p className="text-foreground text-sm font-medium">
            Live chat isn&rsquo;t available right now
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {availability.blockedBy === 'permission'
              ? 'Your workspace owner has not given you access to Live chat. Ask them to turn it on for you in Team members.'
              : 'Live chat is not enabled for your workspace. You can still reach us through the Help pages.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {heading}

      {/*
        Fixed height rather than `flex-1`: this pane sits inside the
        settings page's normal document flow, which has no height to fill,
        so a flex-based chat would collapse to its content and the
        scroll-to-bottom behaviour would have nothing to scroll.
      */}
      <div className="border-border bg-card flex h-[clamp(28rem,calc(100vh-24rem),44rem)] flex-col overflow-hidden rounded-xl border">
        <SupportThread
          viewerKind="account"
          currentUserId={user?.id}
          // The owner is accountable for what their team sends us, so they
          // can withdraw a colleague's message. The retract route enforces
          // the same rule.
          canManageAll={isOwner}
          emptyHint={availability.welcomeMessage || DEFAULT_EMPTY_HINT}
        />
      </div>

      {/* Only when Replai offers the bubble at all — otherwise these
          controls would configure something that never appears. */}
      {availability.widgetEnabled ? (
        <div className="border-border bg-card rounded-xl border p-4">
          <h3 className="text-foreground text-sm font-semibold">Chat bubble</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            A floating button in the bottom-right corner of every page that
            opens this chat. This setting applies to you on this browser only.
          </p>

          <label className="mt-4 flex items-center gap-3">
            <Switch
              checked={!prefs.hidden}
              onCheckedChange={(checked) => update({ hidden: !checked })}
              aria-label="Show the chat bubble"
            />
            <span className="text-foreground text-sm">
              Show the chat bubble
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
