-- Add internal legal fields for contracts
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS title_deed_no text, -- เลขที่โฉนด
ADD COLUMN IF NOT EXISTS parcel_number text, -- เลขที่ระวาง
ADD COLUMN IF NOT EXISTS house_number text; -- เลขที่บ้าน

-- Update RLS if needed (usually not needed for new columns if policy covers 'all')
