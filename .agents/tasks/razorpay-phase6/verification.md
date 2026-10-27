# Phase 6 verification evidence (iteration 1, 22-10-2026)

All commands run from `d:\Junkies Coder\whatsapp-crm-nextjs` in PowerShell. SQL via Supabase MCP, project `dknolotutfiesuhbhmze`.

## Baseline (before any code or migration)

`execute_sql`, read-only, at `2026-10-22 10:44:15 UTC`. Saved to `baseline.json`.

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| pr_count       | 6                                                             |
| pr_md5         | 6553080635e375d5543525cb10367c6f                              |
| pr_pending     | 0                                                             |
| se_count       | 94                                                            |
| se_md5         | 299a80642dcbfc8a8bc369914dd6116f                              |
| se_max_created | 2026-10-22 09:54:32.124084+00                                 |
| se_pre_count   | 94 (rows with created_at <= se_max_created)                   |
| se_pre_md5     | 299a80642dcbfc8a8bc369914dd6116f                              |
| demo_md5       | c5fd666db77009366a38bd13be923fdd (matches the required value) |
| provider       | manual_upi                                                    |
| legal          | 5 pages, all published; no refund page                        |

## Code checks

| Command                                                                                                             | Result                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run src/app/api/billing src/lib/billing/razorpay` (mid-way)                                             | 24 files, 274 tests passed                                                                                                                                                                                              |
| `npx tsc --noEmit 2>&1 \| Select-String "error TS"`                                                                 | empty (0 errors), run before and after prettier                                                                                                                                                                         |
| `npx vitest run` (before prettier)                                                                                  | 206 files passed, 2,612 tests passed (was 204 / 2,576: +2 files, +36 tests)                                                                                                                                             |
| `npx vitest run` (after prettier, final)                                                                            | 206 files passed, 2,612 tests passed                                                                                                                                                                                    |
| `npx eslint <25 touched src files>`                                                                                 | exit 0, no errors, no warnings                                                                                                                                                                                          |
| `npx prettier --write <25 touched src files> docs/billing-runbook.md`                                               | done; it also reformatted pre-existing non-Prettier code in 3 touched files (see note)                                                                                                                                  |
| `$env:NEXT_DIST_DIR=".next-verify3"; npm run build`                                                                 | exit 0, "Compiled successfully in 31.5s"; route table lists `/api/billing/payment-requests`, `/api/billing/upi-qr`, `/api/billing/razorpay/checkout`, `/super-admin/payments`, `/upgrade-plan`, `/upgrade-plan/payment` |
| `git checkout -- tsconfig.json; Remove-Item -Recurse -Force .next-verify3`                                          | done; `Test-Path .next-verify3` False; `git status --short tsconfig.json` empty                                                                                                                                         |
| `npx prettier --write docs/razopay/phase-6-implementation-report.md docs/razopay/README.md docs/billing-runbook.md` | done                                                                                                                                                                                                                    |

Prettier note: whole-file reformatting of code that was never Prettier-clean happened in `src/app/api/super-admin/billing/payment-requests/route.ts` (trailing commas, line wrapping), `src/app/api/billing/upi-qr/route.ts` (import wrapping, trailing commas) and `src/components/super-admin/billing/payment-request-drawer.tsx`. No untouched file was changed (`git status` lists only Phase 6 files).

## Database

| Check                                                                                         | Result                                                                                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apply_migration` name `razorpay_billing_phase6`, body = file contents                        | success; registered as version `20261022105804` in `supabase_migrations.schema_migrations`                           |
| `select slug, is_published, length(content_markdown), md5(content_markdown) from legal_pages` | 6 rows; `refund-and-cancellation-policy` is_published **false**, length 2720, md5 `1b7ebd3af2b07fd5e8637dceb40bcd8c` |
| md5 of the markdown body in the migration file (`scratch/phase6-md5.js`, deleted)             | `1b7ebd3af2b07fd5e8637dceb40bcd8c`, 2720 chars, LF only: identical to the database                                   |
| md5(prosrc)                                                                                   | Not applicable: Phase 6 creates no SQL functions (plan D-G)                                                          |

## Live SQL check (demo account only, rolled back)

One `DO $$ ... $$` block: (a) provider is `manual_upi`; (b) refund page exists and is unpublished; (c) re-running the migration INSERT leaves the `legal_pages` count unchanged and does not overwrite the draft; (d) inserts one `pending` `payment_requests` row for `c1db92d7-7ae4-44ac-aae7-b62e152b0341` and confirms the lookup the checkout refusal uses (`account_id = demo AND status = 'pending'`, same as `getPendingPaymentRequest`) finds exactly 1.

Result: `ERROR: P0001: phase6 check ok, rolled back` (the expected success exception; every failure path raises a different `phase6 FAIL x` message).

## After (all work done)

`execute_sql`, read-only, at `2026-10-22 11:07:51 UTC`. Saved to `after.json`.

| Field          | Before                           | After                            | Same          |
| -------------- | -------------------------------- | -------------------------------- | ------------- |
| pr_count       | 6                                | 6                                | yes           |
| pr_md5         | 6553080635e375d5543525cb10367c6f | 6553080635e375d5543525cb10367c6f | yes           |
| pr_pending     | 0                                | 0                                | yes           |
| se_count       | 94                               | 94                               | yes           |
| se_md5         | 299a80642dcbfc8a8bc369914dd6116f | 299a80642dcbfc8a8bc369914dd6116f | yes           |
| se_pre_md5     | 299a80642dcbfc8a8bc369914dd6116f | 299a80642dcbfc8a8bc369914dd6116f | yes           |
| se_max_created | 2026-10-22 09:54:32.124084+00    | 2026-10-22 09:54:32.124084+00    | yes           |
| demo_md5       | c5fd666db77009366a38bd13be923fdd | c5fd666db77009366a38bd13be923fdd | yes           |
| provider       | manual_upi                       | manual_upi                       | yes           |
| legal          | 5 published                      | 5 published + refund draft false | additive only |

No subscription_events rows were added during the phase, so there are no additions to list.

## Not done, by design

- No Razorpay API calls (read or write). `sub_TqTtwUDRjijZys` untouched. Account `b69f6811-...` untouched.
- `subscription_settings.payment_provider` never written. `.env.local` not edited.
- No commit, no Scrum.txt entry.
- Browser check of the dev flip: not run by me (needs the user's devcrm session); listed as a user action.
