-- Adiciona department_id à tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Índice para melhorar a performance de consultas filtradas por departamento
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_department_id
ON public.whatsapp_instances(department_id);

-- Função e trigger segura para associar o departamento da instância na nova conversa caso não informado
CREATE OR REPLACE FUNCTION public.set_conversation_department_from_instance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.department_id IS NULL AND NEW.whatsapp_instance_id IS NOT NULL THEN
    SELECT department_id INTO NEW.department_id
    FROM public.whatsapp_instances
    WHERE id = NEW.whatsapp_instance_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_conversation_department_from_instance ON public.conversations;
CREATE TRIGGER trg_set_conversation_department_from_instance
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_conversation_department_from_instance();
