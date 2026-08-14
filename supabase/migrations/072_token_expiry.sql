-- ============================================================
-- 072_token_expiry.sql
-- Track when a customer's WhatsApp business token expires.
-- ============================================================
--
-- WHY THIS EXISTS
-- ---------------
-- Embedded Signup hands back a customer-scoped business token whose
-- lifetime is decided by the Facebook Login for Business configuration
-- used to launch the flow. The configuration in use here is literally
-- named "WhatsApp embedded sign-up configuration with 60-day expiry
-- token", so every connection made through it dies ~60 days later.
--
-- `/oauth/access_token` already returns `expires_in` alongside the token,
-- and `exchangeCodeForBusinessToken()` already parses it — but the value
-- was then dropped on the floor and never persisted. The consequence is
-- the worst kind of failure: on day 61 every Meta call for that account
-- starts returning an auth error, inbound webhooks keep arriving and
-- silently fail to send replies, and nothing anywhere records *why*. The
-- operator sees "WhatsApp stopped working" with no expiry to point at.
--
-- Storing the expiry does not by itself renew anything. Meta publishes no
-- refresh grant for business tokens — renewal means the customer runs
-- Embedded Signup again. What this column buys is the ability to warn
-- BEFORE the deadline instead of diagnosing after it, which is the whole
-- difference between a scheduled reconnect and an outage.
--
-- NULLABLE ON PURPOSE
-- -------------------
-- Three cases legitimately have no expiry:
--   * rows created before this migration (unknown, not "expired")
--   * connections made with a non-expiring token
--   * the legacy manual-entry form, where the operator pastes a system
--     user token of their own
-- A NULL therefore means "no known deadline" and must never be rendered
-- as an expiry warning. A default of now() would have marked every
-- existing healthy connection as expiring immediately.

alter table public.whatsapp_config
  add column if not exists token_expires_at timestamptz;

comment on column public.whatsapp_config.token_expires_at is
  'When the stored access_token stops working, derived from the expires_in '
  'returned by Meta''s /oauth/access_token exchange. NULL means no known '
  'expiry (pre-existing row, non-expiring token, or manually pasted system '
  'user token) and must NOT be treated as expired. Meta has no refresh '
  'grant for business tokens: renewal requires re-running Embedded Signup.';

-- Partial index: the only query this column serves is "which connections
-- are approaching expiry", which never cares about the NULL rows. Keeping
-- them out means the index stays small as unaffected accounts accumulate.
create index if not exists idx_whatsapp_config_token_expires_at
  on public.whatsapp_config (token_expires_at)
  where token_expires_at is not null;
