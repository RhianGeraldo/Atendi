/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyTransferReceiver } from "@/lib/server/transfer-notifications";
import { loadSlaLastMessages } from "@/lib/server/sla-last-message";
import { sendPlatformMessage } from "@/lib/server/message-sender";
import {
  calculateConversationSla,
  DEFAULT_SLA_SETTINGS,
  formatMinutesFriendly,
  type SlaSettings,
} from "@/lib/sla";
import type { McpContext, McpToolDefinition } from "../types";

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
  mediaUrl?: string,
  base64Input?: string,
  mediaType: string = "image",
): string {
  if (mediaUrl && mediaUrl.trim()) {
    return mediaUrl.trim();
  }
  if (base64Input && base64Input.trim()) {
    const trimmed = base64Input.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("data:")) {
      return trimmed;
    }
    let mime = "image/jpeg";
    if (mediaType === "video") mime = "video/mp4";
    else if (mediaType === "audio") mime = "audio/ogg";
    else if (mediaType === "document") mime = "application/pdf";
    return `data:${mime};base64,${trimmed}`;
  }
  return "";
}

/** Última mensagem do SLA em blocos de 200 conversas, para não abrir centenas de consultas juntas. */
async function loadSlaLastMessagesInBatches(convIds: string[]) {
  const merged: Awaited<ReturnType<typeof loadSlaLastMessages>> = new Map();
  for (let i = 0; i < convIds.length; i += 200) {
    const part = await loadSlaLastMessages(convIds.slice(i, i + 200));
    for (const [id, msg] of part) merged.set(id, msg);
  }
  return merged;
}

/** Conversas abertas com a última mensagem do cliente (mesma função da tela de atendimento). */
async function loadAwaitingReplyIds(companyId: string, unitId?: string | null): Promise<string[]> {
  const { data, error } = await (supabaseAdmin as any).rpc("conversations_awaiting_reply", {
    p_company_id: companyId,
    p_unit_id: unitId || null,
  });
  if (error) throw new Error(`Erro ao buscar conversas esperando resposta: ${error.message}`);
  return ((data || []) as { conversation_id: string }[]).map((a) => a.conversation_id);
}

async function loadSlaSettings(companyId: string): Promise<SlaSettings> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("custom_variables")
    .eq("id", companyId)
    .single();
  const customVars = (company?.custom_variables as Record<string, any>) || {};
  return { ...DEFAULT_SLA_SETTINGS, ...(customVars.sla || {}) };
}

const isGroupPhone = (phone: string) =>
  phone.startsWith("120363") || (phone.includes("-") && phone.length > 18);

