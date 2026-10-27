// ============================================================
// GET /api/support-chat/availability
//
// "Should this signed-in CRM user see Live chat?" — the single answer
// behind the Settings rail item, the Settings pane, the floating chat
// bubble, the sidebar badge and the tab-title count.
//
// Answers with a 200 and `available: false` rather than a 403. Every CRM
// page asks this on load; for a workspace without access "no" is the
// normal, expected answer, and a 403 would put an error in the console of
// every customer who simply does not have the feature.
//
// Never returns the rule, the override, or anything about other
// workspaces — only the outcome for the caller.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { canAccessSettingsSection, type AccountRole } from '@/lib/auth/roles';
import {
  getSupportAccessForAccount,
  loadSupportSettings,
} from '@/lib/support-chat/availability';

export const dynamic = 'force-dynamic';

export interface SupportAvailabilityResponse {
  available: boolean;
  /**
   * Why not, when not. Deliberately coarse: `workspace` (Replai does not
   * offer it to this workspace) vs `permission` (the owner turned it off
   * for this member) — the two need different words in the UI, and nothing
   * finer is the customer's business.
   */
  blockedBy: 'workspace' | 'permission' | null;
  widgetEnabled: boolean;
  welcomeMessage: string | null;
}

function no(
  blockedBy: SupportAvailabilityResponse['blockedBy']
): NextResponse<SupportAvailabilityResponse> {
  return NextResponse.json({
    available: false,
    blockedBy,
    widgetEnabled: false,
    welcomeMessage: null,
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, is_super_admin, account_role, permissions')
      .eq('user_id', user.id)
      .maybeSingle();

    // An operator browsing the CRM is on the OTHER side of this chat; the
    // tenant widget would have them messaging themselves.
    if (!profile?.account_id || profile.is_super_admin === true) {
      return no('workspace');
    }

    const admin = supabaseAdmin();
    const settings = await loadSupportSettings(admin);
    const access = await getSupportAccessForAccount(
      admin,
      profile.account_id as string,
      settings
    );
    if (!access.available) return no('workspace');

    const permitted = canAccessSettingsSection(
      (profile.account_role ?? null) as AccountRole | null,
      (profile.permissions ?? null) as Record<
        string,
        boolean | undefined
      > | null,
      'live-chat'
    );
    if (!permitted) return no('permission');

    return NextResponse.json<SupportAvailabilityResponse>({
      available: true,
      blockedBy: null,
      widgetEnabled: settings.widgetEnabled,
      welcomeMessage: settings.welcomeMessage,
    });
  } catch (err) {
    console.error('[support-chat/availability] failed:', err);
    // Fail CLOSED for the UI: a broken check hides the entry points rather
    // than showing a chat whose every request would then fail.
    return no('workspace');
  }
}
