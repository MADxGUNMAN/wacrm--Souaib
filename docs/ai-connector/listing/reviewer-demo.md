# Reviewer demo workspace — "Replai Demo"

Both directories need a login reviewers can use with no extra steps (07 §2.3):
email + password, **no MFA, no email code, no SMS**, working from outside our
network and not expiring during the review. This workspace exists only for
that and holds sample data only.

> The Supabase project is shared by dev and production, so everything here
> creates real production rows. The workspace is isolated (its own account,
> owner and data) and can be removed from Super admin afterwards.

## Status

Created 8 Oct 2026: login `demo@junkiescoder.com` (password in the password
manager — never in the repo), workspace `c1db92d7-7ae4-44ac-aae7-b62e152b0341`,
seeded and verified (sign-in works, no MFA, subscription active to 6 Apr
2027). The connector allowlist is now empty (every workspace may connect),
so step 4 below isn't needed. **Still to do: steps 5–7** (Meta test number,
templates, walk-through).

## What it contains

Created by `scripts/ai-connector/demo-seed.mjs`:

| Area        | Seeded                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login       | `DEMO_EMAIL`, email already confirmed, password generated (printed once), role owner                                                                                                       |
| Account     | "Replai Demo", INR, subscription **active for 180 days**, plan selection skipped, reminder emails off                                                                                      |
| AI policy   | Connectors on, members off, sending on, broadcasts on (**20 recipients/day**), automation changes on, 50 AI messages/day, no forced preview                                                |
| Contacts    | 200 sample contacts + one "Demo Team N" per team phone; names, emails `@example.com`, companies, 6 tags, custom fields City and Plan interest, ~30 notes                                   |
| Inbox       | 40 conversations (open / pending / closed, some unread, some assigned); the team conversations and 4 others have a customer message from the last few hours, so the 24-hour window is open |
| Deals       | Pipelines "Sales" (New lead → Negotiation) and "Wholesale"; 20 deals in INR (14 open, 3 won, 3 lost)                                                                                       |
| Broadcasts  | 3 past broadcasts ("Diwali offer", "New arrivals", "Payment reminder"), 25 recipients each with delivered/read/replied/failed results                                                      |
| Automations | "Welcome new customers" (on), "Tag price enquiries" (off), "VIP follow-up" (off) — all valid, so they can be switched                                                                      |
| Flow        | "Pricing enquiry" (draft, passes activation checks)                                                                                                                                        |
| Opt-outs    | 2 contacts opted out of marketing, so a broadcast preview shows skipped recipients                                                                                                         |

**Nobody real can be messaged.** Every sample number is `+1 212 555 01xx`
or `+1 415 555 01xx` — the 555-0100…0199 range is reserved for fiction —
and the workspace's WhatsApp must be a **Meta test number**, which only
delivers to the recipient numbers you register on it (our team phones).

## Build it (once)

1. **Reviewer mailbox.** Pick a mailbox the team controls and that isn't
   already a Replai user, e.g. `ai-review@junkiescoder.com`.
2. **Dry run** (reads only):

   ```powershell
   $env:DEMO_EMAIL='ai-review@junkiescoder.com'; $env:DEMO_TEAM_PHONES='916359463987'
   node scripts/ai-connector/demo-seed.mjs
   ```

3. **Create it:** same command with `--apply`. Copy the printed password
   into the password manager entry "Replai Demo reviewer" immediately; it
   isn't shown again (or set `DEMO_PASSWORD` yourself). Note the workspace
   id it prints.
4. **Allowlist it** (only while `AI_CONNECTOR_ALLOWED_ACCOUNTS` is set):
   add the id to it in the `PROD_ENV` secret, re-run the deploy.
5. **WhatsApp:** sign in as the reviewer, Settings → WhatsApp, connect a
   **Meta test number** (Meta for Developers → the app → WhatsApp → API
   Setup gives a test number; add the team phones as allowed recipients).
   Never connect a real business number here.
6. **Templates:** on that WABA, have ~6 templates approved (the test WABA
   includes `hello_world`; add e.g. an order update with variables, a
   payment reminder, a marketing offer, one with an image header), then
   Settings → Templates → **Sync from Meta**. If you used other names than
   `hello_world` for the past broadcasts, pass them in `DEMO_TEMPLATES`
   before step 3.
7. **Walk through as a reviewer** in a private window: sign in, no
   onboarding or plan screen, the inbox, contacts, pipelines and broadcasts
   load. Then connect Claude and ChatGPT with this login and run the test
   cases in [chatgpt-portal.md](chatgpt-portal.md) §3.

## Keep it working during review

- **Reply windows close after 24 hours.** The day before (and during) a
  review, run `node scripts/ai-connector/demo-seed.mjs --refresh` (same
  `DEMO_EMAIL` / `DEMO_TEAM_PHONES`); it adds a fresh customer message to the
  team and four sample conversations. Template sends don't need this.
- Subscription runs 180 days from creation; extend it in Super admin if a
  review runs longer.
- Don't change the password while a review is open; if you must, update
  both portals' credentials (ChatGPT needs a new draft).
- Reviewers' actions show up under Settings → AI Connectors → Recent
  activity and in the inbox ("via Claude" / "via ChatGPT").

## Remove it

Super admin → Accounts → "Replai Demo" → delete (or ban), remove its id from
`AI_CONNECTOR_ALLOWED_ACCOUNTS`, delete the reviewer login in Supabase Auth,
and disconnect the Meta test number.
