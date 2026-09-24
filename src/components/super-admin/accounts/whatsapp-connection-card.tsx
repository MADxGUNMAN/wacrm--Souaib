'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Info,
  KeyRound,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Smartphone,
  Sparkles,
  Webhook,
} from 'lucide-react';

import {
  FactRow,
  IdField,
  StatusBadge,
} from '@/components/super-admin/status-badge';
import { Button } from '@/components/ui/button';
import { readApiResponse } from '@/lib/http/read-api-response';
import {
  describeConnectionFlow,
  describeConnectionMode,
  describeDisconnect,
  describeInsights,
  describeMetaPhoneStatus,
  describeModeDrift,
  describePayment,
  describeQuality,
  describeReadiness,
  describeRegistration,
  describeTokenExpiry,
  describeVerification,
  describeWebhook,
} from '@/lib/super-admin/whatsapp-connection';
import {
  formatDisplayPhoneNumber,
  PHONE_UNKNOWN_LABEL,
} from '@/lib/whatsapp/format-phone-display';
import type {
  SuperAdminWhatsAppConfig,
  SuperAdminWhatsAppHealth,
} from '@/types/super-admin';

// ============================================================
// The tenant's WhatsApp connection, in full, for the platform operator.
//
// Two tiers on purpose:
//
//   OURS    connection type, flow, registration, webhooks, token expiry,
//           insights. All already in the deep-dive payload, so it renders
//           with the page and costs nothing.
//   META'S  sending verdict, payment, business verification, display name,
//           quality, limits. Needs the tenant's decrypted token and several
//           Meta round trips, so it loads separately and the card stays
//           useful if Meta is slow or the token is dead.
//
// That split is also why the Meta half has its own Recheck button: it is the
// half that can be stale.
// ============================================================

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

