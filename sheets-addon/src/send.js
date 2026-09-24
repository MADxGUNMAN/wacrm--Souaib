/**
 * send.js — the one place a real, paid WhatsApp message is triggered.
 *
 * ONE CALL PER ROW, NOT BATCHED
 * The plan's §9.3 sketched batching matching rows into calls of ≤500
 * recipients. That is not implementable safely against this endpoint,
 * and the reason is worth stating because the batched version looks
 * obviously better:
 *
 *   POST /api/v1/campaigns/{id}/send takes ONE idempotency key per call.
 *   Correctness here comes from that key being per row — that is what
 *   makes "this row sends once, ever" structural rather than hopeful.
 *   A batch would have to derive its key from the set of rows in it. Add
 *   one more matching row tomorrow and the set changes, so the key
 *   changes, so every row already sent in that batch is sent AGAIN.
 *
 * Per-row calls cost more requests and are slower. A duplicate paid
 * message costs money, lands on a real person's phone, and drags the
 * account's Meta quality rating down — and at scale it does that
 * hundreds of times before anyone notices. Throughput is the right thing
 * to give up. The per-run ceiling in dispatcher.js is what keeps the
 * slower path inside Apps Script's 6-minute budget.
 */
const ReplaiSend = {
  /**
   * Deterministic idempotency key for one row.
   *
   * SHA-256 of the recipe in `ReplaiRowMap.keySource`, hex-encoded: 64
   * characters, comfortably inside the server's 200-character cap, and
   * stable across runs for the same row. Hashing rather than sending the
   * raw recipe also keeps the spreadsheet id and the customer's phone
   * number out of a field the CRM stores in plain text.
   */
  keyFor: function (source) {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      source,
      Utilities.Charset.UTF_8
    );
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      // Apps Script returns SIGNED bytes (-128..127); the & 0xff is what
      // stops a negative byte becoming '-2d' in the hex string.
      const part = (bytes[i] & 0xff).toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  },

  /**
   * Send one row through a campaign.
   *
   * @returns {{outcome: string, status: string, message: string,
   *            broadcastId: string}} `outcome` is machine-readable for
   *   the run summary; `status` is the text written into the row's status
   *   cell. Outcomes:
   *     sent        — queued at the CRM, will go out on the next sweep
   *     duplicate   — this row already sent under this key; nothing done
   *     failed      — rejected for a reason specific to this row
   *     unauthorised — the key is dead; the whole run should stop
   *     paused      — the campaign is paused at the CRM; stop the run
   *     inactive    — the workspace subscription lapsed; stop the run
   *     rate_limited — back off; stop the run and continue next time
   */
  sendRow: function (rule, recipient, idempotencyKey, source) {
    const result = ReplaiApi.post(
      '/campaigns/' + encodeURIComponent(rule.campaign.id) + '/send',
      {
        idempotency_key: idempotencyKey,
        recipients: [recipient],
        // Sent alongside the values so the CRM's campaign report can name
        // each one with the sheet column it came from. Top level, not on
        // the recipient: it describes the RULE's mapping, which is the
        // same for every row this rule ever sends.
        param_labels: ReplaiRowMap.paramLabels(rule),
        source: source,
      }
    );

    if (result.ok) {
      const data = result.data || {};

      // A 200 with duplicate:true means the server's UNIQUE constraint
      // recognised this key. Not an error — it is the guard working, and
      // the honest status is "already sent", not "sent again".
      if (data.duplicate) {
        return {
          outcome: 'duplicate',
          status: '',
          message: '',
          broadcastId: data.broadcast_id || '',
        };
      }

      if (data.rejected > 0 && data.accepted === 0) {
        return {
          outcome: 'failed',
          status:
            'Failed · number rejected by Replai · ' + ReplaiSheets.stamp(),
          message: 'recipient rejected',
          broadcastId: data.broadcast_id || '',
        };
      }

      if (data.suppressed > 0 && data.accepted === 0) {
        // Already enforced in the CRM before insert; surfacing it stops
        // the operator re-adding the row and wondering why it is ignored.
        return {
          outcome: 'failed',
          status:
            'Skipped · contact opted out of marketing · ' +
            ReplaiSheets.stamp(),
          message: 'opted out',
          broadcastId: data.broadcast_id || '',
        };
      }

      // The CRM reports which path it took. A single-row rule send goes
      // out immediately; only a bulk send waits for the five-minute
      // sweep. Saying "Queued" for both made an instant send look
      // delayed, which is the one thing an On Change rule must not do.
      //
      // Neither wording claims delivery: the fan-out to Meta happens
      // after the response, so "Sending" is as much as this add-on can
      // honestly know. The Inbox is where delivery is confirmed.
      return {
        outcome: 'sent',
        status:
          (data.status === 'scheduled' ? 'Queued · ' : 'Sending · ') +
          ReplaiSheets.stamp(),
        message: '',
        broadcastId: data.broadcast_id || '',
      };
    }

    return ReplaiSend.classifyFailure_(result);
  },

  /**
   * Split failures into "this row" and "this whole run".
   *
   * The distinction matters more than the wording: a dead key, a paused
   * campaign or a lapsed subscription will fail identically for every
   * remaining row, so grinding through 300 of them wastes the run's
   * budget and buries the real reason under 300 identical status cells.
   */
  classifyFailure_: function (result) {
    const stamp = ReplaiSheets.stamp();

    switch (result.code) {
      case 'unauthorized':
        return {
          outcome: 'unauthorised',
          status:
            'Not sent · Replai rejected this account\u2019s API key · ' + stamp,
          message:
            'The API key for this rule no longer works. Reconnect in the Replai sidebar, or take the rule over.',
          broadcastId: '',
        };

      case 'forbidden':
        return {
          outcome: 'unauthorised',
          status: 'Not sent · API key is missing send permission · ' + stamp,
          message:
            'This key cannot send broadcasts. Recreate it in Replai with the "Launch broadcast campaigns" permission.',
          broadcastId: '',
        };

      case 'campaign_paused':
        return {
          outcome: 'paused',
          status: 'Not sent · campaign is paused in Replai · ' + stamp,
          message: result.message,
          broadcastId: '',
        };

      case 'subscription_inactive':
        return {
          outcome: 'inactive',
          status: 'Not sent · Replai subscription is inactive · ' + stamp,
          message: result.message,
          broadcastId: '',
        };

      case 'rate_limited':
        return {
          outcome: 'rate_limited',
          status: 'Not sent yet · Replai rate limit reached · ' + stamp,
          message:
            'Rate limit reached. The remaining rows will be picked up on the next run.',
          broadcastId: '',
        };

      case 'not_found':
        return {
          outcome: 'paused',
          status: 'Not sent · campaign no longer exists in Replai · ' + stamp,
          message:
            'The campaign this rule sends has been deleted in Replai. Edit the rule and pick another.',
          broadcastId: '',
        };

      case 'network_error':
      case 'invalid_response':
        return {
          outcome: 'rate_limited',
          status: 'Not sent yet · could not reach Replai · ' + stamp,
          message:
            'Could not reach Replai. The remaining rows will be picked up on the next run.',
          broadcastId: '',
        };

      default:
        // A per-row rejection: a bad phone the CRM caught, a template
        // that no longer matches, an empty parameter. Keep Replai's own
        // wording — it is more specific than anything invented here.
        return {
          outcome: 'failed',
          status:
            'Failed · ' + ReplaiSend.trim_(result.message) + ' · ' + stamp,
          message: result.message,
          broadcastId: '',
        };
    }
  },

  /** True when this outcome means the rest of the run is pointless. */
  isFatal: function (outcome) {
    return (
      outcome === 'unauthorised' ||
      outcome === 'paused' ||
      outcome === 'inactive' ||
      outcome === 'rate_limited'
    );
  },

  /** Status cells are read at a glance; a paragraph in one is unreadable. */
  trim_: function (message) {
    const text = String(message || 'rejected by Replai');
    return text.length > 90 ? text.slice(0, 90) + '…' : text;
  },
};
