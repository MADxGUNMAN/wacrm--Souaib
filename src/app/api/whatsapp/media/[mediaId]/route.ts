import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params

    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const requestedConversationId = new URL(request.url).searchParams.get(
      'conversation_id'
    )
    const mediaPath = `/api/whatsapp/media/${mediaId}`
    let ownerUserId = user.id

    const { data: mediaMessage, error: mediaMessageError } = await adminSupabase
      .from('messages')
      .select('conversation_id')
      .eq('media_url', mediaPath)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mediaMessageError) {
      console.error('Failed to resolve media message:', mediaMessageError)
    }

    const conversationId =
      mediaMessage?.conversation_id || requestedConversationId

    if (conversationId) {
      const { data: conversation, error: conversationError } =
        await adminSupabase
          .from('conversations')
          .select('user_id, assigned_agent_id')
          .eq('id', conversationId)
          .single()

      if (conversationError || !conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, permissions, is_active')
        .eq('user_id', user.id)
        .single()

      const isOwner = conversation.user_id === user.id
      const permissions = profile?.permissions as
        | Record<string, boolean>
        | null
        | undefined
      const isAssignedVendor =
        profile?.role === 'vendor' &&
        profile.is_active !== false &&
        permissions?.inbox === true &&
        conversation.assigned_agent_id === profile.id

      if (!isOwner && !isAssignedVendor) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      ownerUserId = conversation.user_id
    }

    // Fetch and decrypt WhatsApp config for the conversation owner.
    // Vendors view assigned conversations, but the media still belongs to
    // the admin's WhatsApp account, so this must bypass config RLS.
    const { data: config, error: configError } = await adminSupabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', ownerUserId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Get the download URL from Meta
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })

    // Download the binary data
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    })

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType || mediaInfo.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
