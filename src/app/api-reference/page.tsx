// ============================================================
// /api-reference — the developer reference for the public REST API.
//
// ─── Why this route, and why it is public ─────────────────────────
//
// `/docs` already exists as the CMS-driven product resource centre, so
// this lives at `/api-reference` — the name Stripe, Twilio and Resend all
// use for the same thing, and unambiguous next to product docs.
//
// It requires no login on purpose. The person wiring up an integration is
// often a contractor or a backend developer who was handed a key, not a
// CRM seat. Nothing here is account-specific: no keys, no customer data,
// only the shape of the API. Gating it would block the reader while
// protecting nothing.
//
// ─── Server work ─────────────────────────────────────────────────
//
// The page's only job is to decide which origin the snippets should call
// and hand the serialized view model to the client component. Reading
// `headers()` opts this route into dynamic rendering, which is what we
// want: the same build serves any host a fork is deployed on, and the
// samples show that host rather than a placeholder.
// ============================================================

import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { ApiReference } from '@/components/api-docs/api-reference';
import { getSiteSettings } from '@/lib/cms/queries';
import { resolveSiteUrl } from '@/lib/cms/sitemap';
import { DEFAULT_BASE_URL } from '@/lib/api-docs/code-samples';
import {
  buildApiReferenceView,
  resolveDocsBaseUrl,
} from '@/lib/api-docs/view-model';

const API_REFERENCE_TITLE = 'API reference';
const API_REFERENCE_DESCRIPTION =
  'Developer reference for the WhatsApp CRM public REST API (v1): endpoints, scopes, error codes, rate limits, pagination and webhooks, with runnable examples in cURL, Node.js, Python, PHP, Go and Ruby.';

// Public and indexable (it's listed in sitemap.xml), unless the global
// "no_index" switch in CMS → Global Settings is on.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const noIndex = settings?.no_index ?? false;
  const siteName = settings?.site_name || 'Replai';
  const url = `${resolveSiteUrl(settings)}/api-reference`;
  // The root layout's title template appends the site name.
  const title = API_REFERENCE_TITLE;
  return {
    title,
    description: API_REFERENCE_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${siteName}`,
      description: API_REFERENCE_DESCRIPTION,
      type: 'website',
      url,
      siteName,
      images: settings?.og_image_url ? [{ url: settings.og_image_url }] : [],
    },
    twitter: {
      card: 'summary',
      title: `${title} — ${siteName}`,
      description: API_REFERENCE_DESCRIPTION,
    },
    robots: { index: !noIndex, follow: !noIndex },
  };
}

export default async function ApiReferencePage() {
  const headerList = await headers();

  const baseUrl = resolveDocsBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_SITE_URL,
    forwardedHost: headerList.get('x-forwarded-host'),
    forwardedProto: headerList.get('x-forwarded-proto'),
    host: headerList.get('host'),
    // A visibly fake domain, so a reader can tell at a glance that the
    // origin needs replacing rather than silently trusting a wrong one.
    fallback: DEFAULT_BASE_URL,
  });

  return <ApiReference view={buildApiReferenceView(baseUrl)} />;
}
