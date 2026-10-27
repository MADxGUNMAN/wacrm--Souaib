# Global currency option: progress

- Items 1, 3-10 of plan.md implemented and verified (see verification.md).
- Item 2: user approved the migration on 28-10-2026. Applied
  `20261028000000_global_currency_change.sql` as `global_currency_change`.
  Read-only checks: function SECURITY DEFINER, service_role only
  (anon/authenticated false); settings still INR / razorpay; smoke call
  `fn_change_global_currency('ZZZ','USD','[]')` returned
  `{"outcome":"stale","currency":"INR"}`.
