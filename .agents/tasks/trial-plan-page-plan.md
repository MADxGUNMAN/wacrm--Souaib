# Implementation Plan: lapsed trial lands on /upgrade-plan with the chosen plan pre-selected

Work directly in `d:\Junkies Coder\whatsapp-crm-nextjs` (no worktree). Read `AGENTS.md` first.

Hard constraints:
- Do NOT commit, push, deploy, or touch the production server or the Supabase data.
- Do NOT change pricing, trial length, `/api/billing/payment-requests`, `/api/billing/upi-qr`, the payment_requests approval flow, or `setSelectedPlan`.
- No migration. No new test files under `src/`. Throwaway checks go in `scratch/` (gitignored, confirmed via `git check-ignore`) and get deleted afterwards.
- Never `next build` into `.next`. Use `$env:NEXT_DIST_DIR=".next-verify"`.
- Do NOT write to `d:\Junkies Coder\Scrum.txt`. Ask the user "Do you want me to log this change? (yes/no)" at the end instead.
- Unrelated files are already modified in the tree (`docs/ai-connector/*`, `src/app/(auth)/signup/page.tsx`). Do not touch or revert them.

## Root cause (confirmed by reading; still verify at runtime, see item 4)

`src/proxy.ts`, inside `if (state.isBlocked) { ... if (isCrmPath) { ... } }` (around lines 340-375). For an OWNER whose account has both `accounts.selected_plan_id` and `accounts.selected_cycle_id` set, it redirects to `/upgrade-plan/payment?plan=<id>&cycle=<id>` ("Straight to the plan they already chose"). Both ids are written by `setSelectedPlan` (`src/lib/subscription/queries.ts`) when a signup clicks "Start with trial" or "Continue to payment" on `/upgrade-plan`. So every trial user who picked a plan skips the chooser at expiry, which is what the user saw on devcrm.junkiescoder.com. Owners with no stored selection already go to `/upgrade-plan`. Members go to `/subscription-required`, which is unchanged.

This branch keys on `state.isBlocked`, which `resolveSubscriptionState` (`src/lib/subscription/status.ts`) sets for a lapsed trial, a lapsed PAID subscription (past grace) and an operator-forced `expired`. So a paid subscription that expires also jumps straight to payment today. The fix below covers all three, because they share the one redirect and the user's desired flow (choose, then pay) applies equally to a renewal. Call this out in the final summary.

Every other path to the payment page was checked and is left alone:
- `src/app/upgrade-plan/page.tsx` → `/upgrade-plan/payment?status=pending` only when `subscription.pendingPayment` exists. That is a status view for an already-submitted payment, not a QR. Keep it.
- `src/app/upgrade-plan/page.tsx` `choosePlan('pay')` → payment page with the CURRENTLY selected card's ids. That is the "Continue to Payment" button we want.
- `src/components/settings/billing-settings.tsx` "Pay now" link. It lives under `/settings` (a `crmPaths` entry), which a blocked user cannot reach. Not an expiry path. Keep it.
- `src/app/subscription-required/page.tsx` sends a blocked owner to `/upgrade-plan`. Already correct.
- Email links (`src/lib/email/billing.ts`) point at `/upgrade-plan`. Already correct.
- Login: `/login` signed in → `/dashboard` → proxy gate. Fixed by the proxy change.
- No client-side shell redirects to `/upgrade-plan/payment` (grep of `src/app`, `src/components`, `src/hooks`).

## Design decisions

1. Proxy always sends a blocked owner to `/upgrade-plan` with an empty query. No `plan`/`cycle` hint param. The page can already get the stored choice from the server (decision 2), so a param would only add a client-controlled input that needs validating. Dropping it removes that surface.
2. The pre-selection source is server-side: `GET /api/billing/subscription` → `selectedPlan`. That comes from `getSelectedPlan(accountId)` in `src/lib/subscription/queries.ts`, which reads `accounts.selected_plan_id`/`selected_cycle_id` with the service role. It returns null unless both ids exist and the pair is still visible and priced. The page already consumes this through `useSubscription()` (`SubscriptionSnapshot.selectedPlan`). No new endpoint or query.
3. Pre-selection applies ONLY when `subscription.state.isBlocked === true`. Not-blocked visitors (first-visit signups, active or trialing owners renewing early, never-trialled) keep today's seeding: `is_default` → `is_recommended` → first offer. That honours "users who are not on an expired trial keep existing behaviour".
4. Fallback: if `selectedPlan` is null, if `selectedPlan.planId !== plan.id` (the page sells only the first visible plan), or if `selectedPlan.cycleId` is not among the rendered `offers`, use the existing default. Never invent a value.
5. The seed must wait for the subscription snapshot. Today the seed effect fires as soon as `offers` exist and locks in `cycleId`, because it returns early once `cycleId` is set. If `/api/billing/plans` resolves before `/api/billing/subscription`, the default (Yearly) would win and the stored choice would be ignored. The effect therefore waits until the snapshot has settled: `subscription !== null || subError !== null || !subLoading`. The last clause covers the 401 path, where data and error both stay null. The effect still seeds only once, so a user's manual click is never overwritten.
6. The pure decision goes in a helper, `pickInitialCycleId`, in `src/lib/subscription/plans.ts`. That file is already the shared, side-effect-free plan maths imported by `/upgrade-plan`. Putting the helper there lets the scratch harness exercise it directly.
7. Switching plans works without new code. "Continue to Payment" calls `/api/billing/select-plan` (ungated under `/api/billing`), which overwrites `selected_*` with the new choice, then pushes `/upgrade-plan/payment?plan=&cycle=` for the card actually selected. The payment page prices from those params through `/api/billing/upi-qr`. "Back to plans" then lands on `/upgrade-plan`, which pre-selects the newly saved choice.
8. No redirect loop. `/upgrade-plan` and `/upgrade-plan/payment` are in `protectedPaths` (login only) but not in `crmPaths`, so the gate never runs for them. Their APIs `/api/billing/*` are in `UNGATED_API_PREFIXES`. The page's own redirects go only to `/subscription-required` (member) and `?status=pending` (pending payment), and neither points back. Nothing in `crmPaths` or `UNGATED_API_PREFIXES` changes.

