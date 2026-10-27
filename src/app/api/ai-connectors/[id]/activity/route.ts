// GET /api/ai-connectors/[id]/activity?before=<iso> — one connection's
// audit rows, newest first. Same access rule as PATCH/DELETE.

import {
  getManageableConnection,
  listActivity,
} from '@/lib/ai-connector/manage';
import { fail, json, requireViewer } from '@/lib/ai-connector/manage-http';
import { adminDb } from '@/lib/ai-connector/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const { viewer } = auth;
  const { id } = await params;
  const url = new URL(request.url);

  const db = adminDb();
  try {
    const row = await getManageableConnection(db, viewer, id);
    if (!row) return fail(404, 'Connection not found.');
    // Scope to the connection's user too, so an owner sees the same rows
    // the member does for this connection.
    const result = await listActivity(
      db,
      { ...viewer, role: 'owner' },
      {
        connectionId: row.id,
        before: url.searchParams.get('before') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? '50') || 50,
      }
    );
    return json(result);
  } catch (err) {
    console.error(
      '[ai-connectors] activity failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return fail(500, 'Could not load activity.');
  }
}
