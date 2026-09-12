-- Migration: Suporte a OAuth 2.1 para Servidor MCP (Claude.ai, ChatGPT, etc.)
-- Permite Dynamic Client Registration (RFC 7591), PKCE (RFC 7636) e isolamento multi-unidade

CREATE TABLE IF NOT EXISTS public.mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_secret text,
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  client_type text DEFAULT 'confidential',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_codes (
  code text PRIMARY KEY,
  client_id text REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  unit_id uuid,
  code_challenge text,
  code_challenge_method text,
  redirect_uri text,
  scope text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  access_token text PRIMARY KEY,
  refresh_token text UNIQUE,
  client_id text REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  unit_id uuid,
  scope text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Inserir clientes padrão pré-configurados (Universal e Claude.ai)
INSERT INTO public.mcp_oauth_clients (client_id, client_secret, client_name, redirect_uris, client_type)
VALUES 
  (
    'atendi-mcp-client',
    'atendi-mcp-secret',
    'Assistente de IA / Conector Universal MCP',
    ARRAY['https://claude.ai/api/mcp/oauth/callback', 'https://chatgpt.com/api/mcp/oauth/callback', 'https://chat.openai.com/api/mcp/oauth/callback', 'http://localhost:3000/callback'],
    'confidential'
  ),
  (
    'atendi-claude-mcp',
    'atendi-secret-claude-mcp',
    'Claude.ai Web Connector',
    ARRAY['https://claude.ai/api/mcp/oauth/callback', 'https://claude.ai'],
    'confidential'
  )
ON CONFLICT (client_id) DO UPDATE SET
  redirect_uris = EXCLUDED.redirect_uris,
  client_name = EXCLUDED.client_name;

-- Habilitar RLS nas tabelas
ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
