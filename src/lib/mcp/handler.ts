import { validateMcpToken } from "./auth";
import { getAllMcpTools, executeMcpTool } from "./registry";
import type { JsonRpcRequest, JsonRpcResponse, McpContext } from "./types";

export async function handleMcpRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

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
          message: "Autenticação necessária. Forneça o header 'Authorization: Bearer <atendi_mcp_live_...>' ou parâmetro '?token=...'",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
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
          message: "Chave de API do Atendi inválida, expirada ou inativa.",
        },
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
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
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (Array.isArray(body)) {
      // Batch JSON-RPC
      const responses = await Promise.all(body.map((req) => processJsonRpc(req, context)));
      return new Response(JSON.stringify(responses.filter(Boolean)), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } else {
      const response = await processJsonRpc(body, context);
      if (!response) {
        // Notificação JSON-RPC (sem id)
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

// Processador individual de mensagem JSON-RPC 2.0
async function processJsonRpc(
  req: JsonRpcRequest,
  context: McpContext
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
            resources: {},
            prompts: {},
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
        result: { resources: [] },
      };
    }

    case "prompts/list": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: { prompts: [] },
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
