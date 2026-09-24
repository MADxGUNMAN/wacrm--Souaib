'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { canAccessSettingsSection } from '@/lib/auth/roles';

const WA_ICON_PATH =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z';

export function WhatsAppConnectBanner() {
  const t = useTranslations('Dashboard.whatsappBanner');
  const { accountId, accountRole, profile, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // Query WhatsApp connection status from whatsapp_config table
  const checkStatus = useCallback(async () => {
    if (!accountId) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('phone_number_id, status')
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) {
        console.error('[WhatsAppConnectBanner] Query error:', error);
        setIsConnected(false);
      } else {
        const connected = Boolean(
          data?.phone_number_id && data?.status === 'connected'
        );
        setIsConnected(connected);
      }
    } catch (err) {
      console.error('[WhatsAppConnectBanner] Check status failed:', err);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Subscribe to real-time changes on whatsapp_config for this account
  useEffect(() => {
    if (!accountId) return;
    void checkStatus();

    const supabase = createClient();
    const channel = supabase
      .channel(`whatsapp_banner_status_${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_config',
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          void checkStatus();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, checkStatus]);

  // Check if current user can access whatsapp settings
  const canConnect = useMemo(() => {
    if (accountRole === 'owner') return true;
    return canAccessSettingsSection(
      accountRole,
      profile?.permissions,
      'whatsapp'
    );
  }, [accountRole, profile?.permissions]);

  // Don't render anything while loading or if already connected
  if (profileLoading || loading || isConnected === null || isConnected) {
    return null;
  }

  return (
    <div className="border-border bg-card relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="relative space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-foreground inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold dark:border-red-500/40 dark:bg-red-500/20">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            Action Required
          </span>
        </div>
        <h3 className="text-foreground text-sm font-semibold tracking-tight sm:text-base">
          {t('title')}
        </h3>
        <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed sm:text-sm">
          {t('description')}
        </p>
      </div>

      <div className="relative shrink-0 self-start pt-1 sm:self-auto sm:pt-0">
        {canConnect ? (
          <Link
            href="/settings?tab=whatsapp&mode=guided"
            className="group animate-wa-ring relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#00A884] via-[#00b58e] to-[#008f6f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,168,132,0.35)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_8px_25px_rgba(0,168,132,0.55)] active:scale-[0.97]"
          >
            {/* Smooth diagonal shimmer light streak */}
            <span
              className="animate-wa-shimmer pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
              aria-hidden="true"
            />

            {/* WhatsApp logo with interactive hover rotate/scale */}
            <svg
              className="relative size-4.5 fill-current transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d={WA_ICON_PATH} />
            </svg>

            <span className="relative tracking-wide">{t('connectButton')}</span>

            {/* Micro-animated directional arrow */}
            <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        ) : (
          <span className="text-muted-foreground text-xs italic">
            {t('contactOwner')}
          </span>
        )}
      </div>
    </div>
  );
}
