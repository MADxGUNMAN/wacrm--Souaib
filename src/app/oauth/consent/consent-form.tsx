'use client';

// Consent screen UI. The decision is POSTed as JSON to
// /api/oauth/decision, which answers with the URL to send the browser
// to (the AI app's callback). Navigating from script rather than via a
// form POST → 303 keeps CSP `form-action 'self'` from blocking the
// cross-origin hop back to claude.ai / chatgpt.com.
//
// Layout follows the familiar OAuth pattern (app ↔ service header,
// account card, grouped permissions, inverted primary button). Colours
// come from the theme tokens only, so it renders correctly in light and
// dark mode.

import { useId, useState, type ComponentType } from 'react';
import Link from 'next/link';

import { signOutWithAudit } from '@/lib/security/client';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  AtSign,
  BarChart3,
  Bot,
  Building2,
  ChevronRight,
  Eye,
  FileText,
  Inbox,
  Kanban,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Moon,
  Pencil,
  Send,
  ShieldCheck,
  Sun,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { loginUrlWithNext } from '@/lib/auth/next-path';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import type {
  ConsentBlock,
  OptionalTier,
  TierOption,
} from '@/lib/ai-connector/consent';
import type { AuthorizeErrorReason } from '@/lib/ai-connector/oauth';
import type { Platform } from '@/lib/ai-connector/platforms';
import type { AiScope } from '@/lib/ai-connector/scopes';

type Icon = ComponentType<{ className?: string }>;

const SCOPE_ICONS: Partial<Record<AiScope, Icon>> = {
  'contacts:read': Users,
  'conversations:read': Inbox,
  'messages:read': MessageSquare,
  'deals:read': Kanban,
  'templates:read': FileText,
  'broadcasts:read': Megaphone,
  'automations:read': Workflow,
  'analytics:read': BarChart3,
};

const TIER_ICONS: Record<OptionalTier, Icon> = {
  edit: Pencil,
  send: Send,
  broadcast: Megaphone,
  automations: Zap,
};

/** Tiers whose every action is shown to the user to confirm first. */
const CONFIRMED_TIERS: ReadonlySet<OptionalTier> = new Set([
  'send',
  'broadcast',
]);

/** Brand marks stored in /public/brands (no third-party requests here). */
const PLATFORM_LOGOS: Partial<Record<Platform, string>> = {
  chatgpt: '/brands/chatgpt.svg',
  codex: '/brands/chatgpt.svg',
  claude: '/brands/claude.svg',
  claude_code: '/brands/claude.svg',
};

// ------------------------------------------------------------
// Shared chrome
// ------------------------------------------------------------

function ThemeToggle() {
  const t = useTranslations('AiConsent');
  const { mode, toggleMode } = useTheme();
  const hydrated = useHydrated();
  const dark = hydrated && mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={t('toggleTheme')}
      title={t('toggleTheme')}
      className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/50 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
    >
      {dark ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}

/** The address bar host, shown so users can check they are on Replai. */
function CurrentHost() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <span className="border-border text-muted-foreground hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] sm:inline-flex">
      <Lock className="h-3 w-3 text-emerald-500" aria-hidden />
      {window.location.host}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('AiConsent');
  return (
    <div className="bg-background text-foreground flex min-h-screen w-full flex-col">
      <header className="border-border flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-icon.png"
            alt=""
            width={22}
            height={22}
            className="h-[22px] w-auto"
          />
          <span className="text-sm font-semibold tracking-tight">Replai</span>
          <span className="text-border" aria-hidden>
            /
          </span>
          <span className="text-muted-foreground text-sm">
            {t('headerLabel')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CurrentHost />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const t = useTranslations('AiConsent');
  const links: { href: string; label: string }[] = [
    { href: '/integrations/ai', label: t('footerHowItWorks') },
    { href: '/privacy', label: t('footerPrivacy') },
    { href: '/terms', label: t('footerTerms') },
    { href: '/contact', label: t('footerHelp') },
  ];
  return (
    <footer className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-xs">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          {l.label}
        </Link>
      ))}
    </footer>
  );
}

