import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendLocationMessage,
  sendContactMessage,
} from '@/lib/whatsapp/meta-api';
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const MEDIA_MESSAGE_TYPES = new Set(['image', 'video', 'audio', 'document']);
const SEND_MESSAGE_TYPES = new Set([
  'text',
  'template',
  'image',
  'video',
  'audio',
  'document',
  'location',
  'contact_card',
]);

type ContactPayload = {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
  };
  phones?: Array<{
    phone: string;
    type?: string;
  }>;
};

function parseVCard(vcard: string): { name?: string; phone?: string } {
  const lines = vcard.split(/\r?\n/);
  const nameLine = lines.find((line) => line.toUpperCase().startsWith('FN:'));
  const phoneLine = lines.find((line) => /^TEL/i.test(line));

  return {
    name: nameLine?.slice(nameLine.indexOf(':') + 1).trim(),
    phone: phoneLine?.slice(phoneLine.indexOf(':') + 1).trim(),
  };
}

function buildContactPayload(args: {
  contactName?: string;
  contactPhone?: string;
  contactVcard?: string;
}): ContactPayload | null {
  const parsed = args.contactVcard ? parseVCard(args.contactVcard) : {};
  const name = (args.contactName || parsed.name || '').trim();
  const phone = (args.contactPhone || parsed.phone || '').trim();

  if (!name || !phone) return null;

  const [firstName, ...rest] = name.split(/\s+/);
  return {
    name: {
      formatted_name: name,
      first_name: firstName,
      last_name: rest.length ? rest.join(' ') : undefined,
    },
    phones: [{ phone, type: 'CELL' }],
  };
}

type Coordinates = { latitude: number; longitude: number };

function validCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function coordinatesFromText(input: string): Coordinates | null {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (validCoordinates(latitude, longitude)) return { latitude, longitude };
  }

  return null;
}

