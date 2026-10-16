/**
 * Variáveis das mensagens rápidas ({{cliente}}, {{primeiro_nome}}, {{saudacao}}...).
 * Usado no Atendimento e no envio de mensagem do Todoo.
 */
export interface QuickMessageVarsContext {
  clientName?: string | null;
  phone?: string | null;
  email?: string | null;
  agentName?: string | null;
  companyName?: string | null;
  unitName?: string | null;
  departmentName?: string | null;
  instanceName?: string | null;
  protocol?: string | null;
  companyVariables?: unknown;
  unitVariables?: unknown;
}

export function greetingNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function applyCustomVariables(text: string, vars: unknown) {
  if (!vars || typeof vars !== "object") return text;
  let t = text;
  Object.entries(vars as Record<string, unknown>).forEach(([key, val]) => {
    if (typeof key === "string" && val !== null && val !== undefined) {
      t = t.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), String(val));
    }
  });
  return t;
}

export function fillQuickMessageVariables(content: string, ctx: QuickMessageVarsContext) {
  const now = new Date();
  let t = content || "";

  const clientFullName =
    ctx.clientName && ctx.clientName !== "Desconhecido" ? ctx.clientName.trim() : "Cliente";
  const clientFirstName = clientFullName !== "Cliente" ? clientFullName.split(/\s+/)[0] : "Cliente";

  // 1. Variáveis principais do sistema
  t = t.replace(/\{\{atendente\}\}/gi, ctx.agentName || "Atendente");
  t = t.replace(/\{\{cliente\}\}/gi, clientFullName);
  t = t.replace(/\{\{primeiro_nome\}\}/gi, clientFirstName);
  t = t.replace(/\{\{primeiro_nome_cliente\}\}/gi, clientFirstName);
  t = t.replace(/\{\{saudacao\}\}/gi, greetingNow(now));
  t = t.replace(/\{\{telefone\}\}/gi, ctx.phone || "");
  if (ctx.protocol) t = t.replace(/\{\{protocolo\}\}/gi, ctx.protocol);
  t = t.replace(/\{\{empresa\}\}/gi, ctx.companyName || "Empresa");
  t = t.replace(/\{\{unidade\}\}/gi, ctx.unitName || "Unidade");
  t = t.replace(/\{\{data\}\}/gi, now.toLocaleDateString("pt-BR"));
  t = t.replace(/\{\{hora\}\}/gi, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

  if (ctx.email) t = t.replace(/\{\{email\}\}/gi, ctx.email);
  if (ctx.departmentName) {
    t = t.replace(/\{\{departamento\}\}/gi, ctx.departmentName);
    t = t.replace(/\{\{setor\}\}/gi, ctx.departmentName);
  }
  if (ctx.instanceName) {
    t = t.replace(/\{\{instancia\}\}/gi, ctx.instanceName);
    t = t.replace(/\{\{conexao\}\}/gi, ctx.instanceName);
  }

  // 2. Variáveis da empresa e 3. da unidade (podem sobrescrever as da empresa)
  t = applyCustomVariables(t, ctx.companyVariables);
  t = applyCustomVariables(t, ctx.unitVariables);

  return t;
}
