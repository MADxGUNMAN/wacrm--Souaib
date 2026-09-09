/**
 * Shared media-upload helper. Files go BROWSER → S3 directly, using a
 * short-lived presigned URL minted by `POST /api/storage/presign`.
 *
 * The account-scoped path convention is unchanged:
 *
 *   <folder>/account-<account_id>/<timestamp>-<basename>.<ext>
 *
 * Auth, account resolution and the object key are all decided server-side
 * in the presign route — the browser never chooses where a file lands.
 * Every upload surface (inbox composer, Flows builder, template media,
 * avatars, landing-section artwork) calls through here, so the transport
 * and its guarantees live in exactly one place.
 */

/** 16 MB — matches the old bucket file_size_limit (migrations 016/020/023). */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Per-kind upload ceilings that mirror Meta's WhatsApp Cloud API caps so
 * a file that the bucket would accept (≤16 MB) but Meta would reject is
 * caught client-side BEFORE upload — otherwise it lands in storage as an
 * orphan and the send fails with a confusing 400. Images are Meta's
 * tightest cap at 5 MB; documents are held at the 16 MB bucket limit
 * (Meta allows 100 MB, but the bucket — and shared-hosting upload UX —
 * caps lower).
 */
export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
  /**
   * The ANIMATED ceiling. Kept as `sticker` so existing callers keep
   * compiling, but it is the looser of Meta's two limits — see
   * STICKER_MAX_BYTES below and always pick by animation flag, never by
   * this constant alone.
   */
  sticker: 500 * 1024,
} as const;

/**
 * Meta's two sticker ceilings, which differ by 5x and cannot be told
 * apart from the MIME type — both are `image/webp`.
 *
 * Checking only the 500 KB figure (which is what the composer used to do)
 * lets a 250 KB STATIC sticker upload to S3 and then get rejected by Meta
 * at send time, leaving an orphan object and an error that arrives after
 * the agent has moved on. `inspectWebPFile` in ./webp reads the container
 * flag so the right limit is applied.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/sticker-messages/
 */
export const STICKER_MAX_BYTES = {
  static: 100 * 1024,
  animated: 500 * 1024,
} as const;

/**
 * Build the account-scoped object path for an upload. Pure + exported so
 * it can be unit-tested without a Supabase client.
 *
 * - `basename` is stripped of its extension, lower-cased non-safe chars
 *   are collapsed to `_`, and it's capped at 40 chars (falls back to
 *   "file" when empty).
 * - The timestamp + the original name keep collisions between two
 *   concurrent uploads astronomically unlikely.
 */
export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number = Date.now()
): string {
  // Only treat the trailing segment as an extension when there's a real
  // one — a bare name like "README" has no extension and falls back to
  // "bin" rather than becoming "readme".
  const hasExt = /\.[^.]+$/.test(fileName);
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'bin';
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  return `account-${accountId}/${now}-${safeBase}.${ext}`;
}

export interface UploadAccountMediaResult {
  /** Public URL Meta can fetch at send time. */
  publicUrl: string;
  /** Storage object path (S3 key). */
  path: string;
}

export interface UploadAccountMediaOptions {
  /**
   * Progress callback, 0-100.
   *
   * Worth wiring up wherever a large file is plausible. A 100 MB document
   * with no feedback is indistinguishable from a hung UI, and the usual
   * response to that is to click again — which starts a second upload.
   */
  onProgress?: (percent: number) => void;
  /** Optional key suffix for callers that own their own layout. */
  customPath?: string;
}

/**
 * PUT the file straight to S3 using a presigned URL.
 *
 * Separate from `uploadAccountMedia` so the transport is testable and so
 * the reason for XHR-over-fetch stays next to the code that needs it:
 * `fetch` still cannot report upload progress (only download), and
 * `ReadableStream` request bodies are not usable here.
 */
function putToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    // Must match the type that was signed, byte for byte, or S3 rejects it.
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      // S3 answers with an XML <Error><Message>…</Message></Error>. Surface
      // its wording rather than a bare status: "SignatureDoesNotMatch" and
      // "EntityTooLarge" need completely different fixes.
      const detail = /<Message>([^<]+)<\/Message>/.exec(xhr.responseText)?.[1];
      reject(
        new Error(
          detail
            ? `Upload rejected by storage: ${detail}`
            : `Upload failed (HTTP ${xhr.status}).`
        )
      );
    };
    xhr.onerror = () =>
      reject(new Error('Upload failed — check your connection.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    xhr.send(file);
  });
}

/**
 * Upload a file to S3 and return its public URL.
 *
 * ─── Two hops, on purpose ─────────────────────────────────────────
 *
 *   1. POST /api/storage/presign — the server authenticates, builds the
 *      object key from the SESSION, and signs a URL for exactly this
 *      content type and byte length.
 *   2. PUT straight to S3.
 *
 * The bytes never pass through the app server. The previous single-hop
 * version proxied the whole file through a Next.js route that buffered it
 * in memory twice, which capped real-world uploads at whatever nginx
 * allowed and put a large one within reach of the OOM killer on a 900 MB
 * box.
 *
 * Throws with a user-facing message — callers surface it via a toast.
 * Size validation stays the caller's responsibility because limits differ
 * per feature; `MEDIA_MAX_BYTES` covers the common case and the presign
 * route enforces a hard backstop.
 */
export async function uploadAccountMedia(
  bucket: string,
  file: File,
  options: UploadAccountMediaOptions = {}
): Promise<UploadAccountMediaResult> {
  // S3 requires *a* content type, and an empty string cannot be signed.
  const contentType = file.type || 'application/octet-stream';

  const presignRes = await fetch('/api/storage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder: bucket,
      filename: file.name,
      contentType,
      size: file.size,
      customPath: options.customPath,
    }),
  });

  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error(body.error || 'Could not prepare the upload.');
  }

  const { uploadUrl, publicUrl, key } = await presignRes.json();
  await putToPresignedUrl(uploadUrl, file, contentType, options.onProgress);

  return { publicUrl, path: key };
}

/**
 * Delete a previously-uploaded object via the server-side
 * `/api/storage/delete` route. Used to GC media that was staged
 * (uploaded) but never sent — a cancelled draft or a failed Meta send —
 * so abandoned attachments don't accumulate.
 *
 * Best-effort: callers fire-and-forget and swallow errors (a missed
 * delete is a storage nit, not something to surface to the user).
 */
export async function deleteAccountMedia(
  bucket: string,
  path: string
): Promise<void> {
  const res = await fetch('/api/storage/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: path }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Delete failed');
  }
}
