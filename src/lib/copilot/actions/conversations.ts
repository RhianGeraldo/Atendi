/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "@/lib/server/message-sender";
import { sendEvogoText } from "@/lib/evogo";
import { calculateConversationSla, DEFAULT_SLA_SETTINGS, type SlaSettings } from "@/lib/sla";
import type { CopilotAction, CopilotContext } from "../types";

function detectMediaType(url: string): "image" | "video" | "audio" | "document" {
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|webp|gif|bmp|svg)$/.test(cleanUrl)) return "image";
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(cleanUrl)) return "video";
  if (/\.(mp3|ogg|wav|m4a|aac|opus)$/.test(cleanUrl)) return "audio";
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/.test(cleanUrl)) return "document";
  return "image";
}

function detectMediaTypeFromBase64(b64: string): "image" | "video" | "audio" | "document" {
  if (b64.startsWith("data:")) {
    const match = b64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);/);
    if (match) {
      const mime = match[1].toLowerCase();
      if (mime.startsWith("image/")) return "image";
      if (mime.startsWith("video/")) return "video";
      if (mime.startsWith("audio/")) return "audio";
      return "document";
    }
  }
  return "image";
}

function formatMediaPayload(
  mediaUrl: string,
  base64Input: string,
  mediaType: string,
): string | undefined {
  if (base64Input) {
    if (base64Input.startsWith("data:")) return base64Input;
    let mime = "application/octet-stream";
    if (mediaType === "image") mime = "image/png";
    else if (mediaType === "video") mime = "video/mp4";
    else if (mediaType === "audio") mime = "audio/mp4";
    else if (mediaType === "document") mime = "application/pdf";
    return `data:${mime};base64,${base64Input}`;
  }
  return mediaUrl || undefined;
}

