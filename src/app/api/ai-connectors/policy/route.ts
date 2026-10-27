// ============================================================
// GET /api/ai-connectors/policy — the workspace AI policy (any member)
// PUT /api/ai-connectors/policy — change it (owner only)
//
// Changes apply to every connection on its next call: the /mcp gate
// loads the policy per request.
// ============================================================

import { after } from 'next/server';
import { writeAudit } from '@/lib/ai-connector/audit';
import {
  loadPolicy,
  mergePolicyUpdate,
  savePolicy,
} from '@/lib/ai-connector/manage';
import {
  fail,
  json,
  limitWrites,
  requireViewer,
} from '@/lib/ai-connector/manage-http';
import { adminDb } from '@/lib/ai-connector/store';

export async function GET() {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  try {
    return json({ policy: await loadPolicy(adminDb(), auth.viewer.accountId) });
  } catch {
    return fail(500, 'Could not load the policy.');
  }
}

export async function PUT(request: Request) {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const { viewer } = auth;
  if (viewer.role !== 'owner')
    return fail(403, 'Only the workspace owner can change the AI policy.');
  const limited = limitWrites(viewer.userId);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail(400, 'Invalid request.');

  const db = adminDb();
  try {
    const current = await loadPolicy(db, viewer.accountId);
    const next = mergePolicyUpdate(current, body);
    await savePolicy(db, viewer.accountId, next, viewer.userId);
    after(() =>
      writeAudit(db, {
        accountId: viewer.accountId,
        connectionId: null,
        userId: viewer.userId,
        platform: null,
        action: 'settings.policy_updated',
        args: next,
        outcome: 'ok',
      })
    );
    return json({ policy: next });
  } catch (err) {
    console.error(
      '[ai-connectors] policy save failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return fail(500, 'Could not save the policy.');
  }
}
