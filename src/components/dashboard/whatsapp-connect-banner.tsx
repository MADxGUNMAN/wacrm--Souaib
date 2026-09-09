'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
    <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#00A884]/10 text-[#00A884]">
          <svg
            className="size-5 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d={WA_ICON_PATH} />
          </svg>
        </div>
        <div>
          <h3 className="text-foreground text-sm font-semibold sm:text-base">
            {t('title')}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">
            {t('description')}
          </p>
        </div>
      </div>

      <div className="shrink-0 self-start sm:self-auto">
        {canConnect ? (
          <Link
            href="/settings?tab=whatsapp&mode=guided"
            className="inline-flex items-center gap-2 rounded-lg bg-[#00A884] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#008f6f] active:bg-[#007a5e]"
          >
            <svg
              className="size-4 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d={WA_ICON_PATH} />
            </svg>
            <span>{t('connectButton')}</span>
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
