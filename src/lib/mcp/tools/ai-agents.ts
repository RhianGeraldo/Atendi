/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateAndSendAiResponse, parseTaskDueDate } from "@/lib/server/ai-generator";
import { dispatchBackgroundTask } from "@/lib/server/ai-queue";
import {
  scheduleMessage,
  cancelScheduledMessagesForConversation,
} from "@/lib/server/scheduled-messages";
import type { McpContext, McpToolDefinition } from "../types";

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Localiza um agente de IA pelo UUID ou pelo nome aproximado dentro da empresa
 */
async function resolveAgent(companyId: string, idOrName: string) {
  if (!idOrName || typeof idOrName !== "string" || !idOrName.trim()) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrName.trim(),
  );

  if (isUuid) {
    const { data } = await supabaseAdmin
      .from("ai_agents")
      .select("*")
      .eq("id", idOrName.trim())
      .eq("company_id", companyId)
      .maybeSingle();
    if (data) return data;
  }

  // Busca por nome exato ou parcial
  const { data: agents } = await supabaseAdmin
    .from("ai_agents")
    .select("*")
    .eq("company_id", companyId);

  if (!agents || agents.length === 0) return null;

  const target = normalizeString(idOrName);
  const exact = agents.find((a) => normalizeString(a.name) === target);
  if (exact) return exact;

  const partial = agents.find(
    (a) => normalizeString(a.name).includes(target) || target.includes(normalizeString(a.name)),
  );
  return partial || null;
}

