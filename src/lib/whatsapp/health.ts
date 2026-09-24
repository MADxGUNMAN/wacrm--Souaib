// ============================================================
// Meta messaging health — pure derivation, no I/O.
//
// Replaces guesswork in the WhatsApp Setup checklist. The payment step
// used to render "Action Required" whenever an account was connected,
// with nothing behind it: it never checked anything, so it nagged
// forever even after the customer had added a card and Meta had ticked
// the same task green on its own dashboard. A permanent warning teaches
// people to ignore warnings.
//
// The fix is to report META'S OWN VERDICT instead of inventing one.
// `GET /<PHONE_NUMBER_ID>?fields=health_status` returns whether
// messaging is AVAILABLE / LIMITED / BLOCKED across every node involved
// (phone number, WABA, business portfolio, app), and for anything not
// AVAILABLE it returns Meta's own description and suggested fix.
//
// Deliberate limit on what we claim: this does NOT assert "a payment
// method exists". There is no public Graph field for that, and inferring
// it from a green health status would be inventing a fact again, just in
// the opposite direction. We report what Meta reports — can you send, or
// not, and if not, why — which is the thing the customer actually needs
// to know.
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/health-status/
// ============================================================

/** Meta's per-node and overall messaging verdict. */
export type SendingReadiness = 'available' | 'limited' | 'blocked' | 'unknown';

export interface HealthBlocker {
  code: number | null;
  description: string;
  /** Meta's suggested remedy. Often the most useful line on the screen. */
  solution: string | null;
  /**
   * Whether this stops sending outright or merely restricts it.
   *
   * Both are carried in one list because they come from the same Meta
   * field and read the same way; the caller decides which panel each
   * belongs in. Before this existed, only `blocked` entities were read
   * at all, which silently discarded the single most common real
   * restriction — see the note on `summarizeHealthStatus`.
   */
  severity: 'blocked' | 'limited';
}

export interface HealthSummary {
  readiness: SendingReadiness;
  /**
   * Structured reasons sending is not fully available, from any node.
   * `blocked` entries come first; check `severity` before presenting one
   * as a hard stop.
   */
  blockers: HealthBlocker[];
  /** Free-text notes explaining a LIMITED status. */
  limitations: string[];
}

export const UNKNOWN_HEALTH: HealthSummary = {
  readiness: 'unknown',
  blockers: [],
  limitations: [],
};

/**
 * Meta's SIP / calling error codes, observed on live accounts.
 *
 * This product has no calling feature, so these are pure noise in a
 * messaging screen. Codes are checked alongside wording because a code
 * is stable and a sentence is not.
 */
const CALLING_ONLY_ERROR_CODES = new Set([138024, 138025]);

/**
 * True when an error is only about WhatsApp Business calling.
 *
 * Meta shares one `errors` array between the messaging and calling
 * capabilities of an entity, so an entity whose messaging is merely
 * restricted can still be carrying two SIP errors that have nothing to
 * do with why sending is limited.
 */
function isCallingOnlyIssue(description: string, code: number | null): boolean {
  if (code !== null && CALLING_ONLY_ERROR_CODES.has(code)) return true;
  return /\bsip\b/i.test(description) || /business calling/i.test(description);
}

