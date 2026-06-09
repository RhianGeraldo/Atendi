CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes of contacts in their company" ON public.contact_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_notes.contact_id
    AND c.company_id = (SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

CREATE POLICY "Users can insert notes for contacts in their company" ON public.contact_notes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_notes.contact_id
    AND c.company_id = (SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid())
  )
  AND auth.uid() = user_id
);
