// ============================================================
// GET /api/v1/campaigns — list this account's reusable API campaigns
// (scope: broadcasts:send).
//
// A campaign is a saved, recipient-less definition an external caller
// (the Google Sheets add-on, a customer's own backend) can trigger
// repeatedly via POST /api/v1/campaigns/{id}/send. See
// docs/google-sheets-addon-plan.md §2.7 / §5.1.
//
// Deliberately the smallest response shape that lets a caller populate
// a picker: id, name, template identity, status. Anything about WHAT
// the template needs to send lives behind GET /api/v1/campaigns/{id}
// instead — a list endpoint returning full send-plan introspection for
// every row would be one N-times-larger response for data almost every
// caller ignores until a campaign is actually selected.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  buildPage,
  keysetFilter,
  parseListParams,
} from '@/lib/api/v1/pagination';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');
    const { limit, cursor } = parseListParams(request);

    let query = ctx.supabase
      .from('api_campaigns')
      .select('id, name, template_name, template_language, status, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const filter = keysetFilter(cursor);
    if (filter) query = query.or(filter);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/campaigns] list error:', error);
      return fail('internal', 'Failed to list campaigns', 500);
    }

    const { items, nextCursor } = buildPage(data ?? [], limit);
    return okList(items, nextCursor);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
