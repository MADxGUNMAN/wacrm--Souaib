'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Shield,
  CreditCard,
  Building2,
  Gauge,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMetaSDK } from '@/components/providers/meta-sdk-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  deriveVerificationState,
  resolveHealthIssueLink,
  type HealthSummary,
} from '@/lib/whatsapp/health';
import type {
  MessagingLimit,
  NameReview,
  Throughput,
  UsageTotals,
} from '@/lib/whatsapp/limits';
import { usagePercent, type InitiatedUsage } from '@/lib/whatsapp/usage';
import { SettingsPanelHead } from './settings-panel-head';
import { CoexistencePanel } from './coexistence-panel';
import { WhatsAppConnectModal } from './whatsapp-connect-modal';

interface EmbeddedConfig {
  phone_number_id: string;
  waba_id: string;
  connection_source: string;
  registered_at: string | null;
}

interface MetaAccountInfo {
  phone: {
    id: string;
    display_phone_number: string | null;
    verified_name: string | null;
    quality_rating: string | null;
    status: string | null;
    name_status: string | null;
  };
  waba: {
    id: string;
    name: string | null;
    account_review_status: string | null;
    business_verification_status: string | null;
  };
  health?: HealthSummary | null;
  limits?: {
    messaging: MessagingLimit | null;
    throughput: Throughput | null;
    nameReview: NameReview | null;
    usage: UsageTotals | null;
    initiated: InitiatedUsage | null;
    sevenDayUnique?: number;
  } | null;
}

// WhatsApp icon SVG path
// Facebook Login for Business configuration ID. This must be a configuration
// created with the *WhatsApp Embedded Signup* login variation (App Dashboard →
// Facebook Login for Business → Configurations). A generic Login for Business
// configuration authenticates fine but never runs the onboarding screens, and
// the code it returns cannot be exchanged for a business token.
const ES_CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID ?? '';

const WA_ICON_PATH =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z';

