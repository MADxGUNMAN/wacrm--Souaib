// ============================================================
// /api/super-admin/cms/images
//
// GET    — List all landing images from landing_images table
// POST   — Upload an image to AWS S3 + save reference
// DELETE — Remove an image from S3 + table
//
// Super admin only. Uses the 'landing-assets' folder in S3.
// ============================================================

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';
import { uploadToS3, deleteFromS3, getS3PublicUrl, extractS3Key } from '@/lib/storage/s3-client';

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

    // Upload to AWS S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const s3Key = `landing-assets/${filePath}`;
    await uploadToS3(s3Key, buffer, file.type);

    // Get public URL
    const publicUrl = getS3PublicUrl(s3Key);

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
      // Try to extract S3 key from the URL and delete from S3
      const s3Key = extractS3Key(image.url);
      if (s3Key) {
        try {
          await deleteFromS3(s3Key);
        } catch (delErr) {
          console.error('[cms/images] S3 delete error (non-fatal):', delErr);
        }
      } else {
        // Legacy Supabase URL — extract path from old format
        const urlParts = image.url.split('/landing-assets/');
        if (urlParts[1]) {
          try {
            await deleteFromS3(`landing-assets/${urlParts[1]}`);
          } catch (delErr) {
            console.error('[cms/images] Legacy delete error (non-fatal):', delErr);
          }
        }
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
