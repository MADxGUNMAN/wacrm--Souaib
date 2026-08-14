import { describe, expect, it } from 'vitest'

import {
  disconnectHelpText,
  historyStatusToMessageStatus,
  isAccountUpdateField,
  isCoexistenceWebhookField,
  isMessageMutation,
  parseAccountUpdate,
  parseAppStateSync,
  parseEdit,
  parseHistory,
  parseMessageEchoes,
  parseRevoke,
} from './coexistence'

/**
 * Coexistence webhook parsing.
 *
 * The payloads below are REAL shapes from Meta's coexistence webhook
 * reference, not invented ones. That matters more here than in most
 * tests: coexistence needs a live WhatsApp Business App number to
 * produce a single event, so these fixtures are the only way to know the
 * parser is right before such a number exists.
 *
 * What is worth protecting is mostly about `to` vs `from`. In an echo
 * they are the opposite way round from an inbound message, and getting
 * it wrong files the message against the business's own number.
 */

describe('isCoexistenceWebhookField', () => {
  it('recognises the three coexistence fields', () => {
    expect(isCoexistenceWebhookField('smb_message_echoes')).toBe(true)
    expect(isCoexistenceWebhookField('smb_app_state_sync')).toBe(true)
    expect(isCoexistenceWebhookField('history')).toBe(true)
  })

  it('does not claim ordinary messaging fields', () => {
    // The webhook dispatches on these separately; overlapping would send
    // an ordinary inbound message down the echo path.
    expect(isCoexistenceWebhookField('messages')).toBe(false)
    expect(isCoexistenceWebhookField('account_update')).toBe(false)
    expect(isCoexistenceWebhookField('message_template_status_update')).toBe(
      false,
    )
  })

  it('treats account_update separately', () => {
    expect(isAccountUpdateField('account_update')).toBe(true)
    expect(isAccountUpdateField('messages')).toBe(false)
  })
})

describe('parseMessageEchoes', () => {
  // Verbatim shape from Meta's smb_message_echoes reference.
  const value = {
    message_echoes: [
      {
        from: '918750963486',
        id: 'wamid.HBgMOTE4NDQ2MDAwOTA5FQIAERgUMkFERTUzRkEzRkI0REE0RkEyNkQA',
        text: { body: 'Hey' },
        timestamp: '1773387740',
        to: '918446000909',
        type: 'text',
      },
    ],
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: '918750963486',
      phone_number_id: '950443251490365',
    },
  }

  it('pulls the tenancy key and the echo out', () => {
    const parsed = parseMessageEchoes(value)
    expect(parsed).not.toBeNull()
    expect(parsed!.phoneNumberId).toBe('950443251490365')
    expect(parsed!.displayPhoneNumber).toBe('918750963486')
    expect(parsed!.echoes).toHaveLength(1)
  })

  it('keeps `to` as the customer and `from` as the business', () => {
    // The whole reason this parser exists. Swapping these would create a
    // contact for the business's own number and a conversation with
    // itself.
    const echo = parseMessageEchoes(value)!.echoes[0]
    expect(echo.from).toBe('918750963486') // the business
    expect(echo.to).toBe('918446000909') // the customer
  })

  it('preserves the content payload for the shared content parser', () => {
    // Echo content is shaped exactly like inbound content — a property
    // named after `type` — so it must survive parsing untouched rather
    // than being flattened.
    const echo = parseMessageEchoes(value)!.echoes[0]
    expect(echo.type).toBe('text')
    expect(echo.text).toEqual({ body: 'Hey' })
  })

  it('returns null without a phone_number_id', () => {
    // No phone_number_id means no way to resolve which account this
    // belongs to. Guessing would leak a message into another tenant.
    expect(
      parseMessageEchoes({ ...value, metadata: { display_phone_number: '1' } }),
    ).toBeNull()
  })

  it('drops an echo with no `to` instead of defaulting it', () => {
    // `to` is the only thing naming the customer. A default would file
    // the message under the wrong conversation, which is worse than not
    // showing it at all.
    const parsed = parseMessageEchoes({
      ...value,
      message_echoes: [{ from: '918750963486', id: 'wamid.x', type: 'text' }],
    })
    expect(parsed).toBeNull()
  })

  it('keeps the good echoes when one in a batch is malformed', () => {
    const parsed = parseMessageEchoes({
      ...value,
      message_echoes: [{ garbage: true }, value.message_echoes[0]],
    })
    expect(parsed!.echoes).toHaveLength(1)
  })

  it('tolerates a missing timestamp rather than dropping the message', () => {
    const parsed = parseMessageEchoes({
      ...value,
      message_echoes: [{ ...value.message_echoes[0], timestamp: undefined }],
    })
    expect(parsed!.echoes[0].timestamp).toBe('')
  })

  it('returns null on junk input', () => {
    expect(parseMessageEchoes(null)).toBeNull()
    expect(parseMessageEchoes('nope')).toBeNull()
    expect(parseMessageEchoes({})).toBeNull()
    expect(parseMessageEchoes({ ...value, message_echoes: [] })).toBeNull()
  })
})

