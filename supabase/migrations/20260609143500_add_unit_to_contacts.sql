ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_unit_id ON public.contacts(unit_id);
