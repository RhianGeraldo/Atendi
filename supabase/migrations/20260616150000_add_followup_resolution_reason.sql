-- Add a separate resolution reason for follow-up inactivity closures
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS followup_resolution_reason_id uuid REFERENCES resolution_reasons(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_agents.followup_resolution_reason_id IS 
  'Motivo de encerramento usado quando a conversa é encerrada por inatividade do cliente (follow-up exausto). Separado do resolution_reason_id que é usado no encerramento bem-sucedido.';