function toReadiness(value: unknown): SendingReadiness {
  switch (String(value ?? '').toUpperCase()) {
    case 'AVAILABLE':
      return 'available';
    case 'LIMITED':
      return 'limited';
    case 'BLOCKED':
      return 'blocked';
    default:
      return 'unknown';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Worst-wins ordering, so one blocked node decides the verdict. */
const SEVERITY: Record<SendingReadiness, number> = {
  unknown: 0,
  available: 1,
  limited: 2,
  blocked: 3,
};

/**
 * Normalise a raw `health_status` payload, scoped to MESSAGING only.
 *
 * Two traps in Meta's payload shape, both of which produced false alarms
 * on a real account before this was scoped properly:
 *
 * 1. `errors` and `additional_info` are ONE array per entity, shared
 *    between the `can_send_message` and `can_receive_call_sip`
 *    capabilities. Meta's own documented example shows a phone number
 *    with `can_send_message: AVAILABLE` and `can_receive_call_sip:
 *    BLOCKED` carrying two SIP errors. Reading the array without asking
 *    WHICH capability is broken reports "sending is blocked" to a
 *    business whose sending is perfectly fine. This app has no calling
 *    feature at all, so SIP problems are pure noise here and are
 *    filtered out by subject — see `isCallingOnlyIssue`.
 *
 *    Errors are read from entities whose messaging is blocked OR
 *    limited. Reading only the blocked ones looked safe and was the
 *    worst bug on this screen: a real account sat at TIER_250 with its
 *    BUSINESS entity reporting `LIMITED` and error 141010, "The Business
 *    has not passed business verification" — the actual reason — while
 *    the only thing shown was a stale note about the display name. The
 *    one message that would have told the customer what to do was the
 *    one being discarded.
 *
 * 2. The root `health_status.can_send_message` aggregate cannot be
 *    trusted for a messaging-only product. In that same documented
 *    example the root reads BLOCKED while every node's messaging is
 *    AVAILABLE — the aggregate had gone red purely because of SIP.
 *    Readiness is therefore derived from the entities' own messaging
 *    statuses, and the root is used only as a fallback when no entities
 *    are present.
 *
 * Errors are still gathered across ALL entity types, not just the phone
 * number: a billing or verification problem surfaces on the WABA or the
 * business portfolio, which is exactly what this screen needs to show.
 *
 * Tolerant of a missing or malformed payload — Meta may omit the field
 * on older API versions or when a token lacks the permission, and the
 * caller must then fall back to neutral copy rather than a fabricated
 * warning.
 */
export function summarizeHealthStatus(raw: unknown): HealthSummary {
  const root = asRecord(raw);
  if (!root) return UNKNOWN_HEALTH;

  const blockers: HealthBlocker[] = [];
  const limitations: string[] = [];
  const seen = new Set<string>();

  const entities = Array.isArray(root.entities) ? root.entities : [];
  let worst: SendingReadiness | null = null;

  for (const entry of entities) {
    const entity = asRecord(entry);
    if (!entity) continue;

    // The messaging verdict for THIS node. Note we read
    // `can_send_message`, never `can_receive_call_sip`.
    const messaging = toReadiness(entity.can_send_message);
    if (messaging !== 'unknown') {
      if (worst === null || SEVERITY[messaging] > SEVERITY[worst]) {
        worst = messaging;
      }
    }

    if (
      (messaging === 'blocked' || messaging === 'limited') &&
      Array.isArray(entity.errors)
    ) {
      for (const rawError of entity.errors) {
        const error = asRecord(rawError);
        if (!error) continue;

        const description =
          typeof error.error_description === 'string'
            ? error.error_description.trim()
            : '';
        if (!description) continue;

        const code =
          typeof error.error_code === 'number' ? error.error_code : null;

        // Now that restricted entities are read too, their SIP errors
        // come with them. Filtered by subject rather than by entity,
        // because messaging-limited and calling-blocked routinely occur
        // on the SAME phone number and share one array.
        if (isCallingOnlyIssue(description, code)) continue;

        // The same requirement can be reported by more than one node
        // (an app and its WABA both complaining). Showing it twice makes
        // the list look broken.
        if (seen.has(description)) continue;
        seen.add(description);

        blockers.push({
          code,
          description,
          solution:
            typeof error.possible_solution === 'string' &&
            error.possible_solution.trim()
              ? error.possible_solution.trim()
              : null,
          severity: messaging,
        });
      }
    }

    if (messaging === 'limited' && Array.isArray(entity.additional_info)) {
      for (const note of entity.additional_info) {
        if (typeof note !== 'string') continue;
        const text = note.trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          limitations.push(text);
        }
      }
    }
  }

  return {
    readiness: worst ?? toReadiness(root.can_send_message),
    // Hard stops first. Meta returns entities in its own order, which
    // put a restriction ahead of an outright block on a real account.
    blockers: blockers.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'blocked' ? -1 : 1
    ),
    limitations,
  };
}

// ------------------------------------------------------------
// Reconciling Meta against itself
// ------------------------------------------------------------

/**
 * What an issue is actually about.
 *
 * Meta returns every reason sending is restricted in one flat list, but
 * this settings screen has a dedicated step for several of them —
 * payment, business verification, display name. Dumping the whole list
 * into the payment step told a customer their payment method was the
 * problem when the real cause was verification, and repeated the same
 * warning in two places at once.
 *
 * `other` is the honest bucket for wording we do not recognise. It is
 * rendered in the general sending step rather than dropped: a message we
 * cannot categorise is still a message the customer needs.
 */
