import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getAccountsList } from '@/lib/super-admin/queries';
import type { AccountFilters } from '@/types/super-admin';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);

    const { searchParams } = new URL(request.url);

    const filters: AccountFilters = {
      status:
        (searchParams.get('status') as AccountFilters['status']) ?? 'all',
      whatsapp:
        (searchParams.get('whatsapp') as AccountFilters['whatsapp']) ?? 'all',
      search: searchParams.get('search') ?? undefined,
      sortBy:
        (searchParams.get('sortBy') as AccountFilters['sortBy']) ?? 'newest',
    };

    // Fetch a large number to ensure all are exported, or ideally all that match the filter.
    // getAccountsList takes page and pageSize.
    const result = await getAccountsList(1, 10000, filters);
    const accounts = result.accounts;

    // Build CSV string
    const headers = [
      'Account ID',
      'Account Name',
      'Owner Email',
      'Members',
      'Contacts',
      'Messages (30d)',
      'WhatsApp Status',
      'Is Banned',
      'Created At',
    ];

    const rows = accounts.map((acc) => [
      acc.account_id,
      `"${(acc.account_name || '').replace(/"/g, '""')}"`,
      `"${(acc.owner_email || '').replace(/"/g, '""')}"`,
      acc.member_count,
      acc.contact_count,
      acc.messages_30d,
      acc.whatsapp_status === 'connected' ? 'Connected' : 'None',
      acc.is_banned ? 'Yes' : 'No',
      new Date(acc.account_created_at).toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="replai_accounts.csv"',
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/accounts/export] error:', err);
    return NextResponse.json(
      { error: 'Failed to export accounts' },
      { status: 500 }
    );
  }
}