describe('parseAccountUpdate', () => {
  it('reads the reason out of a PARTNER_REMOVED event', () => {
    // Meta reports six different causes as this ONE event, with the
    // actual cause buried here.
    const parsed = parseAccountUpdate({
      event: 'PARTNER_REMOVED',
      waba_info: { owner_business_id: '2329417887457253', waba_id: '980198427658004' },
      disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
    })
    expect(parsed).toEqual({
      event: 'PARTNER_REMOVED',
      reason: 'PRIMARY_INACTIVITY',
      initiatedBy: 'SYSTEM',
      wabaId: '980198427658004',
      phoneNumber: null,
      isDisconnect: true,
    })
  })

  it('handles the older payload shape that carries phone_number', () => {
    const parsed = parseAccountUpdate({
      phone_number: '15550783881',
      event: 'PARTNER_REMOVED',
      disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
    })
    expect(parsed!.phoneNumber).toBe('15550783881')
    expect(parsed!.isDisconnect).toBe(true)
  })

  it('treats PARTNER_APP_UNINSTALLED as a disconnect', () => {
    const parsed = parseAccountUpdate({
      event: 'PARTNER_APP_UNINSTALLED',
      waba_info: { waba_id: '1197332449152321' },
    })
    expect(parsed!.isDisconnect).toBe(true)
    expect(parsed!.reason).toBeNull()
  })

  it('does NOT treat an unrecognised event as a disconnect', () => {
    // account_update is a general-purpose field. Marking anything unknown
    // as a disconnect would take a working number offline in the UI the
    // day Meta ships a new notification type.
    const parsed = parseAccountUpdate({ event: 'SOME_FUTURE_NOTIFICATION' })
    expect(parsed!.isDisconnect).toBe(false)
  })

  it('returns null without an event', () => {
    expect(parseAccountUpdate({ disconnection_info: { reason: 'X' } })).toBeNull()
    expect(parseAccountUpdate(null)).toBeNull()
  })
})

describe('disconnectHelpText', () => {
  it('gives the actionable fix for a known reason', () => {
    // The 13-day rule is the single most common cause and completely
    // unguessable, so it has to be spelled out.
    expect(disconnectHelpText('PARTNER_REMOVED', 'PRIMARY_INACTIVITY')).toContain(
      'Open the app on your phone',
    )
  })

  it('explains the app-side disconnect switch', () => {
    expect(disconnectHelpText('PARTNER_APP_UNINSTALLED', null)).toContain(
      'Business Platform',
    )
  })

  it('names an unknown reason rather than hiding it', () => {
    // A raw code is searchable and support can act on it; "an error
    // occurred" is neither.
    expect(disconnectHelpText('PARTNER_REMOVED', 'BRAND_NEW_CODE')).toContain(
      'BRAND_NEW_CODE',
    )
  })

  it('still says something useful with no reason at all', () => {
    expect(disconnectHelpText('PARTNER_REMOVED', null)).toContain(
      'WhatsApp Manager',
    )
  })
})

