/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const callsActions: CopilotAction[] = [
  // ─── Listar Chamadas Telefônicas ──────────────────────────────────────────
  {
    name: "listar_chamadas",
    label: "Listar Histórico de Chamadas Telefônicas",
    description:
      "Lista o histórico de chamadas telefônicas (Wavoip/Voz) da empresa ou de um contato específico, com status, duração, atendente e links de gravação/transcrição.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato para filtrar histórico de ligações.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de ligações a retornar (padrão 20, máx 50).",
          default: 20,
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const limit = Math.min(Math.max(Number(params?.limite) || 20, 1), 50);

      let query = supabaseAdmin
        .from("call_logs")
        .select(
          `
          id,
          direction,
          status,
          duration_seconds,
          started_at,
          ended_at,
          peer_number,
          recording_url,
          transcription,
          contacts(id, name, phone),
          profiles(name)
        `,
        )
        .eq("company_id", context.companyId)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (params?.contato_id) {
        query = query.eq("contact_id", params.contato_id);
      }

      const { data: calls, error } = await query;
      if (error) {
        return { success: false, message: `Erro ao listar chamadas: ${error.message}` };
      }

      const formatted = (calls || []).map((c: any) => ({
        id: c.id,
        direcao: c.direction === "INCOMING" ? "Recebida" : "Realizada",
        status: c.status,
        duracao_segundos: c.duration_seconds || 0,
        duracao_minutos: (Number(c.duration_seconds || 0) / 60).toFixed(1),
        data_inicio: c.started_at,
        numero_cliente: c.peer_number || c.contacts?.phone,
        nome_cliente: c.contacts?.name || "Desconhecido",
        atendente: c.profiles?.name || "Não atribuído",
        possui_gravacao: !!c.recording_url,
        possui_transcricao: !!c.transcription,
      }));

      return {
        success: true,
        message: `${formatted.length} chamada(s) telefônica(s) encontrada(s).`,
        data: {
          total: formatted.length,
          chamadas: formatted,
        },
      };
    },
  },

  // ─── Consultar Transcrição de Chamada ─────────────────────────────────────
  {
    name: "consultar_transcricao_chamada",
    label: "Consultar Transcrição de Chamada Telefônica",
    description:
      "Recupera a transcrição textual completa gerada por IA e detalhes da gravação de áudio de uma chamada telefônica.",
    minRole: "agent",
    requiredMenu: "conversations",
    parameters: {
      type: "object",
      properties: {
        chamada_id: {
          type: "string",
          description: "ID (UUID) do registro de chamada telefônica.",
        },
      },
      required: ["chamada_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: call, error } = await supabaseAdmin
        .from("call_logs")
        .select(
          `
          id,
          direction,
          status,
          duration_seconds,
          started_at,
          ended_at,
          peer_number,
          recording_url,
          transcription,
          contacts(id, name, phone),
          profiles(name)
        `,
        )
        .eq("id", params.chamada_id)
        .eq("company_id", context.companyId)
        .single();

      if (error || !call) {
        return { success: false, message: "Chamada telefônica não encontrada ou acesso negado." };
      }

      return {
        success: true,
        message: `Transcrição da chamada recuperada com sucesso! 📞`,
        data: {
          chamada_id: call.id,
          cliente: {
            id: call.contacts?.id,
            nome: call.contacts?.name,
            telefone: call.peer_number || call.contacts?.phone,
          },
          atendente: call.profiles?.name || "Não atribuído",
          direcao: call.direction === "INCOMING" ? "Recebida" : "Realizada",
          duracao_segundos: call.duration_seconds,
          data_inicio: call.started_at,
          url_gravacao: call.recording_url,
          transcricao: call.transcription || "Transcrição ainda não disponível para esta gravação.",
        },
      };
    },
  },
];
