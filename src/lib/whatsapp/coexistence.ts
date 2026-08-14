/**
 * WhatsApp Coexistence — webhook payload parsing.
 *
 * Coexistence lets ONE number run on the WhatsApp Business App (on a
 * phone) and the Cloud API (this CRM) at the same time. Meta keeps the
 * two in sync, but only one direction needs code from us:
 *
 *   CRM  → phone : Meta does it. Messages we send through the API show
 *                  up in the app automatically. Nothing to build.
 *   phone → CRM  : Meta sends an `smb_message_echoes` webhook. That is
 *                  what this module parses.
 *
 * ─── Why these payloads need their own parser ─────────────────────
 *
 * An echo is NOT shaped like an inbound message. The differences are
 * exactly the ones that break naive handling:
 *
 *   field:  'smb_message_echoes'   not  'messages'
 *   array:  value.message_echoes   not  value.messages
 *   there is NO `contacts[]` array at all
 *   `from` is the BUSINESS's number and `to` is the customer's —
 *   the opposite way round from an inbound message
 *
 * That last point is the dangerous one. Reusing the inbound path would
 * resolve the contact from `from`, i.e. create a contact for the
 * business's own number, open a conversation with itself, and then run
 * every "a customer just spoke" side effect against it — including an
 * AI auto-reply to the business's own message.
 *
 * ─── PURE MODULE ──────────────────────────────────────────────────
 *
 * No database, no network, no Supabase import. Every function here maps
 * an untrusted webhook object to a typed result or null. That is
 * deliberate: coexistence needs a real Business App number to produce
 * live payloads, so being able to unit-test the parsing against
 * captured fixtures is the only way to have confidence before one
 * exists.
 *
 * Payload shapes are taken from Meta's published coexistence webhook
 * reference as mirrored by BSP documentation (360dialog, Gupshup), which
 * agree field-for-field. Every field is treated as optional and
 * validated, because a webhook is untrusted input.
 */

/** Fields Meta delivers only for coexistence numbers. */
const COEXISTENCE_WEBHOOK_FIELDS = new Set([
  // A message the business sent from the WhatsApp Business App.
  'smb_message_echoes',
  // The phone's address book. Phase 2.
  'smb_app_state_sync',
  // Backfill of up to ~6 months of past chats. Phase 2.
  'history',
])

export function isCoexistenceWebhookField(field: string): boolean {
  return COEXISTENCE_WEBHOOK_FIELDS.has(field)
}

/**
 * Account-lifecycle field. NOT coexistence-only — Meta uses
 * `account_update` for several things — but it is how a broken
 * coexistence pairing is reported, which is the only reason we handle it
 * now.
 */
export function isAccountUpdateField(field: string): boolean {
  return field === 'account_update'
}

// ============================================================
// smb_message_echoes
// ============================================================

/**
 * One message the business sent from their phone.
 *
 * Content is carried the same way an inbound message carries it — a
 * property named after `type` — so the existing content parser can be
 * reused rather than duplicated.
 */
export interface MessageEcho {
  /** wamid. Also the dedupe key against a message the CRM itself sent. */
  id: string
  /** The BUSINESS's own number. Never use this to resolve the contact. */
  from: string
  /** The CUSTOMER's number. THIS is the contact. */
  to: string
  /** Unix seconds, as a string, exactly as Meta sends it. */
  timestamp: string
  type: string
  [key: string]: unknown
}

export interface ParsedEchoBatch {
  phoneNumberId: string
  displayPhoneNumber: string | null
  echoes: MessageEcho[]
}

interface RawEchoValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  message_echoes?: unknown
}

/**
 * Parse an `smb_message_echoes` change value.
 *
 * Returns null when the payload cannot be trusted — no phone_number_id
 * (so tenancy is unresolvable) or no usable echoes. Individual malformed
 * echoes are dropped rather than failing the batch, so one bad entry in
 * a group of five does not lose the other four.
 *
 * An echo missing `to` is DROPPED, not defaulted. `to` is the only thing
 * identifying which customer the message went to; guessing would file
 * the message under the wrong conversation, which is worse than not
 * showing it.
 */
