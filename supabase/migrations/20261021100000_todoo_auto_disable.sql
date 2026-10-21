-- Todoo: desligar o envio automático de uma unidade devolve os cards para as consultoras
--
-- Card com envio na fila some do Meu Dia e não conta como atrasado. Ao desligar a unidade
-- (ou trocar o número), a fila pendente é cancelada; se ligar de novo, os cards vencidos
-- voltam para a fila na próxima rodada.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.todoo_auto_unit_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.enabled OR NEW.instance_id IS NULL THEN
    UPDATE public.todoo_auto_queue
    SET status = 'canceled', reason = 'Envio automático desligado na unidade', finished_at = now()
    WHERE unit_id = NEW.unit_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.todoo_auto_unit_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS todoo_auto_unit_changed ON public.todoo_auto_units;
CREATE TRIGGER todoo_auto_unit_changed
  AFTER UPDATE OF enabled, instance_id ON public.todoo_auto_units
  FOR EACH ROW
  WHEN (OLD.enabled IS DISTINCT FROM NEW.enabled OR OLD.instance_id IS DISTINCT FROM NEW.instance_id)
  EXECUTE FUNCTION public.todoo_auto_unit_changed();
