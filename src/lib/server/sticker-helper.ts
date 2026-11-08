import sharp from "sharp";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Prepara uma figurinha para envio via EvoGo ou Stevo.
 *
 * A rota /send/sticker do EvoGo (Whatsmeow) tenta decodificar a imagem para converter em WebP de sticker.
 * Se ela receber um WebP estendido (VP8X com EXIF) direto do WhatsApp, a rotina webpDecodeRGBA do Go falha.
 * Convertendo a figurinha em um PNG limpo com transparência (RGBA 512x512), o EvoGo decodifica com sucesso
 * absoluto e converte para figurinha nativa do WhatsApp sem nenhum erro.
 */
export async function prepareStickerUrlForEvoGo(
  stickerUrlOrData: string,
  folderId: string = "general",
): Promise<string> {
  try {
    let imageBuffer: Buffer;

    if (stickerUrlOrData.startsWith("http://") || stickerUrlOrData.startsWith("https://")) {
      const res = await fetch(stickerUrlOrData);
      if (!res.ok) throw new Error("Falha ao baixar figurinha para envio.");
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else if (stickerUrlOrData.startsWith("data:")) {
      const raw = stickerUrlOrData.split(",")[1] || stickerUrlOrData;
      imageBuffer = Buffer.from(raw, "base64");
    } else {
      // Tenta interpretar como base64
      imageBuffer = Buffer.from(stickerUrlOrData, "base64");
    }

    // Converte e normaliza para PNG transparente de até 512x512
    const cleanPngBuffer = await sharp(imageBuffer)
      .resize(512, 512, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ quality: 90 })
      .toBuffer();

    const fileName = `stickers_evogo/${folderId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.png`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .upload(fileName, cleanPngBuffer, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "31536000, must-revalidate",
      });

    if (uploadError || !uploadData) {
      console.error("[sticker-helper] Failed to upload clean PNG for EvoGo:", uploadError);
      return stickerUrlOrData;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("media")
      .getPublicUrl(uploadData.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn(
      "[sticker-helper] Erro ao normalizar sticker para EvoGo, utilizando URL original:",
      err,
    );
    return stickerUrlOrData;
  }
}