export function parseMessageEchoes(value: unknown): ParsedEchoBatch | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as RawEchoValue

  const phoneNumberId = raw.metadata?.phone_number_id
  if (!phoneNumberId) return null

  if (!Array.isArray(raw.message_echoes)) return null

  const echoes: MessageEcho[] = []
  for (const entry of raw.message_echoes) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (
      typeof e.id !== 'string' ||
      typeof e.from !== 'string' ||
      typeof e.to !== 'string' ||
      typeof e.type !== 'string'
    ) {
      continue
    }
    echoes.push({
      ...e,
      id: e.id,
      from: e.from,
      to: e.to,
      // Meta sends Unix seconds as a string. Missing timestamps fall back
      // to "now" at insert time rather than being dropped — the message
      // being visible matters more than the second it was typed.
      timestamp: typeof e.timestamp === 'string' ? e.timestamp : '',
      type: e.type,
    })
  }

  if (echoes.length === 0) return null

  return {
    phoneNumberId,
    displayPhoneNumber: raw.metadata?.display_phone_number ?? null,
    echoes,
  }
}

// ============================================================
// account_update — the pairing broke
// ============================================================

/**
 * Reasons Meta gives for removing a coexistence pairing, with what the
 * operator can actually DO about each.
 *
 * This mapping exists because Meta reports all of them as the same event
 * with the cause buried in a code. Storing "disconnected" and showing a
 * generic error would hide the fact that most of these are a two-minute
 * fix — and "open WhatsApp on your phone" is not something anyone
 * guesses.
 */
export const DISCONNECT_REASON_HELP: Record<string, string> = {
  PRIMARY_INACTIVITY:
    'The WhatsApp Business App was not opened for about 13 days, so Meta dropped the connection. Open the app on your phone, then reconnect here.',
  COMPANION_INACTIVITY:
    'The linked companion device was idle for about 30 days. Open WhatsApp Business on your phone, then reconnect here.',
  USER_RE_REGISTERED:
    'WhatsApp was re-registered on a new device, which invalidates the pairing. Reconnect to pair the new device.',
  CHANGE_NUMBER:
    'The phone number was changed. The pairing was tied to the old number, so this connection has to be set up again from scratch.',
  BUSINESS_DOWNGRADE:
    'This number was registered on the ordinary WhatsApp app. A number cannot be on consumer WhatsApp and the Business Platform at once — reinstall WhatsApp Business to restore it.',
  ACCOUNT_DISCONNECTED:
    'The WhatsApp account was disconnected, either by deleting it or by a Meta enforcement action. Check WhatsApp Manager for any policy notice.',
}

export interface ParsedAccountUpdate {
  /** PARTNER_REMOVED, PARTNER_APP_UNINSTALLED, ... — verbatim. */
  event: string
  /** disconnection_info.reason, verbatim. Null when Meta sent none. */
  reason: string | null
  /** USER or SYSTEM. Null when absent. */
  initiatedBy: string | null
  wabaId: string | null
  /** The number, when Meta included it — older payloads use this shape. */
  phoneNumber: string | null
  /** True when this event means the number can no longer send or receive. */
  isDisconnect: boolean
}

interface RawAccountUpdateValue {
  event?: unknown
  phone_number?: unknown
  waba_info?: { waba_id?: unknown; owner_business_id?: unknown }
  disconnection_info?: { reason?: unknown; initiated_by?: unknown }
}

/**
 * Events that mean the connection is dead, as opposed to informational.
 *
 * Deliberately a small allow-list rather than "anything unrecognised is
 * a disconnect". `account_update` is a general-purpose field — it also
 * carries verification and review updates — and treating an unknown
 * event as a disconnect would take a working number offline in the UI
 * because Meta shipped a new notification type.
 */
const DISCONNECT_EVENTS = new Set([
  'PARTNER_REMOVED',
  'PARTNER_APP_UNINSTALLED',
])

/**
 * Parse an `account_update` change value.
 *
 * Returns null when there is no `event` string to act on.
 */
export function parseAccountUpdate(value: unknown): ParsedAccountUpdate | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as RawAccountUpdateValue

  if (typeof raw.event !== 'string' || raw.event === '') return null

  const reason =
    typeof raw.disconnection_info?.reason === 'string'
      ? raw.disconnection_info.reason
      : null

  return {
    event: raw.event,
    reason,
    initiatedBy:
      typeof raw.disconnection_info?.initiated_by === 'string'
        ? raw.disconnection_info.initiated_by
        : null,
    wabaId:
      typeof raw.waba_info?.waba_id === 'string' ? raw.waba_info.waba_id : null,
    phoneNumber:
      typeof raw.phone_number === 'string' ? raw.phone_number : null,
    isDisconnect: DISCONNECT_EVENTS.has(raw.event),
  }
}

