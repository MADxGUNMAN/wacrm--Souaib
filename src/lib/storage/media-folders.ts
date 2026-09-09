/**
 * S3 folder layout for template media — pure constants, no I/O.
 *
 * ─── Why two folders and not one ──────────────────────────────────
 *
 * Template media has two completely different lifecycles, and mixing them
 * in one prefix makes both impossible to manage:
 *
 *   REVIEW SAMPLE — the file Meta downloads while approving a template.
 *     One per template, uploaded once, and it must stay reachable until
 *     the template is approved. After approval it is dead weight, but it
 *     is also the only record of what was submitted.
 *
 *   SEND MEDIA — the image/video/document actually delivered to a
 *     customer when the template is sent. Many per template, one per
 *     send or per campaign, and each is referenced by a real message in
 *     someone's chat history, so it can never be cleaned up on a
 *     schedule the way a review sample can.
 *
 * Separate prefixes mean "delete review samples for approved templates
 * older than N days" is a one-line lifecycle rule that cannot possibly
 * touch a file a customer can still open in WhatsApp.
 *
 * ─── Why the account subfolder is added server-side ───────────────
 *
 * The final key is `<folder>/account-<account_id>/<timestamp>-<name>.<ext>`,
 * and the `account-<id>` segment is inserted by `/api/storage/presign` from
 * the caller's session — never sent by the browser. A client-supplied
 * tenant id in a storage path is a directory-traversal invitation: one
 * edited request and account A writes into account B's folder.
 */

/** Review samples Meta downloads during template approval. */
export const TEMPLATE_REVIEW_MEDIA_FOLDER = 'template-review-media';

/** Media actually sent to customers when a template goes out. */
export const TEMPLATE_SEND_MEDIA_FOLDER = 'template-send-media';

/**
 * Which folder a given media purpose belongs in.
 *
 * A named union rather than raw strings at the call sites, so a typo is a
 * type error instead of a new top-level folder appearing in the bucket.
 */
export type TemplateMediaPurpose = 'review' | 'send';

export function templateMediaFolder(purpose: TemplateMediaPurpose): string {
  return purpose === 'review'
    ? TEMPLATE_REVIEW_MEDIA_FOLDER
    : TEMPLATE_SEND_MEDIA_FOLDER;
}

/** The three media header formats Meta supports on a template. */
export type TemplateMediaKind = 'image' | 'video' | 'document';

/**
 * Per-format limits, mirroring Meta's caps for the matching message type.
 *
 * Enforced in the browser BEFORE upload. Without this a rejected file
 * still lands in S3 first and is then refused by Meta, leaving an orphan
 * object and an error that arrives long after the user chose the file.
 *
 * `accept` is deliberately narrower than what the bucket would take:
 * these are exactly the types Meta accepts for a template header, so the
 * file picker cannot offer a file that is guaranteed to fail.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export const TEMPLATE_MEDIA_RULES: Record<
  TemplateMediaKind,
  {
    accept: string;
    maxBytes: number;
    /** Shown in the picker hint, e.g. "JPEG or PNG, up to 5 MB". */
    label: string;
  }
> = {
  image: {
    accept: 'image/jpeg,image/png',
    maxBytes: 5 * 1024 * 1024,
    label: 'JPEG or PNG, up to 5 MB',
  },
  video: {
    accept: 'video/mp4,video/3gpp',
    maxBytes: 16 * 1024 * 1024,
    label: 'MP4 or 3GPP, up to 16 MB',
  },
  document: {
    accept: 'application/pdf',
    maxBytes: 100 * 1024 * 1024,
    label: 'PDF, up to 100 MB',
  },
};

/** Human-readable size, for error messages that name the actual problem. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