## Items

- [ ] 1. Add the pure pre-selection helper.
      In `src/lib/subscription/plans.ts`, export:
      ```ts
      export function pickInitialCycleId(
        offers: ReadonlyArray<{ cycle: Pick<BillingCycle, 'id' | 'is_default' | 'is_recommended'> }>,
        opts: {
          isBlocked: boolean;
          planId: string | null;
          selectedPlan: { planId: string; cycleId: string } | null;
        }
      ): string | null
      ```
      Return null for empty `offers`. If `isBlocked && selectedPlan && selectedPlan.planId === planId` and some offer has `cycle.id === selectedPlan.cycleId`, return that id. Otherwise return the existing preference chain, moved verbatim from the page: `find(is_default) ?? find(is_recommended) ?? offers[0]`, then `.cycle.id`. Add a short doc comment covering decisions 3 and 4. Reuse the `BillingCycle` type already imported in that file (add the import from `./types` if it is missing).
      Files: `src/lib/subscription/plans.ts`
      Verify: `npx tsc --noEmit 2>&1 | Select-String -Pattern "^src[/\\].*error TS"` prints nothing new. `npx vitest run src/lib/subscription` passes.

- [ ] 2. Pre-select on `/upgrade-plan` (depends on 1).
      In `src/app/upgrade-plan/page.tsx` `UpgradePlanPage`:
      - Change `const { data: subscription, refresh } = useSubscription();` to also take `loading: subLoading, error: subError`.
      - Replace the "Seed the selection from the admin's configured default" `useEffect` body with: return if `cycleId` is set or `offers.length === 0`. Return (wait) if `subscription === null && subError === null && subLoading`. Otherwise `const id = pickInitialCycleId(offers, { isBlocked: subscription?.state.isBlocked === true, planId: plan?.id ?? null, selectedPlan: subscription?.selectedPlan ?? null })` and `if (id) setCycleId(id)`. Dependencies: `[offers, cycleId, plan, subscription, subError, subLoading]`.
      - Import `pickInitialCycleId` from `@/lib/subscription/plans`, alongside the existing imports from that module.
      - Update the stale comment in the `choosePlan` doc block from "send them to the term they picked instead of a fresh price list" to "re-open this page with the term they picked pre-selected".
      Do not change `choosePlan`, `showTrialOffer`, `backButton`, the pending-payment redirect or any rendering.
      Files: `src/app/upgrade-plan/page.tsx`
      Verify: typecheck as in item 1. `npx eslint src/app/upgrade-plan/page.tsx src/lib/subscription/plans.ts` is clean.

- [ ] 3. Redirect blocked owners to the chooser, not the QR (independent of 1-2).
      In `src/proxy.ts`, inside `if (state.isBlocked) { ... if (isCrmPath) {`, replace the owner branch (the `planId`/`cycleId` lookup and the `/upgrade-plan/payment` assignment) with `url.pathname = '/upgrade-plan'`. Keep `url.search = ''`. Keep the member branch → `/subscription-required` unchanged. Rewrite the "Straight to the plan they already chose" comment to say: the owner lands on the chooser, the page pre-selects the stored choice server-side via `/api/billing/subscription` → `selectedPlan`, and payment comes only after "Continue to Payment". Keep the redirect-loop note (`/upgrade-plan*` is not in `crmPaths`). Remove `selected_plan_id, selected_cycle_id` from the `accounts` `.select(...)` string, since nothing in the proxy reads them anymore. Keep `plan_selection_required` and update the "selection columns ride along" comment to match.
      In `src/proxy.test.ts` (an existing file, so this is not a new test file), add `vi.mock("@/lib/subscription/gate-cache", () => ({ getCachedGateConfig: async () => ({ is_enabled: true, grace_days: 0 }) }))` before the dynamic import. Then add a `describe("proxy — lapsed subscription gate")` with two cases:
      (a) `mockRows = { profiles: { account_id: "acc-1", is_super_admin: false, account_role: "owner" }, accounts: { is_banned: false, subscription_status: "trialing", trial_ends_at: <yesterday ISO>, subscription_ends_at: null, plan_selection_required: false, selected_plan_id: "p1", selected_cycle_id: "c1" } }`. Request `/dashboard`, expect 307 and a location pathname of exactly `/upgrade-plan` with an empty search (it must not contain `/payment`).
      (b) The same rows with `account_role: "member"`. Expect `/subscription-required`.
      Files: `src/proxy.ts`, `src/proxy.test.ts`
      Verify: `npx vitest run src/proxy.test.ts`. The 4 old and 2 new cases pass, and case (a) fails if the item-3 change is stashed.