/**
 * Operator-facing explanation for a disconnect, falling back to
 * something honest when Meta sends a reason we have never seen.
 */
export function disconnectHelpText(
  event: string,
  reason: string | null,
): string {
  if (reason && DISCONNECT_REASON_HELP[reason]) {
    return DISCONNECT_REASON_HELP[reason]
  }
  if (event === 'PARTNER_APP_UNINSTALLED') {
    return 'This number was disconnected from the WhatsApp Business App, under Settings → Account → Business Platform. Reconnect here to restore it.'
  }
  // Naming the raw code is more useful than "an error occurred" — it is
  // searchable, and support can act on it.
  return reason
    ? `Meta disconnected this number (${reason}). Check WhatsApp Manager, then reconnect here.`
    : 'Meta disconnected this number. Check WhatsApp Manager, then reconnect here.'
}

// ============================================================
// edit / revoke
//
// These arrive on the ORDINARY `messages` field, not a coexistence one,
// but coexistence is what makes them common: editing and deleting are
// everyday things to do on a phone. They live here because they share
// the "changes a message that already exists" shape, which nothing else
// in the inbound path has.
// ============================================================

export interface ParsedEdit {
  /** wamid of the message being corrected. */
  originalMessageId: string
  /** The wamid of the edit event itself, for logging. */
  editMessageId: string
  /** The replacement content, in the same shape an inbound message uses. */
  newMessage: Record<string, unknown>
  /** Type of the replacement content — 'text', 'image', ... */
  newType: string
}

/**
 * Parse a `type: 'edit'` inbound message.
 *
 * Returns null unless the original id AND replacement content are both
 * present. A partial edit is dropped: leaving the old text in place is
 * correct-but-stale, whereas guessing produces a message the customer
 * never sent.
 */
export function parseEdit(message: unknown): ParsedEdit | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>
  if (m.type !== 'edit') return null

  const edit = m.edit as
    | { original_message_id?: unknown; message?: unknown }
    | undefined
  if (!edit || typeof edit.original_message_id !== 'string') return null

  const newMessage = edit.message
  if (!newMessage || typeof newMessage !== 'object') return null

  const inner = newMessage as Record<string, unknown>
  const newType = typeof inner.type === 'string' ? inner.type : null
  if (!newType) return null

  return {
    originalMessageId: edit.original_message_id,
    editMessageId: typeof m.id === 'string' ? m.id : '',
    newMessage: inner,
    newType,
  }
}

export interface ParsedRevoke {
  /** wamid of the message that was deleted for everyone. */
  originalMessageId: string
  revokeMessageId: string
}

/** Parse a `type: 'revoke'` inbound message — "delete for everyone". */
export function parseRevoke(message: unknown): ParsedRevoke | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>
  if (m.type !== 'revoke') return null

  const revoke = m.revoke as { original_message_id?: unknown } | undefined
  if (!revoke || typeof revoke.original_message_id !== 'string') return null

  return {
    originalMessageId: revoke.original_message_id,
    revokeMessageId: typeof m.id === 'string' ? m.id : '',
  }
}

/**
 * Is this inbound message one that MODIFIES an existing message rather
 * than adding a new one?
 *
 * Used by the webhook to divert before the normal insert path. Without
 * this both types fall through the content-type mapping to 'text' and
 * land as new rows — so an edit shows the conversation twice and a
 * delete adds an empty bubble.
 */
export function isMessageMutation(type: string): boolean {
  return type === 'edit' || type === 'revoke'
}

// ============================================================
// history — the ~6 month chat backfill
//
// Delivered in CHUNKS, not one payload. Each chunk carries a phase
// (0 = day 0–1, 1 = day 1–90, 2 = day 90–180), a `chunk_order` for
// sequencing, and Meta's own `progress` percentage.
//
// It can also arrive as a refusal: the business is asked on their phone
// whether to share history at all, and saying no comes back as an ERROR
// inside the history array rather than as zero messages. That distinction
// matters — "declined" is a finished state with nothing to retry, while
// "failed" might be worth another go.
// ============================================================

