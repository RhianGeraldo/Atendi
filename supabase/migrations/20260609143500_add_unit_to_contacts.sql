ALTER TABLE public.contacts
ADD COLUMN unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_unit_id ON public.contacts(unit_id);
