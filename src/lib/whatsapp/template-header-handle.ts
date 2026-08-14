import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create or edit a template with a MEDIA header — image, video
 * or document. A plain public URL is not accepted at creation time.
 * This helper turns the template's `header_media_url` (whether the user
 * uploaded a file or pasted a link) into a handle and writes it onto the
 * payload.
 *
 * This used to handle images only, which meant video and document
 * headers fell through to `example.header_url` and Meta rejected them at
 * creation — the template appeared to submit and then failed, with the
 * error surfacing as a generic Meta message. All three formats now take
 * the same path.
 *
 * No-op unless the header is a media format that has a URL but no
 * handle yet.
 */

/**
 * Per-format sample limits and accepted MIME types.
 *
 * These mirror Meta's media limits for the corresponding message type.
 * Video is deliberately narrow: Meta accepts MP4 and 3GPP for video
 * headers, and MP4 must use H.264 video with AAC audio — we can't verify
 * the codec from the content type alone, so a wrong codec still fails at
 * Meta with its own message rather than ours.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
const MEDIA_RULES = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    types: ['image/jpeg', 'image/png'],
    label: 'JPEG or PNG',
    fallbackType: 'image/jpeg',
    extensions: { 'image/jpeg': 'jpg', 'image/png': 'png' } as Record<string, string>,
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    types: ['video/mp4', 'video/3gpp'],
    label: 'MP4 or 3GPP',
    fallbackType: 'video/mp4',
    extensions: { 'video/mp4': 'mp4', 'video/3gpp': '3gp' } as Record<string, string>,
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    types: ['application/pdf'],
    label: 'PDF',
    fallbackType: 'application/pdf',
    extensions: { 'application/pdf': 'pdf' } as Record<string, string>,
  },
} as const

type MediaHeaderType = keyof typeof MEDIA_RULES

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return value === 'image' || value === 'video' || value === 'document'
}

/**
 * The Meta App ID, under either of the two names this project has used.
 *
 * ─── Why both ─────────────────────────────────────────────────────
 *
 * `embedded-signup` reads `NEXT_PUBLIC_META_APP_ID` (it has to — the value
 * is used in the browser), while this module was written against a
 * server-only `META_APP_ID`. Nobody sets both, so media-header templates
 * failed with "need META_APP_ID set" on an environment that was, as far as
 * the operator could tell, fully configured — the app ID was right there
 * in the same file under the other name.
 *
 * There is no security reason for two: an App ID is public by definition
 * (it ships in the browser bundle and appears in Meta's own embedded
 * signup URL). The App SECRET is the sensitive half and stays server-only.
 *
 * `META_APP_ID` is still honoured first so an environment that sets it
 * deliberately keeps working.
 */
function resolveMetaAppId(): string | undefined {
  const value =
    process.env.META_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim()
  return value || undefined
}

export async function ensureMediaHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  if (!isMediaHeaderType(payload.header_type)) return
  if (payload.header_handle) return // already have one
  if (!payload.header_media_url) return // validator already requires url-or-handle

  const rules = MEDIA_RULES[payload.header_type]

  const appId = resolveMetaAppId()
  if (!appId) {
    throw new Error(
      `${payload.header_type} header templates need your Meta App ID (used for Meta’s Resumable Upload). Set NEXT_PUBLIC_META_APP_ID in your environment, or remove the ${payload.header_type} header.`,
    )
  }

  // Fetch the sample bytes (works for our uploaded chat-media URL and
  // for a manually-pasted public link).
  let res: Response
  try {
    res = await fetch(payload.header_media_url)
  } catch {
    throw new Error(
      `Could not fetch the header ${payload.header_type} URL. Make sure it is publicly reachable.`,
    )
  }
  if (!res.ok) {
    throw new Error(
      `Header ${payload.header_type} URL returned ${res.status}. It must be publicly reachable.`,
    )
  }

  const contentType = (res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  // An absent content type is tolerated — plenty of static hosts omit
  // it — but a present-and-wrong one is a real mismatch worth catching
  // before Meta does.
  if (contentType && !(rules.types as readonly string[]).includes(contentType)) {
    throw new Error(
      `Header ${payload.header_type} must be ${rules.label} (got ${contentType}).`,
    )
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error(`Header ${payload.header_type} is empty.`)
  }
  if (bytes.byteLength > rules.maxBytes) {
    throw new Error(
      `Header ${payload.header_type} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — Meta's limit is ${rules.maxBytes / 1024 / 1024} MB.`,
    )
  }

  const mimeType = (rules.types as readonly string[]).includes(contentType)
    ? contentType
    : rules.fallbackType
  const fileName = `header.${rules.extensions[mimeType] ?? 'bin'}`

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}

/**
 * Derive a Resumable Upload handle for every carousel card header.
 *
 * Each card is its own media asset, so a 10-card carousel means 10
 * uploads. They run SEQUENTIALLY rather than in parallel: Meta rate-limits
 * template operations, and ten simultaneous uploads on a slow connection
 * is a reliable way to get throttled mid-way and leave the operator with
 * a half-uploaded carousel and no clear error.
 *
 * Errors name the card, because "upload failed" on a 10-card carousel is
 * not an actionable message.
 */
export async function ensureCarouselCardHandles(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  const cards = payload.cards
  if (!cards || cards.length === 0) return

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    if (card.header_handle) continue
    if (!card.header_media_url) continue // validator already required one

    // Reuse the single-header path by handing it a shim with just the
    // fields it reads, so the MIME and size rules stay in one place.
    const shim: TemplatePayload = {
      name: payload.name,
      category: payload.category,
      language: payload.language,
      body_text: payload.body_text,
      header_type: card.header_format,
      header_media_url: card.header_media_url,
    }

    try {
      await ensureMediaHeaderHandle(shim, accessToken)
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'upload failed'
      throw new Error(`Card ${i + 1}: ${detail}`)
    }

    card.header_handle = shim.header_handle
  }
}
