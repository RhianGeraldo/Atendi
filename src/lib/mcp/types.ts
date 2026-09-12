// Tipos para o protocolo MCP (Model Context Protocol - Versão 2024-11-05)

export interface McpContext {
  keyId: string;
  companyId: string;
  unitId: string | null; // null = Visão Global / Matriz (todas as unidades)
  companyName: string;
  unitName?: string | null;
  keyName: string;
  permissions: string[];
}

export interface McpToolInputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    items?: any;
    default?: any;
  }>;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  handler: (args: any, context: McpContext) => Promise<any>;
}

export interface McpToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  } | {
    type: "image";
    data: string;
    mimeType: string;
  }>;
  isError?: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
