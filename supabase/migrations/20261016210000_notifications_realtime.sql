-- Notificações em tempo real: o aviso de transferência (som, toast e notificação do
-- navegador) e o sino do cabeçalho escutam INSERT em notifications via Realtime.
-- A tabela é pequena e fria; ADD TABLE na publicação é só catálogo.

SET lock_timeout = '3s';
SET statement_timeout = '15s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