function BrandMark({
  platform,
  appName,
}: {
  platform?: Platform;
  appName?: string;
}) {
  const logo = platform ? PLATFORM_LOGOS[platform] : undefined;
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="border-border bg-card flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border shadow-sm">
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logo} alt={appName ?? ''} className="h-9 w-9" />
        ) : (
          <Bot className="text-muted-foreground h-6 w-6" aria-hidden />
        )}
      </span>
      <ArrowLeftRight className="text-muted-foreground h-4 w-4" aria-hidden />
      <span className="border-border flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.png" alt="Replai" className="h-7 w-auto" />
      </span>
    </div>
  );
}

/**
 * Email is rendered only after hydration. Cloudflare's Email Obfuscation
 * (or a browser extension) can rewrite an email in the server HTML, which
 * breaks hydration of the whole page.
 */
function HydratedEmail({ email }: { email: string }) {
  const hydrated = useHydrated();
  return <>{hydrated ? email : '…'}</>;
}

function initials(name: string | null, email: string | null): string {
  const source = (name ?? '').trim() || (email ?? '').split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

async function switchAccount(requestId: string) {
  await signOutWithAudit();
  window.location.assign(
    loginUrlWithNext(`/oauth/consent?request_id=${requestId}`)
  );
}

function AccountCard({
  name,
  email,
  accountName,
  requestId,
  disabled,
}: {
  name: string | null;
  email: string | null;
  accountName?: string;
  requestId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('AiConsent');
  return (
    <div className="bg-muted/50 border-border flex items-center gap-3 rounded-lg border p-3">
      <span
        className="bg-foreground text-background flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        aria-hidden
      >
        {initials(name, email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name || (email ? <HydratedEmail email={email} /> : '')}
        </p>
        {email && name ? (
          <p className="text-muted-foreground truncate text-xs">
            <HydratedEmail email={email} />
          </p>
        ) : null}
        {accountName ? (
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 truncate text-xs">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{accountName}</span>
          </p>
        ) : null}
      </div>
      {requestId ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchAccount(requestId)}
          aria-label={t('switchAccount')}
          title={t('switchAccount')}
          className="text-muted-foreground hover:text-foreground hover:bg-background focus-visible:ring-ring/50 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-center justify-between border-b pb-2">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

// ------------------------------------------------------------
// Error / blocked states
// ------------------------------------------------------------

export function ConsentError({
  reason,
  cancelUrl,
  email,
  requestId,
}: {
  reason: AuthorizeErrorReason | ConsentBlock;
  cancelUrl?: string;
  email?: string | null;
  requestId?: string;
}) {
  const t = useTranslations('AiConsent');
  return (
    <Shell>
      <div className="flex flex-col items-center text-center">
        <span className="border-border bg-card flex h-14 w-14 items-center justify-center rounded-full border shadow-sm">
          <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {t(`errors.${reason}.title`)}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {t(`errors.${reason}.body`)}
        </p>
      </div>

      {email ? (
        <div className="mt-6">
          <AccountCard name={null} email={email} requestId={requestId} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-center gap-3">
        {cancelUrl ? (
          <button
            type="button"
            onClick={() => window.location.assign(cancelUrl)}
            className="bg-foreground text-background focus-visible:ring-ring/50 h-10 rounded-md px-5 text-sm font-medium transition-opacity outline-none hover:opacity-90 focus-visible:ring-2"
          >
            {t('backToApp')}
          </button>
        ) : null}
        {requestId && email ? (
          <button
            type="button"
            onClick={() => switchAccount(requestId)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/50 h-10 rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {t('switchAccount')}
          </button>
        ) : null}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------
// The form
// ------------------------------------------------------------

interface ConsentFormProps {
  requestId: string;
  csrf: string;
  appName: string;
  platform: Platform;
  devClient: boolean;
  clientHost: string | null;
  loopback: boolean;
  accountName: string;
  email: string | null;
  userName: string | null;
  /** Host the browser returns to after the decision (from our registry). */
  returnHost: string | null;
  alwaysScopes: AiScope[];
  options: TierOption[];
  reconnect: boolean;
}

export function ConsentForm(props: ConsentFormProps) {
  const t = useTranslations('AiConsent');
  const readListId = useId();
  const available = props.options.filter((o) => o.available);
  const [chosen, setChosen] = useState<Set<OptionalTier>>(
    () => new Set(available.map((o) => o.tier))
  );
  const [showRead, setShowRead] = useState(false);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readScopes = props.alwaysScopes.filter((s) => s !== 'profile');

  const toggle = (tier: OptionalTier, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(tier);
      else next.delete(tier);
      return next;
    });

  async function decide(decision: 'allow' | 'deny') {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch('/api/oauth/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          request_id: props.requestId,
          csrf: props.csrf,
          decision,
          tiers: [...chosen],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        redirect_url?: string;
        code?: string;
      };
      if (res.ok && body.redirect_url) {
        window.location.assign(body.redirect_url);
        return;
      }
      setError(
        body.code === 'expired' ? t('decisionExpired') : t('decisionFailed')
      );
    } catch {
      setError(t('decisionFailed'));
    }
    setBusy(null);
  }

  const locked = busy !== null;
  const allOn =
    available.length > 0 && available.every((o) => chosen.has(o.tier));

  return (
    <Shell>
      <BrandMark platform={props.platform} appName={props.appName} />

      <h1 className="mt-6 text-center text-2xl leading-tight font-semibold tracking-tight text-balance">
        {props.reconnect
          ? t('requestTitleReconnect', { app: props.appName })
          : t('requestTitle', { app: props.appName })}
      </h1>

      <div className="border-border bg-card mt-6 space-y-6 rounded-xl border p-4 shadow-sm sm:p-5">
        <AccountCard
          name={props.userName}
          email={props.email}
          accountName={props.accountName}
          requestId={props.requestId}
          disabled={locked}
        />

        {(props.devClient || props.loopback) && (
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-600"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
              aria-hidden
            />
            <div className="space-y-1">
              {props.devClient && (
                <p>
                  {props.clientHost
                    ? t('devClientHost', { host: props.clientHost })
                    : t('devClient')}
                </p>
              )}
              {props.loopback && <p>{t('loopback', { app: props.appName })}</p>}
            </div>
          </div>
        )}

        <p className="text-sm font-medium">
          {t('requires', { app: props.appName })}
        </p>

        {/* Account */}
        <section aria-labelledby="sec-account" className="space-y-3">
          <SectionHeading>
            <span id="sec-account">{t('sectionAccount')}</span>
          </SectionHeading>
          <ul className="space-y-2.5 text-sm">
            <PermissionLine icon={KeyRound} text={t('accountIdentity')} />
            <PermissionLine icon={AtSign} text={t('accountEmail')} />
            <PermissionLine
              icon={Building2}
              text={t('accountWorkspace', { account: props.accountName })}
            />
          </ul>
        </section>

        {/* Workspace data (read) */}
        {readScopes.length > 0 && (
          <section aria-labelledby="sec-read" className="space-y-1">
            <SectionHeading>
              <span id="sec-read">{t('sectionWorkspace')}</span>
            </SectionHeading>
            <button
              type="button"
              aria-expanded={showRead}
              aria-controls={readListId}
              onClick={() => setShowRead((v) => !v)}
              className="hover:bg-muted/60 focus-visible:ring-ring/50 -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2"
            >
              <Eye className="text-muted-foreground h-4 w-4" aria-hidden />
              <span className="font-medium">{t('readOnly')}</span>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                {readScopes.length}
              </span>
              <ChevronRight
                className={cn(
                  'text-muted-foreground ml-auto h-4 w-4 transition-transform',
                  showRead && 'rotate-90'
                )}
                aria-hidden
              />
            </button>
            <ul
              id={readListId}
              hidden={!showRead}
              className="border-border ml-2 space-y-2.5 border-l py-2 pl-4 text-sm"
            >
              {readScopes.map((s) => (
                <PermissionLine
                  key={s}
                  icon={SCOPE_ICONS[s] ?? Eye}
                  text={t(`scopes.${s}`)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* Optional actions */}
        {props.options.length > 0 && (
          <section aria-labelledby="sec-actions" className="space-y-1">
            <SectionHeading
              action={
                available.length > 0 ? (
                  <div className="flex items-center gap-1 text-xs">
                    <PresetButton
                      active={chosen.size === 0}
                      disabled={locked}
                      onClick={() => setChosen(new Set())}
                    >
                      {t('presetReadOnly')}
                    </PresetButton>
                    <PresetButton
                      active={allOn}
                      disabled={locked}
                      onClick={() =>
                        setChosen(new Set(available.map((o) => o.tier)))
                      }
                    >
                      {t('presetAll')}
                    </PresetButton>
                  </div>
                ) : null
              }
            >
              <span id="sec-actions">{t('sectionActions')}</span>
            </SectionHeading>
            <ul className="divide-border divide-y">
              {props.options.map((opt) => {
                const id = `tier-${opt.tier}`;
                const on = opt.available && chosen.has(opt.tier);
                const TierIcon = TIER_ICONS[opt.tier];
                return (
                  <li key={opt.tier} className="flex items-start gap-3 py-3">
                    <TierIcon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        opt.available
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/50'
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={id}
                          id={`${id}-label`}
                          className={cn(
                            'text-sm font-medium',
                            !opt.available && 'text-muted-foreground'
                          )}
                        >
                          {t(`tiers.${opt.tier}.title`)}
                        </label>
                        {opt.available && CONFIRMED_TIERS.has(opt.tier) ? (
                          <span className="border-border text-muted-foreground rounded-full border px-1.5 py-px text-[10px] font-medium">
                            {t('asksFirst')}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                        {opt.available
                          ? t(`tiers.${opt.tier}.body`)
                          : t(`denied.${deniedKey(opt.reasonCode)}`)}
                      </p>
                    </div>
                    <Switch
                      id={id}
                      aria-labelledby={`${id}-label`}
                      checked={on}
                      disabled={!opt.available || locked}
                      onCheckedChange={(v: boolean) => toggle(opt.tier, v)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="bg-muted/50 text-muted-foreground flex items-start gap-2.5 rounded-lg p-3 text-xs leading-relaxed">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
            aria-hidden
          />
          <p>
            {t('reassuranceShort', { app: props.appName })}{' '}
            <Link
              href="/settings?tab=ai-connectors"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground font-medium underline-offset-2 hover:underline"
            >
              {t('manageLink')}
            </Link>
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={locked}
          onClick={() => decide('deny')}
          className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/50 inline-flex h-10 min-w-24 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {busy === 'deny' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            t('deny')
          )}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => decide('allow')}
          className="bg-foreground text-background focus-visible:ring-ring/50 inline-flex h-10 min-w-32 items-center justify-center rounded-md px-5 text-sm font-medium shadow-sm transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 disabled:opacity-60"
        >
          {busy === 'allow' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            t('allowAccess')
          )}
        </button>
      </div>

      {props.returnHost ? (
        <p className="text-muted-foreground mt-4 text-center text-xs">
          {t('returnTo', { host: props.returnHost })}
        </p>
      ) : null}
    </Shell>
  );
}

function PermissionLine({
  icon: LineIcon,
  text,
}: {
  icon: Icon;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <LineIcon
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
        aria-hidden
      />
      <span>{text}</span>
    </li>
  );
}

function PresetButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring/50 rounded-md px-2 py-1 font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

const DENIED_KEYS = new Set([
  'policy_tier',
  'policy_messaging',
  'policy_broadcasts',
  'policy_automations',
  'role_section',
]);

function deniedKey(code: string | null): string {
  return code && DENIED_KEYS.has(code) ? code : 'generic';
}
