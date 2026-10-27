// ============================================================
// POST /api/support-chat/messages/retract — unsend a message
//
// Soft delete: stamps `deleted_at` and clears the text. The ROW stays, so
// replies pointing at it do not dangle and the bubble can honestly say
// "This message was deleted" rather than a message silently vanishing
// from the other side's thread.
//
// ─── Why the text is cleared, not just flagged ────────────────
//
// `support_messages` carries RLS SELECT for both audiences, and Realtime
// emits the full row on UPDATE (replica identity is FULL). A flag alone
// would leave the retracted text sitting in a row the other side can read
// directly through PostgREST or straight off the Realtime payload. For a
// support chat the realistic reason to retract is "I just pasted a live
// API key" — so the content has to actually go.
//
// The S3 object goes too, for the same reason. An attachment left in the
// bucket stays retrievable by anyone holding an already-signed URL, and
// the whole point of retracting a screenshot is that it stops being
// retrievable.
//
// ─── Who may retract ─────────────────────────────────────────
//
// Your own side of your own conversation, and:
//
//   • a MEMBER may retract only their own messages
//   • a workspace OWNER may retract any message their team sent, because
//     they are accountable for it and the urgent case ("someone pasted a
//     live credential") cannot wait for that person to log back in
//   • an OPERATOR may retract any operator message, for the same reason
//
// Nobody can retract the OTHER side's messages. A super admin editing a
// tenant's history would be a different feature with different
// expectations, and would want an audit trail.
//
// All of it is expressed as query filters rather than post-hoc checks, so
// a message the caller may not touch is simply not found.
// ============================================================

import { NextResponse } from 'next/server';

import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  findOrCreateSupportConversation,
  resolveSupportCaller,
  supportErrorResponse,
} from '@/lib/support-chat/access';
import { SUPPORT_MESSAGES_TABLE } from '@/lib/support-chat/types';
import { buildSupportPreview } from '@/lib/support-chat/validation';
import { deleteFromS3 } from '@/lib/storage/s3-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { error: 'A JSON body is required.' },
        { status: 400 }
      );
    }
    const body = raw as Record<string, unknown>;

    const messageId =
      typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required.' },
        { status: 400 }
      );
    }

    const caller = await resolveSupportCaller(
      typeof body.accountId === 'string' ? body.accountId : null
    );

    const limit = checkRateLimit(
      `support-chat:${caller.userId}`,
      RATE_LIMITS.supportChat
    );
    if (!limit.success) return rateLimitResponse(limit);

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    // Always scoped to this conversation AND to the caller's own SIDE, so a
    // retract can never cross the account/admin boundary.
    let query = caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select('id, media_key, sender_kind, sender_user_id, deleted_at')
      .eq('id', messageId)
      .eq('conversation_id', conversation.id)
      .eq('sender_kind', caller.senderKind);

    // A workspace OWNER can withdraw anything their team sent us — they are
    // accountable for it, and "a member pasted a live API key" is exactly
    // the case where waiting for that member to log in is not acceptable. A
    // member is restricted to their own messages.
    //
    // Note this never lets an owner touch OUR side of the thread: the
    // sender_kind filter above already prevents that, regardless of role.
    if (!caller.isOwner) {
      query = query.eq('sender_user_id', caller.userId);
    }

    const { data: message, error: readErr } = await query.maybeSingle();

    if (readErr) {
      console.error('[support-chat/retract] read failed:', readErr);
      return NextResponse.json(
        { error: 'Could not retract that message.' },
        { status: 500 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: 'That message is not yours to delete.' },
        { status: 403 }
      );
    }
    // Idempotent: a double-click should not be an error.
    if (message.deleted_at) {
      return NextResponse.json({ success: true, already: true });
    }

    const { data: updated, error: updateErr } = await caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .update({
        deleted_at: new Date().toISOString(),
        // Actually cleared, not merely flagged — see the header. Migration
        // 20260926090000 relaxes the payload CHECK for soft-deleted rows so
        // this is possible without storing a placeholder.
        content_text: null,
        media_filename: null,
        media_mime_type: null,
        media_size_bytes: null,
        // `media_key` is deliberately KEPT. The object is gone from S3, and
        // the download route refuses a deleted message with 410 regardless,
        // but the key is what stops the same object being re-attached by a
        // replayed send — both the send and staged-delete paths reject a key
        // that any message already points at.
      })
      .eq('id', message.id)
      .select('*')
      .single();

    if (updateErr || !updated) {
      console.error('[support-chat/retract] update failed:', updateErr);
      return NextResponse.json(
        { error: 'Could not retract that message.' },
        { status: 500 }
      );
    }

    // Now the object. Done AFTER the row is flagged so a storage failure
    // cannot leave a message that still renders its content — the worst
    // case here is an orphaned object nobody can reach, because the
    // download route refuses a deleted message with 410.
    if (message.media_key) {
      try {
        await deleteFromS3(message.media_key as string);
      } catch (err) {
        console.error('[support-chat/retract] S3 delete failed:', err);
      }
    }

    // The conversation's preview may still be quoting what was just
    // retracted. Recompute it from whatever the newest surviving message
    // is, or blank it if there is none.
    const { data: newest } = await caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select('content_type, content_text, deleted_at, created_at')
      .eq('conversation_id', conversation.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: previewErr } = await caller.admin
      .from('support_conversations')
      .update({
        last_message_preview: newest
          ? buildSupportPreview(
              newest.content_type as string,
              newest.content_text as string | null
            )
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);
    if (previewErr) {
      // Cosmetic — the retracted bubble is already gone from the thread.
      console.error(
        '[support-chat/retract] preview refresh failed:',
        previewErr
      );
    }

    return NextResponse.json({ success: true, message: updated });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
