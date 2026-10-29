/**
 * Server functions dos canais Meta diretos (Instagram e Messenger pela Graph API).
 *
 * Diferente do WhatsApp por QR, esses canais não têm "conexão": a conta já está
 * autorizada pelo token. O que falta para as mensagens chegarem é a inscrição da
 * conta no app (`subscribed_apps`) com os campos de mensagem — sem ela a Meta
 * aceita o cadastro do webhook do app e simplesmente não entrega nada.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertCompanyAccess } from "../server/access-control";

const GRAPH_FB = "https://graph.facebook.com/v20.0";
const GRAPH_IG = "https://graph.instagram.com/v20.0";

// Campos da Página que trazem as conversas. Os do Instagram (via Página) são
// escolhidos no objeto "Instagram" do painel de Webhooks do app, mas a Página
// ainda precisa estar inscrita para a entrega acontecer.
const CAMPOS_PAGINA = [
  "messages",
  "messaging_postbacks",
  "messaging_referrals",
  "message_echoes",
  "message_reactions",
  "message_reads",
];

// Token de "Instagram API com login do Instagram" (IGA...): a inscrição é na própria conta.
const CAMPOS_INSTAGRAM_LOGIN = ["messages", "messaging_postbacks", "messaging_seen", "message_reactions"];

async function graph(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `Erro ${res.status} na Graph API da Meta.`);
  }
  return json;
}

function comToken(url: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  return `${url}?${qs.toString()}`;
}

/**
 * Confere o token do canal, inscreve a conta no app com os campos de mensagem e
 * marca o canal como conectado. Pode ser chamada de novo a qualquer momento
 * (ex.: depois de trocar o token): a inscrição é idempotente.
 */
export const validateMetaChannelAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ instanceId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: inst, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, company_id, provider, oficial_phone_number_id, oficial_waba_id, oficial_access_token")
      .eq("id", data.instanceId)
      .maybeSingle();

    if (error || !inst) throw new Error("Canal não encontrado.");
    await assertCompanyAccess(context.userId, inst.company_id);

    if (inst.provider !== "instagram" && inst.provider !== "messenger") {
      throw new Error("Somente canais Instagram ou Messenger diretos da Meta podem ser validados.");
    }

    const token = inst.oficial_access_token;
    if (!token) throw new Error("O canal não tem token de acesso da Meta.");

    let conta = "";
    let campos: string[] = [];

    if (token.startsWith("IGA")) {
      const me = await graph(comToken(`${GRAPH_IG}/me`, token, { fields: "user_id,username" }));
      await graph(
        comToken(`${GRAPH_IG}/me/subscribed_apps`, token, {
          subscribed_fields: CAMPOS_INSTAGRAM_LOGIN.join(","),
        }),
        { method: "POST" },
      );
      conta = me.username ? `@${me.username}` : String(me.user_id ?? "");
      campos = CAMPOS_INSTAGRAM_LOGIN;
    } else {
      const pageId = inst.provider === "instagram" ? inst.oficial_waba_id : inst.oficial_phone_number_id;
      if (!pageId) {
        throw new Error(
          "O canal não tem a Página do Facebook vinculada. Recrie o canal selecionando a Página da conta.",
        );
      }

      // Ler o nó da Página exige pages_read_engagement, que o app não pede. Para
      // o Instagram basta a conta IG responder com o token (instagram_basic); a
      // inscrição abaixo usa pages_manage_metadata.
      if (inst.provider === "instagram") {
        if (!inst.oficial_phone_number_id) throw new Error("O canal não tem o ID da conta do Instagram.");
        const ig = await graph(
          comToken(`${GRAPH_FB}/${inst.oficial_phone_number_id}`, token, { fields: "id,username" }),
        );
        conta = ig.username ? `@${ig.username}` : ig.id;
      } else {
        conta = `Página ${pageId}`;
      }

      // A lista pode trazer outros apps instalados na Página: olha só o nosso.
      const appId = process.env.VITE_META_APP_ID;
      const doNossoApp = (lista: any) => {
        const apps: any[] = lista?.data ?? [];
        return (appId ? apps.find((a) => String(a.id) === appId) : apps.length === 1 ? apps[0] : null) ?? null;
      };

      // POST substitui a lista de campos: mantém os que já estavam inscritos.
      const atuais = await graph(comToken(`${GRAPH_FB}/${pageId}/subscribed_apps`, token));
      const jaInscritos: string[] = doNossoApp(atuais)?.subscribed_fields ?? [];
      const desejados = Array.from(new Set([...jaInscritos, ...CAMPOS_PAGINA]));

      await graph(
        comToken(`${GRAPH_FB}/${pageId}/subscribed_apps`, token, {
          subscribed_fields: desejados.join(","),
        }),
        { method: "POST" },
      );

      const conferido = await graph(comToken(`${GRAPH_FB}/${pageId}/subscribed_apps`, token));
      campos = doNossoApp(conferido)?.subscribed_fields ?? [];
      if (!campos.includes("messages")) {
        throw new Error("A Meta aceitou a inscrição, mas o campo de mensagens não ficou ativo na Página.");
      }
    }

    await supabaseAdmin.from("whatsapp_instances").update({ status: "connected" }).eq("id", inst.id);

    return { success: true, conta, campos };
  });
