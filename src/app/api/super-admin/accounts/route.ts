// ============================================================
// GET /api/super-admin/accounts
//
// Returns paginated, searchable, filterable list of all accounts.
// Super admin only.
//
// Query params:
//   page      - Page number (default: 1)
//   pageSize  - Items per page (default: 20, max: 100)
//   search    - Search by account name, owner name, or email
//   status    - Filter: 'all' | 'active' | 'inactive' | 'banned'
//   whatsapp  - Filter: 'all' | 'connected' | 'disconnected'
//   sortBy    - Sort: 'newest' | 'oldest' | 'most_active' | 'most_members'
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getAccountsList } from '@/lib/super-admin/queries';
import type { AccountFilters } from '@/types/super-admin';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10))
    );

    const filters: AccountFilters = {
      status:
        (searchParams.get('status') as AccountFilters['status']) ?? 'all',
      whatsapp:
        (searchParams.get('whatsapp') as AccountFilters['whatsapp']) ?? 'all',
      search: searchParams.get('search') ?? undefined,
      sortBy:
        (searchParams.get('sortBy') as AccountFilters['sortBy']) ?? 'newest',
    };

    const result = await getAccountsList(page, pageSize, filters);

    return NextResponse.json({
      accounts: result.accounts,
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/accounts] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
