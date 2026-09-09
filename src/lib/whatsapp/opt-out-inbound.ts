// ============================================================
// Inbound STOP / START handling.
//
// Runs from the webhook's processMessage AFTER the inbound row is
// inserted and BEFORE any reactive engine. That position is deliberate:
//
//   * After the INSERT, whose early-return on a duplicate wamid is the
//     de-facto idempotency barrier — so a Meta redelivery of the same
//     STOP cannot double-process.
//   * Before Flows / automations / AI, because a customer who just asked
//     to be left alone must not receive a bot reply on top of the
//     confirmation. The caller ANDs `consumed` into those three gates the
//     same way it already threads `flowConsumed`.
//
// This is hardcoded rather than left to a `keyword_match` automation on
// purpose. An automation is opt-in per account (so accounts that never
// build one have no opt-out path), is skipped entirely when a Flow
// consumed the message, cannot stop the AI auto-reply, and matches by
// substring — which would opt out anyone who wrote "stop by tomorrow".
//
// See docs/marketing-opt-out.md.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  engineSendInteractiveButtons,
  engineSendText,
} from '@/lib/flows/meta-send';
import {
  loadOptInOutConfig,
  recordMarketingOptOut,
  removeMarketingOptOut,
} from '@/lib/whatsapp/marketing-opt-out';
import {
  RESERVED_OPT_IN_PAYLOAD,
  SUGGESTED_OPT_IN_BUTTON_LABEL,
  isReservedOptInPayload,
  isReservedOptOutPayload,
  matchesKeyword,
} from '@/lib/whatsapp/opt-out-keywords';

export interface HandleInboundOptOutArgs {
  db: SupabaseClient;
  accountId: string;
  /** Audit / sender-of-record for the confirmation message row. */
  configOwnerUserId: string;
  contactId: string;
  conversationId: string;
  /** Customer's phone in any shape; normalized downstream. */
  phone: string;
  /** Message text as parsed by the webhook (`contentText`). */
  text: string | null;
  /**
   * For a template quick-reply tap, the button PAYLOAD.
   *
   * Matched in addition to the visible text because the payload is the
   * stable value — a label can be translated or edited at Meta without
   * the business realising it broke their opt-out button.
   */
  interactiveReplyId: string | null;
}

export type InboundOptOutOutcome =
  /** Not an opt-out/opt-in message — carry on with the normal pipeline. */
  | { consumed: false }
  /** Handled. The caller must suppress Flows, automations and the AI. */
  | { consumed: true; action: 'opted_out' | 'opted_in' };

const NOT_CONSUMED: InboundOptOutOutcome = { consumed: false };

/**
 * Detect and act on an opt-out / opt-in keyword.
 *
 * Never throws: the caller is inside the webhook's `after()` block and a
 * failure here must not cost the inbound message that is already stored.
 */
export async function handleInboundOptOutKeyword(
  args: HandleInboundOptOutArgs
): Promise<InboundOptOutOutcome> {
  const {
    db,
    accountId,
    configOwnerUserId,
    contactId,
    conversationId,
    phone,
    text,
    interactiveReplyId,
  } = args;

  try {
    const config = await loadOptInOutConfig(db, accountId);

    // `is_active` gates CAPTURE only. Contacts already suppressed stay
    // suppressed — enforcement lives in the send paths and never reads
    // this flag.
    if (!config.isActive) return NOT_CONSUMED;

    // A tap is matched on its payload; typed text on its content. Both
    // are checked so a business can offer either route.
    const optedOutByText = matchesKeyword(text, config.optOutKeywords);
    // A tap also matches the RESERVED payload, not just the account's
    // keywords. Without that, a button labelled "Unsubscribe" — or
    // translated, or reworded at Meta — carries a payload matching no
    // keyword and does nothing at all, which reads to the customer as
    // being ignored and gets the number blocked.
    const optedOutByTap =
      matchesKeyword(interactiveReplyId, config.optOutKeywords) ||
      isReservedOptOutPayload(interactiveReplyId);

    // Opt-OUT is evaluated first. If a keyword somehow appears in both
    // lists (a misconfiguration the UI should prevent), the safer reading
    // of an ambiguous message is that the customer wants out.
    if (optedOutByText || optedOutByTap) {
      const result = await recordMarketingOptOut(db, {
        accountId,
        phone,
        contactId,
        source: optedOutByTap ? 'customer_button' : 'customer_keyword',
      });

      if (result === 'failed') {
        // Do NOT confirm and do NOT consume. Telling somebody they have
        // been unsubscribed when the write failed is worse than staying
        // quiet — they would stop asking while still receiving marketing.
        console.error(
          '[opt-out] could not record inbound opt-out; leaving the message to the normal pipeline',
          { accountId, contactId }
        );
        return NOT_CONSUMED;
      }

      // Stop anything already mid-conversation from talking over the
      // confirmation. Same pattern as the coexistence echo handler: a
      // human (or here, an explicit instruction) takes precedence over
      // the bots. Best-effort — the opt-out itself is already recorded.
      await silenceAutomatedReplies(db, accountId, contactId, conversationId);

      // Confirmation is sent even when the row already existed: a
      // customer repeating STOP is usually unsure it worked, and silence
      // reads as being ignored.
      await sendConfirmation({
        accountId,
        configOwnerUserId,
        conversationId,
        contactId,
        text: config.optOutResponseMessage,
        // Offer a one-tap way back. This is the direction that needs a
        // button: `optInKeywords` may legitimately be EMPTY, and even when
        // it is not, a customer who has just left has no reason to know
        // the magic word. A dead end here is how "unsubscribe" turns into
        // "block", which is the outcome with real consequences.
        offerResubscribe: true,
      });

      return { consumed: true, action: 'opted_out' };
    }

    const optedInByText = matchesKeyword(text, config.optInKeywords);
    // Same reasoning as the opt-out tap, and it is what makes the
    // "Resubscribe" button on the opt-out confirmation work: that button
    // carries the reserved payload, so it keeps working even for an
    // account that offers no opt-in keywords at all.
    const optedInByTap =
      matchesKeyword(interactiveReplyId, config.optInKeywords) ||
      isReservedOptInPayload(interactiveReplyId);

    if (optedInByText || optedInByTap) {
      const removed = await removeMarketingOptOut(db, {
        accountId,
        phone,
        // The customer asked for this themselves, so the history must not
        // record it as an agent acting on their behalf.
        source: optedInByTap ? 'customer_button' : 'customer_keyword',
      });
      if (!removed) {
        console.error(
          '[opt-out] could not clear opt-out on opt-in; leaving the message to the normal pipeline',
          { accountId, contactId }
        );
        return NOT_CONSUMED;
      }

      // Deliberately NOT silencing flows or the AI here. Opting back in
      // is a signal the customer wants to engage; pausing their
      // conversation would be the opposite of what they asked for. The
      // message is still consumed so nothing replies twice.
      await sendConfirmation({
        accountId,
        configOwnerUserId,
        conversationId,
        contactId,
        text: config.optInResponseMessage,
        // Deliberately NO button on this one. The default opt-in wording
        // already ends with "Reply STOP to opt out at any time", so the
        // way out is stated; putting it one accidental tap away would let
        // a mis-tap instantly undo the choice just made. Asymmetric on
        // purpose — the two directions are not equally reversible.
        offerResubscribe: false,
      });

      return { consumed: true, action: 'opted_in' };
    }

    return NOT_CONSUMED;
  } catch (err) {
    console.error(
      '[opt-out] inbound keyword handling threw:',
      err instanceof Error ? err.message : err
    );
    return NOT_CONSUMED;
  }
}

