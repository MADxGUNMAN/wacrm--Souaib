# Verification: lapsed trial lands on /upgrade-plan with stored plan pre-selected

Iteration 1 (no `trial-plan-review.json` existed). Nothing committed.

## Files changed

- `src/proxy.ts`: a blocked owner on a CRM path now goes to `/upgrade-plan` with an empty query (previously `/upgrade-plan/payment?plan=&cycle=` when both `selected_*` ids were set). `selected_plan_id, selected_cycle_id` dropped from the proxy's `accounts` select (no longer read there). Member branch → `/subscription-required` unchanged.
- `src/lib/subscription/plans.ts`: new pure `pickInitialCycleId(offers, { isBlocked, planId, selectedPlan })`. Stored cycle wins only when blocked, plan id matches the sold plan and the cycle is among the offers; otherwise the old chain `is_default → is_recommended → offers[0]`.
- `src/app/upgrade-plan/page.tsx`: seed effect uses `pickInitialCycleId` with server-side `subscription.selectedPlan` (from `/api/billing/subscription`), waits for the subscription snapshot to settle (`subscription !== null || subError !== null || !subLoading`), still seeds once so manual clicks are never overwritten. No URL param is read.
  - One addition beyond the plan: in `choosePlan('pay')`, `if (saved) void refresh();` before `router.push(paymentHref)`. Reason: `useSubscription` is a shared client store that only loads once, so after "Continue to Payment" → "Back to plans" (client-side Link) the snapshot would still hold the PREVIOUS `selectedPlan` and pre-select the old card. Not awaited, so payment navigation is not delayed. Pricing, `/api/billing/select-plan`, payment submission untouched.
- `src/proxy.test.ts` (existing file): mocks `@/lib/subscription/gate-cache`; adds `describe("proxy — lapsed subscription gate")` with owner → `/upgrade-plan` (empty search) and member → `/subscription-required`.

Redirect inventory checked (grep `upgrade-plan/payment`, `selected_*_id`, `isBlocked` across `src/`): the proxy branch was the only expiry redirect to the QR page. `subscription-required` page, trial banner, billing emails and contact/docs/legal back links already target `/upgrade-plan`. `?status=pending` redirect (existing pending payment) and Settings › Billing "Pay now" (unreachable when blocked; `/settings` is gated) left as-is. Login → `/dashboard` → proxy, so covered. No allowlist changed: `/upgrade-plan*` not in `crmPaths`, `/api/billing/*` ungated.

Scope note: the proxy branch keys on `state.isBlocked`, so a lapsed PAID subscription (and operator-forced expiry) now also lands on the chooser first with its stored plan pre-selected (harness case 5).

## Commands and results

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| Select-String -Pattern "^src[/\\].*error TS"` | no output (0 src errors) |
| `npx vitest run` | 158 files, **2110 passed**, 0 failed (suite has grown past the ~1151 in AGENTS.md) |
| `npx vitest run src/proxy.test.ts` | 6/6 passed (4 old + 2 new) |
| same, with `src/proxy.ts` stashed (old behaviour) | 1 failed: "sends a lapsed-trial owner to the plan chooser" — new test discriminates |
| `npx eslint src/proxy.ts src/proxy.test.ts src/app/upgrade-plan/page.tsx src/lib/subscription/plans.ts` | exit 0, no findings |
| `npx prettier --write <same 4 files>` | ran. **All 4 files were already NOT Prettier-clean at HEAD** (`prettier --check` on the stashed originals warned on all 4), so the diff is larger than the logic change: `proxy.ts` mostly reformatted (semicolon/quote style), `proxy.test.ts` partly. Logic diff before Prettier was +133/−29. |
| `$env:NEXT_DIST_DIR=".next-verify"; npm run build` | exit 0, `/upgrade-plan` and `/upgrade-plan/payment` built, Proxy compiled |

## Throwaway decision harness (deleted)

`scratch/trial-plan.scratch.ts` + `scratch/vitest.scratch.config.ts`, run with `npx vitest run --config scratch/vitest.scratch.config.ts`. Imported the REAL `proxy`, `resolveSubscriptionState` and `pickInitialCycleId`; Supabase client and gate cache mocked. Offers: monthly (plain), yearly (recommended); plan `p1`. 6/6 passed. Output:

```
case1: {"blocked":true,"redirect":"/upgrade-plan","pick":"monthly"}      expired trial, stored monthly
case2: {"redirect":"/upgrade-plan","pick":"yearly"}                       expired trial, stored yearly
case3: {"redirect":"/upgrade-plan","none":"yearly","mismatch":"yearly","unknown":"yearly"}  missing / wrong-plan / unknown-cycle stored plan → default
case4: {"blocked":false,"redirect":null,"pick":"yearly"}                  active subscription: no redirect, existing default seeding
case5: {"blocked":true,"redirect":"/upgrade-plan","pick":"monthly"}       lapsed PAID subscription
case6: {"chooser":null,"payment":null,"billingApi":null}                  loop guard: /upgrade-plan, /upgrade-plan/payment, /api/billing/subscription pass through for a blocked owner
```

Both files deleted afterwards; `git status --short scratch` is empty (only the pre-existing `scratch/apply-name-repair.mjs` remains, untouched).

## Not verified

- End-to-end in a real browser with a lapsed account (`/dashboard` → `/upgrade-plan` with stored card ticked → Continue → QR for that card; switch card → QR for new card; Back to plans → new card ticked). Needs a disposable account with `trial_ends_at` in the past; no account data was modified.
- Production only gets this after the normal CI deploy.
- DB column comment on `accounts.selected_plan_id` (migration `20260824030000_plan_selection_first_onboarding.sql`) still describes the old "straight to payment" behaviour; left as-is (no migration for a comment).
