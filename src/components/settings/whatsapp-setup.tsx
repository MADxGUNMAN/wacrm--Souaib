'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Shield,
  CreditCard,
  Building2,
  Gauge,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMetaSDK } from '@/components/providers/meta-sdk-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  billingHubUrl,
  derivePaymentState,
  deriveRegistrationState,
  deriveVerificationState,
  groupHealthIssues,
  paymentActivityUrl,
  resolveHealthIssueLink,
  PAYMENT_SETUP_STEPS,
  type HealthIssue,
  type HealthSummary,
} from '@/lib/whatsapp/health';
import type {
  MessagingLimit,
  NameReview,
  Throughput,
  UsageTotals,
} from '@/lib/whatsapp/limits';
import { usagePercent, type InitiatedUsage } from '@/lib/whatsapp/usage';
import { COEXISTENCE_FEATURE_TYPE } from '@/lib/whatsapp/connection-mode';
import {
  describeEmbeddedSignupError,
  formatEmbeddedSignupError,
  type EmbeddedSignupErrorInfo,
} from '@/lib/whatsapp/embedded-signup-errors';
import {
  formatDisplayPhoneNumber,
  PHONE_UNKNOWN_LABEL,
} from '@/lib/whatsapp/format-phone-display';
import { SettingsPanelHead } from './settings-panel-head';
import { CoexistencePanel } from './coexistence-panel';
import { WhatsAppConnectModal } from './whatsapp-connect-modal';