export type HealthIssueSubject =
  | 'payment'
  | 'business_verification'
  | 'display_name'
  | 'registration'
  | 'other';

/**
 * Classify one of Meta's messages by subject.
 *
 * Matching is on Meta's wording, with the same caveat as
 * `resolveHealthIssueLink`: if Meta rephrases or localises a message, a
 * specific match can miss and the issue lands in `other`. That degrades
 * to "shown in the general step", never to "hidden".
 *
 * Order is deliberate. Verification and display name are checked before
 * payment because Meta describes them in terms of what they block, and
 * several of those sentences mention billing in passing.
 */
export function classifyHealthIssue(text: string): HealthIssueSubject {
  const haystack = text.toLowerCase();

  if (haystack.includes('display name')) return 'display_name';

  if (
    haystack.includes('business verification') ||
    haystack.includes('verify your business') ||
    haystack.includes('not passed business') ||
    haystack.includes('unverified business')
  ) {
    return 'business_verification';
  }

  // Number registration, which belongs to the connection step. Checked
  // before payment because Meta describes an unregistered number in terms
  // of the messages it cannot bill for.
  if (
    haystack.includes('not linked') ||
    haystack.includes('not registered') ||
    haystack.includes('otp') ||
    haystack.includes('register')
  ) {
    return 'registration';
  }

  if (
    haystack.includes('payment') ||
    haystack.includes('billing') ||
    haystack.includes('credit line') ||
    haystack.includes('funding') ||
    haystack.includes('spending limit')
  ) {
    return 'payment';
  }

  return 'other';
}

/** One reason sending is restricted, ready to render in its own section. */
export interface HealthIssue {
  /** Meta's sentence, verbatim. Never rewritten. */
  description: string;
  /** Meta's suggested remedy, when it gave one. */
  solution: string | null;
  code: number | null;
  severity: 'blocked' | 'limited';
  subject: HealthIssueSubject;
}

export type GroupedHealthIssues = Record<HealthIssueSubject, HealthIssue[]>;

/**
 * Flatten Meta's health payload into issues, grouped by what they concern.
 *
 * Merges the two shapes Meta uses — structured `errors` with a code and a
 * suggested fix, and free-text `additional_info` notes with neither —
 * because to a customer they are the same thing: a reason, and what to do
 * about it. Each is then routed to the settings step that owns the
 * subject, so no step shows a problem that belongs to another.
 *
 * ─── Why `display_name` is collected and then never rendered ──────
 *
 * Meta's health note about the display name is redundant in every state,
 * because the Display name tile derives its wording from `name_status`,
 * which is both more authoritative and better phrased:
 *
 *   • name accepted — the note says "not been approved yet" and
 *     contradicts the tile beside it, which reads as a broken screen,
 *   • name declined — the tile already says Meta rejected it AND what to
 *     do, so the note adds a vaguer restatement.
 *
 * An earlier attempt kept the note and annotated the contradiction. That
 * was worse: three paragraphs where the tile's own one-line verdict had
 * already answered the question. The subject is still classified so the
 * note cannot leak into the general bucket.
 *
 * Within a subject, hard blocks come before restrictions.
 */
export function groupHealthIssues(
  health: HealthSummary | null | undefined
): GroupedHealthIssues {
  const grouped: GroupedHealthIssues = {
    payment: [],
    business_verification: [],
    display_name: [],
    registration: [],
    other: [],
  };
  if (!health) return grouped;

  for (const blocker of health.blockers) {
    grouped[classifyHealthIssue(blocker.description)].push({
      description: blocker.description,
      solution: blocker.solution,
      code: blocker.code,
      severity: blocker.severity,
      subject: classifyHealthIssue(blocker.description),
    });
  }

  for (const note of health.limitations) {
    const subject = classifyHealthIssue(note);
    grouped[subject].push({
      description: note,
      // Meta attaches no remedy to these, which is precisely why they
      // needed routing to a step that already explains the fix.
      solution: null,
      code: null,
      // `additional_info` only ever accompanies a LIMITED entity.
      severity: 'limited',
      subject,
    });
  }

  for (const key of Object.keys(grouped) as HealthIssueSubject[]) {
    grouped[key].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'blocked' ? -1 : 1
    );
  }

  return grouped;
}

// ------------------------------------------------------------
// Number registration
// ------------------------------------------------------------

