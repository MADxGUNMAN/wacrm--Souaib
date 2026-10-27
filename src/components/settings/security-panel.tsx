'use client';

import { useSearchParams } from 'next/navigation';
import {
  History,
  KeyRound,
  Laptop,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { replaceSearchParams } from '@/lib/url-state';
import { PasswordForm } from './password-form';
import { SessionsCard } from './sessions-card';
import { DevicesTable } from './security/devices-table';
import { LoginActivityTable } from './security/login-activity-table';
import { TwoFactorSettings } from './security/two-factor-settings';

/**
 * "Login & security" section. Personal to the signed-in user: owners and
 * members each see and manage only their own password, devices and
 * activity. Sub-views live in `?view=` so each one is deep-linkable.
 */
const VIEWS = ['two-factor', 'devices', 'activity', 'password'] as const;
type SecurityView = (typeof VIEWS)[number];

const VIEW_META: Record<
  SecurityView,
  { label: string; hint: string; icon: LucideIcon }
> = {
  'two-factor': {
    label: 'Two-factor authentication',
    hint: 'Settings',
    icon: ShieldCheck,
  },
  devices: { label: 'Logged-in devices', hint: 'Sessions', icon: Laptop },
  activity: { label: 'Login activity', hint: 'Logs', icon: History },
  password: { label: 'Password & sign-out', hint: 'Settings', icon: KeyRound },
};

function resolveView(raw: string | null): SecurityView {
  return (VIEWS as readonly string[]).includes(raw ?? '')
    ? (raw as SecurityView)
    : 'devices';
}

export function SecurityPanel() {
  const t = useTranslations('Settings.security');
  const searchParams = useSearchParams();
  const view = resolveView(searchParams.get('view'));

  const select = (next: SecurityView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'security');
    params.set('view', next);
    // Client-only sub-view: no server navigation (see lib/url-state).
    replaceSearchParams(params);
  };

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <div>
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          {t('title')}
        </h2>

        <nav
          aria-label="Security views"
          className="bg-muted/70 border-border/50 text-muted-foreground mt-2.5 inline-flex items-center rounded-lg border p-1"
        >
          {VIEWS.map((v) => {
            const meta = VIEW_META[v];
            const Icon = meta.icon;
            const active = v === view;
            return (
              <button
                key={v}
                type="button"
                onClick={() => select(v)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-all sm:text-sm',
                  active
                    ? 'bg-background text-foreground font-medium shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'size-3.5 shrink-0 transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                  aria-hidden="true"
                />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0">
        {view === 'two-factor' ? <TwoFactorSettings /> : null}
        {view === 'devices' ? <DevicesTable /> : null}
        {view === 'activity' ? <LoginActivityTable /> : null}
        {view === 'password' ? (
          <div className="max-w-2xl space-y-4">
            <PasswordForm />
            <SessionsCard />
          </div>
        ) : null}
      </div>
    </section>
  );
}
