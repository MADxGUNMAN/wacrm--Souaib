import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { getContactPageSettings } from '@/lib/cms/queries';

export async function GET() {
  try {
    const settings = await getContactPageSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('[CMS Contact Settings] Error fetching:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const admin = supabaseAdmin();

    // Get the existing row's ID first
    const { data: existing } = await admin
      .from('contact_page_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'No contact settings row found' }, { status: 404 });
    }

    const { error } = await admin
      .from('contact_page_settings')
      .update({
        heading: body.heading,
        subheading: body.subheading,
        office_address: body.office_address,
        phone_number: body.phone_number,
        email_address: body.email_address,
        working_hours: body.working_hours,
        form_heading: body.form_heading,
        form_subheading: body.form_subheading,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CMS Contact Settings] Error updating:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
