// ============================================================
// Forward-only "sent" stamp for a broadcast_recipients row.
//
// Why this exists (2 Oct 2026): the wizard's client-side flow wrote
// `whatsapp_message_id` onto the recipient row only after the WHOLE batch
// call to /api/whatsapp/broadcast returned — 2–26 s after Meta accepted
// each send. A delivered/failed status webhook arriving inside that gap
// looked the recipient up by wamid, matched nothing, and was lost for
// good. One campaign reported 188 "sent" when 67 were delivered and 106
// had failed.
//
// The send path now stamps the row the moment the wamid is known. It has
// to be FORWARD-ONLY, because a status webhook may already have moved the
// row on (via the fallback in handleStatusUpdate) by the time a slower
// writer — the browser hook, a retry — gets here. Two conditional
// single-statement UPDATEs, never read-then-write:
//
//   A. SET whatsapp_message_id, sent_at  WHERE … AND whatsapp_message_id IS NULL
//      Correlate first, so a status webhook can find the row as early as
//      possible. Set-once: a replay never moves the wamid or sent_at.
//   B. SET status='sent', error_message=NULL
//        WHERE … AND status='pending' AND whatsapp_message_id = <wamid>
//      Only a still-pending row advances. A row already delivered / read /
//      failed matches zero rows, which is the forward-only guarantee. The
//      wamid predicate pins B to the row A stamped — load-bearing for the
//      (broadcast_id, contact_id) key, which is not unique.
//
// There is no 'queued' status (CHECK is pending|sent|delivered|read|
// replied|failed|skipped), so "not yet advanced" means exactly 'pending'.
//
// Type-only imports: the browser hook uses this file as well.
//
// Best-effort by contract, like broadcast-inbox.ts: Meta has already
// accepted the message, so a failure here is logged and never thrown.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StampRecipientSentArgs {
  /** Preferred key: the exact broadcast_recipients row. */
  recipientId?: string | null;
  broadcastId: string;
  /** Fallback key when `recipientId` is absent. */
  contactId?: string | null;
  waMessageId: string;
  /** Defaults to now. */
  sentAt?: string;
}

export async function stampRecipientSent(
  db: SupabaseClient,
  a: StampRecipientSentArgs
): Promise<void> {
  const key = a.recipientId
    ? ({ col: 'id', val: a.recipientId } as const)
    : a.contactId
      ? ({ col: 'contact_id', val: a.contactId } as const)
      : null;

  const ctx = {
    broadcastId: a.broadcastId,
    recipientId: a.recipientId ?? null,
    contactId: a.contactId ?? null,
    waMessageId: a.waMessageId,
  };

  if (!key) {
    console.warn('[broadcast] no recipient key to stamp', ctx);
    return;
  }

  try {
    // A — correlate (set once).
    const { error: aErr } = await db
      .from('broadcast_recipients')
      .update({
        whatsapp_message_id: a.waMessageId,
        sent_at: a.sentAt ?? new Date().toISOString(),
      })
      .eq('broadcast_id', a.broadcastId)
      .eq(key.col, key.val)
      .is('whatsapp_message_id', null);

    if (aErr) {
      console.error('[broadcast] could not stamp recipient', {
        ...ctx,
        step: 'wamid',
        code: aErr.code,
        message: aErr.message,
      });
    }

    // B — advance status, only from 'pending'.
    const { error: bErr } = await db
      .from('broadcast_recipients')
      .update({ status: 'sent', error_message: null })
      .eq('broadcast_id', a.broadcastId)
      .eq(key.col, key.val)
      .eq('status', 'pending')
      .eq('whatsapp_message_id', a.waMessageId);

    if (bErr) {
      console.error('[broadcast] could not stamp recipient', {
        ...ctx,
        step: 'status',
        code: bErr.code,
        message: bErr.message,
      });
    }
  } catch (err) {
    console.error('[broadcast] could not stamp recipient', {
      ...ctx,
      step: 'unexpected',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
