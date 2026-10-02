/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const settingsTools: McpToolDefinition[] = [
  {
    name: "atualizar_configuracao_sla",
    description:
      "Atualiza os parâmetros e políticas de SLA de atendimento da empresa (limite de primeira resposta, limite de resposta contínua, tempo limite de resolução em horas, percentual de alerta e se considera apenas horários comerciais). Exclusivo para administradores.",
    security: {
      requiredMenu: "settings",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        sla_ativo: {
          type: "boolean",
          description: "Ativar ou desativar o monitoramento de SLA na empresa.",
        },
        tempo_primeira_resposta_minutos: {
          type: "number",
          description:
            "Tempo máximo tolerado em minutos para o atendente dar a primeira resposta ao cliente (ex: 5, 10, 15).",
        },
        tempo_resposta_minutos: {
          type: "number",
          description:
            "Tempo máximo tolerado em minutos entre respostas subsequentes do atendente (ex: 10, 15, 30).",
        },
        tempo_resolucao_horas: {
          type: "number",
          description:
            "Tempo máximo em horas para finalizar/resolver o ticket de atendimento (ex: 24, 48).",
        },
        alerta_warning_percentual: {
          type: "number",
          description:
            "Percentual do tempo de SLA para disparar aviso amarelo de advertência (ex: 75 para 75%).",
        },
        considerar_apenas_horario_comercial: {
          type: "boolean",
          description:
            "Se true, o tempo de SLA só é contabilizado dentro do expediente de atendimento da empresa/filial.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      // 1. Obter custom_variables atuais da empresa
      const { data: company, error: fetchErr } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      if (fetchErr) {
        throw new Error(`Falha ao carregar configurações da empresa: ${fetchErr.message}`);
      }

      const customVars = (company?.custom_variables as Record<string, any>) || {};
      const currentSla = (customVars.sla as Record<string, any>) || {};

      const updatedSla = {
        ...currentSla,
        ...(args.sla_ativo !== undefined ? { enabled: Boolean(args.sla_ativo) } : {}),
        ...(args.tempo_primeira_resposta_minutos !== undefined
          ? { first_response_limit_minutes: Number(args.tempo_primeira_resposta_minutos) }
          : {}),
        ...(args.tempo_resposta_minutos !== undefined
          ? { response_limit_minutes: Number(args.tempo_resposta_minutos) }
          : {}),
        ...(args.tempo_resolucao_horas !== undefined
          ? { resolution_limit_hours: Number(args.tempo_resolucao_horas) }
          : {}),
        ...(args.alerta_warning_percentual !== undefined
          ? { warning_threshold_percent: Number(args.alerta_warning_percentual) }
          : {}),
        ...(args.considerar_apenas_horario_comercial !== undefined
          ? { count_business_hours_only: Boolean(args.considerar_apenas_horario_comercial) }
          : {}),
      };

      const newCustomVars = {
        ...customVars,
        sla: updatedSla,
      };

      const { error: updateErr } = await supabaseAdmin
        .from("companies")
        .update({ custom_variables: newCustomVars })
        .eq("id", context.companyId);

      if (updateErr) {
        throw new Error(`Erro ao atualizar configurações de SLA: ${updateErr.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Configurações de SLA da empresa atualizadas com sucesso.",
        sla_atualizado: updatedSla,
      };
    },
  },
  {
    name: "criar_etiqueta_contato",
    description:
      "Cria uma nova etiqueta (tag) no sistema para classificar e organizar contatos e leads.",
    security: {
      requiredMenu: "contacts",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome da etiqueta (ex: 'Cliente VIP', 'B2B', 'Inadimplente', 'Parceiro').",
        },
        cor: {
          type: "string",
          description:
            "Cor hexadecimal da etiqueta (ex: '#10b981', '#ef4444', '#3b82f6'). Padrão: '#6b7280'.",
          default: "#6b7280",
        },
      },
      required: ["nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const nome = args.nome?.trim();
      if (!nome) throw new Error("O nome da etiqueta é obrigatório.");

      // Verificar se já existe etiqueta com o mesmo nome
      const { data: existing } = await supabaseAdmin
        .from("labels")
        .select("id, name")
        .eq("company_id", context.companyId)
        .ilike("name", nome)
        .maybeSingle();

      if (existing) {
        return {
          sucesso: false,
          mensagem: `Já existe uma etiqueta cadastrada com o nome "${existing.name}".`,
          etiqueta: existing,
        };
      }

      const cor = args.cor || "#6b7280";
      const { data: created, error } = await supabaseAdmin
        .from("labels")
        .insert({
          company_id: context.companyId,
          name: nome,
          color: cor,
          external_id: crypto.randomUUID(),
        })
        .select("id, name, color, created_at")
        .single();

      if (error) {
        throw new Error(`Erro ao criar etiqueta: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Etiqueta "${nome}" criada com sucesso!`,
        etiqueta: created,
      };
    },
  },
  {
    name: "listar_etiquetas_empresa",
    description:
      "Lista todas as etiquetas/tags disponíveis na empresa para categorização de contatos.",
    security: {
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: labels, error } = await supabaseAdmin
        .from("labels")
        .select("id, name, color, created_at")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error) throw new Error(`Erro ao listar etiquetas: ${error.message}`);

      return {
        total: labels?.length || 0,
        etiquetas: labels || [],
      };
    },
  },
  {
    name: "criar_motivo_encerramento",
    description:
      "Cadastra um novo motivo oficial de resolução/encerramento de atendimento na plataforma.",
    security: {
      requiredMenu: "settings",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          description:
            "Descrição do motivo de encerramento (ex: 'Dúvida Sanada', 'Venda Efetivada', 'Sem Interesse').",
        },
      },
      required: ["motivo"],
    },
    handler: async (args: any, context: McpContext) => {
      const motivo = args.motivo?.trim();
      if (!motivo) throw new Error("A descrição do motivo é obrigatória.");

      const { data: existingReasons } = await supabaseAdmin
        .from("resolution_reasons" as any)
        .select("id, label, order")
        .eq("company_id", context.companyId)
        .order("order", { ascending: false });

      const maxOrder = existingReasons?.[0]?.order ?? 0;

      const { data: created, error } = await supabaseAdmin
        .from("resolution_reasons" as any)
        .insert({
          company_id: context.companyId,
          label: motivo,
          order: maxOrder + 1,
          active: true,
        })
        .select("id, label, order, active")
        .single();

      if (error) {
        throw new Error(`Erro ao cadastrar motivo de encerramento: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Motivo de encerramento "${motivo}" cadastrado com sucesso!`,
        motivo: created,
      };
    },
  },
  {
    name: "criar_funil",
    description: "Cria um novo funil de vendas (pipeline de CRM) para a empresa.",
    security: {
      requiredMenu: "pipeline",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description:
            "Nome do funil de vendas (ex: 'Vendas Novos Clientes', 'Pós-Venda e Retenção', 'B2B').",
        },
      },
      required: ["nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const nome = args.nome?.trim();
      if (!nome) throw new Error("O nome do funil é obrigatório.");

      const { data: created, error } = await supabaseAdmin
        .from("pipelines")
        .insert({
          company_id: context.companyId,
          name: nome,
        })
        .select("id, name, created_at")
        .single();

      if (error) {
        throw new Error(`Erro ao criar funil de vendas: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Funil de vendas "${nome}" criado com sucesso!`,
        funil: created,
      };
    },
  },
  {
    name: "criar_etapa_funil",
    description:
      "Adiciona uma nova etapa a um funil de vendas existente com cor e ordem de exibição.",
    security: {
      requiredMenu: "pipeline",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        funil_id: {
          type: "string",
          description: "ID do funil de vendas ao qual a etapa será adicionada.",
        },
        nome: {
          type: "string",
          description:
            "Nome da etapa (ex: 'Qualificação', 'Demonstração Agendada', 'Proposta Enviada').",
        },
        cor: {
          type: "string",
          description:
            "Cor hexadecimal do cabeçalho da etapa (ex: '#3b82f6', '#10b981', '#f59e0b'). Padrão: '#3b82f6'.",
          default: "#3b82f6",
        },
        ordem: {
          type: "number",
          description: "Posição ordinal da etapa no Kanban. Se omitido, será adicionada ao final.",
        },
      },
      required: ["funil_id", "nome"],
    },
    handler: async (args: any, context: McpContext) => {
      const funilId = args.funil_id?.trim();
      const nome = args.nome?.trim();
      if (!funilId || !nome) throw new Error("funil_id e nome são obrigatórios.");

      // Verificar existência do funil
      const { data: pipeline, error: pipeErr } = await supabaseAdmin
        .from("pipelines")
        .select("id, name")
        .eq("id", funilId)
        .eq("company_id", context.companyId)
        .single();

      if (pipeErr || !pipeline) {
        throw new Error(`Funil de vendas não encontrado ou não pertence à empresa.`);
      }

      // Descobrir maior ordem atual se ordem não foi passada
      let targetOrder = typeof args.ordem === "number" ? args.ordem : null;
      if (targetOrder === null) {
        const { data: existingStages } = await supabaseAdmin
          .from("pipeline_stages")
          .select("order")
          .eq("pipeline_id", funilId)
          .order("order", { ascending: false })
          .limit(1);

        targetOrder = (existingStages?.[0]?.order ?? 0) + 1;
      }

      // Descobrir uma unidade de referência para vincular à etapa (requerido pelo schema histórico)
      let stageUnitId = context.unitId;
      if (!stageUnitId) {
        const { data: fallbackUnit } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .limit(1)
          .single();
        stageUnitId = fallbackUnit?.id || null;
      }

      const { data: createdStage, error: stageErr } = await supabaseAdmin
        .from("pipeline_stages")
        .insert({
          pipeline_id: funilId,
          name: nome,
          color: args.cor || "#3b82f6",
          order: targetOrder,
          unit_id: stageUnitId,
        })
        .select("id, name, color, order, pipeline_id, created_at")
        .single();

      if (stageErr) {
        throw new Error(`Erro ao criar etapa: ${stageErr.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Etapa "${nome}" adicionada ao funil "${pipeline.name}" com sucesso!`,
        etapa: createdStage,
      };
    },
  },
  {
    name: "atualizar_unidade",
    description:
      "Atualiza informações cadastrais de uma filial/unidade (nome, endereço, horários de funcionamento, cor ou status de ativação). Exclusivo para administradores.",
    security: {
      requiredMenu: "units",
      minRole: "admin_company",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        unidade_id: {
          type: "string",
          description: "ID da unidade a ser atualizada.",
        },
        nome: {
          type: "string",
          description: "Novo nome da unidade/filial.",
        },
        endereco: {
          type: "string",
          description: "Endereço físico completo da unidade.",
        },
        horario_funcionamento: {
          type: "string",
          description:
            "Descrição textual dos horários de atendimento (ex: 'Seg a Sex das 08h às 18h, Sáb das 08h às 12h').",
        },
        cor: {
          type: "string",
          description: "Cor identificadora da filial (ex: '#10b981').",
        },
        ativo: {
          type: "boolean",
          description: "Ativar ou suspender o funcionamento desta filial.",
        },
      },
      required: ["unidade_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const unitId = args.unidade_id?.trim();
      if (!unitId) throw new Error("unidade_id é obrigatório.");

      const updateData: Record<string, any> = {};
      if (args.nome) updateData.name = args.nome.trim();
      if (args.endereco !== undefined) updateData.address = args.endereco;
      if (args.horario_funcionamento !== undefined)
        updateData.business_hours = args.horario_funcionamento;
      if (args.cor) updateData.color = args.cor;
      if (args.ativo !== undefined) updateData.active = Boolean(args.ativo);

      if (Object.keys(updateData).length === 0) {
        throw new Error("Nenhum dado informado para atualização.");
      }

      const { data: updated, error } = await supabaseAdmin
        .from("units")
        .update(updateData)
        .eq("id", unitId)
        .eq("company_id", context.companyId)
        .select("id, name, slug, address, business_hours, color, active")
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar unidade: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: `Unidade "${updated.name}" atualizada com sucesso!`,
        unidade: updated,
      };
    },
  },
  {
    name: "listar_usuarios_empresa",
    description:
      "Lista os membros e colaboradores da equipe cadastrados na empresa com seus cargos, departamentos e emails.",
    security: {
      minRole: "manager",
    },
    inputSchema: {
      type: "object",
      properties: {
        somente_atendentes: {
          type: "boolean",
          description: "Se true, filtra apenas colaboradores com perfil de atendente (agent).",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      let query = supabaseAdmin
        .from("profiles")
        .select(
          "id, name, email, role, department_id, has_matriz_access, departments!profiles_department_id_fkey(name), company_roles:custom_role_id(name, base_role)",
        )
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (args.somente_atendentes) {
        query = query.eq("role", "agent");
      }

      const { data: users, error } = await query;
      if (error) throw new Error(`Erro ao buscar usuários: ${error.message}`);

      const formatted = (users || []).map((u: any) => ({
        id: u.id,
        nome: u.name,
        email: u.email,
        papel: u.role,
        cargo_personalizado: u.company_roles?.name || null,
        departamento: u.departments?.name || "Sem departamento",
        acesso_matriz: Boolean(u.has_matriz_access),
      }));

      return {
        total: formatted.length,
        colaboradores: formatted,
      };
    },
  },
];