/**
 * Whether a number is genuinely waiting on the operator, or just on Meta.
 *
 * ─── Why Meta's own remedy cannot be trusted here ─────────────────
 *
 * For a number that is still being activated, `health_status` returns
 * error 141000, "The phone number you are trying to send messages from
 * is not linked to your WhatsApp account", with the suggested fix
 * "Register and finish the OTP authentication process for your phone
 * number."
 *
 * That remedy is frequently wrong. Observed live on a number where
 * `code_verification_status` was already **VERIFIED** — the OTP had been
 * completed — while `status` was `PENDING` and `name_status` was
 * `PENDING_REVIEW`. This is the normal state after onboarding with a
 * virtual number, where Meta itself says the business and display name
 * are reviewed and it "can take up to five working days".
 *
 * So the operator was being sent to redo a step they had already
 * finished, to fix a situation that only Meta can clear. Reading the
 * three real status fields tells us which case we are in, and Meta's
 * generic remedy is suppressed when we can prove it does not apply.
 */
export type RegistrationState =
  /** Registered on the Cloud API; Meta has simply not flipped it live yet. */
  | 'in_review'
  /**
   * Connected, OTP done, but never registered on the Cloud API. THIS is
   * the state that stranded real accounts: `platform_type` stays
   * `NOT_APPLICABLE` and the number cannot send a single message. It is
   * also the only one the CRM can fix by itself.
   */
  | 'needs_registration'
  /** Meta never received a completed phone verification. */
  | 'needs_verification'
  | 'ready'
  | 'unknown';

export interface RegistrationSummary {
  state: RegistrationState;
  /** Short, factual heading. */
  title: string;
  /** One sentence on what is happening and who has to act. */
  detail: string;
  /**
   * Whether Meta's own `possible_solution` should be shown. False when we
   * can prove the suggested step is already complete.
   */
  trustMetaSolution: boolean;
  /**
   * True when the CRM itself can finish the job, i.e. the
   * "Complete registration" button should be offered.
   */
  canSelfRepair: boolean;
}

export function deriveRegistrationState(phone: {
  status?: string | null;
  code_verification_status?: string | null;
  name_status?: string | null;
  /**
   * `CLOUD_API` once the number is registered. `NOT_APPLICABLE` means it
   * never was — the distinction the first version of this function
   * lacked, and without which a number needing one API call was
   * reported as "needs no action from you".
   */
  platform_type?: string | null;
}): RegistrationSummary {
  const status = String(phone.status ?? '')
    .trim()
    .toUpperCase();
  const codeStatus = String(phone.code_verification_status ?? '')
    .trim()
    .toUpperCase();
  const platformType = String(phone.platform_type ?? '')
    .trim()
    .toUpperCase();

  const otpDone = codeStatus === 'VERIFIED';
  const onCloudApi = platformType === 'CLOUD_API';
  const notOnAnyPlatform = platformType === 'NOT_APPLICABLE';

  if (status === 'CONNECTED') {
    return {
      state: 'ready',
      title: 'This number is registered with Meta.',
      detail: 'Nothing further is required.',
      trustMetaSolution: true,
      canSelfRepair: false,
    };
  }

  // Checked before registration, because registering a number whose OTP
  // was never completed simply fails — offering the button there would
  // hand the operator an action that cannot work.
  if (codeStatus === 'NOT_VERIFIED' || codeStatus === 'EXPIRED') {
    return {
      state: 'needs_verification',
      title: 'This number needs to be verified with Meta.',
      detail:
        'Meta has not received a completed phone verification for this number, so it cannot send messages yet.',
      trustMetaSolution: true,
      canSelfRepair: false,
    };
  }

  // The state that stranded real accounts. Everything on the operator's
  // side is finished; the number was simply never registered on the
  // Cloud API, which is one API call this app can make itself.
  if (status === 'PENDING' && otpDone && notOnAnyPlatform) {
    return {
      state: 'needs_registration',
      title: 'This number needs to finish connecting to WhatsApp.',
      detail:
        'Your number is verified but was never registered on the WhatsApp Cloud API, so Meta will not deliver messages from it yet. This takes one step and we can do it for you.',
      // Meta's remedy here is "finish the OTP authentication process",
      // which is provably already done — code_verification_status says
      // VERIFIED. Showing it sends the operator to redo finished work.
      trustMetaSolution: false,
      canSelfRepair: true,
    };
  }

  // Registered, and Meta has not flipped it live yet. Genuinely a
  // waiting game, so no button and no OTP instruction.
  if (status === 'PENDING' && otpDone && onCloudApi) {
    return {
      state: 'in_review',
      title: 'Meta is still activating this number.',
      detail:
        'Your number is registered and under final review by Meta. This usually completes within five working days and needs no action from you.',
      trustMetaSolution: false,
      canSelfRepair: false,
    };
  }

  return {
    state: 'unknown',
    title: 'Meta has not finished setting up this number.',
    detail: 'Meta reports the number is not ready to send messages yet.',
    trustMetaSolution: true,
    canSelfRepair: false,
  };
}

