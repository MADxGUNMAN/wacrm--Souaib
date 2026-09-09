<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hard-won rules for this repo

Everything below cost real debugging time. Read it before changing build
config, storage, the webhook, or anything that deletes data.

---

## 1. Traps that make correct code look broken

These three produce symptoms that point nowhere near the cause. Check them
first when something "was working a minute ago".

**Never run `next build` while a dev server is live.** They share `.next`,
so a build overwrites the manifests the running server uses and its route
table goes stale — API handlers start returning 404 `Server action not
found.` while pages still render fine. This is the confirmed cause of an
"upload suddenly fails" incident on 20 Aug 2026: the dev server's own
manifest listed the route as compiled, yet every `/api/*` request 404'd.
Verification builds must go elsewhere:

```powershell
$env:NEXT_DIST_DIR=".next-verify"; npm run build
```

`distDir` in `next.config.ts` reads `NEXT_DIST_DIR` for exactly this.
Default is unchanged, so CI and Docker are unaffected.

**Never let `next.config.js` exist.** Next resolves
`CONFIG_FILES = ['next.config.js', 'next.config.mjs', 'next.config.ts']`
(see `node_modules/next/dist/shared/lib/constants.js`) and **the `.js`
wins**. A compiled `.js` is not a harmless duplicate — it silently
replaces `next.config.ts`, and every later edit to the `.ts` does nothing.
One was committed on 11 Aug 2026 and shadowed the real config for nine
days. Both `.js` and `.mjs` are now gitignored. If a config change seems
to have no effect, check which file the dev server actually parsed (the
dev log names it).

> Honest footnote, because the first diagnosis of the 20 Aug incident
> blamed this: the two files were functionally identical apart from one
> block that should not have existed (below), so the shadowing did **not**
> cause that outage. It is still a trap worth removing — but do not reach
> for it as an explanation before checking the build/dev-server clash above.

**A denied `Permissions-Policy` feature looks exactly like a user who
blocked a permission.** `next.config.ts` shipped
`geolocation=()`, which denies it for **every** origin including our own.
The browser then rejects `getCurrentPosition` with `PERMISSION_DENIED`
**and never shows a prompt**, so the error is identical to a genuinely
blocked site permission — and completely unfixable from the user's side.
No Chrome site setting and no Windows privacy toggle can override a header
the site itself sent. This burned a full round of "the button is broken" /
"check your browser settings" on 20 Aug 2026.

Features the app actually uses must be `(self)`, not `()`. Currently
`microphone=(self)` (voice notes) and `geolocation=(self)` (Send Location
Pin). `(self)` still denies embedded third-party iframes, so it is not the
same as deleting the entry. Verify the real header rather than reading the
config:

```powershell
$env:NEXT_DIST_DIR=".next-verify"; npm run build
$env:NEXT_DIST_DIR=".next-verify"; npx next start -p 3099
(Invoke-WebRequest http://localhost:3099/api/health -UseBasicParsing).Headers['Permissions-Policy']
```

**Do NOT set a custom `Cache-Control` on `/_next/static/*`.** Next warns
about it on boot ("can break Next.js development behavior") and the
warning is right. From `next/dist/server/lib/router-server.js`:

```js
if (!res.getHeader('cache-control') && type === 'nextStaticFolder') {
  if (opts.dev && !isNextFont(pathname)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }
}
```

Dev chunks are **already** `no-cache, must-revalidate`. And because of the
`!res.getHeader('cache-control')` guard, a custom header set earlier in the
pipeline suppresses that whole branch — including the `isNextFont`
exemption Next deliberately keeps cacheable in dev. A well-meant
`no-store` override therefore made things slightly worse while looking
like a fix. Removed on 20 Aug 2026.

Turbopack dev chunk names *are* hashed from the module group rather than
the contents, so a stale chunk making a newly-added export arrive
`undefined` is a real failure mode — but the browser cache is not the
lever. If you suspect it, hard-refresh (`Ctrl+Shift+R`) and check the
build/dev clash above; do not add cache headers.

**Read the dev server's own log first:**
`.next/dev/logs/next-development.log`. It holds the server-side error.
Inferring from the browser wasted an hour that one `Select-String` on this
file would have closed.

Other Next 16 specifics:
- `middleware.ts` is now **`src/proxy.ts`** and must export `proxy`.
  It enforces the ban + subscription gate for pages AND `/api/*`
  (allowlist in `UNGATED_API_PREFIXES`).
