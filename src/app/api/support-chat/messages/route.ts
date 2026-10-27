// ============================================================
// GET  /api/support-chat/messages       — one page of thread history
// POST /api/support-chat/messages       — send a message
//
// ONE pair of routes serves both audiences. Which side the caller is on
// is resolved from their session by `resolveSupportCaller`, never from
// the request body: a client-supplied `sender_kind` would let a tenant
// post messages that render as coming from support.
//
// A super admin must pass `?accountId=` / `accountId` — they act on a
// thread they are not a member of. A tenant's value is ignored rather
// than rejected, because honouring it would be a tenancy hole one edited
// request wide.
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
import {
  SUPPORT_CAPTION_MAX,
  checkSupportAttachment,
  isKeyInSupportConversation,
  supportContentTypeFor,
} from '@/lib/support-chat/attachments';
import {
  SUPPORT_MESSAGES_TABLE,
  type SupportAuthor,
  type SupportContentType,
  type SupportMessage,
} from '@/lib/support-chat/types';
import {
  buildSupportPreview,
  normalizeSupportText,
} from '@/lib/support-chat/validation';
import { headS3Object } from '@/lib/storage/s3-client';
import { ensureSupportAccessForAdminMessage } from '@/lib/support-chat/availability';

export const dynamic = 'force-dynamic';

/**
 * Rows per page.
 *
 * 300 for the same reason the inbox uses it: PostgREST caps a response at
 * 1,000 rows regardless of what you ask for, and the inbox shipped with
 * an ascending unbounded query that therefore returned the OLDEST 1,000
 * and silently dropped everything newer. Newest-first with an explicit
 * limit is bounded work no matter how long the thread grows.
 */