// ------------------------------------------------------------
// Payment setup
// ------------------------------------------------------------

/**
 * How far along the payment method is, as far as Meta will tell us.
 *
 * ─── What can and cannot be known ─────────────────────────────────
 *
 * There is NO readable field for "a card exists". `primary_funding_id`
 * on the WABA is the closest thing and Meta gates it behind Business
 * Solution Provider status, which this app does not hold — it answers
 * code 10, "requires that the Business that owns this App is a Business
 * Solution Provider for WhatsApp".
 *
 * What IS knowable is whether Meta is complaining. A missing or invalid
 * payment method is not a silent condition: Meta raises error 131042,
 * "Business Eligibility Payment Issue", and blocks outgoing messages
 * entirely until it is resolved. So the absence of a payment complaint,
 * on an account Meta says can send, is solid evidence that there is
 * nothing for the customer to do.
 *
 * That is why `no_issue` is named for what was observed rather than
 * `added`. The distinction is not pedantry: telling somebody their
 * payment method is set up when we never checked would send them into a
 * broadcast that silently fails, which is the exact class of invented
 * fact this module was written to stop.
 *
 * `blocked` for a non-payment reason yields `unknown`, not `no_issue`.
 * An account that cannot send at all is one Meta may simply not have got
 * as far as billing on.
 */
export type PaymentSetupState = 'action_required' | 'no_issue' | 'unknown';

export function derivePaymentState(args: {
  readiness: SendingReadiness;
  paymentIssues: HealthIssue[];
}): PaymentSetupState {
  if (args.paymentIssues.length > 0) return 'action_required';
  if (args.readiness === 'available' || args.readiness === 'limited') {
    return 'no_issue';
  }
  return 'unknown';
}

/**
 * Meta's own steps for adding a payment method, in order.
 *
 * Step 2 is the one everybody misses. A card added but never set as
 * default leaves the account in exactly the same blocked state, with
 * Meta's error still naming the payment method — so people conclude the
 * card did not save and add it again.
 */
export const PAYMENT_SETUP_STEPS: string[] = [
  'Open Facebook Business Manager with the button below and add your card.',
  'Set it as the default payment method from the three-dot menu — a card that is not the default does not count.',
  'Complete your business billing info, including any tax details your country requires (a GST number in India, for example).',
];

/**
 * The billing hub for one WhatsApp Business Account.
 *
 * `asset_id` scopes it to the WABA. Without it Meta opens whichever
 * account it last showed, which for anyone managing several is the
 * wrong one — and a payment method added to the wrong account looks
 * identical to one that failed to save.
 */
export function billingHubUrl(wabaId?: string | null): string {
  const base = 'https://business.facebook.com/billing_hub/accounts/details';
  return wabaId ? `${base}/?asset_id=${encodeURIComponent(wabaId)}` : base;
}

/** Invoices and charges for one WABA. */
export function paymentActivityUrl(wabaId?: string | null): string {
  const base = 'https://business.facebook.com/billing_hub/payment_activity';
  return wabaId ? `${base}?asset_id=${encodeURIComponent(wabaId)}` : base;
}

// ------------------------------------------------------------
// Business verification
// ------------------------------------------------------------

export type VerificationState =
  'verified' | 'pending' | 'rejected' | 'not_started' | 'unknown';

/**
 * Interpret `WhatsAppBusinessAccount.business_verification_status`.
 *
 * Grouped rather than passed through because Meta uses several values
 * for the same practical situation — `pending`, `pending_need_more_info`
 * and `pending_submission` all mean "in progress, nothing to do but
 * wait" — and the checklist only needs to decide which badge to show.
 *
 * Anything unrecognised maps to `unknown`, NOT to `not_started`. A new
 * Meta value must never be reported to the customer as "you haven't done
 * this" when they may well have.
 */
