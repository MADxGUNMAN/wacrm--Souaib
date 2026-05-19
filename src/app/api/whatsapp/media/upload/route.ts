import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { uploadMedia } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';

const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;
const MAX_MEDIA_SIZE = 16 * 1024 * 1024;
const MEDIA_MESSAGE_TYPES = new Set(['image', 'video', 'audio', 'document']);

function isDocument(mimeType: string, filename: string) {
  const lowerName = filename.toLowerCase();
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.ppt') ||
    lowerName.endsWith('.pptx') ||
    lowerName.endsWith('.txt')
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const conversationId = formData.get('conversation_id');
    const requestedMessageType = formData.get('message_type');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const mimeType = file.type || 'application/octet-stream';
    const messageType =
      typeof requestedMessageType === 'string' &&
      MEDIA_MESSAGE_TYPES.has(requestedMessageType)
        ? requestedMessageType
        : null;
    const maxSize = messageType === 'document' || isDocument(mimeType, file.name)
      ? MAX_DOCUMENT_SIZE
      : MAX_MEDIA_SIZE;

    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File is too large. Limit is ${Math.floor(maxSize / 1024 / 1024)}MB.`,
        },
        { status: 400 }
      );
    }

    let ownerUserId = user.id;

    if (typeof conversationId === 'string' && conversationId) {
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('user_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      ownerUserId = conversation.user_id;
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: config, error: configError } = await adminSupabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', ownerUserId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      );
    }

    const result = await uploadMedia({
      phoneNumberId: config.phone_number_id,
      accessToken: decrypt(config.access_token),
      file,
      mimeType,
      filename: file.name,
    });

    const mediaUrl =
      typeof conversationId === 'string' && conversationId
        ? `/api/whatsapp/media/${result.id}?conversation_id=${encodeURIComponent(
            conversationId
          )}`
        : `/api/whatsapp/media/${result.id}`;

    return NextResponse.json({
      media_id: result.id,
      media_url: mediaUrl,
    });
  } catch (error) {
    console.error('Error in WhatsApp media upload POST:', error);
    return NextResponse.json(
      { error: 'Failed to upload media' },
      { status: 500 }
    );
  }
}
