// ============================================================
// /api/super-admin/cms/images
//
// GET    — List all landing images from landing_images table
// POST   — Upload an image to Supabase Storage + save reference
// DELETE — Remove an image from Storage + table
//
// Super admin only. Uses the 'landing-assets' Supabase Storage bucket.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function GET(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from('landing_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ images: data });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const imageKey = formData.get('image_key') as string | null;
    const altText = (formData.get('alt_text') as string) || '';

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (!imageKey) {
      return NextResponse.json(
        { error: 'image_key is required' },
        { status: 400 }
      );
    }

    // Generate a unique file path
    const ext = file.name.split('.').pop() || 'png';
    const filePath = `${imageKey}-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from('landing-assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[cms/images] upload error:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('landing-assets')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Upsert into landing_images table
    const { data, error: dbError } = await admin
      .from('landing_images')
      .upsert(
        {
          image_key: imageKey,
          url: publicUrl,
          alt_text: altText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'image_key' }
      )
      .select()
      .single();

    if (dbError) {
      console.error('[cms/images] db error:', dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ image: data, url: publicUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[cms/images] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const imageKey = searchParams.get('image_key');

    if (!id && !imageKey) {
      return NextResponse.json(
        { error: 'Either id or image_key is required' },
        { status: 400 }
      );
    }

    // Get the image record to find the storage path
    let query = admin.from('landing_images').select('*');
    if (id) {
      query = query.eq('id', id);
    } else if (imageKey) {
      query = query.eq('image_key', imageKey);
    }

    const { data: image } = await query.maybeSingle();

    if (image?.url) {
      // Extract the file path from the URL
      const urlParts = image.url.split('/landing-assets/');
      if (urlParts[1]) {
        await admin.storage
          .from('landing-assets')
          .remove([urlParts[1]]);
      }
    }

    // Delete from table
    let deleteQuery = admin.from('landing_images').delete();
    if (id) {
      deleteQuery = deleteQuery.eq('id', id);
    } else if (imageKey) {
      deleteQuery = deleteQuery.eq('image_key', imageKey);
    }

    const { error } = await deleteQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
