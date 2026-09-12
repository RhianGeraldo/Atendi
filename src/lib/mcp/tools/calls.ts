/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const callsTools: McpToolDefinition[] = [
  {
    name: "listar_chamadas",
    description:
      "Lista o histórico de chamadas telefônicas (Wavoip/Voz) da empresa ou de um contato específico, com status, duração e direção.",
    inputSchema: {
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
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 50);

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

      if (args?.contato_id) {
        query = query.eq("contact_id", args.contato_id);
      }

      const { data: calls, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar chamadas: ${error.message}`);
      }

      return {
        total: calls?.length || 0,
        chamadas: (calls || []).map((c: any) => ({
          id: c.id,
          direcao: c.direction === "INCOMING" ? "Recebida" : "Realizada",
          status: c.status,
          duracao_segundos: c.duration_seconds || 0,
          data_inicio: c.started_at,
          numero_cliente: c.peer_number || c.contacts?.phone,
          nome_cliente: c.contacts?.name || "Desconhecido",
          atendente: c.profiles?.name || "Não atribuído",
          possui_gravacao: !!c.recording_url,
          possui_transcricao: !!c.transcription,
        })),
      };
    },
  },
  {
    name: "consultar_transcricao_chamada",
    description:
      "Recupera a transcrição textual completa e detalhes da gravação de áudio de uma chamada telefônica.",
    inputSchema: {
      type: "object",
      properties: {
        chamada_id: {
          type: "string",
          description: "ID (UUID) do registro de chamada telefônica.",
        },
      },
      required: ["chamada_id"],
    },
    handler: async (args: any, context: McpContext) => {
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
        .eq("id", args.chamada_id)
        .eq("company_id", context.companyId)
        .single();

      if (error || !call) {
        throw new Error("Chamada não encontrada ou acesso negado.");
      }

      return {
        chamada_id: call.id,
        cliente: {
          id: call.contacts?.id,
          nome: call.contacts?.name,
          telefone: call.peer_number || call.contacts?.phone,
        },
        atendente: call.profiles?.name,
        direcao: call.direction,
        duracao_segundos: call.duration_seconds,
        data_inicio: call.started_at,
        url_gravacao: call.recording_url,
        transcricao: call.transcription || "Transcrição ainda não disponível para esta gravação.",
      };
    },
  },
];
