import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncCloudTemplates } from "../server/whatsapp-cloud-api";

export const syncCloudTemplatesAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ instanceId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const result = await syncCloudTemplates(data.instanceId);
      return result;
    } catch (e: any) {
      console.error('Failed to sync templates:', e);
      throw new Error(e.message || 'Falha ao sincronizar templates');
    }
  });

export const exchangeMetaCodeAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ 
    code: z.string(), 
    companyId: z.string(),
    redirectUri: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      const appId = process.env.VITE_META_APP_ID;
      const appSecret = process.env.META_APP_SECRET;

      if (!appId || !appSecret) {
        throw new Error("Credenciais do App Meta (VITE_META_APP_ID e META_APP_SECRET) não configuradas nas variáveis de ambiente.");
      }

      const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: data.redirectUri,
        code: data.code
      });

      const response = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`);
      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error?.message || "Erro na Meta API ao trocar o código pelo token.");
      }

      const userAccessToken = resData.access_token;
      if (!userAccessToken) {
        throw new Error("A Meta não retornou o token de acesso.");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("companies")
        .update({ meta_system_user_token: userAccessToken })
        .eq("id", data.companyId);

      if (error) {
        throw new Error("Erro ao salvar o token de acesso no banco: " + error.message);
      }

      return { success: true };
    } catch (e: any) {
      console.error('Failed to exchange Meta code:', e);
      throw new Error(e.message || 'Falha ao processar autenticação com Facebook');
    }
  });