async function coordinatesFromMapUrl(input: string): Promise<Coordinates | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const direct = coordinatesFromText(trimmed);
  if (direct) return direct;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const allowedHost =
    parsed.hostname === 'maps.app.goo.gl' ||
    parsed.hostname === 'goo.gl' ||
    parsed.hostname.endsWith('.google.com') ||
    parsed.hostname === 'google.com';

  if (!allowedHost) return null;

  try {
    const response = await fetch(parsed.toString(), {
      method: 'HEAD',
      redirect: 'follow',
    });
    return coordinatesFromText(response.url);
  } catch {
    try {
      const response = await fetch(parsed.toString(), { redirect: 'follow' });
      return coordinatesFromText(response.url);
    } catch {
      return null;
    }
  }
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

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json();
    const {
      conversation_id,
      message_type,
      content_text,
      media_url,
      media_id,
      filename,
      template_name,
      template_params,
      latitude,
      longitude,
      location_url,
      location_name,
      location_address,
      contact_name,
      contact_phone,
      contact_vcard,
    } = body;

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 }
      );
    }

    if (!SEND_MESSAGE_TYPES.has(message_type)) {
      return NextResponse.json(
        { error: `Unsupported message_type: ${message_type}` },
        { status: 400 }
      );
    }

    if (message_type === 'text' && !content_text) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 }
      );
    }

    if (MEDIA_MESSAGE_TYPES.has(message_type) && !media_id) {
      return NextResponse.json(
        { error: 'media_id is required for media messages' },
        { status: 400 }
      );
    }

    const submittedLatitude = Number(latitude);
    const submittedLongitude = Number(longitude);
    const parsedLocation =
      message_type === 'location' && location_url
        ? await coordinatesFromMapUrl(String(location_url))
        : null;
    const locationCoordinates =
      message_type === 'location'
        ? parsedLocation ??
          (validCoordinates(submittedLatitude, submittedLongitude)
            ? {
                latitude: submittedLatitude,
                longitude: submittedLongitude,
              }
            : null)
        : null;

    if (message_type === 'location' && !locationCoordinates) {
      return NextResponse.json(
        {
          error:
            'Could not read coordinates from that Google Maps URL. Use a Maps link with visible coordinates, such as a URL containing @lat,lng or ?q=lat,lng.',
        },
        { status: 400 }
      );
    }

    const contactPayload =
      message_type === 'contact_card'
        ? buildContactPayload({
            contactName: contact_name,
            contactPhone: contact_phone,
            contactVcard: contact_vcard,
          })
        : null;

    if (message_type === 'contact_card' && !contactPayload) {
      return NextResponse.json(
        { error: 'contact_name/contact_phone or contact_vcard is required' },
        { status: 400 }
      );
    }

    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required for template messages' },
        { status: 400 }
      );
    }

    // Fetch conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const contact = conversation.contact;
    if (!contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      );
    }

    // Sanitize and validate phone
    const sanitizedPhone = sanitizePhoneForMeta(contact.phone);
    if (!isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Fetch and decrypt WhatsApp config using the conversation's owner (admin).
    // Vendors do not have RLS access to the admin's config, so we use the service role key.
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: config, error: configError } = await adminSupabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', conversation.user_id)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(config.access_token);

    // Self-heal legacy CBC-encrypted tokens. Fire-and-forget: we
    // return from the send without waiting, so a failed upgrade just
    // means the next send tries again. The upgrade is idempotent —
    // concurrent sends both produce valid GCM ciphertexts of the same
    // plaintext, last write wins.
    if (isLegacyFormat(config.access_token)) {
      void adminSupabase
        .from('whatsapp_config')
        .update({ access_token: encrypt(accessToken) })
        .eq('id', config.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '[whatsapp/send] access_token GCM upgrade failed:',
              error.message
            );
          }
        });
    }

    // Send via Meta API — retry with phone-number variants if Meta rejects
    // with "recipient not in allowed list" (common in sandbox / when a
    // number was registered with/without a trunk 0). If an alternate
    // format succeeds, we persist it back to the contact row so the
    // next send goes through on the first attempt.
    let waMessageId = '';
    let workingPhone = sanitizedPhone;

    const attempt = async (phone: string): Promise<string> => {
      switch (message_type) {
        case 'template': {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            templateName: template_name,
            params: template_params || [],
          });
          return result.messageId;
        }
        case 'image':
        case 'video':
        case 'audio':
        case 'document': {
          const result = await sendMediaMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            type: message_type,
            mediaId: media_id,
            caption: content_text,
            filename,
          });
          return result.messageId;
        }
        case 'location': {
          if (!locationCoordinates) {
            throw new Error('Location coordinates missing');
          }
          const result = await sendLocationMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            latitude: locationCoordinates.latitude,
            longitude: locationCoordinates.longitude,
          });
          return result.messageId;
        }
        case 'contact_card': {
          if (!contactPayload) throw new Error('Contact payload missing');
          const result = await sendContactMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            contact: contactPayload,
          });
          return result.messageId;
        }
        default: {
          const result = await sendTextMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: phone,
            text: content_text,
          });
          return result.messageId;
        }
      }
    };

    try {
      const variants = phoneVariants(sanitizedPhone);
      let lastError: unknown = null;

      for (const variant of variants) {
        try {
          waMessageId = await attempt(variant);
          workingPhone = variant;
          lastError = null;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Only retry when the failure is specifically that the
          // recipient isn't in Meta's allowed list. Any other error
          // (bad token, invalid template, etc.) bubbles up immediately.
          if (!isRecipientNotAllowedError(message)) {
            throw err;
          }
          lastError = err;
          console.warn(
            `[whatsapp/send] variant "${variant}" rejected by Meta, trying next…`
          );
        }
      }

      if (lastError) throw lastError;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('Meta API send failed for all variants:', message);
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 502 }
      );
    }

    // If a non-original variant succeeded, update the contact so future
    // sends go straight through. sanitizePhoneForMeta on workingPhone
    // will yield workingPhone itself, so re-storing preserves it.
    if (workingPhone !== sanitizedPhone) {
      console.log(
        `[whatsapp/send] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
      );
      await supabase
        .from('contacts')
        .update({ phone: workingPhone })
        .eq('id', contact.id);
    }

    // Insert message into DB — field names MUST match the messages schema
    // (see supabase/migrations/001_initial_schema.sql):
    //   conversation_id, sender_type, content_type, content_text,
    //   media_url, template_name, message_id, status, created_at
    const savedMediaUrl = media_id
      ? `/api/whatsapp/media/${media_id}`
      : media_url || null;
    const savedContentText =
      message_type === 'location'
        ? [
            location_name,
            location_address,
            location_url ||
              `${locationCoordinates?.latitude}, ${locationCoordinates?.longitude}`,
          ]
            .filter(Boolean)
            .join(' - ')
        : message_type === 'contact_card' && contactPayload
          ? [
              contactPayload.name.formatted_name,
              contactPayload.phones?.[0]?.phone,
            ]
              .filter(Boolean)
              .join(' - ')
          : content_text || (message_type === 'document' ? filename : null);
    const lastMessageText =
      savedContentText ||
      (message_type === 'contact_card' ? '[contact]' : `[${message_type}]`);

    const { data: messageRecord, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'agent',
        content_type: message_type,
        content_text: savedContentText,
        media_url: savedMediaUrl,
        template_name: template_name || null,
        message_id: waMessageId,
        status: 'sent',
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error inserting sent message:', msgError);
      return NextResponse.json(
        {
          error: `Message sent to Meta but failed to save to DB: ${msgError.message}`,
        },
        { status: 500 }
      );
    }

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        last_message_text: lastMessageText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      whatsapp_message_id: waMessageId,
    });
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
