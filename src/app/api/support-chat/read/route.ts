// ============================================================
// POST /api/support-chat/read — mark the thread read for the caller
//
// Zeroes only the CALLER's unread counter and stamps `read_at` on the
// other side's messages. Which side that is comes from the session, so
// neither party can clear the other's badge or forge a receipt on their
// own messages.
// ============================================================

import { NextResponse } from 'next/server';

import {
  findOrCreateSupportConversation,
  resolveSupportCaller,
  supportErrorResponse,
} from '@/lib/support-chat/access';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const body = (raw ?? {}) as Record<string, unknown>;

    const caller = await resolveSupportCaller(
      typeof body.accountId === 'string' ? body.accountId : null
    );

    const conversation = await findOrCreateSupportConversation(
      caller.admin,
      caller.accountId
    );

    const { error } = await caller.admin.rpc('fn_support_chat_mark_read', {
      p_conversation_id: conversation.id,
      p_as_admin: caller.senderKind === 'admin',
    });

    if (error) {
      console.error('[support-chat/read] mark-read failed:', error);
      return NextResponse.json(
        { error: 'Could not mark the conversation read.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { body, status } = supportErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
