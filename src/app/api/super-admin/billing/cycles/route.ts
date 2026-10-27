// ============================================================
// /api/super-admin/billing/cycles
//
// GET    — all billing cycles, including hidden
// POST   — create a cycle
// PUT    — update a cycle
// DELETE — delete a cycle (?id=…)
//
// Super admin only.
//
// A cycle is load-bearing in a way a plan is not: `months` /
// `duration_days` decide how long an approved payment grants access
// for. A cycle with no duration would approve a payment into an
// already-expired subscription, so the duration rules are enforced here
// as well as by a CHECK constraint.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  GLOBAL_REGION,
  isGlobalRegion,
  parseRegionParam,
  regionCycleKey,
  stripRegionCycleKey,
} from '@/lib/billing/pricing/regions';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { cycleRowVisible } from '@/lib/subscription/queries';
import { ValidationError } from '@/lib/subscription/validation';

// ------------------------------------------------------------
// Localized pricing (see docs/razopay/localized-pricing-report.md)
//
// Every cycle belongs to one region: 'global' or a country code. A
// country cycle is stored with `is_visible = false` (a CHECK enforces it)
// so code without region support never shows or sells it; its real
// visibility lives in `is_visible_in_region`. The editor always works
// with plain `is_visible`, and this route maps it. Country keys get a
// '<code>-' prefix so `cycle_key` stays globally unique.
// ------------------------------------------------------------

function invalidRegion(): NextResponse {
  return NextResponse.json(
    { error: 'Unknown pricing region', field: 'region' },
    { status: 400 }
  );
}

/** Store-side mapping of an editor patch for a region. */
function mapPatchForRegion(
  patch: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  if (isGlobalRegion(region)) return patch;
  const out = { ...patch };
  if ('cycle_key' in out) {
    out.cycle_key = regionCycleKey(region, String(out.cycle_key));
  }
  if ('is_visible' in out) {
    out.is_visible_in_region = Boolean(out.is_visible);
  }
  out.is_visible = false;
  return out;
}

/** Editor-side view of a stored row: plain key and mapped visibility. */
function toEditorCycle(row: Record<string, unknown>): Record<string, unknown> {
  const region = String(row.region ?? GLOBAL_REGION);
  if (isGlobalRegion(region)) return row;
  return {
    ...row,
    cycle_key: stripRegionCycleKey(region, String(row.cycle_key ?? '')),
    is_visible: cycleRowVisible(row),
  };
}

function buildCyclePatch(
  body: Record<string, unknown>,
  { isCreate }: { isCreate: boolean }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (isCreate || 'cycle_key' in body) {
    const key =
      typeof body.cycle_key === 'string'
        ? body.cycle_key.trim().toLowerCase()
        : '';
    if (!key) throw new ValidationError('Cycle key is required', 'cycle_key');
    if (!/^[a-z0-9_-]{2,40}$/.test(key)) {
      throw new ValidationError(
        'Cycle key must be 2-40 characters, lowercase letters, numbers, hyphen or underscore',
        'cycle_key'
      );
    }
    patch.cycle_key = key;
  }

  if (isCreate || 'label' in body) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) throw new ValidationError('Label is required', 'label');
    if (label.length > 40) {
      throw new ValidationError(
        'Label must be 40 characters or fewer',
        'label'
      );
    }
    patch.label = label;
  }

  for (const field of [
    'unit_label',
    'discount_label',
    'recommended_label',
  ] as const) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = raw === null ? null : String(raw).trim();
    if (value && value.length > 30) {
      throw new ValidationError(
        'That label is too long (max 30 characters)',
        field
      );
    }
    patch[field] = value || null;
  }

  if ('months' in body) {
    const n = Number(body.months);
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      throw new ValidationError(
        'Months must be a whole number between 0 and 120',
        'months'
      );
    }
    patch.months = n;
  }

  if ('duration_days' in body) {
    const raw = body.duration_days;
    if (raw === null || raw === '') {
      patch.duration_days = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0 || n > 3650) {
        throw new ValidationError(
          'Duration in days must be a whole number between 1 and 3650, or blank',
          'duration_days'
        );
      }
      patch.duration_days = n;
    }
  }

  for (const field of ['is_default', 'is_visible', 'is_recommended'] as const) {
    if (field in body) patch[field] = Boolean(body[field]);
  }

  if ('position' in body) {
    const n = Number(body.position);
    if (!Number.isInteger(n) || n < 0 || n > 999) {
      throw new ValidationError(
        'Position must be a whole number between 0 and 999',
        'position'
      );
    }
    patch.position = n;
  }

  return patch;
}

/**
 * A cycle must resolve to a real span. On create we can check the patch
 * alone; on update we have to merge with the stored row, because the
 * admin may be clearing `duration_days` while relying on an existing
 * `months` they didn't resubmit.
 */
function assertDuration(merged: {
  months?: unknown;
  duration_days?: unknown;
}): void {
  const days = merged.duration_days == null ? 0 : Number(merged.duration_days);
  const months = merged.months == null ? 0 : Number(merged.months);
  if (days <= 0 && months <= 0) {
    throw new ValidationError(
      'A cycle needs either a month count or a duration in days, otherwise an approved payment would grant no access',
      'months'
    );
  }
}