/**
 * Meta's code for "the business turned history sharing off".
 *
 * Special-cased because it is the one error here that is not a fault.
 * Reported as a failure it would send an operator hunting for a problem
 * that does not exist, and would put a Retry button on a screen where
 * retrying cannot help.
 */
export const HISTORY_DECLINED_ERROR_CODE = 2593109

export interface HistoryMessage {
  id: string
  /** Sender's number — business or customer. */
  from: string
  /**
   * True when the BUSINESS sent it. Taken from
   * `history_context.from_me`, which is absent (not false) on customer
   * messages — so this is derived, never read directly as a boolean.
   */
  fromMe: boolean
  /** Meta's historical delivery state, upper-cased. */
  historyStatus: string | null
  timestamp: string
  type: string
  /**
   * Meta sends `media_placeholder` for a media message whose asset it is
   * not shipping in this chunk. A second webhook MAY follow with the real
   * content, but only for messages from the last two weeks — so older
   * media never arrives at all and must be stored as a placeholder rather
   * than waited for.
   */
  isMediaPlaceholder: boolean
  /** True for `type: 'errors'` entries — a message Meta could not export. */
  isUnsupported: boolean
  [key: string]: unknown
}

export interface HistoryThread {
  /** The customer's phone number — the thread key. */
  customerPhone: string
  messages: HistoryMessage[]
}

export interface HistoryError {
  code: number | null
  title: string | null
  message: string | null
  /** True when this is the business declining to share history. */
  isDeclined: boolean
}

export interface HistoryChunk {
  phase: number
  chunkOrder: number | null
  /** Meta's percentage, 0–100. Clamped, never computed locally. */
  progress: number
  threads: HistoryThread[]
  /** Non-null when Meta reported a problem instead of messages. */
  error: HistoryError | null
}

export interface ParsedHistory {
  phoneNumberId: string
  displayPhoneNumber: string | null
  chunks: HistoryChunk[]
}

interface RawHistoryValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  history?: unknown
}

function parseHistoryError(raw: unknown): HistoryError | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const first = raw[0]
  if (!first || typeof first !== 'object') return null
  const e = first as Record<string, unknown>
  const code = typeof e.code === 'number' ? e.code : null
  return {
    code,
    title: typeof e.title === 'string' ? e.title : null,
    message: typeof e.message === 'string' ? e.message : null,
    isDeclined: code === HISTORY_DECLINED_ERROR_CODE,
  }
}

function parseHistoryMessages(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryMessage[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const m = entry as Record<string, unknown>
    // An id is mandatory: it is the dedupe key. Without it the same
    // message could be stored on every re-sync.
    if (typeof m.id !== 'string' || typeof m.type !== 'string') continue

    const ctx = (m.history_context ?? {}) as Record<string, unknown>

    out.push({
      ...m,
      id: m.id,
      from: typeof m.from === 'string' ? m.from : '',
      // `from_me` is only PRESENT on business messages — it is not sent as
      // false for customer ones. So absence means "the customer sent it",
      // and this must be a truthiness check rather than a comparison.
      fromMe: ctx.from_me === true,
      historyStatus:
        typeof ctx.status === 'string' ? ctx.status.toUpperCase() : null,
      timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
      type: m.type,
      isMediaPlaceholder: m.type === 'media_placeholder',
      isUnsupported: m.type === 'errors' || Array.isArray(m.errors),
    })
  }
  return out
}

/**
 * Parse a `history` change value into ordered chunks.
 *
 * Returns null only when tenancy cannot be resolved. A chunk that carries
 * an error is still RETURNED (with `error` set) rather than dropped —
 * that is how the caller learns the business declined.
 */
