// ============================================================
// /api/super-admin/billing/settings
//
// GET — read the settings singleton
// PUT — update it (trial length, UPI payee, all page copy)
//
// Super admin only.
//
// Fields are WHITELISTED rather than spread from the request body. A
// blind `.update(body)` would let a crafted request write `id`,
// `created_at`, or any column added by a future migration — and on this
// table it would also allow flipping `is_enabled` or `upi_id` through a
// field the UI never exposes. The explicit map is the access-control
// boundary, so adding a setting means deciding, deliberately, that it is
// editable.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { isValidUpiId } from '@/lib/subscription/upi';
import { ValidationError } from '@/lib/subscription/validation';

/** Text columns an admin may edit, mapped from their JSON key. */
const TEXT_FIELDS = [
  'upi_id',
  'upi_payee_name',
  'currency',
  'page_heading',
  'page_subheading',
  'cycle_hint',
  'selected_plan_label',
  'total_label',
  'save_label',
  'continue_label',
  'equals_label',
  'payment_heading',
  'payment_instructions',
  'submit_button_label',
  'pending_review_message',
  'support_note',
  'trial_banner_template',
  'trial_banner_cta',
  'expired_heading',
  'free_plan_label',
  'free_plan_subtitle',
  'member_blocked_heading',
  'member_blocked_body',
  'member_blocked_note',
  'member_blocked_contact_label',
] as const;

/** Columns with a NOT NULL constraint — reject an attempt to clear them. */
const REQUIRED_TEXT_FIELDS = new Set<string>([
  'currency',
  'page_heading',
  'selected_plan_label',
  'total_label',
  'save_label',
  'continue_label',
  'equals_label',
  'payment_heading',
  'submit_button_label',
  'trial_banner_template',
  'trial_banner_cta',
  'free_plan_label',
  'free_plan_subtitle',
  'member_blocked_heading',
  'member_blocked_contact_label',
]);

const BOOLEAN_FIELDS = ['is_enabled', 'member_blocked_show_owner_contact'] as const;
const INTEGER_FIELDS = ['trial_days', 'grace_days'] as const;

function buildPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = raw === null ? null : String(raw).trim();

    if (REQUIRED_TEXT_FIELDS.has(field) && !value) {
      throw new ValidationError(`${field.replace(/_/g, ' ')} cannot be empty`, field);
    }
    if (value && value.length > 2000) {
      throw new ValidationError('That text is too long (max 2000 characters)', field);
    }
    patch[field] = value === '' ? null : value;
  }

  // UPI ID gets real validation: a typo here silently breaks every QR
  // the platform generates, and the failure only shows up when a
  // customer's payment goes nowhere. Allow clearing it (disables
  // payments cleanly) but never allow a malformed value.
  if ('upi_id' in patch && patch.upi_id) {
    if (!isValidUpiId(String(patch.upi_id))) {
      throw new ValidationError(
        'That does not look like a UPI ID. Expected something like name@bank.',
        'upi_id',
      );
    }
  }

  if ('currency' in patch && patch.currency) {
    const code = String(patch.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new ValidationError('Currency must be a 3-letter code, e.g. INR', 'currency');
    }
    patch.currency = code;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (field in body) patch[field] = Boolean(body[field]);
  }

  for (const field of INTEGER_FIELDS) {
    if (!(field in body)) continue;
    const n = Number(body[field]);
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      throw new ValidationError(
        `${field.replace(/_/g, ' ')} must be a whole number between 0 and 3650`,
        field,
      );
    }
    patch[field] = n;
  }

  return patch;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('subscription_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to load subscription settings' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildPatch(body);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields were supplied' },
        { status: 400 },
      );
    }

    // The table is a singleton enforced by a unique index on a constant,
    // so find the existing row rather than assuming an id. If it's
    // somehow missing (fresh DB where the seed didn't run), insert
    // instead of failing — the admin's edit becomes the initial row.
    const { data: existing } = await admin
      .from('subscription_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: inserted, error: insertErr } = await admin
        .from('subscription_settings')
        .insert(patch)
        .select('*')
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      return NextResponse.json({ settings: inserted });
    }

    const { data, error } = await admin
      .from('subscription_settings')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status },
      );
    }
    console.error('[super-admin/billing/settings] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update subscription settings' },
      { status: 500 },
    );
  }
}
