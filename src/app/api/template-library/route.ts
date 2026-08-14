import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/template-library
 *
 * The in-app starter template library: industry categories and the
 * templates inside them. Read-only, available to any signed-in user.
 *
 * Not to be confused with /api/whatsapp/template-library, which is META'S
 * library fetched from the WABA. This one is our own curated content and
 * works before a WhatsApp number is even connected — which is the point,
 * since a new account has nothing else to start from.
 *
 * Reads through the ordinary user client rather than the service role: RLS
 * (migration 065) already grants SELECT to every authenticated user, so
 * bypassing it would only widen access for no reason.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [categoriesRes, templatesRes] = await Promise.all([
      supabase
        .from('template_library_categories')
        .select('*')
        .eq('is_active', true)
        .order('position'),
      supabase
        .from('template_library_templates')
        .select('*')
        .eq('is_active', true)
        .order('position'),
    ]);

    if (categoriesRes.error) {
      return NextResponse.json(
        { error: `Could not load categories: ${categoriesRes.error.message}` },
        { status: 500 },
      );
    }
    if (templatesRes.error) {
      return NextResponse.json(
        { error: `Could not load templates: ${templatesRes.error.message}` },
        { status: 500 },
      );
    }

    const templates = templatesRes.data ?? [];
    // Counts come from the same query rather than a second round trip, so
    // the chips can never disagree with the list they filter.
    const counts = new Map<string, number>();
    for (const t of templates) {
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
    }

    const categories = (categoriesRes.data ?? []).map((c) => ({
      ...c,
      template_count: counts.get(c.id) ?? 0,
    }));

    return NextResponse.json({ categories, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
