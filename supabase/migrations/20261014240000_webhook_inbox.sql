-- Caixa de entrada de webhooks
--
-- Todo webhook recebido é gravado aqui ANTES de ser processado. Se o
-- processamento falhar (timeout, lock, erro de banco), o payload continua salvo
-- e é reprocessado depois com backoff, em vez de a mensagem se perder.
-- Tabela isolada: locks em contacts/conversations/messages não a afetam.

CREATE TABLE IF NOT EXISTS public.webhook_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,                 -- 'evogo', ...
  event TEXT,
  instance_name TEXT,
  external_id TEXT,                       -- ID da mensagem no provedor (diagnóstico)
  payload JSONB,                          -- apagado após processar com sucesso
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_due
  ON public.webhook_inbox (next_attempt_at)
  WHERE status IN ('pending', 'error', 'processing');
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_received ON public.webhook_inbox (received_at);

-- Só o backend (service role) acessa
ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_inbox FROM anon, authenticated;

-- Reserva atômica de itens vencidos para reprocessamento.
-- Itens presos em 'processing' há mais de 2 min (função morta no meio) voltam à fila.
CREATE OR REPLACE FUNCTION public.claim_webhook_inbox(_provider TEXT, _limit INTEGER DEFAULT 3)
RETURNS SETOF public.webhook_inbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.webhook_inbox w
  SET status = 'processing', locked_at = now(), attempts = w.attempts + 1
  WHERE w.id IN (
    SELECT id FROM public.webhook_inbox
    WHERE provider = _provider
      AND next_attempt_at <= now()
      AND (
        status IN ('pending', 'error')
        OR (status = 'processing' AND locked_at < now() - interval '2 minutes')
      )
    ORDER BY received_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING w.*;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_webhook_inbox(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_inbox(TEXT, INTEGER) TO service_role;