- Next 16 refuses to start a second `next dev` for the same directory.
- Tunnel hosts must be in `allowedDevOrigins` or dev requests 403.
- An unauthenticated multipart POST to a route handler can answer 404
  `Server action not found.` — do not read that as "the route is missing".

---

## 2. Verification bar

Run all of these before saying a task is done:

```powershell
npx tsc --noEmit 2>&1 | Select-String -Pattern "^src[/\\].*error TS"
npx vitest run                      # currently 1151 tests / 100 files
npx eslint <paths touched>
npx prettier --write <paths touched>
$env:NEXT_DIST_DIR=".next-verify"; npm run build
```

- Filter typecheck to `src/` — `.next/dev/types` errors are dev-server race noise.
- **Known pre-existing, not your regression:** 3 `no-explicit-any` errors in
  `src/components/settings/whatsapp-setup.tsx` (postMessage handler).
  Confirm by stashing your change before blaming yourself.
- Prettier reformats whole files that were never Prettier-clean. Say so in
  the summary, or the diff looks enormous next to a small change.
- **Do not add test files unless asked.** Verify pure logic with a
  throwaway script in `/scratch` (gitignored) and delete it afterwards.
  Do that for anything with edge cases — pagination windows, validators,
  IAM/storage reachability.
- **Anything cron-driven is not live until `deploy/cron-ping.sh` is
  re-copied to `/opt/wacrm/cron-ping.sh`** (crontab runs it `*/5`). It
  loops a hardcoded endpoint list, so adding `/api/<x>/cron` in the repo
  changes nothing in production until that file is re-`scp`'d. Shipping the
  route and calling it done means the feature never fires.
- Log every task in `d:\Junkies Coder\Scrum.txt`, timestamped with
  `Get-Date -Format "dd-MM-yyyy hh:mm tt"`.

---

## 3. Storage is AWS S3, not Supabase Storage

Bucket `replai-jc` (`us-east-1`), public-read via bucket policy so Meta
can fetch media. `src/lib/storage/s3-client.ts` + `POST /api/storage/presign`
+ `DELETE /api/storage/delete`; clients call
`uploadAccountMedia(folder, file, { onProgress, customPath })`.

**Uploads go browser → S3 directly, via a presigned PUT.** There is no
proxy upload route any more (`/api/storage/upload` was deleted 20 Aug 2026).
The server only mints a URL; the bytes never touch it. Consequences worth
knowing before changing anything here:

- The signature pins **key, content type AND content length**, so a PUT
  that sends a different type or a different number of bytes is rejected
  with 403. `signableHeaders: new Set(['host','content-type','content-length'])`
  in `createPresignedUploadUrl` is **load-bearing** — without it the SDK
  leaves `content-type` out of the signature entirely. Measured: a PUT
  sending `image/png` against a URL signed for `application/octet-stream`
  returned **200**. On a public-read bucket that is stored XSS, because S3
  serves back whatever type was stored.
- `folder` is checked against `ALLOWED_UPLOAD_FOLDERS` in
  `src/lib/storage/upload-policy.ts`. The old route pasted any client
  string into the key, so callers could invent prefixes that the bucket's
  lifecycle rules do not cover. A new prefix means adding it there.
- `customPath` (avatars) goes through `isSafeCustomPath` — traversal is
  **refused, not sanitised**, so an attempt is visible rather than quietly
  rewritten.
- Bucket CORS already allows `PUT` from `*` with `ETag` exposed, so no
  bucket change is needed. (`AllowedOrigins: ["*"]` is broad but not a
  hole: writes still require a signature.)
- `next/dist` note: `fetch` cannot report upload progress, which is why
  `putToPresignedUrl` uses `XMLHttpRequest`. Keep it.

Prefixes: `chat-media`, `flow-media`, `avatars`, `public-assets`,
`landing-assets`, `template-review-media`, `template-send-media`.

- **The `account-<id>` path segment is inserted server-side from the
  session** for folders in `ACCOUNT_SCOPED_FOLDERS`. Never accept a tenant
  id from the browser — that is a directory-traversal invitation.
- Template media is split in two on purpose: `template-review-media` is
  the sample Meta downloads at approval (disposable once approved),
  `template-send-media` is delivered to customers and referenced by chat
  history forever. The split is what makes an S3 lifecycle rule safe.
- Removing media in the UI does **not** delete from S3 — a click cannot
  know what still references it.
- Upload UI is `src/components/media/media-upload-field.tsx`; limits live in
  `src/lib/storage/media-folders.ts`. Validate before upload, or a rejected
  file leaves an orphan and errors arrive late.
