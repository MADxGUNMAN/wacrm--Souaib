'use client';

// ============================================================
// /super-admin/auto-mail — automated trial and renewal reminders.
//
// Three tabs, in the order an operator needs them:
//   Recipients — who is in line, and Send now for one-offs
//   Settings   — timing and copy, per segment, saved independently
//   History    — every send with its delivery outcome
//
// Plain button tabs rather than the shared Tabs primitive, matching
// /super-admin/payments: each panel owns its own fetch state, and buttons
// make that ownership obvious at a glance.
// ============================================================

import { useState } from 'react';
import { History, Send, Settings2, Users } from 'lucide-react';

import { HistoryPanel } from '@/components/super-admin/auto-mail/history-panel';
import { RecipientsPanel } from '@/components/super-admin/auto-mail/recipients-panel';
import { SegmentSettingsPanel } from '@/components/super-admin/auto-mail/segment-settings-panel';
import { cn } from '@/lib/utils';

type Tab = 'recipients' | 'settings' | 'history';

export default function AutoMailPage() {
  const [tab, setTab] = useState<Tab>('recipients');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-slate-200">
        <TabButton
          active={tab === 'recipients'}
          onClick={() => setTab('recipients')}
          icon={Users}
          label="Recipients"
        />
        <TabButton
          active={tab === 'settings'}
          onClick={() => setTab('settings')}
          icon={Settings2}
          label="Settings & templates"
        />
        <TabButton
          active={tab === 'history'}
          onClick={() => setTab('history')}
          icon={History}
          label="History"
        />
      </div>

      {tab === 'recipients' ? (
        <RecipientsPanel />
      ) : tab === 'settings' ? (
        <SegmentSettingsPanel />
      ) : (
        <HistoryPanel />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-[#25D366] text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
