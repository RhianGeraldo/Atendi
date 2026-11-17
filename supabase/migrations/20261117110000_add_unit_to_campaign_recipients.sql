-- =====================================================================
-- Migration: Adicionar coluna unit_id em campaign_recipients
-- Permite rastrear e associar cada destinatário da campanha à sua unidade correspondente
-- =====================================================================

ALTER TABLE public.campaign_recipients
    ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_unit
    ON public.campaign_recipients (unit_id);
