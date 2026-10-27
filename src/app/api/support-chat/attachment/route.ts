// ============================================================
// Support-chat attachments. One route, three verbs:
//
//   POST   — mint a presigned PUT so the browser uploads straight to S3
//   GET    — mint a short-lived presigned GET for one message's file
//   DELETE — remove a staged object the sender never actually sent
//
// Every verb resolves the caller with `resolveSupportCaller` and then
// scopes the object key to THAT caller's conversation. The key is built
// here, never accepted from the request, which is the same rule
// /api/storage/presign follows and the reason a tenant cannot write into
// another tenant's prefix.
//
// ─── WHY NOT REUSE /api/storage/presign ──────────────────────
//
// Three things that route cannot do:
//
//   1. It scopes keys by ACCOUNT, taken from the caller's own profile. A
//      super admin replying to a workspace would get a key under their
//      own account prefix — or a 403, if their profile carries no
//      account_id. Support attachments have to be keyed by CONVERSATION
//      so both sides land in the same place.
//   2. Its only content-type check is that the string looks like a MIME
//      type. Support chat needs a real allowlist, server-side: this
//      bucket is public-read and serves back whatever type was stored, so
//      an `image/svg+xml` or `text/html` upload is stored XSS on the
//      bucket origin.
//   3. It has no rate limit at all.
//
// ─── WHY THE BUCKET POLICY STILL WANTS NARROWING ─────────────
//
// Reads go through presigned GETs because a support screenshot routinely
// contains an API key or another customer's data. That is only half a
// guarantee while the bucket policy grants public read to `*`: the same
// object is also reachable unsigned at its public URL. Two mitigations
// are in place here — the key carries a 128-bit random segment, so the
// public URL is not derivable, and `media_url` is never populated for a
// support message, so the public form is never written down or sent to a
// browser. To close it fully, the bucket policy's public-read statement
// needs `support-chat/*` excluded, e.g.
//
//   "NotResource": "arn:aws:s3:::replai-jc/support-chat/*"
//
// on the public GetObject statement. That is console-side state (no
// bucket policy is committed in this repo), so it is called out here
// rather than silently assumed.
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
  buildSupportMediaKey,
  checkSupportAttachment,
  isKeyInSupportConversation,
} from '@/lib/support-chat/attachments';
import { SUPPORT_MESSAGES_TABLE } from '@/lib/support-chat/types';
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteFromS3,
  PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
} from '@/lib/storage/s3-client';

export const dynamic = 'force-dynamic';

/**
 * Build the Content-Disposition for a download.
 *
 * Images are `inline` so they render in the bubble; documents are
 * `attachment` so they save under their real name rather than the key's
 * random segment.
 *
 * The filename is sent twice, deliberately: a quoted ASCII fallback for
 * old clients and RFC 5987 `filename*` for everything else. Quotes,
 * backslashes and control characters are stripped from the fallback,
 * because an unescaped quote there lets a filename break out of the
 * header value.
 */
