// ============================================================
// /api/super-admin/cms/integration-pages/[slug]
//
// GET — Fetch integration page configuration
// PUT — Update integration page configuration (landing, privacy, terms)
//
// Restricted to super admin only (junkiescoder@gmail.com).
// ============================================================

import { NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  superAdminErrorResponse,
} from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

interface RouteProps {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    await requireSuperAdmin(request);
    const { slug } = await params;
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('integration_pages')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error(`[CMS Integration Page] Fetch error for '${slug}':`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Integration page not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ page: data });
  } catch (err) {
    const errorResponse = superAdminErrorResponse(err);
    if (errorResponse) return errorResponse;
    return NextResponse.json(
      { error: 'Failed to fetch integration page' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    await requireSuperAdmin(request);
    const { slug } = await params;
    const body = await request.json();
    const admin = supabaseAdmin();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = [
      'title',
      'subtitle',
      'badge_text',
      'primary_cta_text',
      'primary_cta_url',
      'secondary_cta_text',
      'secondary_cta_url',
      'prerequisites',
      'features',
      'how_it_works',
      'faqs',
      'privacy_markdown',
      'terms_markdown',
      'seo_meta_title',
      'seo_meta_description',
      'is_published',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updatePayload[field] = body[field];
      }
    }

    const { data, error } = await admin
      .from('integration_pages')
      .update(updatePayload)
      .eq('slug', slug)
      .select()
      .maybeSingle();

    if (error) {
      console.error(
        `[CMS Integration Page] Update error for '${slug}':`,
        error
      );
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, page: data });
  } catch (err) {
    const errorResponse = superAdminErrorResponse(err);
    if (errorResponse) return errorResponse;
    return NextResponse.json(
      { error: 'Failed to update integration page' },
      { status: 500 }
    );
  }
}
