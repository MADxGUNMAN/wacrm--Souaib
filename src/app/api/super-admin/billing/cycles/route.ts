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
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { ValidationError } from '@/lib/subscription/validation';

function buildCyclePatch(
  body: Record<string, unknown>,
  { isCreate }: { isCreate: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (isCreate || 'cycle_key' in body) {
    const key = typeof body.cycle_key === 'string' ? body.cycle_key.trim().toLowerCase() : '';
    if (!key) throw new ValidationError('Cycle key is required', 'cycle_key');
    if (!/^[a-z0-9_-]{2,40}$/.test(key)) {
      throw new ValidationError(
        'Cycle key must be 2-40 characters, lowercase letters, numbers, hyphen or underscore',
        'cycle_key',
      );
    }
    patch.cycle_key = key;
  }

  if (isCreate || 'label' in body) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) throw new ValidationError('Label is required', 'label');
    if (label.length > 40) {
      throw new ValidationError('Label must be 40 characters or fewer', 'label');
    }
    patch.label = label;
  }

  for (const field of ['unit_label', 'discount_label'] as const) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = raw === null ? null : String(raw).trim();
    if (value && value.length > 30) {
      throw new ValidationError('That label is too long (max 30 characters)', field);
    }
    patch[field] = value || null;
  }

  if ('months' in body) {
    const n = Number(body.months);
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      throw new ValidationError('Months must be a whole number between 0 and 120', 'months');
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
          'duration_days',
        );
      }
      patch.duration_days = n;
    }
  }

  for (const field of ['is_default', 'is_visible'] as const) {
    if (field in body) patch[field] = Boolean(body[field]);
  }

  if ('position' in body) {
    const n = Number(body.position);
    if (!Number.isInteger(n) || n < 0 || n > 999) {
      throw new ValidationError('Position must be a whole number between 0 and 999', 'position');
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
function assertDuration(merged: { months?: unknown; duration_days?: unknown }): void {
  const days = merged.duration_days == null ? 0 : Number(merged.duration_days);
  const months = merged.months == null ? 0 : Number(merged.months);
  if (days <= 0 && months <= 0) {
    throw new ValidationError(
      'A cycle needs either a month count or a duration in days, otherwise an approved payment would grant no access',
      'months',
    );
  }
}

/** Only one cycle may be the pre-selected default. */
async function clearOtherDefaults(exceptId: string | null): Promise<void> {
  const admin = supabaseAdmin();
  let query = admin.from('billing_cycles').update({ is_default: false }).eq('is_default', true);
  if (exceptId) query = query.neq('id', exceptId);
  const { error } = await query;
  if (error) {
    console.error('[super-admin/billing/cycles] clearing defaults failed:', error.message);
  }
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('billing_cycles')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cycles: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Failed to load billing cycles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildCyclePatch(body, { isCreate: true });
    if (!('months' in patch)) patch.months = 1;
    assertDuration(patch);

    if (!('position' in patch)) {
      const { data: last } = await admin
        .from('billing_cycles')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.position = (last?.position ?? -1) + 1;
    }

    const { data, error } = await admin
      .from('billing_cycles')
      .insert(patch)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A cycle with that key already exists', field: 'cycle_key' },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.is_default) await clearOtherDefaults(data.id);

    return NextResponse.json({ cycle: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/cycles] POST failed:', err);
    return NextResponse.json({ error: 'Failed to create billing cycle' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'Cycle id is required' }, { status: 400 });
    }

    const patch = buildCyclePatch(body, { isCreate: false });
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields were supplied' }, { status: 400 });
    }

    // Merge with the stored row before validating the duration — the
    // admin may only be sending the field they changed.
    const { data: existing, error: readErr } = await admin
      .from('billing_cycles')
      .select('months, duration_days')
      .eq('id', id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    }

    assertDuration({
      months: 'months' in patch ? patch.months : existing.months,
      duration_days:
        'duration_days' in patch ? patch.duration_days : existing.duration_days,
    });

    const { data, error } = await admin
      .from('billing_cycles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A cycle with that key already exists', field: 'cycle_key' },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.is_default) await clearOtherDefaults(data.id);

    return NextResponse.json({ cycle: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/cycles] PUT failed:', err);
    return NextResponse.json({ error: 'Failed to update billing cycle' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Cycle id is required' }, { status: 400 });
    }

    // Refuse to delete the last visible cycle: with none left, the
    // upgrade page has no toggle and nobody can buy anything.
    const { count: visibleCount } = await admin
      .from('billing_cycles')
      .select('id', { count: 'exact', head: true })
      .eq('is_visible', true);

    const { data: target } = await admin
      .from('billing_cycles')
      .select('is_visible')
      .eq('id', id)
      .maybeSingle();

    if (target?.is_visible && (visibleCount ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'This is the only visible billing cycle. Add another before deleting it, or customers will have nothing to buy.',
          code: 'last_visible_cycle',
        },
        { status: 409 },
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
    return NextResponse.json({ error: 'Failed to delete billing cycle' }, { status: 500 });
  }
}