- [ ] 4. Runtime decision harness in `scratch/` (depends on 1 and 3). Run it, then delete it.
      Create `scratch/vitest.scratch.config.ts`, a copy of `vitest.config.ts` (same `resolve.tsconfigPaths` and `env`) but with `include: ["scratch/**/*.scratch.ts"]`. Create `scratch/trial-plan.scratch.ts`, which reuses the `@supabase/ssr` and gate-cache mocks from `src/proxy.test.ts`, imports the REAL `proxy`, `resolveSubscriptionState` and `pickInitialCycleId`, and uses offers `[{cycle:{id:"monthly",is_default:false,is_recommended:false}},{cycle:{id:"yearly",is_default:false,is_recommended:true}}]` with `planId "p1"`. Cases:
      1. Expired trial, stored monthly (`trial_ends_at` yesterday, `selected_cycle_id "monthly"`): `isBlocked` true; proxy `/dashboard` → `/upgrade-plan` with no query; `pickInitialCycleId` → `"monthly"`.
      2. Expired trial, stored yearly: proxy → `/upgrade-plan`; helper → `"yearly"`.
      3. Expired trial, no stored plan (`selectedPlan: null`, and separately a `planId` mismatch and an unknown cycle id): proxy → `/upgrade-plan`; helper → `"yearly"` (the recommended default).
      4. Active subscription (`subscription_status "active"`, `subscription_ends_at` +30 days, stored monthly): `isBlocked` false; proxy `/dashboard` → no `location` header (pass-through); helper → `"yearly"` (existing default, since pre-selection is off when not blocked).
      5. Lapsed PAID subscription (`subscription_status "active"`, `subscription_ends_at` yesterday, stored monthly): proxy → `/upgrade-plan`; helper → `"monthly"`.
      6. Loop guard: requests to `/upgrade-plan` and `/upgrade-plan/payment?plan=p1&cycle=c1` for the blocked owner from case 1 return no `location` header.
      Run: `npx vitest run --config scratch/vitest.scratch.config.ts`. All cases must pass. Record the output in the final summary, then delete both scratch files.
      Files: `scratch/vitest.scratch.config.ts`, `scratch/trial-plan.scratch.ts` (temporary)
      Verify: the command above passes. `git status --short scratch` shows nothing afterwards.

- [ ] 5. Full verification bar (AGENTS.md §2).
      ```powershell
      npx tsc --noEmit 2>&1 | Select-String -Pattern "^src[/\\].*error TS"
      npx vitest run
      npx eslint src/proxy.ts src/proxy.test.ts src/app/upgrade-plan/page.tsx src/lib/subscription/plans.ts
      npx prettier --write src/proxy.ts src/proxy.test.ts src/app/upgrade-plan/page.tsx src/lib/subscription/plans.ts
      $env:NEXT_DIST_DIR=".next-verify"; npm run build
      ```
      Expected: no `src/` type errors, the whole vitest suite green (about 1151 tests plus the 2 new ones), eslint clean, and the build succeeds into `.next-verify`. If Prettier reformats more than the touched lines of a file that was never Prettier-clean, say so in the summary. Do not blame the 3 known `no-explicit-any` errors in `whatsapp-setup.tsx` on this change.
      Files: none new
      Verify: all five commands succeed.

- [ ] 6. Browser verification and handoff.
      The user observed the bug in production, so code reading and the harness are not enough to call it fixed end to end. Do not change any account's dates to simulate expiry without the user's explicit OK: the Supabase project is shared, and `accounts` rows hold real customers. In the final message:
      - Report the harness results and state that the full lapsed-trial flow in a real browser (`/dashboard` → `/upgrade-plan` with the stored card ticked → "Continue to Payment" → QR for that card; switch card → QR for the new card; "Back to plans" → the newly chosen card ticked) is NOT yet verified.
      - Offer to run it against a disposable test account (set its `trial_ends_at` to the past) only if the user approves, and note it reaches production users only after the normal CI deploy.
      - Mention that a lapsed paid subscription now also lands on the chooser first (decision 1 scope).
      - Mention that the DB column comment on `accounts.selected_plan_id` (migration `20260824030000_plan_selection_first_onboarding.sql`) still says it "drives the trial-end redirect straight to this plan's payment screen". It is left as-is (no migration for a comment) unless the user wants it updated.
      - Ask: "Do you want me to log this change? (yes/no)".
