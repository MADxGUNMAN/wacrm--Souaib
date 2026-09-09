import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin/guard';
import { uploadToS3, getS3PublicUrl } from '@/lib/storage/s3-client';

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);

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
    const s3Key = `public-assets/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Upload to AWS S3
    await uploadToS3(s3Key, buffer, file.type || 'image/png');

    // Get public URL
    const publicUrl = getS3PublicUrl(s3Key);

    return NextResponse.json({ url: publicUrl, path: s3Key });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('[super-admin/upload] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Upload failed' },
      { status: 500 }
    );
  }
}
