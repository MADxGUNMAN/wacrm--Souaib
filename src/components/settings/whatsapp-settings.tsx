'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Sparkles } from 'lucide-react';

import { MetaSDKProvider } from '@/components/providers/meta-sdk-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { WhatsAppConfig } from './whatsapp-config';
import { WhatsAppSetup } from './whatsapp-setup';

/**
 * The single WhatsApp settings section.
 *
 * "WhatsApp Setup" (Meta's Embedded Signup) and "WhatsApp" (manual
 * credentials) used to be two sibling entries in the settings rail, which
 * read as two unrelated features when they are really two ways to connect
 * the same number. They are merged into one section here: the guided
 * Embedded Signup flow is what you land on, with a tab across to the
 * manual credential form for self-hosters and for numbers that have to be
 * wired up by hand.
 *
 * The chosen mode lives in the URL (`/settings?tab=whatsapp&mode=manual`)
 * so a teammate can be sent straight to the manual form, and so a browser
 * refresh does not silently bounce back to the guided flow.
 */
const MODES = ['guided', 'manual'] as const;
type Mode = (typeof MODES)[number];

const DEFAULT_MODE: Mode = 'guided';

function resolveMode(raw: string | null): Mode {
  return (MODES as readonly string[]).includes(raw ?? '')
    ? (raw as Mode)
    : DEFAULT_MODE;
}

export function WhatsAppSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = resolveMode(searchParams.get('mode'));

  const setMode = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Keep the default out of the URL so the common case stays a clean
    // `?tab=whatsapp`, which is what the sidebar and header link to.
    if (next === DEFAULT_MODE) params.delete('mode');
    else params.set('mode', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={mode} onValueChange={setMode}>
      <TabsList aria-label="WhatsApp connection method" className="h-9">
        <TabsTrigger value="guided" className="px-3">
          <Sparkles />
          Guided setup
        </TabsTrigger>
        <TabsTrigger value="manual" className="px-3">
          <KeyRound />
          Manual setup
        </TabsTrigger>
      </TabsList>

      <TabsContent value="guided" className="mt-5">
        <MetaSDKProvider
          appId={process.env.NEXT_PUBLIC_META_APP_ID || '3141459766059334'}
        >
          <WhatsAppSetup />
        </MetaSDKProvider>
      </TabsContent>

      <TabsContent value="manual" className="mt-5">
        <WhatsAppConfig />
      </TabsContent>
    </Tabs>
  );
}
