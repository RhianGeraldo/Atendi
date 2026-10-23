import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Responde o `GET` de verificação da Meta (Instagram e Messenger).
 *
 * A Meta usa um único verify token por app, o cadastrado no painel de Webhooks.
 * Aceita o `META_WEBHOOK_VERIFY_TOKEN` do ambiente e, para não quebrar cadastros
 * antigos, o verify token salvo em algum canal.
 */
export async function responderVerificacaoMeta(url: URL, provedor: string): Promise<Response> {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !challenge) {
    return new Response('Invalid request', { status: 400 });
  }

  let valido = !!process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!valido) {
    const { data } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id')
      .eq('oficial_verify_token', token)
      .limit(1)
      .maybeSingle();
    valido = !!data;
  }

  if (!valido) {
    console.warn(`[${provedor} Webhook] Verificação recusada: verify token desconhecido.`);
    return new Response('Forbidden', { status: 403 });
  }

  console.log(`[${provedor} Webhook] Verificado.`);
  return new Response(challenge, { status: 200 });
}
