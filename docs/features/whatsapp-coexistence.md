# Feature: WhatsApp Coexistence connection

**State: shipped. Phases 1–5 complete. One manual verification remains
(Phase 0) that only a Meta dashboard admin can do.**

Coexistence lets a customer keep using the WhatsApp Business app on their
phone while the same number also runs on the Cloud API through the CRM.
Selected in the connect modal by the middle option, "a phone number
that's currently active on WhatsApp Business app".

This file covers the **connection** path — getting a number onboarded.
The webhook side (echoes, history backfill, address-book sync) is a
separate concern implemented in `src/lib/whatsapp/coexistence.ts`.

Eligibility rules, the Meta error-code table and the triage order live in
[`../whatsapp-coexistence-eligibility.md`](../whatsapp-coexistence-eligibility.md).

---

## Why this work happened

Coexistence appeared to work only for Facebook accounts holding an App
Role, which looked like a permissions bug. It was not. Coexistence is
gated **per phone number** by Meta, and when a number does not qualify
Meta silently omits the option — no error, no explanation. Every failure
surfaced in the CRM as `Connection cancelled or incomplete`, which is
also what a user closing the popup produces. The two were
indistinguishable, so the real cause was invisible.

The fix is therefore mostly about **legibility**, plus one genuine
mapping bug.

## Where the code lives

| Path                                                 | What                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| `src/components/settings/whatsapp-connect-modal.tsx` | option cards + the eligibility gate            |
| `src/components/settings/whatsapp-setup.tsx`         | `launchFBLogin`, the `postMessage` listener    |
| `src/lib/whatsapp/embedded-signup-errors.ts`         | Meta ES error codes → operator-facing text     |
| `src/lib/whatsapp/connection-mode.ts`                | mode inference + reconciliation against Meta   |
| `src/app/api/whatsapp/embedded-signup/route.ts`      | token exchange, registration, mode persistence |
| `src/lib/whatsapp/coexistence.ts`                    | webhook payload parsing (separate concern)     |

## Phases

| Phase | Scope                                                     | State           |
| ----- | --------------------------------------------------------- | --------------- |
| 0     | Verify ES config + App Mode in the Meta dashboard         | **outstanding** |
| 1     | Fix the `featureType` mapping                             | done            |
| 2     | Surface Meta's real Embedded Signup errors                | done            |
| 3     | Pre-flight eligibility gate in the connect modal          | done            |
| 4     | Confirm the connection mode against Meta after connecting | done            |
| 5     | This documentation                                        | done            |

### Phase 1 — `featureType` mapping

`extras.featureType` was being sent for both `'existing'` and
`'migrate'`. Migrating a number off Twilio/Wati is the opposite of
Coexistence: that number is already on the Cloud API and never on the
Business app. It also disagreed with the `requested_feature_type` sent to
our own backend, which only ever counted `'existing'`.

Both now derive from one `wantsCoexistence` constant, and the feature-type
string comes from `COEXISTENCE_FEATURE_TYPE` rather than being repeated.

### Phase 2 — error surfacing

14 documented Meta codes mapped to plain wording plus a remediation line,
grouped into `asset_sharing` / `eligibility` / `our_side` because the
remedy differs completely per family. Each carries `retryable`, which
drives toast duration — 12s for a permanent rejection, 6s otherwise.

`extractEmbeddedSignupErrorCode` reads `error_code`, `code`, `error_id`,
`errorCode`, then falls back to scanning `error_message` for a known code.
That fallback is not defensive padding: Meta frequently sends no dedicated
code field and embeds the number in the prose only.

### Phase 3 — eligibility gate

Five required checkboxes on the `'existing'` option, gating the Continue
button. None of these conditions are checkable from our side, so asking is
the only honest design. It converts an invisible Meta rejection into a
five-second self-diagnosis before the popup opens.

### Phase 4 — confirming the mode

`verifyPhoneNumber` now also requests `platform_type` and
`is_on_biz_app`, and `reconcileConnectionMode` checks the inferred mode
against `is_on_biz_app` before the row is written.

**`platform_type` is the wrong field** and reconciling on it would have
demoted every correct Coexistence row — it reports `CLOUD_API` for both
kinds of number. The evidence table is in the eligibility doc. Absence of
`is_on_biz_app` leaves the inference untouched; it is never read as
`false`.

## Where we stopped

Phase 0 needs a Meta dashboard admin:

1. App Dashboard → Facebook Login for Business → Configurations → confirm
   the ID in `NEXT_PUBLIC_META_ES_CONFIG_ID` (`1582275723303946`) is a
   **WhatsApp Embedded Signup** configuration. Not readable via the Graph
   API, so the dashboard is the only source.
2. Confirm App Mode reads **Live**. Inferred from behaviour, not read
   directly.
3. For the account that originally reported this: confirm whether their
   number is on the WhatsApp Business app at all. The numbers Meta offered
   it were `(Registered)` and a `+1 555-…` test number, both of which are
   already on the Cloud API — in which case Coexistence was correctly
   unavailable and there was never a bug for that number.

## Not done, and deliberately so

- No automated eligibility pre-check. Meta exposes no endpoint that
  answers "can this number do Coexistence" before the flow runs.
- No retry of the history sync outside Meta's 24-hour window. It is
  one-shot with 3 lifetime attempts; burning them automatically is worse
  than asking.

## Tests

`src/lib/whatsapp/embedded-signup-errors.test.ts` (25) and
`src/lib/whatsapp/connection-mode.test.ts` (30 total, including the
reconciliation cases and a regression guard recording the three live
numbers `platform_type` was ruled out against).
