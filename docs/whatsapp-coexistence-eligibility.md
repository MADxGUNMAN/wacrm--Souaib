# WhatsApp Coexistence: eligibility and triage

Reference for the question "why doesn't the Coexistence option appear for
this customer?". Written after that exact question cost a full
investigation, so the answer is recorded rather than re-derived.

Coexistence means one phone number runs on the **WhatsApp Business app**
and the **Cloud API** at the same time. It is selected in our connect
modal by the middle option, "a phone number that's currently active on
WhatsApp Business app", which maps to `option === 'existing'`.

---

## The short answer

**Coexistence is gated per phone number, not per Facebook user.** App
roles, Developer/Tester membership, and who is logging in have nothing to
do with it. If the option is missing, the number does not qualify — and
Meta does not say so. It simply omits "Connect a WhatsApp Business app"
from the flow.

That silence is the whole problem. It looks identical to a permissions
bug, which is why it gets misdiagnosed as one.

## Eligibility rules

All of these are Meta's, all are enforced per number, and **none can be
checked from our side.** We cannot see whether a number is on the
Business app, how long it has been active, or which provider already
holds it. Only the operator knows, which is why the connect modal asks
them before opening the popup.

| Requirement                         | Detail                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| On the WhatsApp **Business** app    | Not consumer WhatsApp. Not a number that started on the Cloud API.  |
| App version 2.24.17+                | Older builds cannot be paired.                                      |
| 7+ consecutive days of activity     | Real sending and receiving. Meta rejects numbers without a history. |
| Not already on any Cloud API        | Twilio, Wati, Interakt, AiSensy — must be disconnected there first. |
| Supported country                   | Rolling out region by region. Error 3441042 when not.               |
| Portfolio and Page must match       | Cannot already belong to a different portfolio or Facebook Page.    |
| WABA not held by another BSP        | Sharing conflicts are their own error family, below.                |
| WABA not on Marketing Messages Lite | MM Lite and Coexistence are mutually exclusive.                     |

Sources: Meta's Coexistence onboarding requirements and the BSP-published
eligibility lists ([Wati](https://support.wati.io/en/articles/11875544-troubleshooting-whatsapp-coexistence-signup-process-common-issues-and-how-to-resolve-them),
[ChatDaddy](https://help.chatdaddy.tech/article/whatsapp-business-app-quick-start-whatsapp-coexistence),
[timelines.ai](https://timelines.ai/whatsapp-coexistence-account-setup-guide)).
Content rephrased for compliance with licensing restrictions.

## Triage: the option is missing

Work down this list. It is ordered by how often each one turns out to be
the cause.

1. **Which modal option did they pick?** Only "currently active on
   WhatsApp Business app" sends the Coexistence variation. The first
   option deliberately does not, and lands on "Add your WhatsApp phone
   number" — which is the screen most often mistaken for the bug.
2. **Is the number actually on the WhatsApp Business app?** Numbers shown
   as `(Registered)` or `(Verified)` in Meta's picker are already on the
   Cloud API. A `+1 555-…` number is a Meta test number and can never do
   Coexistence.
3. **Has it been active 7+ days?** Newer than that is a hard no. Keep
   using it and retry later.
4. **Check the browser console.** Since the error mapper landed, the
   resolved Meta code, family and `fbtrace_id` are all logged there. If a
   code is present, go to the table below and stop guessing.
5. **Check the ES configuration.** App Dashboard → Facebook Login for
   Business → Configurations → the ID in
   `NEXT_PUBLIC_META_ES_CONFIG_ID`. It must be a **WhatsApp Embedded
   Signup** configuration. This is not readable via the Graph API — both
   `/{config-id}` and `/{app-id}/fb_login_configurations` are rejected —
   so the dashboard is the only way to confirm it.
6. **Only then consider app-level causes.** App Mode, permissions and
   webhook fields affect _everyone_ equally. If any other account can
   complete Coexistence, these are not your problem.

## Error codes

Mapped in [`src/lib/whatsapp/embedded-signup-errors.ts`](../src/lib/whatsapp/embedded-signup-errors.ts)
with operator-facing wording and a `retryable` flag. `retryable: false`
means stop — retrying the same inputs can never succeed.

| Code              | Family        | Meaning                                    |
| ----------------- | ------------- | ------------------------------------------ |
| 2655049           | asset sharing | WABA already connected to another provider |
| 2494028           | asset sharing | WABA already shared with another provider  |
| 2494119           | asset sharing | Provider already attached under this WABA  |
| 2655093           | asset sharing | Provider switching not supported           |
| 2593072           | asset sharing | WABA not found or inaccessible             |
| 2494120           | asset sharing | Meta refuses to share this WABA            |
| 2494029           | asset sharing | Sharing failed (transient)                 |
| 3441042           | eligibility   | Region not supported                       |
| 2655095 / 2655048 | eligibility   | Number has no WhatsApp Business presence   |
| 3441041           | eligibility   | Number belongs to a different portfolio    |
| 2655082           | eligibility   | Number linked to a different Facebook Page |
| 3441047           | eligibility   | WABA is on Marketing Messages Lite         |
| 2494091           | our side      | Our business verification is incomplete    |

Codes not listed are deliberately absent rather than guessed at. An
unrecognised code falls through to Meta's own message plus a pointer to
the console.

## Detecting Coexistence after connection

**Use `is_on_biz_app`. Do not use `platform_type`.**

`platform_type` returns `CLOUD_API` for a Coexistence number and
`CLOUD_API` for an ordinary Cloud API number, so it cannot tell them
apart. Verified against three live numbers on this app:

| Number           | `connection_mode` | `platform_type` | `is_on_biz_app` |
| ---------------- | ----------------- | --------------- | --------------- |
| +91 72020 72233  | coexistence       | CLOUD_API       | `true`          |
| +971 56 558 0904 | coexistence       | CLOUD_API       | `true`          |
| +91 74330 38455  | cloud_api         | CLOUD_API       | `false`         |

Reconciling on `platform_type` would have demoted every correct
Coexistence row to `cloud_api` — it would have caused the bug it was
meant to catch.

`is_on_biz_app` is **optional** in Meta's response, and absence must
never be read as `false`. See `reconcileConnectionMode` in
[`src/lib/whatsapp/connection-mode.ts`](../src/lib/whatsapp/connection-mode.ts).

### Precedence of the three signals

1. **A real `smb_message_echoes` webhook** — proof, not inference. The
   first echo promotes the row to `coexistence`.
2. **`is_on_biz_app` from Meta** — checked at connection time, overrides
   the inference below.
3. **`finish_event` → operator's modal choice** — an inference, used only
   until one of the above lands.

## What does not gate Coexistence

Recorded because each of these was suspected and cleared:

- **App roles.** The app has 3 Administrators and zero Developers or
  Testers, yet a non-role account completed the flow with its own
  business assets.
- **App Mode.** A Development-mode app rejects non-role users outright
  with "App Not Setup"; it does not render a working Embedded Signup
  flow. Permissions also report `live` with
  `whatsapp_advanced_access: ACTIVE`, which only functions on a Live app.
- **Webhook fields.** `smb_message_echoes`, `history` and
  `smb_app_state_sync` are all subscribed and active on the app.
