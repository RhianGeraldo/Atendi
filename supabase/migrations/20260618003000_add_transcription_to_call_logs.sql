-- Adiciona campo de transcrição à tabela call_logs
-- A transcrição é gerada automaticamente via Whisper quando a gravação da Wavoip chega via webhook
-- e pode ser feita manualmente pelo agente na tela de Histórico de Chamadas

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS transcription TEXT DEFAULT NULL;

COMMENT ON COLUMN call_logs.transcription IS 'Transcrição automática da gravação da ligação via Whisper (OpenAI/Groq/OpenRouter)';