export function WhatsAppSetup() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();
  const { fbLoaded } = useMetaSDK();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<EmbeddedConfig | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [metaInfo, setMetaInfo] = useState<MetaAccountInfo | null>(null);
  const [metaInfoLoading, setMetaInfoLoading] = useState(false);

  // Track whether we already loaded for this account
  const loadedAccountIdRef = useRef<string | null>(null);

  // ── Fetch embedded config ──────────────────────────────────
  const fetchConfig = useCallback(
    async (acctId: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('whatsapp_config')
          .select('phone_number_id, waba_id, connection_source, registered_at')
          .eq('account_id', acctId)
          .maybeSingle();

        if (error) console.error('Failed to load embedded config:', error);
        setConfig(data ?? null);
      } catch (err) {
        console.error('fetchConfig error:', err);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  // Fetch live account info from Meta Graph API
  const fetchMetaInfo = useCallback(async () => {
    setMetaInfoLoading(true);
    try {
      const res = await fetch('/api/whatsapp/account-info');
      if (res.ok) {
        const data = await res.json();
        setMetaInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch Meta account info:', err);
    } finally {
      setMetaInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  // Fetch Meta account info when config is available
  useEffect(() => {
    if (config?.phone_number_id) {
      fetchMetaInfo();
    }
  }, [config?.phone_number_id, fetchMetaInfo]);

  // ── WA_EMBEDDED_SIGNUP event listener ──────────────────────
  // This captures the waba_id and phone_number_id directly from
  // Meta's client-side postMessage — more reliable than debug_token.
  const embeddedDataRef = useRef<{
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    /**
     * WHICH onboarding variation Meta finished with.
     *
     * `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` means Coexistence — the
     * number stays live on the WhatsApp Business App and also runs on the
     * Cloud API. That changes real behaviour (Meta sends us echoes of
     * messages typed on the phone) and it changes the rules the operator
     * has to follow (open the app every 13 days or Meta drops the
     * pairing). We were receiving this and throwing it away.
     */
    finish_event?: string;
  }>({});

  // Meta reports in-flow failures through the same message channel rather
  // than through the FB.login callback, so hold the last one to explain a
  // code-less response instead of blaming the user for cancelling.
  const flowErrorRef = useRef<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Meta sends these from several hosts (www./web./m.facebook.com), so
      // match the registrable domain rather than an exact origin — an exact
      // match silently drops the payload that carries waba_id.
      let host: string;
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

        // Every FINISH* variant (FINISH, FINISH_ONLY_WABA,
        // FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, FINISH_OBO_MIGRATION, ...)
        // means the customer completed onboarding and carries the asset IDs.
        if (typeof data.event === 'string' && data.event.startsWith('FINISH')) {
          embeddedDataRef.current = {
            waba_id: data.data?.waba_id ?? data.data?.waba_ids?.[0],
            phone_number_id: data.data?.phone_number_id,
            business_id: data.data?.business_id,
            // Kept verbatim rather than pre-interpreted here. The server
            // decides what it means, so the rule lives in one place and
            // a new FINISH_* variant needs no client change.
            finish_event: data.event,
          };
          flowErrorRef.current = null;
        } else if (data.event === 'ERROR' || data.data?.error_message) {
          flowErrorRef.current = data.data?.error_message ?? 'Meta reported an error during setup';
          console.error('Embedded signup error:', data.data);
        } else if (data.event === 'CANCEL') {
          flowErrorRef.current = data.data?.current_step
            ? `Setup was closed at the "${data.data.current_step}" step`
            : null;
        }
      } catch {
        // event.data might not be JSON, ignore
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ── Launch FB.login ────────────────────────────────────────
  function launchFBLogin(option: string) {
    if (!fbLoaded || typeof window === 'undefined' || !(window as any).FB) {
      toast.error('Meta SDK is not loaded yet. Please try again in a moment.');
      return;
    }

    if (!ES_CONFIG_ID) {
      toast.error(
        'WhatsApp Embedded Signup is not configured. Set NEXT_PUBLIC_META_ES_CONFIG_ID to your ' +
          'Facebook Login for Business configuration ID.',
      );
      return;
    }

    setIsConnecting(true);
    setShowConnectModal(false);

    // Reset captured data
    embeddedDataRef.current = {};
    flowErrorRef.current = null;

    // `featureType` selects the flow variation. Only the WhatsApp Business
    // app onboarding (Coexistence) variation takes a value — the standard
    // Cloud API flow expects the key to be *absent*, not an empty string,
    // otherwise Meta falls back to a plain Login for Business dialog
    // instead of the Embedded Signup screens.
    // `version: 'v4'` — NOT `sessionInfoVersion`.
    //
    // This used to send `sessionInfoVersion: '3'`, which is the older
    // Embedded Signup contract. Meta's Embedded Signup Integration Helper
    // for THIS app (App Dashboard > WhatsApp > Embedded Signup Builder)
    // generates exactly:
    //
    //   extras: { "version": "v4", "setup": {}, "featureType": ... }
    //
    // and its launch panel reports "ES Version: v4". Meta's own docs also
    // carry a deprecation notice: Embedded Signup v2 is retired on
    // October 15, 2026, with instructions to move to v4.
    //
    // The key name changed as well as the value, so the old pairing was not
    // "an older version" so much as an unrecognised key plus a missing one —
    // Meta falls back to default behaviour rather than reporting it, which is
    // why this never surfaced as an error.
    //
    // The postMessage listener above reads `data.type`, `data.event` and
    // `data.data.*`, none of which changed between these versions, so it
    // keeps working unmodified.
    const extras: Record<string, unknown> = {
      version: 'v4',
      setup: {},
    };
    if (option === 'existing' || option === 'migrate') {
      extras.featureType = 'whatsapp_business_app_onboarding';
    }

    // Embedded Signup requires response_type 'code' plus
    // override_default_response_type. The JS SDK owns the popup and its
    // internal redirect_uri, which is why the backend exchange omits the
    // redirect_uri parameter entirely.
    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;

          // Send code + any captured embedded data to backend
          fetch('/api/whatsapp/embedded-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              waba_id: embeddedDataRef.current.waba_id,
              phone_number_id: embeddedDataRef.current.phone_number_id,
              business_id: embeddedDataRef.current.business_id,
              finish_event: embeddedDataRef.current.finish_event,
              // What the operator picked in the connect modal, as a
              // cross-check for when Meta's finish_event goes missing (a
              // popup closed early, a blocked message channel).
              //
              // ONLY 'existing' counts. That is the option whose wording
              // actually describes Coexistence — "a phone number that's
              // currently active on WhatsApp Business app". 'migrate'
              // means moving an existing API number off another provider
              // (Twilio, Wati, …), which is NOT coexistence: that number
              // is already on the Cloud API and is not on the Business
              // App at all. Claiming it was would set connection_mode
              // wrong, and the CRM would then wait for phone echoes that
              // can never arrive.
              //
              // Note the `extras.featureType` line above still sends the
              // Business-App variation for 'migrate' too. That looks
              // wrong for the same reason, but it is pre-existing
              // behaviour on a flow there is no way to test here, so it
              // is left alone and flagged rather than changed blind.
              // Meta's own finish_event stays authoritative either way:
              // if a migrate really does complete Business-App
              // onboarding, the event says so and the mode is still set
              // correctly.
              requested_feature_type:
                option === 'existing'
                  ? 'whatsapp_business_app_onboarding'
                  : undefined,
            }),
          })
            .then(async (res) => {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (!res.ok) {
                  toast.error(data.error || 'Failed to connect via Meta');
                } else {
                  toast.success('Successfully connected your WhatsApp Business Account!');
                  if (accountId) await fetchConfig(accountId);
                }
              } else {
                // A non-JSON body here means the request never reached the
                // route handler, because the handler returns JSON on every
                // path including its own 500. The previous version logged
                // only the body, which is the least diagnostic part — an
                // HTML page looks identical whether it came from a 404, a
                // followed redirect to /login, or a dev-server error
                // overlay, and those have completely different fixes.
                //
                // `redirected` and `url` are the tell: fetch() follows
                // redirects silently, so a 307 to /login arrives here as a
                // 200 full of login-page HTML. Comparing the final `url`
                // against the requested path is the only way to see that.
                const text = await res.text();
                const looksLikeHtml = text.trimStart().startsWith('<');
                console.error('[embedded-signup] non-JSON response from the API', {
                  status: res.status,
                  statusText: res.statusText,
                  requested: '/api/whatsapp/embedded-signup',
                  finalUrl: res.url,
                  wasRedirected: res.redirected,
                  contentType: contentType ?? '(none)',
                  bodyStart: text.substring(0, 300),
                });

                if (res.redirected) {
                  toast.error(
                    `Setup was redirected to ${new URL(res.url).pathname} instead of ` +
                      'completing. Your session has probably expired — sign in again and retry.',
                  );
                } else if (res.status === 404) {
                  toast.error(
                    'The setup endpoint was not found. If this is a deployed ' +
                      'environment, it may be running an older build.',
                  );
                } else if (looksLikeHtml) {
                  toast.error(
                    `The server returned a web page instead of data (HTTP ${res.status}). ` +
                      'Check the browser console for details.',
                  );
                } else {
                  toast.error(
                    `Unexpected response from the server (HTTP ${res.status}). ` +
                      'Check the browser console for details.',
                  );
                }
              }
            })
            .catch((err) => {
              console.error('Embedded signup exchange failed:', err);
              toast.error('Failed to complete setup with Meta');
            })
            .finally(() => {
              setIsConnecting(false);
            });
        } else {
          // No authResponse means no code. If Meta pushed a reason through
          // the message channel, show that instead of a generic "cancelled".
          console.log('Embedded signup returned no authResponse:', response);
          toast.error(flowErrorRef.current || 'Connection cancelled or incomplete');
          setIsConnecting(false);
        }
      },
      {
        config_id: ES_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras,
      },
    );
  }

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="WhatsApp Setup"
          description="Connect your WhatsApp Business API account"
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }


  const isConnected = Boolean(config);

  // ── Derived checklist state ────────────────────────────────
  // Both of these used to be hardcoded: step 2 always claimed "Action
  // Required" once connected, and step 3 always said "Optional" no matter
  // what Meta reported. They now follow the live account.
  const health = metaInfo?.health ?? null;
  const readiness = health?.readiness ?? 'unknown';
  const verification = deriveVerificationState(
    metaInfo?.waba?.business_verification_status,
  );

  // Only claim there is something to fix when Meta says sending is
  // blocked. `unknown` renders as neutral guidance, never as an alarm —
  // an unreadable health field is our problem, not the customer's.
  const sendingBlocked = readiness === 'blocked';
  const sendingLimited = readiness === 'limited';
  const sendingReady = readiness === 'available';

  // Limits panel. Rendered only when Meta returned at least one figure,
  // so an account on an API version that exposes none of these sees no
  // card rather than a grid of "Not reported".
  const limits = metaInfo?.limits ?? null;
  const hasLimitData = Boolean(
    limits &&
      (limits.messaging ||
        limits.usage ||
        limits.throughput ||
        (limits.nameReview && limits.nameReview.state !== 'unknown')),
  );

  // Usage against the rolling allowance. `initiated` is OUR count of
  // unique customers we opened a conversation with — the same unit as the
  // limit, which is what makes the comparison valid.
  const initiated = limits?.initiated ?? null;
  const usedPercent = initiated
    ? usagePercent(initiated.businessInitiated, limits?.messaging?.perDay)
    : null;
  const remainingLabel =
    initiated && limits?.messaging?.perDay
      ? new Intl.NumberFormat().format(
          Math.max(0, limits.messaging.perDay - initiated.businessInitiated),
        )
      : null;

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            Setup Your WhatsApp Business API Account
          </h1>
          <svg className="size-7" viewBox="0 0 24 24" fill="#25D366">
            <path d={WA_ICON_PATH} />
          </svg>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete the steps below to connect your WhatsApp API and start automating messages.
        </p>
      </div>

      {/* ─── Account Info Banner (only when connected) ─── */}
      {isConnected && config && (
        <Card className="mb-8 border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="py-5">
            <div className="flex items-center gap-2 mb-4">
              <svg className="size-5" viewBox="0 0 24 24" fill="#25D366">
                <path d={WA_ICON_PATH} />
              </svg>
              <h2 className="font-semibold text-foreground">
                WhatsApp Business Account Information
              </h2>
            </div>
            <div className="grid gap-px grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 rounded-xl border border-border overflow-hidden bg-border">
              {/* Business */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
                  Business
                </span>
                <div className="flex items-center gap-1.5 font-medium text-foreground text-sm">
                  <Building2 className="size-4 text-primary shrink-0" />
                  <span className="truncate">
                    {metaInfoLoading ? '...' : (metaInfo?.phone?.verified_name ?? metaInfo?.waba?.name ?? 'Connected')}
                  </span>
                </div>
              </div>

              {/* WhatsApp Number */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
                  WhatsApp Number
                </span>
                <div className="font-medium text-primary text-sm truncate">
                  {metaInfoLoading ? '...' : (metaInfo?.phone?.display_phone_number ?? `+${config.phone_number_id}`)}
                </div>
              </div>

              {/* Message Limit */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block" title="24-Hour Message Limit">
                  Message Limit
                </span>
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                  <Zap className="size-3.5 text-amber-500 shrink-0 fill-amber-500/20" />
                  <span>
                    {metaInfoLoading ? '...' : (limits?.messaging?.label ?? '2,000')}
                  </span>
                </div>
              </div>

              {/* Account Status */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
                  Account Status
                </span>
                {(() => {
                  const status = metaInfo?.phone?.status;
                  const isGood = status === 'CONNECTED';
                  const isBad = status === 'FLAGGED' || status === 'RESTRICTED' || status === 'RATE_LIMITED';
                  return (
                    <div className={`flex items-center gap-1.5 font-semibold text-sm ${
                      metaInfoLoading ? 'text-muted-foreground' :
                      isGood ? 'text-emerald-500' :
                      isBad ? 'text-red-500' : 'text-amber-500'
                    }`}>
                      {isGood ? <CheckCircle2 className="size-3.5 shrink-0" /> :
                       isBad ? <AlertTriangle className="size-3.5 shrink-0" /> :
                       <AlertTriangle className="size-3.5 shrink-0" />}
                      <span className="truncate">{metaInfoLoading ? '...' : (status ?? 'Unknown')}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Quality Rating */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
                  Quality Rating
                </span>
                {(() => {
                  const rating = metaInfo?.phone?.quality_rating;
                  const isGreen = rating === 'GREEN';
                  const isRed = rating === 'RED';
                  const isYellow = rating === 'YELLOW';
                  return (
                    <div className={`flex items-center gap-1.5 font-semibold text-sm ${
                      metaInfoLoading ? 'text-muted-foreground' :
                      isGreen ? 'text-emerald-500' :
                      isRed ? 'text-red-500' :
                      isYellow ? 'text-amber-500' : 'text-muted-foreground'
                    }`}>
                      <Shield className={`size-3.5 shrink-0 ${
                        isGreen ? 'text-emerald-500' :
                        isRed ? 'text-red-500' :
                        isYellow ? 'text-amber-500' : 'text-primary'
                      }`} />
                      <span className="truncate">{metaInfoLoading ? '...' : (rating ?? 'Unknown')}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Message Usage (View Insights) */}
              <div className="bg-card p-3.5 sm:p-4 space-y-1.5 min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate block">
                  Message Usage
                </span>
                <div className="text-sm">
                  <a
                    href={
                      metaInfo?.waba?.id || config?.waba_id
                        ? `https://business.facebook.com/latest/whatsapp_manager/insights?business_id=${metaInfo?.waba?.id || config?.waba_id}&asset_id=${metaInfo?.waba?.id || config?.waba_id}`
                        : 'https://business.facebook.com/latest/whatsapp_manager/insights'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <span>View Insights</span>
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Limits & usage ───
          Answers the question "Limited" raises but never resolves: limited
          to WHAT. Only rendered when Meta actually gave us at least one of
          these figures — an empty card of dashes would be worse than no
          card. */}
      {isConnected && limits && hasLimitData ? (
        <Card className="mb-8 shadow-sm">
          <CardContent className="py-5">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Sending limits &amp; usage
              </h2>
              {metaInfoLoading ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {/* Messaging limit. Labelled in CUSTOMERS, not messages —
                  Meta counts unique people you start a conversation with,
                  and calling it "messages per day" would be wrong. */}
              <div className="space-y-1 bg-card p-4">
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  Daily limit
                </span>
                {limits.messaging ? (
                  <>
                    {/* Used-of-limit, not just the limit. Both sides are
                        unique customers started in a rolling 24h, so this
                        comparison is unit-correct — unlike the 30-day
                        message count, which must never be divided by it. */}
                    <p className="text-xl font-bold text-foreground">
                      {initiated ? (
                        <>
                          {new Intl.NumberFormat().format(initiated.businessInitiated)}
                          <span className="text-sm font-medium text-muted-foreground">
                            {' '}
                            / {limits.messaging.label}
                          </span>
                        </>
                      ) : (
                        limits.messaging.label
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      new customers per 24 hours
                    </p>
                    {usedPercent !== null ? (
                      <div className="pt-1.5">
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={usedPercent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Share of the 24-hour messaging limit used"
                        >
                          <div
                            className={`h-full rounded-full transition-all ${
                              usedPercent >= 90
                                ? 'bg-red-500'
                                : usedPercent >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(usedPercent, 2)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {usedPercent}% used · {remainingLabel} left
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="pt-1 text-sm text-muted-foreground">
                    Not reported
                  </p>
                )}
              </div>

              {/* Volume. Deliberately NOT shown as a fraction of the limit
                  above: that counts messages, the limit counts unique
                  customers, so a progress bar would be false arithmetic. */}
              <div className="space-y-1 bg-card p-4">
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  Sent · last {limits.usage?.days ?? 30} days
                </span>
                {limits.usage ? (
                  <>
                    <p className="text-xl font-bold text-foreground">
                      {new Intl.NumberFormat().format(limits.usage.sent)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.NumberFormat().format(limits.usage.delivered)}{' '}
                      delivered
                      {limits.usage.deliveryRate !== null
                        ? ` · ${limits.usage.deliveryRate}%`
                        : ''}
                    </p>
                  </>
                ) : (
                  <p className="pt-1 text-sm text-muted-foreground">
                    Not reported
                  </p>
                )}
              </div>

              {/* Display name — the usual reason a healthy account is
                  stuck on the lowest limit. */}
              <div className="space-y-1 bg-card p-4">
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  Display name
                </span>
                {limits.nameReview && limits.nameReview.state !== 'unknown' ? (
                  <>
                    <p
                      className={`text-sm font-semibold ${
                        limits.nameReview.state === 'approved'
                          ? 'text-emerald-500'
                          : limits.nameReview.state === 'pending'
                            ? 'text-blue-500'
                            : 'text-amber-500'
                      }`}
                    >
                      {limits.nameReview.label}
                    </p>
                    {limits.nameReview.detail ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {limits.nameReview.detail}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="pt-1 text-sm text-muted-foreground">
                    Not reported
                  </p>
                )}
              </div>

              {/* Throughput — speed, as distinct from daily volume. */}
              <div className="space-y-1 bg-card p-4">
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  Send speed
                </span>
                {limits.throughput ? (
                  <>
                    <p className="text-sm font-semibold text-foreground capitalize">
                      {limits.throughput.level.toLowerCase().replace(/_/g, ' ')}
                    </p>
                    {limits.throughput.description ? (
                      <p className="text-xs text-muted-foreground">
                        {limits.throughput.description}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="pt-1 text-sm text-muted-foreground">
                    Not reported
                  </p>
                )}
              </div>
            </div>

            {/* The two facts most people get wrong about this limit, said
                once, plainly, instead of in a tooltip nobody opens. */}
            <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                The daily limit counts unique customers you start a
                conversation with, not total messages — replies inside an open
                24-hour conversation do not count towards it. The limit itself
                comes from Meta and applies to your whole business portfolio,
                shared across every number in it.
              </p>
              {/* Says plainly whose number this is. Meta publishes the
                  limit but no consumption figure, so the used count is
                  ours and can read low if messages were sent from another
                  number on the same portfolio or outside this CRM. */}
              {initiated ? (
                <p>
                  The used figure is counted by Replai from your sends in the
                  last {initiated.windowHours} hours — Meta does not publish a
                  running total. If another number shares your portfolio, or
                  messages were sent outside this CRM, Meta&apos;s figure will
                  be higher than this.
                  {initiated.withinServiceWindow > 0 ? (
                    <>
                      {' '}
                      A further {initiated.withinServiceWindow} contact
                      {initiated.withinServiceWindow === 1 ? ' was' : 's were'}{' '}
                      messaged inside an open conversation, which is free and
                      not counted here.
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ─── Increase Messaging Limits (Meta Replica) ─── */}
      {isConnected && (
        <Card className="mb-8 shadow-sm border border-border">
          <CardContent className="py-6 space-y-6">
            {/* Header with Title & Meta Direct Link */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">
                    Messaging limits
                  </h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                    Meta Tier Progress
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Updated automatically from your Meta WhatsApp Business Portfolio
                </p>
              </div>

              <a
                href={
                  metaInfo?.waba?.id || config?.waba_id
                    ? `https://business.facebook.com/latest/whatsapp_manager/messaging_limits?business_id=${metaInfo?.waba?.id || config?.waba_id}&asset_id=${metaInfo?.waba?.id || config?.waba_id}`
                    : 'https://business.facebook.com/latest/whatsapp_manager/messaging_limits'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted hover:text-primary"
              >
                <span>View Limits in Meta</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>

            {/* 5-Tier Progress Cards (250, 2000, 10000, 100000, Unlimited) */}
            {(() => {
              const currentPerDay = limits?.messaging?.perDay ?? 2000;
              const tiers = [
                { label: '250', value: 250, nextGoal: 125, nextTierLabel: '2,000' },
                { label: '2,000', value: 2000, nextGoal: 1000, nextTierLabel: '10,000' },
                { label: '10,000', value: 10000, nextGoal: 5000, nextTierLabel: '100,000' },
                { label: '100,000', value: 100000, nextGoal: 50000, nextTierLabel: 'Unlimited' },
                { label: 'Unlimited', value: Infinity, nextGoal: null, nextTierLabel: null },
              ];

              // Find active tier index
              let activeIndex = tiers.findIndex((t) => t.value === currentPerDay);
              if (activeIndex === -1) {
                if (currentPerDay <= 250) activeIndex = 0;
                else if (currentPerDay <= 2000) activeIndex = 1;
                else if (currentPerDay <= 10000) activeIndex = 2;
                else if (currentPerDay <= 100000) activeIndex = 3;
                else activeIndex = 4;
              }

              const activeTier = tiers[activeIndex];
              const sevenDayCount = limits?.sevenDayUnique ?? 0;
              const targetCount = activeTier.nextGoal ?? 1000;
              const progressPct = targetCount > 0 ? Math.min(100, Math.round((sevenDayCount / targetCount) * 100)) : 100;

              return (
                <div className="space-y-6">
                  {/* Visual Tier Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
                    {tiers.map((tier, idx) => {
                      const isCurrent = idx === activeIndex;
                      const isPassed = idx < activeIndex;
                      return (
                        <div
                          key={tier.label}
                          className={`relative rounded-xl p-4 text-center transition-all ${
                            isCurrent
                              ? 'bg-card border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                              : isPassed
                                ? 'bg-muted/40 border border-border text-muted-foreground'
                                : 'bg-muted/20 border border-border/60 text-muted-foreground/70'
                          }`}
                        >
                          {isCurrent ? (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                              Current
                            </span>
                          ) : null}
                          <p className={`text-base font-bold ${isCurrent ? 'text-foreground text-lg mt-1' : 'text-foreground/80'}`}>
                            {tier.label}
                          </p>
                          <p className="text-[10px] leading-tight text-muted-foreground mt-1">
                            {isCurrent ? 'Business-initiated conversations in 24h' : 'Tier Limit'}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Increase Messaging Limit Section */}
                  <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        Increase your messaging limit
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Meta automatically evaluates your specific account requirements (such as Business Verification, Quality Rating, and conversation volume) to upgrade your messaging tier. Upgrades can take up to 24 hours.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border/40 flex flex-wrap gap-4 text-xs">
                      <a
                        href="https://www.facebook.com/business/help/687938765816627"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs inline-flex items-center gap-1 font-medium"
                      >
                        <span>What are high-quality messages?</span>
                        <ExternalLink className="size-3" />
                      </a>
                      <a
                        href="https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs inline-flex items-center gap-1 font-medium"
                      >
                        <span>Meta Messaging Limit Rules</span>
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* ─── Steps ─── */}
      <div className="space-y-6">
        {/* ── Step 1: Get Your WhatsApp Business API ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isConnected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {isConnected ? (
                <CheckCircle2 className="size-5" />
              ) : (
                '1'
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  Get Your WhatsApp Business API
                </h3>
                {isConnected && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {isConnected
                  ? 'Your WhatsApp Business API is successfully connected and ready to use.'
                  : 'Get instant access to the WhatsApp Business API using your Facebook account.'}
              </p>

              {isConnected ? (
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${config!.waba_id}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    Update Business Profile
                    <ExternalLink className="ml-2 size-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConnectModal(true)}
                    disabled={isConnecting}
                  >
                    <RotateCcw className="mr-2 size-3" />
                    Reconnect WhatsApp
                  </Button>
                </div>
              ) : null}

              {/* Coexistence status, history import and contact review.
                  Renders nothing for an ordinary API-only number, so it
                  costs those accounts no space. Sits inside step 1 because
                  it is all about the state of THIS connection. */}
              {isConnected ? (
                <div className="pt-4">
                  <CoexistencePanel />
                </div>
              ) : (
                <div className="pt-1">
                  <Button
                    onClick={() => setShowConnectModal(true)}
                    disabled={isConnecting || !fbLoaded}
                    className="bg-[#00A884] hover:bg-[#008f6f] text-white shadow-sm"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d={WA_ICON_PATH} />
                        </svg>
                        Connect WhatsApp
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Step 2: Billing & sending readiness ──
            Driven by Meta's `health_status`. Note what is NOT claimed: a
            green state says "Meta will let you send", not "a payment
            method exists" — there is no Graph field for the latter, and
            asserting it would be the same invention as the old permanent
            warning, only flipped. */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                !isConnected
                  ? 'bg-muted text-muted-foreground'
                  : sendingReady
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                    : sendingLimited
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                      : sendingBlocked
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground'
              }`}
            >
              {!isConnected ? (
                '2'
              ) : sendingReady || sendingLimited ? (
                // Limited still means messages go out, so it earns a tick
                // rather than a warning triangle.
                <CheckCircle2 className="size-4" />
              ) : sendingBlocked ? (
                <AlertTriangle className="size-4" />
              ) : (
                '2'
              )}
            </div>
            <div className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  Payment method &amp; sending
                </h3>
                {isConnected && metaInfoLoading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Checking with Meta
                  </span>
                ) : null}
                {isConnected && !metaInfoLoading && sendingReady ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    Ready to send
                  </span>
                ) : null}
                {isConnected && !metaInfoLoading && sendingBlocked ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                    Action Required
                  </span>
                ) : null}
                {isConnected && !metaInfoLoading && sendingLimited ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    Can send · limited
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-muted-foreground">
                {sendingReady
                  ? 'Meta reports your account can send messages. Nothing to do here.'
                  : sendingLimited
                    ? 'Meta reports you can send messages, but with a restriction. Your broadcasts will still go out.'
                    : 'A payment method in Facebook Business Manager is required to send template messages and run broadcasts.'}
              </p>

              {isConnected && !metaInfoLoading ? (
                <>
                  {/* Meta's own wording for each problem, plus its suggested
                      fix. Rendering their text rather than our guess means
                      this stays correct as Meta changes requirements. */}
                  {sendingBlocked && health && health.blockers.length > 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <AlertTriangle className="size-4 text-amber-500" />
                        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                          Meta is blocking sending for this reason:
                        </span>
                      </div>
                      <ul className="space-y-4 text-sm">
                        {health.blockers.map((blocker, index) => {
                          const link = resolveHealthIssueLink(
                            blocker.description,
                            config?.waba_id,
                          );
                          return (
                            <li key={blocker.code ?? index}>
                              <p className="text-foreground">{blocker.description}</p>
                              {blocker.solution ? (
                                <p className="mt-1 text-muted-foreground">
                                  {blocker.solution}
                                </p>
                              ) : null}
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                              >
                                {link.label}
                                <ExternalLink className="size-3" />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {sendingLimited && health && health.limitations.length > 0 ? (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="size-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          Why your sending is limited:
                        </span>
                      </div>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        {health.limitations.map((note) => {
                          const link = resolveHealthIssueLink(note, config?.waba_id);
                          return (
                            <li key={note}>
                              <p>{note}</p>
                              {/* Meta gives no URL with these notes, so this
                                  is our mapping from the wording to the page
                                  that resolves it. */}
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                              >
                                {link.label}
                                <ExternalLink className="size-3" />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {/* Neutral fallback. Reached when Meta did not return a
                      health status at all — an older API version, or a
                      token without the permission. Guidance, not an alarm:
                      we genuinely do not know, so we must not imply the
                      customer has forgotten something. */}
                  {readiness === 'unknown' ? (
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <p className="mb-2 text-sm text-muted-foreground">
                        We could not read your billing status from Meta, so
                        check it directly if broadcasts are not sending:
                      </p>
                      <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                        <li>
                          Add a card in Facebook Business Manager, then set it as
                          default from the three-dot menu.
                        </li>
                        <li>
                          Complete your business billing info. In India, add your
                          GST number.
                        </li>
                      </ol>
                    </div>
                  ) : null}

                  {!sendingReady ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {/* Payment settings are only the right destination
                          when Meta is actually blocking us, or when we
                          could not read the status. Sending someone there
                          to fix an unapproved display name is a wild
                          goose chase. */}
                      {!sendingLimited ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const wabaId = metaInfo?.waba?.id || config?.waba_id;
                            const url = wabaId
                              ? `https://business.facebook.com/settings/payment-methods?waba_id=${encodeURIComponent(wabaId)}`
                              : 'https://business.facebook.com/settings/payment-methods';
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <CreditCard className="mr-2 size-3.5" />
                          Open payment settings
                          <ExternalLink className="ml-2 size-3" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void fetchMetaInfo()}
                      >
                        <RotateCcw className="mr-2 size-3.5" />
                        Re-check
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Step 3: Facebook Business Verification ──
            `business_verification_status` was already being fetched from
            the WABA and thrown away, so this step said "Optional" to a
            business that had finished verifying. It now follows Meta. */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isConnected && verification === 'verified'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : isConnected && verification === 'rejected'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {isConnected && verification === 'verified' ? (
                <CheckCircle2 className="size-4" />
              ) : isConnected && verification === 'rejected' ? (
                <AlertTriangle className="size-4" />
              ) : (
                '3'
              )}
            </div>
            <div className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  Facebook Business Verification
                </h3>
                {isConnected && metaInfoLoading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Checking with Meta
                  </span>
                ) : verification === 'verified' ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    Verified
                  </span>
                ) : verification === 'pending' ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    In review
                  </span>
                ) : verification === 'rejected' ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                    Needs attention
                  </span>
                ) : (
                  // Covers both `not_started` and `unknown` — in neither
                  // case do we have grounds to nag.
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Optional
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {verification === 'verified'
                  ? 'Your business is verified with Meta. Your brand name can show in place of your phone number, and your messaging limits are raised.'
                  : verification === 'pending'
                    ? 'Meta is reviewing your business verification. Nothing to do until they respond — this usually takes a few days.'
                    : 'Verify your Facebook business to display your brand name instead of your phone number and increase your messaging limits.'}
              </p>

              {/* Requirements are only useful to someone who still has to
                  do this. Showing them to a verified business is noise. */}
              {verification !== 'verified' && verification !== 'pending' ? (
                <div className="text-sm text-muted-foreground">
                  <p className="mb-1.5 font-medium text-foreground">Requirements:</p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>Legal business document with business name</li>
                    <li>Working website</li>
                  </ul>
                </div>
              ) : null}

              {verification !== 'verified' ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        'https://business.facebook.com/settings/security',
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    {verification === 'pending' ? 'View status' : 'Verify Business'}
                    <ExternalLink className="ml-2 size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchMetaInfo()}
                  >
                    <RotateCcw className="mr-2 size-3.5" />
                    Re-check
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Connect Modal ─── */}
      <WhatsAppConnectModal
        open={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onContinue={launchFBLogin}
        loading={isConnecting}
      />
    </section>
  );
}