interface EmbeddedConfig {
  phone_number_id: string;
  /** Cached real number (migration 078). Null until Meta has told us. */
  display_phone_number: string | null;
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
    code_verification_status: string | null;
    platform_type: string | null;
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

/**
 * One of Meta's reasons, wherever it is shown.
 *
 * Shared because the same reason now appears under whichever step owns
 * its subject, and a reason that looked different depending on which
 * panel it landed in would read as two unrelated problems.
 */
function HealthIssueRow({
  issue,
  wabaId,
  showSolution = true,
  showLink = true,
  label,
}: {
  issue: HealthIssue;
  wabaId?: string | null;
  /**
   * Meta's suggested remedy. Turned off where the surrounding step
   * already spells the remedy out — Meta's solution sentence for a
   * missing payment method is "add a new payment method to the account",
   * which is the numbered guide and the button beneath it said twice
   * more.
   */
  showSolution?: boolean;
  /** Likewise for the link, where the step has its own action button. */
  showLink?: boolean;
  /**
   * Optional attribution prefix, e.g. "Meta reports". Used where our own
   * summary is shown above Meta's text, so it is unambiguous which
   * sentence came from whom.
   */
  label?: string;
}) {
  const link = resolveHealthIssueLink(issue.description, wabaId);
  return (
    <li>
      <p className="text-foreground font-medium">
        {label ? (
          <span className="text-muted-foreground font-normal">{label}: </span>
        ) : null}
        {issue.description}
      </p>
      {showSolution && issue.solution ? (
        <p className="mt-1">{issue.solution}</p>
      ) : null}
      {/* Meta returns no URL with any of these, so this is our mapping
          from the wording to the page that resolves it. */}
      {showLink ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
        >
          {link.label}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </li>
  );
}

export function WhatsAppSetup() {
  const supabase = createClient();
  const {
    user,
    accountId,
    isOwner,
    loading: authLoading,
    profileLoading,
  } = useAuth();
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
          .select(
            'phone_number_id, display_phone_number, waba_id, connection_source, registered_at'
          )
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
    [supabase]
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

  /**
   * The business avatar, read from our own mirror.
   *
   * Separate from `fetchMetaInfo` on purpose: that call goes out to Meta
   * live, whereas this is a cheap read of a column we already populated at
   * connect time. Bundling them would make rendering a cached picture
   * depend on a Graph round trip succeeding.
   */
  const [businessProfile, setBusinessProfile] = useState<{
    picture_url: string | null;
    about: string | null;
    synced_at: string | null;
  } | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [completingRegistration, setCompletingRegistration] = useState(false);
  /**
   * A freshly generated two-step PIN, shown until the page is reloaded.
   * Deliberately not persisted in component state beyond that — it is
   * readable from the server row, and this is only the one-time reveal.
   */
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);

  const loadBusinessProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/business-profile');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.connected) setBusinessProfile(data);
    } catch {
      // Silent. The avatar is supplementary; a failure here must not
      // disturb a setup page whose job is the connection itself.
    }
  }, []);

  useEffect(() => {
    if (config?.phone_number_id) void loadBusinessProfile();
  }, [config?.phone_number_id, loadBusinessProfile]);

  const refreshBusinessProfile = useCallback(async () => {
    setRefreshingProfile(true);
    try {
      const res = await fetch('/api/whatsapp/business-profile', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not refresh the profile.');
        return;
      }
      setBusinessProfile(data);
      toast.success(
        data.picture_url
          ? 'Business profile updated.'
          : 'Checked — no profile picture is set on this number.'
      );
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setRefreshingProfile(false);
    }
  }, []);

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
  //
  // Stored as the resolved descriptor rather than a bare string, because the
  // `retryable` flag changes what the toast should say. A permanent rejection
  // ("this country isn't supported yet") must not read like a transient one,
  // or the operator retries forever — which is exactly what happened while
  // every failure collapsed into "Connection cancelled or incomplete".
  const flowErrorRef = useRef<EmbeddedSignupErrorInfo | null>(null);

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
        const data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
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
          // Resolve Meta's code into something actionable. The raw payload is
          // also logged in full: Meta's numeric code and fbtrace_id are the
          // only things support can take back to Meta, and they used to be
          // discarded along with everything else.
          const info = describeEmbeddedSignupError({
            payload: data.data,
            currentStep: data.data?.current_step,
          });
          flowErrorRef.current = info;
          console.error('[embedded-signup] Meta reported an error', {
            resolvedCode: info.code,
            family: info.family,
            retryable: info.retryable,
            currentStep: data.data?.current_step ?? '(none)',
            raw: data.data,
          });
        } else if (data.event === 'CANCEL') {
          // A genuine cancel is not an error, so it carries no fix text — but
          // naming the step it was closed on is still the difference between
          // "I gave up" and "it broke and I closed it".
          flowErrorRef.current = data.data?.current_step
            ? {
                code: null,
                family: 'unknown',
                message: `Setup was closed at the "${data.data.current_step}" step.`,
                fix: '',
                retryable: true,
              }
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
          'Facebook Login for Business configuration ID.'
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
    //
    // ── Which options get the Coexistence variation ───────────
    //
    // ONLY 'existing'. That is the option whose wording describes
    // Coexistence — "a phone number that's currently active on WhatsApp
    // Business app".
    //
    // This used to include 'migrate' as well, which was wrong. Migrating an
    // existing API number off another provider (Twilio, Wati, Interakt, …)
    // is the opposite situation: that number is ALREADY on the Cloud API and
    // is not on the WhatsApp Business app at all. Sending the Business-App
    // variation put those operators into Meta's Coexistence screens, which
    // then had nothing eligible to offer them — the flow either dead-ended
    // or silently fell through to the standard path, and the toast blamed
    // them for cancelling.
    //
    // It also disagreed with the value sent to our own backend, which only
    // ever counted 'existing'. Two signals derived from one decision must
    // not be able to diverge, so both now read `wantsCoexistence`.
    const wantsCoexistence = option === 'existing';

    const extras: Record<string, unknown> = {
      version: 'v4',
      setup: {},
    };
    if (wantsCoexistence) {
      extras.featureType = COEXISTENCE_FEATURE_TYPE;
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
              // popup closed early, a blocked message channel). Derived
              // from the same `wantsCoexistence` as `extras.featureType`
              // above so the two can never disagree. Meta's own
              // finish_event stays authoritative either way.
              requested_feature_type: wantsCoexistence
                ? COEXISTENCE_FEATURE_TYPE
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
                  toast.success(
                    'Successfully connected your WhatsApp Business Account!'
                  );
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
                console.error(
                  '[embedded-signup] non-JSON response from the API',
                  {
                    status: res.status,
                    statusText: res.statusText,
                    requested: '/api/whatsapp/embedded-signup',
                    finalUrl: res.url,
                    wasRedirected: res.redirected,
                    contentType: contentType ?? '(none)',
                    bodyStart: text.substring(0, 300),
                  }
                );

                if (res.redirected) {
                  toast.error(
                    `Setup was redirected to ${new URL(res.url).pathname} instead of ` +
                      'completing. Your session has probably expired — sign in again and retry.'
                  );
                } else if (res.status === 404) {
                  toast.error(
                    'The setup endpoint was not found. If this is a deployed ' +
                      'environment, it may be running an older build.'
                  );
                } else if (looksLikeHtml) {
                  toast.error(
                    `The server returned a web page instead of data (HTTP ${res.status}). ` +
                      'Check the browser console for details.'
                  );
                } else {
                  toast.error(
                    `Unexpected response from the server (HTTP ${res.status}). ` +
                      'Check the browser console for details.'
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
          // No authResponse means no code — and that is the same shape
          // whether Meta rejected the account outright or the operator
          // clicked the X. The message channel is the only place the real
          // reason ever appears, so it decides the wording here.
          console.log('Embedded signup returned no authResponse:', response);

          const info = flowErrorRef.current;
          if (info) {
            toast.error(formatEmbeddedSignupError(info), {
              // A permanent rejection needs to stay on screen long enough to
              // read the remediation; a plain cancel does not.
              duration: info.retryable ? 6000 : 12000,
            });
          } else {
            toast.error('Connection cancelled or incomplete');
          }
          setIsConnecting(false);
        }
      },
      {
        config_id: ES_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras,
      }
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
          <Loader2 className="text-primary size-6 animate-spin" />
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
    metaInfo?.waba?.business_verification_status
  );

  // Only claim there is something to fix when Meta says sending is
  // blocked. `unknown` renders as neutral guidance, never as an alarm —
  // an unreadable health field is our problem, not the customer's.
  const sendingLimited = readiness === 'limited';

  // Every reason Meta gives, routed to the step that owns the subject.
  // The payment step used to render the whole list, which told a customer
  // their payment method was at fault when the real cause was business
  // verification — a problem that has its own step immediately below,
  // where the same warning was already being shown.
  //
  // `AVAILABLE_WITHOUT_REVIEW` counts as accepted for the display name:
  // the name is live in chats, it simply never went through a review,
  // which is the only thing Meta's health note is actually missing.
  //
  // Not memoised: this sits below an early return, so a hook here would
  // be called conditionally, and it is a handful of short strings.
  const issues = groupHealthIssues(health);

  // Payment is tracked separately from sending because the two genuinely
  // differ: an account can be capped over business verification while its
  // billing is perfectly fine.
  const paymentState = derivePaymentState({
    readiness,
    paymentIssues: issues.payment,
  });
  const billingWabaId = metaInfo?.waba?.id || config?.waba_id || null;

  // Read from Meta's three real status fields rather than from its health
  // remedy, so a number Meta is merely still reviewing is not reported as
  // an unfinished job on the operator's desk.
  const registration = deriveRegistrationState({
    status: metaInfo?.phone?.status,
    code_verification_status: metaInfo?.phone?.code_verification_status,
    name_status: metaInfo?.phone?.name_status,
    platform_type: metaInfo?.phone?.platform_type,
  });

  /**
   * Finish registering a number that was connected but never activated.
   *
   * Refreshes account info afterwards so the panel disappears on its own
   * rather than leaving the operator wondering whether it worked.
   */
  const completeRegistration = async () => {
    setCompletingRegistration(true);
    try {
      const res = await fetch('/api/whatsapp/config/complete-registration', {
        method: 'POST',
      });
      const payload = (await res.json()) as {
        success?: boolean;
        error?: string;
        pin?: string | null;
        note?: string;
        warning?: string;
      };

      if (!res.ok || !payload.success) {
        toast.error(payload.error ?? 'Could not complete registration.');
        return;
      }

      // Held in state rather than a toast: a toast disappears, and this
      // PIN cannot be retrieved from Meta afterwards.
      if (payload.pin) setGeneratedPin(payload.pin);
      toast.success(
        payload.warning ?? payload.note ?? 'Registration complete.'
      );
      await fetchMetaInfo();
    } catch {
      toast.error('Could not reach the server to complete registration.');
    } finally {
      setCompletingRegistration(false);
    }
  };

  /**
   * The one-line summary above the payment step, or null to show none.
   *
   * Null when Meta has given us its own error for this account: that
   * sentence is rendered verbatim just below, and a generic paraphrase
   * sitting above it added nothing but a second voice.
   */
  const paymentSummary =
    paymentState === 'action_required'
      ? issues.payment.length > 0
        ? null
        : 'A payment method in Facebook Business Manager is required to send template messages and run broadcasts.'
      : paymentState === 'no_issue'
        ? sendingLimited
          ? 'Meta reports no payment problem on this account, so your broadcasts will go out. Your volume is capped for a separate reason below.'
          : 'Meta reports no payment problem on this account. Template messages and broadcasts can be billed normally.'
        : 'A payment method in Facebook Business Manager is required to send template messages and run broadcasts.';

  // Limits panel. Rendered only when Meta returned at least one figure,
  // so an account on an API version that exposes none of these sees no
  // card rather than a grid of "Not reported".
  const limits = metaInfo?.limits ?? null;
  const hasLimitData = Boolean(
    limits &&
    (limits.messaging ||
      limits.usage ||
      limits.throughput ||
      (limits.nameReview && limits.nameReview.state !== 'unknown'))
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
          Math.max(0, limits.messaging.perDay - initiated.businessInitiated)
        )
      : null;

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-foreground text-2xl font-bold">
            Setup Your WhatsApp Business API Account
          </h1>
          <svg className="size-7" viewBox="0 0 24 24" fill="#25D366">
            <path d={WA_ICON_PATH} />
          </svg>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Complete the steps below to connect your WhatsApp API and start
          automating messages.
        </p>
      </div>

      {/* ─── Account Info Banner (only when connected) ─── */}
      {isConnected && config && (
        <Card className="border-primary/20 bg-primary/5 mb-8 shadow-sm">
          <CardContent className="py-5">
            <div className="mb-4 flex items-start gap-3">
              {/* ---- The business avatar customers actually see ----
                  This is the only WhatsApp profile picture the Cloud API
                  exposes; there is no equivalent for customers. Shown here
                  because an operator running several numbers cannot
                  otherwise tell which brand identity is attached to this
                  one, and a wrong logo is invisible from inside the CRM
                  while being the first thing every customer sees.

                  Served from our own bucket, not Meta's CDN — their URL is
                  signed and expires within days. */}
              {businessProfile?.picture_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={businessProfile.picture_url}
                  alt="Your WhatsApp business profile picture"
                  className="border-border size-10 shrink-0 rounded-full border object-cover"
                />
              ) : (
                <span className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-full">
                  <svg className="size-5" viewBox="0 0 24 24" fill="#25D366">
                    <path d={WA_ICON_PATH} />
                  </svg>
                </span>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="text-foreground font-semibold">
                  WhatsApp Business Account Information
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {businessProfile?.about ??
                    (businessProfile?.synced_at && !businessProfile.picture_url
                      ? 'No profile picture set on this number yet.'
                      : 'How your business appears to customers in WhatsApp.')}
                </p>
              </div>

              {/* Manual because Meta sends no webhook when a business
                  changes its avatar. Without this the only way to pick up a
                  new logo would be to re-enter credentials. */}
              <button
                type="button"
                onClick={() => void refreshBusinessProfile()}
                disabled={refreshingProfile}
                title="Re-fetch the profile picture and tagline from WhatsApp"
                className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    refreshingProfile && 'animate-spin'
                  )}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
            {/* Six data points, but not six equal-width columns. The phone
                number is the only value whose full exact text is part of
                its meaning, so it gets a wider track on desktop. The
                other five are short, fixed vocabulary and fit naturally
                in 1fr. This keeps both "WHATSAPP NUMBER" and an E.164
                number on one line without ellipses or awkward wrapping. */}
            <div className="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_minmax(175px,1.35fr)_repeat(4,minmax(0,1fr))]">
              {/* Business */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span className="text-muted-foreground block truncate text-[11px] font-medium tracking-wider uppercase">
                  Business
                </span>
                <div className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                  <Building2 className="text-primary size-4 shrink-0" />
                  <span className="truncate">
                    {metaInfoLoading
                      ? '...'
                      : (metaInfo?.phone?.verified_name ??
                        metaInfo?.waba?.name ??
                        'Connected')}
                  </span>
                </div>
              </div>

              {/* WhatsApp Number */}
              {/* Not truncated, unlike its siblings. A cut phone number
                  ("+1555-424-25...") is not a shorter version of the real
                  one, it looks like a DIFFERENT number — the one thing on
                  this whole card an operator will screenshot and give to a
                  customer. Both the label and the value wrap instead,
                  which grows this one row slightly rather than lying by
                  omission. */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span className="text-muted-foreground block text-[11px] leading-tight font-medium tracking-wider uppercase">
                  WhatsApp Number
                </span>
                {/* Live value first, then the copy cached on our own row
                    (migration 078), then an honest placeholder.

                    The old fallback was `+${config.phone_number_id}`,
                    which printed the Meta asset id with a plus in front —
                    "+870875646113078" — and read as a real number. That
                    was reported as a bug twice. An asset id must never
                    stand in for a phone number. */}
                <div className="text-primary text-sm font-medium break-all">
                  {metaInfoLoading
                    ? '...'
                    : (metaInfo?.phone?.display_phone_number ??
                      formatDisplayPhoneNumber(config.display_phone_number) ??
                      PHONE_UNKNOWN_LABEL)}
                </div>
              </div>

              {/* Message Limit */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span
                  className="text-muted-foreground block truncate text-[11px] font-medium tracking-wider uppercase"
                  title="24-Hour Message Limit"
                >
                  Message Limit
                </span>
                <div className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                  <Zap className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
                  <span>
                    {metaInfoLoading
                      ? '...'
                      : (limits?.messaging?.label ?? '2,000')}
                  </span>
                </div>
              </div>

              {/* Account Status */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span className="text-muted-foreground block truncate text-[11px] font-medium tracking-wider uppercase">
                  Account Status
                </span>
                {(() => {
                  const status = metaInfo?.phone?.status;
                  const isGood = status === 'CONNECTED';
                  const isBad =
                    status === 'FLAGGED' ||
                    status === 'RESTRICTED' ||
                    status === 'RATE_LIMITED';
                  return (
                    <div
                      className={`flex items-center gap-1.5 text-sm font-semibold ${
                        metaInfoLoading
                          ? 'text-muted-foreground'
                          : isGood
                            ? 'text-emerald-500'
                            : isBad
                              ? 'text-red-500'
                              : 'text-amber-500'
                      }`}
                    >
                      {isGood ? (
                        <CheckCircle2 className="size-3.5 shrink-0" />
                      ) : isBad ? (
                        <AlertTriangle className="size-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {metaInfoLoading ? '...' : (status ?? 'Unknown')}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Quality Rating */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span className="text-muted-foreground block truncate text-[11px] font-medium tracking-wider uppercase">
                  Quality Rating
                </span>
                {(() => {
                  const rating = metaInfo?.phone?.quality_rating;
                  const isGreen = rating === 'GREEN';
                  const isRed = rating === 'RED';
                  const isYellow = rating === 'YELLOW';
                  return (
                    <div
                      className={`flex items-center gap-1.5 text-sm font-semibold ${
                        metaInfoLoading
                          ? 'text-muted-foreground'
                          : isGreen
                            ? 'text-emerald-500'
                            : isRed
                              ? 'text-red-500'
                              : isYellow
                                ? 'text-amber-500'
                                : 'text-muted-foreground'
                      }`}
                    >
                      <Shield
                        className={`size-3.5 shrink-0 ${
                          isGreen
                            ? 'text-emerald-500'
                            : isRed
                              ? 'text-red-500'
                              : isYellow
                                ? 'text-amber-500'
                                : 'text-primary'
                        }`}
                      />
                      <span className="truncate">
                        {metaInfoLoading ? '...' : (rating ?? 'Unknown')}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Message Usage (View Insights)

                  Points at our own insights dashboard rather than
                  business.facebook.com. Meta publishes all of this over
                  the API, and sending the operator to a different product
                  — with its own account switcher — to read numbers about
                  templates they manage here was the wrong default. The
                  link out to Meta still exists, on that page. */}
              <div className="bg-card min-w-0 space-y-1.5 p-3.5 sm:p-4">
                <span className="text-muted-foreground block truncate text-[11px] font-medium tracking-wider uppercase">
                  Message Usage
                </span>
                <div className="text-sm">
                  <Link
                    href="/settings/whatsapp-insights"
                    className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    <span>View Insights</span>
                    <Gauge className="size-3.5 shrink-0" />
                  </Link>
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
              <Gauge className="text-primary size-4" />
              <h2 className="text-foreground text-sm font-semibold">
                Sending limits &amp; usage
              </h2>
              {metaInfoLoading ? (
                <Loader2 className="text-muted-foreground size-3 animate-spin" />
              ) : null}
            </div>

            <div className="border-border bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
              {/* Messaging limit. Labelled in CUSTOMERS, not messages —
                  Meta counts unique people you start a conversation with,
                  and calling it "messages per day" would be wrong. */}
              <div className="bg-card space-y-1 p-4">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Daily limit
                </span>
                {limits.messaging ? (
                  <>
                    {/* Used-of-limit, not just the limit. Both sides are
                        unique customers started in a rolling 24h, so this
                        comparison is unit-correct — unlike the 30-day
                        message count, which must never be divided by it. */}
                    <p className="text-foreground text-xl font-bold">
                      {initiated ? (
                        <>
                          {new Intl.NumberFormat().format(
                            initiated.businessInitiated
                          )}
                          <span className="text-muted-foreground text-sm font-medium">
                            {' '}
                            / {limits.messaging.label}
                          </span>
                        </>
                      ) : (
                        limits.messaging.label
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      new customers per 24 hours
                    </p>
                    {usedPercent !== null ? (
                      <div className="pt-1.5">
                        <div
                          className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
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
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {usedPercent}% used · {remainingLabel} left
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground pt-1 text-sm">
                    Not reported
                  </p>
                )}
              </div>

              {/* Volume. Deliberately NOT shown as a fraction of the limit
                  above: that counts messages, the limit counts unique
                  customers, so a progress bar would be false arithmetic. */}
              <div className="bg-card space-y-1 p-4">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Sent · last {limits.usage?.days ?? 30} days
                </span>
                {limits.usage ? (
                  <>
                    <p className="text-foreground text-xl font-bold">
                      {new Intl.NumberFormat().format(limits.usage.sent)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Intl.NumberFormat().format(limits.usage.delivered)}{' '}
                      delivered
                      {limits.usage.deliveryRate !== null
                        ? ` · ${limits.usage.deliveryRate}%`
                        : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground pt-1 text-sm">
                    Not reported
                  </p>
                )}
              </div>

              {/* Display name — the usual reason a healthy account is
                  stuck on the lowest limit. */}
              <div className="bg-card space-y-1 p-4">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
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
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {limits.nameReview.detail}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground pt-1 text-sm">
                    Not reported
                  </p>
                )}

                {/* Meta's health note about the name is deliberately NOT
                    shown here. `nameReview` above already states Meta's
                    verdict and what to do about it, from a more
                    authoritative field — the note only ever restated it
                    more vaguely, or flatly contradicted it. */}
              </div>

              {/* Throughput — speed, as distinct from daily volume. */}
              <div className="bg-card space-y-1 p-4">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Send speed
                </span>
                {limits.throughput ? (
                  <>
                    <p className="text-foreground text-sm font-semibold capitalize">
                      {limits.throughput.level.toLowerCase().replace(/_/g, ' ')}
                    </p>
                    {limits.throughput.description ? (
                      <p className="text-muted-foreground text-xs">
                        {limits.throughput.description}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground pt-1 text-sm">
                    Not reported
                  </p>
                )}
              </div>
            </div>

            {/* The two facts most people get wrong about this limit, said
                once, plainly, instead of in a tooltip nobody opens. */}
            <div className="text-muted-foreground mt-3 space-y-1.5 text-xs leading-relaxed">
              <p>
                The daily limit counts unique customers you start a conversation
                with, not total messages — replies inside an open 24-hour
                conversation do not count towards it. The limit itself comes
                from Meta and applies to your whole business portfolio, shared
                across every number in it.
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
                      {initiated.withinServiceWindow === 1
                        ? ' was'
                        : 's were'}{' '}
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
        <Card className="border-border mb-8 border shadow-sm">
          <CardContent className="space-y-6 py-6">
            {/* Header with Title & Meta Direct Link */}
            <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-foreground text-lg font-bold">
                    Messaging limits
                  </h2>
                  <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                    Meta Tier Progress
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Updated automatically from your Meta WhatsApp Business
                  Portfolio
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
                className="border-border bg-card text-foreground hover:bg-muted hover:text-primary inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors"
              >
                <span>View Limits in Meta</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>

            {/* 5-Tier Progress Cards (250, 2000, 10000, 100000, Unlimited) */}
            {(() => {
              const currentPerDay = limits?.messaging?.perDay ?? 2000;
              const tiers = [
                {
                  label: '250',
                  value: 250,
                  nextGoal: 125,
                  nextTierLabel: '2,000',
                },
                {
                  label: '2,000',
                  value: 2000,
                  nextGoal: 1000,
                  nextTierLabel: '10,000',
                },
                {
                  label: '10,000',
                  value: 10000,
                  nextGoal: 5000,
                  nextTierLabel: '100,000',
                },
                {
                  label: '100,000',
                  value: 100000,
                  nextGoal: 50000,
                  nextTierLabel: 'Unlimited',
                },
                {
                  label: 'Unlimited',
                  value: Infinity,
                  nextGoal: null,
                  nextTierLabel: null,
                },
              ];

              // Find active tier index
              let activeIndex = tiers.findIndex(
                (t) => t.value === currentPerDay
              );
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
              const progressPct =
                targetCount > 0
                  ? Math.min(
                      100,
                      Math.round((sevenDayCount / targetCount) * 100)
                    )
                  : 100;

              return (
                <div className="space-y-6">
                  {/* Visual Tier Grid */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
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
                                ? 'bg-muted/40 border-border text-muted-foreground border'
                                : 'bg-muted/20 border-border/60 text-muted-foreground/70 border'
                          }`}
                        >
                          {isCurrent ? (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-sm">
                              Current
                            </span>
                          ) : null}
                          <p
                            className={`text-base font-bold ${isCurrent ? 'text-foreground mt-1 text-lg' : 'text-foreground/80'}`}
                          >
                            {tier.label}
                          </p>
                          <p className="text-muted-foreground mt-1 text-[10px] leading-tight">
                            {isCurrent
                              ? 'Business-initiated conversations in 24h'
                              : 'Tier Limit'}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Increase Messaging Limit Section */}
                  <div className="border-border bg-muted/20 space-y-3 rounded-xl border p-5">
                    <div>
                      <h3 className="text-foreground text-sm font-bold">
                        Increase your messaging limit
                      </h3>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        Meta automatically evaluates your specific account
                        requirements (such as Business Verification, Quality
                        Rating, and conversation volume) to upgrade your
                        messaging tier. Upgrades can take up to 24 hours.
                      </p>
                    </div>

                    <div className="border-border/40 flex flex-wrap gap-4 border-t pt-2 text-xs">
                      <a
                        href="https://www.facebook.com/business/help/687938765816627"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        <span>What are high-quality messages?</span>
                        <ExternalLink className="size-3" />
                      </a>
                      <a
                        href="https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
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
        <div className="border-border bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isConnected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {isConnected ? <CheckCircle2 className="size-5" /> : '1'}
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-foreground text-base font-semibold">
                  Get Your WhatsApp Business API
                </h3>
                {isConnected && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {isConnected
                  ? 'Your WhatsApp Business API is successfully connected and ready to use.'
                  : 'Get instant access to the WhatsApp Business API using your Facebook account.'}
              </p>

              {/* Number registration belongs to the connection, not billing.
                  Led by OUR reading of Meta's real status fields rather
                  than by Meta's health remedy, because that remedy tells
                  an operator to "finish the OTP authentication process"
                  even when code_verification_status is already VERIFIED —
                  which is the normal state for a virtual number Meta is
                  still reviewing, and sent people to redo a finished step
                  to fix something only Meta can clear.

                  Meta's own error text is still shown verbatim beneath, so
                  nothing is hidden; only the inapplicable remedy is. */}
              {isConnected &&
              !metaInfoLoading &&
              issues.registration.length > 0 &&
              registration.state !== 'ready' ? (
                <div
                  className={cn(
                    'rounded-lg border p-3.5',
                    registration.state === 'in_review'
                      ? 'border-blue-500/30 bg-blue-500/5'
                      : 'border-amber-500/30 bg-amber-500/5'
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    {registration.state === 'in_review' ? (
                      <Clock className="size-4 shrink-0 text-blue-500" />
                    ) : (
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                    )}
                    <span
                      className={cn(
                        'text-sm font-medium',
                        registration.state === 'in_review'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {registration.title}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {registration.detail}
                  </p>
                  <ul className="text-muted-foreground mt-2.5 space-y-2 border-t border-dashed pt-2.5 text-xs">
                    {issues.registration.map((issue, index) => (
                      <HealthIssueRow
                        key={issue.code ?? `reg${index}`}
                        issue={issue}
                        wabaId={config?.waba_id}
                        showSolution={registration.trustMetaSolution}
                        showLink={registration.trustMetaSolution}
                        label="Meta reports"
                      />
                    ))}
                  </ul>

                  {/* The recovery path for numbers connected before the
                      signup route started registering them itself. Only
                      offered when we can see the number is verified but
                      unregistered — never when Meta is simply reviewing,
                      and never when the OTP is genuinely outstanding,
                      because the call would fail. */}
                  {registration.canSelfRepair ? (
                    <div className="mt-3 space-y-2">
                      {isOwner ? (
                        <Button
                          size="sm"
                          onClick={() => void completeRegistration()}
                          disabled={completingRegistration}
                        >
                          {completingRegistration ? (
                            <>
                              <Loader2 className="mr-2 size-3.5 animate-spin" />
                              Completing…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 size-3.5" />
                              Complete registration
                            </>
                          )}
                        </Button>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Ask the workspace owner to complete this — it sets a
                          security PIN for the whole business, so only the owner
                          can.
                        </p>
                      )}

                      {/* Shown once, and only when freshly generated. Meta
                          has no API to read a PIN back, so if the operator
                          does not save it here it is gone. */}
                      {generatedPin ? (
                        <div className="border-border bg-card rounded-md border p-3">
                          <p className="text-foreground text-xs font-semibold">
                            Save your two-step verification PIN: {generatedPin}
                          </p>
                          <p className="text-muted-foreground mt-1 text-[11px]">
                            Meta required a PIN to activate this number, so we
                            generated one. Meta cannot show it again — store it
                            somewhere safe. You will need it if you ever change
                            two-step verification in WhatsApp Manager.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isConnected ? (
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${config!.waba_id}`,
                        '_blank',
                        'noopener,noreferrer'
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
                    className="group animate-wa-ring relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00A884] via-[#00b58e] to-[#008f6f] px-5 py-2.5 font-semibold text-white shadow-[0_4px_14px_rgba(0,168,132,0.35)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_25px_rgba(0,168,132,0.55)] active:scale-[0.98]"
                  >
                    <span
                      className="animate-wa-shimmer pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                      aria-hidden="true"
                    />
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg
                          className="mr-2 size-4 fill-current transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
                          viewBox="0 0 24 24"
                        >
                          <path d={WA_ICON_PATH} />
                        </svg>
                        Connect WhatsApp Business
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
        <div className="border-border bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                !isConnected
                  ? 'bg-muted text-muted-foreground'
                  : paymentState === 'no_issue'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                    : paymentState === 'action_required'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              {!isConnected ? (
                '2'
              ) : paymentState === 'no_issue' ? (
                // Meta raised no billing complaint, so there is nothing to
                // do here even when volume is capped for another reason.
                <CheckCircle2 className="size-4" />
              ) : paymentState === 'action_required' ? (
                <AlertTriangle className="size-4" />
              ) : (
                '2'
              )}
            </div>
            <div
              className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-foreground text-base font-semibold">
                  Payment method &amp; sending
                </h3>
                {isConnected && metaInfoLoading ? (
                  <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    <Loader2 className="size-3 animate-spin" />
                    Checking with Meta
                  </span>
                ) : null}
                {/* The badge reports BILLING only, since that is what this
                    step is about. A sending-readiness badge was shown
                    beside it and had to go: two badges on one heading read
                    as one compound verdict, so a green "No payment issues"
                    next to "Can send · limited" looked like billing was
                    itself the thing being limited. The cap is stated in the
                    sentence below and owned by the Messaging limits
                    section. */}
                {isConnected &&
                !metaInfoLoading &&
                paymentState === 'no_issue' ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    No payment issues
                  </span>
                ) : null}
                {isConnected &&
                !metaInfoLoading &&
                paymentState === 'action_required' ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                    Action Required
                  </span>
                ) : null}
              </div>

              {/* Exactly one statement of the problem, and Meta's own words
                  win. When Meta has told us what is wrong, our generic
                  sentence is suppressed — running both put a paraphrase
                  directly above the real thing, which is how this step came
                  to say "you need a payment method" three times in three
                  different registers. */}
              {paymentSummary ? (
                <p className="text-muted-foreground text-sm">
                  {paymentSummary}
                </p>
              ) : null}

              {/* ---- Payment not set up: Meta's steps, then the button ----
                  The steps are spelled out because the failure is silent
                  from inside the CRM: Meta blocks the send, and the person
                  reading this has no way to know that a card which is not
                  the DEFAULT counts for nothing. */}
              {isConnected &&
              !metaInfoLoading &&
              paymentState === 'action_required' ? (
                <>
                  {issues.payment.length > 0 ? (
                    <ul className="text-muted-foreground space-y-3 text-sm">
                      {issues.payment.map((issue, index) => (
                        <HealthIssueRow
                          key={issue.code ?? `p${index}`}
                          issue={issue}
                          wabaId={config?.waba_id}
                          // The numbered guide and the button below carry
                          // the remedy, so Meta's version of it and its
                          // link are both suppressed here.
                          showSolution={false}
                          showLink={false}
                        />
                      ))}
                    </ul>
                  ) : null}

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="mb-2.5 flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        Follow these steps to complete your payment setup:
                      </span>
                    </div>
                    <ol className="space-y-2">
                      {PAYMENT_SETUP_STEPS.map((step, index) => (
                        <li key={step} className="flex gap-2.5">
                          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            {index + 1}
                          </span>
                          <span className="text-muted-foreground min-w-0 flex-1 text-sm leading-relaxed">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : null}

              {isConnected && !metaInfoLoading ? (
                <>
                  {/* Anything Meta reported that belongs to no step. Kept
                      visible so an unrecognised message is never lost, but
                      under neutral wording — the old "Meta is blocking
                      sending for this reason" panel repeated the payment
                      errors already listed above it, which made one problem
                      look like two. */}
                  {issues.other.length > 0 ? (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="size-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          Also reported by Meta:
                        </span>
                      </div>
                      <ul className="text-muted-foreground space-y-3 text-sm">
                        {issues.other.map((issue, index) => (
                          <HealthIssueRow
                            key={issue.code ?? `o${index}`}
                            issue={issue}
                            wabaId={config?.waba_id}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Neutral fallback. Reached when Meta did not return a
                      health status at all — an older API version, or a
                      token without the permission. Guidance, not an alarm:
                      we genuinely do not know, so we must not imply the
                      customer has forgotten something. */}
                  {paymentState === 'unknown' ? (
                    <div className="border-border bg-muted/40 rounded-lg border p-4">
                      <p className="text-muted-foreground mb-2.5 text-sm">
                        We could not read your billing status from Meta, so
                        check it directly if broadcasts are not sending:
                      </p>
                      <ol className="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
                        {PAYMENT_SETUP_STEPS.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {/* Buttons follow the PAYMENT state, not the sending
                      state. An account whose sending is limited over
                      business verification has nothing wrong with its
                      billing, and offering "Add payment method" there sent
                      people to fix something that was never broken. */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {paymentState === 'action_required' ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          window.open(
                            billingHubUrl(billingWabaId),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        <CreditCard className="mr-2 size-3.5" />
                        Add payment method
                        <ExternalLink className="ml-2 size-3" />
                      </Button>
                    ) : null}

                    {paymentState === 'no_issue' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(
                              billingHubUrl(billingWabaId),
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          Update payment method
                          <ExternalLink className="ml-2 size-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(
                              paymentActivityUrl(billingWabaId),
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          Payment activity
                          <ExternalLink className="ml-2 size-3" />
                        </Button>
                      </>
                    ) : null}

                    {paymentState === 'unknown' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            billingHubUrl(billingWabaId),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        <CreditCard className="mr-2 size-3.5" />
                        Open billing settings
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
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Step 3: Facebook Business Verification ──
            `business_verification_status` was already being fetched from
            the WABA and thrown away, so this step said "Optional" to a
            business that had finished verifying. It now follows Meta. */}
        <div className="border-border bg-card rounded-xl border p-6">
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
            <div
              className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-foreground text-base font-semibold">
                  Facebook Business Verification
                </h3>
                {isConnected && metaInfoLoading ? (
                  <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
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
                  <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                    Optional
                  </span>
                )}
              </div>

              <p className="text-muted-foreground text-sm">
                {verification === 'verified'
                  ? 'Your business is verified with Meta. Your brand name can show in place of your phone number, and your messaging limits are raised.'
                  : verification === 'pending'
                    ? 'Meta is reviewing your business verification. Nothing to do until they respond — this usually takes a few days.'
                    : 'Verify your Facebook business to display your brand name instead of your phone number and increase your messaging limits.'}
              </p>

              {/* Meta's own verification errors, shown on the step that
                  owns them. These used to land in the payment step, which
                  both blamed the wrong thing and left this step reading
                  "Optional" while Meta was actively capping the account
                  over it. */}
              {isConnected &&
              !metaInfoLoading &&
              issues.business_verification.length > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      This is currently limiting your sending:
                    </span>
                  </div>
                  <ul className="text-muted-foreground space-y-3 text-sm">
                    {issues.business_verification.map((issue, index) => (
                      <HealthIssueRow
                        key={issue.code ?? `v${index}`}
                        issue={issue}
                        wabaId={config?.waba_id}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Requirements are only useful to someone who still has to
                  do this. Showing them to a verified business is noise. */}
              {verification !== 'verified' && verification !== 'pending' ? (
                <div className="text-muted-foreground text-sm">
                  <p className="text-foreground mb-1.5 font-medium">
                    Requirements:
                  </p>
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
                        'noopener,noreferrer'
                      )
                    }
                  >
                    {verification === 'pending'
                      ? 'View status'
                      : 'Verify Business'}
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
