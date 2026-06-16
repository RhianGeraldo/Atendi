-- Create ad_leads table
CREATE TABLE IF NOT EXISTS public.ad_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    ad_title TEXT,
    ad_body TEXT,
    source_url TEXT,
    thumbnail_url TEXT,
    source_id TEXT,
    ctwa_clid TEXT,
    conversion_source TEXT,
    conversion_data TEXT,
    ctwa_payload TEXT,
    source_app TEXT,
    media_type INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS ad_leads_company_id_idx ON public.ad_leads(company_id);
CREATE INDEX IF NOT EXISTS ad_leads_contact_id_idx ON public.ad_leads(contact_id);

-- Enable RLS
ALTER TABLE public.ad_leads ENABLE ROW LEVEL SECURITY;

-- Create Policy
CREATE POLICY "Enable read access for all authenticated users" ON public.ad_leads
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.ad_leads
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.ad_leads
    FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.ad_leads
    FOR DELETE
    USING (auth.role() = 'authenticated');
