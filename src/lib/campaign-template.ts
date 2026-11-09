/**
 * Utilitários para Processamento de Templates de Campanhas em Massa
 * - Parser e avaliador de Spintax: {Oi|Olá|Oie}
 * - Interpolação de variáveis dinâmicas (contato, sistema, variáveis de planilha)
 * - Sanitização e validação de números de telefone para WhatsApp
 */

import { greetingNow } from "./quick-message-vars";

/**
 * Resolve Spintax substituindo blocos {opcao1|opcao2|opcao3} por uma opção aleatória.
 * Suporta recursão simples caso existam blocos aninhados.
 */
export function resolveSpintax(text: string): string {
  if (!text) return "";
  let resolved = text;
  const spintaxRegex = /\{([^{}]+)\}/g;

  let iterations = 0;
  while (spintaxRegex.test(resolved) && iterations < 5) {
    resolved = resolved.replace(spintaxRegex, (_, options) => {
      const choices = options.split("|");
      const randomIndex = Math.floor(Math.random() * choices.length);
      return choices[randomIndex].trim();
    });
    iterations++;
  }

  return resolved;
}

export interface CampaignVariableContext {
  clientName?: string | null;
  phone?: string | null;
  companyName?: string | null;
  unitName?: string | null;
  customVariables?: Record<string, unknown> | null;
}

/**
 * Preenche todas as variáveis dinâmicas em uma mensagem de campanha.
 */
export function renderCampaignMessage(
  template: string,
  context: CampaignVariableContext,
  applySpintax: boolean = true
): string {
  if (!template) return "";

  let result = template;

  // 1. Spintax (se ativado)
  if (applySpintax) {
    result = resolveSpintax(result);
  }

  const now = new Date();
  const rawName = context.clientName?.trim();
  const clientFullName = rawName && rawName !== "Desconhecido" ? rawName : "Cliente";
  const clientFirstName = clientFullName !== "Cliente" ? clientFullName.split(/\s+/)[0] : "Cliente";

  // 2. Variáveis padrão do contato e sistema
  result = result.replace(/\{\{cliente\}\}/gi, clientFullName);
  result = result.replace(/\{\{nome\}\}/gi, clientFullName);
  result = result.replace(/\{\{primeiro_nome\}\}/gi, clientFirstName);
  result = result.replace(/\{\{primeiro_nome_cliente\}\}/gi, clientFirstName);
  result = result.replace(/\{\{saudacao\}\}/gi, greetingNow(now));
  result = result.replace(/\{\{telefone\}\}/gi, context.phone || "");
  result = result.replace(/\{\{empresa\}\}/gi, context.companyName || "Empresa");
  result = result.replace(/\{\{unidade\}\}/gi, context.unitName || "Unidade");
  result = result.replace(/\{\{data\}\}/gi, now.toLocaleDateString("pt-BR"));
  result = result.replace(
    /\{\{hora\}\}/gi,
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );

  // 3. Variáveis personalizadas da planilha (ex: {{vencimento}}, {{saldo}}, {{cupom}})
  if (context.customVariables && typeof context.customVariables === "object") {
    for (const [key, val] of Object.entries(context.customVariables)) {
      if (val !== undefined && val !== null) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
        result = result.replace(regex, String(val).trim());
      }
    }
  }

  return result.trim();
}

/**
 * Sanitiza e normaliza números de telefone para formato padrão E.164 (sem o '+').
 * Aplica regras do Brasil (DDI 55, DDD 2 dígitos, nono dígito celular).
 */
export function sanitizeCampaignPhone(rawPhone: string | number): {
  valid: boolean;
  phone: string;
  error?: string;
} {
  if (!rawPhone) {
    return { valid: false, phone: "", error: "Telefone vazio" };
  }

  let clean = String(rawPhone).replace(/\D/g, "");

  if (clean.length < 8) {
    return { valid: false, phone: clean, error: "Número muito curto" };
  }

  // Se já começar com 55 e tiver 12 ou 13 dígitos
  if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
    // Ex: 5511988887777 (13 dígitos) ou 551188887777 (12 dígitos com falta do 9)
    if (clean.length === 12) {
      const ddd = clean.substring(2, 4);
      const number = clean.substring(4);
      // Inserir o 9 no celular se DDD válido e começar de 6 a 9
      if (parseInt(ddd, 10) >= 11 && parseInt(ddd, 10) <= 99 && /^[6-9]/.test(number)) {
        clean = `55${ddd}9${number}`;
      }
    }
    return { valid: true, phone: clean };
  }

  // Se não começa com 55: pode ser número local com DDD (10 ou 11 dígitos)
  if (clean.length === 10 || clean.length === 11) {
    const ddd = clean.substring(0, 2);
    const dddNum = parseInt(ddd, 10);
    if (dddNum >= 11 && dddNum <= 99) {
      if (clean.length === 10) {
        // Falta o nono dígito
        const number = clean.substring(2);
        if (/^[6-9]/.test(number)) {
          clean = `55${ddd}9${number}`;
        } else {
          clean = `55${clean}`;
        }
      } else {
        clean = `55${clean}`;
      }
      return { valid: true, phone: clean };
    }
  }

  // Se tiver 13 ou 14 dígitos internacional
  if (clean.length >= 10 && clean.length <= 15) {
    return { valid: true, phone: clean };
  }

  return { valid: false, phone: clean, error: "Formato de telefone não reconhecido" };
}
