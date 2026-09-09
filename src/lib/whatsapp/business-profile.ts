// ============================================================
// The connected number's WhatsApp business profile.
//
// This is the ONE profile picture the Cloud API will give us. Customers'
// avatars are not available at all — no webhook field, no Graph edge
// (`/{wa_id}/picture` does not exist). So this is the business's own
// avatar: what a customer sees when they tap your name in a chat.
//
// THE CENTRAL PROBLEM: META'S URL EXPIRES
// `profile_picture_url` comes back as a signed pps.whatsapp.net link with
// an `oe=` expiry a few days out (the one measured while building this had
// three days). Storing it directly would hand every workspace a broken
// image shortly after connecting, and the break would surface long after
// the deploy that caused it.
//
// So we copy the bytes into our own bucket and store OUR url. That trades
// a little storage for a picture that keeps working, and it means the
// browser never talks to Meta's CDN.
// ============================================================

import { META_API_BASE } from './graph-version';
import { getS3PublicUrl, uploadToS3 } from '@/lib/storage/s3-client';

/**
 * Server-side only prefix, deliberately NOT added to
 * ALLOWED_UPLOAD_FOLDERS: that allowlist governs which folders a BROWSER
 * may request a presigned upload into, and nothing about this should be
 * writable by a client.
 */
const PROFILE_PICTURE_PREFIX = 'business-profile';

/** Meta's cap is 5 MB for a profile image; anything larger is not ours. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface BusinessProfile {
  /** Our permanent S3 URL, or null when Meta has no picture set. */
  pictureUrl: string | null;
  about: string | null;
}

interface MetaBusinessProfileResponse {
  data?: {
    about?: string;
    profile_picture_url?: string;
    description?: string;
  }[];
}

/**
 * Read the business profile from Meta.
 *
 * Returns Meta's own (expiring) picture URL — callers that intend to
 * persist anything must go through `syncBusinessProfile` instead.
 */
export async function fetchBusinessProfileFromMeta(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<{ pictureUrl: string | null; about: string | null }> {
  const url =
    `${META_API_BASE}/${encodeURIComponent(params.phoneNumberId)}/whatsapp_business_profile` +
    `?fields=about,profile_picture_url`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    // Always hit Meta: this is called from a refresh action, where a
    // cached response would defeat the point.
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Meta rejected the business profile request (${res.status}): ${body.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as MetaBusinessProfileResponse;
  const profile = json.data?.[0];

  return {
    pictureUrl: profile?.profile_picture_url ?? null,
    // Meta returns a single space for an unset About. Collapsed to null so
    // the UI does not render an empty line that looks like a layout bug.
    about: profile?.about?.trim() ? profile.about.trim() : null,
  };
}

/**
 * Fetch the profile and mirror the picture into our bucket.
 *
 * Returns our own URL. Throws only when Meta itself refuses — a picture
 * that cannot be downloaded or is the wrong shape yields `pictureUrl:
 * null` with a warning, because the About text is still worth saving and
 * failing the whole sync over an image would be disproportionate.
 */
export async function syncBusinessProfile(params: {
  phoneNumberId: string;
  accessToken: string;
  accountId: string;
}): Promise<BusinessProfile> {
  const { pictureUrl: metaUrl, about } = await fetchBusinessProfileFromMeta({
    phoneNumberId: params.phoneNumberId,
    accessToken: params.accessToken,
  });

  if (!metaUrl) return { pictureUrl: null, about };

  try {
    const imageRes = await fetch(metaUrl, { cache: 'no-store' });
    if (!imageRes.ok) {
      throw new Error(`download failed with ${imageRes.status}`);
    }

    const contentType = (
      imageRes.headers.get('content-type') ?? 'image/jpeg'
    ).split(';')[0]!.trim().toLowerCase();

    // Pin the stored type to an image we recognise. The bucket is
    // public-read and serves back whatever type it was given, so trusting
    // an upstream content-type would be a way to park an arbitrary
    // document on our own domain.
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error(`unexpected content-type ${contentType}`);
    }

    const bytes = Buffer.from(await imageRes.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error('empty image body');
    if (bytes.byteLength > MAX_PICTURE_BYTES) {
      throw new Error(`image is ${bytes.byteLength} bytes, over the cap`);
    }

    const ext = contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp'
      : 'jpg';

    // Timestamped key rather than a fixed name: S3 and any CDN in front of
    // it would otherwise serve the previous image after the business
    // changes their avatar, and a stale logo is the exact thing this
    // feature is meant to show correctly.
    const key =
      `${PROFILE_PICTURE_PREFIX}/account-${params.accountId}/` +
      `${params.phoneNumberId}-${Date.now()}.${ext}`;

    await uploadToS3(key, bytes, contentType);

    return { pictureUrl: getS3PublicUrl(key), about };
  } catch (err) {
    // Non-fatal by design — see the doc comment.
    console.warn(
      '[business-profile] could not mirror the profile picture:',
      err instanceof Error ? err.message : String(err)
    );
    return { pictureUrl: null, about };
  }
}
