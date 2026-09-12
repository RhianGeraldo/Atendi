/* eslint-disable @typescript-eslint/no-explicit-any */
import { validateMcpToken } from "./auth";
import { getAllMcpTools, executeMcpTool } from "./registry";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { JsonRpcRequest, JsonRpcResponse, McpContext } from "./types";

export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, mcp-session-id, X-Requested-With",
};

export async function handleMcpRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 0. Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }

  // 1. Extrair token de autenticação
  let token = "";
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (url.searchParams.has("token")) {
    token = url.searchParams.get("token")!.trim();
  } else if (url.searchParams.has("apiKey")) {
    token = url.searchParams.get("apiKey")!.trim();
  }

  if (!token) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Autenticação necessária. Conecte sua conta do AtendiAI ou forneça o header 'Authorization: Bearer <token>'",
        },
      }),
      {
        status: 401,
        headers: {
          ...MCP_CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "WWW-Authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"`,
        },
      },
    );
  }

  // 2. Validar token no banco de dados e obter contexto multi-unidade
  const context = await validateMcpToken(token);
  if (!context) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Token ou Chave de API do Atendi inválida, expirada ou inativa.",
        },
      }),
      {
        status: 403,
        headers: {
          ...MCP_CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  // 3. Suporte ao Transporte SSE (Server-Sent Events) via GET
  if (request.method === "GET") {
    return handleSseConnection(request, context);
  }

  // 4. Suporte ao Transporte POST (JSON-RPC 2.0)
  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error: JSON inválido." },
        }),
        {
          status: 400,
          headers: { ...MCP_CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (Array.isArray(body)) {
      // Batch JSON-RPC
      const responses = await Promise.all(body.map((req) => processJsonRpc(req, context)));
      return new Response(JSON.stringify(responses.filter(Boolean)), {
        headers: { ...MCP_CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
      });
    } else {
      const response = await processJsonRpc(body, context);
      if (!response) {
        // Notificação JSON-RPC (sem id)
        return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
      }
      return new Response(JSON.stringify(response), {
        headers: { ...MCP_CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: MCP_CORS_HEADERS });
}

// Processador individual de mensagem JSON-RPC 2.0
async function processJsonRpc(
  req: JsonRpcRequest,
  context: McpContext,
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = req;

  // Notificações não esperam resposta
  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  switch (method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {
              listChanged: false,
            },
            resources: {
              listChanged: false,
            },
            prompts: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: "atendi-mcp-server",
            version: "1.0.0",
          },
          instructions: `Servidor MCP Oficial da plataforma Atendi (CRM Omnichannel Multi-Empresa e Multi-Unidade).
Empresa: ${context.companyName}
Escopo Atual: ${context.unitId ? `Restrito à filial "${context.unitName}"` : "Matriz (Acesso global a todas as filiais)"}.
Você tem acesso a contatos, conversas do WhatsApp/Instagram, funis de vendas, tarefas e Playbook Comercial da empresa.`,
        },
      };
    }

    case "ping": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {},
      };
    }

    case "tools/list": {
      const tools = getAllMcpTools(context);
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          tools,
        },
      };
    }

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32602,
            message: "Parâmetro 'name' é obrigatório para tools/call.",
          },
        };
      }

      const result = await executeMcpTool(toolName, toolArgs, context);

      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result,
      };
    }

    case "resources/list": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          resources: [
            {
              uri: "atendi://playbook",
              name: "Playbook Comercial & Procedimentos Padrão",
              description:
                "Diretrizes de vendas, objeções mapeadas e procedimentos operacionais da empresa.",
              mimeType: "text/markdown",
            },
            {
              uri: "atendi://metricas-hoje",
              name: "Métricas Operacionais de Hoje",
              description:
                "Resumo em tempo real de atendimentos, conversas iniciadas e tarefas pendentes.",
              mimeType: "application/json",
            },
          ],
        },
      };
    }

    case "resources/read": {
      const uri = params?.uri;
      if (!uri) {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          error: { code: -32602, message: "Parâmetro 'uri' é obrigatório para resources/read." },
        };
      }

      if (uri === "atendi://playbook") {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("name, sales_playbook")
          .eq("id", context.companyId)
          .single();

        const { data: procedures } = await supabaseAdmin
          .from("sales_playbook_procedures")
          .select("category, title, content")
          .eq("company_id", context.companyId)
          .eq("active", true)
          .order("category");

        let text = `# Playbook Comercial - ${company?.name || context.companyName}\n\n`;
        if (company?.sales_playbook) {
          text += `## Diretrizes Gerais\n${company.sales_playbook}\n\n`;
        }
        if (procedures && procedures.length > 0) {
          text += `## Procedimentos & Roteiros Homologados\n\n`;
          for (const proc of procedures) {
            text += `### [${proc.category}] ${proc.title}\n${proc.content}\n\n`;
          }
        }

        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text,
              },
            ],
          },
        };
      }

      if (uri === "atendi://metricas-hoje") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        const [convsRes, tasksRes] = await Promise.all([
          supabaseAdmin
            .from("conversations")
            .select("id", { count: "exact" })
            .eq("contacts.company_id", context.companyId)
            .gte("created_at", todayIso),
          supabaseAdmin
            .from("tasks")
            .select("id", { count: "exact" })
            .eq("company_id", context.companyId)
            .gte("created_at", todayIso),
        ]);

        const metrics = {
          data: todayIso.split("T")[0],
          empresa: context.companyName,
          unidade: context.unitName || "Todas",
          novas_conversas_hoje: convsRes.count || 0,
          tarefas_hoje: tasksRes.count || 0,
        };

        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(metrics, null, 2),
              },
            ],
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32602, message: `Recurso "${uri}" não encontrado.` },
      };
    }

    case "prompts/list": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          prompts: [
            {
              name: "qualificar_lead",
              description:
                "Gera um roteiro de perguntas estratégicas de qualificação (BANT / SPIN) para o lead com base nos dados do CRM.",
              arguments: [
                {
                  name: "contato_id",
                  description: "ID (UUID) do contato no Atendi.",
                  required: true,
                },
              ],
            },
            {
              name: "auditar_atendimento",
              description:
                "Audita a conformidade de uma conversa recente confrontando com o Playbook Comercial da empresa.",
              arguments: [
                {
                  name: "conversa_id",
                  description: "ID (UUID) da conversa a ser auditada.",
                  required: true,
                },
              ],
            },
            {
              name: "resumo_handover",
              description:
                "Elabora uma síntese executiva da conversa para repassar o cliente a um vendedor humano com contexto completo.",
              arguments: [
                {
                  name: "conversa_id",
                  description: "ID (UUID) da conversa.",
                  required: true,
                },
              ],
            },
          ],
        },
      };
    }

    case "prompts/get": {
      const promptName = params?.name;
      const promptArgs = params?.arguments || {};

      if (promptName === "qualificar_lead") {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            description: "Roteiro de Qualificação BANT/SPIN",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Por favor, consulte os dados do contato "${promptArgs.contato_id}" usando a ferramenta 'consultar_contato' e as notas em 'consultar_origem_anuncio_lead'. Com base no Playbook Comercial ('atendi://playbook'), formule as 3 melhores perguntas de qualificação para enviar ao cliente agora.`,
                },
              },
            ],
          },
        };
      }

      if (promptName === "auditar_atendimento") {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            description: "Auditoria de Atendimento",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Analise a conversa "${promptArgs.conversa_id}" usando 'consultar_conversa' e 'consultar_analise_sales_coach'. Avalie: 1) Tempo de resposta, 2) Cordialidade, 3) Identificação de dor do cliente, 4) Objeções contornadas e 5) Próximo passo definido.`,
                },
              },
            ],
          },
        };
      }

      if (promptName === "resumo_handover") {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            description: "Resumo de Handover para Atendente Humano",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Recupere o histórico da conversa "${promptArgs.conversa_id}" com 'consultar_conversa' e gere um resumo compacto (em tópicos) contendo: Necessidade Principal do Cliente, Produto/Serviço de Interesse, Objeções Pendentes e Próxima Ação Imediata. Em seguida, salve como nota interna usando 'adicionar_nota_interna'.`,
                },
              },
            ],
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32602, message: `Prompt "${promptName}" não encontrado.` },
      };
    }

    default: {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code: -32601,
          message: `Método MCP "${method}" não encontrado ou não implementado.`,
        },
      };
    }
  }
}

// Handshake de Server-Sent Events (SSE) para Claude Desktop / Cursor
function handleSseConnection(request: Request, _context: McpContext): Response {
  const url = new URL(request.url);
  const postEndpoint = `${url.pathname}${url.search ? url.search : ""}`;

  let keepAliveInterval: any;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Enviar evento 'endpoint' conforme especificação MCP SSE
      const endpointEvent = `event: endpoint\ndata: ${postEndpoint}\n\n`;
      controller.enqueue(new TextEncoder().encode(endpointEvent));

      // 2. Keep-alive ping a cada 25 segundos
      keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 25000);
    },
    cancel() {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    },
  });

  return new Response(stream, {
    headers: {
      ...MCP_CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
