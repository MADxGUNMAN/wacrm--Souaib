/**
 * Minimal WebP container inspection — enough to tell an ANIMATED sticker
 * from a STATIC one, and nothing more.
 *
 * ─── Why this exists ──────────────────────────────────────────────
 *
 * Meta enforces two different sticker ceilings, and they are five times
 * apart:
 *
 *   static WebP    ≤ 100 KB
 *   animated WebP  ≤ 500 KB
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/sticker-messages/
 *
 * The composer only ever checked the 500 KB figure, so a 250 KB static
 * sticker passed our validation, uploaded to S3, and was then rejected by
 * Meta at send time. That is the worst of the three possible outcomes: an
 * orphan object in the bucket, and an error that surfaces after the agent
 * has already moved on. Which limit applies cannot be guessed from the
 * file name or the MIME type — both are `image/webp` — so the container
 * has to be read.
 *
 * ─── The format, only the part we need ────────────────────────────
 *
 *   offset 0   'RIFF'
 *   offset 4   uint32 little-endian file size
 *   offset 8   'WEBP'
 *   offset 12  first chunk FourCC: 'VP8 ' (lossy) | 'VP8L' (lossless)
 *              | 'VP8X' (extended)
 *
 * Only the EXTENDED form can animate. For 'VP8X' the byte at offset 20 is
 * a flag bitfield, and bit 1 (0x02) is the animation flag. A plain 'VP8 '
 * or 'VP8L' file is therefore always static.
 *
 * https://developers.google.com/speed/webp/docs/riff_container
 *
 * Reading the flag beats searching the bytes for an 'ANMF'/'ANIM' string:
 * those four characters can occur by chance inside compressed image data,
 * which would misclassify a static sticker as animated and let a 400 KB
 * file through.
 */

/** Bit 1 of the VP8X flags byte. */
const VP8X_ANIMATION_FLAG = 0x02;

/** Bytes needed to reach the VP8X flags byte at offset 20. */
export const WEBP_HEADER_BYTES = 21;

export interface WebPInfo {
  /** False when the bytes are not a WebP container at all. */
  isWebP: boolean;
  /** True only for an extended WebP with the animation flag set. */
  isAnimated: boolean;
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

/**
 * Inspect the leading bytes of a file. Pure, so it can be unit-tested
 * against hand-built headers without touching the filesystem.
 *
 * A truncated buffer is reported as `isWebP: false` rather than throwing —
 * the caller's job is to reject it with a readable message, not to crash.
 */
export function inspectWebP(buffer: ArrayBuffer | Uint8Array): WebPInfo {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (bytes.length < 16) return { isWebP: false, isAnimated: false };
  if (fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') {
    return { isWebP: false, isAnimated: false };
  }

  // 'VP8 ' and 'VP8L' cannot animate, so there is no flags byte to read.
  if (fourCC(bytes, 12) !== 'VP8X') {
    return { isWebP: true, isAnimated: false };
  }

  // Extended header present but cut off before the flags byte. Treat as
  // static: the stricter 100 KB limit is the safe assumption, because
  // guessing "animated" would wave a 400 KB file through to Meta.
  if (bytes.length < WEBP_HEADER_BYTES) {
    return { isWebP: true, isAnimated: false };
  }

  return {
    isWebP: true,
    isAnimated: (bytes[20] & VP8X_ANIMATION_FLAG) !== 0,
  };
}

/**
 * Browser-side convenience wrapper. Slices only the header rather than
 * reading the whole file, so picking a 500 KB sticker does not pull half a
 * megabyte through an ArrayBuffer just to look at one byte.
 */
export async function inspectWebPFile(file: File): Promise<WebPInfo> {
  const head = await file.slice(0, WEBP_HEADER_BYTES).arrayBuffer();
  return inspectWebP(head);
}
