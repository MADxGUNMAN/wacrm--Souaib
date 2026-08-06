// ============================================================
// /api/super-admin/billing/plans
//
// GET    — all plans (including hidden) + all cycles + all prices,
//          so the editor can render the full price matrix in one load
// POST   — create a plan
// PUT    — update a plan
// DELETE — delete a plan (?id=…)
//
// Super admin only. Fields are whitelisted, not spread — see the note
// in ../settings/route.ts.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { getPlansBundle } from '@/lib/subscription/queries';
import { normalisePlanFeatures, serialisePlanFeatures } from '@/lib/subscription/plans';
import { ValidationError } from '@/lib/subscription/validation';

function buildPlanPatch(
  body: Record<string, unknown>,
  { requireName }: { requireName: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if ('name' in body || requireName) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new ValidationError('Plan name is required', 'name');
    }
    if (name.length > 60) {
      throw new ValidationError('Plan name must be 60 characters or fewer', 'name');
    }
    patch.name = name;
  }

  for (const field of ['tagline', 'description', 'features_heading', 'cta_text', 'highlight_label'] as const) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = raw === null ? null : String(raw).trim();
    if (value && value.length > 500) {
      throw new ValidationError('That text is too long (max 500 characters)', field);
    }
    patch[field] = value || null;
  }

  if ('features' in body) {
    // Round-trip through the normaliser so bare strings, `{label}`
    // objects, and junk all converge on one stored shape. Without this
    // the reader would have to defend against every historical shape
    // forever.
    const features = serialisePlanFeatures(normalisePlanFeatures(body.features));
    if (features.length > 40) {
      throw new ValidationError('A plan can list at most 40 features', 'features');
    }
    patch.features = features;
  }

  for (const field of ['is_highlighted', 'is_visible'] as const) {
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

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    // includeHidden: the editor must see what customers cannot.
    const bundle = await getPlansBundle({ includeHidden: true });
    return NextResponse.json(bundle);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildPlanPatch(body, { requireName: true });

    // Default a new plan to the end of the list rather than position 0,
    // so creating one doesn't reshuffle the existing page order.
    if (!('position' in patch)) {
      const { data: last } = await admin
        .from('subscription_plans')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.position = (last?.position ?? -1) + 1;
    }

    const { data, error } = await admin
      .from('subscription_plans')
      .insert(patch)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plan: data }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/plans] POST failed:', err);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });
    }

    const patch = buildPlanPatch(body, { requireName: false });
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields were supplied' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('subscription_plans')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plan: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/plans] PUT failed:', err);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });
    }

    // Warn (don't block) when accounts are still on this plan. The FK is
    // ON DELETE SET NULL and payment_requests keep a name snapshot, so
    // deleting is safe for history — but an admin deleting a plan 40
    // customers are paying for should know before it vanishes from
    // their subscription details.
    const { count } = await admin
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_plan_id', id);

    const force = searchParams.get('force') === 'true';
    if ((count ?? 0) > 0 && !force) {
      return NextResponse.json(
        {
          error: `${count} account(s) are currently on this plan. Their subscription stays active and their payment history is preserved, but the plan reference will be cleared. Re-send with force=true to confirm.`,
          code: 'plan_in_use',
          affectedAccounts: count,
        },
        { status: 409 },
      );
    }

    const { error } = await admin.from('subscription_plans').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/plans] DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
