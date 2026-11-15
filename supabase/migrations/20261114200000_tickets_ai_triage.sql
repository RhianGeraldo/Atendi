-- =====================================================================
-- Migration: Suporte à Triagem Inteligente e Resolução por IA de Tickets
-- =====================================================================

ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS ai_priority_reason TEXT,
ADD COLUMN IF NOT EXISTS ai_suggested_solution TEXT,
ADD COLUMN IF NOT EXISTS ai_auto_resolved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

-- Comentários descritivos
COMMENT ON COLUMN public.tickets.ai_priority_reason IS 'Justificativa técnica da IA para a prioridade atribuída';
COMMENT ON COLUMN public.tickets.ai_suggested_solution IS 'Pré-diagnóstico ou sugestão de resposta elaborada pela IA';
COMMENT ON COLUMN public.tickets.ai_auto_resolved IS 'Indica se o chamado foi concluído automaticamente por um agente de IA';
COMMENT ON COLUMN public.tickets.ai_analyzed_at IS 'Data/hora em que a triagem por IA foi executada';