const PAGE_SIZE = 300;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caller = await resolveSupportCaller(searchParams.get('accountId'));

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    // `before` is the created_at of the oldest row the client already
    // holds. `lte` not `lt`, then de-duplicate by id on the client —
    // several messages can share a timestamp to the second, and `lt`
    // would step straight over them, losing messages silently.
    const before = searchParams.get('before');

    let query = caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (before) query = query.lte('created_at', before);

    const { data, error } = await query;

    if (error) {
      console.error('[support-chat/messages] read failed:', error);
      return NextResponse.json(
        { error: 'Could not load messages.' },
        { status: 500 }
      );
    }

    const page = (data ?? []) as SupportMessage[];

    // Names for the workspace-side authors in THIS page, so a bubble can
    // say who on the customer's team wrote it. Resolved server-side
    // because the operator has no RLS path to another account's profiles,
    // and limited to the ids actually present rather than the whole team —
    // an author who has since left the workspace still needs a name.
    //
    // Operator identities are deliberately NOT resolved: the tenant sees
    // one "Support" identity, not the individual who happened to reply.
    const authorIds = [
      ...new Set(
        page
          .filter((m) => m.sender_kind === 'account' && m.sender_user_id)
          .map((m) => m.sender_user_id as string)
      ),
    ];

    let authors: SupportAuthor[] = [];
    if (authorIds.length > 0) {
      const { data: profiles, error: authorErr } = await caller.admin
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', authorIds);
      if (authorErr) {
        // Bubbles fall back to no label, which the UI already handles.
        // Not worth failing a thread read over.
        console.error('[support-chat/messages] author read failed:', authorErr);
      } else {
        authors = (profiles ?? []) as SupportAuthor[];
      }
    }

    return NextResponse.json({
      conversation,
      // Reversed so the client renders oldest-first without re-sorting.
      messages: [...page].reverse(),
      authors,
      // Measured on the raw page, not a de-duplicated one: the boundary
      // overlap from `lte` would otherwise look like exhaustion.
      has_older: page.length === PAGE_SIZE,
    });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

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

    const caller = await resolveSupportCaller(
      typeof body.accountId === 'string' ? body.accountId : null
    );

    const limit = checkRateLimit(
      `support-chat:${caller.userId}`,
      RATE_LIMITS.supportChat
    );
    if (!limit.success) return rateLimitResponse(limit);

    // An attachment send carries a `mediaKey` from the presign step; a
    // text send does not. Which branch we are in is decided by the key's
    // presence, not by a client-supplied content_type — that would let a
    // caller label a document as text and skip the media validation.
    const mediaKey =
      typeof body.mediaKey === 'string' && body.mediaKey.trim()
        ? body.mediaKey.trim()
        : null;

    // Text is required for a text send and optional (as a caption) for an
    // attachment. Same normaliser either way, so a caption gets the same
    // control-character stripping.
    let text: string | null = null;
    if (mediaKey) {
      const rawCaption = typeof body.text === 'string' ? body.text : '';
      if (rawCaption.trim()) {
        const caption = normalizeSupportText(rawCaption);
        if (!caption.ok) {
          return NextResponse.json({ error: caption.error }, { status: 400 });
        }
        if (caption.text.length > SUPPORT_CAPTION_MAX) {
          return NextResponse.json(
            {
              error: `A caption can be at most ${SUPPORT_CAPTION_MAX.toLocaleString()} characters.`,
            },
            { status: 400 }
          );
        }
        text = caption.text;
      }
    } else {
      const parsed = normalizeSupportText(body.text);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      text = parsed.text;
    }

    // An operator messaging a workspace that cannot see Live chat gives it
    // access automatically — otherwise the message would land in a thread
    // the customer has no way to open. Done BEFORE the conversation or the
    // message is written: the customer's CRM refreshes its availability on
    // the realtime event those writes produce, so the grant has to exist by
    // then or the customer would check, see "no access", and miss it.
    let accessGranted = false;
    if (caller.senderKind === 'admin') {
      const ensured = await ensureSupportAccessForAdminMessage(
        caller.admin,
        caller.accountId,
        caller.userId
      );
      if (!ensured.ok) {
        return NextResponse.json(
          ensured.reason === 'disabled'
            ? {
                error:
                  'Live chat is turned off for all workspaces. Turn it on in Live chat settings first.',
                code: 'support_chat_disabled',
              }
            : { error: 'Could not give this workspace access to Live chat.' },
          { status: ensured.reason === 'disabled' ? 409 : 500 }
        );
      }
      accessGranted = ensured.granted;
    }

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    // A reply target must belong to THIS thread. Without the check a
    // caller could quote a message out of another account's conversation
    // and the quote would render with its text.
    let replyToId: string | null = null;
    if (typeof body.replyToMessageId === 'string' && body.replyToMessageId) {
      const { data: parent } = await caller.admin
        .from(SUPPORT_MESSAGES_TABLE)
        .select('id')
        .eq('id', body.replyToMessageId)
        .eq('conversation_id', conversation.id)
        .maybeSingle();
      if (!parent) {
        return NextResponse.json(
          { error: 'That message is not part of this conversation.' },
          { status: 400 }
        );
      }
      replyToId = parent.id as string;
    }

    // ---- Resolve the attachment, if this is one --------------------
    //
    // Everything about the file is established HERE from the key and from
    // S3. The request contributes the key and the display filename and
    // nothing else, because the key is the only claim that can be checked
    // and a self-reported size or mime type is worth nothing.
    let media: {
      content_type: SupportContentType;
      media_key: string;
      media_filename: string | null;
      media_mime_type: string;
      media_size_bytes: number;
    } | null = null;

    if (mediaKey) {
      // The key must sit in THIS conversation's prefix. Without this a
      // caller who legitimately presigned into their own thread could
      // attach an object out of somebody else's.
      if (!isKeyInSupportConversation(mediaKey, conversation.id)) {
        return NextResponse.json(
          { error: 'That file does not belong to this conversation.' },
          { status: 403 }
        );
      }

      // Refuse a key that is already attached to a message. Otherwise a
      // replayed send duplicates a bubble pointing at one object, and
      // deleting either one breaks the other.
      const { data: existing } = await caller.admin
        .from(SUPPORT_MESSAGES_TABLE)
        .select('id')
        .eq('media_key', mediaKey)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: 'That file has already been sent.' },
          { status: 409 }
        );
      }

      // HEAD rather than trusting the body: this both proves the object
      // exists (so a caller cannot register a message for a file they
      // never uploaded) and yields the authoritative size and type.
      const head = await headS3Object(mediaKey).catch(() => undefined);
      if (head === undefined) {
        return NextResponse.json(
          { error: 'Could not verify the uploaded file.' },
          { status: 503 }
        );
      }
      if (head === null) {
        return NextResponse.json(
          { error: 'That upload did not complete. Try attaching it again.' },
          { status: 400 }
        );
      }

      // Re-check against the allowlist using S3's stored values. The
      // presign pinned both into the signature, so a mismatch here means
      // something is wrong rather than merely disallowed — either way it
      // does not get stored.
      const checked = checkSupportAttachment({
        mimeType: head.contentType,
        sizeBytes: head.contentLength,
      });
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }

      media = {
        content_type: supportContentTypeFor(checked.kind),
        media_key: mediaKey,
        media_filename:
          typeof body.filename === 'string' && body.filename.trim()
            ? body.filename.trim().slice(0, 255)
            : null,
        media_mime_type: checked.mimeType,
        media_size_bytes: head.contentLength,
      };
    }

    const { data: inserted, error: insertErr } = await caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .insert({
        conversation_id: conversation.id,
        // From the conversation, never the request.
        account_id: conversation.account_id,
        sender_kind: caller.senderKind,
        sender_user_id: caller.userId,
        content_type: media ? media.content_type : 'text',
        content_text: text,
        reply_to_message_id: replyToId,
        // `media_url` is deliberately left null even though the object has
        // a public URL. Support attachments are only ever served through a
        // short-lived presigned GET, and persisting the unsigned form is
        // how that guarantee gets quietly lost later.
        ...(media
          ? {
              media_key: media.media_key,
              media_filename: media.media_filename,
              media_mime_type: media.media_mime_type,
              media_size_bytes: media.media_size_bytes,
            }
          : {}),
      })
      .select('*')
      .single();

    if (insertErr || !inserted) {
      console.error('[support-chat/messages] insert failed:', insertErr);
      return NextResponse.json(
        { error: 'Could not send the message.' },
        { status: 500 }
      );
    }

    // Bump the OTHER side's unread counter and refresh the list row.
    //
    // Read-modify-write on a counter is a lost-update race when two
    // messages land together, so the increment is done in SQL via the
    // atomic RPC rather than by reading the value into JS first.
    const isFromAdmin = caller.senderKind === 'admin';
    const { error: bumpErr } = await caller.admin.rpc(
      'fn_support_chat_after_send',
      {
        p_conversation_id: conversation.id,
        p_from_admin: isFromAdmin,
        // A captioned attachment previews as its caption; an uncaptioned
        // one falls back to the "📷 Photo" style label so a list row never
        // reads as an empty conversation.
        p_preview: buildSupportPreview(
          media ? media.content_type : 'text',
          text
        ),
      }
    );
    if (bumpErr) {
      // The message IS sent and will render. Failing the request now would
      // invite a resend and a duplicate, so this is logged rather than
      // surfaced — the counter self-corrects on the next read.
      console.error('[support-chat/messages] counter bump failed:', bumpErr);
    }

    return NextResponse.json(
      { message: inserted, access_granted: accessGranted },
      { status: 201 }
    );
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
