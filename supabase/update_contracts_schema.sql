-- Add missing columns to contracts table
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS contract_type text DEFAULT 'reservation',
ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS remain_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS transfer_date date,
ADD COLUMN IF NOT EXISTS note text,

-- Snapshot fields (to preserve data even if lead/property changes)
ADD COLUMN IF NOT EXISTS lead_name text,
ADD COLUMN IF NOT EXISTS lead_phone text,
ADD COLUMN IF NOT EXISTS lead_email text,
ADD COLUMN IF NOT EXISTS lead_address text,
ADD COLUMN IF NOT EXISTS lead_idcard text,

ADD COLUMN IF NOT EXISTS property_name text,
ADD COLUMN IF NOT EXISTS property_address text,
ADD COLUMN IF NOT EXISTS property_price numeric;
