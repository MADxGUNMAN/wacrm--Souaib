import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import type {
  SuperAdminNotification,
  SuperAdminNotificationType,
} from '@/lib/super-admin/notification-store';

export const dynamic = 'force-dynamic';

const NOTIFICATION_TYPES: readonly SuperAdminNotificationType[] = [
  'account_created',
  'account_banned',
  'payment_requested',
  'payment_verified',
  'payment_rejected',
  'contact_submitted',
  'newsletter_subscribed',
  'template_rejected',
  'subscription_expiring',
];
const READ_FILTERS = ['all', 'unread', 'read'] as const;
const PAGE_SIZES = [10, 20, 50, 100] as const;

type ReadFilter = (typeof READ_FILTERS)[number];

type NotificationRow = SuperAdminNotification & { total_count: number };

interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
  recent24Hours: number;
  byType: Partial<Record<SuperAdminNotificationType, number>>;
}

const EMPTY_SUMMARY: NotificationSummary = {
  total: 0,
  unread: 0,
  critical: 0,
  recent24Hours: 0,
  byType: {},
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const adminContext = await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const { searchParams } = new URL(request.url);

    const page = parsePositiveInt(searchParams.get('page'), 1);
    const requestedPageSize = parsePositiveInt(
      searchParams.get('page_size') ?? searchParams.get('pageSize'),
      20
    );
    const pageSize = PAGE_SIZES.includes(
      requestedPageSize as (typeof PAGE_SIZES)[number]
    )
      ? requestedPageSize
      : 20;
    const read = searchParams.get('read') ?? 'all';
    const type = searchParams.get('type') ?? 'all';
    const search = (searchParams.get('search') ?? '').trim().slice(0, 120);

    if (!READ_FILTERS.includes(read as ReadFilter)) {
      return NextResponse.json(
        { error: 'Invalid read filter' },
        { status: 400 }
      );
    }
    if (
      type !== 'all' &&
      !NOTIFICATION_TYPES.includes(type as SuperAdminNotificationType)
    ) {
      return NextResponse.json(
        { error: 'Invalid notification type' },
        { status: 400 }
      );
    }

    const offset = (page - 1) * pageSize;
    const [listResult, summaryResult] = await Promise.all([
      admin.rpc('fn_sa_list_notifications_for_admin', {
        p_user_id: adminContext.userId,
        p_read_filter: read,
        p_type: type === 'all' ? null : type,
        p_search: search || null,
        p_limit: pageSize,
        p_offset: offset,
      }),
      admin.rpc('fn_sa_notification_summary_for_admin', {
        p_user_id: adminContext.userId,
      }),
    ]);

    if (listResult.error) {
      console.error(
        '[super-admin/notifications] list query failed:',
        listResult.error.message
      );
      return NextResponse.json(
        { error: 'Failed to load notifications' },
        { status: 500 }
      );
    }
    if (summaryResult.error) {
      console.error(
        '[super-admin/notifications] summary query failed:',
        summaryResult.error.message
      );
      return NextResponse.json(
        { error: 'Failed to load notification summary' },
        { status: 500 }
      );
    }

    const rows = (listResult.data ?? []) as unknown as NotificationRow[];
    const total = Number(rows[0]?.total_count ?? 0);
    const notifications = rows.map(({ total_count: totalCount, ...row }) => {
      void totalCount;
      return row;
    });
    const rawSummary = (summaryResult.data ?? {}) as Record<string, unknown>;
    const summary: NotificationSummary = {
      ...EMPTY_SUMMARY,
      total: Number(rawSummary.total ?? 0),
      unread: Number(rawSummary.unread ?? 0),
      critical: Number(rawSummary.critical ?? 0),
      recent24Hours: Number(rawSummary.recent_24_hours ?? 0),
      byType: (rawSummary.by_type ?? {}) as NotificationSummary['byType'],
    };

    return NextResponse.json({
      notifications,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      page,
      pageSize,
      unreadCount: summary.unread,
      summary,
    });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/notifications] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500 }
    );
  }
}
