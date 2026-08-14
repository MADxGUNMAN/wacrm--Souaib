"use client";

import { useState } from 'react';
import { LibraryBig, ShieldCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import { StarterLibraryBrowser } from '@/components/templates/starter-library-browser';
import { TemplateLibraryBrowser } from '@/components/templates/template-library-browser';

/**
 * Two libraries live on this page, and the tabs exist because they are
 * genuinely different things that would otherwise be confused:
 *
 *   Starter templates — ours. Written for an industry, fully editable,
 *   always available. This is where almost everyone should begin, so it is
 *   the default tab.
 *
 *   Meta's library — Meta's own pre-written templates. The WORDING IS FIXED
 *   but the category is already settled by Meta, which can make them
 *   cheaper to send. Not offered to every account, so it can legitimately
 *   come back empty or refused.
 *
 * Naming both "library" in one button, as before, made the second one look
 * broken whenever an account did not have access to it.
 */
export function LibraryTabs() {
  const [tab, setTab] = useState<'starter' | 'meta'>('starter');

  const tabs = [
    {
      id: 'starter' as const,
      label: 'Starter templates',
      icon: LibraryBig,
      hint: 'Written by us, grouped by industry. Fully editable.',
    },
    {
      id: 'meta' as const,
      label: "Meta's library",
      icon: ShieldCheck,
      hint: 'Pre-approved by Meta. Fixed wording, settled category.',
    },
  ];

  const active = tabs.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">{active.hint}</p>

      {tab === 'starter' ? <StarterLibraryBrowser /> : <TemplateLibraryBrowser />}
    </div>
  );
}
