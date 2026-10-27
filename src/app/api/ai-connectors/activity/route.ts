// GET /api/ai-connectors/activity?before=<iso> | ?page=<n>&limit=<n>&platform=<id> — recent AI activity the
// viewer may see: their own (owner: the whole workspace), newest first.

import { listActivity } from '@/lib/ai-connector/manage';
import { fail, json, requireViewer } from '@/lib/ai-connector/manage-http';
import { adminDb } from '@/lib/ai-connector/store';

export async function GET(request: Request) {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const url = new URL(request.url);
  try {
    const result = await listActivity(adminDb(), auth.viewer, {
      before: url.searchParams.get('before') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? '50') || 50,
      page: url.searchParams.has('page')
        ? Number(url.searchParams.get('page')) || 1
        : undefined,
      platform: url.searchParams.get('platform') ?? undefined,
    });
    return json(result);
  } catch (err) {
    console.error(
      '[ai-connectors] activity failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return fail(500, 'Could not load activity.');
  }
}
