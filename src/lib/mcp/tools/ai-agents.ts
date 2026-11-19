/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName.trim());

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

  const partial = agents.find((a) => normalizeString(a.name).includes(target) || target.includes(normalizeString(a.name)));
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
          description: "Se true, filtra apenas agentes que estão ligados no momento. Padrão: false.",
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
        .select(`
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
          unit_id,
          instance_id,
          department_id,
          units(name, color),
          whatsapp_instances(name, provider, network),
          departments:departments!ai_agents_department_id_fkey(name),
          created_at,
          updated_at
        `)
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
        const { data: u } = await supabaseAdmin.from("units").select("name").eq("id", agent.unit_id).maybeSingle();
        if (u) unitName = u.name;
      }

      let instanceName = "Todos os Canais";
      if (agent.instance_id) {
        const { data: inst } = await supabaseAdmin.from("whatsapp_instances").select("name").eq("id", agent.instance_id).maybeSingle();
        if (inst) instanceName = inst.name;
      }

      let pipelineName = null;
      if (agent.pipeline_id) {
        const { data: pipe } = await supabaseAdmin.from("pipelines").select("name").eq("id", agent.pipeline_id).maybeSingle();
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
        },
        followup: {
          ativo: agent.allow_followup,
          intervalo_minutos: agent.followup_interval_minutes,
          max_tentativas: agent.followup_max_attempts,
          motivo_encerramento_id: agent.followup_resolution_reason_id,
        },
        autonomia_ferramentas: {
          transbordo_humano: agent.allow_handoff,
          departamento_transbordo_id: agent.handoff_department_id,
          encerramento: agent.allow_resolution,
          motivo_encerramento_padrao_id: agent.resolution_reason_id,
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
        tipo_funcao: { type: "string", description: "Nova função/tipo (ex: 'Vendedor / SDR', 'Suporte')." },
        descricao: { type: "string", description: "Resumo da função em 1 frase para os colegas de IA saberem quando transferir." },
        modelo: { type: "string", description: "Modelo LLM (ex: 'gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile')." },
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
          description: "Diretrizes e instruções passo a passo de como conduzir a conversa, negociar e responder.",
        },
        prompt_informacoes_extras: {
          type: "string",
          description: "Informações sobre a empresa, diferenciais, localização e regras de negócio.",
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
          description: "Tempo de inatividade do cliente antes de disparar o follow-up (em minutos, ex: 15).",
        },
        maximo_tentativas_followup: {
          type: "number",
          description: "Número máximo de tentativas de follow-up (ex: 3).",
        },
        prompt_followup: {
          type: "string",
          description: "Instruções específicas para as mensagens de follow-up da IA.",
        },
        permitir_transbordo_humano: {
          type: "boolean",
          description: "Se a IA pode transferir para atendente humano quando solicitado.",
        },
        permitir_encerramento: {
          type: "boolean",
          description: "Se a IA pode encerrar atendimentos concluídos.",
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
          description: "Vincular agente a uma filial específica, ou null/'all' para atender toda a empresa.",
        },
        instancia_id: {
          type: "string",
          description: "Vincular a uma conexão/instância de WhatsApp específica, ou null/'all' para atender todos os canais.",
        },
        departamento_id: {
          type: "string",
          description: "Vincular a um departamento específico, ou null/'all'.",
        },
        colegas_ia_permitidos: {
          type: "array",
          items: { type: "string" },
          description: "Lista de IDs de outros agentes de IA que este agente tem permissão de consultar ou transferir.",
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

      if (args.prompt_personalidade !== undefined) updates.prompt_personality = args.prompt_personalidade;
      if (args.prompt_instrucoes !== undefined) updates.prompt_instructions = args.prompt_instrucoes;
      if (args.prompt_informacoes_extras !== undefined) updates.prompt_extra_info = args.prompt_informacoes_extras;

      if (args.ativo !== undefined) updates.is_active = Boolean(args.ativo);
      if (args.assumir_conversas_padrao !== undefined) updates.active_by_default = Boolean(args.assumir_conversas_padrao);

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

      if (args.permitir_followup !== undefined) updates.allow_followup = Boolean(args.permitir_followup);
      if (args.intervalo_followup_minutos !== undefined) updates.followup_interval_minutes = Number(args.intervalo_followup_minutos);
      if (args.maximo_tentativas_followup !== undefined) updates.followup_max_attempts = Number(args.maximo_tentativas_followup);
      if (args.prompt_followup !== undefined) updates.prompt_followup = args.prompt_followup;

      if (args.permitir_transbordo_humano !== undefined) updates.allow_handoff = Boolean(args.permitir_transbordo_humano);
      if (args.permitir_encerramento !== undefined) updates.allow_resolution = Boolean(args.permitir_encerramento);
      if (args.permitir_tarefas_crm !== undefined) updates.allow_tasks = Boolean(args.permitir_tarefas_crm);
      if (args.permitir_oportunidades_crm !== undefined) updates.allow_opportunities = Boolean(args.permitir_oportunidades_crm);
      if (args.funil_crm_id !== undefined) {
        updates.pipeline_id =
          args.funil_crm_id === "none" || args.funil_crm_id === "nenhum" || !args.funil_crm_id
            ? null
            : args.funil_crm_id;
      }
      if (args.permitir_abertura_tickets !== undefined) updates.allow_tickets = Boolean(args.permitir_abertura_tickets);

      if (args.unidade_id !== undefined) {
        updates.unit_id =
          args.unidade_id === "all" || args.unidade_id === "nenhum" || args.unidade_id === "none" || !args.unidade_id
            ? null
            : args.unidade_id;
      }
      if (args.instancia_id !== undefined) {
        updates.instance_id =
          args.instancia_id === "all" || args.instancia_id === "nenhum" || args.instancia_id === "none" || !args.instancia_id
            ? null
            : args.instancia_id;
      }
      if (args.departamento_id !== undefined) {
        updates.department_id =
          args.departamento_id === "all" || args.departamento_id === "nenhum" || args.departamento_id === "none" || !args.departamento_id
            ? null
            : args.departamento_id;
      }
      if (args.colegas_ia_permitidos !== undefined) {
        updates.allowed_agent_ids = Array.isArray(args.colegas_ia_permitidos) && args.colegas_ia_permitidos.length > 0 ? args.colegas_ia_permitidos : null;
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
        tipo_funcao: { type: "string", description: "Tipo / Função (ex: 'Vendedor / SDR', 'Suporte Técnico', 'Pós-Venda')." },
        descricao: { type: "string", description: "Resumo da função em 1 frase para outros agentes de IA." },
        modelo: { type: "string", description: "Modelo LLM (ex: 'gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile'). Padrão: 'gpt-4o'." },
        provedor: {
          type: "string",
          enum: ["default", "openai", "groq", "openrouter"],
          description: "Provedor LLM. Padrão: 'default'.",
          default: "default",
        },
        max_tokens: { type: "number", description: "Limite de tokens de saída. Padrão: 4096." },
        prompt_personalidade: { type: "string", description: "Tom de voz e persona." },
        prompt_instrucoes: { type: "string", description: "Instruções operacionais e regras de atendimento." },
        prompt_informacoes_extras: { type: "string", description: "Informações sobre a clínica/empresa e diferenciais." },
        ativo: { type: "boolean", description: "Se o agente já inicia ativo. Padrão: true." },
        assumir_conversas_padrao: { type: "boolean", description: "Se assume novas conversas automaticamente. Padrão: true." },
        agente_principal: { type: "boolean", description: "Se é o agente principal da empresa/unidade." },
        permitir_followup: { type: "boolean", description: "Se envia follow-up automático de clientes sumidos. Padrão: true." },
        intervalo_followup_minutos: { type: "number", description: "Minutos de espera para follow-up. Padrão: 15." },
        maximo_tentativas_followup: { type: "number", description: "Tentativas de follow-up. Padrão: 3." },
        prompt_followup: { type: "string", description: "Instruções do follow-up." },
        permitir_transbordo_humano: { type: "boolean", description: "Padrão: true." },
        permitir_encerramento: { type: "boolean", description: "Padrão: true." },
        permitir_tarefas_crm: { type: "boolean", description: "Padrão: true." },
        permitir_oportunidades_crm: { type: "boolean", description: "Padrão: false." },
        funil_crm_id: { type: "string", description: "ID do funil do CRM." },
        permitir_abertura_tickets: { type: "boolean", description: "Padrão: true." },
        unidade_id: { type: "string", description: "ID da unidade física, ou null para toda a rede." },
        instancia_id: { type: "string", description: "ID da instância de WhatsApp, ou null para todos os canais." },
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
        allow_handoff: args.permitir_transbordo_humano !== false,
        allow_resolution: args.permitir_encerramento !== false,
        allow_tasks: args.permitir_tarefas_crm !== false,
        allow_opportunities: Boolean(args.permitir_oportunidades_crm),
        pipeline_id:
          args.funil_crm_id === "none" || args.funil_crm_id === "nenhum" || !args.funil_crm_id
            ? null
            : args.funil_crm_id,
        allow_tickets: args.permitir_abertura_tickets !== false,
        unit_id:
          args.unidade_id === "all" || args.unidade_id === "nenhum" || args.unidade_id === "none" || !args.unidade_id
            ? null
            : args.unidade_id,
        instance_id:
          args.instancia_id === "all" || args.instancia_id === "nenhum" || args.instancia_id === "none" || !args.instancia_id
            ? null
            : args.instancia_id,
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
        allow_handoff: source.allow_handoff,
        handoff_department_id: source.handoff_department_id,
        allow_resolution: source.allow_resolution,
        resolution_reason_id: source.resolution_reason_id,
        allow_tasks: source.allow_tasks,
        allow_opportunities: source.allow_opportunities,
        pipeline_id: source.pipeline_id,
        allow_tickets: source.allow_tickets,
        unit_id: args.unidade_destino_id !== undefined ? args.unidade_destino_id : source.unit_id,
        instance_id: args.instancia_destino_id !== undefined ? args.instancia_destino_id : null,
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

      const { error } = await supabaseAdmin
        .from("ai_agents")
        .delete()
        .eq("id", existing.id);

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
];
