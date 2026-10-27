import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteSettings } from '@/lib/cms/queries';
import {
  MARKETING_COPY_DEFAULTS,
  resolveMarketingCopy,
  type AuthShowcaseCopy,
} from '@/lib/cms/marketing-copy';
import { AuthCopyProvider } from '@/components/auth/auth-showcase';

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

// Read the CMS per request: the Docker build has no database credentials
// (only NEXT_PUBLIC_* build args), so a prerender would bake in the
// defaults, and a CMS edit should show without a redeploy.
export const dynamic = 'force-dynamic';

async function loadAuthCopy(): Promise<AuthShowcaseCopy> {
  try {
    const settings = await getSiteSettings();
    return resolveMarketingCopy(settings?.marketing_copy).auth;
  } catch (err) {
    // Never let a CMS problem take the login page down.
    console.error('[auth layout] could not load marketing copy:', err);
    return MARKETING_COPY_DEFAULTS.auth;
  }
}

// The login / signup showcase copy is CMS-managed (site_settings.
// marketing_copy.auth), handed to the client pages through context.
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const copy = await loadAuthCopy();
  return <AuthCopyProvider value={copy}>{children}</AuthCopyProvider>;
}
