// ============================================================
// Support-chat attachments — policy and key layout. Pure, no I/O.
//
// Shared by the composer (to reject a file before uploading it) and by
// the presign + send routes (which must never trust the client). Kept
// free of server-only imports for that reason.
//
// ─── WHY THIS IS NOT `MEDIA_MAX_BYTES_BY_KIND` ───────────────
//
// `src/lib/storage/upload-media.ts` sizes its ceilings to Meta's
// WhatsApp Cloud API caps — 5 MB for an image, because that is what Meta
// accepts. Nothing here ever goes to Meta. Reusing those numbers would
// mean a customer's 6 MB screenshot is refused to satisfy a constraint
// that does not apply, and a future Meta change would silently move a
// limit in a feature that has nothing to do with WhatsApp.
//
// ─── WHY THE KEY CARRIES A RANDOM SEGMENT ────────────────────
//
// The bucket is PUBLIC-READ by bucket policy (see the header comment in
// s3-client.ts). Serving support attachments through presigned GETs is
// therefore only half a guarantee on its own: the same object is
// fetchable unsigned at its public URL by anyone who can guess the key,
// and the repo's normal key layout is `account-<id>/<timestamp>-<safe
// filename>.<ext>` — a timestamp and the file's own name, both
// guessable. A 128-bit random segment makes the URL underivable, which
// closes the hole with the bucket policy exactly as it is today. The
// policy should still be narrowed to exclude this prefix; that is a
// console-side change and is documented in the route.
// ============================================================

import type { SupportContentType } from './types';

/** Attachment classes this chat accepts. */
export type SupportAttachmentKind = 'image' | 'document' | 'audio';

/**
 * Images we accept.
 *
 * SVG is deliberately absent. An SVG is an executable document — it can
 * carry <script> and event handlers — and this bucket is public-read and
 * serves back whatever Content-Type was stored, so accepting one would
 * be stored XSS on the bucket's own origin. HEIC is also absent: Safari
 * will upload it happily and every other browser renders nothing, which
 * looks like data loss to the person who sent it.
 */
export const SUPPORT_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Documents we accept.
 *
 * Skewed towards what a customer actually attaches to a support request:
 * a PDF invoice, a spreadsheet of contacts, a CSV that failed to import,
 * a pasted log or JSON payload.
 *
 * `text/html` is deliberately absent for the same reason as SVG. Archives
 * are absent too — we cannot inspect what is inside one, and "send me
 * your zip" is not a support workflow this product needs.
 */
export const SUPPORT_DOCUMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'application/json',
]);

/**
 * Voice notes.
 *
 * `audio/ogg` is what we actually produce: the recorder encodes Opus in
 * the browser via the vendored opus-recorder worker, so there is no
 * server-side transcode step and no ffmpeg dependency. The rest of this
 * list is for robustness, not ambition — a browser labels the same Ogg
 * container as `audio/ogg`, `audio/opus` or `audio/ogg; codecs=opus`
 * depending on who you ask, and Safari's MediaRecorder emits MP4/AAC.
 * Refusing those would mean the recorder works everywhere except the one
 * browser the customer happens to be using.
 */
export const SUPPORT_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set([
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
]);

/**
 * Per-kind byte ceilings.
 *
 * Images are the generous one because the whole point is "here is a
 * screenshot of what I am seeing", and a modern full-window screenshot on
 * a high-DPI display is comfortably several megabytes. Audio is tight by
 * comparison and still ample: Opus at speech bitrates is roughly 1 MB per
 * two minutes, so 10 MB is far more than the five-minute recording cap
 * will ever produce, and the cap is what actually bounds a voice note.
 */
export const SUPPORT_ATTACHMENT_MAX_BYTES: Record<
  SupportAttachmentKind,
  number
> = {
  image: 15 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
};

/** `accept` attributes for the file pickers, derived so they cannot drift. */
export const SUPPORT_ACCEPT_ATTRIBUTE: Record<SupportAttachmentKind, string> = {
  image: [...SUPPORT_IMAGE_MIME_TYPES].join(','),
  document: [...SUPPORT_DOCUMENT_MIME_TYPES].join(','),
  audio: [...SUPPORT_AUDIO_MIME_TYPES].join(','),
};

/**
 * Hard ceiling on one recording, in seconds.
 *
 * The recorder auto-stops here. A forgotten open mic is the realistic
 * failure — not someone deliberately talking for six minutes — and
 * without a stop it would run until the size cap rejected the upload,
 * throwing the whole recording away at the end instead of keeping the
 * first five minutes.
 */
export const SUPPORT_RECORDING_MAX_SECONDS = 5 * 60;

/**
 * Longest caption on an attachment.
 *
 * Much shorter than a standalone message: a caption explains a file, and
 * anything longer than a couple of lines wants to be its own message so
 * it can be quoted and replied to on its own.
 */
export const SUPPORT_CAPTION_MAX = 1024;

