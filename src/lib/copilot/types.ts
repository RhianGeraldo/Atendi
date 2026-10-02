/* eslint-disable @typescript-eslint/no-explicit-any */

export type CopilotRole = "agent" | "manager" | "admin_company" | "super_admin";

export interface CopilotContext {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: CopilotRole;
  allowedMenus: string[];
  hasMatrizAccess: boolean;
  unitId: string | null;
  unitName: string | null;
  userUnitIds: string[];
}

export interface CopilotActionParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
}

export interface CopilotActionParameters {
  type: "object";
  properties: Record<string, CopilotActionParameterProperty>;
  required?: string[];
}

export interface CopilotActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface CopilotAction {
  name: string;
  label: string;
  description: string;
  /** Nível hierárquico mínimo para executar a ação ("agent" | "manager" | "admin_company" | "super_admin") */
  minRole?: CopilotRole;
  /** Menu da aplicação exigido (ex: "settings", "pipeline", "conversations", "contacts", "tasks", "training", "reports") */
  requiredMenu?: string;
  /** Se a ação exige visão global da matriz */
  requiresMatriz?: boolean;
  /** Schema dos parâmetros esperados */
  parameters: CopilotActionParameters;
  /** Função de execução direta da ação */
  execute: (params: any, context: CopilotContext) => Promise<CopilotActionResult>;
}
