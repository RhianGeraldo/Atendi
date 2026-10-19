-- Busca de contato por telefone (webhooks, Todoo, "+ Indicação") sem varrer a empresa toda.
-- CONCURRENTLY: não bloqueia gravações em contacts enquanto o índice é criado.
-- Não pode rodar dentro de transação: aplicar este arquivo sozinho.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_company_phone
  ON public.contacts (company_id, phone);
