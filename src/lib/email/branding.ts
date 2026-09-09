// ============================================================
// Email chrome branding — SERVER ONLY (service role).
//
// One lookup of the `site_settings` singleton, shared by every email
// builder. This existed as a byte-for-byte copy in both `auth.ts` and
// `billing.ts`, and a third inline variant in the newsletter route, so a
// rebrand or a new logo column had to be remembered in three places.
//
// Fails soft to the product name, deliberately. An email that says
// "Replai" after the operator has rebranded is cosmetic; an email that
// never sends because a settings read failed is a support ticket.
// ============================================================

import { supabaseAdmin } from '@/lib/auth/admin-client';

const FALLBACK_SITE_NAME = 'Replai';
const FALLBACK_APP_URL = 'https://wacrm.tech';

export interface EmailBranding {
  siteName: string;
  /** Where to tell customers to write. Null when none is configured. */
  supportEmail: string | null;
  /** No trailing slash, so callers can concatenate a path directly. */
  appUrl: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
}

/**
 * Read branding for the email shell.
 *
 * @param label Log prefix, so a failure says which sender hit it.
 */
export async function getEmailBranding(
  label = 'email'
): Promise<EmailBranding> {
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_APP_URL).replace(
    /\/+$/,
    ''
  );

  try {
    const { data } = await supabaseAdmin()
      .from('site_settings')
      .select(
        'site_name, support_email, logo_url, logo_dark_url, full_logo_url'
      )
      .limit(1)
      .maybeSingle();

    const logoUrl =
      data?.logo_url || data?.full_logo_url || `${appUrl}/Replai-logo.png`;
    const logoDarkUrl = data?.logo_dark_url || `${appUrl}/logo-full.jpg`;

    return {
      siteName: data?.site_name || FALLBACK_SITE_NAME,
      supportEmail: data?.support_email || null,
      appUrl,
      logoUrl,
      logoDarkUrl,
    };
  } catch (err) {
    console.error(
      `[${label}] branding lookup failed, using defaults:`,
      err instanceof Error ? err.message : err
    );
    return {
      siteName: FALLBACK_SITE_NAME,
      supportEmail: null,
      appUrl,
      logoUrl: `${appUrl}/Replai-logo.png`,
      logoDarkUrl: `${appUrl}/logo-full.jpg`,
    };
  }
}
