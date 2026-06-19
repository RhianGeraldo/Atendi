import { supabaseAdmin } from '@/integrations/supabase/client.server';

export async function handleInstagramWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. Verificação do Webhook (GET request)
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token && challenge) {
      console.log(`[Instagram Webhook] Verificado com token: ${token}`);
      return new Response(challenge, { status: 200 });
    }
    return new Response('Invalid request', { status: 400 });
  }

  // 2. Recebimento de mensagens (POST request)
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      await processInstagramWebhookBody(body);
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (err) {
      console.error('[Instagram Webhook] Erro:', err);
      return new Response('ERROR', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function processInstagramWebhookBody(body: any): Promise<void> {
  if (body.object === 'instagram') {
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging?.[0];
        if (webhookEvent) {
          const senderIgsid = webhookEvent.sender.id;
          if (webhookEvent.message) {
             console.log(`[Instagram Webhook] Nova mensagem de ${senderIgsid}:`, webhookEvent.message);
             // TODO: Inserir a mensagem na tabela messages com channel 'instagram'
          }
        }
      }
    }
  }
}
