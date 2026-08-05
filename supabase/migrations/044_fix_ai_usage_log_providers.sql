-- ============================================================
-- 044_fix_ai_usage_log_providers.sql
--
-- The ai_usage_log table's provider CHECK constraint was created in
-- 033 with only ('openai', 'anthropic'). When 039 added gemini,
-- cloudflare, nvidia, openrouter, groq, xai to ai_configs, the
-- usage log constraint was not updated — so every INSERT from a
-- non-openai/anthropic provider silently fails, and the AI Usage
-- dashboard shows "No usage".
--
-- This migration drops the stale constraint and re-adds it with
-- all supported providers.
-- ============================================================

-- Drop the old constraint (named after the table + column pattern).
ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

-- Re-add with all supported providers.
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN (
    'openai',
    'anthropic',
    'gemini',
    'nvidia',
    'cloudflare',
    'openrouter',
    'groq',
    'xai'
  ));
