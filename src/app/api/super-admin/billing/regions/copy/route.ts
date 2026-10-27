// ============================================================
// POST /api/super-admin/billing/regions/copy  { code }
//
// Start a country's localized plan from the Global structure: copies the
// Global billing cycles (labels, durations, order, default and
// recommended flags, visibility) and the Global page copy. It NEVER
// copies amounts: a country's prices are always entered in its own
// currency, so nothing can be sold at an INR number by accident.
//
// Only while the country has no cycles (409 otherwise), so it can never
// overwrite work. The country stays disabled. Super admin only.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  GLOBAL_REGION,
  REGION_SETTINGS_KEYS,
  isGlobalRegion,
  isRegionCode,
  regionCycleKey,
} from '@/lib/billing/pricing/regions';
import { requireSuperAdmin } from '@/lib/super-admin/guard';

export const dynamic = 'force-dynamic';

const CYCLE_FIELDS = [
  'label',
  'unit_label',
  'months',
  'duration_days',
  'discount_label',
  'is_default',
  'is_recommended',
  'recommended_label',
  'position',
] as const;

const UPI_KEYS = new Set(['upi_id', 'upi_payee_name']);

export async function POST(request: Request) {
  try {
    const { userId } = await requireSuperAdmin(request);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const code =
      typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!isRegionCode(code) || isGlobalRegion(code)) {
      return NextResponse.json(
        { error: 'Choose a country to copy into.', field: 'code' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const [existingCycles, globalCycles, globalSettings, regionRow] =
      await Promise.all([
        admin.from('billing_cycles').select('id').eq('region', code),
        admin
          .from('billing_cycles')
          .select('*')
          .eq('region', GLOBAL_REGION)
          .order('position'),
        admin.from('subscription_settings').select('*').limit(1).maybeSingle(),
        admin
          .from('pricing_regions')
          .select('code, currency, settings')
          .eq('code', code)
          .maybeSingle(),
      ]);
    const failed =
      existingCycles.error ??
      globalCycles.error ??
      globalSettings.error ??
      regionRow.error;
    if (failed) {
      return NextResponse.json({ error: failed.message }, { status: 500 });
    }
    if ((existingCycles.data ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            'This country already has billing cycles. Copy from Global only works on a country with none.',
          code: 'region_has_cycles',
        },
        { status: 409 }
      );
    }

    const rows = (globalCycles.data ?? []).map((raw) => {
      const g = raw as Record<string, unknown>;
      const row: Record<string, unknown> = {
        region: code,
        cycle_key: regionCycleKey(code, String(g.cycle_key)),
        // Regional cycles stay invisible to code without region support.
        is_visible: false,
        is_visible_in_region: Boolean(g.is_visible),
      };
      for (const f of CYCLE_FIELDS) row[f] = g[f] ?? null;
      return row;
    });

    if (rows.length > 0) {
      const { error } = await admin.from('billing_cycles').insert(rows);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Page copy only. UPI payee only for an INR country.
    const region = regionRow.data as {
      currency?: string | null;
      settings?: Record<string, unknown> | null;
    } | null;
    const inr = (region?.currency ?? '').toUpperCase() === 'INR';
    const global = (globalSettings.data ?? {}) as Record<string, unknown>;
    const copied: Record<string, unknown> = { ...(region?.settings ?? {}) };
    for (const key of REGION_SETTINGS_KEYS) {
      if (UPI_KEYS.has(key) && !inr) continue;
      const value = global[key];
      if (value === null || value === undefined || value === '') continue;
      copied[key] = value;
    }

    const { error: settingsErr } = region
      ? await admin
          .from('pricing_regions')
          .update({ settings: copied, updated_by_user_id: userId })
          .eq('code', code)
      : await admin.from('pricing_regions').insert({
          code,
          settings: copied,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        });
    if (settingsErr) {
      return NextResponse.json({ error: settingsErr.message }, { status: 500 });
    }

    return NextResponse.json({ copiedCycles: rows.length }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/regions/copy] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to copy from Global' },
      { status: 500 }
    );
  }
}
