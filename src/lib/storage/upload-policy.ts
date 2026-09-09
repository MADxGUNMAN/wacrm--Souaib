/**
 * Server-side upload policy — which prefixes exist, which are tenant
 * scoped, and how big a file may be. Pure, so it can be reasoned about
 * (and tested) without S3 or a request.
 *
 * ─── Why an allowlist ─────────────────────────────────────────────
 *
 * The original `/api/storage/upload` took whatever `folder` string the
 * browser sent and pasted it into the object key. That is two problems in
 * one: any caller could invent new top-level prefixes in the bucket (so
 * the lifecycle rules written against known prefixes would silently not
 * apply to them), and a `folder` containing `..` was a path-traversal
 * attempt with nothing standing in its way.
 *
 * Enumerating the prefixes means an unknown one is a 400 instead of a new
 * folder, and it documents what the bucket is supposed to contain.
 */

import {
  TEMPLATE_REVIEW_MEDIA_FOLDER,
  TEMPLATE_SEND_MEDIA_FOLDER,
} from './media-folders';

/** Every prefix the browser is allowed to request an upload into. */
export const ALLOWED_UPLOAD_FOLDERS = new Set<string>([
  'chat-media',
  'flow-media',
  'avatars',
  'public-assets',
  'public-assets/landing-sections',
  'landing-assets',
  TEMPLATE_REVIEW_MEDIA_FOLDER,
  TEMPLATE_SEND_MEDIA_FOLDER,
]);

/**
 * Prefixes where `account-<id>/` is injected from the SESSION.
 *
 * Never accept a tenant id from the browser: one edited request and
 * account A writes into account B's folder.
 */
export const ACCOUNT_SCOPED_FOLDERS = new Set<string>([
  'chat-media',
  'flow-media',
  TEMPLATE_REVIEW_MEDIA_FOLDER,
  TEMPLATE_SEND_MEDIA_FOLDER,
]);

/**
 * Hard server-side ceiling, matching the largest thing Meta accepts (a
 * 100 MB document).
 *
 * The browser already checks a tighter, per-format limit before asking for
 * a URL. This is the backstop for a caller that skips the UI, and it is
 * what the presigned URL's signed content-length is derived from — so it
 * is a real limit, not a hint.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Reject a customPath that could escape its prefix.
 *
 * Callers use this for paths they build themselves (avatars are
 * `<user_id>/avatar-<ts>.<ext>`). Anything with a traversal segment, an
 * absolute root, a backslash, or a NUL is refused rather than sanitised:
 * quietly rewriting a hostile path hides the attempt, and a caller with a
 * legitimate path is never affected.
 */
const SAFE_CUSTOM_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,180}$/;

export function isSafeCustomPath(path: string): boolean {
  if (!SAFE_CUSTOM_PATH.test(path)) return false;
  if (path.includes('..')) return false;
  if (path.includes('//')) return false;
  if (path.endsWith('/')) return false;
  return true;
}

export interface UploadRequestProblem {
  status: 400 | 413;
  error: string;
}

/**
 * Validate the metadata a client sends when asking for an upload URL.
 * Returns `null` when the request is acceptable.
 *
 * Size is checked here from the DECLARED value, and then pinned into the
 * signature by the caller, so a client that lies about it gets a URL it
 * cannot actually use.
 */
export function validateUploadRequest(input: {
  folder: unknown;
  contentType: unknown;
  size: unknown;
  customPath?: unknown;
}): UploadRequestProblem | null {
  const { folder, contentType, size, customPath } = input;

  if (typeof folder !== 'string' || !ALLOWED_UPLOAD_FOLDERS.has(folder)) {
    return { status: 400, error: 'Unsupported upload folder.' };
  }
  if (
    typeof contentType !== 'string' ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)
  ) {
    return { status: 400, error: 'A valid contentType is required.' };
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return { status: 400, error: 'A file size greater than zero is required.' };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      status: 413,
      error: `That file is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB maximum.`,
    };
  }
  if (
    customPath !== undefined &&
    customPath !== null &&
    (typeof customPath !== 'string' || !isSafeCustomPath(customPath))
  ) {
    return { status: 400, error: 'Invalid upload path.' };
  }

  return null;
}
