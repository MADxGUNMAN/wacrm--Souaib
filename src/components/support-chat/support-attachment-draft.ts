'use client';

// ============================================================
// Staging an attachment: presign, PUT to S3, and clean up after a draft
// the user abandons.
//
// Split out of the composer so the transport is readable on its own and
// so the reason for XHR-over-fetch stays next to the code that needs it.
// ============================================================

import {
  checkSupportAttachment,
  type SupportAttachmentKind,
} from '@/lib/support-chat/attachments';

export interface SupportStagedAttachment {
  kind: SupportAttachmentKind;
  /** S3 object key — what the send route is given. */
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Local object URL for the image preview in the composer.
   *
   * Deliberately the LOCAL file rather than a presigned GET of what was
   * just uploaded: the bytes are already in the browser, so a round trip
   * to sign a URL for a file the user is looking at would be pure
   * latency. Must be revoked by the caller.
   */
  previewUrl: string | null;
}

/**
 * PUT the file to a presigned URL.
 *
 * `fetch` still cannot report upload progress (only download), and a
 * support attachment can be 25 MB — with no feedback that is
 * indistinguishable from a hung UI, and the usual response to that is to
 * click again, which starts a second upload.
 */
function putToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    // Must match the signed type byte for byte or S3 rejects the PUT.
    xhr.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      // S3 answers with <Error><Message>…</Message></Error>. Surface its
      // wording: "SignatureDoesNotMatch" and "EntityTooLarge" need
      // completely different fixes.
      const detail = /<Message>([^<]+)<\/Message>/.exec(xhr.responseText)?.[1];
      reject(
        new Error(
          detail
            ? `Upload rejected by storage: ${detail}`
            : `Upload failed (HTTP ${xhr.status}).`
        )
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error('Upload failed — check your connection.'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error('Upload cancelled.'));
    };

    xhr.send(file);
  });
}

/**
 * Validate, presign, and upload one file.
 *
 * Throws with a user-facing message; the caller surfaces it via a toast.
 * The file's bytes never touch the app server.
 */
export async function stageSupportAttachment(params: {
  file: File;
  /** Only sent when the caller is an operator. */
  accountId?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<SupportStagedAttachment> {
  const { file, accountId, onProgress, signal } = params;

  // Checked here purely so the user hears about a 40 MB PDF before
  // waiting on a round trip. The presign route re-checks, and the send
  // route re-reads the object's real size and type from S3.
  const checked = checkSupportAttachment({
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!checked.ok) throw new Error(checked.error);

  const presignRes = await fetch('/api/support-chat/attachment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(accountId ? { accountId } : {}),
      filename: file.name,
      mimeType: checked.mimeType,
      sizeBytes: file.size,
    }),
  });

  const presign = (await presignRes.json().catch(() => ({}))) as {
    uploadUrl?: string;
    key?: string;
    error?: string;
  };
  if (!presignRes.ok || !presign.uploadUrl || !presign.key) {
    throw new Error(presign.error ?? 'Could not prepare the upload.');
  }

  await putToPresignedUrl(
    presign.uploadUrl,
    file,
    checked.mimeType,
    onProgress,
    signal
  );

  return {
    kind: checked.kind,
    key: presign.key,
    filename: file.name,
    mimeType: checked.mimeType,
    sizeBytes: file.size,
    // Images AND audio get one: an image needs a thumbnail, and a voice
    // note needs to be playable before it is sent — it is the one
    // attachment you cannot check by looking at it, and "send and hope" is
    // how a garbled recording reaches support. A document gets none, since
    // there is nothing useful to render from a PDF in a composer strip.
    previewUrl: checked.kind === 'document' ? null : URL.createObjectURL(file),
  };
}

/**
 * Best-effort removal of an object that was uploaded but never sent.
 *
 * Fire-and-forget: an orphaned object is a storage nit, not something to
 * interrupt the user with. Goes through the support-chat route rather than
 * `/api/storage/delete`, which accepts any key from any signed-in user
 * with no prefix check.
 */
export function discardSupportAttachment(
  key: string,
  accountId?: string
): void {
  void fetch('/api/support-chat/attachment', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...(accountId ? { accountId } : {}) }),
  }).catch(() => {});
}