export const aiAgentsTools: McpToolDefinition[] = [
  // 1. Listar Agentes de IA
  {
    name: "listar_agentes_ia",
    description:
      "Lista todos os agentes de Inteligência Artificial da empresa (Helena, Sofia, SDRs, Suporte), modelos configurados, instâncias vinculadas e status de ativação.",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        somente_ativos: {
          type: "boolean",
          description:
            "Se true, filtra apenas agentes que estão ligados no momento. Padrão: false.",
          default: false,
        },
        unidade_id: {
          type: "string",
          description: "Filtrar agentes vinculados a uma unidade específica. Opcional.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("ai_agents")
        .select(
          `
          id,
          name,
          ai_type,
          description,
          provider,
          model,
          max_tokens,
          is_active,
          active_by_default,
          is_main_agent,
          allow_followup,
          followup_interval_minutes,
          followup_max_attempts,
          allow_handoff,
          allow_resolution,
          allow_tasks,
          allow_opportunities,
          allow_tickets,
          allow_cadence,
          unit_id,
          instance_id,
          department_id,
          units(name, color),
          whatsapp_instances(name, provider, network),
          departments:departments!ai_agents_department_id_fkey(name),
          created_at,
          updated_at
        `,
        )
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: true });

      if (args.somente_ativos) {
        query = query.eq("is_active", true);
      }

      if (args.unidade_id) {
        query = query.or(`unit_id.is.null,unit_id.eq.${args.unidade_id}`);
      }

      const { data: agents, error } = await query;
      if (error) throw new Error(`Erro ao listar agentes de IA: ${error.message}`);

      return {
        total: agents?.length || 0,
        agentes: (agents || []).map((a: any) => ({
          id: a.id,
          nome: a.name,
          funcao_tipo: a.ai_type,
          descricao: a.description,
          provedor: a.provider || "default",
          modelo: a.model,
          ativo: a.is_active,
          assume_novas_conversas: a.active_by_default,
          agente_principal_triagem: a.is_main_agent,
          canal_vinculado: a.whatsapp_instances?.name || "Todos os Canais",
          unidade_vinculada: a.units?.name || "Todas as Unidades",
          departamento_vinculado: a.departments?.name || "Todos os Departamentos",
          followup: {
            ativo: a.allow_followup,
            intervalo_minutos: a.followup_interval_minutes,
            max_tentativas: a.followup_max_attempts,
          },
          cadencia: {
            ativa: a.allow_cadence ?? true,
          },
          autonomia: {
            transbordo_humano: a.allow_handoff,
            encerramento: a.allow_resolution,
            tarefas_crm: a.allow_tasks,
            oportunidades_crm: a.allow_opportunities,
            tickets: a.allow_tickets,
          },
        })),
      };
    },
  },

  // 2. Obter Detalhes Completos de um Agente de IA
  {
    name: "obter_agente_ia",
    description:
      "Retorna todas as instruções, prompts na íntegra (personalidade, diretrizes, informações extras, follow-up), modelo e permissões de uma IA pelo ID ou Nome (ex: 'Helena').",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        agente_id_ou_nome: {
          type: "string",
          description: "ID (UUID) ou nome do agente (ex: 'Helena', 'Sofia', 'SDR').",
        },
      },
      required: ["agente_id_ou_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const agent = await resolveAgent(context.companyId, args.agente_id_ou_nome);
      if (!agent) {
        throw new Error(`Agente de IA "${args.agente_id_ou_nome}" não encontrado na empresa.`);
      }

      // Buscar nomes de unidades, instâncias e departamentos
      let unitName = "Todas as Unidades";
      if (agent.unit_id) {
        const { data: u } = await supabaseAdmin
          .from("units")
          .select("name")
          .eq("id", agent.unit_id)
          .maybeSingle();
        if (u) unitName = u.name;
      }

      let instanceName = "Todos os Canais";
      if (agent.instance_id) {
        const { data: inst } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("name")
          .eq("id", agent.instance_id)
          .maybeSingle();
        if (inst) instanceName = inst.name;
      }

      let pipelineName = null;
      if (agent.pipeline_id) {
        const { data: pipe } = await supabaseAdmin
          .from("pipelines")
          .select("name")
          .eq("id", agent.pipeline_id)
          .maybeSingle();
        if (pipe) pipelineName = pipe.name;
      }

      let colleagueNames: string[] = [];
      if (Array.isArray(agent.allowed_agent_ids) && agent.allowed_agent_ids.length > 0) {
        const { data: cols } = await supabaseAdmin
          .from("ai_agents")
          .select("name")
          .in("id", agent.allowed_agent_ids);
        if (cols) colleagueNames = cols.map((c: any) => c.name);
      }

      return {
        id: agent.id,
        nome: agent.name,
        funcao_tipo: agent.ai_type,
        descricao: agent.description,
        provedor: agent.provider || "default",
        modelo: agent.model,
        max_tokens: agent.max_tokens,
        status: {
          ativo: agent.is_active,
          assume_novas_conversas: agent.active_by_default,
          agente_principal_triagem: agent.is_main_agent,
        },
        vinculos: {
          unidade: unitName,
          unidade_id: agent.unit_id,
          canal_instancia: instanceName,
          instancia_id: agent.instance_id,
          departamento_id: agent.department_id,
          funil_crm: pipelineName,
          funil_crm_id: agent.pipeline_id,
          colegas_ia_permitidos: colleagueNames,
        },
        prompts: {
          prompt_personalidade: agent.prompt_personality,
          prompt_instrucoes: agent.prompt_instructions,
          prompt_informacoes_extras: agent.prompt_extra_info,
          prompt_followup: agent.prompt_followup,
          prompt_recebimento_transbordo: agent.prompt_receive_handoff,
          prompt_cadencia: agent.prompt_cadence,
        },
        followup: {
          ativo: agent.allow_followup,
          intervalo_minutos: agent.followup_interval_minutes,
          max_tentativas: agent.followup_max_attempts,
          motivo_encerramento_id: agent.followup_resolution_reason_id,
        },
        cadencia: {
          ativo: agent.allow_cadence ?? true,
          prompt_cadencia: agent.prompt_cadence,
        },
        autonomia_ferramentas: {
          transbordo_humano: agent.allow_handoff,
          departamento_transbordo_id: agent.handoff_department_id,
          encerramento: agent.allow_resolution,
          motivo_encerramento_padrao_id: agent.resolution_reason_id,
          motivo_encerramento_followup_id: agent.followup_resolution_reason_id,
          tarefas_crm: agent.allow_tasks,
          oportunidades_crm: agent.allow_opportunities,
          tickets: agent.allow_tickets,
        },
        atualizado_em: agent.updated_at,
      };
    },
  },

  // 3. Atualizar Agente de IA (Prompts, Modelos, Follow-ups e Regras)
  {
    name: "atualizar_agente_ia",
    description:
      "Atualiza parâmetros, regras, instruções, prompts, modelo LLM ou comportamento de um agente de IA com efeito imediato nas conversas.",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        agente_id_ou_nome: {
          type: "string",
          description: "ID (UUID) ou nome do agente a atualizar (ex: 'Helena').",
        },
        nome: { type: "string", description: "Novo nome do agente." },
        tipo_funcao: {
          type: "string",
          description: "Nova função/tipo (ex: 'Vendedor / SDR', 'Suporte').",
        },
        descricao: {
          type: "string",
          description:
            "Resumo da função em 1 frase para os colegas de IA saberem quando transferir.",
        },
        modelo: {
          type: "string",
          description: "Modelo LLM (ex: 'gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile').",
        },
        provedor: {
          type: "string",
          enum: ["default", "openai", "groq", "openrouter"],
          description: "Provedor de IA ('default', 'openai', 'groq', 'openrouter').",
        },
        max_tokens: { type: "number", description: "Limite de tokens de saída (ex: 4096)." },
        prompt_personalidade: {
          type: "string",
          description: "Tom de voz, persona, tom de fala e identidade da IA.",
        },
        prompt_instrucoes: {
          type: "string",
          description:
            "Diretrizes e instruções passo a passo de como conduzir a conversa, negociar e responder.",
        },
        prompt_informacoes_extras: {
          type: "string",
          description:
            "Informações sobre a empresa, diferenciais, localização e regras de negócio.",
        },
        ativo: { type: "boolean", description: "Ligar ou pausar o agente." },
        assumir_conversas_padrao: {
          type: "boolean",
          description: "Se o agente assume novas conversas automaticamente.",
        },
        agente_principal: {
          type: "boolean",
          description: "Se este agente é o agente principal de triagem inicial.",
        },
        permitir_followup: {
          type: "boolean",
          description: "Ativar ou desativar follow-up automático de inatividade.",
        },
        intervalo_followup_minutos: {
          type: "number",
          description:
            "Tempo de inatividade do cliente antes de disparar o follow-up (em minutos, ex: 15).",
        },
        maximo_tentativas_followup: {
          type: "number",
          description: "Número máximo de tentativas de follow-up (ex: 3).",
        },
        prompt_followup: {
          type: "string",
          description: "Instruções específicas para as mensagens de follow-up da IA.",
        },
        permitir_cadencia: {
          type: "boolean",
          description:
            "Ativar ou desativar cadência de reengajamento D+1 a D+30 após encerramento por inatividade.",
        },
        prompt_cadencia: {
          type: "string",
          description:
            "Instruções específicas para as mensagens disparadas na cadência de longo prazo (D+1 a D+30).",
        },
        prompt_recebimento_transbordo: {
          type: "string",
          description:
            "Instruções específicas para quando este agente assume um atendimento transferido por outro colega de IA.",
        },
        permitir_transbordo_humano: {
          type: "boolean",
          description: "Se a IA pode transferir para atendente humano quando solicitado.",
        },
        departamento_transbordo_id: {
          type: "string",
          description:
            "ID do departamento padrão para onde transferir atendimentos humanos (ou 'none' para o mesmo departamento atual).",
        },
        permitir_encerramento: {
          type: "boolean",
          description: "Se a IA pode encerrar atendimentos concluídos.",
        },
        motivo_encerramento_id: {
          type: "string",
          description:
            "ID do motivo de encerramento padrão quando o atendimento for concluído com sucesso (ou 'none' para sem motivo).",
        },
        motivo_encerramento_followup_id: {
          type: "string",
          description:
            "ID do motivo de encerramento registrado quando o atendimento for finalizado por inatividade após follow-ups (ou 'none').",
        },
        permitir_tarefas_crm: {
          type: "boolean",
          description: "Se a IA pode agendar tarefas e lembretes para a equipe no CRM.",
        },
        permitir_oportunidades_crm: {
          type: "boolean",
          description: "Se a IA pode abrir ou mover oportunidades no Funil de Vendas.",
        },
        funil_crm_id: {
          type: "string",
          description: "ID do funil de vendas a ser utilizado pela IA ao criar oportunidades.",
        },
        permitir_abertura_tickets: {
          type: "boolean",
          description: "Se a IA pode abrir chamados/tickets para a equipe técnica/financeira.",
        },
        unidade_id: {
          type: "string",
          description:
            "Vincular agente a uma filial específica, ou null/'all' para atender toda a empresa.",
        },
        instancia_id: {
          type: "string",
          description:
            "Vincular a uma conexão/instância de WhatsApp específica, ou null/'all' para atender todos os canais.",
        },
        departamento_id: {
          type: "string",
          description: "Vincular a um departamento específico, ou null/'all'.",
        },
        colegas_ia_permitidos: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de IDs de outros agentes de IA que este agente tem permissão de consultar ou transferir.",
        },
      },
      required: ["agente_id_ou_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const existing = await resolveAgent(context.companyId, args.agente_id_ou_nome);
      if (!existing) {
        throw new Error(`Agente de IA "${args.agente_id_ou_nome}" não encontrado.`);
      }

      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (args.nome !== undefined) updates.name = args.nome.trim();
      if (args.tipo_funcao !== undefined) updates.ai_type = args.tipo_funcao.trim();
      if (args.descricao !== undefined) updates.description = args.descricao.trim() || null;
      if (args.modelo !== undefined) updates.model = args.modelo.trim();
      if (args.provedor !== undefined) updates.provider = args.provedor;
      if (args.max_tokens !== undefined) updates.max_tokens = Number(args.max_tokens) || 4096;

      if (args.prompt_personalidade !== undefined)
        updates.prompt_personality = args.prompt_personalidade;
      if (args.prompt_instrucoes !== undefined)
        updates.prompt_instructions = args.prompt_instrucoes;
      if (args.prompt_informacoes_extras !== undefined)
        updates.prompt_extra_info = args.prompt_informacoes_extras;

      if (args.ativo !== undefined) updates.is_active = Boolean(args.ativo);
      if (args.assumir_conversas_padrao !== undefined)
        updates.active_by_default = Boolean(args.assumir_conversas_padrao);

      if (args.agente_principal !== undefined) {
        updates.is_main_agent = Boolean(args.agente_principal);
        if (updates.is_main_agent) {
          // Desativa flag de outros agentes para não conflitar
          await supabaseAdmin
            .from("ai_agents")
            .update({ is_main_agent: false })
            .eq("company_id", context.companyId)
            .neq("id", existing.id);
        }
      }

      if (args.permitir_followup !== undefined)
        updates.allow_followup = Boolean(args.permitir_followup);
      if (args.intervalo_followup_minutos !== undefined)
        updates.followup_interval_minutes = Number(args.intervalo_followup_minutos);
      if (args.maximo_tentativas_followup !== undefined)
        updates.followup_max_attempts = Number(args.maximo_tentativas_followup);
      if (args.prompt_followup !== undefined) updates.prompt_followup = args.prompt_followup;

      if (args.permitir_cadencia !== undefined)
        updates.allow_cadence = Boolean(args.permitir_cadencia);
      if (args.prompt_cadencia !== undefined) updates.prompt_cadence = args.prompt_cadencia || null;
      if (args.prompt_recebimento_transbordo !== undefined)
        updates.prompt_receive_handoff = args.prompt_recebimento_transbordo || null;

      if (args.permitir_transbordo_humano !== undefined)
        updates.allow_handoff = Boolean(args.permitir_transbordo_humano);
      if (args.departamento_transbordo_id !== undefined) {
        updates.handoff_department_id =
          args.departamento_transbordo_id === "none" || !args.departamento_transbordo_id
            ? null
            : args.departamento_transbordo_id;
      }

      if (args.permitir_encerramento !== undefined)
        updates.allow_resolution = Boolean(args.permitir_encerramento);
      if (args.motivo_encerramento_id !== undefined) {
        updates.resolution_reason_id =
          args.motivo_encerramento_id === "none" || !args.motivo_encerramento_id
            ? null
            : args.motivo_encerramento_id;
      }
      if (args.motivo_encerramento_followup_id !== undefined) {
        updates.followup_resolution_reason_id =
          args.motivo_encerramento_followup_id === "none" || !args.motivo_encerramento_followup_id
            ? null
            : args.motivo_encerramento_followup_id;
      }
      if (args.permitir_tarefas_crm !== undefined)
        updates.allow_tasks = Boolean(args.permitir_tarefas_crm);
      if (args.permitir_oportunidades_crm !== undefined)
        updates.allow_opportunities = Boolean(args.permitir_oportunidades_crm);
      if (args.funil_crm_id !== undefined) {
        updates.pipeline_id =
          args.funil_crm_id === "none" || args.funil_crm_id === "nenhum" || !args.funil_crm_id
            ? null
            : args.funil_crm_id;
      }
      if (args.permitir_abertura_tickets !== undefined)
        updates.allow_tickets = Boolean(args.permitir_abertura_tickets);

      if (args.unidade_id !== undefined) {
        updates.unit_id =
          args.unidade_id === "all" ||
          args.unidade_id === "nenhum" ||
          args.unidade_id === "none" ||
          !args.unidade_id
            ? null
            : args.unidade_id;
      }
      if (args.instancia_id !== undefined) {
        updates.instance_id =
          args.instancia_id === "all" ||
          args.instancia_id === "nenhum" ||
          args.instancia_id === "none" ||
          !args.instancia_id
            ? null
            : args.instancia_id;
      }
      if (args.departamento_id !== undefined) {
        updates.department_id =
          args.departamento_id === "all" ||
          args.departamento_id === "nenhum" ||
          args.departamento_id === "none" ||
          !args.departamento_id
            ? null
            : args.departamento_id;
      }
      if (args.colegas_ia_permitidos !== undefined) {
        updates.allowed_agent_ids =
          Array.isArray(args.colegas_ia_permitidos) && args.colegas_ia_permitidos.length > 0
            ? args.colegas_ia_permitidos
            : null;
      }

      const { data: updated, error } = await supabaseAdmin
        .from("ai_agents")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw new Error(`Erro ao atualizar agente de IA: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Agente de IA "${updated.name}" atualizado com sucesso! As alterações já estão ativas para as próximas mensagens.`,
        agente: {
          id: updated.id,
          nome: updated.name,
          funcao_tipo: updated.ai_type,
          modelo: updated.model,
          ativo: updated.is_active,
          followup_ativo: updated.allow_followup,
        },
      };
    },
  },

  // 4. Alternar Status Rápido do Agente (Pausar / Retomar)
  {
    name: "alternar_status_agente_ia",
    description:
      "Liga ou desliga um agente de IA de forma rápida (ex: pausar Helena para manutenção ou retomar atendimento).",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        agente_id_ou_nome: {
          type: "string",
          description: "ID (UUID) ou nome do agente (ex: 'Helena').",
        },
        ativo: {
          type: "boolean",
          description: "true para ligar, false para pausar. Se omitido, inverte o estado atual.",
        },
      },
      required: ["agente_id_ou_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const existing = await resolveAgent(context.companyId, args.agente_id_ou_nome);
      if (!existing) {
        throw new Error(`Agente de IA "${args.agente_id_ou_nome}" não encontrado.`);
      }

      const newStatus = args.ativo !== undefined ? Boolean(args.ativo) : !existing.is_active;

      const { data, error } = await supabaseAdmin
        .from("ai_agents")
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id, name, is_active")
        .single();

      if (error) throw new Error(`Erro ao alternar status do agente: ${error.message}`);

      return {
        sucesso: true,
        agente_id: data.id,
        nome: data.name,
        esta_ativo: data.is_active,
        mensagem: data.is_active
          ? `O agente "${data.name}" foi ATIVADO e já está respondendo às conversas.`
          : `O agente "${data.name}" foi PAUSADO temporariamente. Nenhuma resposta automática será gerada por ele.`,
      };
    },
  },

  // 5. Criar Novo Agente de IA
  {
    name: "criar_agente_ia",
    description:
      "Cria um novo agente de Inteligência Artificial para a empresa (ex: SDR de prospecção, especialista de pós-venda, agente de agendamentos).",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do agente (ex: 'Helena', 'Lucas SDR')." },
        tipo_funcao: {
          type: "string",
          description: "Tipo / Função (ex: 'Vendedor / SDR', 'Suporte Técnico', 'Pós-Venda').",
        },
        descricao: {
          type: "string",
          description: "Resumo da função em 1 frase para outros agentes de IA.",
        },
        modelo: {
          type: "string",
          description:
            "Modelo LLM (ex: 'gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile'). Padrão: 'gpt-4o'.",
        },
        provedor: {
          type: "string",
          enum: ["default", "openai", "groq", "openrouter"],
          description: "Provedor LLM. Padrão: 'default'.",
          default: "default",
        },
        max_tokens: { type: "number", description: "Limite de tokens de saída. Padrão: 4096." },
        prompt_personalidade: { type: "string", description: "Tom de voz e persona." },
        prompt_instrucoes: {
          type: "string",
          description: "Instruções operacionais e regras de atendimento.",
        },
        prompt_informacoes_extras: {
          type: "string",
          description: "Informações sobre a clínica/empresa e diferenciais.",
        },
        ativo: { type: "boolean", description: "Se o agente já inicia ativo. Padrão: true." },
        assumir_conversas_padrao: {
          type: "boolean",
          description: "Se assume novas conversas automaticamente. Padrão: true.",
        },
        agente_principal: {
          type: "boolean",
          description: "Se é o agente principal da empresa/unidade.",
        },
        permitir_followup: {
          type: "boolean",
          description: "Se envia follow-up automático de clientes sumidos. Padrão: true.",
        },
        intervalo_followup_minutos: {
          type: "number",
          description: "Minutos de espera para follow-up. Padrão: 15.",
        },
        maximo_tentativas_followup: {
          type: "number",
          description: "Tentativas de follow-up. Padrão: 3.",
        },
        prompt_followup: { type: "string", description: "Instruções do follow-up." },
        permitir_cadencia: {
          type: "boolean",
          description:
            "Se o agente participa da cadência de reengajamento D+1 a D+30. Padrão: true.",
        },
        prompt_cadencia: {
          type: "string",
          description: "Instruções específicas para a cadência D+1 a D+30.",
        },
        prompt_recebimento_transbordo: {
          type: "string",
          description: "Instruções de recebimento de transbordo de colegas.",
        },
        permitir_transbordo_humano: { type: "boolean", description: "Padrão: true." },
        departamento_transbordo_id: {
          type: "string",
          description: "ID do departamento padrão para transbordo humano.",
        },
        permitir_encerramento: { type: "boolean", description: "Padrão: true." },
        motivo_encerramento_id: {
          type: "string",
          description: "ID do motivo de encerramento padrão quando concluído.",
        },
        motivo_encerramento_followup_id: {
          type: "string",
          description: "ID do motivo de encerramento por inatividade de follow-up.",
        },
        permitir_tarefas_crm: { type: "boolean", description: "Padrão: true." },
        permitir_oportunidades_crm: { type: "boolean", description: "Padrão: false." },
        funil_crm_id: { type: "string", description: "ID do funil do CRM." },
        permitir_abertura_tickets: { type: "boolean", description: "Padrão: true." },
        unidade_id: {
          type: "string",
          description: "ID da unidade física, ou null para toda a rede.",
        },
        instancia_id: {
          type: "string",
          description: "ID da instância de WhatsApp, ou null para todos os canais.",
        },
        departamento_id: { type: "string", description: "ID do departamento vinculado." },
        colegas_ia_permitidos: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de IDs de outros agentes de IA permitidos para consulta/delegação mútua.",
        },
      },
      required: ["nome", "tipo_funcao"],
    },
    handler: async (args: any, context: McpContext) => {
      const isMain = Boolean(args.agente_principal);
      if (isMain) {
        await supabaseAdmin
          .from("ai_agents")
          .update({ is_main_agent: false })
          .eq("company_id", context.companyId);
      }

      const payload = {
        company_id: context.companyId,
        name: args.nome.trim(),
        ai_type: args.tipo_funcao.trim(),
        description: args.descricao ? args.descricao.trim() : null,
        provider: args.provedor || "default",
        model: args.modelo || "gpt-4o",
        max_tokens: Number(args.max_tokens) || 4096,
        prompt_personality: args.prompt_personalidade || "",
        prompt_instructions: args.prompt_instrucoes || "",
        prompt_extra_info: args.prompt_informacoes_extras || "",
        is_active: args.ativo !== false,
        active_by_default: args.assumir_conversas_padrao !== false,
        is_main_agent: isMain,
        allow_followup: args.permitir_followup !== false,
        followup_interval_minutes: Number(args.intervalo_followup_minutos) || 15,
        followup_max_attempts: Number(args.maximo_tentativas_followup) || 3,
        prompt_followup: args.prompt_followup || null,
        allow_cadence: args.permitir_cadencia !== false,
        prompt_cadence: args.prompt_cadencia || null,
        prompt_receive_handoff: args.prompt_recebimento_transbordo || null,
        allow_handoff: args.permitir_transbordo_humano !== false,
        handoff_department_id:
          args.departamento_transbordo_id === "none" || !args.departamento_transbordo_id
            ? null
            : args.departamento_transbordo_id,
        allow_resolution: args.permitir_encerramento !== false,
        resolution_reason_id:
          args.motivo_encerramento_id === "none" || !args.motivo_encerramento_id
            ? null
            : args.motivo_encerramento_id,
        followup_resolution_reason_id:
          args.motivo_encerramento_followup_id === "none" || !args.motivo_encerramento_followup_id
            ? null
            : args.motivo_encerramento_followup_id,
        allow_tasks: args.permitir_tarefas_crm !== false,
        allow_opportunities: Boolean(args.permitir_oportunidades_crm),
        pipeline_id:
          args.funil_crm_id === "none" || args.funil_crm_id === "nenhum" || !args.funil_crm_id
            ? null
            : args.funil_crm_id,
        allow_tickets: args.permitir_abertura_tickets !== false,
        allowed_agent_ids:
          Array.isArray(args.colegas_ia_permitidos) && args.colegas_ia_permitidos.length > 0
            ? args.colegas_ia_permitidos
            : null,
        unit_id:
          args.unidade_id === "all" ||
          args.unidade_id === "nenhum" ||
          args.unidade_id === "none" ||
          !args.unidade_id
            ? null
            : args.unidade_id,
        instance_id:
          args.instancia_id === "all" ||
          args.instancia_id === "nenhum" ||
          args.instancia_id === "none" ||
          !args.instancia_id
            ? null
            : args.instancia_id,
        department_id:
          args.departamento_id === "all" ||
          args.departamento_id === "nenhum" ||
          args.departamento_id === "none" ||
          !args.departamento_id
            ? null
            : args.departamento_id,
      };

      const { data, error } = await supabaseAdmin
        .from("ai_agents")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Erro ao criar agente de IA: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Agente de IA "${data.name}" criado com sucesso!`,
        agente: data,
      };
    },
  },

  // 6. Duplicar / Clonar Agente de IA
  {
    name: "duplicar_agente_ia",
    description:
      "Clona todas as instruções, prompts, personalidade e regras de um agente existente para um novo agente (ideal para replicar calibragem da Helena em outra filial ou canal).",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        agente_origem_id_ou_nome: {
          type: "string",
          description: "ID ou nome do agente existente a ser clonado.",
        },
        novo_nome: {
          type: "string",
          description: "Nome do novo agente (ex: 'Helena - Linhares', 'Sofia - Instagram').",
        },
        unidade_destino_id: {
          type: "string",
          description: "ID da nova filial/unidade (ou null para rede inteira).",
        },
        instancia_destino_id: {
          type: "string",
          description: "ID da nova instância de WhatsApp/canal.",
        },
      },
      required: ["agente_origem_id_ou_nome", "novo_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const source = await resolveAgent(context.companyId, args.agente_origem_id_ou_nome);
      if (!source) {
        throw new Error(`Agente de origem "${args.agente_origem_id_ou_nome}" não encontrado.`);
      }

      // Copia todas as configurações
      const payload = {
        company_id: context.companyId,
        name: args.novo_nome.trim(),
        ai_type: source.ai_type,
        description: source.description,
        provider: source.provider,
        model: source.model,
        max_tokens: source.max_tokens,
        prompt_personality: source.prompt_personality,
        prompt_instructions: source.prompt_instructions,
        prompt_extra_info: source.prompt_extra_info,
        is_active: true,
        active_by_default: source.active_by_default,
        is_main_agent: false, // Novos clones começam sem ser o principal
        allow_followup: source.allow_followup,
        followup_interval_minutes: source.followup_interval_minutes,
        followup_max_attempts: source.followup_max_attempts,
        prompt_followup: source.prompt_followup,
        allow_cadence: source.allow_cadence ?? true,
        prompt_cadence: source.prompt_cadence,
        prompt_receive_handoff: source.prompt_receive_handoff,
        allow_handoff: source.allow_handoff,
        handoff_department_id: source.handoff_department_id,
        allow_resolution: source.allow_resolution,
        resolution_reason_id: source.resolution_reason_id,
        followup_resolution_reason_id: source.followup_resolution_reason_id,
        allow_tasks: source.allow_tasks,
        allow_opportunities: source.allow_opportunities,
        pipeline_id: source.pipeline_id,
        allow_tickets: source.allow_tickets,
        allowed_agent_ids: source.allowed_agent_ids,
        unit_id: args.unidade_destino_id !== undefined ? args.unidade_destino_id : source.unit_id,
        instance_id: args.instancia_destino_id !== undefined ? args.instancia_destino_id : null,
        department_id: source.department_id,
      };

      const { data, error } = await supabaseAdmin
        .from("ai_agents")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Erro ao clonar agente: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Agente "${data.name}" criado a partir do clone de "${source.name}"!`,
        novo_agente_id: data.id,
      };
    },
  },

  // 7. Excluir Agente de IA
  {
    name: "excluir_agente_ia",
    description: "Remove permanentemente um agente de IA do banco da empresa.",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        agente_id_ou_nome: {
          type: "string",
          description: "ID (UUID) ou nome do agente a ser excluído.",
        },
      },
      required: ["agente_id_ou_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const existing = await resolveAgent(context.companyId, args.agente_id_ou_nome);
      if (!existing) {
        throw new Error(`Agente de IA "${args.agente_id_ou_nome}" não encontrado.`);
      }

      const { error } = await supabaseAdmin.from("ai_agents").delete().eq("id", existing.id);

      if (error) throw new Error(`Erro ao excluir agente: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Agente "${existing.name}" foi excluído com sucesso.`,
      };
    },
  },

  // 8. Consultar Configurações Globais de IA da Empresa
  {
    name: "consultar_configuracoes_ia_empresa",
    description:
      "Retorna os motores e provedores de IA ativos na empresa (OpenAI, Groq, OpenRouter), status das chaves de API cadastradas e parâmetros globais.",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "manager",
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("name, ai_settings")
        .eq("id", context.companyId)
        .single();

      const aiSettings = (comp?.ai_settings as any) || {};
      const keys = aiSettings.keys || {};
      const engines = aiSettings.engines || {};

      const maskKey = (key?: string) => {
        if (!key) return "Não configurada";
        if (key.length <= 8) return "••••••••";
        return `${key.slice(0, 4)}...${key.slice(-4)}`;
      };

      return {
        empresa: comp?.name,
        motor_padrao_chatbot: engines.chatbot || "openai",
        motor_transcricao_audio: engines.transcription || "openai",
        chaves_configuradas: {
          openai: { ativa: !!keys.openai, chave_mascarada: maskKey(keys.openai) },
          groq: { ativa: !!keys.groq, chave_mascarada: maskKey(keys.groq) },
          openrouter: { ativa: !!keys.openrouter, chave_mascarada: maskKey(keys.openrouter) },
          elevenlabs: { ativa: !!keys.elevenlabs, chave_mascarada: maskKey(keys.elevenlabs) },
        },
      };
    },
  },

  // 9. Configurar / Alterar Motores e Provedores Globais de IA da Empresa
  {
    name: "configurar_ia_empresa",
    description:
      "Altera o provedor de IA padrão da empresa ou adiciona/atualiza as chaves de API (OpenAI, Groq, OpenRouter). Exclusivo para administradores.",
    security: {
      category: "ai_agents",
      requiredMenu: "settings",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        provedor_padrao_chatbot: {
          type: "string",
          enum: ["openai", "groq", "openrouter"],
          description: "Provedor padrão para as respostas das IAs.",
        },
        chave_openai: {
          type: "string",
          description: "Chave de API da OpenAI (sk-...). Deixe vazio para não alterar.",
        },
        chave_groq: {
          type: "string",
          description: "Chave de API da Groq (gsk_...). Deixe vazio para não alterar.",
        },
        chave_openrouter: {
          type: "string",
          description: "Chave de API da OpenRouter. Deixe vazio para não alterar.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("ai_settings")
        .eq("id", context.companyId)
        .single();

      const currentSettings = (comp?.ai_settings as any) || {};
      const currentKeys = currentSettings.keys || {};
      const currentEngines = currentSettings.engines || {};

      const updatedKeys = {
        ...currentKeys,
        ...(args.chave_openai?.trim() && { openai: args.chave_openai.trim() }),
        ...(args.chave_groq?.trim() && { groq: args.chave_groq.trim() }),
        ...(args.chave_openrouter?.trim() && { openrouter: args.chave_openrouter.trim() }),
      };

      const updatedEngines = {
        ...currentEngines,
        ...(args.provedor_padrao_chatbot && { chatbot: args.provedor_padrao_chatbot }),
      };

      const newSettings = {
        ...currentSettings,
        keys: updatedKeys,
        engines: updatedEngines,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from("companies")
        .update({ ai_settings: newSettings })
        .eq("id", context.companyId);

      if (error) throw new Error(`Erro ao salvar configurações de IA: ${error.message}`);

      return {
        sucesso: true,
        mensagem: "Configurações globais de IA da empresa atualizadas com sucesso!",
        provedor_ativo: updatedEngines.chatbot,
      };
    },
  },

  // 10. Alternar IA em Conversa Específica (Ligar / Pausar)
  {
    name: "alternar_ia_conversa",
    description:
      "Ativa ou pausa o atendimento por Inteligência Artificial em uma conversa específica. Se for ativada e o cliente estiver aguardando resposta, pode acionar a IA imediatamente.",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa.",
        },
        ativo: {
          type: "boolean",
          description: "true para ativar o atendimento por IA, false para pausar.",
        },
        disparar_se_aguardando: {
          type: "boolean",
          description:
            "Se true e o cliente estiver aguardando resposta, aciona a IA imediatamente em segundo plano para responder. Padrão: true.",
          default: true,
        },
      },
      required: ["conversa_id", "ativo"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;
      const active = Boolean(args.ativo);

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

      const updateData: Record<string, any> = {
        ai_active: active,
      };
      if (active) {
        updateData.assigned_agent_id = null;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("conversations")
        .update(updateData)
        .eq("id", convId);

      if (updateErr) {
        throw new Error(`Erro ao alterar status da IA na conversa: ${updateErr.message}`);
      }

      let triggeredAi = false;
      if (active && args.disparar_se_aguardando !== false) {
        const { data: latestMsg } = await supabaseAdmin
          .from("messages")
          .select("id, sender_type")
          .eq("conversation_id", convId)
          .eq("is_internal", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg && latestMsg.sender_type === "contact") {
          dispatchBackgroundTask(generateAndSendAiResponse(convId, context.companyId));
          triggeredAi = true;
        }
      }

      return {
        sucesso: true,
        conversa_id: convId,
        ia_ativa: active,
        resposta_disparada: triggeredAi,
        mensagem: active
          ? triggeredAi
            ? "IA ativada com sucesso! O cliente estava aguardando e o agente de IA já começou a formular a resposta."
            : "IA ativada com sucesso neste atendimento. Ela responderá às próximas mensagens do cliente."
          : "IA pausada neste atendimento. Nenhuma resposta automática será enviada até que seja reativada.",
      };
    },
  },

  // 11. Definir / Delegar Agente de IA para uma Conversa
  {
    name: "definir_agente_ia_conversa",
    description:
      "Atribui ou transfere um atendimento para um agente de IA específico (ex: Helena, Sofia, SDR, Alice). Liga a IA na conversa, registra nota interna de transição e pode disparar a resposta imediata da nova IA.",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa a ser delegada.",
        },
        agente_id_ou_nome: {
          type: "string",
          description: "ID (UUID) ou nome do agente de IA desejado (ex: 'Helena', 'Sofia', 'SDR').",
        },
        aviso_transferencia: {
          type: "string",
          description:
            "Motivo ou nota interna gravada nos bastidores da conversa explicando a transição de agente.",
        },
        disparar_resposta_imediata: {
          type: "boolean",
          description:
            "Se true e o cliente estiver aguardando resposta, a nova IA formulará e enviará a resposta imediatamente. Padrão: true.",
          default: true,
        },
      },
      required: ["conversa_id", "agente_id_ou_nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, ai_agent_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const agent = await resolveAgent(context.companyId, args.agente_id_ou_nome);
      if (!agent) {
        throw new Error(`Agente de IA "${args.agente_id_ou_nome}" não encontrado.`);
      }

      // Atualiza a conversa com o novo agente de IA e ativa a IA
      const { error: updateErr } = await supabaseAdmin
        .from("conversations")
        .update({
          ai_agent_id: agent.id,
          ai_active: true,
          assigned_agent_id: null,
        })
        .eq("id", convId);

      if (updateErr) {
        throw new Error(`Erro ao transferir para o agente de IA: ${updateErr.message}`);
      }

      // Registra nota interna de bastidores se fornecido motivo
      if (args.aviso_transferencia) {
        await supabaseAdmin.from("messages").insert({
          conversation_id: convId,
          sender_type: "system",
          content: `Conversa transferida para o agente de IA: ${agent.name} (${agent.ai_type}). Motivo: ${args.aviso_transferencia.trim()}`,
          is_internal: true,
        });
      }

      let triggeredAi = false;
      if (args.disparar_resposta_imediata !== false) {
        const { data: latestMsg } = await supabaseAdmin
          .from("messages")
          .select("id, sender_type")
          .eq("conversation_id", convId)
          .eq("is_internal", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestMsg && latestMsg.sender_type === "contact") {
          dispatchBackgroundTask(generateAndSendAiResponse(convId, context.companyId));
          triggeredAi = true;
        }
      }

      return {
        sucesso: true,
        conversa_id: convId,
        agente_nome: agent.name,
        agente_id: agent.id,
        funcao_tipo: agent.ai_type,
        ia_ativa: true,
        resposta_disparada: triggeredAi,
        mensagem: `Atendimento delegado com sucesso para ${agent.name} (${agent.ai_type}).${triggeredAi ? " A IA já está processando a resposta." : ""}`,
      };
    },
  },

  // 12. Forçar / Disparar Resposta da IA Sob Demanda
  {
    name: "disparar_resposta_ia",
    description:
      "Força o agente de IA da conversa a formular e enviar imediatamente a resposta para o cliente no WhatsApp/Instagram com base no histórico atual.",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa onde a IA deve responder.",
        },
      },
      required: ["conversa_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, ai_active, ai_agent_id, status, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      if (conv.status === "resolved") {
        throw new Error(
          "Esta conversa já está encerrada/resolvida. Reabra-a antes de acionar a IA.",
        );
      }

      // Garante que a IA está ativa na conversa
      if (!conv.ai_active) {
        await supabaseAdmin
          .from("conversations")
          .update({ ai_active: true, assigned_agent_id: null })
          .eq("id", convId);
      }

      dispatchBackgroundTask(generateAndSendAiResponse(convId, context.companyId));

      return {
        sucesso: true,
        conversa_id: convId,
        mensagem: "Agente de IA engajado com sucesso! A resposta está sendo gerada e enviada.",
      };
    },
  },

  // 13. Agendar Mensagem Futura da IA no WhatsApp
  {
    name: "agendar_mensagem_ia",
    description:
      "Agenda uma mensagem para ser enviada automaticamente ao cliente no WhatsApp em data e horário futuros (ex: 'amanhã às 10:00', 'em 2 dias às 14:00', '2026-11-28 15:30', 'segunda-feira às 11:00').",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa do cliente.",
        },
        texto: {
          type: "string",
          description:
            "Conteúdo acolhedor e natural que será enviado ao cliente no horário agendado.",
        },
        data_hora: {
          type: "string",
          description:
            "Data e horário do envio futuro (ex: 'amanhã às 10:00', 'em 2 dias às 15h', '2026-11-25 14:30', 'quinta-feira às 09:30').",
        },
        agente_id_ou_nome: {
          type: "string",
          description: "ID ou nome do agente de IA que assina o agendamento (opcional).",
        },
        motivo: {
          type: "string",
          description: "Motivo ou lembrete interno do agendamento (opcional).",
        },
      },
      required: ["conversa_id", "texto", "data_hora"],
    },
    handler: async (args: any, context: McpContext) => {
      const convId = args.conversa_id;

      const { data: conv, error: convErr } = await supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contact_id, contacts!inner(company_id)")
        .eq("id", convId)
        .single();

      if (convErr || !conv || conv.contacts?.company_id !== context.companyId) {
        throw new Error("Conversa não encontrada ou acesso negado.");
      }

      if (context.unitId && conv.unit_id && conv.unit_id !== context.unitId) {
        throw new Error("Acesso negado: a conversa pertence a outra filial.");
      }

      const parsedDue = parseTaskDueDate(args.data_hora);

      let aiAgentId = null;
      if (args.agente_id_ou_nome) {
        const agent = await resolveAgent(context.companyId, args.agente_id_ou_nome);
        if (agent) aiAgentId = agent.id;
      }

      const scheduled = await scheduleMessage({
        companyId: context.companyId,
        conversationId: convId,
        contactId: conv.contact_id,
        unitId: conv.unit_id,
        creatorType: "agent",
        aiAgentId,
        content: String(args.texto).trim(),
        scheduledAt: parsedDue,
        metadata: {
          reason: args.motivo ? String(args.motivo).trim() : "Agendamento via MCP",
          created_by: context.userName || context.keyName,
        },
      });

      return {
        sucesso: true,
        agendamento_id: scheduled.id,
        conversa_id: convId,
        data_agendada_utc: scheduled.scheduled_at,
        data_agendada_brasilia: new Date(scheduled.scheduled_at).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
        texto: scheduled.content,
        mensagem: `Mensagem agendada com sucesso para ${new Date(scheduled.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}!`,
      };
    },
  },

  // 14. Listar Mensagens Agendadas
  {
    name: "listar_mensagens_agendadas",
    description:
      "Lista mensagens agendadas para envio futuro no WhatsApp, com filtros por conversa e status ('pending', 'sent', 'cancelled', 'failed', 'all').",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        conversa_id: {
          type: "string",
          description: "ID da conversa para filtrar agendamentos específicos. Opcional.",
        },
        status: {
          type: "string",
          enum: ["pending", "sent", "cancelled", "failed", "all"],
          description: "Status das mensagens. Padrão: 'pending'.",
          default: "pending",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de registros. Padrão: 20.",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = (supabaseAdmin as any)
        .from("scheduled_messages")
        .select(
          `
          id,
          conversation_id,
          contact_id,
          content,
          scheduled_at,
          status,
          cancel_reason,
          created_at,
          ai_agents(name),
          contacts(name, phone)
        `,
        )
        .eq("company_id", context.companyId)
        .order("scheduled_at", { ascending: true })
        .limit(args.limite || 20);

      if (args.conversa_id) {
        query = query.eq("conversation_id", args.conversa_id);
      }

      if (args.status && args.status !== "all") {
        query = query.eq("status", args.status);
      }

      if (context.unitId) {
        query = query.or(`unit_id.is.null,unit_id.eq.${context.unitId}`);
      }

      const { data: messages, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar mensagens agendadas: ${error.message}`);
      }

      return {
        total: messages?.length || 0,
        mensagens_agendadas: (messages || []).map((m: any) => ({
          id: m.id,
          conversa_id: m.conversation_id,
          cliente: m.contacts?.name || "Desconhecido",
          telefone: m.contacts?.phone || "",
          agente_ia: m.ai_agents?.name || "IA Geral",
          conteudo: m.content,
          data_agendada_brasilia: new Date(m.scheduled_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          }),
          status: m.status,
          motivo_cancelamento: m.cancel_reason,
        })),
      };
    },
  },

  // 15. Cancelar Mensagem Agendada
  {
    name: "cancelar_mensagem_agendada",
    description:
      "Cancela o envio de mensagens agendadas pendentes (por ID específico ou cancelando todos os agendamentos pendentes de uma conversa).",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        agendamento_id: {
          type: "string",
          description: "ID (UUID) do agendamento específico a ser cancelado.",
        },
        conversa_id: {
          type: "string",
          description: "ID (UUID) da conversa para cancelar todos os agendamentos pendentes.",
        },
        motivo: {
          type: "string",
          description: "Motivo ou justificativa do cancelamento.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      if (!args.agendamento_id && !args.conversa_id) {
        throw new Error("Informe 'agendamento_id' ou 'conversa_id' para realizar o cancelamento.");
      }

      const reason = args.motivo?.trim() || "Cancelado via MCP";

      if (args.agendamento_id) {
        const { data: scheduled, error: fetchErr } = await (supabaseAdmin as any)
          .from("scheduled_messages")
          .select("id, status, company_id")
          .eq("id", args.agendamento_id)
          .eq("company_id", context.companyId)
          .single();

        if (fetchErr || !scheduled) {
          throw new Error("Agendamento não encontrado ou acesso negado.");
        }

        if (scheduled.status !== "pending") {
          return {
            sucesso: false,
            mensagem: `O agendamento já está com status '${scheduled.status}' e não pôde ser cancelado.`,
          };
        }

        const { error: cancelErr } = await (supabaseAdmin as any)
          .from("scheduled_messages")
          .update({
            status: "cancelled",
            cancel_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", args.agendamento_id);

        if (cancelErr) throw new Error(`Erro ao cancelar agendamento: ${cancelErr.message}`);

        return {
          sucesso: true,
          agendamento_id: args.agendamento_id,
          mensagem: "Mensagem agendada cancelada com sucesso.",
        };
      }

      if (args.conversa_id) {
        const cancelled = await cancelScheduledMessagesForConversation(
          args.conversa_id,
          reason,
          "all",
        );

        return {
          sucesso: true,
          conversa_id: args.conversa_id,
          total_canceladas: cancelled.length,
          mensagem: `${cancelled.length} mensagem(ns) agendada(s) cancelada(s) nesta conversa.`,
        };
      }
    },
  },

  // 16. Listar Alertas do Radar de Risco e Sentimento da IA
  {
    name: "listar_alertas_radar",
    description:
      "Lista atendimentos em que o Radar de IA detectou risco de insatisfação grave, ameaça de cancelamento (churn), incidente técnico crítico ou risco jurídico/reclamação formal.",
    security: {
      category: "ai_agents",
      requiredMenu: "conversations",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        apenas_risco_critico: {
          type: "boolean",
          description:
            "Se true, filtra apenas alertas classificados como risco alto ou crítico. Padrão: false.",
          default: false,
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de atendimentos retornados. Padrão: 20.",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("conversations")
        .select(
          `
          id,
          status,
          channel,
          radar_status,
          radar_last_alert_at,
          last_message_preview,
          last_message_at,
          ai_active,
          ai_agents(name),
          contacts!inner(id, name, phone, company_id),
          units(name)
        `,
        )
        .eq("contacts.company_id", context.companyId)
        .not("radar_status", "is", null)
        .order("radar_last_alert_at", { ascending: false })
        .limit(args.limite || 20);

      if (args.apenas_risco_critico) {
        query = query.in("radar_status", ["risk", "critical"]);
      } else {
        query = query.neq("radar_status", "normal");
      }

      if (context.unitId) {
        query = query.or(`unit_id.is.null,unit_id.eq.${context.unitId}`);
      }

      const { data: convs, error } = await query;
      if (error) {
        throw new Error(`Erro ao buscar alertas do Radar: ${error.message}`);
      }

      return {
        total: convs?.length || 0,
        alertas: (convs || []).map((c: any) => ({
          conversa_id: c.id,
          cliente: c.contacts?.name,
          telefone: c.contacts?.phone,
          canal: c.channel,
          unidade: c.units?.name || "Matriz",
          status_conversa: c.status,
          ia_responsavel: c.ai_agents?.name || (c.ai_active ? "IA Ativa" : "Pausada"),
          gravidade_radar: c.radar_status,
          ultimo_alerta_em: c.radar_last_alert_at,
          ultima_mensagem: c.last_message_preview,
        })),
      };
    },
  },
];
