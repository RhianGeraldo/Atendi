import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { getPhoneVariants } from '@/lib/utils';

interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
}

export async function sendCloudApiMessage(
  instanceId: string, 
  toPhone: string, 
  content: string, 
  type: string = 'text', 
  mediaUrl?: string | null,
  quotedMessageId?: string | null
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

  const formattedPhone = toPhone.replace(/\D/g, '');
  const variants = getPhoneVariants(formattedPhone);

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone
  };

  if (quotedMessageId && quotedMessageId.startsWith('wamid.') && type !== 'template') {
    payload.context = {
      message_id: quotedMessageId
    };
  }

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

  let lastError = null;

  for (const variant of variants) {
    payload.to = variant;
    const response = await fetch(`https://graph.facebook.com/v25.0/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (response.ok) {
      // Sucesso com esta variante!
      return responseData.messages?.[0]?.id || null;
    } else {
      // Se for erro de numero invalido (131026) ou não permitido (131030) na sandbox
      const errCode = responseData.error?.code;
      if (errCode === 131026 || errCode === 131030) {
        lastError = responseData;
        console.warn(`[WhatsApp Cloud API] Variante ${variant} falhou com código ${errCode}. Tentando próxima...`);
        continue;
      } else {
        // Outro erro, não adianta tentar variante
        console.error('[WhatsApp Cloud API] Erro ao enviar mensagem:', responseData);
        if (errCode === 131047) {
          throw new Error('WINDOW_24H_EXPIRED');
        }
        throw new Error(responseData.error?.message || 'Falha ao enviar mensagem');
      }
    }
  }

  // Se todas as variantes falharem
  console.error('[WhatsApp Cloud API] Todas as variantes falharam. Último erro:', lastError);
  throw new Error(`Falha API Oficial: (#${lastError?.error?.code || 'Desconhecido'}) ${lastError?.error?.message || 'Falha ao enviar mensagem para o número.'}`);
}

export async function syncCloudTemplates(instanceId: string) {
  const { data: instance, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('company_id, oficial_waba_id, oficial_access_token')
    .eq('id', instanceId)
    .single();

  if (error || !instance) {
    throw new Error('Instância não encontrada.');
  }

  if (!instance.oficial_waba_id || !instance.oficial_access_token) {
    throw new Error('WABA ID ou Access Token ausentes na configuração da instância.');
  }

  // Busca templates na API da Meta
  const response = await fetch(`https://graph.facebook.com/v25.0/${instance.oficial_waba_id}/message_templates?limit=100`, {
    headers: {
      'Authorization': `Bearer ${instance.oficial_access_token}`
    }
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error?.message || 'Falha ao buscar templates.');
  }

  const templates = responseData.data;
  
  if (!templates || templates.length === 0) {
    return { success: true, count: 0 };
  }

  // Prepara payload para upsert
  const upsertData = templates.map((t: any) => ({
    company_id: instance.company_id,
    whatsapp_instance_id: instanceId,
    name: t.name,
    language: t.language,
    status: t.status, // APPROVED, PENDING, REJECTED
    quality_score: t.quality_score?.score || 'UNKNOWN',
    category: t.category,
    components: t.components || []
  }));

  // No Supabase, upsert com base no whatsapp_instance_id, name e language
  const { error: upsertError } = await supabaseAdmin
    .from('whatsapp_templates')
    .upsert(upsertData, {
      onConflict: 'whatsapp_instance_id, name, language'
    });

  if (upsertError) {
    console.error('[WhatsApp Cloud API] Erro ao salvar templates:', upsertError);
    throw new Error('Erro interno ao salvar templates.');
  }

  return { success: true, count: templates.length };
}