describe('parseEdit', () => {
  // Verbatim shape from Meta's edit-event reference.
  const editMessage = {
    edit: {
      message: { text: { body: 'Hey WA user' }, type: 'text' },
      original_message_id: 'wamid.ORIGINAL',
    },
    from: '917506080480',
    id: 'wamid.EDITEVENT',
    timestamp: '1769753418',
    type: 'edit',
  }

  it('extracts the target and the replacement content', () => {
    expect(parseEdit(editMessage)).toEqual({
      originalMessageId: 'wamid.ORIGINAL',
      editMessageId: 'wamid.EDITEVENT',
      newMessage: { text: { body: 'Hey WA user' }, type: 'text' },
      newType: 'text',
    })
  })

  it('handles an edited media caption', () => {
    const parsed = parseEdit({
      ...editMessage,
      edit: {
        message: {
          image: { caption: 'Heylooo givig', id: '903470842067649' },
          type: 'image',
        },
        original_message_id: 'wamid.ORIGINAL',
      },
    })
    expect(parsed!.newType).toBe('image')
  })

  it('returns null on a partial edit rather than guessing', () => {
    // Leaving the old text in place is stale but true. Inventing content
    // would show the customer saying something they never said.
    expect(parseEdit({ ...editMessage, edit: { original_message_id: 'w' } })).toBeNull()
    expect(
      parseEdit({ ...editMessage, edit: { message: { type: 'text' } } }),
    ).toBeNull()
  })

  it('ignores messages that are not edits', () => {
    expect(parseEdit({ type: 'text', text: { body: 'hi' } })).toBeNull()
    expect(parseEdit(null)).toBeNull()
  })
})

describe('parseRevoke', () => {
  const revokeMessage = {
    from: '917506080480',
    id: 'wamid.REVOKEEVENT',
    revoke: { original_message_id: 'wamid.ORIGINAL' },
    timestamp: '1769753870',
    type: 'revoke',
  }

  it('extracts the deleted message id', () => {
    expect(parseRevoke(revokeMessage)).toEqual({
      originalMessageId: 'wamid.ORIGINAL',
      revokeMessageId: 'wamid.REVOKEEVENT',
    })
  })

  it('ignores anything that is not a revoke', () => {
    expect(parseRevoke({ type: 'text' })).toBeNull()
    expect(parseRevoke({ type: 'revoke' })).toBeNull()
  })
})

describe('isMessageMutation', () => {
  it('flags the two types that change an existing message', () => {
    // Without this both fall through the content-type mapping to 'text'
    // and land as NEW rows — an edit shows the message twice, a delete
    // adds an empty bubble.
    expect(isMessageMutation('edit')).toBe(true)
    expect(isMessageMutation('revoke')).toBe(true)
  })

  it('leaves ordinary messages alone', () => {
    expect(isMessageMutation('text')).toBe(false)
    expect(isMessageMutation('image')).toBe(false)
    expect(isMessageMutation('reaction')).toBe(false)
  })
})

// ============================================================
// Phase 2 — history backfill and address-book sync
// ============================================================