function contentDisposition(
  kind: 'inline' | 'attachment',
  filename: string | null
): string {
  if (!filename) return kind;
  const ascii = filename.replace(/[\u0000-\u001f\u007f"\\]/g, '').slice(0, 200);
  const encoded = encodeURIComponent(filename).slice(0, 300);
  return `${kind}; filename="${ascii || 'file'}"; filename*=UTF-8''${encoded}`;
}

// ------------------------------------------------------------
// POST — presign an upload
// ------------------------------------------------------------
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
      `support-chat-upload:${caller.userId}`,
      RATE_LIMITS.supportChatUpload
    );
    if (!limit.success) return rateLimitResponse(limit);

    const filename =
      typeof body.filename === 'string' && body.filename.trim()
        ? body.filename.trim().slice(0, 255)
        : 'file';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : null;
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : NaN;

    // The same check the composer runs, re-run here because the composer
    // is not the boundary.
    const checked = checkSupportAttachment({ mimeType, sizeBytes });
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    const key = buildSupportMediaKey(conversation.id, filename);

    // contentType and contentLength are pinned into the signature, so the
    // PUT is refused by S3 unless it sends exactly the type we
    // allowlisted and exactly the byte count we checked.
    const uploadUrl = await createPresignedUploadUrl({
      key,
      contentType: checked.mimeType,
      contentLength: sizeBytes,
    });

    // No publicUrl in the response, on purpose. There is no legitimate
    // consumer of the unsigned form of a support attachment, and handing
    // one to the browser is how it ends up persisted somewhere.
    return NextResponse.json({
      uploadUrl,
      key,
      kind: checked.kind,
      mimeType: checked.mimeType,
      expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// ------------------------------------------------------------
// GET — presign a download for one message's attachment
// ------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = (searchParams.get('messageId') ?? '').trim();
    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required.' },
        { status: 400 }
      );
    }

    const caller = await resolveSupportCaller(searchParams.get('accountId'));

    const limit = checkRateLimit(
      `support-chat-download:${caller.userId}`,
      RATE_LIMITS.supportChatDownload
    );
    if (!limit.success) return rateLimitResponse(limit);

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    // Authorisation is the `conversation_id` filter, not a check on the
    // row after the fact: the message is only found if it belongs to the
    // thread this caller was resolved to. A message id from another
    // tenant's thread returns nothing.
    const { data: message, error } = await caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select(
        'id, media_key, media_filename, media_mime_type, content_type, deleted_at'
      )
      .eq('id', messageId)
      .eq('conversation_id', conversation.id)
      .maybeSingle();

    if (error) {
      console.error('[support-chat/attachment] message read failed:', error);
      return NextResponse.json(
        { error: 'Could not load that attachment.' },
        { status: 500 }
      );
    }
    if (!message || !message.media_key) {
      return NextResponse.json(
        { error: 'That attachment does not exist.' },
        { status: 404 }
      );
    }
    // A retracted message must not keep serving its file.
    if (message.deleted_at) {
      return NextResponse.json(
        { error: 'That message was deleted.' },
        { status: 410 }
      );
    }

    // Images and voice notes render in place, so they must be `inline` —
    // an `attachment` disposition makes some browsers refuse to play the
    // file in an <audio> element and offer a download instead. A document
    // is the opposite: it should save under its real name.
    const rendersInline =
      message.content_type === 'image' || message.content_type === 'audio';
    const url = await createPresignedDownloadUrl({
      key: message.media_key as string,
      // Pin the type we validated at upload rather than trusting what the
      // uploading browser stored on the object.
      contentType: (message.media_mime_type as string | null) ?? undefined,
      contentDisposition: contentDisposition(
        rendersInline ? 'inline' : 'attachment',
        (message.media_filename as string | null) ?? null
      ),
    });

    return NextResponse.json({
      url,
      expiresIn: PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
    });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

// ------------------------------------------------------------
// DELETE — drop a staged object that was never sent
// ------------------------------------------------------------
//
// Deliberately NOT /api/storage/delete. That route accepts any key from
// any signed-in user with no prefix check, so using it here would mean
// the cleanup path for a cancelled draft is also a way to delete another
// tenant's files. This one only accepts a key inside the caller's own
// conversation prefix.
export async function DELETE(request: Request) {
  try {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { error: 'A JSON body is required.' },
        { status: 400 }
      );
    }
    const body = raw as Record<string, unknown>;
    const key = typeof body.key === 'string' ? body.key : '';
    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 });
    }

    const caller = await resolveSupportCaller(
      typeof body.accountId === 'string' ? body.accountId : null
    );

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    if (!isKeyInSupportConversation(key, conversation.id)) {
      return NextResponse.json(
        { error: 'That file does not belong to this conversation.' },
        { status: 403 }
      );
    }

    // Refuse to delete an object a message already points at. Staged
    // cleanup is for files that were never sent; removing a sent one would
    // leave a permanently broken bubble with no way to tell why.
    const { data: attached } = await caller.admin
      .from(SUPPORT_MESSAGES_TABLE)
      .select('id')
      .eq('media_key', key)
      .maybeSingle();
    if (attached) {
      return NextResponse.json(
        { error: 'That file has already been sent.' },
        { status: 409 }
      );
    }

    await deleteFromS3(key);
    return NextResponse.json({ success: true });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
