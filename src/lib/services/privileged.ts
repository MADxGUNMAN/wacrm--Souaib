// ============================================================
// The few operations a send needs that the user's (AI) JWT can't do:
// read the WhatsApp credentials, reserve the daily caps, create the
// broadcast rows. The AI connector binds them to ONE account and ONE
// connection (src/lib/ai-connector/privileged.ts), so a caller can't
// name another workspace. Services call them only after every check has
// passed under the user's own JWT ("narrow service-role use", 02 §3.5).
// ============================================================

import type {
  CreateBroadcastParams,
  BroadcastDeliveryMode,
} from '@/lib/whatsapp/broadcast-core';
import type {
  SendMessageParams,
  SendMessageResult,
} from '@/lib/whatsapp/send-message';

export interface UsageCaps {
  connectionMessagesPerDay: number;
  accountMessagesPerDay: number;
  accountBroadcastRecipientsPerDay: number;
  /** Days reset at 00:00 in this zone. */
  timezone: string;
}

export interface ReserveOutcome {
  allowed: boolean;
  connectionMessages: number;
  accountMessages: number;
  accountRecipients: number;
}

export interface CreatedBroadcast {
  broadcastId: string;
  recipients: number;
  suppressed: number;
  rejected: number;
  mode: BroadcastDeliveryMode;
}

export interface PrivilegedOps {
  caps: UsageCaps;
  /** Send through the shared core; `via_ai` and the sender are added. */
  sendMessage(
    params: Omit<SendMessageParams, 'viaAi' | 'senderUserId'>
  ): Promise<SendMessageResult>;
  /** Count against the daily caps BEFORE the side effect; never refunded. */
  reserve(usage: {
    messages?: number;
    broadcastRecipients?: number;
  }): Promise<ReserveOutcome>;
  /** Persist a scheduled broadcast; the cron sweep delivers it. */
  createBroadcast(
    params: Omit<CreateBroadcastParams, 'mode' | 'sourceRef'>
  ): Promise<CreatedBroadcast>;
}