export const conversationsActions: CopilotAction[] = [
  // ─── Listar instâncias WhatsApp ───────────────────────────────────────────
  {
    name: "listar_instancias_whatsapp",
    label: "Listar Instâncias WhatsApp",
    description:
      "Lista todas as instâncias (números) de WhatsApp configuradas na empresa, com nome, unidade e status de conexão. Use para saber qual número usar ao enviar mensagem proativa.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        unidade_nome: {
          type: "string",
          description: "Filtrar instâncias de uma unidade específica pelo nome. Opcional.",
        },
      },
      required: [],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: instances, error } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, name, instance_name, status, unit_id, unit:units(id, name)")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error) return { success: false, message: `Erro ao listar instâncias: ${error.message}` };

      let list = instances || [];
      const unitFilter = (params.unidade_nome || "").toLowerCase();
      if (unitFilter) {
        list = list.filter((i: any) =>
          ((i.unit as any)?.name || "").toLowerCase().includes(unitFilter),
        );
      }

      const result = list.map((i: any) => ({
        id: i.id,
        nome: i.name,
        instance_name: i.instance_name,
        status: i.status,
        conectada: i.status === "connected" || i.status === "open",
        unidade: (i.unit as any)?.name || null,
        unit_id: i.unit_id,
      }));

      const conectadas = result.filter((i: any) => i.conectada);

      return {
        success: true,
        message: `${result.length} instância(s) encontrada(s)${unitFilter ? ` na unidade "${params.unidade_nome}"` : ""}. ${conectadas.length} conectada(s).`,
        data: result,
      };
    },
  },

  // ─── Listar conversas ─────────────────────────────────────────────────────
  {
    name: "listar_conversas",
    label: "Listar Conversas",
    description:
      "Lista as conversas/atendimentos da empresa com cálculo de SLA em tempo real. Suporta filtros por status, filial, canal, condição de SLA ('breached', 'warning', 'waiting', 'ok') e ocultar grupos.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "active", "waiting", "resolved"],
          description: "Status da conversa (padrão: 'active').",
          default: "active",
        },
        canal: {
          type: "string",
          description: "Filtrar por canal: 'whatsapp', 'instagram' ou 'all'.",
        },
        filtro_sla: {
          type: "string",
          enum: ["all", "breached", "warning", "ok", "waiting"],
          description:
            "Filtrar conversas por condição de SLA: 'breached' (atrasadas/estouradas), 'warning' (em risco/amarelo), 'waiting' (aguardando retorno do cliente/atendente), 'ok'.",
        },
        ignorar_grupos: {
          type: "boolean",
          description: "Se true, oculta conversas de grupos de WhatsApp. Padrão: true.",
          default: true,
        },
        unidade_nome: {
          type: "string",
          description: "Filtrar por nome da unidade (opcional).",
        },
        busca: {
          type: "string",
          description: "Buscar por nome do contato ou telefone.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima (padrão 15, máx 50).",
          default: 15,
        },
      },
      required: [],
    },
    execute: async (params: any, context: CopilotContext) => {
      const limit = Math.min(Math.max(Number(params.limite) || 15, 1), 50);
      const targetStatus = params.status || "active";

      let query = supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, last_message_at, last_message_preview, unit_id, created_at, contacts!inner(id, name, phone, company_id), units(name)",
        )
        .eq("contacts.company_id", context.companyId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      // Restringir às unidades do usuário quando não for admin com acesso matriz
      const isAdminOrMatriz =
        context.userRole === "admin_company" ||
        context.userRole === "super_admin" ||
        context.hasMatrizAccess;
      if (!isAdminOrMatriz && context.userUnitIds.length > 0) {
        query = query.in("unit_id", context.userUnitIds);
      }

      if (targetStatus !== "all") {
        query = query.eq("status", targetStatus);
      }

      if (params.canal && params.canal !== "all") {
        query = query.eq("channel", params.canal);
      }

      if (params.unidade_nome) {
        const { data: unit } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${params.unidade_nome}%`)
          .maybeSingle();
        if (unit) query = query.eq("unit_id", unit.id);
      }

      if (params.busca) {
        const term = params.busca.trim();
        query = query.or(`contacts.name.ilike.%${term}%,contacts.phone.ilike.%${term}%`);
      }

      const { data: convs, error } = await query;
      if (error) return { success: false, message: `Erro ao listar conversas: ${error.message}` };

      // Buscar configurações de SLA da empresa
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();
      const customVars = (comp?.custom_variables as Record<string, any>) || {};
      const slaSettings: SlaSettings = customVars.sla || DEFAULT_SLA_SETTINGS;

      let processed = (convs || []).map((c: any) => {
        const contactPhone = (c.contacts as any)?.phone || "";
        const isGroup =
          contactPhone.startsWith("120363") ||
          (contactPhone.includes("-") && contactPhone.length > 18);

        const convRowForSla: any = {
          id: c.id,
          channel: c.channel,
          status: c.status,
          last_message: c.last_message_preview,
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          started_at: c.created_at || c.last_message_at,
          contact: {
            phone: contactPhone,
            name: (c.contacts as any)?.name,
          },
        };

        const slaInfo = calculateConversationSla(convRowForSla, slaSettings);

        return {
          id: c.id,
          status: c.status,
          canal: c.channel,
          is_grupo: isGroup,
          contato: {
            id: (c.contacts as any)?.id,
            nome: (c.contacts as any)?.name,
            telefone: contactPhone,
          },
          unidade: (c.units as any)?.name || null,
          ultima_mensagem: c.last_message_preview || null,
          ultima_mensagem_em: c.last_message_at,
          sla: {
            status: slaInfo.status,
            aguardando_resposta: slaInfo.isWaiting,
            minutos_espera: slaInfo.elapsedMinutes,
            tempo_limite_minutos: slaInfo.limitMinutes,
            minutos_restantes: slaInfo.remainingMinutes,
            minutos_atraso: slaInfo.overdueMinutes,
            rotulo: slaInfo.badgeLabel,
          },
        };
      });

      if (params.ignorar_grupos !== false) {
        processed = processed.filter((c) => !c.is_grupo);
      }

      if (params.filtro_sla === "breached") {
        processed = processed.filter((c) => c.sla.status === "breached");
      } else if (params.filtro_sla === "warning") {
        processed = processed.filter((c) => c.sla.status === "warning");
      } else if (params.filtro_sla === "ok") {
        processed = processed.filter((c) => c.sla.status === "ok");
      } else if (params.filtro_sla === "waiting") {
        processed = processed.filter((c) => c.sla.aguardando_resposta);
      }

      const finalResults = processed.slice(0, limit);

      return {
        success: true,
        message: `${finalResults.length} conversa(s) encontrada(s).`,
        data: finalResults,
      };
    },
  },

  // ─── Consultar histórico de uma conversa ──────────────────────────────────
  {
    name: "consultar_conversa",
    label: "Consultar Histórico de Conversa",
    description:
      "Recupera as mensagens trocadas em uma conversa/atendimento específico. Retorna até 25 mensagens recentes.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID (UUID) da conversa." },
        limite_mensagens: {
          type: "number",
          description: "Número de mensagens a retornar (padrão 25, máx 50).",
          default: 25,
        },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const msgLimit = Math.min(Math.max(Number(params.limite_mensagens) || 25, 1), 50);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, unit_id, contacts!inner(id, name, phone, company_id), units(name)",
        )
        .eq("id", params.conversa_id)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      const { data: messages, error: msgErr } = await supabaseAdmin
        .from("messages")
        .select("id, sender_type, content, media_type, created_at")
        .eq("conversation_id", params.conversa_id)
        .order("created_at", { ascending: false })
        .limit(msgLimit);

      if (msgErr) return { success: false, message: `Erro ao buscar mensagens: ${msgErr.message}` };

      const sorted = (messages || []).reverse().map((m: any) => ({
        id: m.id,
        remetente:
          m.sender_type === "contact"
            ? "Cliente"
            : m.sender_type === "system"
              ? "Sistema"
              : "Atendente",
        conteudo: m.content || `[${m.media_type}]`,
        tipo_midia: m.media_type,
        data_hora: m.created_at,
      }));

      return {
        success: true,
        message: `${sorted.length} mensagem(ns) da conversa.`,
        data: {
          conversa_id: conv.id,
          status: conv.status,
          canal: conv.channel,
          contato: { nome: (conv.contacts as any)?.name, telefone: (conv.contacts as any)?.phone },
          unidade: (conv.units as any)?.name || null,
          mensagens: sorted,
        },
      };
    },
  },

  {
    name: "enviar_mensagem_conversa",
    label: "Enviar Mensagem em Conversa",
    description:
      "Envia uma mensagem de texto ou mídia (imagem, áudio, vídeo, documento) em uma conversa já existente.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID da conversa onde a mensagem será enviada.",
        },
        mensagem: {
          type: "string",
          description: "Texto da mensagem ou legenda da mídia a ser enviada.",
        },
        tipo_midia: {
          type: "string",
          enum: ["text", "image", "video", "audio", "document"],
          description:
            "Tipo de conteúdo: 'text' (padrão), 'image', 'video', 'audio' ou 'document'.",
          default: "text",
        },
        url_midia: { type: "string", description: "URL pública da mídia (opcional)." },
        arquivo_base64: { type: "string", description: "Arquivo codificado em base64 (opcional)." },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const convId = params.conversa_id;
      const text = params.mensagem ? String(params.mensagem).trim() : "";
      let mediaType = params.tipo_midia || "text";
      const mediaUrl = params.url_midia ? String(params.url_midia).trim() : "";
      const base64Input = params.arquivo_base64 ? String(params.arquivo_base64).trim() : "";

      if (mediaUrl || base64Input) {
        if (mediaType === "text") {
          mediaType = mediaUrl ? detectMediaType(mediaUrl) : detectMediaTypeFromBase64(base64Input);
        }
      }

      if (mediaType === "text" && !text) {
        return {
          success: false,
          message: "O texto da mensagem é obrigatório quando nenhuma mídia for informada.",
        };
      }

      const mediaPayload = formatMediaPayload(mediaUrl, base64Input, mediaType);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, status, contact_id, unit_id, contacts!inner(id, name, company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      try {
        await sendPlatformMessage({
          conversationId: convId,
          text: text || undefined,
          mediaType: mediaType !== "text" ? mediaType : undefined,
          mediaBase64: mediaPayload || undefined,
          senderType: "agent",
          senderId: context.userId,
        });

        return {
          success: true,
          message:
            mediaType !== "text"
              ? `Mídia (${mediaType}) enviada para ${(conv.contacts as any)?.name}! 📎`
              : `Mensagem enviada para ${(conv.contacts as any)?.name}! ✅`,
          data: { conversa_id: convId, tipo_midia: mediaType },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Erro ao enviar: ${err?.message || "Erro desconhecido"}`,
        };
      }
    },
  },

  // ─── Enviar mensagem WhatsApp (compatibilidade MCP) ──────────────────────
  {
    name: "enviar_mensagem_whatsapp",
    label: "Enviar Mensagem WhatsApp",
    description:
      "Envia uma mensagem de texto ou arquivo de mídia (imagem, vídeo, áudio, PDF) para o cliente pelo WhatsApp ou Instagram Direct da conversa selecionada.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID (UUID) da conversa." },
        mensagem: { type: "string", description: "Texto da mensagem ou legenda da mídia." },
        tipo_midia: {
          type: "string",
          enum: ["text", "image", "video", "audio", "document"],
          description:
            "Tipo de mensagem: 'text', 'image', 'video', 'audio' ou 'document'. Padrão: 'text'.",
          default: "text",
        },
        url_midia: {
          type: "string",
          description: "URL pública direta da imagem, vídeo, áudio ou documento.",
        },
        arquivo_base64: { type: "string", description: "Arquivo codificado em Base64." },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const convId = params.conversa_id;
      const text = params.mensagem ? String(params.mensagem).trim() : "";
      let mediaType = params.tipo_midia || "text";
      const mediaUrl = params.url_midia ? String(params.url_midia).trim() : "";
      const base64Input = params.arquivo_base64 ? String(params.arquivo_base64).trim() : "";

      if (mediaUrl || base64Input) {
        if (mediaType === "text") {
          mediaType = mediaUrl ? detectMediaType(mediaUrl) : detectMediaTypeFromBase64(base64Input);
        }
      }

      if (mediaType === "text" && !text) {
        return {
          success: false,
          message: "O texto da mensagem é obrigatório quando nenhuma mídia for informada.",
        };
      }

      const mediaPayload = formatMediaPayload(mediaUrl, base64Input, mediaType);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, status, contact_id, unit_id, contacts!inner(id, name, company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      try {
        await sendPlatformMessage({
          conversationId: convId,
          text: text || undefined,
          mediaType: mediaType !== "text" ? mediaType : undefined,
          mediaBase64: mediaPayload || undefined,
          senderType: "agent",
          senderId: context.userId,
        });

        return {
          success: true,
          message:
            mediaType !== "text"
              ? `Mídia (${mediaType}) enviada para ${(conv.contacts as any)?.name}! 📎`
              : `Mensagem enviada com sucesso para ${(conv.contacts as any)?.name}! ✅`,
          data: { conversa_id: convId, tipo_midia: mediaType },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Erro ao enviar mensagem: ${err?.message || "Erro desconhecido"}`,
        };
      }
    },
  },

  // ─── Enviar arquivo de mídia via WhatsApp ─────────────────────────────────
  {
    name: "enviar_midia_whatsapp",
    label: "Enviar Mídia via WhatsApp",
    description:
      "Envia um arquivo de mídia (imagem, vídeo, áudio de voz ou documento/PDF) com legenda opcional para o cliente pelo WhatsApp ou Instagram Direct.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID (UUID) da conversa ativa." },
        tipo_midia: {
          type: "string",
          enum: ["image", "video", "audio", "document"],
          description: "Tipo da mídia a ser enviada: 'image', 'video', 'audio' ou 'document'.",
        },
        url_midia: { type: "string", description: "URL pública direta do arquivo na internet." },
        arquivo_base64: {
          type: "string",
          description: "Conteúdo do arquivo codificado em Base64.",
        },
        legenda: {
          type: "string",
          description: "Texto de legenda/comentário que acompanhará a mídia.",
        },
      },
      required: ["conversa_id", "tipo_midia"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const convId = params.conversa_id;
      const mediaType = params.tipo_midia;
      const caption = params.legenda ? String(params.legenda).trim() : "";
      const mediaUrl = params.url_midia ? String(params.url_midia).trim() : "";
      const base64Input = params.arquivo_base64 ? String(params.arquivo_base64).trim() : "";

      if (!mediaUrl && !base64Input) {
        return {
          success: false,
          message: "É obrigatório informar 'url_midia' ou 'arquivo_base64' para enviar uma mídia.",
        };
      }

      if (!["image", "video", "audio", "document"].includes(mediaType)) {
        return {
          success: false,
          message: "Tipo de mídia inválido. Escolha entre: 'image', 'video', 'audio', 'document'.",
        };
      }

      const mediaPayload = formatMediaPayload(mediaUrl, base64Input, mediaType);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, status, contact_id, unit_id, contacts!inner(id, name, company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      try {
        await sendPlatformMessage({
          conversationId: convId,
          text: caption || undefined,
          mediaType,
          mediaBase64: mediaPayload || undefined,
          senderType: "agent",
          senderId: context.userId,
        });

        return {
          success: true,
          message: `Mídia (${mediaType}) enviada para ${(conv.contacts as any)?.name} com sucesso! 📎`,
          data: { conversa_id: convId, tipo_midia: mediaType },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Erro ao enviar mídia: ${err?.message || "Erro desconhecido"}`,
        };
      }
    },
  },

  // ─── Enviar mensagem proativa ─────────────────────────────────────────────
  {
    name: "enviar_mensagem_proativa",
    label: "Enviar Mensagem Proativa via WhatsApp",
    description:
      "Envia mensagem pelo WhatsApp para um contato ou número de telefone usando uma instância específica. Se já existir conversa aberta usa ela; caso contrário cria uma nova. Se você não souber o telefone do contato, passe o nome_contato ou contato_id para o sistema buscar o número real no cadastro. NUNCA invente números de telefone fictícios. Sempre chame listar_instancias_whatsapp antes.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        telefone: {
          type: "string",
          description:
            "Número de telefone do destinatário com DDD (somente dígitos). Opcional se passar nome_contato ou contato_id.",
        },
        contato_id: {
          type: "string",
          description: "UUID do contato no CRM para buscar o telefone automaticamente.",
        },
        nome_contato: {
          type: "string",
          description:
            "Nome do contato solicitado pelo usuário (ex: 'Rian Geraldo'). SEMPRE informe este campo quando o usuário tiver citado um nome, para validação de segurança contra envio acidental para pessoa errada.",
        },
        confirmado: {
          type: "boolean",
          description:
            "Defina como true se o usuário já confirmou expressamente o envio caso o nome do contato cadastrado seja diferente do solicitado.",
        },
        mensagem: { type: "string", description: "Texto da mensagem a ser enviada." },
        instance_name: {
          type: "string",
          description:
            "Nome da instância WhatsApp. Use listar_instancias_whatsapp para ver as disponíveis.",
        },
      },
      required: ["mensagem", "instance_name"],
    },
    execute: async (params: any, context: CopilotContext) => {
      // 1. Resolução segura de telefone e contato
      let rawPhone = params.telefone ? String(params.telefone).replace(/\D/g, "") : "";

      // Se o LLM passou telefone em contato_id ou nome_contato
      if (!rawPhone && params.contato_id) {
        const idDigits = String(params.contato_id).replace(/\D/g, "");
        if (idDigits.length >= 8) rawPhone = idDigits;
      }
      if (!rawPhone && params.nome_contato) {
        const nameDigits = String(params.nome_contato).replace(/\D/g, "");
        if (nameDigits.length >= 8) rawPhone = nameDigits;
      }

      // Bloquear números genéricos de teste ou vazios
      const isFakeOrGenericPhone =
        !rawPhone ||
        rawPhone === "5527999999999" ||
        rawPhone === "27999999999" ||
        rawPhone === "5511999999999" ||
        rawPhone.length < 8 ||
        /^55\d{2}999999999$/.test(rawPhone);

      let targetContact: any = null;

      if (isFakeOrGenericPhone || params.contato_id || params.nome_contato) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // A. Se contato_id foi fornecido como UUID
        if (params.contato_id && uuidRegex.test(params.contato_id)) {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .select("id, name, phone, merged_into_id")
            .eq("id", params.contato_id)
            .eq("company_id", context.companyId)
            .maybeSingle();
          if (c) targetContact = c;
        }

        // B. Se contato_id for um nome ou se nome_contato foi fornecido
        const searchName =
          !targetContact && params.contato_id && !uuidRegex.test(params.contato_id)
            ? params.contato_id
            : params.nome_contato;

        if (!targetContact && searchName) {
          const sTrim = String(searchName).trim();
          const sLower = sTrim.toLowerCase();
          const searchVariants: string[] = [`name.ilike.%${sTrim}%`];

          if (sLower.includes("rian")) {
            searchVariants.push(`name.ilike.%${sLower.replace(/rian/gi, "rhian")}%`);
            searchVariants.push(`name.ilike.%${sLower.replace(/rian/gi, "ryan")}%`);
          } else if (sLower.includes("rhian")) {
            searchVariants.push(`name.ilike.%${sLower.replace(/rhian/gi, "rian")}%`);
            searchVariants.push(`name.ilike.%${sLower.replace(/rhian/gi, "ryan")}%`);
          }

          const sDigits = sLower.replace(/\D/g, "");
          if (sDigits.length >= 8) {
            searchVariants.push(`phone.ilike.%${sDigits}%`);
          }

          const { data: list } = await supabaseAdmin
            .from("contacts")
            .select("id, name, phone, merged_into_id")
            .eq("company_id", context.companyId)
            .or(Array.from(new Set(searchVariants)).join(","))
            .order("phone", { ascending: false, nullsFirst: false })
            .limit(10);

          if (list && list.length > 0) {
            const withPhone = list.filter((c: any) => c.phone);
            targetContact = withPhone.length > 0 ? withPhone[0] : list[0];
          }
        }

        // C. Se o contato estiver mesclado e sem telefone, buscar do contato principal
        if (targetContact && !targetContact.phone && targetContact.merged_into_id) {
          const { data: parent } = await supabaseAdmin
            .from("contacts")
            .select("id, name, phone")
            .eq("id", targetContact.merged_into_id)
            .maybeSingle();
          if (parent?.phone) targetContact.phone = parent.phone;
        }

        if (targetContact?.phone) {
          rawPhone = String(targetContact.phone).replace(/\D/g, "");
        } else if (isFakeOrGenericPhone) {
          return {
            success: false,
            message: `Não foi possível encontrar um telefone válido para ${searchName || targetContact?.name || "o contato"}. Por favor, informe o número com DDD.`,
          };
        }
      }

      // Busca tolerante: tenta instance_name exato, depois por nome ou instance_name parcial
      let { data: instance, error: instErr } = await supabaseAdmin
        .from("whatsapp_instances")
        .select(
          "id, name, instance_name, evogo_api_key, custom_host, unit_id, companies(evogo_host)",
        )
        .eq("company_id", context.companyId)
        .eq("instance_name", params.instance_name)
        .maybeSingle();

      if (!instance) {
        // Fallback: busca por nome amigável ou instance_name parcial
        const { data: fallback } = await supabaseAdmin
          .from("whatsapp_instances")
          .select(
            "id, name, instance_name, evogo_api_key, custom_host, unit_id, companies(evogo_host)",
          )
          .eq("company_id", context.companyId)
          .or(`name.ilike.%${params.instance_name}%,instance_name.ilike.%${params.instance_name}%`)
          .order("name", { ascending: true })
          .limit(1)
          .maybeSingle();
        instance = fallback;
        instErr = null;
      }

      if (instErr || !instance) {
        return {
          success: false,
          message: `Instância "${params.instance_name}" não encontrada. Use listar_instancias_whatsapp para ver as disponíveis.`,
        };
      }

      const host = (instance as any).custom_host || (instance.companies as any)?.evogo_host;
      const token = instance.evogo_api_key;
      const instanceName = instance.instance_name;
      const unitId = instance.unit_id || null;

      if (!host || !token) {
        return {
          success: false,
          message: `A instância "${instance.name}" não está completamente configurada.`,
        };
      }

      if (!rawPhone.startsWith("55")) rawPhone = "55" + rawPhone;

      const phoneVariants = [rawPhone, rawPhone.replace(/^55/, "")];
      const { data: existingContacts } = await supabaseAdmin
        .from("contacts")
        .select("id, name, merged_into_id")
        .eq("company_id", context.companyId)
        .in("phone", phoneVariants);

      let contactId: string;
      let contactName: string;

      if (targetContact) {
        contactId = targetContact.merged_into_id || targetContact.id;
        contactName = targetContact.name;
      } else if (existingContacts && existingContacts.length > 0) {
        const c = existingContacts[0];
        contactId = c.merged_into_id || c.id;
        contactName = c.name;
      } else {
        const { data: newContact, error: contactErr } = await supabaseAdmin
          .from("contacts")
          .insert({ company_id: context.companyId, name: rawPhone, phone: rawPhone })
          .select("id, name")
          .single();

        if (contactErr || !newContact) return { success: false, message: "Erro ao criar contato." };
        contactId = newContact.id;
        contactName = newContact.name;
      }

      // Validação de segurança: se o usuário pediu um nome e o contato cadastrado tiver nome divergente
      const requestedName = params.nome_contato ? String(params.nome_contato).trim() : "";
      if (requestedName && contactName && !params.confirmado) {
        const cleanReq = requestedName.toLowerCase();
        const cleanFound = contactName.toLowerCase();

        // Extrai palavras com 3 ou mais letras para tolerar grafias parciais
        const reqWords = cleanReq.split(/[\s,.-]+/).filter((w: string) => w.length >= 3);
        const foundWords = cleanFound.split(/[\s,.-]+/).filter((w: string) => w.length >= 3);

        const hasOverlap =
          reqWords.some((w: string) => cleanFound.includes(w)) ||
          foundWords.some((w: string) => cleanReq.includes(w));

        if (!hasOverlap) {
          return {
            success: false,
            message: `⚠️ Confirmação mandatória necessária: O número de WhatsApp (${rawPhone}) está cadastrado no sistema como "${contactName}", que é diferente do nome solicitado "${requestedName}". NÃO envie a mensagem diretamente. Pergunte ao usuário se ele confirma o envio para "${contactName}" (${rawPhone}). Se ele confirmar expressamente, chame novamente com confirmado: true.`,
            data: {
              contato_encontrado: contactName,
              contato_solicitado: requestedName,
              telefone: rawPhone,
              requer_confirmacao: true,
            },
          };
        }
      }

      const { data: latestConvs } = await supabaseAdmin
        .from("conversations")
        .select("id, status")
        .eq("contact_id", contactId)
        .eq("whatsapp_instance_id", instance.id)
        .in("status", ["active", "waiting"])
        .order("last_message_at", { ascending: false })
        .limit(1);

      let conversationId: string;

      if (latestConvs && latestConvs.length > 0) {
        conversationId = latestConvs[0].id;
        await supabaseAdmin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString(), assigned_agent_id: context.userId })
          .eq("id", conversationId);
      } else {
        const { data: newConv, error: convErr } = await supabaseAdmin
          .from("conversations")
          .insert({
            unit_id: unitId,
            contact_id: contactId,
            channel: "whatsapp",
            status: "active",
            whatsapp_instance_id: instance.id,
            last_message_at: new Date().toISOString(),
            assigned_agent_id: context.userId,
          })
          .select("id")
          .single();

        if (convErr || !newConv) return { success: false, message: "Erro ao criar conversa." };
        conversationId = newConv.id;
      }

      const texto = params.mensagem.trim();
      try {
        console.log(
          `[CopilotEnviarMensagem] host=${host} instanceName=${instanceName} phone=${rawPhone}`,
        );
        await sendEvogoText({ host, token, instanceName, number: rawPhone, text: texto });
      } catch (err: any) {
        const detail = err?.message || "Erro desconhecido";
        console.error(`[CopilotEnviarMensagem] Falha ao enviar: ${detail}`, {
          host,
          instanceName,
          rawPhone,
        });
        return {
          success: false,
          message: `Erro ao enviar via WhatsApp pela instância "${instance.name}": ${detail}`,
        };
      }

      await supabaseAdmin.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "agent",
        sender_id: context.userId,
        content: texto,
        message_type: "text",
        sent_at: new Date().toISOString(),
      });

      return {
        success: true,
        message: `✅ Mensagem enviada para ${contactName} via instância "${instance.name}"!`,
        data: {
          conversa_id: conversationId,
          contato: contactName,
          telefone: rawPhone,
          instancia: instance.name,
        },
      };
    },
  },

  // ─── Buscar conversas de um contato ──────────────────────────────────────
  {
    name: "buscar_conversas_contato",
    label: "Buscar Conversas de um Contato",
    description:
      "Busca conversas abertas ou recentes de um contato pelo ID. Útil para encontrar o ID da conversa antes de enviar mensagem ou nota interna.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID do contato." },
        apenas_abertas: {
          type: "boolean",
          description: "Se true (padrão), retorna apenas ativas/aguardando.",
        },
      },
      required: ["contato_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .maybeSingle();

      if (!contact) return { success: false, message: "Contato não encontrado." };

      const apenasAbertas = params.apenas_abertas !== false;

      let query = supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, whatsapp_instance_id, unit_id, last_message_at, unit:units(name), instance:whatsapp_instances(id, name, instance_name)",
        )
        .eq("contact_id", params.contato_id)
        .order("last_message_at", { ascending: false })
        .limit(10);

      if (apenasAbertas) query = query.in("status", ["active", "waiting"]);

      const { data: convs, error } = await query;
      if (error) return { success: false, message: `Erro: ${error.message}` };

      const result = (convs || []).map((c: any) => ({
        id: c.id,
        status: c.status,
        canal: c.channel,
        instancia: (c.instance as any)?.name || null,
        instance_name: (c.instance as any)?.instance_name || null,
        whatsapp_instance_id: c.whatsapp_instance_id,
        unidade: (c.unit as any)?.name || null,
        ultima_mensagem: c.last_message_at,
      }));

      return {
        success: true,
        message: `${result.length} conversa(s) de ${contact.name}.`,
        data: result,
      };
    },
  },

  // ─── Adicionar nota interna à conversa ───────────────────────────────────
  {
    name: "adicionar_nota_interna",
    label: "Adicionar Nota Interna na Conversa",
    description:
      "Insere uma nota interna nos bastidores da conversa. Visível para a equipe, mas invisível para o cliente no WhatsApp/Instagram.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID da conversa." },
        conteudo: { type: "string", description: "Texto da nota interna." },
      },
      required: ["conversa_id", "conteudo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)")
        .eq("id", params.conversa_id)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      const content = String(params.conteudo).trim();
      const { error } = await supabaseAdmin.from("messages").insert({
        conversation_id: params.conversa_id,
        sender_type: "agent",
        content,
        is_internal: true,
        media_type: "text",
      });

      if (error) return { success: false, message: `Erro ao salvar nota: ${error.message}` };

      return {
        success: true,
        message: "Nota interna adicionada à conversa! (Visível apenas para a equipe)",
      };
    },
  },

  // ─── Assumir conversa ─────────────────────────────────────────────────────
  {
    name: "assumir_conversa",
    label: "Assumir ou Atribuir Conversa",
    description:
      "Atribui a conversa a um atendente humano específico ou ativa o agente de IA. Use para pegar uma conversa da fila ou reatribuir a outro atendente.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID da conversa." },
        atendente_id: { type: "string", description: "ID do atendente que assumirá (opcional)." },
        ativar_ia: {
          type: "boolean",
          description: "Se true, ativa o agente de IA.",
          default: false,
        },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)")
        .eq("id", params.conversa_id)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      const updatePayload: any = { status: "active" };
      if (params.ativar_ia) {
        updatePayload.ai_active = true;
      } else {
        updatePayload.ai_active = false;
        updatePayload.assigned_agent_id = params.atendente_id || context.userId;
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", params.conversa_id);

      if (error) return { success: false, message: `Erro: ${error.message}` };

      return {
        success: true,
        message: params.ativar_ia
          ? "Conversa ativada para o Agente de IA!"
          : `Conversa assumida com sucesso! ✅`,
      };
    },
  },

  // ─── Transferir conversa ──────────────────────────────────────────────────
  {
    name: "transferir_conversa",
    label: "Transferir Conversa",
    description: "Transfere o atendimento para outro departamento, atendente ou unidade.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID da conversa." },
        tipo_destino: {
          type: "string",
          enum: ["departamento", "atendente", "unidade"],
          description: "Tipo do destino da transferência.",
        },
        destino_id: { type: "string", description: "ID do departamento, atendente ou unidade." },
      },
      required: ["conversa_id", "tipo_destino", "destino_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)")
        .eq("id", params.conversa_id)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      const updatePayload: any = {};
      if (params.tipo_destino === "departamento") {
        updatePayload.department_id = params.destino_id;
        updatePayload.status = "waiting";
        updatePayload.assigned_agent_id = null;
      } else if (params.tipo_destino === "atendente") {
        updatePayload.assigned_agent_id = params.destino_id;
        updatePayload.status = "active";
      } else if (params.tipo_destino === "unidade") {
        updatePayload.unit_id = params.destino_id;
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", params.conversa_id);

      if (error) return { success: false, message: `Erro: ${error.message}` };

      return {
        success: true,
        message: `Conversa transferida para ${params.tipo_destino} com sucesso! 🔀`,
      };
    },
  },

  // ─── Listar motivos de encerramento ──────────────────────────────────────
  {
    name: "listar_motivos_encerramento",
    label: "Listar Motivos de Encerramento",
    description: "Lista os motivos de finalização de atendimento cadastrados na empresa.",
    minRole: "agent",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (_params: any, context: CopilotContext) => {
      const { data, error } = await supabaseAdmin
        .from("resolution_reasons")
        .select("id, label, order, active")
        .eq("company_id", context.companyId)
        .order("order", { ascending: true });

      if (error) return { success: false, message: `Erro: ${error.message}` };

      return {
        success: true,
        message: `${data?.length || 0} motivo(s) cadastrado(s).`,
        data: (data || []).map((r: any) => ({
          id: r.id,
          nome: r.label,
          ordem: r.order,
          ativo: r.active,
        })),
      };
    },
  },

  // ─── Encerrar atendimento ─────────────────────────────────────────────────
  {
    name: "encerrar_atendimento",
    label: "Encerrar Atendimento",
    description:
      "Encerra uma conversa, marcando como resolvida. Pode registrar o motivo de encerramento e uma observação final.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        conversa_id: { type: "string", description: "ID da conversa a encerrar." },
        motivo_id: {
          type: "string",
          description: "ID do motivo de encerramento (use listar_motivos_encerramento). Opcional.",
        },
        observacao: {
          type: "string",
          description: "Observação final sobre o atendimento. Opcional.",
        },
      },
      required: ["conversa_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, contacts!inner(company_id)")
        .eq("id", params.conversa_id)
        .single();

      if (convErr || !conv || (conv.contacts as any)?.company_id !== context.companyId) {
        return { success: false, message: "Conversa não encontrada ou acesso negado." };
      }

      const resolvedAt = new Date().toISOString();
      const updatePayload: any = {
        status: "resolved",
        resolved_at: resolvedAt,
        current_session_id: null,
        assigned_agent_id: null,
      };

      if (params.motivo_id) updatePayload.resolution_reason_id = params.motivo_id;

      const { error: updErr } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", params.conversa_id);

      if (updErr) return { success: false, message: `Erro ao encerrar: ${updErr.message}` };

      // Salvar sessão como resolvida
      await supabaseAdmin
        .from("conversation_sessions")
        .update({ resolved_at: resolvedAt })
        .eq("conversation_id", params.conversa_id)
        .is("resolved_at", null);

      // Salvar observação como nota interna
      if (params.observacao) {
        await supabaseAdmin.from("messages").insert({
          conversation_id: params.conversa_id,
          sender_type: "agent",
          content: String(params.observacao).trim(),
          is_internal: true,
          media_type: "text",
        });
      }

      return {
        success: true,
        message: "Atendimento encerrado com sucesso! ✅",
        data: { conversa_id: params.conversa_id, encerrado_em: resolvedAt },
      };
    },
  },
];
