-- Mapa LID -> telefone do WhatsApp
--
-- O WhatsApp identifica alguns contatos (ex.: leads de anúncio) só pelo @lid.
-- O número real chega em eventos separados (PushName, eco de mensagem enviada,
-- mensagens com o par LID/número), às vezes ANTES de o contato existir.
-- Guardar o par aqui permite resolver o número em qualquer ordem de chegada,
-- em vez de criar um contato provisório com o LID no lugar do telefone.
--
-- Usado só pelo backend (service role); sem políticas para usuários.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.whatsapp_lid_map (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lid TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, lid)
);

ALTER TABLE public.whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

-- Pares já conhecidos: contatos com LID e telefone real
INSERT INTO public.whatsapp_lid_map (company_id, lid, phone, source)
SELECT DISTINCT ON (company_id, whatsapp_lid) company_id, whatsapp_lid, phone, 'backfill'
FROM public.contacts
WHERE whatsapp_lid IS NOT NULL
  AND phone LIKE '55%'
  AND phone <> whatsapp_lid
  AND merged_into_id IS NULL
ORDER BY company_id, whatsapp_lid, created_at DESC
ON CONFLICT (company_id, lid) DO NOTHING;
