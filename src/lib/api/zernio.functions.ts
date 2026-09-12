/**
 * Server functions para configuração e sincronização da Zernio.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ZernioClient, ZernioError, traduzirErroZernio } from "../canais/zernio/client";
import { novoSegredo } from "../server/webhook-auth";

/**
 * Salva as credenciais da Zernio na empresa.
 */
export const saveZernioConfigAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      apiKey: z.string().min(1, "A chave de API é obrigatória"),
      baseUrl: z.string().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { companyId, apiKey, baseUrl } = data;

    // Verificar se já existem segredos gerados para esta empresa
    const { data: comp } = await supabaseAdmin
      .from("companies")
      .select("zernio_webhook_secret, zernio_signature_secret")
      .eq("id", companyId)
      .single();

    const webhookSecret = comp?.zernio_webhook_secret || novoSegredo(32);
    const signatureSecret = comp?.zernio_signature_secret || novoSegredo(32);

    const client = new ZernioClient({
      apiKey,
      baseUrl: baseUrl || "https://zernio.com/api",
    });

    const verify = await client.verifyAuth();
    if (!verify.valid) {
      throw new Error("A chave de API da Zernio informada é inválida ou foi revogada.");
    }

    const { error: updateErr } = await supabaseAdmin
      .from("companies")
      .update({
        zernio_api_key: apiKey.trim(),
        zernio_base_url: (baseUrl || "https://zernio.com/api").trim(),
        zernio_webhook_secret: webhookSecret,
        zernio_signature_secret: signatureSecret,
      })
      .eq("id", companyId);

    if (updateErr) {
      console.error("[zernio] Erro ao salvar credenciais:", updateErr);
      throw new Error("Falha ao salvar credenciais no banco de dados.");
    }

    return {
      success: true,
      webhookSecret,
      signatureSecret,
    };
  });

/**
 * Lista as contas sociais conectadas na Zernio para seleção na UI.
 */
export const listZernioAccountsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      platform: z.enum(["whatsapp", "instagram"]).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { companyId, platform } = data;

    const { data: comp, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("zernio_api_key, zernio_base_url")
      .eq("id", companyId)
      .single();

    if (compErr || !comp?.zernio_api_key) {
      return { accounts: [] };
    }

    try {
      const client = new ZernioClient({
        apiKey: comp.zernio_api_key,
        baseUrl: comp.zernio_base_url,
      });

      const accounts = await client.listAccounts(platform);
      return { accounts };
    } catch (err: any) {
      console.error("[zernio] Erro ao listar contas:", err);
      if (err instanceof ZernioError) {
        throw new Error(traduzirErroZernio(err));
      }
      throw new Error(err.message || "Falha ao consultar contas sociais na Zernio.");
    }
  });

/**
 * Testa a conexão e registra/atualiza o webhook na Zernio.
 */
export const syncZernioWebhookAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      appOrigin: z.string().url(),
    })
  )
  .handler(async ({ data }) => {
    const { companyId, appOrigin } = data;

    const { data: comp, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("zernio_api_key, zernio_base_url, zernio_webhook_secret, zernio_signature_secret")
      .eq("id", companyId)
      .single();

    if (compErr || !comp?.zernio_api_key) {
      throw new Error("Chave da Zernio não encontrada nesta empresa.");
    }

    const webhookSecret = comp.zernio_webhook_secret || novoSegredo(32);
    const signatureSecret = comp.zernio_signature_secret || novoSegredo(32);

    // Garantir que os segredos estão gravados
    if (!comp.zernio_webhook_secret || !comp.zernio_signature_secret) {
      await supabaseAdmin
        .from("companies")
        .update({
          zernio_webhook_secret: webhookSecret,
          zernio_signature_secret: signatureSecret,
        })
        .eq("id", companyId);
    }

    const webhookUrl = `${appOrigin.replace(/\/+$/, "")}/api/webhooks/zernio/${companyId}?k=${encodeURIComponent(webhookSecret)}`;

    const client = new ZernioClient({
      apiKey: comp.zernio_api_key,
      baseUrl: comp.zernio_base_url,
    });

    try {
      const reg = await client.registerWebhook({
        webhookUrl,
        secret: signatureSecret,
      });

      return {
        success: true,
        webhookUrl,
        webhookId: reg.webhookId,
      };
    } catch (err: any) {
      console.error("[zernio] Erro ao registrar webhook:", err);
      if (err instanceof ZernioError) {
        throw new Error(traduzirErroZernio(err));
      }
      throw new Error(err.message || "Falha ao registrar webhook na Zernio.");
    }
  });