- **nginx caps the request body, and dev has no nginx.** Its default
  `client_max_body_size` is **1 MB**, so on the server every upload over
  ~1 MB died as a 413 before reaching Next.js while the app advertised
  5 MB images / 16 MB video / 100 MB PDFs. It worked locally for the only
  reason that matters: `next dev` has no proxy in front of it. Fixed
  20 Aug 2026 by `deploy/nginx-upload-size.conf` →
  `/etc/nginx/conf.d/upload-size.conf` (25M).
  Media uploads no longer pass through nginx at all now that they are
  presigned, but **that file still matters** for the two routes that do
  stream a body through it — `/api/super-admin/upload` and
  `/api/super-admin/cms/images`, both of which still buffer the file in
  memory. Deleting it puts those back at the 1 MB default.
- **Meta's sticker limits are two limits, not one:** 100 KB static,
  500 KB animated, and nothing outside the file tells you which applies —
  both are `image/webp`. `src/lib/storage/webp.ts` reads bit `0x02` of the
  VP8X flags byte to decide. Do not switch that to searching the bytes for
  `ANMF`/`ANIM`: those four characters occur by chance inside compressed
  image data, which misclassifies a static sticker as animated and lets a
  400 KB file through to a Meta rejection.

---

## 4. Data model landmines

Supabase project `dknolotutfiesuhbhmze`. Migrations in
`supabase/migrations/`, highest is **080**.

- Postgres has no `ALTER CHECK`: `DROP CONSTRAINT IF EXISTS` then
  `ADD CONSTRAINT` (pattern in migrations 010, 069, 075).
- `accounts.owner_user_id` is **ON DELETE RESTRICT** — delete the
  `accounts` row (cascades tenant data) *before* the `auth.users` row.
- Deleting a user **cascades** `contacts`, `tags`, `custom_fields`,
  `flows`, `automations`, `contact_notes` via their `user_id`. Before
  deleting anyone, check whether they authored rows inside an account you
  are keeping, or those rows go with them.
- `profiles`: display name is **`full_name`** (not `name`). Roles are
  effectively `owner` | `member`, but the enum still carries legacy
  `admin`/`agent`/`viewer` — always test `= 'owner'`, never `= 'member'`.
- `profiles_select` RLS is `auth.uid() = user_id OR is_account_member(...)`,
  so an unfiltered `profiles` select already returns the whole team.
- **`junkiescoder@gmail.com` is the only super admin. Never delete it** —
  the super-admin panel becomes unreachable.
- **`profiles` is keyed by `user_id`, NOT by `id`.** `profiles.id` is its own
  PK and never equals the auth uid (verified: 0 of 6 rows match). So
  `.from('profiles').eq('id', user.id)` silently resolves to nothing and the
  route answers "Account not found" for every user. `/api/contacts/from-card`
  shipped with exactly that and could never have worked; its test passed
  anyway because the mock made `.eq('id', …)` and `.eq('user_id', …)`
  indistinguishable. When mocking a query chain, assert the COLUMN, or the
  test proves only that the code runs.
- **A missing permission key means ALLOW.** `canAccessSettingsSection` in
  `src/lib/auth/roles.ts` ends `return true`, so every member created
  before a new settings section existed has no key for it and inherits
  access. A new owner-only section must be listed in
  `OWNER_ONLY_SETTINGS_SECTIONS`; a `defaultVal: false` in the UI does not
  cover existing rows. Enforce writes in the API **and** RLS so a
  forgotten `if` cannot become a privilege hole.
- **Two message counters exist on purpose.**
  `src/lib/whatsapp/usage.ts` excludes `business_app` (Meta bills it as
  free) and answers "what will Meta charge". `fn_account_outbound_message_count`
  (079, used by usage alerts) includes it and answers "how much did we
  send". Do not "fix" one to match the other. Note `messages` has **no
  `account_id`** — any per-account count must join `conversations`, and
  must be a SQL `COUNT(*)`; the account-info habit of pulling rows with
  `.limit(20000)` silently under-reports a monthly window.
- Period maths for usage alerts lives in `src/lib/alerts/usage-alerts.ts`
  and is **UTC calendar** periods (month = the 1st, week = ISO Monday) so
  Postgres and the browser agree on one reset instant. Dedupe is a
  claim-insert against `UNIQUE(alert_id, period_key, threshold)`, never
  read-then-decide — two overlapping cron ticks both read "not fired yet"
  (same trap as `record_webhook_failure`).
- `messages.sender_id` is set only for CRM sends (075); label rules in
  `src/lib/messages/author-label.ts`. `sender_type` is
  `customer|agent|bot|business_app`; `bot` + `ai_generated` distinguishes
  AI from a deterministic automation.
