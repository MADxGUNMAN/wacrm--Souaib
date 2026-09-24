// ============================================================
// GET /api/v1/broadcasts/{id} — broadcast status + counts
// (scope: broadcasts:send).
//
// Poll this after POST /api/v1/broadcasts to watch the fan-out
// progress. `status` moves 'sending' → 'sent'; the delivered/read
// counts continue to climb as Meta delivery webhooks arrive.
// Account-scoped: a foreign id → 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { isInvalidTextRepresentation } from '@/lib/api/v1/db-errors';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');
    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('broadcasts')
      .select(
        'id, name, template_name, template_language, status, total_recipients, sent_count, delivered_count, read_count, replied_count, failed_count, created_at, updated_at'
      )
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    // A malformed id can't be cast to uuid, so the query errors rather
    // than matching nothing. That's the same outcome as an unknown id.
    if (isInvalidTextRepresentation(error)) {
      return fail('not_found', 'Broadcast not found', 404);
    }
    if (error) {
      console.error('[api/v1/broadcasts] read error:', error);
      return fail('internal', 'Failed to read broadcast', 500);
    }
    if (!data) return fail('not_found', 'Broadcast not found', 404);

    return ok(data);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
