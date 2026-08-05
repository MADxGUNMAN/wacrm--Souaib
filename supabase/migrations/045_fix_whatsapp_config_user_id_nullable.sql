-- Make user_id nullable on whatsapp_config
-- After migration 017 (account_sharing), the table uses account_id as the
-- primary ownership key. The original NOT NULL on user_id was never dropped,
-- causing Embedded Signup upserts (which only know account_id) to fail with:
--   null value in column "user_id" violates not-null constraint
ALTER TABLE public.whatsapp_config ALTER COLUMN user_id DROP NOT NULL;
