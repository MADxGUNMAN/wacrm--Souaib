// ============================================================
// GET /api/ai-connectors — everything the Settings → AI Connectors page
// shows: whether the connector is available here, the MCP URL to paste
// into Claude/ChatGPT, my connections (owner: plus the team's), and the
// workspace policy.
// ============================================================

import { getConfig, isAccountAllowed } from '@/lib/ai-connector/config';
import {
  listConnections,
  loadPolicy,
  POLICY_PLATFORMS,
} from '@/lib/ai-connector/manage';
import { json, requireViewer } from '@/lib/ai-connector/manage-http';
import { adminDb } from '@/lib/ai-connector/store';

export async function GET() {
  const auth = await requireViewer();
  if (!('viewer' in auth)) return auth;
  const { viewer } = auth;
  const config = getConfig();

  const db = adminDb();
  try {
    const policy = await loadPolicy(db, viewer.accountId);
    const connections = config.enabled
      ? await listConnections(db, viewer, policy)
      : [];
    return json({
      connector: {
        enabled: config.enabled,
        account_allowed:
          config.enabled && isAccountAllowed(config, viewer.accountId),
        mcp_url: config.enabled ? config.mcpUrl : null,
      },
      is_owner: viewer.role === 'owner',
      connections: connections.filter((c) => c.is_mine),
      team:
        viewer.role === 'owner' ? connections.filter((c) => !c.is_mine) : [],
      policy,
      policy_platforms: POLICY_PLATFORMS,
    });
  } catch (err) {
    console.error(
      '[ai-connectors] list failed:',
      err instanceof Error ? err.message : 'unknown'
    );
    return json({ error: 'Could not load AI connectors.' }, 500);
  }
}
