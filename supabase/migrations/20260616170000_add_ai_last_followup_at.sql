-- Track when the last follow-up was sent per conversation
-- Used by the cron to enforce the configured interval between each follow-up attempt
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS ai_last_followup_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN conversations.ai_last_followup_at IS
  'Timestamp do último follow-up automático enviado pela IA. Usado pelo cron para garantir o intervalo configurado entre tentativas.';