/**
 * Pause an active Flow run and mute AI auto-reply for this thread.
 *
 * Mirrors the coexistence echo handler in the webhook. Best-effort by
 * design: the opt-out is already recorded, and losing this would only
 * mean a bot gets one more word in — bad, but not a compliance failure.
 */
async function silenceAutomatedReplies(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  conversationId: string
): Promise<void> {
  try {
    const { error } = await db
      .from('flow_runs')
      .update({
        status: 'paused_by_agent',
        ended_at: new Date().toISOString(),
        end_reason: 'customer_opted_out',
      })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'active');
    if (error) {
      console.error('[opt-out] pausing flow run failed:', error.message);
    }
  } catch (err) {
    console.error(
      '[opt-out] pausing flow run threw:',
      err instanceof Error ? err.message : err
    );
  }

  try {
    const { error } = await db
      .from('conversations')
      .update({ ai_autoreply_disabled: true })
      .eq('id', conversationId);
    if (error) {
      console.error('[opt-out] disabling AI auto-reply failed:', error.message);
    }
  } catch (err) {
    console.error(
      '[opt-out] disabling AI auto-reply threw:',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Send the configured confirmation.
 *
 * The 24-hour customer-service window is open by definition here — the
 * customer just messaged us — so plain text is deliverable and no
 * template is required.
 *
 * Best-effort: a failed confirmation must not undo a recorded opt-out.
 */
async function sendConfirmation(args: {
  accountId: string;
  configOwnerUserId: string;
  conversationId: string;
  contactId: string;
  text: string;
  /** Attach a one-tap "Resubscribe" button to the confirmation. */
  offerResubscribe: boolean;
}): Promise<void> {
  const body = args.text?.trim();
  if (!body) return;

  const common = {
    accountId: args.accountId,
    userId: args.configOwnerUserId,
    conversationId: args.conversationId,
    contactId: args.contactId,
  };

  if (args.offerResubscribe) {
    try {
      await engineSendInteractiveButtons({
        ...common,
        bodyText: body,
        buttons: [
          {
            // The button's id is what comes back as the payload, so it
            // carries the RESERVED value rather than a keyword. That is
            // what makes this button work for an account with no opt-in
            // keywords configured at all.
            id: RESERVED_OPT_IN_PAYLOAD,
            title: SUGGESTED_OPT_IN_BUTTON_LABEL,
          },
        ],
      });
      return;
    } catch (err) {
      // Fall through to plain text. An interactive message has more ways
      // to be refused than a text one, and a confirmation that arrives
      // without its button is far better than no confirmation: the
      // customer's real question is "did that work?".
      console.error(
        '[opt-out] interactive confirmation failed, falling back to text:',
        err instanceof Error ? err.message : err
      );
    }
  }

  try {
    await engineSendText({ ...common, text: body });
  } catch (err) {
    console.error(
      '[opt-out] confirmation send failed:',
      err instanceof Error ? err.message : err
    );
  }
}
