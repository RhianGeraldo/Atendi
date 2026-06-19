import { supabaseAdmin } from '@/integrations/supabase/client.server';

interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
}

export async function sendCloudApiMessage(
  instanceId: string, 
  toPhone: string, 
  content: string, 
  type: string = 'text', 
  mediaUrl?: string | null
) {
  // Buscar configuração da instância
  const { data: instance } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('oficial_phone_number_id, oficial_access_token')
    .eq('id', instanceId)
    .single();

  if (!instance || !instance.oficial_phone_number_id || !instance.oficial_access_token) {
    throw new Error('Instância Oficial não configurada corretamente');
  }

  const config: CloudApiConfig = {
    phoneNumberId: instance.oficial_phone_number_id,
    accessToken: instance.oficial_access_token
  };

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone.replace(/\D/g, '')
  };

  if (type === 'text') {
    payload.type = 'text';
    payload.text = { body: content, preview_url: true };
  } else if (type === 'image') {
    payload.type = 'image';
    payload.image = { link: mediaUrl, caption: content || '' };
  } else if (type === 'audio') {
    payload.type = 'audio';
    payload.audio = { link: mediaUrl };
  } else if (type === 'video') {
    payload.type = 'video';
    payload.video = { link: mediaUrl, caption: content || '' };
  } else if (type === 'document') {
    payload.type = 'document';
    payload.document = { link: mediaUrl, caption: content || '', filename: content || 'documento' };
  } else if (type === 'template') {
    // Template precisa ser um objeto complexo na Cloud API
    // Para simplificar, assumimos que 'content' é um JSON stringificado ou o nome do template
    let templateData;
    try {
      templateData = JSON.parse(content);
    } catch {
      // Se não for JSON, trata o content como nome simples de template sem variáveis
      templateData = {
        name: content,
        language: { code: 'pt_BR' }
      };
    }
    payload.type = 'template';
    payload.template = templateData;
  } else {
    throw new Error(`Tipo de mensagem não suportado pela Cloud API: ${type}`);
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('[WhatsApp Cloud API] Erro ao enviar mensagem:', responseData);
    throw new Error(responseData.error?.message || 'Falha ao enviar mensagem');
  }

  // A API da Meta retorna messages[0].id (WAMID)
  return responseData.messages?.[0]?.id || null;
}