/** Only one cycle per region may be the pre-selected default. */
async function clearOtherDefaults(
  exceptId: string | null,
  region: string = GLOBAL_REGION
): Promise<void> {
  const admin = supabaseAdmin();
  let query = admin
    .from('billing_cycles')
    .update({ is_default: false })
    .eq('region', region)
    .eq('is_default', true);
  if (exceptId) query = query.neq('id', exceptId);
  const { error } = await query;
  if (error) {
    console.error(
      '[super-admin/billing/cycles] clearing defaults failed:',
      error.message
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const region = parseRegionParam(
      new URL(request.url).searchParams.get('region')
    );
    if (!region) return invalidRegion();
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('billing_cycles')
      .select('*')
      .eq('region', region)
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      cycles: (data ?? []).map((r) =>
        toEditorCycle(r as Record<string, unknown>)
      ),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to load billing cycles' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const region = parseRegionParam(
      typeof body.region === 'string'
        ? body.region
        : new URL(request.url).searchParams.get('region')
    );
    if (!region) return invalidRegion();
    const patch = buildCyclePatch(body, { isCreate: true });
    if (!('months' in patch)) patch.months = 1;
    assertDuration(patch);

    if (!('position' in patch)) {
      const { data: last } = await admin
        .from('billing_cycles')
        .select('position')
        .eq('region', region)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.position = (last?.position ?? -1) + 1;
    }

    // A new country cycle is visible within its region unless the
    // editor said otherwise (the Global column default is visible too).
    if (!isGlobalRegion(region) && !('is_visible' in patch)) {
      patch.is_visible = true;
    }
    const row = { ...mapPatchForRegion(patch, region), region };

    const { data, error } = await admin
      .from('billing_cycles')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A cycle with that key already exists', field: 'cycle_key' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.is_default) await clearOtherDefaults(data.id, region);

    return NextResponse.json(
      { cycle: toEditorCycle(data as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    console.error('[super-admin/billing/cycles] POST failed:', err);
    return NextResponse.json(
      { error: 'Failed to create billing cycle' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json(
        { error: 'Cycle id is required' },
        { status: 400 }
      );
    }

    const patch = buildCyclePatch(body, { isCreate: false });
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields were supplied' },
        { status: 400 }
      );
    }

    // Merge with the stored row before validating the duration — the
    // admin may only be sending the field they changed.
    // The stored row decides the region; the body never can.
    const { data: existing, error: readErr } = await admin
      .from('billing_cycles')
      .select('months, duration_days, region')
      .eq('id', id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Billing cycle not found' },
        { status: 404 }
      );
    }

    assertDuration({
      months: 'months' in patch ? patch.months : existing.months,
      duration_days:
        'duration_days' in patch ? patch.duration_days : existing.duration_days,
    });

    const region = String(
      (existing as { region?: string | null }).region ?? GLOBAL_REGION
    );

    const { data, error } = await admin
      .from('billing_cycles')
      .update(mapPatchForRegion(patch, region))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A cycle with that key already exists', field: 'cycle_key' },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.is_default) await clearOtherDefaults(data.id, region);

    return NextResponse.json({
      cycle: toEditorCycle(data as Record<string, unknown>),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      );
    }
    console.error('[super-admin/billing/cycles] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update billing cycle' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'Cycle id is required' },
        { status: 400 }
      );
    }

    // Refuse to delete the last visible cycle of a region customers can
    // see: with none left, the upgrade page has no toggle and nobody can
    // buy anything. Global always counts; a country only while enabled
    // (a disabled country's customers see Global anyway).
    const { data: target } = await admin
      .from('billing_cycles')
      .select('is_visible, is_visible_in_region, region')
      .eq('id', id)
      .maybeSingle();

    const region = String(
      (target as { region?: string | null } | null)?.region ?? GLOBAL_REGION
    );
    const isGlobal = isGlobalRegion(region);
    let guarded = isGlobal;
    if (!isGlobal) {
      const { data: regionRow } = await admin
        .from('pricing_regions')
        .select('is_enabled')
        .eq('code', region)
        .maybeSingle();
      guarded = Boolean(
        (regionRow as { is_enabled?: boolean } | null)?.is_enabled
      );
    }

    const visibleColumn = isGlobal ? 'is_visible' : 'is_visible_in_region';
    const { count: visibleCount } = guarded
      ? await admin
          .from('billing_cycles')
          .select('id', { count: 'exact', head: true })
          .eq('region', region)
          .eq(visibleColumn, true)
      : { count: null };

    const targetVisible = target
      ? cycleRowVisible(target as Record<string, unknown>)
      : false;

    if (guarded && targetVisible && (visibleCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'This is the only visible billing cycle. Add another before deleting it, or customers will have nothing to buy.',
          code: 'last_visible_cycle',
        },
        { status: 409 }
      );
    }

    // Deleting cascades to the prices for this cycle (FK ON DELETE
    // CASCADE). payment_requests keep their label snapshot, so historic
    // receipts still read correctly.
    const { error } = await admin.from('billing_cycles').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/cycles] DELETE failed:', err);
    return NextResponse.json(
      { error: 'Failed to delete billing cycle' },
      { status: 500 }
    );
  }
}
