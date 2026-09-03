import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { conferirPorta } from './webhook-auth';

export async function handleFacebookWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. Verificação do Webhook (GET request)
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      console.log(`[Facebook Webhook] Verificado com token: ${token}`);
      return new Response(challenge, { status: 200 });
    }
    return new Response('Invalid request', { status: 400 });
  }

  // 2. Recebimento de mensagens (POST request)
  if (request.method === 'POST') {
    try {
      // A tranca do POST. O `GET` de verificação já existia; o corpo que traz as
      // mensagens entrava sem conferência nenhuma.
      const porta = await conferirPorta(request, {
        provedor: 'facebook',
        segredoDaAssinatura: process.env.META_APP_SECRET,
        exigirAssinatura: !!process.env.META_APP_SECRET,
      });
      if (!porta.ok) return porta.resposta;

      const body = JSON.parse(porta.corpoBruto);
      await processFacebookWebhookBody(body);
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('[Facebook Webhook] Erro:', err);
      return new Response('ERROR', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processFacebookWebhookBody(body: any): Promise<void> {
  if (body.object === 'page') {
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        // Facebook Messenger manda no array 'messaging'
        const webhookEvent = entry.messaging?.[0];
        if (webhookEvent) {
          const senderPsid = webhookEvent.sender.id;
          if (webhookEvent.message) {
             console.log(`[Facebook Webhook] Nova mensagem de ${senderPsid}:`, webhookEvent.message);
             // TODO: Inserir a mensagem no CRM quando tivermos a tabela facebook_instances
          }
        }
        
        // Outros eventos baseados em changes (feed, etc)
        const changes = entry.changes;
        if (changes && changes.length > 0) {
           for (const change of changes) {
             console.log(`[Facebook Webhook] Change no feed:`, change.value);
           }
        }
      }
    }
  }
}
