'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Shield,
  CreditCard,
  Building2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useMetaSDK } from '@/components/providers/meta-sdk-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import { WhatsAppConnectModal } from './whatsapp-connect-modal';

interface EmbeddedConfig {
  phone_number_id: string;
  waba_id: string;
  connection_source: string;
  registered_at: string | null;
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

  // ── WA_EMBEDDED_SIGNUP event listener ──────────────────────
  // This captures the waba_id and phone_number_id directly from
  // Meta's client-side postMessage — more reliable than debug_token.
  const embeddedDataRef = useRef<{
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
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
    const extras: Record<string, unknown> = {
      setup: {},
      sessionInfoVersion: '3',
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
                const text = await res.text();
                console.error('Expected JSON but got HTML/text:', text.substring(0, 500));
                toast.error('Server returned an invalid response. Please check the console.');
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
            <div className="grid gap-px sm:grid-cols-5 rounded-xl border border-border overflow-hidden bg-border">
              {/* Business */}
              <div className="bg-card p-4 space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Business
                </span>
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Building2 className="size-4 text-primary" />
                  <span className="truncate">Connected</span>
                </div>
              </div>
              {/* WhatsApp Number */}
              <div className="bg-card p-4 space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  WhatsApp Number
                </span>
                <div className="font-medium text-primary">
                  +{config.phone_number_id}
                </div>
              </div>
              {/* Message Limit */}
              <div className="bg-card p-4 space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Message Limit (24h)
                </span>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Zap className="size-3.5 text-amber-500" />
                  250
                </div>
              </div>
              {/* Account Status */}
              <div className="bg-card p-4 space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Account Status
                </span>
                <div className="flex items-center gap-1.5 font-medium text-amber-500">
                  <AlertTriangle className="size-3.5" />
                  Limited
                </div>
              </div>
              {/* Quality Rating */}
              <div className="bg-card p-4 space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Quality Rating
                </span>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Shield className="size-3.5 text-primary" />
                  Unknown
                </div>
              </div>
            </div>
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

        {/* ── Step 2: Add Payment Method ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isConnected
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isConnected ? (
                <AlertTriangle className="size-4" />
              ) : (
                '2'
              )}
            </div>
            <div className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">Add Payment Method</h3>
                {isConnected && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                    Action Required
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Add a payment method in Facebook Business Manager to send template messages and
                enable bulk messaging.
              </p>

              {isConnected && (
                <>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="size-4 text-amber-500" />
                      <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        Follow these steps to complete your payment setup:
                      </span>
                    </div>
                    <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                      <li>
                        Click <strong className="text-foreground">Add Payment Method</strong> and add
                        your card in Facebook Business Manager.
                      </li>
                      <li>Set the payment method as default from the three-dot menu.</li>
                      <li>Complete business billing info. For India, add your GST number.</li>
                    </ol>
                  </div>
                  <div className="pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          'https://business.facebook.com/settings/payment-methods',
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      <CreditCard className="mr-2 size-3.5" />
                      Add Payment Method
                      <ExternalLink className="ml-2 size-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Step 3: Facebook Business Verification ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
              3
            </div>
            <div className={`flex-1 space-y-3 ${!isConnected ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  Facebook Business Verification
                </h3>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Optional
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Verify your Facebook business to display your brand name instead of your phone number
                and increase your messaging limits.
              </p>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1.5">Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Legal business document with business name</li>
                  <li>Working website</li>
                </ul>
              </div>

              <div className="pt-1">
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
                  Verify Business
                  <ExternalLink className="ml-2 size-3" />
                </Button>
              </div>
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
