-- Todoo: chama o envio automático a cada minuto
--
-- O pg_cron do Supabase faz um POST em /api/cron/todoo-auto com o CRON_SECRET, que fica no
-- Vault (nome 'cron_secret', gravado fora do repositório). Sem o segredo no Vault, não chama.
-- O servidor decide quem sai: cada unidade respeita o próprio intervalo, horário e dias.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'todoo-auto-send',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://atendiai.vercel.app/api/cron/todoo-auto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  FROM vault.decrypted_secrets s
  WHERE s.name = 'cron_secret';
  $job$
);