- **Meta redelivers status webhooks and does not order them.** Never write
  `messages.status` or the `sent_at`/`delivered_at`/`read_at` columns with a
  plain `.update()`. Go through `fn_apply_message_status` (migration 080),
  which applies a forward-only status and `COALESCE`s each timestamp in ONE
  statement. Before it existed, a replayed `delivered` overwrote the real
  `delivered_at` and a replayed `sent` arriving after `read` dragged the
  status back to one tick — both silently wrong, and both displayed as fact
  by the Message Info panel. A read-then-write in the route does not fix
  this: two concurrent deliveries both read "not set yet".
  `messages.message_id` is not unique, so any fix has to be set-based.
- Adding an inbound message type means moving the `content_type` CHECK, the
  webhook's allowed set and the `ContentType` union **together** — now
  centralised in `src/lib/whatsapp/content-types.ts`. Skipping one silently
  coerces to `'text'` (that is why stickers became images).
- `whatsapp_config.display_phone_number` (078) is the real number.
  **Never render `phone_number_id` as a phone number** — it is an asset id,
  and `+<id>` looks convincingly like a number. Reported twice as a bug.
- Super-admin JSON comes from `fn_account_deep_dive`. Select explicit
  columns; `row_to_json(wc.*)` once shipped `access_token` to the browser.

---

## 5. Meta / WhatsApp Cloud API facts

Verified against the live docs — not from memory:

- Template media headers need a **Resumable Upload handle**, not a URL
  (`ensureMediaHeaderHandle`). A plain link is rejected at creation.
- Typing indicator: `POST /{phone_number_id}/messages` with
  `{ status: "read", message_id, typing_indicator: { type: "text" } }`.
  Its doc page is separate from mark-as-read, which does not mention it.
- Mark-as-read is the same endpoint without `typing_indicator`. The CRM
  **does** send it now (`markMessageRead` in `src/lib/whatsapp/meta-api.ts`,
  fired by `POST /api/whatsapp/conversations/[id]/read` when a thread with
  unread messages is opened), so customers do get blue ticks. Both calls
  swallow Meta error 131009 (message older than 30 days) rather than
  throwing — an expired receipt must never block opening a conversation.
- Geolocation also needs `geolocation=(self)` in the `Permissions-Policy`
  header — see the trap in §1 before concluding a user blocked it.
- **Browser geolocation is not a usable primary input for sending a pin.**
  The agent is at a desk and the pin is almost never where they are sitting,
  and `enableHighAccuracy: true` on a desktop routinely fails with
  POSITION_UNAVAILABLE because Chrome falls back to a network lookup. The
  Send Pin tab therefore leads with "paste a Google Maps link"
  (`src/lib/geo/parse-location.ts`, no API key, no map SDK) and keeps GPS as
  a secondary button that retries once at coarse accuracy and names the
  actual failure code. Short `maps.app.goo.gl` links have to be expanded
  server-side (`/api/geo/expand-link`) because CORS hides the redirect from
  the browser — that route is host-allowlisted on both the input and the
  final URL, since fetching a caller-supplied URL is otherwise an SSRF
  primitive straight to `169.254.169.254`.
- **Impossible for any Business API:** delete-for-everyone, live location,
  polls, events, view-once, disappearing messages. Forward has no API — it
  can only be a re-send, with no "Forwarded" label on the recipient's phone.
- `<input type="email">` accepts dotless domains (`a@b`) by design. Use
  `src/lib/validation/email.ts` on both client and server.
- **The UI is English only, and that is deliberate.** `src/i18n/request.ts`
  used to pick the dictionary from `NEXT_PUBLIC_APP_LOCALE`. `NEXT_PUBLIC_*`
  is inlined by the bundler, so the locale was baked into the image, only
  the English chunk was ever emitted, and the `catch` fallback was
  unreachable — it looked like i18n but could never switch language.
  `messages/ko.json` and the env var are gone (20 Aug 2026). To add a real
  second language, use a `[locale]` segment or a cookie resolved per
  REQUEST; do not reintroduce the env var. Note the `'ko'` entries in the
  template wizard are **Meta template language codes**, unrelated to this.
- Meta returns `display_phone_number` in two shapes: `918588096070` from
  webhook metadata, `+91 72020 72233` from the phone-number node.

Plan for WhatsApp-Web parity work: `docs/inbox-whatsapp-parity-plan.md`.

---

## 6. Working style that has paid off here

