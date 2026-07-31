-- Add connection_source column to whatsapp_config
ALTER TABLE public.whatsapp_config
ADD COLUMN IF NOT EXISTS connection_source TEXT DEFAULT 'manual';
