-- Drop the existing constraint
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

-- Add the new constraint with all supported providers
ALTER TABLE ai_configs ADD CONSTRAINT ai_configs_provider_check 
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
