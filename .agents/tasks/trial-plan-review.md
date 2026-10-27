# Lapsed trial lands on the plan chooser with the stored plan pre-selected

When a trial (or paid term) lapses, the proxy used to send an owner who had a stored `selected_plan_id`/`selected_cycle_id` straight to `/upgrade-plan/payment?plan=&cycle=`. It now always sends a blocked owner to `/upgrade-plan` with an empty query. The page pre-selects the stored term, which it reads server-side from `/api/billing/subscription` → `selectedPlan`, via a new pure helper `pickInitialCycleId`. The seed effect now waits for the subscription snapshot so that a plans-first response can't lock in the default. No URL parameter is read anywhere. Pricing, `select-plan`, `upi-qr`, payment submission, approval and trial length are untouched.

Watch for: pre-selection is gated on the client's shared `useSubscription` snapshot, which loads once per session. An owner whose trial lapses while the CRM tab is open gets the default card instead of their stored one (likely, non-blocking). Unrelated `tsconfig.json` and signup/docs changes are in the working tree.

**Verdict**: APPROVED

## High-level view

The redirect fix is a single branch in `src/proxy.ts`. It was the only expiry redirect to the QR page. The subscription-required page, the trial banner, the billing emails and the login → `/dashboard` → proxy chain already target `/upgrade-plan` or go through the proxy. `/upgrade-plan*` is still outside `crmPaths` and `/api/billing/*` is still ungated, so no loop is possible. The member branch → `/subscription-required` is unchanged. The proxy no longer selects the `selected_*` columns.

Pre-selection is server-derived and fails closed to the existing default. The stored cycle wins only when the account is blocked, the stored plan id matches the plan being sold, and the cycle is among the rendered offers. Otherwise the chain is `is_default → is_recommended → first`, moved verbatim from the page. Users who are not blocked (active, trialing, first-visit signups) keep today's seeding exactly. The paid-term-lapse and forced-expiry cases share the `isBlocked` branch, so they get the same treatment. The verification note records this deliberately.

The payment page still prices from the `plan`/`cycle` that "Continue to Payment" builds from the card that is selected at that moment. Switching cards therefore changes the QR. A background `refresh()` after a successful save keeps "Back to plans" on the newly saved term.

<details>
<summary>Issues (2)</summary>

1. **Stale snapshot after a mid-session lapse** (likely, non-blocking): `useSubscription` loads once per page session. If the trial banner loaded it while the trial was active, a soft navigation that the proxy redirects to `/upgrade-plan` sees `isBlocked: false`, and the default card is picked instead of the stored one. The "Start with trial" CTA and "Back to dashboard" button are also stale there, but that part is pre-existing. Consider calling `refresh()` on mount of `/upgrade-plan` (and waiting on it before seeding) in a follow-up.
2. **Unrelated working-tree changes** (confirmed, non-blocking): `tsconfig.json` gained `.next-verify/types/**` includes, auto-written by the verification build and not mentioned in the verification note. The signup label change and the `docs/ai-connector/*` edits belong to other requests. Keep the tsconfig change out of this change's commit, or decide on it deliberately.

</details>

<details><summary>Details</summary>

### The single expiry redirect in `src/proxy.ts`

Inside `if (state.isBlocked) { if (isCrmPath) { ... } }`, the owner branch now just sets `url.pathname = '/upgrade-plan'`, with `url.search = ''` kept from before. A grep of `src/` for `upgrade-plan/payment` found two other producers. One is the page's own `?status=pending` redirect, a status view for an already-submitted payment that the plan keeps on purpose. The other is the Settings › Billing "Pay now" link, which sits under `/settings`, a CRM path a blocked user can't reach. `safeNextPath` doesn't allowlist any `/upgrade-plan` target, so a `next=` param can't route a lapsed user to the QR either. Most of the proxy diff is Prettier reformatting. Ignoring whitespace, the logic change is the branch above plus the narrowed `.select(...)`.

### Seed timing against the shared subscription store

The store starts as `{ data: null, loading: false, error: null }`, so on the very first render the new wait guard (`subscription === null && subError === null && subLoading`) is not holding. That is safe only because `offers` is empty until `/api/billing/plans` resolves, and by then the hook's mount effect has already set `loading: true`. The guard holds in practice, but it depends on that ordering rather than being explicit.

The bigger gap is the case where the store already holds data. The trial banner in the dashboard shell mounts `useSubscription`, and the hook never reloads once `store.data` exists. Consider an owner who has the CRM open across the trial-end instant and then navigates client-side. The proxy 307s the RSC request to `/upgrade-plan`, and the page renders against a snapshot that still says `isBlocked: false`. `pickInitialCycleId` therefore takes the default branch. That outcome is safe (no invented value, and the user can still pick their card), but it misses the requirement for this path. A fresh load (new tab, next-day login) gets the right card, which covers the common case and all of the coder's harness cases.

```
dashboard tab (snapshot: isBlocked=false) ──soft nav──▶ proxy 307 ──▶ /upgrade-plan
                                                                     seeds from STALE snapshot → default card
```

The `void refresh()` added on the pay path has a similar race in principle: if "Back to plans" is hit before the refresh lands, the old term is seeded. The window is milliseconds and the effect is cosmetic.

### Test coverage

The two new `proxy.test.ts` cases pin the owner → `/upgrade-plan` (empty search) and member → `/subscription-required` outcomes. The note confirms the owner case fails against the old proxy. The throwaway harness covered expired monthly, expired yearly, missing, mismatched and unknown stored plans, an active subscription, a lapsed paid subscription and the loop guard, against the real `proxy`/`resolveSubscriptionState`/`pickInitialCycleId`. Not tested: the page's seed effect itself (snapshot ordering, the stale-snapshot case above), and the end-to-end browser flow, which the note marks as unverified.

</details>

<details>
<summary>File map</summary>

- `src/proxy.ts`: blocked owner → `/upgrade-plan` (no query). `selected_*` dropped from the accounts select. Prettier reformat.
- `src/lib/subscription/plans.ts`: new `pickInitialCycleId`. Prettier trailing-comma reformat.
- `src/app/upgrade-plan/page.tsx`: seed effect uses the helper and waits for the snapshot. Background `refresh()` on the pay path. Comment update.
- `src/proxy.test.ts`: gate-cache mock plus a "lapsed subscription gate" describe with 2 cases. Prettier reformat.
- `tsconfig.json`: `.next-verify` type includes (build artifact, unrelated).
- `src/app/(auth)/signup/page.tsx`, `docs/ai-connector/*`: unrelated earlier requests.

Full diff: `git diff -w -- src/proxy.ts src/proxy.test.ts src/app/upgrade-plan/page.tsx src/lib/subscription/plans.ts`
</details>
