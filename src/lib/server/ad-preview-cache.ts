import { supabaseAdmin } from '@/integrations/supabase/client.server';
import crypto from 'crypto';

/**
 * Normaliza e busca o objeto externalAdReply de qualquer formato de mensagem do WhatsApp
 */
export function extractExternalAdReply(messageData: any, bodyData?: any): any | null {
  if (!messageData && !bodyData) return null;

  const candidates = [
    messageData?.extendedTextMessage?.contextInfo?.externalAdReply,
    messageData?.imageMessage?.contextInfo?.externalAdReply,
    messageData?.videoMessage?.contextInfo?.externalAdReply,
    messageData?.documentMessage?.contextInfo?.externalAdReply,
    messageData?.contextInfo?.externalAdReply,
    messageData?.message?.extendedTextMessage?.contextInfo?.externalAdReply,
    messageData?.message?.imageMessage?.contextInfo?.externalAdReply,
    messageData?.message?.videoMessage?.contextInfo?.externalAdReply,
    messageData?.message?.contextInfo?.externalAdReply,
    bodyData?.message?.extendedTextMessage?.contextInfo?.externalAdReply,
    bodyData?.message?.imageMessage?.contextInfo?.externalAdReply,
    bodyData?.message?.contextInfo?.externalAdReply,
    bodyData?.data?.message?.extendedTextMessage?.contextInfo?.externalAdReply,
    bodyData?.data?.message?.imageMessage?.contextInfo?.externalAdReply,
    bodyData?.data?.message?.contextInfo?.externalAdReply,
  ];

  for (const c of candidates) {
    if (c && typeof c === 'object') {
      return c;
    }
  }

  return null;
}

/**
 * Processa a imagem do anúncio:
 * 1. Verifica se já existe em cache no banco ou storage para a empresa (Deduplicação)
 * 2. Se for novo, faz upload de Base64 ou baixa do CDN com headers seguros
 * 3. Salva no bucket 'media' com nome determinístico: ads/{companyId}/{adId}.jpg
 * 4. Substitui a URL no objeto externalAdReply pela URL permanente do Supabase Storage
 */
