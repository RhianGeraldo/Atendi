-- Chave MCP com identidade própria: o assistente do chat interno.
--
-- acts_as_user_id: perfil que a chave representa. Com ele preenchido, o MCP age como essa
-- pessoa (remetente das mensagens do chat interno, papel e menus dela). Usado pelo usuário
-- "Assistente IA" criado nas Configurações > MCP para uma LLM conversar com a equipe.
-- Chaves antigas continuam sem identidade (NULL).
--
-- mcp_api_keys é tabela fria (só lida na autenticação do MCP); mesmo assim, timeouts curtos.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

ALTER TABLE public.mcp_api_keys
  ADD COLUMN IF NOT EXISTS acts_as_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_acts_as_user
  ON public.mcp_api_keys(acts_as_user_id)
  WHERE acts_as_user_id IS NOT NULL;
