import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Baixa e persiste a foto de perfil de um contato no Supabase Storage ('media/avatars/').
 *
 * Imagens do CDN da Meta (Instagram e WhatsApp) possuem tokens assinados temporários (&oe=...)
 * que expiram em poucos dias, resultando em erro HTTP 403 Forbidden.
 *
 * Esta função converte qualquer URL externa (ou base64) em uma URL permanente do Atendi no Storage.
 */
export async function persistirAvatarContatoNoStorage(
  contactId: string,
  avatarUrl: string | null | undefined
): Promise<string | null> {
  if (!contactId || !avatarUrl || typeof avatarUrl !== "string") {
    return null;
  }

  const cleanUrl = avatarUrl.trim();
  if (!cleanUrl) return null;

  // Se já estiver no nosso próprio storage permanente, não precisa reprocessar
  if (
    cleanUrl.includes("supabase.co/storage") ||
    cleanUrl.includes("/storage/v1/object/public/media/avatars/")
  ) {
    return cleanUrl;
  }

  let buffer: Buffer | null = null;
  let contentType = "image/jpeg";
  let ext = "jpg";

  // Caso 1: Imagem em Base64
  if (cleanUrl.startsWith("data:image/")) {
    try {
      const matches = cleanUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
      if (matches) {
        contentType = `image/${matches[1]}`;
        ext = matches[1] === "png" ? "png" : matches[1] === "webp" ? "webp" : "jpg";
        buffer = Buffer.from(matches[2], "base64");
      }
    } catch (b64Err) {
      console.warn(`[avatar-storage] Falha ao decodificar base64 para contato ${contactId}:`, b64Err);
    }
  }

  // Caso 2: URL HTTP/HTTPS externa (Meta CDN, Zernio, etc.)
  if (!buffer && cleanUrl.startsWith("http")) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(cleanUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("png")) {
          contentType = "image/png";
          ext = "png";
        } else if (ct.includes("webp")) {
          contentType = "image/webp";
          ext = "webp";
        } else {
          contentType = "image/jpeg";
          ext = "jpg";
        }

        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > 100) {
          buffer = Buffer.from(arrayBuf);
        }
      } else {
        console.warn(
          `[avatar-storage] Meta CDN retornou status ${res.status} para o avatar do contato ${contactId}`
        );
      }
    } catch (fetchErr: any) {
      console.warn(
        `[avatar-storage] Erro no download do avatar para contato ${contactId}:`,
        fetchErr?.message || fetchErr
      );
    }
  }

  if (!buffer || buffer.length === 0) {
    return null;
  }

  const fileName = `avatars/contact_${contactId}.${ext}`;

  try {
    const { error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`[avatar-storage] Erro de upload no bucket media para ${fileName}:`, uploadError);
      return null;
    }

    const { data: publicData } = supabaseAdmin.storage.from("media").getPublicUrl(fileName);
    const permanentUrl = publicData?.publicUrl;

    if (permanentUrl) {
      // Atualiza o contato com a URL permanente
      await supabaseAdmin
        .from("contacts")
        .update({ profile_picture_url: permanentUrl })
        .eq("id", contactId);

      return permanentUrl;
    }
  } catch (err: any) {
    console.error(`[avatar-storage] Erro ao salvar avatar no Supabase:`, err);
  }

  return null;
}

/**
 * Extrai foto de perfil de qualquer formato de payload recebido da Zernio.
 */
export function extrairFotoPerfilZernio(payload: any): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const conversation = payload.conversation || {};
  const message = payload.message || {};
  const sender = message.sender || {};
  const contact = payload.contact || {};

  return (
    conversation.participantPicture ||
    conversation.participantProfilePicture ||
    conversation.avatarUrl ||
    sender.picture ||
    sender.profilePicture ||
    sender.profilePic ||
    sender.avatarUrl ||
    sender.avatar ||
    sender.instagramProfile?.profilePic ||
    sender.instagramProfile?.profile_pic ||
    contact.avatarUrl ||
    contact.profilePicture ||
    undefined
  );
}
