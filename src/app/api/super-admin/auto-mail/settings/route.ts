// ============================================================
// /api/super-admin/auto-mail/settings
//
// GET — both segment rules
// PUT — update ONE segment's rule (the body must name the segment)
//
// Super admin only.
//
// Fields are whitelisted rather than spread from the body, for the same
// reason as /api/super-admin/billing/settings: a blind `.update(body)`
// would let a crafted request write `id`, `segment`, `created_at`, or any
// column a later migration adds. The explicit map is the access-control
// boundary — adding a setting means deciding, deliberately, that an
// operator may edit it.
//
// PUT takes one segment at a time on purpose. The whole point of the
// row-per-segment schema is that trial and paid configuration cannot leak
// into each other, and a single endpoint accepting both at once would
// reintroduce exactly that risk in application code.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import {
  AUTO_EMAIL_SEGMENTS,
  type AutoEmailSegment,
} from '@/lib/auto-mail/types';
import { ValidationError } from '@/lib/subscription/validation';

export const dynamic = 'force-dynamic';

const TEXT_FIELDS = [
  'subject_template',
  'heading_template',
  'body_template',
  'cta_label',
  'cta_path',
  'footer_note',
] as const;

/** Everything except the footnote, which an operator may legitimately clear. */
const REQUIRED_TEXT_FIELDS = new Set<string>([
  'subject_template',
  'heading_template',
  'body_template',
  'cta_label',
  'cta_path',
]);

/** A body is prose; a subject is one line. Different ceilings. */
const MAX_LENGTHS: Record<string, number> = {
  subject_template: 200,
  heading_template: 200,
  body_template: 5000,
  cta_label: 60,
  cta_path: 300,
  footer_note: 500,
};

/** Most stages anyone has a real use for. Guards against a paste accident. */
const MAX_STAGES = 5;
/** A year out. Beyond that the reminder is noise, not a warning. */
const MAX_OFFSET_DAYS = 365;

function buildPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    const value = raw === null ? null : String(raw).trim();

    if (REQUIRED_TEXT_FIELDS.has(field) && !value) {
      throw new ValidationError(
        `${field.replace(/_/g, ' ')} cannot be empty`,
        field
      );
    }
    const max = MAX_LENGTHS[field] ?? 2000;
    if (value && value.length > max) {
      throw new ValidationError(
        `That text is too long (max ${max} characters)`,
        field
      );
    }
    patch[field] = value === '' ? null : value;
  }

  // The CTA is stored as a path so one rule row works in every
  // environment. An absolute URL is allowed (an operator may want to
  // point at a docs page), but only over http(s) — a `javascript:` or
  // `data:` target would put a live script link in outgoing mail.
  if (typeof patch.cta_path === 'string') {
    const path = patch.cta_path;
    const isRelative = path.startsWith('/');
    const isHttp = /^https?:\/\//i.test(path);
    if (!isRelative && !isHttp) {
      throw new ValidationError(
        'The button link must start with / for an in-app page, or with http(s):// for an external one.',
        'cta_path'
      );
    }
  }

  if ('is_enabled' in body) patch.is_enabled = Boolean(body.is_enabled);

  if ('offsets_days' in body) {
    const raw = body.offsets_days;
    if (!Array.isArray(raw)) {
      throw new ValidationError(
        'Reminder days must be a list of whole numbers.',
        'offsets_days'
      );
    }

    const cleaned = [
      ...new Set(
        raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
      ),
      // Descending so the stored order matches how the stages actually
      // fire, which is what the settings UI reads back.
    ].sort((a, b) => b - a);

    // A silently-dropped entry is worse than a rejection: the operator
    // would believe they had configured a stage that never fires.
    if (cleaned.length !== raw.length) {
      const hadDuplicates = new Set(raw.map(Number)).size !== raw.length;
      throw new ValidationError(
        hadDuplicates
          ? 'Remove the duplicate reminder days.'
          : 'Reminder days must be whole numbers greater than zero.',
        'offsets_days'
      );
    }
    if (cleaned.length === 0) {
      throw new ValidationError(
        'Add at least one reminder day, or turn the segment off instead.',
        'offsets_days'
      );
    }
    if (cleaned.length > MAX_STAGES) {
      throw new ValidationError(
        `At most ${MAX_STAGES} reminder stages.`,
        'offsets_days'
      );
    }
    if (cleaned.some((n) => n > MAX_OFFSET_DAYS)) {
      throw new ValidationError(
        `Reminder days must be ${MAX_OFFSET_DAYS} or fewer.`,
        'offsets_days'
      );
    }

    patch.offsets_days = cleaned;
  }

  return patch;
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('auto_email_rules')
      .select('*')
      .order('segment');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: data ?? [] });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    console.error('[super-admin/auto-mail/settings] GET failed:', err);
    return NextResponse.json(
      { error: 'Failed to load Auto Mail settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const segment = String(body.segment ?? '') as AutoEmailSegment;

    if (!AUTO_EMAIL_SEGMENTS.includes(segment)) {
      return NextResponse.json(
        { error: 'A valid segment is required (trial or paid).' },
        { status: 400 }
      );
    }

    const patch = buildPatch(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields were supplied' },
        { status: 400 }
      );
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('auto_email_rules')
      .update(patch)
      // Scoped by segment, never by an id from the body — that is what
      // stops one segment's edit landing on the other's row.
      .eq('segment', segment)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      // The migration seeds both rows, so a miss means someone deleted
      // one. Say so plainly rather than reporting a generic failure.
      return NextResponse.json(
        { error: `No rule row exists for the "${segment}" segment.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    const mapped = superAdminErrorResponse(err);
    if (mapped) return mapped;
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: err.status }
      );
    }
    console.error('[super-admin/auto-mail/settings] PUT failed:', err);
    return NextResponse.json(
      { error: 'Failed to update Auto Mail settings' },
      { status: 500 }
    );
  }
}
