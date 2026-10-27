// ============================================================
// GET /api/super-admin/accounts/[id]/ai-connectors — AI connector summary
// PUT /api/super-admin/accounts/[id]/ai-connectors — { locked, reason }
//
// Super admin only. The lock refuses every AI tool call for the
// workspace (evaluateToolAccess → `ai_locked`) without revoking
// anything, so unlocking restores access. The owner can't override it.
// ============================================================

import { NextResponse } from 'next/server';
import {
  accountConnectorSummary,
  setPlatformLock,
} from '@/lib/ai-connector/manage';
import { adminDb } from '@/lib/ai-connector/store';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin(request);
    const { id } = await params;
    if (!UUID_RE.test(id))
      return NextResponse.json(
        { error: 'Invalid account id' },
        { status: 400 }
      );
    return NextResponse.json(await accountConnectorSummary(adminDb(), id));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/ai-connectors] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to load AI connectors' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperAdmin(request);
    const { id } = await params;
    if (!UUID_RE.test(id))
      return NextResponse.json(
        { error: 'Invalid account id' },
        { status: 400 }
      );
    const body = (await request.json().catch(() => null)) as {
      locked?: unknown;
      reason?: unknown;
    } | null;
    if (typeof body?.locked !== 'boolean') {
      return NextResponse.json(
        { error: '`locked` must be true or false' },
        { status: 400 }
      );
    }
    const db = adminDb();
    await setPlatformLock(
      db,
      id,
      body.locked,
      typeof body.reason === 'string' ? body.reason : null,
      admin.userId
    );
    return NextResponse.json(await accountConnectorSummary(db, id));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/ai-connectors] PUT error:', err);
    return NextResponse.json(
      { error: 'Failed to update AI connector lock' },
      { status: 500 }
    );
  }
}
