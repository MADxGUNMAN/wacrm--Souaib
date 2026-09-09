// ============================================================
// Turning a Meta template failure into something a user can act on.
//
// The bug this exists to fix: the template routes caught the error from
// `submitMessageTemplate` and used `e.message` — the GENERIC Graph API
// sentence — while throwing away every field that actually identifies
// the failure. `MetaApiError` has carried `error_user_msg`,
// `error_data.details`, the code, the subcode and the fbtrace_id since
// migration 073, and `operatorText` already picks the most specific
// wording available. `send-message.ts` uses it. The template routes did
// not, so a rejected template said "Invalid parameter" when Meta had
// sent back the exact field that was wrong.
//
// Two things are separated on purpose:
//
//   message — Meta's own words, verbatim, never paraphrased. If Meta
//             says the body text is too long, that is what the user
//             reads. We are not a better authority on Meta's rules than
//             Meta is, and rewriting their message loses precision.
//
//   hint    — OUR added guidance, and only where we can be confident
//             from the code/subcode/status. Kept separate so it is
//             obvious which sentence came from Meta and which is ours.
//
// `blame` is the answer to the question the user actually asked: is this
// my problem or yours? Getting that wrong in either direction wastes
// someone's time — telling a user to fix their input when their token
// expired, or telling them to contact support when their template name
// is already taken.
//
// Codes are from Meta's published error reference:
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
// ============================================================

import { MetaApiError } from './meta-api';
import type { FailureBlame } from '@/lib/http/read-api-response';

export interface TemplateFailure {
  /** Meta's reason, verbatim and most-specific-first. Safe to display. */
  message: string;
  /** Our added guidance. Null when we cannot be confident. */
  hint: string | null;
  blame: FailureBlame;
  /** HTTP status to answer the browser with. */
  httpStatus: number;
  code: number | null;
  subcode: number | null;
  /** The value Meta asks for on a support ticket. */
  fbtraceId: string | null;
}

/**
 * Meta error codes that mean "the connection is broken", not "your
 * content is wrong". Distinguished because the fix is in Settings, and
 * no amount of editing the template will help.
 */
const AUTH_CODES = new Set([190, 200, 10, 102, 2500]);

/** Codes that mean Meta is rate limiting or briefly unavailable. */
const TRANSIENT_CODES = new Set([1, 2, 4, 80007, 131016, 133004]);

/**
 * Recognise "a template with this name already exists".
 *
 * Matched on TEXT as well as subcode because Meta has returned this
 * under more than one code over time, and the wording is the stable
 * part. A name clash is the single most common template failure and the
 * most trivially fixable, so it is worth catching precisely rather than
 * letting it fall through to a generic "invalid parameter".
 */
function looksLikeDuplicateName(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('already exists') ||
    t.includes('duplicate') ||
    (t.includes('name') && t.includes('taken'))
  );
}

/**
 * Recognise "Meta refused this edit outright".
 *
 * Meta returns this under code 100 — the same generic bucket as a genuine
 * content problem — with wording like "The status for this message
 * template can't be changed. You can only delete or add templates."
 *
 * Catching it separately matters because it fell through to the code-100
 * content advice, which said "Meta rejected something in the template
 * content above — fix it and resubmit". That sends the operator round a
 * loop: the refusal is not about the content, so editing and resubmitting
 * reproduces it exactly.
 *
 * IMPORTANT — what this does NOT mean: Meta genuinely does support
 * editing approved templates. The docs are explicit that a template can
 * be edited while Approved, Rejected or Paused, subject to once per 24
 * hours and 10 times per 30 days. So this is not "approved templates are
 * read-only"; it is "this particular edit was refused", and the honest
 * wording below reflects that rather than over-claiming a rule that does
 * not exist.
 *
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/
 */
function looksLikeEditNotAllowed(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("can't be changed") ||
    t.includes('cannot be changed') ||
    t.includes('only delete or add') ||
    t.includes('can only be deleted')
  );
}

