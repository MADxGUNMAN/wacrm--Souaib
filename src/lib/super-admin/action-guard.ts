// ============================================================
// Super admin check for Server Actions.
//
// Server Actions are reachable by POST from any page, so the /super-admin
// page guard in proxy.ts does not protect them on its own (Next docs:
// "Treat Server Actions with the same security considerations as
// public-facing API endpoints"). Every CMS action that writes with the
// service-role client calls this first.
//
// Same rules as requireSuperAdmin (guard.ts) — signed in, profile row
// exists, is_super_admin = true — but reads the session from next/headers
// and returns an error object instead of throwing a NextResponse, to fit
// the `{ error } | { success }` shape the CMS actions already return.
// ============================================================

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export type ActionGuardResult =
  { ok: true; userId: string } | { ok: false; error: string };

export async function requireSuperAdminAction(): Promise<ActionGuardResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { ok: false, error: 'Not signed in.' };
    }

    const { data: profile, error } = await supabaseAdmin()
      .from('profiles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[super-admin/action-guard] profile lookup failed:', error);
      return { ok: false, error: 'Could not verify super admin access.' };
    }
    if (!profile?.is_super_admin) {
      return { ok: false, error: 'Forbidden — super admin access required.' };
    }
    return { ok: true, userId: user.id };
  } catch (err) {
    console.error('[super-admin/action-guard] unexpected error:', err);
    return { ok: false, error: 'Could not verify super admin access.' };
  }
}
