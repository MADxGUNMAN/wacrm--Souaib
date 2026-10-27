// ============================================================
// PrivilegedOps for one /mcp request, bound to the gate's account,
// user and connection. The service-role client never leaves this file.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrivilegedOps } from '@/lib/services/privileged';
import { createBroadcast } from '@/lib/whatsapp/broadcast-core';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { reserveUsage } from './caps';
import type { GateContext } from './gate';

/** No per-workspace timezone is stored yet; matches the analytics default. */
export const CAP_TIMEZONE = 'Asia/Kolkata';

export function privilegedOps(
  admin: SupabaseClient,
  gate: Pick<
    GateContext,
    'accountId' | 'userId' | 'connectionId' | 'platform' | 'settings' | 'policy'
  >
): PrivilegedOps {
  const caps = {
    connectionMessagesPerDay: gate.settings.caps.messages_per_day,
    accountMessagesPerDay: gate.policy.daily_message_cap,
    accountBroadcastRecipientsPerDay: gate.policy.daily_broadcast_recipient_cap,
    timezone: CAP_TIMEZONE,
  };
  const viaAi = { platform: gate.platform, connection_id: gate.connectionId };
  return {
    caps,
    sendMessage: (params) =>
      sendMessageToConversation(admin, gate.accountId, {
        ...params,
        senderUserId: gate.userId,
        viaAi,
      }),
    async reserve(usage) {
      const r = await reserveUsage(admin, {
        accountId: gate.accountId,
        connectionId: gate.connectionId,
        messages: usage.messages,
        broadcastRecipients: usage.broadcastRecipients,
        caps,
        timezone: caps.timezone,
      });
      return {
        allowed: r.allowed,
        connectionMessages: r.connectionMessages,
        accountMessages: r.accountMessages,
        accountRecipients: r.accountRecipients,
      };
    },
    async createBroadcast(params) {
      const plan = await createBroadcast(admin, gate.accountId, gate.userId, {
        ...params,
        mode: 'schedule',
        sourceRef: { via_ai: viaAi },
      });
      return {
        broadcastId: plan.broadcastId,
        recipients: plan.planned.length,
        suppressed: plan.suppressed,
        rejected: plan.rejected,
        mode: plan.mode,
      };
    },
  };
}
