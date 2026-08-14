import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { supabaseAdmin } from '@/lib/auth/admin-client';

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = supabaseAdmin();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'brand-assets';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize file extension and name
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Ensure storage bucket exists
    const bucketName = 'public-assets';
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucketName || b.id === bucketName)) {
      await admin.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon'],
      });
    }

    // Upload to Supabase Storage
    const { data, error } = await admin.storage
      .from(bucketName)
      .upload(filename, buffer, {
        contentType: file.type || 'image/png',
        upsert: true,
      });

    if (error) {
      console.error('[super-admin/upload] Supabase upload error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = admin.storage.from(bucketName).getPublicUrl(filename);

    return NextResponse.json({ url: publicUrl, path: data.path });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/upload] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Upload failed' },
      { status: 500 }
    );
  }
}
