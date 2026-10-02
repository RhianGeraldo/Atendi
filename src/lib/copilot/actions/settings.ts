/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

export const settingsActions: CopilotAction[] = [
  {
    name: "atualizar_sla",
    label: "Ajustar Políticas de SLA",
    description:
      "Atualiza as regras de SLA de atendimento da empresa (limite de primeira resposta, limite de resposta contínua, horas de resolução e se considera apenas horário comercial). Exclusivo para administradores.",
    minRole: "admin_company",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        sla_ativo: {
          type: "boolean",
          description: "Ativar ou desativar o cálculo de SLA na empresa.",
        },
        tempo_primeira_resposta_minutos: {
          type: "number",
          description:
            "Tempo limite em minutos para o atendente enviar a primeira resposta ao cliente (ex: 5, 10, 15).",
        },
        tempo_resposta_minutos: {
          type: "number",
          description:
            "Tempo limite em minutos entre respostas subsequentes durante o atendimento (ex: 15, 30).",
        },
        tempo_resolucao_horas: {
          type: "number",
          description: "Tempo máximo em horas para finalização do atendimento (ex: 24, 48).",
        },
        considerar_apenas_horario_comercial: {
          type: "boolean",
          description:
            "Se true, o tempo de SLA só é contabilizado dentro do expediente de trabalho da empresa.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: company, error: fetchErr } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      if (fetchErr || !company) {
        return { success: false, message: `Erro ao buscar dados da empresa: ${fetchErr?.message}` };
      }

      const customVars = (company.custom_variables as Record<string, any>) || {};
      const currentSla = (customVars.sla as Record<string, any>) || {};

      const updatedSla = {
        ...currentSla,
        ...(params.sla_ativo !== undefined ? { enabled: Boolean(params.sla_ativo) } : {}),
        ...(params.tempo_primeira_resposta_minutos !== undefined
          ? { first_response_limit_minutes: Number(params.tempo_primeira_resposta_minutos) }
          : {}),
        ...(params.tempo_resposta_minutos !== undefined
          ? { response_limit_minutes: Number(params.tempo_resposta_minutos) }
          : {}),
        ...(params.tempo_resolucao_horas !== undefined
          ? { resolution_limit_hours: Number(params.tempo_resolucao_horas) }
          : {}),
        ...(params.considerar_apenas_horario_comercial !== undefined
          ? { count_business_hours_only: Boolean(params.considerar_apenas_horario_comercial) }
          : {}),
      };

      const { error: updateErr } = await supabaseAdmin
        .from("companies")
        .update({ custom_variables: { ...customVars, sla: updatedSla } })
        .eq("id", context.companyId);

      if (updateErr) {
        return { success: false, message: `Erro ao atualizar SLA: ${updateErr.message}` };
      }

      return {
        success: true,
        message: "Configurações de SLA da empresa atualizadas com sucesso.",
        data: updatedSla,
      };
    },
  },
  {
    name: "consultar_sla",
    label: "Consultar Configurações de SLA",
    description: "Consulta as regras, metas e tempos de resposta do SLA configurados na empresa.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      const customVars = (company?.custom_variables as Record<string, any>) || {};
      const sla = (customVars.sla as Record<string, any>) || {};

      return {
        success: true,
        message: "Dados de SLA consultados.",
        data: {
          ativo: sla.enabled ?? true,
          tempo_primeira_resposta_minutos: sla.first_response_limit_minutes ?? 15,
          tempo_resposta_continua_minutos: sla.response_limit_minutes ?? 30,
          tempo_resolucao_horas: sla.resolution_limit_hours ?? 48,
          apenas_horario_comercial: sla.count_business_hours_only ?? true,
        },
      };
    },
  },
  {
    name: "criar_etiqueta",
    label: "Criar Etiqueta de Contato",
    description: "Cria uma nova etiqueta (tag) no sistema para classificar contatos e leads.",
    minRole: "admin_company",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description:
            "Nome da etiqueta (ex: 'Cliente VIP', 'B2B', 'Interessado Curso', 'Lead Frio').",
        },
        cor: {
          type: "string",
          description:
            "Cor hexadecimal da etiqueta (ex: '#10b981', '#3b82f6', '#f59e0b'). Padrão: '#6b7280'.",
          default: "#6b7280",
        },
      },
      required: ["nome"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const nome = params.nome?.trim();
      if (!nome) return { success: false, message: "O nome da etiqueta é obrigatório." };

      const { data: existing } = await supabaseAdmin
        .from("labels")
        .select("id, name")
        .eq("company_id", context.companyId)
        .ilike("name", nome)
        .maybeSingle();

      if (existing) {
        return {
          success: false,
          message: `A etiqueta "${existing.name}" já está cadastrada na empresa.`,
          data: existing,
        };
      }

      const { data: created, error } = await supabaseAdmin
        .from("labels")
        .insert({
          company_id: context.companyId,
          name: nome,
          color: params.cor || "#6b7280",
          external_id: crypto.randomUUID(),
        })
        .select("id, name, color")
        .single();

      if (error) {
        return { success: false, message: `Erro ao criar etiqueta: ${error.message}` };
      }

      return {
        success: true,
        message: `Etiqueta "${nome}" criada com sucesso!`,
        data: created,
      };
    },
  },
  {
    name: "listar_etiquetas",
    label: "Listar Etiquetas da Empresa",
    description: "Lista todas as etiquetas de contato cadastradas na empresa.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: labels, error } = await supabaseAdmin
        .from("labels")
        .select("id, name, color")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error) return { success: false, message: `Erro ao buscar etiquetas: ${error.message}` };

      return {
        success: true,
        message: `${labels?.length || 0} etiquetas encontradas.`,
        data: labels || [],
      };
    },
  },
  {
    name: "criar_motivo_encerramento",
    label: "Criar Motivo de Encerramento",
    description: "Cadastra um novo motivo oficial para finalizar atendimentos na empresa.",
    minRole: "admin_company",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          description:
            "Descrição do motivo (ex: 'Dúvida Sanada', 'Venda Concluída', 'Sem Interesse').",
        },
      },
      required: ["motivo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const motivo = params.motivo?.trim();
      if (!motivo) return { success: false, message: "O motivo é obrigatório." };

      const { data: existing } = await supabaseAdmin
        .from("resolution_reasons" as any)
        .select("order")
        .eq("company_id", context.companyId)
        .order("order", { ascending: false })
        .limit(1);

      const maxOrder = existing?.[0]?.order ?? 0;

      const { data: created, error } = await supabaseAdmin
        .from("resolution_reasons" as any)
        .insert({
          company_id: context.companyId,
          label: motivo,
          order: maxOrder + 1,
          active: true,
        })
        .select("id, label, order")
        .single();

      if (error) return { success: false, message: `Erro ao criar motivo: ${error.message}` };

      return {
        success: true,
        message: `Motivo de encerramento "${motivo}" cadastrado com sucesso!`,
        data: created,
      };
    },
  },
  {
    name: "atualizar_unidade",
    label: "Atualizar Dados de Filial/Unidade",
    description: "Atualiza horário de funcionamento, endereço ou nome de uma unidade da empresa.",
    minRole: "admin_company",
    requiredMenu: "units",
    parameters: {
      type: "object",
      properties: {
        unidade_id: { type: "string", description: "ID da unidade/filial a ser atualizada." },
        nome: { type: "string", description: "Novo nome da unidade." },
        endereco: { type: "string", description: "Endereço físico completo da unidade." },
        horario_funcionamento: {
          type: "string",
          description: "Horários de funcionamento (ex: 'Seg a Sex: 08h às 18h, Sáb: 08h às 12h').",
        },
        ativo: { type: "boolean", description: "Ativar ou suspender a filial." },
      },
      required: ["unidade_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const updateData: Record<string, any> = {};
      if (params.nome) updateData.name = params.nome.trim();
      if (params.endereco !== undefined) updateData.address = params.endereco;
      if (params.horario_funcionamento !== undefined)
        updateData.business_hours = params.horario_funcionamento;
      if (params.ativo !== undefined) updateData.active = Boolean(params.ativo);

      const { data: updated, error } = await supabaseAdmin
        .from("units")
        .update(updateData)
        .eq("id", params.unidade_id)
        .eq("company_id", context.companyId)
        .select("id, name, address, business_hours, active")
        .single();

      if (error) return { success: false, message: `Erro ao atualizar unidade: ${error.message}` };

      return {
        success: true,
        message: `Unidade "${updated.name}" atualizada com sucesso!`,
        data: updated,
      };
    },
  },
  {
    name: "listar_equipe",
    label: "Listar Membros da Equipe",
    description: "Lista os colaboradores, atendentes e gestores cadastrados na empresa.",
    minRole: "manager",
    parameters: {
      type: "object",
      properties: {
        somente_atendentes: { type: "boolean", description: "Filtrar apenas atendentes." },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      let query = supabaseAdmin
        .from("profiles")
        .select("id, name, email, role, departments!profiles_department_id_fkey(name)")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (params.somente_atendentes) {
        query = query.eq("role", "agent");
      }

      const { data: users, error } = await query;
      if (error)
        return { success: false, message: `Erro ao buscar colaboradores: ${error.message}` };

      const formatted = (users || []).map((u: any) => ({
        id: u.id,
        nome: u.name,
        email: u.email,
        papel: u.role,
        departamento: u.departments?.name || "Geral",
      }));

      return {
        success: true,
        message: `${formatted.length} membros encontrados.`,
        data: formatted,
      };
    },
  },
  {
    name: "buscar_atendente_por_nome",
    label: "Buscar Atendente por Nome",
    description:
      "Localiza um membro da equipe pelo nome para obter seu ID. Use antes de transferir conversa ou atribuir tarefa a uma pessoa específica pelo nome.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome ou parte do nome do atendente/colaborador." },
      },
      required: ["nome"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const term = String(params.nome).trim();
      const { data: users, error } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email, role")
        .eq("company_id", context.companyId)
        .ilike("name", `%${term}%`)
        .order("name", { ascending: true })
        .limit(5);

      if (error) return { success: false, message: `Erro ao buscar: ${error.message}` };
      if (!users || users.length === 0)
        return { success: false, message: `Nenhum colaborador encontrado com o nome "${term}".` };

      return {
        success: true,
        message: `${users.length} colaborador(es) encontrado(s).`,
        data: users.map((u: any) => ({ id: u.id, nome: u.name, email: u.email, papel: u.role })),
      };
    },
  },
  {
    name: "listar_departamentos",
    label: "Listar Departamentos da Empresa",
    description:
      "Lista os departamentos cadastrados na empresa. Use para obter o ID do departamento antes de transferir uma conversa para ele.",
    minRole: "agent",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: depts, error } = await supabaseAdmin
        .from("departments")
        .select("id, name, description")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (error)
        return { success: false, message: `Erro ao listar departamentos: ${error.message}` };

      return {
        success: true,
        message: `${depts?.length || 0} departamento(s) encontrado(s).`,
        data: depts || [],
      };
    },
  },
  {
    name: "listar_unidades",
    label: "Listar Unidades e Filiais",
    description:
      "Lista todas as unidades / filiais da empresa com seus IDs, nomes, slugs, endereços e horários de funcionamento.",
    minRole: "agent",
    requiredMenu: "units",
    parameters: {
      type: "object",
      properties: {
        somente_ativas: {
          type: "boolean",
          description: "Filtrar apenas unidades ativas. Padrão: true.",
          default: true,
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const activeOnly = params?.somente_ativas !== false;

      let query = supabaseAdmin
        .from("units")
        .select("id, name, slug, address, business_hours, color, active, created_at")
        .eq("company_id", context.companyId)
        .order("name", { ascending: true });

      if (context.unitId && !context.hasMatrizAccess && context.userRole !== "admin_company") {
        query = query.eq("id", context.unitId);
      } else if (activeOnly) {
        query = query.eq("active", true);
      }

      const { data: units, error } = await query;
      if (error) {
        return { success: false, message: `Erro ao listar unidades: ${error.message}` };
      }

      return {
        success: true,
        message: `${units?.length || 0} unidade(s) encontrada(s).`,
        data: {
          empresa: context.companyName,
          escopo:
            context.unitId && !context.hasMatrizAccess
              ? `Restrito à unidade ${context.unitName}`
              : "Matriz (Todas as Unidades)",
          total: units?.length || 0,
          unidades: units || [],
        },
      };
    },
  },
  {
    name: "consultar_unidade",
    label: "Consultar Detalhes da Unidade",
    description:
      "Consulta os dados detalhados de uma unidade/filial específica (endereço, CNPJ, horários, variáveis locais personalizadas).",
    minRole: "agent",
    requiredMenu: "units",
    parameters: {
      type: "object",
      properties: {
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade a consultar. Se omitido, busca a unidade do contexto.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const targetUnitId = params?.unidade_id || context.unitId;
      if (!targetUnitId) {
        return {
          success: false,
          message: "Informe a unidade_id para consultar os detalhes da filial.",
        };
      }

      const { data: unit, error } = await supabaseAdmin
        .from("units")
        .select(
          "id, name, slug, address, business_hours, document, custom_variables, color, active",
        )
        .eq("id", targetUnitId)
        .eq("company_id", context.companyId)
        .single();

      if (error || !unit) {
        return { success: false, message: "Unidade não encontrada ou acesso negado." };
      }

      return {
        success: true,
        message: `Dados da unidade "${unit.name}" recuperados com sucesso! 🏢`,
        data: { unidade: unit },
      };
    },
  },
  {
    name: "consultar_sla_atendimento",
    label: "Consultar SLA de Atendimento",
    description:
      "Consulta a política e parâmetros de SLA de atendimento configurados na empresa (tempo limite de primeira resposta, tempo de resposta contínua, limite de resolução e horários comerciais).",
    minRole: "agent",
    requiredMenu: "settings",
    parameters: { type: "object", properties: {} },
    execute: async (params: any, context: CopilotContext) => {
      const action = settingsActions.find((a) => a.name === "consultar_sla");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
  {
    name: "atualizar_configuracao_sla",
    label: "Atualizar Configuração de SLA",
    description:
      "Atualiza os parâmetros e políticas de SLA de atendimento da empresa (limite de primeira resposta, limite de resposta contínua, tempo limite de resolução em horas, e se considera apenas horários comerciais). Exclusivo para administradores.",
    minRole: "admin_company",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        sla_ativo: { type: "boolean", description: "Ativar ou desativar o monitoramento de SLA." },
        tempo_primeira_resposta_minutos: {
          type: "number",
          description: "Tempo máximo tolerado em minutos para o atendente dar a primeira resposta.",
        },
        tempo_resposta_minutos: {
          type: "number",
          description: "Tempo máximo tolerado em minutos entre respostas subsequentes.",
        },
        tempo_resolucao_horas: {
          type: "number",
          description: "Tempo máximo em horas para finalizar o ticket.",
        },
        considerar_apenas_horario_comercial: {
          type: "boolean",
          description: "Se true, o tempo de SLA só é contabilizado dentro do expediente.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = settingsActions.find((a) => a.name === "atualizar_sla");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
  {
    name: "criar_etiqueta_contato",
    label: "Criar Etiqueta de Contato",
    description:
      "Cria uma nova etiqueta (tag) no sistema para classificar e organizar contatos e leads.",
    minRole: "admin_company",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome da etiqueta (ex: 'VIP', 'Lead Frio')." },
        cor: { type: "string", description: "Cor em hexadecimal (ex: '#10b981')." },
      },
      required: ["nome"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = settingsActions.find((a) => a.name === "criar_etiqueta");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
  {
    name: "listar_etiquetas_empresa",
    label: "Listar Etiquetas da Empresa",
    description:
      "Lista todas as etiquetas/tags disponíveis na empresa para categorização de contatos.",
    minRole: "agent",
    requiredMenu: "settings",
    parameters: { type: "object", properties: {} },
    execute: async (params: any, context: CopilotContext) => {
      const action = settingsActions.find((a) => a.name === "listar_etiquetas");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
  {
    name: "listar_usuarios_empresa",
    label: "Listar Usuários da Empresa",
    description:
      "Lista os membros e colaboradores da equipe cadastrados na empresa com seus cargos, departamentos e emails.",
    minRole: "manager",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        somente_atendentes: {
          type: "boolean",
          description: "Se true, filtra apenas colaboradores com perfil de atendente.",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = settingsActions.find((a) => a.name === "listar_equipe");
      if (action) return action.execute(params, context);
      return { success: false, message: "Ação não encontrada." };
    },
  },
];
