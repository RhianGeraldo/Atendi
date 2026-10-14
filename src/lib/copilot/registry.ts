/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CopilotAction, CopilotActionResult, CopilotContext, CopilotRole } from "./types";
import { settingsActions } from "./actions/settings";
import { crmActions } from "./actions/crm";
import { playbookActions } from "./actions/playbook";
import { tasksActions } from "./actions/tasks";
import { contactsActions } from "./actions/contacts";
import { analyticsActions } from "./actions/analytics";
import { conversationsActions } from "./actions/conversations";
import { quickMessagesActions } from "./actions/quick-messages";
import { intelligenceActions } from "./actions/intelligence";
import { callsActions } from "./actions/calls";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertCompanyUnitAccess,
  assertContactAccess,
  assertConversationAccess,
} from "@/lib/server/access-control";

export const allCopilotActions: CopilotAction[] = [
  ...settingsActions,
  ...crmActions,
  ...playbookActions,
  ...tasksActions,
  ...contactsActions,
  ...analyticsActions,
  ...conversationsActions,
  ...quickMessagesActions,
  ...intelligenceActions,
  ...callsActions,
];

const actionsByName = new Map<string, CopilotAction>();
for (const action of allCopilotActions) {
  actionsByName.set(action.name, action);
}

const ROLE_RANK: Record<CopilotRole, number> = {
  agent: 1,
  manager: 2,
  admin_company: 3,
  super_admin: 4,
};

/**
 * Valida se o usuário tem autorização para executar a ação
 */
export function isActionAuthorized(action: CopilotAction, context: CopilotContext): boolean {
  if (context.userRole === "super_admin") return true;

  // Verificar hierarquia mínima de papel
  if (action.minRole) {
    const userWeight = ROLE_RANK[context.userRole] || 1;
    const requiredWeight = ROLE_RANK[action.minRole] || 1;
    if (userWeight < requiredWeight) {
      return false;
    }
  }

  // Se a ação exige acesso à matriz
  if (action.requiresMatriz && !context.hasMatrizAccess && context.userRole !== "admin_company") {
    return false;
  }

  // Administrador da empresa tem acesso a todos os menus internos
  if (context.userRole === "admin_company") return true;

  // Para atendente ou gerente, checar se tem o menu correspondente
  if (action.requiredMenu) {
    if (!context.allowedMenus.includes(action.requiredMenu)) {
      return false;
    }
  }

  return true;
}

/**
 * Retorna somente as ações permitidas para o perfil do usuário
 */
export function getAuthorizedCopilotActions(context: CopilotContext): CopilotAction[] {
  return allCopilotActions.filter((action) => isActionAuthorized(action, context));
}

async function assertCopilotParamsScope(params: any, context: CopilotContext) {
  if (typeof params.conversa_id === "string" && params.conversa_id) {
    await assertConversationAccess(context.userId, params.conversa_id);
  }
  if (typeof params.contato_id === "string" && params.contato_id) {
    await assertContactAccess(context.userId, params.contato_id);
  }
  if (typeof params.oportunidade_id === "string" && params.oportunidade_id) {
    const { data: opp } = await supabaseAdmin
      .from("opportunities")
      .select("company_id, unit_id")
      .eq("id", params.oportunidade_id)
      .maybeSingle();
    if (!opp) throw new Error("Oportunidade não encontrada.");
    await assertCompanyUnitAccess(context.userId, (opp as any).company_id, opp.unit_id);
  }
  if (typeof params.tarefa_id === "string" && params.tarefa_id) {
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("company_id, unit_id, assigned_to")
      .eq("id", params.tarefa_id)
      .maybeSingle();
    if (!task) throw new Error("Tarefa não encontrada.");
    if (task.assigned_to !== context.userId) {
      await assertCompanyUnitAccess(context.userId, (task as any).company_id, task.unit_id);
    }
  }
}

/**
 * Executa uma ação de forma segura
 */
export async function executeCopilotAction(
  name: string,
  params: any,
  context: CopilotContext,
): Promise<CopilotActionResult> {
  const action = actionsByName.get(name);
  if (!action) {
    return {
      success: false,
      message: `Ação "${name}" não encontrada no sistema.`,
    };
  }

  // Guarda de permissão
  if (!isActionAuthorized(action, context)) {
    return {
      success: false,
      message: `Acesso negado: Seu perfil de ${context.userRole} não tem permissão para executar "${action.label}".`,
    };
  }

  // Guarda de escopo: IDs recebidos precisam estar ao alcance do usuário (unidade/Rede/empresa)
  try {
    await assertCopilotParamsScope(params || {}, context);
  } catch (err: any) {
    return { success: false, message: `Acesso negado: ${err?.message || "fora do seu escopo."}` };
  }

  try {
    const result = await action.execute(params || {}, context);
    return result;
  } catch (err: any) {
    console.error(`[CopilotAction] Erro ao executar ação ${name}:`, err);
    return {
      success: false,
      message: `Erro na execução de ${action.label}: ${err?.message || "Erro desconhecido"}`,
    };
  }
}
