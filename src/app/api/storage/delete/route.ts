// ============================================================
// DELETE /api/storage/delete
//
// Deletes a file from AWS S3. Used to GC media that was staged
// (uploaded) but never sent — a cancelled draft or a failed Meta
// send — so abandoned attachments don't accumulate.
//
// Body: JSON { key: string }
// Auth: requires a valid Supabase user session (cookie-based).
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteFromS3 } from "@/lib/storage/s3-client";

export async function DELETE(request: Request) {
  try {
    // 1. Authenticate.
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // 2. Parse body.
    const body = await request.json();
    const key = body?.key as string | undefined;
    if (!key) {
      return NextResponse.json(
        { error: "key is required" },
        { status: 400 },
      );
    }

    // 3. Delete from S3.
    await deleteFromS3(key);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[storage/delete] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Delete failed" },
      { status: 500 },
    );
  }
}
