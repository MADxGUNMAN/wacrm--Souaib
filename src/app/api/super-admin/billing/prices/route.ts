// ============================================================
// /api/super-admin/billing/prices
//
// PUT    — upsert the price for one (plan, cycle) pair
// DELETE — remove a price (?planId=…&cycleId=…), i.e. make that plan
//          unavailable on that cycle
//
// Super admin only.
//
// This is the endpoint that makes the QR requirement work: the amount
// written here is read back by `resolveQuote` on every quote and every
// submission, so changing 1,000 to 2,000 here changes the very next QR
// generated. There is no cache to invalidate and no build step.
//
// Upsert rather than separate create/update because the editor renders a
// plan x cycle grid — a cell either has a price or it doesn't, and the
// admin shouldn't have to care which HTTP verb that implies.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { toAmount } from '@/lib/subscription/plans';
import { ValidationError } from '@/lib/subscription/validation';

/**
 * Parse a money value from the admin form.
 *
 * Tolerates grouping separators and a currency symbol, because an admin
 * will paste "12,300" or "₹12,300". Rounded to paise — a price of
 * 2799.999 would be encoded into a UPI intent as "2800.00", so the
 * stored value and the charged value must not be allowed to diverge.
 */
function parseAmount(value: unknown, field: string, label: string): number {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${label} is required`, field);
  }
  const n =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));

  if (!Number.isFinite(n)) {
    throw new ValidationError(`${label} must be a number`, field);
  }
  if (n < 0) {
    throw new ValidationError(`${label} cannot be negative`, field);
  }
  if (n > 9_999_999_999) {
    throw new ValidationError(`${label} is too large`, field);
  }
  return Math.round(n * 100) / 100;
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const planId = typeof body.plan_id === 'string' ? body.plan_id : '';
    const cycleId = typeof body.cycle_id === 'string' ? body.cycle_id : '';

    if (!planId || !cycleId) {
      return NextResponse.json(
        { error: 'plan_id and cycle_id are required' },
        { status: 400 },
      );
    }

    const amount = parseAmount(body.amount, 'amount', 'Price');

    // A zero price would generate a ₹0 UPI intent, which apps either
    // reject or reinterpret as "payer enters the amount" — unverifiable
    // in a manual flow. If a tier should be free, it doesn't belong in
    // the paid catalogue.
    if (amount === 0) {
      throw new ValidationError(
        'A price must be greater than zero. To make this plan unavailable on this cycle, delete the price instead.',
        'amount',
      );
    }

    let compareAt: number | null = null;
    if (body.compare_at_amount !== undefined && body.compare_at_amount !== null && body.compare_at_amount !== '') {
      compareAt = parseAmount(body.compare_at_amount, 'compare_at_amount', 'Compare-at price');
      if (compareAt <= amount) {
        // A compare-at at or below the price would render a negative or
        // zero "Save X", which reads as broken rather than persuasive.
        throw new ValidationError(
          'The compare-at price must be higher than the actual price, or leave it blank to calculate the saving automatically.',
          'compare_at_amount',
        );
      }
    }

    // Display-only override for the per-day headline on /upgrade-plan.
    // Blank is the normal case: the page then derives the rate from
    // `amount / cycle.duration_days`, which cannot disagree with what is
    // actually charged. The override exists purely to round an awkward
    // division (950 / 30 = 31.666…) for display.
    let perDay: number | null = null;
    if (
      body.per_day_amount !== undefined &&
      body.per_day_amount !== null &&
      body.per_day_amount !== ''
    ) {
      perDay = parseAmount(body.per_day_amount, 'per_day_amount', 'Per-day price');
      if (perDay <= 0) {
        throw new ValidationError(
          'The per-day price must be greater than zero, or leave it blank to calculate it automatically.',
          'per_day_amount',
        );
      }
      if (perDay > amount) {
        // A daily rate above the whole term's price is always a typo, and
        // it would advertise a number higher than the customer pays.
        throw new ValidationError(
          'The per-day price cannot exceed the total price for the term.',
          'per_day_amount',
        );
      }
    }

    const isVisible = body.is_visible === undefined ? true : Boolean(body.is_visible);

    const { data, error } = await admin
      .from('subscription_plan_prices')
      .upsert(
        {
          plan_id: planId,
          cycle_id: cycleId,
          amount,
          compare_at_amount: compareAt,
          per_day_amount: perDay,
          is_visible: isVisible,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'plan_id,cycle_id' },
      )
      .select('*')
      .single();

    if (error) {
      // 23503 = foreign_key_violation: a stale plan or cycle id from an
      // editor tab left open while the other was deleted elsewhere.
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'That plan or billing cycle no longer exists. Reload and try again.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      price: { ...data, amount: toAmount(data.amount) },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('[super-admin/billing/prices] PUT failed:', err);
    return NextResponse.json({ error: 'Failed to save price' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId');
    const cycleId = searchParams.get('cycleId');

    if (!planId || !cycleId) {
      return NextResponse.json(
        { error: 'planId and cycleId are required' },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from('subscription_plan_prices')
      .delete()
      .eq('plan_id', planId)
      .eq('cycle_id', cycleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Existing subscriptions are unaffected: accounts keep their window
    // and payment_requests keep their snapshots. Only new purchases on
    // this combination become impossible.
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/billing/prices] DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete price' }, { status: 500 });
  }
}