export function WhatsAppConnectionCard({
  accountId,
  config,
}: {
  accountId: string;
  config: SuperAdminWhatsAppConfig | null;
}) {
  const [health, setHealth] = useState<SuperAdminWhatsAppHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/super-admin/accounts/${accountId}/whatsapp-health`,
        { cache: 'no-store' }
      );
      const result = await readApiResponse<SuperAdminWhatsAppHealth>(
        res,
        'loaded'
      );
      if (!result.ok || !result.data) {
        setLoadError(result.error ?? 'Could not reach Meta for this account.');
        return;
      }
      setHealth(result.data);
    } catch {
      setLoadError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Fetched on mount rather than behind a button: the operator opened this
  // page to find out the state, and making them click again to see the half
  // that matters most would defeat the point. The page itself never waits on
  // it, so a slow Meta only delays this panel.
  useEffect(() => {
    if (config) void loadHealth();
  }, [config, loadHealth]);

  if (!config) {
    return (
      <div className="rounded-xl border border-t-2 border-slate-200 border-t-slate-300 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-slate-400">
          <MessageSquare className="h-5 w-5" />
          <h3 className="text-lg font-bold text-slate-900">
            WhatsApp Configuration
          </h3>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
          <Phone className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">
            No WhatsApp API connection configured for this account.
          </p>
        </div>
      </div>
    );
  }

  const mode = describeConnectionMode(config.connection_mode);
  const flow = describeConnectionFlow(config.connection_source);
  const registration = describeRegistration(config);
  const webhook = describeWebhook({
    recordedAt: config.subscribed_apps_at,
    metaSubscribed: health?.webhook_subscribed,
  });
  const token = describeTokenExpiry(config.token_expires_at);
  const disconnect = describeDisconnect(config);
  const insights = describeInsights(
    config.insights_enabled_at,
    config.connection_mode
  );

  const readiness = describeReadiness(health?.sending.readiness);
  const payment = describePayment(health?.sending.payment);
  const verification = describeVerification(health?.sending.verification);
  const quality = describeQuality(health?.phone?.quality_rating);
  const metaStatus = describeMetaPhoneStatus(health?.phone?.status);
  const drift = describeModeDrift({
    storedMode: config.connection_mode,
    isOnBizApp: health?.phone?.is_on_biz_app,
  });

  const displayNumber = formatDisplayPhoneNumber(
    config.display_phone_number ?? health?.phone?.display_phone_number ?? null
  );

  // Meta's issues are the actionable payload of the whole card, so they get
  // their own block rather than being folded into a tooltip.
  const issues = health?.sending.issues ?? [];

  return (
    <div className="border-t-primary rounded-xl border border-t-2 border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-primary flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="text-lg font-bold text-slate-900">
            WhatsApp Configuration
          </h3>
        </div>
        <StatusBadge
          tone={mode.tone}
          icon={
            config.connection_mode === 'coexistence' ? (
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Cloud className="h-3.5 w-3.5 shrink-0" />
            )
          }
          title={mode.detail ?? undefined}
        >
          {mode.label}
        </StatusBadge>
      </div>

      <div className="space-y-5">
        {/* ---- Identity ---- */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-0.5 text-xs text-slate-500">Phone Number</div>
          {/* The NUMBER, never phone_number_id — that is an asset id and it
              used to be rendered here, making every account look like it had a
              15-digit number. The id has its own field below. */}
          {displayNumber ? (
            <div className="text-sm font-medium tracking-wider text-slate-900">
              {displayNumber}
            </div>
          ) : (
            <div className="text-sm font-medium text-slate-400 italic">
              {PHONE_UNKNOWN_LABEL}
            </div>
          )}
          {config.verified_name ? (
            <div className="mt-0.5 truncate text-xs text-slate-500">
              {config.verified_name}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <IdField label="Phone ID" value={config.phone_number_id} />
          <IdField label="WABA ID" value={config.waba_id} />
        </div>

        {/* ---- Our own record ---- */}
        <Section title="Connection" icon={<Cloud className="h-3 w-3" />}>
          <FactRow
            label="API type"
            tone={mode.tone}
            value={mode.label}
            detail={mode.detail}
          />
          <FactRow
            label="Connected via"
            tone={flow.tone}
            value={flow.label}
            detail={flow.detail}
          />
          <FactRow
            label="Number registration"
            tone={registration.tone}
            value={registration.label}
            detail={registration.detail}
          />
          <FactRow
            label="Webhooks"
            tone={webhook.tone}
            value={webhook.label}
            detail={webhook.detail}
            icon={<Webhook className="h-3.5 w-3.5 shrink-0" />}
          />
          <FactRow
            label="Access token"
            tone={token.tone}
            value={token.label}
            detail={token.detail}
            icon={<KeyRound className="h-3.5 w-3.5 shrink-0" />}
          />
          <FactRow
            label="Template insights"
            tone={insights.tone}
            value={insights.label}
            detail={insights.detail}
            icon={<Sparkles className="h-3.5 w-3.5 shrink-0" />}
          />
          {config.connection_mode === 'coexistence' &&
          config.coexistence_detected_at ? (
            <FactRow
              label="Phone pairing confirmed"
              tone="good"
              value={format(
                new Date(config.coexistence_detected_at),
                'MMM d, yyyy'
              )}
              detail="First message echo received from the phone app."
            />
          ) : null}
          {disconnect ? (
            <FactRow
              label="Disconnected"
              tone={disconnect.tone}
              value={disconnect.label}
              detail={disconnect.detail}
            />
          ) : null}
        </Section>

        {/* ---- Meta's live view ---- */}
        <Section
          title="Meta status"
          icon={<Info className="h-3 w-3" />}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadHealth()}
              disabled={loading}
              className="h-6 gap-1 px-1.5 text-[11px] text-slate-500 hover:text-slate-900"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
              />
              {loading ? 'Checking' : 'Recheck'}
            </Button>
          }
        >
          {loading && !health ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Asking Meta about this account…
            </div>
          ) : loadError ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : health?.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{health.error}</span>
            </div>
          ) : (
            <>
              <FactRow
                label="Can this account send?"
                tone={readiness.tone}
                value={readiness.label}
                detail={readiness.detail}
              />
              <FactRow
                label="Payment"
                tone={payment.tone}
                value={payment.label}
                detail={payment.detail}
              />
              <FactRow
                label="Business verification"
                tone={verification.tone}
                value={verification.label}
                detail={verification.detail}
              />
              <FactRow
                label="Display name"
                tone={
                  health?.limits.nameReview?.label === 'Approved'
                    ? 'good'
                    : health?.limits.nameReview?.label === 'Declined'
                      ? 'danger'
                      : health?.limits.nameReview?.label === 'In review'
                        ? 'info'
                        : 'warn'
                }
                value={health?.limits.nameReview?.label ?? 'Unknown'}
                detail={health?.limits.nameReview?.detail ?? null}
              />
              <FactRow
                label="Number status"
                tone={metaStatus.tone}
                value={metaStatus.label}
                detail={metaStatus.detail}
              />
              <FactRow
                label="Quality rating"
                tone={quality.tone}
                value={quality.label}
                detail={quality.detail}
              />
              {health?.limits.messaging ? (
                <FactRow
                  label="Messaging limit"
                  tone="neutral"
                  value={`${health.limits.messaging} / 24h`}
                  detail="Unique customers this number may start conversations with per day."
                />
              ) : null}
              {health?.waba?.account_review_status ? (
                <FactRow
                  label="Account review"
                  tone={
                    health.waba.account_review_status.toUpperCase() ===
                    'APPROVED'
                      ? 'good'
                      : 'warn'
                  }
                  value={health.waba.account_review_status}
                  detail={null}
                />
              ) : null}
              {drift ? (
                <FactRow
                  label="Stored type vs Meta"
                  tone={drift.tone}
                  value={drift.label}
                  detail={drift.detail}
                />
              ) : null}
            </>
          )}
        </Section>

        {/* ---- What Meta is actually complaining about ---- */}
        {issues.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              <AlertTriangle className="h-3 w-3" />
              Meta issues ({issues.length})
            </div>
            <ul className="space-y-2">
              {issues.map((issue, i) => (
                <li
                  key={`${issue.code ?? 'n'}-${i}`}
                  className={`rounded-lg border p-2.5 text-xs ${
                    issue.severity === 'blocked'
                      ? 'border-red-500/25 bg-red-500/[0.05]'
                      : 'border-amber-500/25 bg-amber-500/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone={issue.severity === 'blocked' ? 'danger' : 'warn'}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {issue.severity === 'blocked' ? 'Blocks' : 'Limits'}
                    </StatusBadge>
                    <span className="text-[10px] tracking-wider text-slate-400 uppercase">
                      {issue.subject.replace(/_/g, ' ')}
                      {issue.code ? ` · ${issue.code}` : ''}
                    </span>
                  </div>
                  {/* Meta's sentence, verbatim — never rewritten, because it
                      is what the tenant will also be shown and what support
                      can search for. */}
                  <p className="mt-1.5 text-slate-700">{issue.description}</p>
                  {issue.solution ? (
                    <p className="mt-1 text-slate-500">
                      <span className="font-medium">Meta suggests:</span>{' '}
                      {issue.solution}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : health && !health.error ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Meta is reporting no blockers or restrictions for this account.
          </div>
        ) : null}

        {health?.checked_at ? (
          <p className="text-right text-[10px] text-slate-400">
            Meta checked {format(new Date(health.checked_at), 'MMM d, HH:mm')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
