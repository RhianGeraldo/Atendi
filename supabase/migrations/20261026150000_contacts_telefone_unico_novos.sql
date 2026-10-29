-- Dois webhooks simultâneos do mesmo lead (ex.: Keila, 2026-10-26) criavam dois
-- contatos com o mesmo telefone e, com eles, duas conversas. Este índice faz o
-- segundo insert falhar (23505) e o webhook reaproveita o contato do primeiro
-- (insertContactOrFindExisting).
-- Só vale para contatos criados a partir de 2026-10-26 19:10 UTC (3 pares de hoje, incluindo a Keila, ainda precisam de merge): as duplicatas antigas
-- ainda precisam ser mescladas e impediriam a criação do índice. Quando
-- acabarem, trocar por um índice sem o filtro de data.
-- CONCURRENTLY: não bloqueia gravações em contacts. Não roda dentro de
-- transação: aplicar este arquivo sozinho.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_contacts_company_phone_novos
  ON public.contacts (company_id, phone)
  WHERE merged_into_id IS NULL AND created_at >= '2026-10-26T19:10:00Z';
