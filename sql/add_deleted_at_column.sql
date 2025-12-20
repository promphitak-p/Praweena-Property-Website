-- Migration: Add Soft Delete support
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Optional: Add index for performance on filtering deleted items
CREATE INDEX IF NOT EXISTS idx_properties_deleted_at ON public.properties(deleted_at);
