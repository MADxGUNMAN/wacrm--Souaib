/**
 * AWS S3 client singleton and helper functions.
 *
 * Replaces Supabase Storage for all file operations. Every upload goes
 * to a single bucket (`AWS_S3_BUCKET_NAME`) with folder prefixes that
 * mirror the old Supabase bucket names:
 *
 *   chat-media/account-<id>/...
 *   flow-media/account-<id>/...
 *   avatars/<user_id>/...
 *   public-assets/...
 *   landing-assets/...
 *
 * The bucket must have public-read access (via bucket policy) so Meta's
 * WhatsApp servers and browsers can fetch media without signing.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_S3_REGION || 'us-east-1';
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  // Warn at module load — crash is deferred to actual usage so the app
  // can still start for pages that don't need storage.
  console.warn(
    '[s3-client] Missing AWS env vars (AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY). ' +
      'File uploads will fail.'
  );
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: ACCESS_KEY!,
        secretAccessKey: SECRET_KEY!,
      },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upload a file (Buffer or Uint8Array) to S3.
 *
 * @param key     Full object key including folder prefix, e.g.
 *                `chat-media/account-abc/1234-photo.jpg`
 * @param body    File contents.
 * @param contentType  MIME type.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // No ACL needed — bucket policy grants public read.
    })
  );
}

/**
 * How long a presigned upload URL stays valid.
 *
 * 15 minutes, sized for the worst realistic case rather than the typical
 * one: a 100 MB document on a slow mobile connection. Shorter would look
 * tighter and would fail exactly the uploads this feature exists to
 * support. The URL grants a write to ONE key with ONE content type and
 * ONE exact byte length, so its blast radius does not grow with its
 * lifetime.
 */
export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 15 * 60;

/**
 * Mint a presigned PUT URL so the BROWSER can upload straight to S3.
 *
 * ─── Why not just proxy through the app ───────────────────────────
 *
 * The old path was browser → Next.js route → S3, and the route did
 * `await file.arrayBuffer()` then `Buffer.from(...)`, holding the whole
 * file in memory twice. On a 900 MB server that put a single 100 MB
 * document upload within range of the OOM killer, so the advertised limit
 * was never actually deliverable. It also meant every upload had to fit
 * under nginx's request body cap. Going direct removes both ceilings: the
 * bytes never touch this server.
 *
 * ─── What the signature pins ──────────────────────────────────────
 *
 * `key` is built server-side from the session — never accepted from the
 * browser — so a caller cannot write into another tenant's prefix.
 * `contentType` and `contentLength` are signed too, which means the PUT
 * is rejected by S3 unless it sends exactly that type and exactly that
 * many bytes. Without pinning length, a client could ask to upload 1 KB,
 * pass validation, and then push 5 GB through the same URL.
 */
export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<string> {
  const { key, contentType, contentLength, expiresIn } = params;
  const client = getClient();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      // No ACL — the bucket policy grants public read, and sending an ACL
      // on a bucket with ownership enforced is rejected outright.
    }),
    {
      expiresIn: expiresIn ?? PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      // `signableHeaders` is NOT optional hardening — without it
      // `content-type` is left out of the signature entirely.
      //
      // Measured against the live bucket: with only the command's
      // ContentType set, a PUT sending `Content-Type: image/png` to a URL
      // signed for `application/octet-stream` was accepted with HTTP 200.
      // That matters because this bucket is PUBLIC-READ and serves back
      // whatever type was stored — so an unpinned type means a caller who
      // obtained a presign for a JPEG could store `text/html` at a URL on
      // the bucket domain, which is stored XSS.
      //
      // `content-length` is listed for the same reason in spirit, though
      // the SDK already signs that one: it is what stops "ask for a URL
      // for 1 KB, then push 5 GB through it".
      signableHeaders: new Set(['host', 'content-type', 'content-length']),
    }
  );
}

/**
 * Delete an object from S3.
 *
 * @param key  Full object key.
 */
export async function deleteFromS3(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Build the public URL for an S3 object. Uses the standard virtual-hosted
 * style URL. If you later add CloudFront, swap this to return the CDN URL.
 */
export function getS3PublicUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodeURI(key)}`;
}

/**
 * Extract the S3 object key from a full public URL produced by
 * `getS3PublicUrl`. Returns `null` if the URL doesn't match our bucket.
 */
export function extractS3Key(url: string): string | null {
  const prefix = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  if (url.startsWith(prefix)) {
    return decodeURI(url.slice(prefix.length));
  }
  return null;
}
