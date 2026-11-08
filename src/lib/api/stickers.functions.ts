/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface CompanySticker {
  id: string;
  company_id: string;
  name: string;
  url: string;
  created_by?: string | null;
  created_at: string;
  order_index?: number;
}

/**
 * 1. Lista as figurinhas da biblioteca da empresa.
 * Qualquer usuário autenticado pertencente à empresa pode consultar para usar no chat.
 */
export const getCompanyStickersAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: stickers, error } = await supabaseAdmin
      .from("company_stickers")
      .select("id, company_id, name, url, created_by, created_at, order_index")
      .eq("company_id", companyId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn(
        "[stickers.functions] Tabela company_stickers indisponível, usando fallback de custom_variables:",
        error.message,
      );
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", companyId)
        .single();
      const customVars = comp?.custom_variables || {};
      const fallbackStickers = (customVars as any).stickers || [];
      return fallbackStickers as CompanySticker[];
    }

    return (stickers || []) as CompanySticker[];
  });

/**
 * 2. Adiciona uma nova figurinha à biblioteca da empresa.
 * REGRA ESTRITA: Exclusivo para usuários com role 'super_admin'.
 */
export const createCompanyStickerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      name: z.string().optional().default("Figurinha"),
      imageBase64: z.string().min(1, "O arquivo de imagem é obrigatório"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { companyId, name, imageBase64 } = data;
    const finalName = name?.trim() || "Figurinha";

    // Validação estrita de autorização: apenas super_admin pode adicionar figurinhas
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "super_admin") {
      throw new Error("Apenas o super admin tem permissão para adicionar figurinhas ao sistema.");
    }

    // Extrai o buffer e formato da imagem
    let buffer: Buffer;
    let mimeType = "image/webp";

    if (imageBase64.startsWith("http://") || imageBase64.startsWith("https://")) {
      try {
        const response = await fetch(imageBase64);
        if (!response.ok) throw new Error("Falha ao baixar imagem da URL informada.");
        const arrayBuf = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        const headerType = response.headers.get("content-type");
        if (headerType) mimeType = headerType;
      } catch (fetchErr: any) {
        throw new Error(`Erro ao obter imagem para salvar figurinha: ${fetchErr.message}`);
      }
    } else if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        const rawBase64 = imageBase64.split(",")[1] || imageBase64;
        buffer = Buffer.from(rawBase64, "base64");
      }
    } else {
      buffer = Buffer.from(imageBase64, "base64");
    }

    const ext = mimeType.includes("webp") ? "webp" : "webp";
    const fileName = `stickers/${companyId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

    // Upload seguro para o Supabase Storage no bucket 'media'
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("media")
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: "31536000, must-revalidate",
      });

    if (uploadError || !uploadData) {
      console.error("[stickers.functions] Storage upload error:", uploadError);
      throw new Error(
        `Falha no upload da figurinha: ${uploadError?.message || "Erro desconhecido"}`,
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("media")
      .getPublicUrl(uploadData.path);

    const publicUrl = publicUrlData.publicUrl;

    // Salva na tabela company_stickers com fallback para custom_variables
    const newSticker: CompanySticker = {
      id: crypto.randomUUID(),
      company_id: companyId,
      name: finalName,
      url: publicUrl,
      created_by: userId,
      created_at: new Date().toISOString(),
      order_index: 0,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("company_stickers")
      .insert({
        company_id: companyId,
        name: finalName,
        url: publicUrl,
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.warn(
        "[stickers.functions] company_stickers indisponível no banco, salvando no fallback de custom_variables...",
        insertError.message,
      );
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", companyId)
        .single();

      const customVars = comp?.custom_variables || {};
      const existingStickers: CompanySticker[] = (customVars as any).stickers || [];
      const updatedStickers = [newSticker, ...existingStickers];

      const { error: compError } = await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...customVars,
            stickers: updatedStickers,
          },
        })
        .eq("id", companyId);

      if (compError) {
        console.error("[stickers.functions] Database insert error fallback:", compError);
        throw new Error("Figurinha enviada, mas falhou ao gravar no banco de dados.");
      }

      return newSticker;
    }

    return inserted as CompanySticker;
  });

/**
 * 3. Remove uma figurinha da biblioteca da empresa.
 * REGRA ESTRITA: Exclusivo para usuários com role 'super_admin'.
 */
export const deleteCompanyStickerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      stickerId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { stickerId, companyId } = data;

    // Validação estrita de autorização: apenas super_admin pode remover figurinhas
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "super_admin") {
      throw new Error("Apenas o super admin tem permissão para excluir figurinhas.");
    }

    // Busca figurinha para pegar a URL do arquivo para remoção do storage
    const { data: sticker } = await supabaseAdmin
      .from("company_stickers")
      .select("url")
      .eq("id", stickerId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (sticker?.url) {
      try {
        const parts = sticker.url.split("/media/");
        if (parts.length > 1) {
          const filePath = parts[1];
          await supabaseAdmin.storage.from("media").remove([filePath]);
        }
      } catch (err) {
        console.warn("[stickers.functions] Failed to delete file from storage:", err);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("company_stickers")
      .delete()
      .eq("id", stickerId)
      .eq("company_id", companyId);

    if (deleteError) {
      console.warn(
        "[stickers.functions] company_stickers delete failed, removing from custom_variables fallback...",
        deleteError.message,
      );
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", companyId)
        .single();

      const customVars = comp?.custom_variables || {};
      const existingStickers: CompanySticker[] = (customVars as any).stickers || [];
      const updatedStickers = existingStickers.filter((s) => s.id !== stickerId);

      await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...customVars,
            stickers: updatedStickers,
          },
        })
        .eq("id", companyId);
    }

    return { success: true };
  });