export const conversationsTools: McpToolDefinition[] = [
  {
    name: "listar_conversas",
    description:
      "Lista as conversas/atendimentos de WhatsApp e Instagram da empresa ou filial, com status, SLA em tempo real, última mensagem e filtros avançados.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Status da conversa: 'all', 'waiting' (aguardando), 'active' (em atendimento), 'resolved' (resolvida/finalizada). Padrão: 'active'.",
          enum: ["all", "waiting", "active", "resolved"],
          default: "active",
        },
        filtro_sla: {
          type: "string",
          description:
            "Filtrar por situação do SLA de resposta: 'all', 'breached' (SLA estourado/atrasado), 'warning' (em alerta/próximo de estourar), 'ok' (dentro do prazo), 'waiting' (cliente aguardando resposta).",
          enum: ["all", "breached", "warning", "ok", "waiting"],
          default: "all",
        },
        ignorar_grupos: {
          type: "boolean",
          description:
            "Se true, oculta conversas de grupos de WhatsApp, focando apenas em conversas 1:1 com clientes. Padrão: true.",
          default: true,
        },
        canal: {
          type: "string",
          description:
            "Canal da conversa: 'all', 'whatsapp', 'instagram', 'messenger'. Padrão: 'all'.",
          enum: ["all", "whatsapp", "instagram", "messenger"],
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade/filial para filtrar. Opcional para chave Matriz.",
        },
        busca: {
          type: "string",
          description: "Buscar por nome do contato ou telefone.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima a retornar (padrão 20, máx 50).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 50);
      const targetStatus = args?.status || "active";
      const targetUnitId = context.unitId || args?.unidade_id;
      const ignoreGroups = args?.ignorar_grupos !== false;
      const slaFilter = args?.filtro_sla || "all";

      // 1. Obter configurações de SLA da empresa
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      const customVars = (company?.custom_variables as Record<string, any>) || {};
      const slaSettings: SlaSettings = {
        ...DEFAULT_SLA_SETTINGS,
        ...(customVars.sla || {}),
      };

      const buildQuery = () => {
        let query = supabaseAdmin
          .from("conversations")
          .select(
            `
          id,
          status,
          channel,
          last_message_at,
          last_message_preview,
          started_at,
          unread_count,
          ai_active,
          unit_id,
          contacts!inner(id, name, phone, company_id, source, source_details),
          units(name, slug),
          profiles!conversations_assigned_agent_id_fkey(name)
        `,
          )
          .eq("contacts.company_id", context.companyId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true });

        if (targetStatus !== "all") {
          query = query.eq("status", targetStatus);
        }

        if (targetUnitId) {
          query = query.eq("unit_id", targetUnitId);
        }

        if (args?.canal && args.canal !== "all") {
          query = query.eq("channel", args.canal);
        }

        if (args?.busca && typeof args.busca === "string" && args.busca.trim()) {
          const term = args.busca.trim();
          query = query.or(`contacts.name.ilike.%${term}%,contacts.phone.ilike.%${term}%`);
        }
        return query;
      };

      // Todo filtro de SLA exige cliente esperando resposta: busca só essas conversas (todas,
      // não só as mais recentes, porque as mais atrasadas têm a última mensagem mais antiga)
      let convs: any[] = [];
      if (slaFilter !== "all") {
        const awaitingIds = await loadAwaitingReplyIds(context.companyId, targetUnitId);
        for (let i = 0; i < awaitingIds.length; i += 100) {
          const { data, error } = await buildQuery().in("id", awaitingIds.slice(i, i + 100));
          if (error) throw new Error(`Erro ao listar conversas: ${error.message}`);
          convs.push(...(data || []));
        }
      } else {
        const { data, error } = await buildQuery().limit(limit * 2);
        if (error) throw new Error(`Erro ao listar conversas: ${error.message}`);
        convs = data || [];
      }

      const slaLastByConv = await loadSlaLastMessagesInBatches((convs || []).map((c: any) => c.id));

      let processed = (convs || []).map((c: any) => {
        const slaLast = slaLastByConv.get(c.id);
        const contactPhone = c.contacts?.phone || "";
        const isGroup =
          contactPhone.startsWith("120363") ||
          (contactPhone.includes("-") && contactPhone.length > 18);

        // Adaptação para o calculador de SLA
        const convRowForSla: any = {
          id: c.id,
          channel: c.channel,
          status: c.status,
          last_message: slaLast ? [slaLast] : [],
          last_message_at: c.last_message_at,
          last_message_preview: c.last_message_preview,
          started_at: c.started_at,
          contact: {
            ...c.contacts,
            phone: contactPhone,
          },
        };

        const slaInfo = calculateConversationSla(convRowForSla, slaSettings);

        return {
          id: c.id,
          status: c.status,
          canal: c.channel,
          is_grupo: isGroup,
          contato: {
            id: c.contacts?.id,
            nome: c.contacts?.name,
            telefone: c.contacts?.phone,
            origem: c.contacts?.source || null,
            detalhes_origem: c.contacts?.source_details || null,
          },
          unidade: c.units?.name || "Geral",
          atendente: c.profiles?.name || (c.ai_active ? "IA Atendi" : "Não atribuído"),
          ultima_mensagem: c.last_message_preview || null,
          ultima_mensagem_de: slaLast
            ? slaLast.sender_type === "contact"
              ? "contato"
              : "atendente"
            : null,
          data_ultima_mensagem: c.last_message_at,
          nao_lidas: c.unread_count || 0,
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

      if (ignoreGroups) {
        processed = processed.filter((c) => !c.is_grupo);
      }

      if (slaFilter === "breached") {
        processed = processed.filter((c) => c.sla.status === "breached");
      } else if (slaFilter === "warning") {
        processed = processed.filter((c) => c.sla.status === "warning");
      } else if (slaFilter === "ok") {
        processed = processed.filter((c) => c.sla.status === "ok");
      } else if (slaFilter === "waiting") {
        processed = processed.filter((c) => c.sla.aguardando_resposta);
      }

      // Com filtro de SLA, quem espera há mais tempo vem primeiro (como na tela de conversas)
      if (slaFilter !== "all") {
        processed = [...processed].sort((a, b) => b.sla.minutos_espera - a.sla.minutos_espera);
      }

      const finalResults = processed.slice(0, limit);

      return {
        total: finalResults.length,
        conversas: finalResults,
      };
    },
  },
  {
    name: "listar_clientes_aguardando_resposta",
    description:
      "Clientes esperando resposta: olha TODAS as conversas abertas (aguardando e em andamento) e traz as que têm a última mensagem do cliente sem resposta, com tempo de espera, SLA (estourado/alerta/no prazo), atendente, departamento e unidade. Traz também o resumo por atendente e por unidade. Use para cobrar a equipe ou priorizar quem responder.",
    security: {
      requiredMenu: "conversations",
      minRole: "manager",
    },
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "'abertas' (padrão: aguardando + em andamento), 'waiting' (aguardando, ainda sem atendente) ou 'active' (em andamento).",
          enum: ["abertas", "waiting", "active"],
          default: "abertas",
        },
        situacao_sla: {
          type: "string",
          description:
            "'atrasadas' (padrão: SLA estourado), 'alerta' (perto de estourar), 'atrasadas_e_alerta' ou 'todas' (todos que aguardam resposta).",
          enum: ["atrasadas", "alerta", "atrasadas_e_alerta", "todas"],
          default: "atrasadas",
        },
        atendente_id: {
          type: "string",
          description:
            "ID (UUID) do atendente responsável. Use 'sem_atendente' para as sem responsável.",
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade. Se omitido em chave Matriz, toda a rede.",
        },
        canal: {
          type: "string",
          description: "Canal: 'all' (padrão), 'whatsapp', 'instagram', 'messenger'.",
          enum: ["all", "whatsapp", "instagram", "messenger"],
        },
        espera_minima_minutos: {
          type: "number",
          description: "Só clientes esperando há pelo menos esse tempo (em minutos).",
        },
        limite: {
          type: "number",
          description: "Máximo de conversas na lista (padrão 30, máx. 100). O resumo conta todas.",
          default: 30,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 30, 1), 100);
      const statuses =
        args?.status === "waiting"
          ? ["waiting"]
          : args?.status === "active"
            ? ["active"]
            : ["waiting", "active"];
      const situacao = args?.situacao_sla || "atrasadas";
      const targetUnitId = context.unitId || args?.unidade_id;
      const minWait = Math.max(Number(args?.espera_minima_minutos) || 0, 0);
      const slaSettings = await loadSlaSettings(context.companyId);

      // Mesma lista da tela de atendimento: conversas abertas com a última mensagem do cliente
      const awaitingIds = await loadAwaitingReplyIds(context.companyId, targetUnitId);

      const convs: any[] = [];
      for (let i = 0; i < awaitingIds.length; i += 100) {
        let query = supabaseAdmin
          .from("conversations")
          .select(
            `id, status, channel, last_message_at, last_message_preview, started_at, unread_count, ai_active, unit_id, assigned_agent_id,
            contacts!inner(id, name, phone, company_id),
            units(name),
            departments(name),
            profiles!conversations_assigned_agent_id_fkey(id, name)`,
          )
          .in("id", awaitingIds.slice(i, i + 100))
          .in("status", statuses as any);
        if (args?.canal && args.canal !== "all") query = query.eq("channel", args.canal);
        if (args?.atendente_id === "sem_atendente") query = query.is("assigned_agent_id", null);
        else if (args?.atendente_id) query = query.eq("assigned_agent_id", args.atendente_id);
        const { data, error } = await query;
        if (error) throw new Error(`Erro ao listar conversas: ${error.message}`);
        convs.push(...(data || []));
      }

      const open = (convs || []).filter((c: any) => !isGroupPhone(c.contacts?.phone || ""));
      const slaLastByConv = await loadSlaLastMessagesInBatches(open.map((c: any) => c.id));

      const waiting = open
        .map((c: any) => {
          const slaLast = slaLastByConv.get(c.id);
          const sla = calculateConversationSla(
            {
              id: c.id,
              channel: c.channel,
              status: c.status,
              last_message: slaLast ? [slaLast] : [],
              last_message_at: c.last_message_at,
              last_message_preview: c.last_message_preview,
              started_at: c.started_at,
              contact: { ...c.contacts, phone: c.contacts?.phone || "" },
            } as any,
            slaSettings,
          );
          return { c, sla };
        })
        .filter(({ sla }) => sla.isWaiting && sla.elapsedMinutes >= minWait);

      const matches = waiting.filter(({ sla }) =>
        situacao === "todas"
          ? true
          : situacao === "alerta"
            ? sla.status === "warning"
            : situacao === "atrasadas_e_alerta"
              ? sla.status === "breached" || sla.status === "warning"
              : sla.status === "breached",
      );
      matches.sort((a, b) => b.sla.elapsedMinutes - a.sla.elapsedMinutes);

      // Resumo por atendente e por unidade (de tudo que bateu no filtro)
      const group = (keyOf: (c: any) => string) => {
        const map = new Map<
          string,
          {
            nome: string;
            total: number;
            atrasadas: number;
            alerta: number;
            maior_espera_minutos: number;
          }
        >();
        for (const { c, sla } of matches) {
          const nome = keyOf(c);
          const row = map.get(nome) || {
            nome,
            total: 0,
            atrasadas: 0,
            alerta: 0,
            maior_espera_minutos: 0,
          };
          row.total += 1;
          if (sla.status === "breached") row.atrasadas += 1;
          if (sla.status === "warning") row.alerta += 1;
          row.maior_espera_minutos = Math.max(row.maior_espera_minutos, sla.elapsedMinutes);
          map.set(nome, row);
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
      };
      const agentName = (c: any) =>
        c.profiles?.name ||
        (c.status === "waiting"
          ? "Aguardando atendente"
          : c.ai_active
            ? "IA Atendi"
            : "Não atribuído");

      return {
        sla_limite_resposta_minutos: slaSettings.response_limit_minutes || 5,
        resumo: {
          aguardando_resposta: waiting.length,
          atrasadas: waiting.filter(({ sla }) => sla.status === "breached").length,
          alerta: waiting.filter(({ sla }) => sla.status === "warning").length,
          no_filtro: matches.length,
          por_atendente: group(agentName),
          por_unidade: group((c) => c.units?.name || "Geral"),
        },
        total_listado: Math.min(limit, matches.length),
        conversas: matches.slice(0, limit).map(({ c, sla }) => ({
          conversa_id: c.id,
          status: c.status,
          canal: c.channel,
          contato: { id: c.contacts?.id, nome: c.contacts?.name, telefone: c.contacts?.phone },
          atendente: agentName(c),
          atendente_id: c.profiles?.id || null,
          departamento: c.departments?.name || null,
          unidade: c.units?.name || "Geral",
          aguardando_desde: sla.waitingSince ? new Date(sla.waitingSince).toISOString() : null,
          espera: formatMinutesFriendly(sla.elapsedMinutes),
          minutos_espera: sla.elapsedMinutes,
          minutos_atraso: sla.overdueMinutes,
          sla: sla.status,
          primeira_resposta: sla.isFirstResponse,
          ultima_mensagem: c.last_message_preview || null,
          nao_lidas: c.unread_count || 0,
        })),
      };
    },
  },
  {
    name: "consultar_conversa",
    description:
      "Recupera o histórico completo de mensagens trocadas em um atendimento específico no WhatsApp ou Instagram.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser consultada.",
        },
        limite_mensagens: {
          type: "number",
          description: "Número de mensagens a retornar do histórico recente (padrão 25, máx 100).",
          default: 25,
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const msgLimit = Math.min(Math.max(Number(args.limite_mensagens) || 25, 1), 100);

      // Verificar permissão da conversa
      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select(
          "id, status, channel, unit_id, ai_active, contacts!inner(id, name, phone, company_id), units(name)",
        )
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // Buscar mensagens
      const { data: messages, error: msgErr } = await supabaseAdmin
        .from("messages")
        .select(
          "id, sender_type, content, media_type, media_url, transcription, created_at, profiles(name)",
        )
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(msgLimit);

      if (msgErr) {
        throw new Error(`Erro ao buscar mensagens: ${msgErr.message}`);
      }

      const sortedMessages = (messages || []).reverse().map((m: any) => ({
        id: m.id,
        remetente:
          m.sender_type === "contact"
            ? "Cliente"
            : m.sender_type === "system"
              ? "Sistema"
              : "Atendente",
        nome_atendente: m.profiles?.name || null,
        conteudo:
          m.content || (m.transcription ? `[Áudio]: ${m.transcription}` : `[${m.media_type}]`),
        tipo_midia: m.media_type,
        data_hora: m.created_at,
      }));

      return {
        conversa_id: conv.id,
        status: conv.status,
        canal: conv.channel,
        contato: {
          id: conv.contacts?.id,
          nome: conv.contacts?.name,
          telefone: conv.contacts?.phone,
        },
        unidade: (conv.units as any)?.name || "Geral",
        total_mensagens: sortedMessages.length,
        mensagens: sortedMessages,
      };
    },
  },
  {
    name: "enviar_mensagem_whatsapp",
    description:
      "Envia uma mensagem de texto ou mídia (imagem, vídeo, áudio, documento) para o cliente pelo WhatsApp ou Instagram Direct da conversa selecionada.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa ativa para enviar a mensagem.",
        },
        mensagem: {
          type: "string",
          description:
            "Texto da mensagem a ser enviada ao cliente ou legenda da mídia. Obrigatório se não enviar mídia.",
        },
        tipo_midia: {
          type: "string",
          description:
            "Tipo da mídia a ser enviada: 'text' (apenas texto), 'image' (imagem/foto), 'video' (vídeo), 'audio' (áudio/mensagem de voz), 'document' (PDF, documento). Padrão: 'text'.",
          enum: ["text", "image", "video", "audio", "document"],
          default: "text",
        },
        url_midia: {
          type: "string",
          description:
            "URL pública direta da imagem, vídeo, áudio ou documento (ex: https://meusite.com/foto.jpg ou link público do Supabase).",
        },
        arquivo_base64: {
          type: "string",
          description:
            "Arquivo codificado em Base64 (com ou sem prefixo 'data:...;base64,'). Útil para enviar mídias geradas ou arquivos locais.",
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const text = args.mensagem ? String(args.mensagem).trim() : "";
      let mediaType = args.tipo_midia || "text";
      const mediaUrl = args.url_midia ? String(args.url_midia).trim() : "";
      const base64Input = args.arquivo_base64 ? String(args.arquivo_base64).trim() : "";

      if (mediaUrl || base64Input) {
        if (mediaType === "text") {
          mediaType = mediaUrl ? detectMediaType(mediaUrl) : detectMediaTypeFromBase64(base64Input);
        }
      }

      if (mediaType === "text" && !text) {
        throw new Error(
          "O texto da mensagem é obrigatório quando nenhuma mídia (url_midia ou arquivo_base64) for informada.",
        );
      }

      const mediaPayload = formatMediaPayload(mediaUrl, base64Input, mediaType);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // Enviar via sendPlatformMessage
      await sendPlatformMessage({
        conversationId: convId,
        text: text || undefined,
        mediaType: mediaType !== "text" ? mediaType : undefined,
        mediaBase64: mediaPayload || undefined,
        senderType: "agent",
      });

      return {
        sucesso: true,
        mensagem:
          mediaType !== "text"
            ? `Mídia (${mediaType}) enviada com sucesso ao cliente!`
            : "Mensagem enviada com sucesso ao cliente!",
        conversa_id: convId,
        tipo_midia: mediaType,
      };
    },
  },
  {
    name: "enviar_midia_whatsapp",
    description:
      "Envia um arquivo de mídia (imagem, vídeo, áudio/mensagem de voz, documento/PDF) com legenda opcional para o cliente pelo WhatsApp ou Instagram Direct.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa ativa para onde a mídia será enviada.",
        },
        tipo_midia: {
          type: "string",
          description:
            "Tipo da mídia a ser enviada: 'image' (fotos/imagens PNG/JPEG/WEBP), 'video' (vídeos MP4), 'audio' (áudios OGG/MP3), 'document' (PDFs, planilhas, arquivos).",
          enum: ["image", "video", "audio", "document"],
        },
        url_midia: {
          type: "string",
          description:
            "URL pública direta do arquivo na internet (ex: https://meusite.com/arquivo.pdf ou https://.../foto.jpg). Obrigatório se não enviar arquivo_base64.",
        },
        arquivo_base64: {
          type: "string",
          description:
            "Conteúdo do arquivo codificado em Base64 (ex: 'data:image/png;base64,iVBORw...' ou string base64 pura). Obrigatório se não enviar url_midia.",
        },
        legenda: {
          type: "string",
          description: "Texto de legenda/comentário que acompanhará a mídia enviada ao cliente.",
        },
      },
      required: ["conversa_id", "tipo_midia"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const mediaType = args.tipo_midia;
      const caption = args.legenda ? String(args.legenda).trim() : "";
      const mediaUrl = args.url_midia ? String(args.url_midia).trim() : "";
      const base64Input = args.arquivo_base64 ? String(args.arquivo_base64).trim() : "";

      if (!mediaUrl && !base64Input) {
        throw new Error(
          "É obrigatório informar 'url_midia' ou 'arquivo_base64' para enviar uma mídia.",
        );
      }

      if (!["image", "video", "audio", "document"].includes(mediaType)) {
        throw new Error(
          "Tipo de mídia inválido. Escolha entre: 'image', 'video', 'audio', 'document'.",
        );
      }

      const mediaPayload = formatMediaPayload(mediaUrl, base64Input, mediaType);

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      await sendPlatformMessage({
        conversationId: convId,
        text: caption || undefined,
        mediaType,
        mediaBase64: mediaPayload,
        senderType: "agent",
      });

      return {
        sucesso: true,
        mensagem: `Arquivo de ${mediaType} enviado com sucesso ao cliente!`,
        conversa_id: convId,
        tipo_midia: mediaType,
      };
    },
  },
  {
    name: "assumir_conversa",
    description:
      "Atribui a conversa a um atendente humano específico ou ativa o agente de IA do Atendi para conduzir o atendimento.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser atribuída.",
        },
        atendente_id: {
          type: "string",
          description: "ID (UUID) do perfil/atendente humano que assumirá a conversa.",
        },
        ativar_ia: {
          type: "boolean",
          description:
            "Se true, ativa o robô/agente de IA do Atendi para atender este cliente. Padrão: false.",
          default: false,
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const updatePayload: any = {
        status: "active",
      };

      if (args.ativar_ia) {
        updatePayload.ai_active = true;
      } else {
        updatePayload.ai_active = false;
        if (args.atendente_id) {
          updatePayload.assigned_agent_id = args.atendente_id;
        }
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", convId);

      if (error) {
        throw new Error(`Erro ao atribuir conversa: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: args.ativar_ia
          ? "Conversa transferida com sucesso para o Agente de IA do Atendi."
          : "Conversa atribuída com sucesso ao atendente.",
        conversa_id: convId,
        ai_active: !!args.ativar_ia,
      };
    },
  },
  {
    name: "transferir_conversa",
    description:
      "Transfere o atendimento para outro departamento/fila, outro atendente humano ou outra filial da empresa.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser transferida.",
        },
        tipo_destino: {
          type: "string",
          enum: ["departamento", "atendente", "unidade"],
          description:
            "Tipo do destino: 'departamento' (fila do setor), 'atendente' (membro da equipe) ou 'unidade' (outra filial).",
        },
        destino_id: {
          type: "string",
          description: "ID (UUID) do departamento, atendente ou unidade de destino.",
        },
      },
      required: ["conversa_id", "tipo_destino", "destino_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const { tipo_destino, destino_id } = args;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const updatePayload: any = {};
      if (tipo_destino === "departamento") {
        updatePayload.department_id = destino_id;
        updatePayload.status = "waiting";
        updatePayload.assigned_agent_id = null;
      } else if (tipo_destino === "atendente") {
        updatePayload.assigned_agent_id = destino_id;
        updatePayload.status = "active";
      } else if (tipo_destino === "unidade") {
        updatePayload.unit_id = destino_id;
      }

      const { error } = await supabaseAdmin
        .from("conversations")
        .update(updatePayload)
        .eq("id", convId);

      if (error) {
        throw new Error(`Erro ao transferir conversa: ${error.message}`);
      }

      if (tipo_destino === "atendente") {
        await notifyTransferReceiver({
          conversationId: convId,
          receiverId: destino_id,
          actorId: context.userId,
          actorLabel: context.userName || context.keyName,
        });
      }

      return {
        sucesso: true,
        mensagem: `Conversa transferida com sucesso para ${tipo_destino}.`,
        conversa_id: convId,
        tipo_destino,
        destino_id,
      };
    },
  },
  {
    name: "adicionar_nota_interna",
    description:
      "Insere uma nota interna nos bastidores da conversa. Visível para toda a equipe no painel do Atendi, mas invisível para o cliente no WhatsApp/Instagram.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa onde a anotação será salva.",
        },
        conteudo: {
          type: "string",
          description:
            "Texto da anotação interna (ex: 'Cliente solicitou proposta B2B, preferência de contato após as 14h').",
        },
      },
      required: ["conversa_id", "conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const content = String(args.conteudo).trim();

      if (!content) {
        throw new Error("O conteúdo da nota interna não pode ser vazio.");
      }

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const { data: noteMsg, error } = await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: convId,
          sender_type: "agent",
          content,
          is_internal: true,
          media_type: "text",
        })
        .select("id, created_at")
        .single();

      if (error) {
        throw new Error(`Erro ao salvar nota interna: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Nota interna adicionada com sucesso aos bastidores da conversa!",
        nota_id: noteMsg?.id,
        conversa_id: convId,
      };
    },
  },
  {
    name: "listar_motivos_encerramento",
    description:
      "Lista todos os motivos de finalização/encerramento de atendimento cadastrados na empresa (ex: Venda Concluída, Dúvida Sanada, Sem Interesse).",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data, error } = await supabaseAdmin
        .from("resolution_reasons")
        .select("id, name, description, is_active, created_at")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error) {
        throw new Error(`Erro ao listar motivos de encerramento: ${error.message}`);
      }

      return {
        total: data?.length || 0,
        motivos: data || [],
      };
    },
  },
  {
    name: "encerrar_atendimento",
    description:
      "Encerra o ticket/atendimento da conversa, marcando o status como 'resolved' e registrando o motivo de encerramento e observações.",
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser encerrada.",
        },
        motivo_id: {
          type: "string",
          description:
            "ID (UUID) do motivo de resolução (obtido via 'listar_motivos_encerramento'). Opcional.",
        },
        observacao: {
          type: "string",
          description: "Resumo ou observação final sobre o atendimento.",
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const reasonId = args.motivo_id || null;
      const observation = args.observacao?.trim() || null;
      const resolvedAt = new Date().toISOString();

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      // 1. Atualizar conversa
      const { error: updErr } = await supabaseAdmin
        .from("conversations")
        .update({
          status: "resolved",
          resolved_at: resolvedAt,
          current_session_id: null,
          assigned_agent_id: null,
        } as any)
        .eq("id", convId);

      if (updErr) {
        throw new Error(`Erro ao encerrar conversa: ${updErr.message}`);
      }

      // 2. Atualizar sessões abertas
      await supabaseAdmin
        .from("conversation_sessions")
        .update({
          resolved_at: resolvedAt,
          resolution_reason_id: reasonId,
          resolution_observation: observation,
        })
        .eq("conversation_id", convId)
        .is("resolved_at", null);

      return {
        sucesso: true,
        mensagem: "Atendimento encerrado com sucesso!",
        conversa_id: convId,
        encerrado_em: resolvedAt,
      };
    },
  },
  {
    name: "consultar_sla_atendimento",
    description:
      "Consulta a política e parâmetros de SLA de atendimento configurados na empresa (tempo limite de primeira resposta, tempo de resposta contínua, limite de resolução e horários comerciais).",
    security: {
      requiredMenu: "reports",
      minRole: "manager",
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      const customVars = (company?.custom_variables as Record<string, any>) || {};
      const savedSla = (customVars.sla as Partial<SlaSettings>) || {};

      const slaConfig: SlaSettings = {
        enabled:
          savedSla.enabled !== undefined ? Boolean(savedSla.enabled) : DEFAULT_SLA_SETTINGS.enabled,
        first_response_limit_minutes:
          typeof savedSla.first_response_limit_minutes === "number"
            ? savedSla.first_response_limit_minutes
            : DEFAULT_SLA_SETTINGS.first_response_limit_minutes,
        response_limit_minutes:
          typeof savedSla.response_limit_minutes === "number"
            ? savedSla.response_limit_minutes
            : DEFAULT_SLA_SETTINGS.response_limit_minutes,
        resolution_limit_hours:
          typeof savedSla.resolution_limit_hours === "number"
            ? savedSla.resolution_limit_hours
            : DEFAULT_SLA_SETTINGS.resolution_limit_hours,
        warning_threshold_percent:
          typeof savedSla.warning_threshold_percent === "number"
            ? savedSla.warning_threshold_percent
            : DEFAULT_SLA_SETTINGS.warning_threshold_percent,
        count_business_hours_only:
          savedSla.count_business_hours_only !== undefined
            ? Boolean(savedSla.count_business_hours_only)
            : DEFAULT_SLA_SETTINGS.count_business_hours_only,
      };

      return {
        empresa: context.companyName,
        sla_ativo: slaConfig.enabled,
        configuracoes: {
          tempo_limite_primeira_resposta_minutos: slaConfig.first_response_limit_minutes,
          tempo_limite_resposta_continua_minutos: slaConfig.response_limit_minutes,
          tempo_limite_resolucao_horas: slaConfig.resolution_limit_hours,
          percentual_alerta_warning: slaConfig.warning_threshold_percent,
          considerar_apenas_horario_comercial: slaConfig.count_business_hours_only,
        },
      };
    },
  },
];
