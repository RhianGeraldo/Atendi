-- ==============================================================================
-- Migration: Add contact_type and lifecycle status to contacts
-- Enables differentiating between 'lead' and 'client' across CRM, Chat, and Lists.
-- ==============================================================================

-- 1. Add contact_type and became_client_at columns
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'lead'
  CHECK (contact_type IN ('lead', 'client'));

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS became_client_at TIMESTAMPTZ;

-- 2. Index for high-performance filtering by company and type
CREATE INDEX IF NOT EXISTS idx_contacts_company_type ON public.contacts(company_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_became_client_at ON public.contacts(became_client_at) WHERE became_client_at IS NOT NULL;

-- 3. Backfill existing contacts based on CRM opportunities and Todoo outcomes
-- If a contact has any won opportunity, promote to client
UPDATE public.contacts c
SET 
  contact_type = 'client',
  became_client_at = COALESCE(c.became_client_at, c.created_at)
WHERE c.id IN (
  SELECT DISTINCT contact_id 
  FROM public.opportunities 
  WHERE status = 'won' AND contact_id IS NOT NULL
);

-- If a contact has any won todoo lead, promote to client
UPDATE public.contacts c
SET 
  contact_type = 'client',
  became_client_at = COALESCE(c.became_client_at, c.created_at)
WHERE c.id IN (
  SELECT DISTINCT contact_id 
  FROM public.todoo_leads 
  WHERE status = 'won' AND contact_id IS NOT NULL
)
AND c.contact_type != 'client';

-- 4. Trigger to automatically promote contact to 'client' when opportunity is marked as 'won'
CREATE OR REPLACE FUNCTION public.sync_contact_to_client_on_opportunity_won()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'won' AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      contact_type = 'client',
      became_client_at = COALESCE(became_client_at, now())
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_contact_opportunity_won ON public.opportunities;
CREATE TRIGGER trg_sync_contact_opportunity_won
AFTER INSERT OR UPDATE OF status, contact_id ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.sync_contact_to_client_on_opportunity_won();

-- 5. Trigger to automatically promote contact to 'client' when todoo_lead is marked as 'won'
CREATE OR REPLACE FUNCTION public.sync_contact_to_client_on_todoo_won()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'won' OR NEW.outcome_type = 'won') AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      contact_type = 'client',
      became_client_at = COALESCE(became_client_at, now())
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_contact_todoo_won ON public.todoo_leads;
CREATE TRIGGER trg_sync_contact_todoo_won
AFTER INSERT OR UPDATE OF status, outcome_type, contact_id ON public.todoo_leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_contact_to_client_on_todoo_won();