export function parseHistory(value: unknown): ParsedHistory | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as RawHistoryValue

  const phoneNumberId = raw.metadata?.phone_number_id
  if (!phoneNumberId) return null
  if (!Array.isArray(raw.history)) return null

  const chunks: HistoryChunk[] = []
  for (const entry of raw.history) {
    if (!entry || typeof entry !== 'object') continue
    const c = entry as Record<string, unknown>
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    const error = parseHistoryError(c.errors)

    const threads: HistoryThread[] = []
    if (Array.isArray(c.threads)) {
      for (const t of c.threads) {
        if (!t || typeof t !== 'object') continue
        const thread = t as Record<string, unknown>
        // The thread id IS the customer's number. Without it there is no
        // way to know whose conversation these messages belong to.
        if (typeof thread.id !== 'string' || thread.id === '') continue
        threads.push({
          customerPhone: thread.id,
          messages: parseHistoryMessages(thread.messages),
        })
      }
    }

    // A chunk with neither threads nor an error carries no information;
    // skip it rather than recording a phantom import step.
    if (threads.length === 0 && !error) continue

    const rawProgress = typeof meta.progress === 'number' ? meta.progress : 0
    chunks.push({
      phase: typeof meta.phase === 'number' ? meta.phase : 0,
      chunkOrder: typeof meta.chunk_order === 'number' ? meta.chunk_order : null,
      // Clamped because the column has a 0–100 CHECK and a nonsense value
      // from Meta should not fail the whole insert.
      progress: Math.max(0, Math.min(100, Math.round(rawProgress))),
      threads,
      error,
    })
  }

  if (chunks.length === 0) return null

  return {
    phoneNumberId,
    displayPhoneNumber: raw.metadata?.display_phone_number ?? null,
    chunks,
  }
}

/**
 * Map Meta's historical delivery state onto `messages.status`.
 *
 * Our CHECK constraint allows sending / sent / delivered / read / failed,
 * and Meta's history vocabulary is different, so this is a real
 * translation rather than a pass-through:
 *
 *   PLAYED  → read     a played voice note has certainly been read; there
 *                      is no richer state to map it to
 *   PENDING → sending  it never left the device
 *   ERROR   → failed
 *
 * An unknown value falls back to 'delivered' rather than throwing. These
 * are historical messages that demonstrably reached WhatsApp, and a
 * status we cannot read is not a reason to lose the message.
 */
export function historyStatusToMessageStatus(
  historyStatus: string | null,
): 'sending' | 'sent' | 'delivered' | 'read' | 'failed' {
  switch ((historyStatus ?? '').toUpperCase()) {
    case 'SENT':
      return 'sent'
    case 'DELIVERED':
      return 'delivered'
    case 'READ':
    case 'PLAYED':
      return 'read'
    case 'PENDING':
      return 'sending'
    case 'ERROR':
      return 'failed'
    default:
      return 'delivered'
  }
}

// ============================================================
// smb_app_state_sync — the phone's address book
// ============================================================

export interface StateSyncContact {
  /** 'add' covers both a new contact and an edit to an existing one. */
  action: 'add' | 'remove'
  phone: string
  fullName: string | null
  firstName: string | null
}

export interface ParsedAppStateSync {
  phoneNumberId: string
  contacts: StateSyncContact[]
}

interface RawStateSyncValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  state_sync?: unknown
}

/**
 * Parse an `smb_app_state_sync` change value.
 *
 * Only `type: 'contact'` entries are returned. Meta describes state_sync
 * as a general channel, so an unrecognised type is skipped rather than
 * guessed at.
 *
 * Note what is NOT here: any decision about importing. This returns the
 * address book as sent; whether a number becomes a CRM contact is a
 * human's call, made later against the staging table.
 */
export function parseAppStateSync(value: unknown): ParsedAppStateSync | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as RawStateSyncValue

  const phoneNumberId = raw.metadata?.phone_number_id
  if (!phoneNumberId) return null
  if (!Array.isArray(raw.state_sync)) return null

  const contacts: StateSyncContact[] = []
  for (const entry of raw.state_sync) {
    if (!entry || typeof entry !== 'object') continue
    const s = entry as Record<string, unknown>
    if (s.type !== 'contact') continue

    const contact = (s.contact ?? {}) as Record<string, unknown>
    const phone = contact.phone_number
    if (typeof phone !== 'string' || phone === '') continue

    const action = s.action === 'remove' ? 'remove' : 'add'

    contacts.push({
      action,
      phone,
      // Names are ABSENT on a remove — Meta only sends the number. So
      // these must stay nullable rather than defaulting to '', or a
      // removal would blank out the name we already staged.
      fullName: typeof contact.full_name === 'string' ? contact.full_name : null,
      firstName:
        typeof contact.first_name === 'string' ? contact.first_name : null,
    })
  }

  if (contacts.length === 0) return null

  return { phoneNumberId, contacts }
}
