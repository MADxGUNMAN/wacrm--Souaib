// ============================================================
// POST /api/storage/presign
//
// Hands the browser a short-lived, tightly-scoped URL for uploading ONE
// file straight to S3. The file itself never passes through this server.
//
// Body (JSON):
//   • folder      — one of ALLOWED_UPLOAD_FOLDERS (required)
//   • filename    — original name, used only to build a readable key
//   • contentType — MIME type; gets pinned into the signature
//   • size        — exact byte length; also pinned into the signature
//   • customPath  — optional key suffix for callers that own their layout
//                   (avatars use `<user_id>/avatar-<ts>.<ext>`)
//
// Returns { uploadUrl, publicUrl, key, expiresIn }. The client PUTs the
// file to `uploadUrl` with exactly the declared Content-Type, then stores
// `publicUrl`.
//
// ─── Why this replaced the proxy upload ──────────────────────────
//
// The old POST /api/storage/upload read the whole file into memory twice
// (`arrayBuffer()` then `Buffer.from`), so a 100 MB document needed ~300 MB
// on a 900 MB box — the advertised limit could never actually be honoured,
// and one upload could OOM the container for everyone. It also had to fit
// under nginx's request body cap, which is why uploads worked in local dev
// (no proxy) and failed on the server.
//
// Auth: a valid Supabase session. The object key is built HERE from that
// session, never from the request body.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createPresignedUploadUrl,
  getS3PublicUrl,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
} from '@/lib/storage/s3-client';
import { buildMediaPath } from '@/lib/storage/upload-media';
import {
  ACCOUNT_SCOPED_FOLDERS,
  validateUploadRequest,
} from '@/lib/storage/upload-policy';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'A JSON body is required.' },
        { status: 400 }
      );
    }

    const {
      folder,
      filename,
      contentType,
      size,
      customPath = null,
    } = body as Record<string, unknown>;

    const problem = validateUploadRequest({
      folder,
      contentType,
      size,
      customPath,
    });
    if (problem) {
      return NextResponse.json(
        { error: problem.error },
        { status: problem.status }
      );
    }

    // Narrowed by validateUploadRequest above.
    const safeFolder = folder as string;
    const safeContentType = contentType as string;
    const safeSize = size as number;
    const safeCustomPath = customPath as string | null;
    const safeFilename =
      typeof filename === 'string' && filename.trim() ? filename : 'file';

    // ---- Build the key. This is the whole security story of the route. ----
    let key: string;

    if (safeCustomPath) {
      key = `${safeFolder}/${safeCustomPath}`;
    } else if (ACCOUNT_SCOPED_FOLDERS.has(safeFolder)) {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileErr || !profile?.account_id) {
        return NextResponse.json(
          { error: 'Could not resolve your account.' },
          { status: 403 }
        );
      }
      key = `${safeFolder}/${buildMediaPath(profile.account_id as string, safeFilename)}`;
    } else {
      const ext = safeFilename.split('.').pop()?.toLowerCase() || 'bin';
      const base =
        safeFilename
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '_')
          .slice(0, 40) || 'file';
      key = `${safeFolder}/${Date.now()}-${base}.${ext}`;
    }

    const uploadUrl = await createPresignedUploadUrl({
      key,
      contentType: safeContentType,
      contentLength: safeSize,
    });

    return NextResponse.json({
      uploadUrl,
      publicUrl: getS3PublicUrl(key),
      key,
      expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    });
  } catch (err) {
    console.error('[storage/presign] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Could not prepare the upload.' },
      { status: 500 }
    );
  }
}