export function deriveVerificationState(
  status: string | null | undefined
): VerificationState {
  const value = String(status ?? '')
    .trim()
    .toLowerCase();

  if (!value) return 'unknown';
  if (value === 'verified') return 'verified';
  if (value === 'not_verified') return 'not_started';
  if (value.startsWith('pending')) return 'pending';
  if (
    value === 'rejected' ||
    value === 'failed' ||
    value === 'revoked' ||
    value === 'expired'
  ) {
    return 'rejected';
  }
  return 'unknown';
}

// ------------------------------------------------------------
// Deep links to the place a problem gets fixed
// ------------------------------------------------------------
//
// Meta does NOT return a URL. `health_status` gives an
// `error_description` and a `possible_solution` string and nothing else,
// so telling a customer "your display name has not been approved" leaves
// them to go and find the right screen among Business Manager, Business
// Settings and WhatsApp Manager. This maps each kind of issue onto the
// page that actually resolves it.
//
// Matching is on Meta's wording, which is a real limitation worth stating:
// if Meta rephrases a message, or returns it in another language, a
// specific match can miss. That is why the fallback is WhatsApp Manager
// for the account rather than nothing — a slightly-too-general link is
// still far better than making someone hunt, and it can never be wrong
// in the way a mis-targeted link would be.

/** Where a health issue can be resolved. */
export interface HealthIssueLink {
  /** Button text. Names the destination so the click is predictable. */
  label: string;
  url: string;
}

const BUSINESS_SETTINGS = 'https://business.facebook.com/settings';
const WA_MANAGE = 'https://business.facebook.com/wa/manage';

/**
 * Scope a WhatsApp Manager URL to one WABA when we know its id.
 *
 * Without the parameter the customer lands on whichever account Meta
 * last showed them, which for anyone managing several is the wrong one.
 */
function waManage(path: string, wabaId?: string | null): string {
  const base = `${WA_MANAGE}/${path}`;
  return wabaId ? `${base}/?waba_id=${encodeURIComponent(wabaId)}` : base;
}

/**
 * Best destination for one health issue.
 *
 * @param text  Meta's `error_description` or `additional_info` note.
 * @param wabaId  Used to scope WhatsApp Manager links.
 */
export function resolveHealthIssueLink(
  text: string,
  wabaId?: string | null
): HealthIssueLink {
  const haystack = text.toLowerCase();

  // Display name review — the most common limitation on a new number,
  // and the one people most often cannot find. Lives in WhatsApp
  // Manager under Phone numbers, NOT in Business Settings.
  if (haystack.includes('display name')) {
    return {
      label: 'Open phone number settings',
      url: waManage('phone-numbers', wabaId),
    };
  }

  // Billing. Checked before the generic cases because a payment problem
  // is often described in terms of the thing it blocks.
  if (
    haystack.includes('payment') ||
    haystack.includes('billing') ||
    haystack.includes('credit line') ||
    haystack.includes('funding')
  ) {
    return {
      label: 'Open payment settings',
      url: wabaId
        ? `https://business.facebook.com/settings/payment-methods?waba_id=${encodeURIComponent(wabaId)}`
        : `${BUSINESS_SETTINGS}/payment-methods`,
    };
  }

  if (
    haystack.includes('business verification') ||
    haystack.includes('verify your business') ||
    haystack.includes('not verified') ||
    haystack.includes('unverified')
  ) {
    return {
      label: 'Open business verification',
      url: wabaId
        ? `https://business.facebook.com/settings/security?waba_id=${encodeURIComponent(wabaId)}`
        : `${BUSINESS_SETTINGS}/security`,
    };
  }

  if (haystack.includes('template')) {
    return {
      label: 'Open message templates',
      url: waManage('message-templates', wabaId),
    };
  }

  if (
    haystack.includes('phone number') ||
    haystack.includes('registration') ||
    haystack.includes('not registered')
  ) {
    return {
      label: 'Open phone number settings',
      url: waManage('phone-numbers', wabaId),
    };
  }

  if (haystack.includes('policy') || haystack.includes('violat')) {
    return {
      label: 'Open account quality',
      url: waManage('account-quality', wabaId),
    };
  }

  // Unrecognised. WhatsApp Manager is the right home for anything
  // messaging-related, so this stays useful even for wording we have
  // never seen.
  return { label: 'Open WhatsApp Manager', url: waManage('home', wabaId) };
}