- **Diagnose with evidence, not inference.** A throwaway probe (IAM
  write/read/public-read across prefixes) settled "is it S3?" in one run,
  after two wrong guesses.
- **Never substitute a plausible-looking value for a missing one.** Every
  bug reported twice in this repo was that: `phone_number_id` shown as a
  phone number, an id with a `+` in front, a badge guessing at an author.
  Say "not synced yet" instead.
- **Surface the real error.** "Upload failed" and a bare red cross both
  cost hours. Persist Meta's own wording; show status codes.
- Confirm before destructive or shared-system actions, and report the blast
  radius first (row counts, what cascades). Hold back anything holding
  records that cannot be recreated — approved payments, chat history.

---

## 7. Production server

`ssh -i "<path>/wp_crm.pem" ubuntu@54.237.169.69` — Ubuntu, ~900 MB RAM,
11 GB disk. Single Docker container `wacrm` from
`ghcr.io/junkiescoder/wacrm:latest`, deployed by the master CI workflow.
nginx terminates TLS on 80/443 and proxies to `127.0.0.1:3000`; certbot
renews `wacrm.junkiescoder.com` on a timer.

Health sweep that has been worth running:

```bash
cd /opt/wacrm && docker compose ps && curl -s localhost:3000/api/health
docker inspect wacrm --format 'restarts={{.RestartCount}}'
docker stats wacrm --no-stream          # container sits around 100 MB
tail -n 20 /opt/wacrm/cron.log          # want http=200 on every line
free -h; df -h /; systemctl --failed
sudo dmesg -T | grep -i oom-kill        # 900 MB box, worth checking
```

- Port 3000 is published on `0.0.0.0` but the AWS security group blocks it
  from outside (verified: external `:3000` times out, `:443` serves). It is
  reachable only via nginx. Binding to `127.0.0.1:3000` would be better
  defence in depth, not an open hole today.
- **Config files that live on the server, not in the image:**
  `/opt/wacrm/.env`, `/opt/wacrm/cron-ping.sh`, `/etc/nginx/conf.d/*.conf`,
  `/etc/nginx/sites-available/wacrm.junkiescoder.com.conf`,
  `/etc/apt/apt.conf.d/52unattended-upgrades-reboot`. CI does **not**
  touch any of them. Repo copies are in `deploy/`; changing one there
  changes nothing in production until it is copied up.
- **Never `scp` a shell script straight from a Windows working tree.**
  `core.autocrlf=true` means the working copy is CRLF even though the
  committed blob is LF, and `#!/bin/bash\r` fails as
  `bad interpreter: /bin/bash^M`. `.gitattributes` now pins `*.sh`,
  `*.conf`, `*.sql` and the Dockerfile to `eol=lf`; belt and braces is
  `tr -d '\r' < /tmp/new > /dest` on the server.
- Always `sudo nginx -t` before `sudo systemctl reload nginx`. Reload is
  graceful; a bad config that reaches a restart is not.
- **Reboots are automatic now — do not reboot by hand during the day.**
  `unattended-upgrades` was already installing security patches but shipped
  with its reboot option commented out, so the box ran kernel
  `7.0.0-1006-aws` for 2.5 weeks with `1010` and `1011` installed on disk
  doing nothing. A kernel cannot be swapped while running, so that reads as
  *patched* to a package audit while the running system is not.
  `deploy/unattended-upgrades-reboot.conf` →
  `/etc/apt/apt.conf.d/52unattended-upgrades-reboot` fixes it: reboot at
  **20:00 UTC**, and only on nights when one is required.
  - 20:00 UTC is **01:30 IST** — picked against the OPERATOR's clock. The
    u-u default of 02:00 UTC is 07:30 IST, i.e. the start of their day.
  - `Automatic-Reboot-WithUsers "true"` matters: without it one forgotten
    SSH session blocks the reboot forever and restores the original problem
    silently.
  - Numbered 52 so it overrides distro-managed `50unattended-upgrades`
    without editing a file that a package upgrade may rewrite.
  - Verify with `sudo apt-config dump | grep -i automatic-reboot`, not by
    reading the file.
  - To force one sooner: `sudo shutdown -r 20:00 "reason"`, cancel with
    `sudo shutdown -c`, inspect with
    `cat /run/systemd/shutdown/scheduled`.
  - Safe unattended because Docker is `enabled` at boot, the container is
    `unless-stopped` and nginx is `enabled` — all three verified. Downtime
    is 1-2 minutes, Meta retries webhook deliveries that fail, and a missed
    5-minute cron tick is already tolerated.