export async function processAndCacheAdPreview({
  companyId,
  metadata,
}: {
  companyId: string;
  metadata: Record<string, any>;
}): Promise<string | null> {
  try {
    if (!metadata || !metadata.externalAdReply) return null;

    const adReply = metadata.externalAdReply;

    // 1. Identificar o ID do anúncio / chave do anúncio
    const rawSourceId = 
      adReply.sourceID || 
      adReply.sourceId || 
      adReply.source_id || 
      adReply.ctwaClid || 
      adReply.ctwa_clid ||
      metadata.ctwaPayload ||
      adReply.sourceURL || 
      adReply.sourceUrl || 
      adReply.title;

    if (!rawSourceId) {
      console.log('[ad-preview-cache] Nenhum identificador encontrado no externalAdReply');
      return null;
    }

    const cleanId = String(rawSourceId).trim();
    // Chave segura e determinística para o arquivo no Storage
    const safeSourceId = cleanId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const hash = crypto.createHash('md5').update(cleanId).digest('hex').slice(0, 8);
    const adFileBase = `${safeSourceId}_${hash}`;
    const fileName = `ads/${companyId}/${adFileBase}.jpg`;

    // 2. Deduplicação: Verificar se já temos essa imagem salva no banco (ad_leads) para essa empresa
    try {
      const { data: existingLead } = await supabaseAdmin
        .from('ad_leads')
        .select('thumbnail_url')
        .eq('company_id', companyId)
        .eq('source_id', cleanId)
        .not('thumbnail_url', 'is', null)
        .limit(1)
        .maybeSingle();

      if (existingLead?.thumbnail_url && (existingLead.thumbnail_url.includes('/storage/') || existingLead.thumbnail_url.includes('supabase.co'))) {
        console.log(`[ad-preview-cache] Reutilizando thumbnail já em cache para ${cleanId}: ${existingLead.thumbnail_url}`);
        adReply.thumbnailURL = existingLead.thumbnail_url;
        adReply.thumbnailUrl = existingLead.thumbnail_url;
        return existingLead.thumbnail_url;
      }
    } catch (dbCheckErr) {
      console.warn('[ad-preview-cache] Aviso na consulta de ad_leads:', dbCheckErr);
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(fileName);
    const storagePublicUrl = publicUrlData?.publicUrl;

    // 3. Extrair a imagem (suporta Base64 direto do WhatsApp ou URL externa da Meta)
    let imageBuffer: Buffer | null = null;
    let contentType = 'image/jpeg';

    const rawJpegThumb = adReply.jpegThumbnail || adReply.thumbnail;
    const rawThumbUrl = adReply.thumbnailURL || adReply.thumbnailUrl || adReply.originalImageURL || adReply.originalImageUrl;

    // Caso A: A imagem veio em Base64 (muito comum em mensagens do WhatsApp)
    if (rawJpegThumb) {
      try {
        if (typeof rawJpegThumb === 'string') {
          const base64Data = rawJpegThumb.replace(/^data:image\/\w+;base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');
        } else if (Buffer.isBuffer(rawJpegThumb)) {
          imageBuffer = rawJpegThumb;
        }
      } catch (b64Err) {
        console.error('[ad-preview-cache] Erro decodificando Base64 da thumbnail:', b64Err);
      }
    }

    // Caso B: A imagem veio como URL externa do CDN da Meta
    if (!imageBuffer && rawThumbUrl && typeof rawThumbUrl === 'string' && rawThumbUrl.startsWith('http')) {
      // Se já for uma URL do nosso próprio storage, não precisa baixar de novo
      if (rawThumbUrl.includes('/storage/') || rawThumbUrl.includes('supabase.co')) {
        adReply.thumbnailURL = rawThumbUrl;
        adReply.thumbnailUrl = rawThumbUrl;
        return rawThumbUrl;
      }

      console.log(`[ad-preview-cache] Baixando thumbnail do anúncio do CDN externo...`);
      try {
        const res = await fetch(rawThumbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          }
        });

        if (res.ok) {
          const arrBuf = await res.arrayBuffer();
          imageBuffer = Buffer.from(arrBuf);
          const ct = res.headers.get('content-type');
          if (ct) contentType = ct;
        } else {
          console.warn(`[ad-preview-cache] Falha ao baixar thumbnail do Meta CDN (Status: ${res.status})`);
        }
      } catch (fetchErr) {
        console.error('[ad-preview-cache] Erro no fetch da thumbnail externa:', fetchErr);
      }
    }

    // 4. Se obtivemos o Buffer, faz o upload no bucket permanente do Supabase Storage
    if (imageBuffer && imageBuffer.length > 0) {
      console.log(`[ad-preview-cache] Salvando imagem permanente do anúncio no Storage: ${fileName} (${imageBuffer.length} bytes)`);
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('media')
        .upload(fileName, imageBuffer, {
          contentType: contentType,
          upsert: true,
        });

      if (!uploadErr && storagePublicUrl) {
        adReply.thumbnailURL = storagePublicUrl;
        adReply.thumbnailUrl = storagePublicUrl;
        console.log(`[ad-preview-cache] Thumbnail salva com sucesso no Storage: ${storagePublicUrl}`);
        return storagePublicUrl;
      } else if (uploadErr) {
        console.error('[ad-preview-cache] Erro ao fazer upload para o bucket media:', uploadErr);
      }
    }

    // Fallback: mantém a URL existente se não foi possível fazer cache
    if (rawThumbUrl) {
      adReply.thumbnailURL = rawThumbUrl;
    }
    return adReply.thumbnailURL || null;
  } catch (err) {
    console.error('[ad-preview-cache] Erro inesperado ao processar preview do anúncio:', err);
    return null;
  }
}
