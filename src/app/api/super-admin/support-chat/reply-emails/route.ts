import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import {
  SUPPORT_MESSAGES_TABLE,
  SUPPORT_REPLY_EMAIL_STATUSES as STATUSES,
  type SupportReplyEmailEntry,
  type SupportReplyEmailStatus as Status,
} from '@/lib/support-chat/types';

// ============================================================
// GET /api/super-admin/support-chat/reply-emails
//
// The "Support replied" email log: who each email went to, when, which
// operator reply caused it, and whether it was delivered.
//
// Reads the idempotency ledger the cron writes (support_reply_emails).
// That table is service-role only (RLS on, no policies), so this route is
// the only way to see it — and it is super-admin gated.
//
// Query: page, pageSize (≤100), status (all|sent|failed|skipped|pending),
// search (workspace name, member name or email).
// ============================================================

export const dynamic = 'force-dynamic';

const TABLE = 'support_reply_emails';

interface LedgerRow {
  id: string;
  conversation_id: string;
  message_id: string;
  account_id: string | null;
  recipients: string[] | null;
  status: Status;
  detail: string | null;
  created_at: string;
  accounts: { name: string | null } | null;
}

interface MessageRow {
  id: string;
  content_type: string;
  content_text: string | null;
  media_filename: string | null;
  sender_user_id: string | null;
  deleted_at: string | null;
  created_at: string;
}

const PREVIEW_MAX = 140;

function previewOf(m: MessageRow): string {
  if (m.deleted_at) return 'Message deleted';
  const text = m.content_text?.trim();
  if (text) {
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
  }
  switch (m.content_type) {
    case 'image':
      return '[Photo]';
    case 'audio':
      return '[Voice message]';
    case 'document':
      return m.media_filename ? `[File] ${m.media_filename}` : '[File]';
    default:
      return '[Message]';
  }
}

/** Strip PostgREST filter metacharacters from user input. */
function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[%,()*\\]/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const page = Math.max(
      1,
      parseInt(searchParams.get('page') || '1', 10) || 1
    );
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20)
    );
    const statusParam = searchParams.get('status') || 'all';
    const status = (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as Status)
      : null;
    const search = sanitizeSearch(searchParams.get('search') || '');

    // ---- Search → the set of workspaces it can refer to ----
    //
    // Recipients are always members of the workspace (see
    // resolveRecipients in reply-email.ts), so matching the workspace name
    // or any member's name/email and filtering by account covers every
    // recipient without needing a text search over the array column.
    let accountFilter: string[] | null = null;
    if (search) {
      const pattern = `%${search}%`;
      const [byName, byMember] = await Promise.all([
        admin.from('accounts').select('id').ilike('name', pattern).limit(500),
        admin
          .from('profiles')
          .select('account_id')
          .or(`email.ilike.${pattern},full_name.ilike.${pattern}`)
          .limit(500),
      ]);
      const ids = new Set<string>();
      for (const r of byName.data ?? []) ids.add(r.id as string);
      for (const r of byMember.data ?? []) {
        if (r.account_id) ids.add(r.account_id as string);
      }
      accountFilter = [...ids];
      if (accountFilter.length === 0) {
        return NextResponse.json({
          entries: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
          counts: await statusCounts(admin),
        });
      }
    }

    let query = admin
      .from(TABLE)
      .select(
        'id, conversation_id, message_id, account_id, recipients, status, detail, created_at, accounts(name)',
        { count: 'exact' }
      );
    if (status) query = query.eq('status', status);
    if (accountFilter) query = query.in('account_id', accountFilter);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(
        '[super-admin/support-chat/reply-emails] query failed:',
        error.message
      );
      return NextResponse.json(
        { error: 'Failed to load the reply email log' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as LedgerRow[];

    // ---- The replies that triggered them (message_id is not an FK) ----
    const messageIds = rows.map((r) => r.message_id);
    const messages = new Map<string, MessageRow>();
    if (messageIds.length > 0) {
      const { data: msgs } = await admin
        .from(SUPPORT_MESSAGES_TABLE)
        .select(
          'id, content_type, content_text, media_filename, sender_user_id, deleted_at, created_at'
        )
        .in('id', messageIds);
      for (const m of (msgs ?? []) as MessageRow[]) messages.set(m.id, m);
    }

    const senderIds = [
      ...new Set(
        [...messages.values()]
          .map((m) => m.sender_user_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const senderNames = new Map<string, string | null>();
    if (senderIds.length > 0) {
      const { data: senders } = await admin
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', senderIds);
      for (const s of senders ?? []) {
        senderNames.set(
          s.user_id as string,
          (s.full_name as string | null) || (s.email as string | null) || null
        );
      }
    }

    const entries: SupportReplyEmailEntry[] = rows.map((r) => {
      const m = messages.get(r.message_id);
      return {
        id: r.id,
        conversationId: r.conversation_id,
        accountId: r.account_id,
        accountName: r.accounts?.name ?? null,
        recipients: r.recipients ?? [],
        status: r.status,
        detail: r.detail,
        emailedAt: r.created_at,
        reply: m
          ? {
              preview: previewOf(m),
              sentAt: m.created_at,
              senderName: m.sender_user_id
                ? (senderNames.get(m.sender_user_id) ?? null)
                : null,
              deleted: Boolean(m.deleted_at),
            }
          : null,
      };
    });

    const total = count ?? 0;
    return NextResponse.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: await statusCounts(admin),
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/support-chat/reply-emails] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load the reply email log' },
      { status: 500 }
    );
  }
}

/** All-time tallies per status, independent of the current filter. */
async function statusCounts(
  admin: ReturnType<typeof supabaseAdmin>
): Promise<Record<Status, number>> {
  const pairs = await Promise.all(
    STATUSES.map(async (s) => {
      const { count } = await admin
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      return [s, count ?? 0] as const;
    })
  );
  return Object.fromEntries(pairs) as Record<Status, number>;
}
