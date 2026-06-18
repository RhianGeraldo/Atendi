CREATE TYPE public.call_direction AS ENUM ('INCOMING', 'OUTGOING');
CREATE TYPE public.call_status_type AS ENUM ('RINGING', 'CALLING', 'NOT_ANSWERED', 'ACTIVE', 'ENDED', 'REJECTED', 'FAILED', 'DISCONNECTED');

CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wavoip_call_id TEXT NOT NULL UNIQUE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    direction public.call_direction NOT NULL,
    status public.call_status_type NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    recording_url TEXT,
    peer_number TEXT
);

-- RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call_logs in their company" ON public.call_logs
    FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Users can insert call_logs in their company" ON public.call_logs
    FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Users can update call_logs in their company" ON public.call_logs
    FOR UPDATE USING (company_id = public.current_company_id());