/** Which kind a MIME type belongs to, or null if we do not accept it. */
export function classifySupportMime(
  mimeType: string | null | undefined
): SupportAttachmentKind | null {
  if (!mimeType) return null;
  // Browsers append parameters to some types ("text/plain; charset=utf-8").
  // Compare on the bare type or a perfectly ordinary .txt is refused.
  const bare = mimeType.split(';')[0].trim().toLowerCase();
  if (SUPPORT_IMAGE_MIME_TYPES.has(bare)) return 'image';
  if (SUPPORT_DOCUMENT_MIME_TYPES.has(bare)) return 'document';
  if (SUPPORT_AUDIO_MIME_TYPES.has(bare)) return 'audio';
  return null;
}

/** Strip MIME parameters so what we store matches what we allowlisted. */
export function normalizeSupportMime(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** The `content_type` column value for an attachment kind. */
export function supportContentTypeFor(
  kind: SupportAttachmentKind
): SupportContentType {
  return kind;
}

export type SupportAttachmentCheck =
  | { ok: true; kind: SupportAttachmentKind; mimeType: string }
  | { ok: false; error: string };

/**
 * Validate a file's declared type and size.
 *
 * Used by the composer before uploading and by the presign route before
 * signing. The presign route ALSO pins the byte length into the
 * signature, and the send route re-reads the object's real size from S3,
 * so a client that lies here gains nothing.
 */
export function checkSupportAttachment(input: {
  mimeType: string | null | undefined;
  sizeBytes: number;
}): SupportAttachmentCheck {
  const kind = classifySupportMime(input.mimeType);
  if (!kind) {
    return {
      ok: false,
      error: input.mimeType
        ? `${input.mimeType} files are not supported here. Send an image (JPEG, PNG, WebP, GIF), a document (PDF, Word, Excel, PowerPoint, CSV, text, JSON) or a voice note.`
        : 'That file has no recognisable type.',
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'That file appears to be empty.' };
  }

  const max = SUPPORT_ATTACHMENT_MAX_BYTES[kind];
  if (input.sizeBytes > max) {
    return {
      ok: false,
      error: `That file is ${formatSupportBytes(input.sizeBytes)}. The limit for ${
        kind === 'image'
          ? 'an image'
          : kind === 'audio'
            ? 'a voice note'
            : 'a document'
      } is ${formatSupportBytes(max)}.`,
    };
  }

  return {
    ok: true,
    kind,
    mimeType: normalizeSupportMime(input.mimeType as string),
  };
}

/** `948 KB` / `3.4 MB`. Local so this module stays dependency-free. */
export function formatSupportBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Root prefix for every support attachment.
 *
 * Its own prefix, not `chat-media/`, so the bucket policy can be narrowed
 * to exclude exactly this path without touching WhatsApp media — which
 * MUST stay publicly readable, because Meta's servers fetch it unsigned.
 */
export const SUPPORT_MEDIA_PREFIX = 'support-chat';

/** The prefix every object in one conversation lives under. */
export function supportConversationPrefix(conversationId: string): string {
  return `${SUPPORT_MEDIA_PREFIX}/${conversationId}/`;
}

/**
 * Turn an original filename into something safe to put in a key.
 *
 * Note this is for the KEY only. The real filename is stored in
 * `media_filename` and is what the recipient sees and downloads as, so
 * nothing legible is lost by flattening it here.
 */
export function sanitizeSupportFilename(fileName: string): {
  base: string;
  ext: string;
} {
  const hasExt = /\.[^.]+$/.test(fileName);
  const rawExt = hasExt ? (fileName.split('.').pop() as string) : '';
  const ext = rawExt
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 8);
  const base =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  return { base, ext: ext || 'bin' };
}

/**
 * Build the S3 key for one attachment.
 *
 * `support-chat/<conversationId>/<random>-<safe-name>.<ext>`
 *
 * The conversation id makes ownership checkable from the key alone, which
 * is what lets the send route refuse a key belonging to somebody else's
 * thread and lets DELETE be scoped without a database round trip. The
 * random segment is what makes the object's public URL underivable while
 * the bucket remains public-read — see the module header.
 */
export function buildSupportMediaKey(
  conversationId: string,
  fileName: string,
  randomSegment: string = crypto.randomUUID().replace(/-/g, '')
): string {
  const { base, ext } = sanitizeSupportFilename(fileName);
  return `${supportConversationPrefix(conversationId)}${randomSegment}-${base}.${ext}`;
}

/**
 * Does this key belong to this conversation?
 *
 * Checked on every send and delete. Without it, a caller who legitimately
 * obtained a presign for their own thread could attach an object from
 * another tenant's thread — the key is the only thing the send route is
 * told about the file, so it is the only thing that can be verified.
 *
 * Also rejects a nested path: the prefix must be followed by exactly one
 * segment, or `support-chat/<mine>/../<theirs>/x` style trickery becomes
 * a question about how S3 normalises keys, which is not a question worth
 * depending on.
 */
export function isKeyInSupportConversation(
  key: string,
  conversationId: string
): boolean {
  const prefix = supportConversationPrefix(conversationId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  if (!rest || rest.includes('/')) return false;
  if (rest.includes('..')) return false;
  return true;
}
