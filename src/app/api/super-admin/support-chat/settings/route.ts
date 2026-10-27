// ============================================================
// GET   /api/super-admin/support-chat/settings — the platform switches
// PATCH /api/super-admin/support-chat/settings — change them
//
// GET also returns how many workspaces the current settings reach, so the
// page can show the consequence of the rule rather than only the rule.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/auth/admin-client';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import {
  SUPPORT_WELCOME_MAX,
  isSupportVisibility,
} from '@/lib/support-chat/access-rules';
import {
  SUPPORT_SETTINGS_TABLE,
  listSupportAccessRows,
  loadSupportSettings,
} from '@/lib/support-chat/availability';

export const dynamic = 'force-dynamic';

async function summary() {
  const admin = supabaseAdmin();
  const settings = await loadSupportSettings(admin);
  const rows = await listSupportAccessRows(admin, settings);
  return {
    settings,
    reach: {
      total: rows.length,
      withAccess: rows.filter((r) => r.access.available).length,
      allowed: rows.filter((r) => r.override?.mode === 'allow').length,
      blocked: rows.filter((r) => r.override?.mode === 'deny').length,
      whatsappConnected: rows.filter((r) => r.whatsappConnected).length,
    },
  };
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    return NextResponse.json(await summary());
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat/settings] GET failed:', err);
    return NextResponse.json(
      { error: 'Could not load Live chat settings.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireSuperAdmin(request);

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { error: 'A JSON body is required.' },
        { status: 400 }
      );
    }
    const body = raw as Record<string, unknown>;

    // Field-by-field whitelist. Anything not named here is ignored, so a
    // client cannot write `id` or `updated_by` through this route.
    const patch: Record<string, unknown> = {};

    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json(
          { error: 'enabled must be true or false.' },
          { status: 400 }
        );
      }
      patch.enabled = body.enabled;
    }
    if ('visibility' in body) {
      if (!isSupportVisibility(body.visibility)) {
        return NextResponse.json(
          { error: 'visibility is not a known option.' },
          { status: 400 }
        );
      }
      patch.visibility = body.visibility;
    }
    if ('widgetEnabled' in body) {
      if (typeof body.widgetEnabled !== 'boolean') {
        return NextResponse.json(
          { error: 'widgetEnabled must be true or false.' },
          { status: 400 }
        );
      }
      patch.widget_enabled = body.widgetEnabled;
    }
    if ('welcomeMessage' in body) {
      const value =
        typeof body.welcomeMessage === 'string'
          ? body.welcomeMessage.trim()
          : '';
      if (value.length > SUPPORT_WELCOME_MAX) {
        return NextResponse.json(
          {
            error: `The welcome message can be at most ${SUPPORT_WELCOME_MAX} characters.`,
          },
          { status: 400 }
        );
      }
      // Blank clears it, so the CRM falls back to its built-in wording.
      patch.welcome_message = value || null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update.' },
        { status: 400 }
      );
    }

    // Upsert rather than update: a deployment that ran the migration
    // before its seed row existed would otherwise match zero rows and
    // report success while saving nothing.
    const { error } = await supabaseAdmin()
      .from(SUPPORT_SETTINGS_TABLE)
      .upsert(
        {
          id: true,
          ...patch,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[super-admin/support-chat/settings] save failed:', error);
      return NextResponse.json(
        { error: 'Could not save Live chat settings.' },
        { status: 500 }
      );
    }

    return NextResponse.json(await summary());
  } catch (err) {
    const known = superAdminErrorResponse(err);
    if (known) return known;
    console.error('[super-admin/support-chat/settings] PATCH failed:', err);
    return NextResponse.json(
      { error: 'Could not save Live chat settings.' },
      { status: 500 }
    );
  }
}
