import type { Metadata } from 'next';

import { TemplateManager } from '@/components/settings/template-manager';

export const metadata: Metadata = {
  title: 'Message templates',
};

/**
 * Templates get their own route rather than living as a Settings tab.
 *
 * A three-step creation wizard does not belong inside a settings dialog,
 * and templates are day-to-day working material — you pick one every
 * time you send a broadcast — not configuration you set once.
 *
 * The list itself is `TemplateManager`, which owns the whole screen
 * INCLUDING the heading. This route used to render its own <h1> above it
 * while the component rendered a SettingsPanelHead of its own — a
 * leftover from when templates were a Settings tab — so "Message
 * templates" appeared on the page twice. The route is now just a
 * container, which also keeps the action buttons on the same line as the
 * title, where they belong.
 */
export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <TemplateManager />
    </div>
  );
}