describe('parseHistory', () => {
  // Verbatim shape from Meta's history reference (via BSP docs). Note the
  // asymmetry that matters: BUSINESS messages carry
  // history_context.from_me = true, and customer messages simply OMIT the
  // field rather than sending false.
  const value = {
    history: [
      {
        metadata: { chunk_order: 1, phase: 0, progress: 100 },
        threads: [
          {
            id: '917506080480',
            messages: [
              {
                from: '918588096070',
                history_context: { from_me: true, status: 'read' },
                id: 'wamid.BUSINESS_1',
                text: { body: 'Hi man' },
                timestamp: '1775627842',
                type: 'text',
              },
              {
                from: '917506080480',
                history_context: { status: 'pending' },
                id: 'wamid.CUSTOMER_1',
                text: { body: 'Hi dude' },
                timestamp: '1775627825',
                type: 'text',
              },
            ],
          },
        ],
      },
    ],
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: '918588096070',
      phone_number_id: '1005385572668707',
    },
  }

  it('reads tenancy, phase, chunk order and progress', () => {
    const parsed = parseHistory(value)
    expect(parsed).not.toBeNull()
    expect(parsed!.phoneNumberId).toBe('1005385572668707')
    expect(parsed!.chunks).toHaveLength(1)
    expect(parsed!.chunks[0].phase).toBe(0)
    expect(parsed!.chunks[0].chunkOrder).toBe(1)
    expect(parsed!.chunks[0].progress).toBe(100)
  })

  it('uses the thread id as the customer phone', () => {
    // The thread id is the ONLY thing naming whose conversation these
    // messages belong to — `from` alternates between both parties.
    const thread = parseHistory(value)!.chunks[0].threads[0]
    expect(thread.customerPhone).toBe('917506080480')
    expect(thread.messages).toHaveLength(2)
  })

  it('derives fromMe by PRESENCE, not by boolean value', () => {
    // The bug this guards: `ctx.from_me === false` would be wrong,
    // because customer messages omit the key entirely. Reading it as a
    // plain boolean would make every customer message look like the
    // business's own, and the whole backfill would land on one side.
    const [business, customer] = parseHistory(value)!.chunks[0].threads[0]
      .messages
    expect(business.fromMe).toBe(true)
    expect(customer.fromMe).toBe(false)
  })

  it('upper-cases the history status so casing cannot leak through', () => {
    // Meta's docs list these uppercase; real payloads have shown
    // lowercase. Normalising here means the status mapper only handles one.
    const [business, customer] = parseHistory(value)!.chunks[0].threads[0]
      .messages
    expect(business.historyStatus).toBe('READ')
    expect(customer.historyStatus).toBe('PENDING')
  })

  it('preserves message content for the shared content parser', () => {
    const business = parseHistory(value)!.chunks[0].threads[0].messages[0]
    expect(business.text).toEqual({ body: 'Hi man' })
  })

  it('flags a declined history share as declined, not failed', () => {
    // The business said no on their phone. Nothing is broken, and there is
    // nothing to retry — so this must NOT look like an error, or the UI
    // offers a Retry button that cannot possibly help.
    const parsed = parseHistory({
      ...value,
      history: [
        {
          errors: [
            {
              code: 2593109,
              title: 'History sync is turned off by the business from the WhatsApp Business App',
              message: 'History sync is turned off by the business from the WhatsApp Business App',
              error_data: { details: 'History sharing is turned off by the business' },
            },
          ],
        },
      ],
    })
    expect(parsed!.chunks[0].error?.isDeclined).toBe(true)
    expect(parsed!.chunks[0].error?.code).toBe(2593109)
    expect(parsed!.chunks[0].threads).toEqual([])
  })

  it('treats any other error code as a real failure', () => {
    const parsed = parseHistory({
      ...value,
      history: [{ errors: [{ code: 999999, message: 'Something broke' }] }],
    })
    expect(parsed!.chunks[0].error?.isDeclined).toBe(false)
  })

  it('marks media placeholders and unsupported messages', () => {
    // A placeholder means the asset is not in this chunk, and for anything
    // older than two weeks it never will be — so it has to be storable as
    // a placeholder rather than waited on.
    const parsed = parseHistory({
      ...value,
      history: [
        {
          metadata: { chunk_order: 2, phase: 1, progress: 40 },
          threads: [
            {
              id: '447710173736',
              messages: [
                { from: '447710173736', id: 'wamid.PH', timestamp: '1', type: 'media_placeholder' },
                {
                  from: '447710173736',
                  id: 'wamid.ERR',
                  timestamp: '2',
                  type: 'errors',
                  errors: [{ code: 131051, message: 'Message type unknown' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const msgs = parsed!.chunks[0].threads[0].messages
    expect(msgs[0].isMediaPlaceholder).toBe(true)
    expect(msgs[1].isUnsupported).toBe(true)
  })

  it('clamps a progress value outside 0-100', () => {
    // The column has a 0–100 CHECK. A nonsense figure from Meta must not
    // fail the whole chunk's insert.
    const parsed = parseHistory({
      ...value,
      history: [{ metadata: { phase: 0, progress: 140 }, threads: value.history[0].threads }],
    })
    expect(parsed!.chunks[0].progress).toBe(100)
  })

  it('drops messages with no id, since the id is the dedupe key', () => {
    const parsed = parseHistory({
      ...value,
      history: [
        {
          metadata: { phase: 0, progress: 10 },
          threads: [{ id: '911', messages: [{ from: '911', type: 'text' }] }],
        },
      ],
    })
    expect(parsed!.chunks[0].threads[0].messages).toEqual([])
  })

  it('returns null without tenancy or history', () => {
    expect(parseHistory({ ...value, metadata: {} })).toBeNull()
    expect(parseHistory({ ...value, history: [] })).toBeNull()
    expect(parseHistory(null)).toBeNull()
  })
})

describe('historyStatusToMessageStatus', () => {
  it('maps Meta history states onto our own', () => {
    expect(historyStatusToMessageStatus('SENT')).toBe('sent')
    expect(historyStatusToMessageStatus('DELIVERED')).toBe('delivered')
    expect(historyStatusToMessageStatus('READ')).toBe('read')
    expect(historyStatusToMessageStatus('ERROR')).toBe('failed')
  })

  it('maps PLAYED to read', () => {
    // A played voice note has certainly been read, and we have no richer
    // state for it.
    expect(historyStatusToMessageStatus('PLAYED')).toBe('read')
  })

  it('maps PENDING to sending, not failed', () => {
    // PENDING means it never left the device. Calling that "failed" would
    // put a red error marker on a message that simply had not sent yet.
    expect(historyStatusToMessageStatus('PENDING')).toBe('sending')
  })

  it('falls back to delivered for anything unrecognised', () => {
    // These messages demonstrably reached WhatsApp. A status we cannot
    // read is not a reason to lose the message or to mark it failed.
    expect(historyStatusToMessageStatus('SOMETHING_NEW')).toBe('delivered')
    expect(historyStatusToMessageStatus(null)).toBe('delivered')
  })

  it('is case-insensitive', () => {
    expect(historyStatusToMessageStatus('read')).toBe('read')
  })
})

describe('parseAppStateSync', () => {
  it('parses an added contact with its names', () => {
    const parsed = parseAppStateSync({
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '918750963486', phone_number_id: '950443251490365' },
      state_sync: [
        {
          action: 'add',
          contact: {
            full_name: 'Pablo Morales',
            first_name: 'Pablo',
            phone_number: '16505551234',
          },
          metadata: { timestamp: '1738346006' },
          type: 'contact',
        },
      ],
    })
    expect(parsed!.phoneNumberId).toBe('950443251490365')
    expect(parsed!.contacts).toEqual([
      {
        action: 'add',
        phone: '16505551234',
        fullName: 'Pablo Morales',
        firstName: 'Pablo',
      },
    ])
  })

  it('parses a removal, where Meta sends no names', () => {
    // Names must stay null rather than becoming '' — a removal event
    // otherwise blanks out the name already staged for that number.
    const parsed = parseAppStateSync({
      metadata: { display_phone_number: '918750963486', phone_number_id: '950443251490365' },
      state_sync: [
        {
          action: 'remove',
          contact: { phone_number: '917715078842' },
          metadata: { timestamp: '0' },
          type: 'contact',
        },
      ],
    })
    expect(parsed!.contacts[0]).toEqual({
      action: 'remove',
      phone: '917715078842',
      fullName: null,
      firstName: null,
    })
  })

  it('skips entries that are not contacts', () => {
    // state_sync is a general channel; an unrecognised type must be
    // skipped rather than guessed at.
    expect(
      parseAppStateSync({
        metadata: { phone_number_id: '1' },
        state_sync: [{ type: 'something_else', action: 'add' }],
      }),
    ).toBeNull()
  })

  it('skips a contact with no phone number', () => {
    expect(
      parseAppStateSync({
        metadata: { phone_number_id: '1' },
        state_sync: [{ type: 'contact', action: 'add', contact: { full_name: 'No Number' } }],
      }),
    ).toBeNull()
  })

  it('treats an unknown action as add rather than dropping it', () => {
    // Only 'remove' is destructive. Defaulting anything else to 'add'
    // means a new Meta action verb surfaces the contact for review
    // instead of silently discarding it.
    const parsed = parseAppStateSync({
      metadata: { phone_number_id: '1' },
      state_sync: [{ type: 'contact', action: 'edit', contact: { phone_number: '911' } }],
    })
    expect(parsed!.contacts[0].action).toBe('add')
  })

  it('returns null on junk', () => {
    expect(parseAppStateSync(null)).toBeNull()
    expect(parseAppStateSync({ metadata: { phone_number_id: '1' } })).toBeNull()
  })
})
