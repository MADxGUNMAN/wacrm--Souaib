import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';
import { getMediaUrl } from '@/lib/whatsapp/meta-api';
import { buildMediaPath } from '@/lib/storage/upload-media';
import { uploadToS3, getS3PublicUrl } from '@/lib/storage/s3-client';
import type { WhatsAppContactCard } from '@/lib/whatsapp/meta-api';

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

    // Resolve caller's account
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { messageId, targetConversationIds } = body as {
      messageId?: string;
      targetConversationIds?: string[];
    };

    if (!messageId || !Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
      return NextResponse.json(
        { error: 'messageId and targetConversationIds (non-empty array) are required' },
        { status: 400 }
      );
    }

    if (targetConversationIds.length > 50) {
      return NextResponse.json(
        { error: 'Cannot forward to more than 50 chats at once' },
        { status: 400 }
      );
    }

    // Load source message and verify tenancy
    const { data: sourceMsg, error: msgError } = await supabase
      .from('messages')
      .select('*, conversations!inner(account_id)')
      .eq('id', messageId)
      .single();

    if (msgError || !sourceMsg) {
      return NextResponse.json({ error: 'Source message not found' }, { status: 404 });
    }

    // Enforce tenant isolation (GHSA-63cv-2c49-m5v3)
    const convData = sourceMsg.conversations as { account_id?: string } | undefined;
    if (convData?.account_id !== accountId) {
      return NextResponse.json({ error: 'Message not in your account' }, { status: 403 });
    }

    // Resolve WhatsApp access token for media downloading if needed
    let accessToken = '';
    const { data: config } = await supabase
      .from('whatsapp_configs')
      .select('access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (config?.access_token) {
      accessToken = config.access_token;
    }

    // Rebuild payload from source message
    let messageType: string = sourceMsg.content_type || 'text';
    let contentText: string | null = sourceMsg.content_text || null;
    let mediaUrl: string | null = sourceMsg.media_url || null;
    let contactsPayload: WhatsAppContactCard[] | null = null;
    let location: {
      latitude: number;
      longitude: number;
      name?: string | null;
      address?: string | null;
    } | null = null;

    if (sourceMsg.content_type === 'contacts') {
      messageType = 'contacts';
      contactsPayload = (sourceMsg.contacts_payload as unknown as WhatsAppContactCard[]) || null;
    } else if (sourceMsg.content_type === 'location') {
      messageType = 'location';
      if (sourceMsg.latitude != null && sourceMsg.longitude != null) {
        location = {
          latitude: Number(sourceMsg.latitude),
          longitude: Number(sourceMsg.longitude),
          name: sourceMsg.location_name,
          address: sourceMsg.location_address,
        };
      } else {
        messageType = 'text';
      }
    } else if (
      ['image', 'video', 'document', 'audio', 'sticker'].includes(sourceMsg.content_type)
    ) {
      messageType = sourceMsg.content_type;

      // Inbound media proxy bridge: if mediaUrl is `/api/whatsapp/media/[mediaId]`, re-host to chat-media bucket
      if (mediaUrl && mediaUrl.startsWith('/api/whatsapp/media/') && accessToken) {
        const mediaId = mediaUrl.split('/').pop();
        if (mediaId) {
          try {
            const metaInfo = await getMediaUrl({ mediaId, accessToken });
            const mediaFetch = await fetch(metaInfo.url, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (mediaFetch.ok) {
              const arrayBuffer = await mediaFetch.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const ext = metaInfo.mimeType.split('/').pop()?.split(';')[0] || 'bin';
              const filename = `fwd-${Date.now()}.${ext}`;
              const storagePath = buildMediaPath(accountId, filename);

              const s3Key = `chat-media/${storagePath}`;
              await uploadToS3(s3Key, buffer, metaInfo.mimeType);
              const s3Url = getS3PublicUrl(s3Key);
              if (s3Url) {
                mediaUrl = s3Url;
              }
            }
          } catch (bridgeErr) {
            console.error('[forward] Failed to bridge inbound media to chat-media:', bridgeErr);
          }
        }
      }
    } else if (sourceMsg.content_type === 'interactive' || sourceMsg.content_type === 'template') {
      // Templates and interactives forward their body text
      messageType = 'text';
      contentText = sourceMsg.content_text || '[Forwarded message]';
    }

    // Forward sequentially to each target conversation
    const results: Array<{ conversationId: string; success: boolean; error?: string }> = [];

    for (const targetId of targetConversationIds) {
      try {
        await sendMessageToConversation(supabase, accountId, {
          conversationId: targetId,
          messageType,
          contentText,
          mediaUrl,
          filename: sourceMsg.media_filename,
          contactsPayload,
          location,
          senderUserId: user.id,
          forwardedFromMessageId: sourceMsg.id,
        });
        results.push({ conversationId: targetId, success: true });
      } catch (err) {
        const errMessage = err instanceof SendMessageError ? err.message : (err instanceof Error ? err.message : 'Send failed');
        results.push({ conversationId: targetId, success: false, error: errMessage });
      }
    }

    const successfulCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      sentCount: successfulCount,
      totalCount: targetConversationIds.length,
      results,
    });
  } catch (error) {
    console.error('Error forwarding message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
