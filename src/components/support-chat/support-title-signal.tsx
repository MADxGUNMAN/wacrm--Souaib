'use client';

// ============================================================
// Put the unread support count in the document title.
//
// Covers the gap between the two things already built: the sidebar badge
// only helps someone LOOKING at this tab, and the email only fires once
// nobody has been in the app for ten minutes. In between sits the common
// case — the customer is logged in, working in another browser tab, and a
// reply arrives. `(2) Replai` in the tab strip is the one signal that
// reaches them there.
//
// ─── Why the title and not a Notification ────────────────────
//
// The Web Notification API needs a permission prompt, and asking for one
// unprompted is the behaviour every guide tells sites not to have. It also
// fails silently once denied, so the feature would appear to work for the
// developer and do nothing for the customer who clicked Block months ago.
// Nothing else in this app requests notification permission and this is
// not the feature that should start.
//
// Mounted once in the dashboard shell. Renders nothing.
// ============================================================

import { useEffect } from 'react';

import { useSupportUnreadForAccount } from '@/hooks/use-support-unread';

export function SupportTitleSignal() {
  const unread = useSupportUnreadForAccount();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    /**
     * Strip any count we previously wrote.
     *
     * Read fresh on every run rather than captured once at mount: Next.js
     * rewrites the title on navigation, so a base captured on the
     * dashboard would be restored over the top of the inbox's title the
     * next time the count changed.
     */
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');

    document.title =
      unread > 0 ? `(${unread > 9 ? '9+' : unread}) ${base}` : base;

    return () => {
      // Leave the title as the page set it. Without this, unmounting while
      // a count is showing would strand the prefix permanently.
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, '');
    };
  }, [unread]);

  return null;
}