export function describeTemplateFailure(
  err: unknown,
  mode: 'submit' | 'edit' | 'delete' = 'submit'
): TemplateFailure {
  // Not a Meta error at all — a thrown string, a network failure, a bug
  // in our own code before the request went out. Do not dress it up as
  // Meta's fault.
  if (!(err instanceof MetaApiError)) {
    const message =
      err instanceof Error ? err.message : `Could not ${mode} the template.`;
    return {
      message,
      hint: 'This did not come from Meta — it happened before the request was sent. Please report it if it repeats.',
      blame: 'unknown',
      httpStatus: 500,
      code: null,
      subcode: null,
      fbtraceId: null,
    };
  }

  // Meta's own most-specific wording. Never rewritten.
  const message = err.operatorText;
  const searchable = [err.userMessage, err.details, err.message]
    .filter(Boolean)
    .join(' ');

  const base = {
    message,
    code: err.code,
    subcode: err.subcode,
    fbtraceId: err.fbtraceId,
  };

  // ---- Connection / configuration ----
  if (err.httpStatus === 401 || (err.code && AUTH_CODES.has(err.code))) {
    return {
      ...base,
      hint: 'Your WhatsApp connection is no longer valid. Reconnect the account in Settings → WhatsApp Setup, then try again. Editing the template will not help.',
      blame: 'connection',
      httpStatus: 502,
    };
  }

  // ---- Rate limits ----
  // Meta allows roughly 100 template creates per hour per WABA.
  if (err.httpStatus === 429 || (err.code && TRANSIENT_CODES.has(err.code))) {
    return {
      ...base,
      hint:
        err.httpStatus === 429
          ? 'Meta limits how many templates you can create per hour (about 100). Wait and try again — nothing is wrong with this template.'
          : 'Meta is rate limiting or briefly unavailable. Wait a moment and retry.',
      blame: 'upstream',
      httpStatus: 429,
    };
  }

  // ---- Edit refused outright ----
  // Checked BEFORE the code-100 content branch, which would otherwise
  // claim the template content is at fault and send the operator round
  // the same loop.
  if (looksLikeEditNotAllowed(searchable)) {
    return {
      ...base,
      hint: 'Meta refused this edit — nothing you typed is wrong, so changing the content and resubmitting will give the same result. Meta allows one edit per 24 hours and 10 per month, so if you edited this template recently, try again tomorrow. If it keeps failing, copy it into a new template with a different name (Meta identifies templates by name + language) and delete this one once the new one is approved.',
      blame: 'upstream',
      // 409, not 400: nothing about the submitted content is wrong. A 400
      // here is what made the client show a content-validation message.
      httpStatus: 409,
    };
  }

  // ---- Duplicate name: the most common and most fixable ----
  if (looksLikeDuplicateName(searchable)) {
    return {
      ...base,
      hint: 'Meta allows one template per name per language. Either pick a different name, or edit the existing template instead of creating a new one.',
      blame: 'you',
      httpStatus: 409,
    };
  }

  // ---- Policy ----
  if (err.code === 132007) {
    return {
      ...base,
      hint: 'The content breaks a WhatsApp content policy. Marketing wording in a Utility template is the usual cause — check the category and remove promotional language.',
      blame: 'you',
      httpStatus: 400,
    };
  }

  // ---- Marketing disabled on this WABA ----
  if (err.code === 131063) {
    return {
      ...base,
      hint: 'Marketing templates are disabled for this WhatsApp account. Choose the Utility category, or ask Meta to enable marketing messages.',
      blame: 'connection',
      httpStatus: 400,
    };
  }

  // ---- Missing / invalid parameters: content the user controls ----
  // 100 covers unsupported, misspelled and over-long parameters; 131008
  // is a missing required one; 131009 an invalid value. All three are
  // decided by what was typed into the form, so Meta's own `details`
  // (which names the offending field) is the useful part and is already
  // in `message`.
  if (
    err.code === 100 ||
    err.code === 131008 ||
    err.code === 131009 ||
    err.httpStatus === 400
  ) {
    return {
      ...base,
      hint: 'Meta rejected something in the template content above. The message names the field — fix it and resubmit.',
      blame: 'you',
      httpStatus: 400,
    };
  }

  // ---- Meta's side ----
  if (err.httpStatus >= 500) {
    return {
      ...base,
      hint: 'This is a failure on Meta’s side, not in your template. Retry shortly.',
      blame: 'upstream',
      httpStatus: 502,
    };
  }

  // Unclassified. Say so honestly and hand over the trace id, rather
  // than guessing at a cause.
  return {
    ...base,
    hint: err.fbtraceId
      ? `If this persists, quote Meta trace id ${err.fbtraceId} to support.`
      : null,
    blame: 'unknown',
    httpStatus: 502,
  };
}

/** The JSON body shape every template route returns on failure. */
export function templateFailureBody(failure: TemplateFailure) {
  return {
    error: failure.message,
    hint: failure.hint,
    blame: failure.blame,
    // Diagnostics. Not shown prominently, but the fbtrace_id is the
    // first thing Meta asks for on a Direct Support ticket, so losing it
    // means the failure can never be escalated.
    meta: {
      code: failure.code,
      subcode: failure.subcode,
      fbtrace_id: failure.fbtraceId,
    },
  };
}
