/* eslint-disable @typescript-eslint/no-explicit-any */
import type { McpContext, McpRole, McpToolCallResult, McpToolDefinition } from "./types";
import { unitsTools } from "./tools/units";
import { contactsTools } from "./tools/contacts";
import { conversationsTools } from "./tools/conversations";
import { pipelineTools } from "./tools/pipeline";
import { tasksTools } from "./tools/tasks";
import { playbookTools } from "./tools/playbook";
import { analyticsTools } from "./tools/analytics";
import { quickMessagesTools } from "./tools/quick-messages";
import { intelligenceTools } from "./tools/intelligence";
import { callsTools } from "./tools/calls";
import { settingsTools } from "./tools/settings";

export const allToolsList: McpToolDefinition[] = [
  ...unitsTools,
  ...contactsTools,
  ...conversationsTools,
  ...pipelineTools,
  ...tasksTools,
  ...playbookTools,
  ...analyticsTools,
  ...quickMessagesTools,
  ...intelligenceTools,
  ...callsTools,
  ...settingsTools,
];

const toolsByName = new Map<string, McpToolDefinition>();
for (const tool of allToolsList) {
  toolsByName.set(tool.name, tool);
}

const ROLE_WEIGHT: Record<McpRole, number> = {
  agent: 1,
  manager: 2,
  admin_company: 3,
  super_admin: 4,
};

/**
 * Valida se o contexto do usuário possui autorização para executar a ferramenta
 */
export function isToolAuthorizedForContext(tool: McpToolDefinition, context: McpContext): boolean {
  // Super Admin tem acesso total irrestrito
  if (context.userRole === "super_admin") return true;

  // Contextos externos de token (ex: Claude Desktop com permissions: ["all"])
  if (!context.userRole) {
    if (context.permissions?.includes("all")) return true;
    if (tool.security?.requiredMenu && context.permissions?.includes(tool.security.requiredMenu)) {
      return true;
    }
    return !tool.security?.minRole || tool.security.minRole === "agent";
  }

  // Verificar hierarquia mínima de papel (Role)
  if (tool.security?.minRole) {
    const userWeight = ROLE_WEIGHT[context.userRole] || 1;
    const requiredWeight = ROLE_WEIGHT[tool.security.minRole] || 1;
    if (userWeight < requiredWeight) {
      return false;
    }
  }

  // Se a ferramenta exige visão de matriz e o usuário não for admin_company nem tiver hasMatrizAccess
  if (
    tool.security?.requiresMatriz &&
    !context.hasMatrizAccess &&
    context.userRole !== "admin_company"
  ) {
    return false;
  }

  // Administrador da empresa tem acesso a todos os menus e ferramentas da empresa
  if (context.userRole === "admin_company") {
    return true;
  }

  // Para gerente ou atendente, verificar se o menu correspondente está liberado
  if (tool.security?.requiredMenu) {
    if (context.allowedMenus && !context.allowedMenus.includes(tool.security.requiredMenu)) {
      return false;
    }
  }

  return true;
}

/**
 * Retorna apenas as ferramentas que o usuário autenticado tem permissão para visualizar e executar
 */
export function getAuthorizedMcpTools(context: McpContext) {
  return allToolsList
    .filter((tool) => isToolAuthorizedForContext(tool, context))
    .map((tool) => {
      let desc = tool.description;
      if (context.unitId && context.unitName) {
        desc = `[Unidade: ${context.unitName}] ${desc}`;
      }
      return {
        name: tool.name,
        description: desc,
        inputSchema: tool.inputSchema,
        security: tool.security,
      };
    });
}

export function getAllMcpTools(context: McpContext) {
  return getAuthorizedMcpTools(context);
}

export async function executeMcpTool(
  name: string,
  args: any,
  context: McpContext,
): Promise<McpToolCallResult> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: `Erro: Ferramenta "${name}" não encontrada no catálogo do Atendi MCP Server.`,
        },
      ],
      isError: true,
    };
  }

  // Verificação de segurança obrigatória em tempo de execução
  if (!isToolAuthorizedForContext(tool, context)) {
    return {
      content: [
        {
          type: "text",
          text: `Acesso negado: Seu perfil (${context.userRole || "usuário"}) não possui permissão para executar a ação "${name}".`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(args || {}, context);
    const formattedText = typeof result === "string" ? result : JSON.stringify(result, null, 2);

    return {
      content: [
        {
          type: "text",
          text: formattedText,
        },
      ],
      isError: false,
    };
  } catch (err: any) {
    console.error(`[McpRegistry] Erro ao executar tool ${name}:`, err);
    return {
      content: [
        {
          type: "text",
          text: `Erro na execução de ${name}: ${err?.message || "Erro desconhecido"}`,
        },
      ],
      isError: true,
    };
  }
}
