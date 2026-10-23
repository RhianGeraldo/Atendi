/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

// Papéis que o MCP pode dar (super_admin nunca)
const TEAM_ROLES = ["agent", "manager", "admin_company"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

const USER_ADMIN_SECURITY = {
  requiredMenu: "settings",
  minRole: "admin_company" as const,
  isWriteAction: true,
};

/** Senha temporária forte e legível (a pessoa troca no primeiro acesso). */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = (n: number) =>
    Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

/** Confere que unidades, departamento e cargo informados são desta empresa. */
async function validateTeamRefs(
  companyId: string,
  refs: { unitIds?: string[]; departmentId?: string | null; customRoleId?: string | null },
) {
  if (refs.unitIds && refs.unitIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("units")
      .select("id")
      .eq("company_id", companyId)
      .in("id", refs.unitIds);
    const found = new Set((data || []).map((u: any) => u.id));
    const missing = refs.unitIds.filter((id) => !found.has(id));
    if (missing.length > 0)
      throw new Error(`Unidade(s) não encontrada(s) na empresa: ${missing.join(", ")}`);
  }
  if (refs.departmentId) {
    const { data } = await supabaseAdmin
      .from("departments")
      .select("id")
      .eq("id", refs.departmentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!data) throw new Error("Departamento não encontrado na empresa.");
  }
  if (refs.customRoleId) {
    const { data } = await (supabaseAdmin.from("company_roles") as any)
      .select("id")
      .eq("id", refs.customRoleId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!data) throw new Error("Cargo personalizado não encontrado na empresa.");
  }
}

/** Grava departamento e unidades do usuário (substitui os anteriores). */
async function saveTeamLinks(
  userId: string,
  links: { unitIds?: string[]; departmentId?: string | null },
) {
  if (links.departmentId !== undefined) {
    await supabaseAdmin.from("user_departments").delete().eq("user_id", userId);
    if (links.departmentId) {
      const { error } = await supabaseAdmin
        .from("user_departments")
        .insert({ user_id: userId, department_id: links.departmentId });
      if (error) throw new Error(`Falha ao salvar o departamento: ${error.message}`);
    }
  }
  if (links.unitIds !== undefined) {
    await supabaseAdmin.from("user_units").delete().eq("user_id", userId);
    if (links.unitIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_units")
        .insert(
          links.unitIds.map((unit_id) => ({ user_id: userId, unit_id, role: "agent" as const })),
        );
      if (error) throw new Error(`Falha ao salvar as unidades: ${error.message}`);
    }
  }
}

function parseRole(raw: unknown): TeamRole | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!TEAM_ROLES.includes(raw as TeamRole)) {
    throw new Error(
      "Papel inválido. Use 'agent' (atendente), 'manager' (gerente) ou 'admin_company' (administrador).",
    );
  }
  return raw as TeamRole;
}

