/* eslint-disable @typescript-eslint/no-explicit-any */
import type { McpContext, McpToolCallResult, McpToolDefinition } from "./types";
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
];

const toolsByName = new Map<string, McpToolDefinition>();
for (const tool of allToolsList) {
  toolsByName.set(tool.name, tool);
}

export function getAllMcpTools(context: McpContext) {
  return allToolsList.map((tool) => {
    let desc = tool.description;
    if (context.unitId && context.unitName) {
      desc = `[Unidade: ${context.unitName}] ${desc}`;
    }
    return {
      name: tool.name,
      description: desc,
      inputSchema: tool.inputSchema,
    };
  });
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
