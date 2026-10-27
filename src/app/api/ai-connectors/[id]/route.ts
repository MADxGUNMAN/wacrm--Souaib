// ============================================================
// PATCH  /api/ai-connectors/[id] — rename / change a connection's settings
// DELETE /api/ai-connectors/[id] — disconnect it
//
// Allowed for the connection's own user and the workspace owner. Anything
// else (another workspace, a teammate's connection as a member) is a 404,
// so ids can't be probed. Switches are clamped server-side to what was
// granted at consent and what the workspace policy allows.
// ============================================================

import { after } from 'next/server';
import { writeAudit } from '@/lib/ai-connector/audit';
import { onConnectionRevokedByOwner } from '@/lib/ai-connector/events';
import {
  applySettingsPatch,
  getConnectionView,
  getManageableConnection,
  loadPolicy,
  parseConnectionPatch,
  saveConnection,
} from '@/lib/ai-connector/manage';
import {
  fail,
  json,
  limitWrites,
  requireViewer,
} from '@/lib/ai-connector/manage-http';
import { isPlatform } from '@/lib/ai-connector/platforms';
import { normalizeConnectionSettings } from '@/lib/ai-connector/settings';
import { adminDb, revokeConnection } from '@/lib/ai-connector/store';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const { viewer } = auth;
  const limited = limitWrites(viewer.userId);
  if (limited) return limited;

  const { id } = await params;
  const patch = parseConnectionPatch(await request.json().catch(() => null));
  if (!patch) return fail(400, 'Invalid request.');

  const db = adminDb();
  try {
    const row = await getManageableConnection(db, viewer, id);
    if (!row) return fail(404, 'Connection not found.');
    const policy = await loadPolicy(db, viewer.accountId);
    const { next, adjusted } = applySettingsPatch(
      normalizeConnectionSettings(row.settings),
      patch.settings,
      {
        scopes: row.granted_scopes,
        policy,
        role: row.role,
      }
    );
    await saveConnection(db, row.id, { label: patch.label, settings: next });
    after(() =>
      writeAudit(db, {
        accountId: viewer.accountId,
        connectionId: row.id,
        userId: viewer.userId,
        platform: isPlatform(row.platform) ? row.platform : null,
        action: 'settings.connection_updated',
        args: {
          ...patch.settings,
          ...(patch.label !== undefined ? { label_changed: true } : {}),
          adjusted,
        },
        outcome: 'ok',
      })
    );
    return json({
      connection: await getConnectionView(db, viewer, row.id),
      adjusted,
    });
  } catch (err) {
    console.error(
      '[ai-connectors] update failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return fail(500, 'Could not save the connection.');
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const { viewer } = auth;
  const limited = limitWrites(viewer.userId);
  if (limited) return limited;

  const { id } = await params;
  const db = adminDb();
  try {
    const row = await getManageableConnection(db, viewer, id);
    if (!row) return fail(404, 'Connection not found.');
    const byOwnerForOther = row.user_id !== viewer.userId;
    await revokeConnection(
      db,
      row.id,
      byOwnerForOther ? 'owner' : 'user',
      viewer.userId
    );
    after(async () => {
      await writeAudit(db, {
        accountId: viewer.accountId,
        connectionId: row.id,
        userId: viewer.userId,
        platform: isPlatform(row.platform) ? row.platform : null,
        action: byOwnerForOther
          ? 'settings.disconnected_by_owner'
          : 'settings.disconnected',
        outcome: 'ok',
      });
      if (byOwnerForOther) {
        const { data } = await db
          .from('oauth_clients')
          .select('display_name')
          .eq('id', row.oauth_client_id)
          .maybeSingle();
        await onConnectionRevokedByOwner(db, {
          accountId: viewer.accountId,
          userId: row.user_id,
          appName: (data?.display_name as string | undefined) ?? 'An AI app',
        });
      }
    });
    return json({ disconnected: true });
  } catch (err) {
    console.error(
      '[ai-connectors] disconnect failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return fail(500, 'Could not disconnect.');
  }
}