/** 'nenhum' limpa o campo; ausente não mexe. */
const optionalRef = (raw: unknown) =>
  raw === undefined
    ? undefined
    : raw === "nenhum" || raw === null || raw === ""
      ? null
      : String(raw);

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
          "id, name, email, role, active, department_id, has_matriz_access, departments!profiles_department_id_fkey(name), company_roles:custom_role_id(name, base_role), user_units(units(id, name))",
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
        ativo: u.active !== false,
        unidades: ((u.user_units as any[]) || [])
          .map((uu) => uu.units)
          .filter(Boolean)
          .map((un: any) => ({ id: un.id, nome: un.name })),
      }));

      return {
        total: formatted.length,
        colaboradores: formatted,
      };
    },
  },
  {
    name: "criar_usuario_equipe",
    description:
      "Cria um usuário (membro da equipe) na empresa, como em Configurações > Usuários: nome, e-mail, papel, unidades, acesso à Matriz, departamento e cargo. O servidor gera uma SENHA TEMPORÁRIA, devolvida uma única vez: repasse à pessoa por um canal privado; no primeiro acesso o sistema pede para ela criar a própria senha. Nunca peça nem invente senha no chat.",
    security: USER_ADMIN_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo da pessoa." },
        email: { type: "string", description: "E-mail de login (precisa ser novo)." },
        papel: {
          type: "string",
          enum: [...TEAM_ROLES],
          description:
            "'agent' (atendente, padrão), 'manager' (gerente) ou 'admin_company' (administrador).",
          default: "agent",
        },
        unidades_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs (UUID) das unidades da pessoa (use listar_unidades).",
        },
        acesso_matriz: {
          type: "boolean",
          description: "Se true, vê todas as unidades (Matriz). Padrão false.",
        },
        departamento_id: {
          type: "string",
          description: "ID (UUID) do departamento (use listar_departamentos).",
        },
        cargo_personalizado_id: {
          type: "string",
          description: "ID (UUID) do cargo personalizado da empresa, se houver.",
        },
      },
      required: ["nome", "email"],
    },
    handler: async (args: any, context: McpContext) => {
      const name = String(args?.nome || "").trim();
      const email = String(args?.email || "")
        .trim()
        .toLowerCase();
      if (name.length < 2) throw new Error("Informe o nome da pessoa.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
      const role = parseRole(args?.papel) || "agent";
      const unitIds: string[] = Array.isArray(args?.unidades_ids)
        ? args.unidades_ids.map(String)
        : [];
      const departmentId = optionalRef(args?.departamento_id) ?? null;
      const customRoleId = optionalRef(args?.cargo_personalizado_id) ?? null;
      const hasMatriz = Boolean(args?.acesso_matriz);
      await validateTeamRefs(context.companyId, { unitIds, departmentId, customRoleId });

      // E-mail já usado: não puxa a pessoa de outra empresa nem duplica
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id, company_id, active")
        // ilike sem curingas: "_" e "%" do e-mail valem como letra
        .ilike(
          "email",
          email.replace(/[\\%_]/g, (c) => `\\${c}`),
        )
        .limit(1)
        .maybeSingle();
      if (existing) {
        throw new Error(
          existing.company_id === context.companyId
            ? `Já existe um usuário com este e-mail na empresa (id ${existing.id}). Use atualizar_usuario_equipe.`
            : "Este e-mail já tem conta no Atendi fora desta empresa. Use outro e-mail.",
        );
      }

      const password = temporaryPassword();
      const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // company_id/department_id: o trigger handle_new_user cria o perfil já na empresa
        user_metadata: {
          name,
          company_id: context.companyId,
          department_id: departmentId,
          must_change_password: true,
        },
      });
      if (authErr || !created?.user) {
        throw new Error(`Falha ao criar o usuário: ${authErr?.message || "desconhecido"}`);
      }
      const userId = created.user.id;

      try {
        const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
          id: userId,
          company_id: context.companyId,
          name,
          email,
          role,
          active: true,
          has_matriz_access: hasMatriz,
          department_id: departmentId,
          custom_role_id: customRoleId,
        } as any);
        if (profErr) throw new Error(`Falha ao criar o perfil: ${profErr.message}`);
        await saveTeamLinks(userId, { unitIds, departmentId });
      } catch (err) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
        throw err;
      }

      return {
        sucesso: true,
        usuario: { id: userId, nome: name, email, papel: role, acesso_matriz: hasMatriz },
        senha_temporaria: password,
        instrucoes:
          "Repasse e-mail e senha temporária à pessoa em particular. Ela entra pela tela de login do Atendi e, no primeiro acesso, o sistema pede para criar a própria senha (também dá para trocar no ícone de chave, ao lado de Sair).",
      };
    },
  },
  {
    name: "atualizar_usuario_equipe",
    description:
      "Altera um usuário da empresa: nome, papel, unidades, acesso à Matriz, departamento, cargo, ativar/desativar, ou gera uma nova senha temporária (para quem esqueceu a senha). Só envie os campos que mudam.",
    security: USER_ADMIN_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        usuario_id: {
          type: "string",
          description: "ID (UUID) do usuário (use listar_usuarios_empresa).",
        },
        nome: { type: "string", description: "Novo nome." },
        papel: {
          type: "string",
          enum: [...TEAM_ROLES],
          description:
            "'agent' (atendente), 'manager' (gerente) ou 'admin_company' (administrador).",
        },
        unidades_ids: {
          type: "array",
          items: { type: "string" },
          description: "Unidades da pessoa (substitui as atuais; lista vazia tira de todas).",
        },
        acesso_matriz: { type: "boolean", description: "Vê todas as unidades (Matriz)." },
        departamento_id: {
          type: "string",
          description: "ID do departamento, ou 'nenhum' para tirar do departamento.",
        },
        cargo_personalizado_id: {
          type: "string",
          description: "ID do cargo personalizado, ou 'nenhum' para tirar o cargo.",
        },
        ativo: {
          type: "boolean",
          description: "false desativa (a pessoa não entra e sai da equipe); true reativa.",
        },
        gerar_nova_senha_temporaria: {
          type: "boolean",
          description: "true gera uma nova senha temporária (devolvida uma única vez).",
        },
      },
      required: ["usuario_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const userId = String(args?.usuario_id || "");
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email, role, company_id, active")
        .eq("id", userId)
        .maybeSingle();
      if (!target || target.company_id !== context.companyId) {
        throw new Error("Usuário não encontrado nesta empresa.");
      }
      if ((target.role as string) === "super_admin") {
        throw new Error("Super administrador não pode ser alterado pelo MCP.");
      }

      const role = parseRole(args?.papel);
      const departmentId = optionalRef(args?.departamento_id);
      const customRoleId = optionalRef(args?.cargo_personalizado_id);
      const unitIds: string[] | undefined = Array.isArray(args?.unidades_ids)
        ? args.unidades_ids.map(String)
        : undefined;
      const isSelf = !!context.userId && context.userId === userId;
      if (isSelf && (args?.ativo === false || (role && role !== target.role))) {
        throw new Error("Não dá para desativar nem mudar o papel da própria conta usada pelo MCP.");
      }
      // A empresa não pode ficar sem administrador ativo (ninguém mais entraria em Configurações)
      const losesAdmin =
        target.role === "admin_company" &&
        target.active !== false &&
        (args?.ativo === false || (role && role !== "admin_company"));
      if (losesAdmin) {
        const { count } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", context.companyId)
          .eq("role", "admin_company")
          .eq("active", true)
          .neq("id", userId);
        if (!count) {
          throw new Error(
            "Este é o único administrador ativo da empresa: crie ou promova outro antes de desativá-lo ou mudar o papel dele.",
          );
        }
      }
      await validateTeamRefs(context.companyId, { unitIds, departmentId, customRoleId });

      const updates: Record<string, any> = {};
      if (typeof args?.nome === "string" && args.nome.trim().length >= 2)
        updates.name = args.nome.trim();
      if (role) updates.role = role;
      if (typeof args?.acesso_matriz === "boolean") updates.has_matriz_access = args.acesso_matriz;
      if (departmentId !== undefined) updates.department_id = departmentId;
      if (customRoleId !== undefined) updates.custom_role_id = customRoleId;
      if (typeof args?.ativo === "boolean") {
        updates.active = args.ativo;
        if (!args.ativo) updates.online = false;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", userId);
        if (error) throw new Error(`Falha ao atualizar o usuário: ${error.message}`);
      }
      await saveTeamLinks(userId, { unitIds, departmentId });

      let password: string | null = null;
      if (args?.gerar_nova_senha_temporaria === true) {
        password = temporaryPassword();
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { must_change_password: true },
        });
        if (error) throw new Error(`Falha ao gerar nova senha: ${error.message}`);
      }

      return {
        sucesso: true,
        usuario_id: userId,
        alterado: Object.keys(updates).concat(
          unitIds !== undefined ? ["unidades"] : [],
          password ? ["senha"] : [],
        ),
        ...(password
          ? {
              senha_temporaria: password,
              instrucoes:
                "Repasse a senha temporária à pessoa em particular; no próximo acesso o sistema pede para ela criar a própria senha.",
            }
          : {}),
      };
    },
  },
];
