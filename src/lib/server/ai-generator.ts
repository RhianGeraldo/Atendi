import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";
import { scheduleMessage, cancelScheduledMessagesForConversation } from "./scheduled-messages";
import { sendMetaCapiEvent } from "./meta-capi";

/**
 * Normaliza valores monetários para número float (ex: "R$ 1.500,50", "1500,00", 1500 -> 1500.5)
 */
function parseCurrencyValue(val: any): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (!val) return 0;
  const str = String(val).trim();
  const clean = str.replace(/[^\d,\.]/g, "");
  if (!clean) return 0;

  if (clean.includes(",") && clean.includes(".")) {
    if (clean.indexOf(".") < clean.indexOf(",")) {
      return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    } else {
      return parseFloat(clean.replace(/,/g, "")) || 0;
    }
  }

  if (clean.includes(",")) {
    return parseFloat(clean.replace(",", ".")) || 0;
  }

  return parseFloat(clean) || 0;
}

/**
 * Sanitizador rigoroso para mensagens destinadas ao cliente (DLP).
 * Garante que nenhuma tag interna, comando em colchetes ou marcação de bastidor
 * seja enviada para o WhatsApp/canais de atendimento.
 */
function sanitizeCustomerFacingText(text: string | null | undefined): string {
  if (!text) return "";
  let cleaned = String(text).trim();

  // Remove qualquer assinatura técnica auto-gerada no início
  const selfSignatureMatch = cleaned.match(/^([A-Za-z0-9 _\-\*]+):\s*([\s\S]*)$/);
  if (
    selfSignatureMatch &&
    !selfSignatureMatch[1].toLowerCase().includes("http") &&
    !selfSignatureMatch[1].toLowerCase().includes("www")
  ) {
    cleaned = selfSignatureMatch[2].trim();
  }

  // Remove tags conhecidas de ação (com ou sem argumentos, tolerante a espaços)
  cleaned = cleaned.replace(
    /\[\s*(?:CRIAR[_\s]?OPORTUNIDADE|ATUALIZAR[_\s]?OPORTUNIDADE|MOVER[_\s]?OPORTUNIDADE|TRANSFERIR[_\s]?AGENTE|TRANSFERIR|ENCERRAR|CRIAR[_\s]?TAREFA|AGENDAR[_\s]?MENSAGEM|OPORTUNIDADE|TAREFA)(?::[\s\S]*?)?\]/gi,
    "",
  );

  // Remove quaisquer outras tags residuais de comandos em caixa alta entre colchetes
  cleaned = cleaned.replace(/\[\s*[A-Z0-9_\-\s]{3,40}(?::[\s\S]*?)?\]/g, "");

  // Normaliza quebras de linha múltiplas residuais
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

/**
 * Limpa prompts customizados para garantir que instruções legadas
 * que ordenavam cuspir tags sejam neutralizadas e convertidas para ferramentas nativas.
 */
function cleanPromptDirective(prompt: string | null | undefined): string {
  if (!prompt) return "";
  let p = prompt;
  p = p.replace(
    /(?:Use|Inclua|utilize)?\s*(?:a|exatamente a)?\s*tag\s*\[[A-Z0-9_\-\s:\|]+\]/gi,
    "Use a ferramenta nativa correspondente",
  );
  p = p.replace(/\[\s*(?:CRIAR_|ATUALIZAR_|MOVER_|TRANSFERIR|ENCERRAR).*?\]/gi, "");
  return p.trim();
}

/**
 * Parser resiliente de datas para PostgreSQL (TIMESTAMPTZ) ancorado no Horário de Brasília (America/Sao_Paulo / UTC-3).
 * Garante que agendamentos (amanhã às 10h, DD/MM/YYYY, termos relativos) sejam gravados no UTC correto,
 * independentemente do fuso horário da máquina ou servidor em nuvem (Vercel/Docker em UTC).
 */
function parseTaskDueDate(rawDate: string | undefined | null): string {
  const nowUtc = new Date();
  const spString = nowUtc.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const spNow = new Date(spString);

  if (!rawDate || typeof rawDate !== "string" || !rawDate.trim()) {
    const d = new Date(spNow);
    d.setDate(d.getDate() + 1);
    // 10:00 Horário de Brasília = 13:00 UTC
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 13, 0, 0, 0),
    ).toISOString();
  }

  const trimmed = rawDate.trim();

  // Se já for ISO completo com timezone (Z ou +/-)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime())) return direct.toISOString();
  }

  // Formato ISO sem timezone: YYYY-MM-DD ou YYYY-MM-DDTHH:mm ou YYYY-MM-DD HH:mm
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 10;
    const min = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    // Em Brasília (UTC-3), hora local + 3h = UTC
    return new Date(Date.UTC(year, month, day, hour + 3, min, 0, 0)).toISOString();
  }

  // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm
  const brMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 10;
    const min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    return new Date(Date.UTC(year, month, day, hour + 3, min, 0, 0)).toISOString();
  }

  // Termos relativos em português
  const lower = trimmed.toLowerCase();
  let targetHour = 10;
  let targetMinute = 0;
  const timeMatch = lower.match(/(?:às|as|ás|:)\s*(\d{1,2})(?:[h:](\d{2})?)?/i);
  if (timeMatch) {
    targetHour = parseInt(timeMatch[1], 10);
    if (timeMatch[2]) targetMinute = parseInt(timeMatch[2], 10);
  }

  if (lower.includes("hoje")) {
    const currentSpHour = spNow.getHours();
    const effectiveHour = targetHour > currentSpHour ? targetHour : currentSpHour + 2;
    return new Date(
      Date.UTC(
        spNow.getFullYear(),
        spNow.getMonth(),
        spNow.getDate(),
        effectiveHour + 3,
        targetMinute,
        0,
        0,
      ),
    ).toISOString();
  }

  if (lower.includes("amanhã") || lower.includes("amanha")) {
    const d = new Date(spNow);
    d.setDate(d.getDate() + 1);
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), targetHour + 3, targetMinute, 0, 0),
    ).toISOString();
  }

  const inDaysMatch = lower.match(/(?:daqui a|em)\s+(\d+)\s+dias?/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(spNow);
    d.setDate(d.getDate() + days);
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), targetHour + 3, targetMinute, 0, 0),
    ).toISOString();
  }

  const inHoursMatch = lower.match(/(?:daqui a|em)\s+(\d+)\s+horas?/i);
  if (inHoursMatch) {
    const hours = parseInt(inHoursMatch[1], 10);
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  const weekDays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  for (let i = 0; i < weekDays.length; i++) {
    if (lower.includes(weekDays[i])) {
      const currentDay = spNow.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(spNow);
      d.setDate(d.getDate() + diff);
      return new Date(
        Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), targetHour + 3, targetMinute, 0, 0),
      ).toISOString();
    }
  }

  // Fallback seguro: amanhã às 10h (Horário de Brasília)
  const d = new Date(spNow);
  d.setDate(d.getDate() + 1);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 13, 0, 0, 0)).toISOString();
}

/**
 * Resolve o stageId de forma tolerante (por UUID ou por nome aproximado na pipeline)
 */
async function resolveStageId(
  pipelineId: string | null,
  stageInput: string | null | undefined,
): Promise<string | null> {
  if (!pipelineId) return null;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (stageInput && uuidRegex.test(stageInput.trim())) {
    const { data: stage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("id", stageInput.trim())
      .eq("pipeline_id", pipelineId)
      .maybeSingle();
    if (stage) return stage.id;
  }

  if (stageInput && stageInput.trim()) {
    const cleanName = stageInput.trim().replace(/^['"]|['"]$/g, "");
    const { data: matchedStage } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .ilike("name", `%${cleanName}%`)
      .order("order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (matchedStage) return matchedStage.id;
  }

  const { data: firstStage } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return firstStage?.id || null;
}

/**
 * Resolve o colega de IA por UUID ou nome
 */
function resolveColleagueAgentId(
  colleagues: any[],
  agentInput: string | null | undefined,
): string | null {
  if (!agentInput || !colleagues || colleagues.length === 0) return null;
  const trimmed = agentInput.trim();

  const byId = colleagues.find((c) => c.id.toLowerCase() === trimmed.toLowerCase());
  if (byId) return byId.id;

  const lower = trimmed.toLowerCase();
  const byName = colleagues.find(
    (c) =>
      c.name.toLowerCase() === lower ||
      c.name.toLowerCase().includes(lower) ||
      lower.includes(c.name.toLowerCase()) ||
      (c.ai_type && c.ai_type.toLowerCase().includes(lower)),
  );
  if (byName) return byName.id;

  return null;
}

/**
 * Resolve departamento por UUID ou nome
 */
async function resolveDepartmentId(
  companyId: string,
  deptInput: string | null | undefined,
): Promise<string | null> {
  if (!deptInput || !deptInput.trim()) return null;
  const trimmed = deptInput.trim();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id")
      .eq("id", trimmed)
      .eq("company_id", companyId)
      .maybeSingle();
    if (dept) return dept.id;
  }

  const { data: matchedDept } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", `%${trimmed}%`)
    .limit(1)
    .maybeSingle();

  return matchedDept?.id || null;
}

export async function generateAndSendAiResponse(conversationId: string, companyId: string) {
  try {
    // 1. Buscar detalhes da conversa com garantia estrita de Empresa e Unidade
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, ai_active, ai_agent_id, whatsapp_instance_id, contact_id, status, unit_id, current_session_id, contacts(name, phone, company_id, unit_id), whatsapp_instances(unit_id, company_id)",
      )
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) {
      console.error(`[ai-generator] Conversation not found: ${conversationId}`);
      return;
    }

    if (!conv.ai_active || conv.status === "resolved") {
      console.log(
        `[ai-generator] AI not active or conversation resolved. Aborting generation for ${conversationId}`,
      );
      return;
    }

    // 1. Resolver Empresa e Unidade
    const instData = Array.isArray(conv.whatsapp_instances)
      ? conv.whatsapp_instances[0]
      : conv.whatsapp_instances;
    const effectiveCompanyId =
      companyId || conv.contacts?.company_id || (instData as any)?.company_id;

    // Verificar se já temos unidade específica vinculada à conversa, instância ou contato
    const hasSpecificUnit = !!(conv.unit_id || (instData as any)?.unit_id || conv.contacts?.unit_id);
    let effectiveUnitId =
      conv.unit_id || (instData as any)?.unit_id || conv.contacts?.unit_id || null;

    // Buscar todas as unidades da empresa para contexto global
    const { data: allCompanyUnits } = await supabaseAdmin
      .from("units")
      .select("id, name, address, business_hours")
      .eq("company_id", effectiveCompanyId);

    let fallbackUnitId = effectiveUnitId;
    if (!fallbackUnitId && allCompanyUnits && allCompanyUnits.length > 0) {
      fallbackUnitId = allCompanyUnits[0].id;
    }

    // Se a instância é de uma filial física específica mas a conversa ainda não tinha unit_id gravado, vincula à filial
    if (!conv.unit_id && (instData as any)?.unit_id) {
      await supabaseAdmin
        .from("conversations")
        .update({ unit_id: (instData as any).unit_id })
        .eq("id", conversationId);
    }

    let agentIdToUse = conv.ai_agent_id;

    if (!agentIdToUse) {
      console.log(
        `[ai-generator] No AI agent assigned to conversation ${conversationId}. Auto-assigning best available agent...`,
      );
      const { data: defaultAgents } = await supabaseAdmin
        .from("ai_agents")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .eq("is_active", true)
        .eq("is_main_agent", true)
        .limit(1);

      if (defaultAgents && defaultAgents.length > 0) {
        agentIdToUse = defaultAgents[0].id;
        await supabaseAdmin
          .from("conversations")
          .update({ ai_agent_id: agentIdToUse })
          .eq("id", conversationId);
      } else {
        console.log(
          `[ai-generator] No active AI agents found in company ${effectiveCompanyId}. Aborting.`,
        );
        return;
      }
    }

    // 2. Buscar detalhes do Agente de IA
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("ai_agents")
      .select("*")
      .eq("id", agentIdToUse)
      .single();

    if (agentErr || !agent || !agent.is_active) {
      console.error(`[ai-generator] AI Agent not found or inactive: ${conv.ai_agent_id}`);
      return;
    }

    // 3. Buscar configurações de IA da Empresa
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("ai_settings, document, address, business_hours, custom_variables, name")
      .eq("id", effectiveCompanyId)
      .single();

    if (companyErr || !company || !company.ai_settings) {
      console.error(`[ai-generator] Company AI settings not found: ${effectiveCompanyId}`);
      return;
    }

    // Buscar Unidade garantida
    let unitData: any = null;
    if (effectiveUnitId) {
      const { data: unit } = await supabaseAdmin
        .from("units")
        .select("document, address, business_hours, custom_variables, name")
        .eq("id", effectiveUnitId)
        .single();
      unitData = unit;
    }

    const aiSettings = company.ai_settings as any;

    // Buscar colegas especialistas permitidos
    let colleagues: any[] = [];
    if (agent.allowed_agent_ids && agent.allowed_agent_ids.length > 0) {
      const { data } = await supabaseAdmin
        .from("ai_agents")
        .select("id, name, ai_type, description")
        .eq("company_id", effectiveCompanyId)
        .eq("is_active", true)
        .in("id", agent.allowed_agent_ids)
        .neq("id", agent.id);
      colleagues = data || [];
    }

    // Resolver Provedor e Chave de API
    let provider = agent.provider || "default";
    if (provider === "default") {
      provider = aiSettings.engines?.chatbot || "openai";
    }

    const apiKey = aiSettings.keys?.[provider];
    if (!apiKey) {
      console.error(`[ai-generator] Missing API key for provider ${provider}`);
      return;
    }

    let baseUrl = "https://api.openai.com/v1/chat/completions";
    if (provider === "groq") baseUrl = "https://api.groq.com/openai/v1/chat/completions";
    else if (provider === "openrouter") baseUrl = "https://openrouter.ai/api/v1/chat/completions";

    // 4. Histórico recente de mensagens (35 mensagens para amplitude de contexto)
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, created_at, media_type, transcription")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(35);

    if (!messages || messages.length === 0) return;
    messages.reverse();

    // Se o cliente interagiu, reiniciar contadores de follow-up e cadência imediatamente
    const lastMsgInHistory = messages[messages.length - 1];
    if (lastMsgInHistory?.sender_type === "contact") {
      await supabaseAdmin
        .from("conversations")
        .update({
          ai_followup_count: 0,
          ai_last_followup_at: null,
          cadence_step: 0,
          cadence_next_at: null,
        } as any)
        .eq("id", conversationId);

      // Cancela mensagens futuras agendadas automaticamente pela IA, pois o cliente já retomou o contato
      await cancelScheduledMessagesForConversation(
        conversationId,
        "Cliente interagiu antes do envio agendado",
        "agent",
      );
    }

    // Mesclar variáveis personalizadas (Unidade sobressai à Empresa)
    const compVars =
      typeof company.custom_variables === "object" && company.custom_variables !== null
        ? company.custom_variables
        : {};
    const unitVars =
      unitData &&
      typeof unitData.custom_variables === "object" &&
      unitData.custom_variables !== null
        ? unitData.custom_variables
        : {};
    const mergedCustomVars = { ...compVars, ...unitVars };

    const infoEmpresa =
      `EMPRESA: ${company.name || ""}\nCNPJ: ${company.document || ""}\nEndereço: ${company.address || ""}\nHorários: ${company.business_hours || ""}\n${
        Object.entries(compVars).length
          ? `Variáveis:\n${Object.entries(compVars)
              .map(([k, v]) => `- ${k}: ${v}`)
              .join("\n")}`
          : ""
      }`.trim();

    let infoUnidade = "";
    if (unitData) {
      infoUnidade =
        `UNIDADE: ${unitData.name || ""}\nCNPJ: ${unitData.document || ""}\nEndereço: ${unitData.address || ""}\nHorários: ${unitData.business_hours || ""}\n${
          Object.entries(unitVars).length
            ? `Variáveis:\n${Object.entries(unitVars)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join("\n")}`
            : ""
        }`.trim();
    }

    const rawClientName = (conv.contacts?.name || "").trim();
    const clientFirstName = rawClientName ? rawClientName.split(/\s+/)[0] : "";
    const unitName = unitData?.name || "Matriz";
    const companyName = company.name || "";

    const applyVars = (text: string | null | undefined) => {
      if (!text) return "";
      let t = text;
      // Nomes de cliente
      if (rawClientName) {
        t = t.replace(/\{\{nome_cliente\}\}/g, rawClientName);
        t = t.replace(/\{\{cliente\}\}/g, rawClientName);
        t = t.replace(/\{\{nome\}\}/g, rawClientName);
      }
      if (clientFirstName) {
        t = t.replace(/\{\{primeiro_nome\}\}/g, clientFirstName);
      }
      if (conv.contacts?.phone) {
        t = t.replace(/\{\{telefone\}\}/g, conv.contacts.phone);
        t = t.replace(/\{\{telefone_cliente\}\}/g, conv.contacts.phone);
      }

      // Unidade e Empresa
      t = t.replace(/\{\{unidade\}\}/g, unitName);
      t = t.replace(/\{\{nome_unidade\}\}/g, unitName);
      t = t.replace(/\{\{empresa\}\}/g, companyName);
      t = t.replace(/\{\{nome_empresa\}\}/g, companyName);

      t = t.replace(/\{\{info_empresa\}\}/g, infoEmpresa);
      t = t.replace(/\{\{info_unidade\}\}/g, infoUnidade || infoEmpresa);
      t = t.replace(/\{\{cnpj\}\}/g, unitData?.document || company.document || "");
      t = t.replace(/\{\{endereco\}\}/g, unitData?.address || company.address || "");
      t = t.replace(/\{\{horarios\}\}/g, unitData?.business_hours || company.business_hours || "");
      for (const [key, value] of Object.entries(mergedCustomVars)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        t = t.replace(regex, String(value));
      }
      return t;
    };

    // 5. Construir Prompts do Sistema
    const systemPromptParts: string[] = [];
    systemPromptParts.push(`Você é ${agent.name}.`);

    // Injeção de Contexto Autoritativo da Conversa Atual
    const nowUtc = new Date();
    const spNowStr = nowUtc.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const availableUnitsList =
      allCompanyUnits && allCompanyUnits.length > 0
        ? allCompanyUnits.map((u) => u.name).join(", ")
        : "Aracruz, Linhares, Mantena, São Mateus, Serra";

    const contextHeader = [
      `=== CONTEXTO DO ATENDIMENTO ATUAL (DADOS AUTORITATIVOS DO SISTEMA) ===`,
      `DATA E HORA ATUAL: ${spNowStr} (Horário de Brasília - America/Sao_Paulo)`,
      `EMPRESA: ${companyName}`,
      hasSpecificUnit
        ? `UNIDADE ATUAL DE ATENDIMENTO: ${unitName}`
        : `CANAL DE ATENDIMENTO: Central Geral da Rede (Unidade física ainda não vinculada)`,
      rawClientName
        ? `NOME DO CLIENTE: ${rawClientName} (Primeiro nome: ${clientFirstName})`
        : `NOME DO CLIENTE: Não informado ainda`,
      conv.contacts?.phone ? `TELEFONE DO CLIENTE: ${conv.contacts.phone}` : null,
      hasSpecificUnit
        ? (unitData?.address ? `ENDEREÇO DA UNIDADE: ${unitData.address}` : null)
        : `UNIDADES DISPONÍVEIS NA REDE: ${availableUnitsList}`,
      hasSpecificUnit
        ? (unitData?.business_hours ? `HORÁRIOS DA UNIDADE: ${unitData.business_hours}` : null)
        : (company.business_hours ? `HORÁRIOS DA REDE: ${company.business_hours}` : null),
      `--- DIRETRIZES CRÍTICAS DE CONTEXTO E LOCALIZAÇÃO ---`,
      hasSpecificUnit
        ? `1. O cliente está em contato direto com a unidade '${unitName}'. Você está respondendo exclusivamente por esta filial. Não pergunte qual cidade ele prefere, pois a unidade já está definida como '${unitName}'.`
        : `1. ATENDIMENTO CENTRAL DA REDE: O cliente entrou pelo canal geral da empresa e a unidade física ainda não foi selecionada.
- A empresa atende nas cidades: ${availableUnitsList}.
- Pergunte de forma muito cordial e natural qual cidade/unidade o cliente prefere ou onde deseja ser atendido.
- Assim que o cliente indicar a cidade (ex: 'Aracruz', 'Linhares', 'Mantena', 'São Mateus', 'Serra'), acione nativamente a ferramenta 'definir_unidade' para fixar o atendimento nesta filial.`,
      rawClientName
        ? `2. O nome do cliente já é conhecido (${rawClientName}). Trate-o com naturalidade e cordialidade chamando preferencialmente por ${clientFirstName}. NUNCA pergunte 'qual é o seu nome?' ou 'com quem estou falando?'.`
        : `2. O nome do cliente ainda NÃO foi informado no sistema. Na mensagem inicial, cumprimente calorosamente e pergunte amigavelmente como pode chamá-lo(a) ou com quem está falando. Assim que ele disser o nome, chame a ferramenta 'atualizar_nome_cliente' para salvar no CRM.`,
      `======================================================================`,
    ]
      .filter(Boolean)
      .join("\n");

    systemPromptParts.push(contextHeader);

    // Diretriz Mandatória de Ferramentas Nativas, Tamanho de Mensagem e Especialização
    systemPromptParts.push(`=== DIRETRIZES DE FERRAMENTAS E COMUNICAÇÃO ===
1. Você dispõe de ferramentas nativas (tools/functions) para criar/atualizar oportunidades no CRM, agendar tarefas, agendar mensagens futuras ('agendar_mensagem'), definir unidade ('definir_unidade'), salvar nome do cliente ('atualizar_nome_cliente'), transferir o atendimento para equipe humana ou colegas, e encerrar o chamado. Chame SEMPRE a ferramenta correspondente nativamente quando o contexto exigir.
2. É ESTRITAMENTE PROIBIDO escrever tags textuais como '[CRIAR_OPORTUNIDADE]', '[ATUALIZAR_OPORTUNIDADE]', '[TRANSFERIR]', '[TRANSFERIR_AGENTE]', '[ENCERRAR]', '[CRIAR_TAREFA]', '[AGENDAR_MENSAGEM]' ou qualquer comando em colchetes no texto enviado ao cliente.
3. O cliente é uma pessoa real no WhatsApp e NUNCA deve ler comandos técnicos de bastidor. Qualquer tag exposta no texto é uma falha grave.
4. Para ferramentas que interagem com o cliente (como transferir_atendimento, delegar_para_outro_agente_ia ou encerrar_atendimento), preencha o argumento 'aviso' ou 'despedida' com a mensagem calorosa, curta e natural que o cliente lerá.
5. AÇÕES DO CRM (OPORTUNIDADES E TAREFAS): Quando o cliente demonstrar interesse em um serviço/procedimento, solicitar proposta, orçamento ou concordar em agendar/comprar, NÃO adie para depois: CHAME IMEDIATAMENTE a ferramenta 'criar_oportunidade' (ou 'atualizar_oportunidade' se já houver uma oportunidade aberta) nesta mesma resposta junto com a mensagem natural ao cliente.
6. RETORNO / AGENDAMENTO DE MENSAGEM: Se o cliente pedir para chamá-lo mais tarde, amanhã, daqui a algumas horas ou em dia específico (ex: 'me chame amanhã às 10h', 'vou ver com meu marido e te respondo à noite'), use a ferramenta 'agendar_mensagem' com o texto a enviar e a data/horário.
7. TAMANHO DE MENSAGEM NO WHATSAPP (MUITO IMPORTANTE - RESPOSTAS CURTAS):
- NUNCA envie mensagens longas, prolixas ou 'textões'. NUNCA envie listas longas com dezenas de tópicos ou vários emojis por linha.
- Cada mensagem deve ter no máximo de 2 a 3 frases/parágrafos curtíssimos (1 a 2 linhas cada).
- Escreva exatamente como uma pessoa real digita no WhatsApp: direto ao ponto, caloroso, simpático e objetivo.
- Faça SEMPRE APENAS UMA pergunta direta e simples ao final para que o cliente responda com facilidade.
8. DIVISÃO CLARA DE RESPONSABILIDADES (CADA IA FAZ APENAS UMA COISA):
- Cada IA da empresa possui uma especialidade restrita. NUNCA tente abraçar o trabalho de outra IA:
  * SDR (Triagem): Descobre rapidamente o interesse e intenção. Assim que souber o que o lead quer, passa para a especialista (Vendas ou Agendamento). Não vende nem agenda.
  * Vendas (Consultora / Closer): Conduz a proposta comercial, valores e fecha a oportunidade no CRM. Assim que o cliente aceitar e for agendar dia/horário, passa para a especialista de Agendamento. Não gerencia a grade de agendamentos.
  * Agendamento: Escolhe datas, horários e orienta o comparecimento. Não vende tratamentos nem negocia valores; se o cliente pedir novos procedimentos, passa para Vendas.
- Quando a necessidade for de competência de outro colega, acione IMEDIATAMENTE 'delegar_para_outro_agente_ia'.
================================================`);

    if (agent.prompt_personality)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_personality)));
    if (agent.prompt_instructions)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_instructions)));
    if (agent.prompt_extra_info)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_extra_info)));

    // Instruções orientativas (o modelo agora tem ferramentas nativas)
    if (agent.allow_handoff) {
      systemPromptParts.push(
        cleanPromptDirective(applyVars(agent.prompt_handoff)) ||
          `DIRETRIZ DE TRANSFERÊNCIA HUMANA:\nSe você não souber como resolver a solicitação do cliente após tentar ajudar ou se ele solicitar explicitamente atendimento humano, chame a ferramenta 'transferir_atendimento' informando o 'aviso' para o cliente e o 'motivo' interno.`,
      );
    }

    if (agent.allow_resolution) {
      systemPromptParts.push(
        cleanPromptDirective(applyVars(agent.prompt_resolution)) ||
          `DIRETRIZ DE ENCERRAMENTO:\nQuando o cliente tiver suas dúvidas sanadas, confirmar que deu tudo certo ou se despedir cordialmente, chame a ferramenta 'encerrar_atendimento' com a 'despedida' para ele e o 'resumo' do atendimento.`,
      );
    }

    if (colleagues && colleagues.length > 0) {
      const colleaguesList = colleagues
        .map((c) => `- ${c.name} (${c.ai_type || "Geral"}): ${c.description || "Especialista"}`)
        .join("\n");
      systemPromptParts.push(
        `TRABALHO EM EQUIPE (MULTI-AGENTES):\nSe a solicitação for de competência de outro colega especialista, chame a ferramenta 'delegar_para_outro_agente_ia' informando o nome ou ID do colega e o 'aviso' anunciando a troca para o cliente.\nColegas disponíveis:\n${colleaguesList}`,
      );
    }

    if (agent.allow_tasks) {
      systemPromptParts.push(
        cleanPromptDirective(applyVars(agent.prompt_tasks)) ||
          `CRIAÇÃO DE TAREFAS NO CRM:\nVocê pode agendar tarefas e follow-ups para a equipe usando a ferramenta nativa 'criar_tarefa'. Informe título, descrição e data/hora prevista (ex: 'amanhã às 14:00', '2026-10-10 10:00').`,
      );
    }

    if (agent.allow_opportunities) {
      systemPromptParts.push(
        cleanPromptDirective(applyVars(agent.prompt_opportunities)) ||
          `OPORTUNIDADES DE VENDAS NO CRM:\nVocê tem acesso direto ao funil de vendas. Quando o cliente demonstrar interesse comercial ou solicitar orçamento/proposta, chame nativamente a ferramenta 'criar_oportunidade'. Para avançar de etapa no funil, chame 'atualizar_oportunidade'.`,
      );

      if (agent.pipeline_id) {
        const { data: stages } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id, name")
          .eq("pipeline_id", agent.pipeline_id)
          .order("order", { ascending: true });
        if (stages && stages.length > 0) {
          const stagesList = stages.map((s) => `- ${s.name} (ID: ${s.id})`).join("\n");
          systemPromptParts.push(`ETAPAS DO FUNIL DESTE AGENTE:\n${stagesList}`);
        }

        const { data: opps } = await supabaseAdmin
          .from("opportunities")
          .select("id, title, value, stage_id, pipeline_stages(name)")
          .eq("contact_id", conv.contact_id)
          .eq("status", "open");
        if (opps && opps.length > 0) {
          const oppsList = opps
            .map((o: any) => {
              const stageName = o.pipeline_stages?.name || o.stage_id;
              return `- Oportunidade ID: ${o.id} | Título: ${o.title} | Etapa Atual: ${stageName}`;
            })
            .join("\n");
          systemPromptParts.push(
            `OPORTUNIDADE ABERTA DO CLIENTE NO CRM:\n${oppsList}\nComo o cliente já possui oportunidade aberta, utilize 'atualizar_oportunidade' para avançar a etapa no funil conforme a conversa evolui.`,
          );
        } else {
          systemPromptParts.push(
            `STATUS NO CRM: O cliente ainda NÃO possui oportunidade aberta. Assim que ele demonstrar interesse, pedir valores ou solicitar proposta, chame 'criar_oportunidade' imediatamente.`,
          );
        }
      }
    }

    const systemPrompt = systemPromptParts.join("\n\n");

    const isFollowUpTrigger =
      lastMsgInHistory?.sender_type === "system" &&
      typeof lastMsgInHistory?.content === "string" &&
      (lastMsgInHistory.content.includes("SYSTEM_FOLLOW_UP_1") ||
        lastMsgInHistory.content.includes("SYSTEM_FOLLOW_UP_2") ||
        lastMsgInHistory.content.includes("SYSTEM_FOLLOW_UP_3"));

    const isInactivityClose =
      lastMsgInHistory?.sender_type === "system" &&
      typeof lastMsgInHistory?.content === "string" &&
      lastMsgInHistory.content.includes("SYSTEM_RESOLVE_INACTIVE");

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg, idx) => {
        let content = msg.content || "";

        if (msg.media_type === "audio" && msg.transcription) {
          content = `[Áudio Transcrito Pelo Sistema]: "${msg.transcription}"`;
        } else if (!content) {
          content = "[Anexo ou Mídia]";
        }

        if (msg.sender_type === "agent") {
          const match = content.match(/^\*?.+?\*?:\s*([\s\S]*)$/);
          if (match) content = match[1];
        }

        let role = msg.sender_type === "contact" ? "user" : "assistant";

        if (msg.sender_type === "system") {
          role = "user";
          content = `[MENSAGEM INTERNA DO SISTEMA]: ${content}`;
          const isCurrentTrigger = idx === messages.length - 1;
          if (content.includes("transferido pela IA para o colega")) {
            const defaultHandoffReceive =
              "Um colega de equipe transferiu este cliente para você. Leia o histórico acima para entender o contexto e continue o atendimento a partir de agora de acordo com a sua especialidade. NÃO transfira de volta sem antes tentar ajudar o cliente.";
            const inst = agent.prompt_receive_handoff
              ? applyVars(agent.prompt_receive_handoff)
              : defaultHandoffReceive;
            content += `\n[INSTRUÇÃO CRÍTICA]: ${inst}`;
          }
          if (isCurrentTrigger && content.includes("SYSTEM_FOLLOW_UP_1")) {
            content =
              "[INSTRUÇÃO CRÍTICA DE SISTEMA: 1º FOLLOW-UP]\nO cliente está há algum tempo sem responder. Envie UMA mensagem curta (1 ou 2 frases curtas), super amigável e natural perguntando se ele conseguiu ver a mensagem anterior ou se precisa de ajuda. NÃO se despeça e NÃO encerre o chamado.";
            if (agent.prompt_followup) {
              content += `\nDIRETRIZ DA EMPRESA:\n${applyVars(agent.prompt_followup)}`;
            }
          }
          if (isCurrentTrigger && content.includes("SYSTEM_FOLLOW_UP_2")) {
            content =
              "[INSTRUÇÃO CRÍTICA DE SISTEMA: 2º FOLLOW-UP]\nO cliente não respondeu ao primeiro lembrete. Envie uma mensagem curta e acolhedora retomando o assunto e perguntando se ficou alguma dúvida. NÃO se despeça e NÃO encerre o chamado.";
            if (agent.prompt_followup) {
              content += `\nDIRETRIZ DA EMPRESA:\n${applyVars(agent.prompt_followup)}`;
            }
          }
          if (isCurrentTrigger && content.includes("SYSTEM_FOLLOW_UP_3")) {
            content =
              "[INSTRUÇÃO CRÍTICA DE SISTEMA: 3º FOLLOW-UP (ÚLTIMO AVISO)]\nEste é o último aviso de acompanhamento. Avise amigavelmente que, se não houver resposta, o atendimento precisará ser finalizado em breve para liberar a fila, mas que ficamos à disposição quando quiser retomar. NÃO encerre o chamado agora, apenas envie o aviso.";
            if (agent.prompt_followup) {
              content += `\nDIRETRIZ DA EMPRESA:\n${applyVars(agent.prompt_followup)}`;
            }
          }
          if (isCurrentTrigger && content.includes("SYSTEM_RESOLVE_INACTIVE")) {
            content =
              "[INSTRUÇÃO CRÍTICA DE SISTEMA: ENCERRAMENTO POR INATIVIDADE]\nO cliente não respondeu às tentativas de contato. Despeça-se cordialmente agora. O sistema finalizará o atendimento.";
          }
        }

        return { role: role as any, content };
      }),
    ];

    let finalModel = agent.model || "default";
    if (finalModel === "default") {
      finalModel = aiSettings.active_chatbot_model || "gpt-4o-mini";
    }

    // 6. Construir Declaração Nativa de Tools (JSON Schema - Padrão A Jornada)
    const tools: any[] = [];

    if (agent.allow_handoff) {
      tools.push({
        type: "function",
        function: {
          name: "transferir_atendimento",
          description:
            "Transfere o atendimento para a equipe ou fila humana de atendentes quando o cliente solicita ou o assunto foge do seu escopo. Não deixa o cliente sem resposta.",
          parameters: {
            type: "object",
            properties: {
              aviso: {
                type: "string",
                description:
                  "Mensagem acolhedora enviada ao cliente no WhatsApp avisando que ele está sendo transferido para a equipe humana. Não prometa tempo exato.",
              },
              motivo: {
                type: "string",
                description:
                  "Motivo claro e detalhado do transbordo gravado na nota interna para a equipe humana.",
              },
              departamento_nome_ou_id: {
                type: "string",
                description: "Nome ou ID do departamento de destino (opcional).",
              },
            },
            required: ["aviso", "motivo"],
          },
        },
      });
    }

    if (agent.allow_resolution && !isFollowUpTrigger) {
      tools.push({
        type: "function",
        function: {
          name: "encerrar_atendimento",
          description:
            "Encerra o chamado e marca como resolvido quando a dúvida do cliente for sanada ou ele se despedir com sucesso.",
          parameters: {
            type: "object",
            properties: {
              despedida: {
                type: "string",
                description:
                  "Mensagem final cordial enviada ao cliente antes de finalizar o atendimento.",
              },
              resumo: {
                type: "string",
                description:
                  "Breve resumo do que foi concluído com sucesso para o histórico da sessão.",
              },
            },
            required: ["despedida", "resumo"],
          },
        },
      });
    }

    if (colleagues && colleagues.length > 0) {
      const colleaguesDesc = colleagues
        .map((c) => `${c.name} (${c.ai_type || "Geral"})`)
        .join(", ");
      tools.push({
        type: "function",
        function: {
          name: "delegar_para_outro_agente_ia",
          description: `Transfere a conversa para outro colega de IA especialista. Colegas disponíveis: ${colleaguesDesc}`,
          parameters: {
            type: "object",
            properties: {
              agente_nome_ou_id: {
                type: "string",
                description: "Nome ou ID do agente colega para quem transferir.",
              },
              aviso: {
                type: "string",
                description:
                  "Mensagem enviada ao cliente anunciando que o colega especialista vai assumir.",
              },
              motivo: { type: "string", description: "Motivo da delegação para a nota interna." },
            },
            required: ["agente_nome_ou_id", "aviso"],
          },
        },
      });
    }

    if (agent.allow_tasks) {
      tools.push({
        type: "function",
        function: {
          name: "criar_tarefa",
          description:
            "Agenda uma tarefa de follow-up ou lembrete no CRM para a equipe. Ferramenta de bastidor.",
          parameters: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Título claro da tarefa." },
              descricao: {
                type: "string",
                description: "Descrição ou notas de contexto da tarefa.",
              },
              data_hora: {
                type: "string",
                description:
                  "Data e horário de vencimento (ex: 'amanhã às 14h', 'em 2 dias', '2026-10-15 10:00').",
              },
            },
            required: ["titulo", "data_hora"],
          },
        },
      });
    }

    // Ferramenta nativa para Agendamento de Mensagens Futuras no WhatsApp
    tools.push({
      type: "function",
      function: {
        name: "agendar_mensagem",
        description:
          "Agenda uma mensagem para ser enviada automaticamente ao cliente no WhatsApp em uma data e horário futuros (ex: cliente pediu retorno amanhã às 10h, ou na próxima segunda-feira). Ferramenta de agendamento automático.",
        parameters: {
          type: "object",
          properties: {
            texto: {
              type: "string",
              description:
                "Texto amigável, curto e natural que será enviado ao cliente no WhatsApp no horário agendado.",
            },
            data_hora: {
              type: "string",
              description:
                "Data e horário do envio futuro (ex: 'amanhã às 10:00', 'em 2 dias às 14:00', '2026-11-10 09:30', 'segunda-feira às 11:00').",
            },
            motivo: {
              type: "string",
              description: "Motivo ou lembrete interno do agendamento (opcional).",
            },
          },
          required: ["texto", "data_hora"],
        },
      },
    });

    // Ferramenta nativa para Definir Unidade de Atendimento
    tools.push({
      type: "function",
      function: {
        name: "definir_unidade",
        description:
          "Define ou altera a unidade física da clínica para este atendimento (ex: quando o cliente informa qual cidade/unidade prefere ser atendido entre Aracruz, Linhares, Mantena, São Mateus ou Serra).",
        parameters: {
          type: "object",
          properties: {
            unidade_nome: {
              type: "string",
              description:
                "Nome da unidade ou cidade desejada pelo cliente (ex: 'Aracruz', 'Linhares', 'Mantena', 'São Mateus', 'Serra').",
            },
          },
          required: ["unidade_nome"],
        },
      },
    });

    // Ferramenta nativa para Atualizar Nome do Cliente
    tools.push({
      type: "function",
      function: {
        name: "atualizar_nome_cliente",
        description:
          "Salva ou atualiza o nome do cliente no cadastro assim que ele se apresentar na conversa.",
        parameters: {
          type: "object",
          properties: {
            nome: {
              type: "string",
              description: "Nome informado pelo cliente (ex: 'Mariana', 'Lucas Silva').",
            },
          },
          required: ["nome"],
        },
      },
    });

    if (agent.allow_opportunities) {
      tools.push({
        type: "function",
        function: {
          name: "criar_oportunidade",
          description:
            "Cria uma oportunidade de venda no funil do CRM para este cliente assim que ele demonstrar interesse, pedir valores ou solicitar proposta comercial. Chame simultaneamente com a sua resposta ao cliente.",
          parameters: {
            type: "object",
            properties: {
              titulo: {
                type: "string",
                description: "Título da oportunidade (ex: 'Epilação a Laser - Axilas').",
              },
              valor: {
                type: "number",
                description: "Valor financeiro numérico estimado (ex: 500.00).",
              },
              etapa_nome_ou_id: {
                type: "string",
                description:
                  "Nome da etapa do funil (ex: 'Em contato', 'Orçamento Gerado', 'Pré-Avaliação', 'Fechamento') ou UUID da etapa.",
              },
              observacoes: {
                type: "string",
                description: "Observações ou particularidades da oportunidade (opcional).",
              },
            },
            required: ["titulo"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "atualizar_oportunidade",
          description:
            "Move a oportunidade do cliente para a próxima etapa do funil conforme a conversa avança (ex: de 'Em contato' para 'Orçamento Gerado' ou 'Pré-Avaliação'). Chame simultaneamente com a sua resposta ao cliente.",
          parameters: {
            type: "object",
            properties: {
              nova_etapa_nome_ou_id: {
                type: "string",
                description:
                  "Nome ou ID da nova etapa no funil (ex: 'Orçamento Gerado', 'Pré-Avaliação', 'Fechamento').",
              },
              oportunidade_id: {
                type: "string",
                description: "ID da oportunidade (opcional se houver apenas uma).",
              },
              observacoes: {
                type: "string",
                description: "Motivo ou contexto da mudança de etapa (opcional).",
              },
            },
            required: ["nova_etapa_nome_ou_id"],
          },
        },
      });
    }

    console.log(
      `[ai-generator] Calling LLM (${provider} - ${finalModel}) with ${tools.length} native tools...`,
    );

    const requestBody: any = {
      model: finalModel.replace("openrouter/", "").replace("groq/", ""),
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: agent.max_tokens || 4096,
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    // 7. Chamada HTTP para API LLM
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider === "openrouter" && {
          "HTTP-Referer": "https://atendi.app",
          "X-Title": "Atendi CRM",
        }),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-generator] LLM API Error (${response.status}):`, errorText);
      return;
    }

    const responseJson = await response.json();
    const choice = responseJson.choices?.[0];
    const messageObj = choice?.message;
    const rawAiText = messageObj?.content || "";
    const toolCalls: any[] = messageObj?.tool_calls || [];

    // Limpeza de assinaturas manuais e tags residuais (Sanitizador DLP)
    let cleanResponse = sanitizeCustomerFacingText(rawAiText);

    // Flags e acumuladores de ações
    let isHandoff = false;
    let handoffNote = "";
    let handoffDeptInput: string | null = null;
    let handoffCustomerAviso: string | null = null;

    let isResolve = false;
    let resolveNote = "";
    let resolveFarewell: string | null = null;

    let transferAgentInput: string | null = null;
    let transferAgentAviso: string | null = null;

    let crmTaskData: { title: string; description: string; dueDate: string } | null = null;
    let setUnitData: string | null = null;
    let updateClientNameData: string | null = null;
    let crmOppCreateData: {
      title: string;
      value: number;
      stage: string | null;
      notes?: string | null;
    } | null = null;
    let crmOppUpdateData: { oppId: string | null; stage: string; notes?: string | null } | null =
      null;
    let scheduledMessageData: {
      content: string;
      dueDate: string;
      reason?: string;
    } | null = null;

    // A. Processar Native Tool Calls
    if (toolCalls && toolCalls.length > 0) {
      console.log(`[ai-generator] Processing ${toolCalls.length} tool calls...`);
      for (const call of toolCalls) {
        const fnName = call.function?.name;
        let args: any = {};
        try {
          args =
            typeof call.function?.arguments === "string"
              ? JSON.parse(call.function.arguments)
              : call.function?.arguments || {};
        } catch (e) {
          console.error(
            `[ai-generator] Erro ao parsear argumentos da tool ${fnName}:`,
            call.function?.arguments,
          );
        }

        if (fnName === "transferir_atendimento" && agent.allow_handoff) {
          isHandoff = true;
          handoffNote =
            args.motivo || "Cliente solicitou atendimento humano ou IA realizou transbordo.";
          handoffDeptInput = args.departamento_nome_ou_id || null;
          if (args.aviso) handoffCustomerAviso = sanitizeCustomerFacingText(args.aviso);
        } else if (fnName === "encerrar_atendimento" && agent.allow_resolution) {
          isResolve = true;
          resolveNote = args.resumo || "Atendimento concluído com sucesso pela IA.";
          if (args.despedida) resolveFarewell = sanitizeCustomerFacingText(args.despedida);
        } else if (fnName === "delegar_para_outro_agente_ia") {
          transferAgentInput = args.agente_nome_ou_id || null;
          if (args.aviso) transferAgentAviso = sanitizeCustomerFacingText(args.aviso);
          if (args.motivo) handoffNote = args.motivo;
        } else if (fnName === "criar_tarefa" && agent.allow_tasks) {
          crmTaskData = {
            title: args.titulo || "Acompanhamento de Atendimento",
            description: args.descricao || "",
            dueDate: args.data_hora || "",
          };
        } else if (fnName === "agendar_mensagem") {
          scheduledMessageData = {
            content: args.texto || "",
            dueDate: args.data_hora || "",
            reason: args.motivo || "",
          };
        } else if (fnName === "definir_unidade") {
          setUnitData = args.unidade_nome || args.unidade_nome_ou_id || null;
        } else if (fnName === "atualizar_nome_cliente") {
          updateClientNameData = args.nome || null;
        } else if (fnName === "criar_oportunidade" && agent.allow_opportunities) {
          crmOppCreateData = {
            title: args.titulo || "Nova Oportunidade",
            value: parseCurrencyValue(args.valor),
            stage: args.etapa_nome_ou_id || args.etapa || null,
            notes: args.observacoes ? String(args.observacoes).trim() : null,
          };
        } else if (fnName === "atualizar_oportunidade" && agent.allow_opportunities) {
          crmOppUpdateData = {
            oppId: args.oportunidade_id || null,
            stage: args.nova_etapa_nome_ou_id || args.etapa_nome_ou_id || args.nova_etapa || "",
            notes: args.observacoes ? String(args.observacoes).trim() : null,
          };
        }
      }
    }

    // B. Retrocompatibilidade: Extração por Regex legadas caso não tenha vindo por tool_call
    if (!isHandoff && agent.allow_handoff) {
      const handoffMatch = cleanResponse.match(/\[TRANSFERIR(?::\s*(.*?))?\]/i);
      if (handoffMatch) {
        isHandoff = true;
        handoffNote = handoffMatch[1]
          ? handoffMatch[1].trim()
          : "Cliente solicitou atendimento humano ou IA não soube responder.";
      }
    }

    if (!transferAgentInput) {
      const transferAgentMatch = cleanResponse.match(/\[TRANSFERIR_?AGENTE:\s*(.*?)\]/i);
      if (transferAgentMatch) {
        transferAgentInput = transferAgentMatch[1].trim();
      }
    }

    if (!crmTaskData && agent.allow_tasks) {
      const taskMatch = cleanResponse.match(/\[CRIAR_TAREFA:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
      if (taskMatch) {
        crmTaskData = {
          title: taskMatch[1].trim(),
          description: taskMatch[2].trim(),
          dueDate: taskMatch[3].trim(),
        };
      }
    }

    if (!scheduledMessageData) {
      const scheduleMatch = cleanResponse.match(
        /\[AGENDAR_MENSAGEM:\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?\]/i,
      );
      if (scheduleMatch) {
        scheduledMessageData = {
          content: scheduleMatch[1].trim(),
          dueDate: scheduleMatch[2].trim(),
          reason: scheduleMatch[3] ? scheduleMatch[3].trim() : "",
        };
      }
    }

    if (!crmOppCreateData && agent.allow_opportunities) {
      const oppMatch = cleanResponse.match(
        /\[CRIAR_OPORTUNIDADE:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i,
      );
      if (oppMatch) {
        crmOppCreateData = {
          title: oppMatch[1].trim(),
          value: parseCurrencyValue(oppMatch[2]),
          stage: oppMatch[3].trim(),
        };
      }
    }

    if (!crmOppUpdateData && agent.allow_opportunities) {
      const updateOppMatch3 = cleanResponse.match(
        /\[ATUALIZAR_OPORTUNIDADE:\s*([^\s\|]+)\s*\|\s*([^\s\|]+)\s*\|\s*([^\s\|\]]+)\]/i,
      );
      if (updateOppMatch3) {
        crmOppUpdateData = {
          oppId: updateOppMatch3[1].trim(),
          stage: updateOppMatch3[3].trim(),
        };
      } else {
        const updateOppMatch2 = cleanResponse.match(
          /\[ATUALIZAR_OPORTUNIDADE:\s*([^\s\|]+)\s*\|\s*([^\s\|\]]+)\]/i,
        );
        if (updateOppMatch2) {
          crmOppUpdateData = {
            oppId: updateOppMatch2[1].trim(),
            stage: updateOppMatch2[2].trim(),
          };
        }
      }
    }

    if (
      !isResolve &&
      agent.allow_resolution &&
      !isHandoff &&
      !transferAgentInput &&
      !isFollowUpTrigger
    ) {
      const resolveMatch = cleanResponse.match(/\[ENCERRAR(?::\s*(.*?))?\]/i);
      if (resolveMatch) {
        isResolve = true;
        resolveNote = resolveMatch[1] ? resolveMatch[1].trim() : "Atendimento concluído pela IA.";
      }
    }

    // Se for trigger de follow-up (1º, 2º ou 3º aviso), NUNCA encerrar o atendimento
    if (isFollowUpTrigger) {
      isResolve = false;
    }

    // Se for encerramento por inatividade acionado pelo cron, forçar resolução garantida
    if (isInactivityClose) {
      isResolve = true;
      if (!resolveNote) resolveNote = "Encerrado automaticamente por inatividade do cliente.";
    }

    // Dicionário de resultados das tools executadas para alimentar Turn 2 se necessário
    const toolExecutionResults: Record<string, any> = {};

    // 7.5 Executar Definição de Unidade e Atualização de Nome do Cliente
    if (setUnitData && effectiveCompanyId) {
      const cleanUnitInput = setUnitData.trim();
      const { data: matchedUnit } = await supabaseAdmin
        .from("units")
        .select("id, name")
        .eq("company_id", effectiveCompanyId)
        .ilike("name", `%${cleanUnitInput}%`)
        .limit(1)
        .maybeSingle();

      if (matchedUnit) {
        effectiveUnitId = matchedUnit.id;
        await supabaseAdmin
          .from("conversations")
          .update({ unit_id: matchedUnit.id })
          .eq("id", conversationId);

        if (conv.contact_id) {
          await supabaseAdmin
            .from("contacts")
            .update({ unit_id: matchedUnit.id })
            .eq("id", conv.contact_id);
        }

        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `📍 Unidade definida pela IA: ${matchedUnit.name}`,
        });

        for (const call of toolCalls) {
          if (call.function?.name === "definir_unidade") {
            toolExecutionResults[call.id] = {
              status: "success",
              message: `Unidade vinculada com sucesso: '${matchedUnit.name}'.`,
            };
          }
        }
      }
    }

    if (updateClientNameData && conv.contact_id) {
      const cleanName = updateClientNameData.trim();
      if (cleanName.length >= 2) {
        await supabaseAdmin
          .from("contacts")
          .update({ name: cleanName })
          .eq("id", conv.contact_id);

        for (const call of toolCalls) {
          if (call.function?.name === "atualizar_nome_cliente") {
            toolExecutionResults[call.id] = {
              status: "success",
              message: `Nome do cliente salvo no CRM como '${cleanName}'.`,
            };
          }
        }
      }
    }

    // 8. Executar Ações de CRM (Tarefas, Criação e Atualização de Oportunidades)
    // A. Criar Tarefa no CRM
    if (crmTaskData && conv.contact_id) {
      const parsedDue = parseTaskDueDate(crmTaskData.dueDate);
      console.log(`[ai-generator] Creating task: "${crmTaskData.title}" for ${parsedDue}`);

      const { data: newTask, error: taskErr } = await supabaseAdmin
        .from("tasks")
        .insert({
          title: crmTaskData.title,
          description: crmTaskData.description || null,
          due_date: parsedDue,
          contact_id: conv.contact_id,
          unit_id: effectiveUnitId || fallbackUnitId,
          status: "pending",
          priority: "medium",
          task_type: "follow_up",
        })
        .select("id, title")
        .single();

      if (taskErr) {
        console.error(`[ai-generator] Failed to create task:`, taskErr);
        for (const call of toolCalls) {
          if (call.function?.name === "criar_tarefa") {
            toolExecutionResults[call.id] = { status: "error", error: taskErr.message };
          }
        }
      } else {
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `📌 Tarefa criada pela IA: ${newTask.title} (Previsão: ${new Date(parsedDue).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})`,
        });
        for (const call of toolCalls) {
          if (call.function?.name === "criar_tarefa") {
            toolExecutionResults[call.id] = {
              status: "success",
              message: `Tarefa '${newTask.title}' criada com sucesso no CRM para ${parsedDue}.`,
            };
          }
        }
      }
    }

    // B. Criar Oportunidade no CRM (Prevenção de Duplicidade - Padrão A Jornada)
    let processedOppId: string | null = null;
    let processedStageId: string | null = null;

    if (crmOppCreateData && conv.contact_id) {
      const resolvedStage = await resolveStageId(agent.pipeline_id, crmOppCreateData.stage);
      console.log(
        `[ai-generator] Processing opportunity for contact ${conv.contact_id}: "${crmOppCreateData.title}" (Value: ${crmOppCreateData.value}, Stage: ${resolvedStage})`,
      );

      // Prevenção de duplicidade: verificar se já existe oportunidade aberta para este contato
      const { data: existingOpps } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, value, stage_id, notes")
        .eq("contact_id", conv.contact_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingOpps && existingOpps.length > 0) {
        const existingOpp = existingOpps[0];
        console.log(
          `[ai-generator] Open opportunity already exists (${existingOpp.id}). Updating instead of creating duplicate.`,
        );

        const updatePayload: any = {};
        if (resolvedStage && resolvedStage !== existingOpp.stage_id) {
          updatePayload.stage_id = resolvedStage;
        }
        if (
          crmOppCreateData.value &&
          crmOppCreateData.value > 0 &&
          crmOppCreateData.value !== existingOpp.value
        ) {
          updatePayload.value = crmOppCreateData.value;
        }
        if (crmOppCreateData.notes && crmOppCreateData.notes !== existingOpp.notes) {
          updatePayload.notes = crmOppCreateData.notes;
        }

        if (Object.keys(updatePayload).length > 0) {
          await supabaseAdmin.from("opportunities").update(updatePayload).eq("id", existingOpp.id);

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "agent",
            is_internal: true,
            content: `🔄 Oportunidade vinculada pela IA: "${existingOpp.title}" mantida/atualizada (Valor: R$ ${(updatePayload.value ?? existingOpp.value ?? 0).toFixed(2)})`,
          });

          await supabaseAdmin.from("opportunity_history").insert({
            opportunity_id: existingOpp.id,
            action_type: "updated",
            description: `Oportunidade atualizada automaticamente pelo Agente de IA (${agent.name})${updatePayload.value ? ` | Novo valor: R$ ${Number(updatePayload.value).toFixed(2)}` : ""}`,
          });
        }

        processedOppId = existingOpp.id;
        processedStageId = updatePayload.stage_id || existingOpp.stage_id;

        for (const call of toolCalls) {
          if (call.function?.name === "criar_oportunidade") {
            toolExecutionResults[call.id] = {
              status: "success",
              message: `Oportunidade '${existingOpp.title}' mantida/atualizada no CRM.`,
            };
          }
        }
      } else {
        // Criação de nova oportunidade
        const { data: newOpp, error: oppErr } = await supabaseAdmin
          .from("opportunities")
          .insert({
            title: crmOppCreateData.title,
            value: crmOppCreateData.value,
            contact_id: conv.contact_id,
            unit_id: effectiveUnitId || fallbackUnitId,
            conversation_id: conversationId,
            stage_id: resolvedStage,
            owner_id: conv.assigned_agent_id || null,
            status: "open",
            notes: crmOppCreateData.notes || null,
          })
          .select("id, title, value")
          .single();

        if (oppErr) {
          console.error(`[ai-generator] Failed to create opportunity:`, oppErr);
          for (const call of toolCalls) {
            if (call.function?.name === "criar_oportunidade") {
              toolExecutionResults[call.id] = { status: "error", error: oppErr.message };
            }
          }
        } else {
          processedOppId = newOpp.id;
          processedStageId = resolvedStage;

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "agent",
            is_internal: true,
            content: `💰 Oportunidade criada pela IA: ${newOpp.title} (Valor: R$ ${newOpp.value.toFixed(2)})`,
          });

          await supabaseAdmin.from("opportunity_history").insert({
            opportunity_id: newOpp.id,
            action_type: "created",
            description: `Oportunidade criada automaticamente pelo Agente de IA (${agent.name})`,
          });

          for (const call of toolCalls) {
            if (call.function?.name === "criar_oportunidade") {
              toolExecutionResults[call.id] = {
                status: "success",
                message: `Oportunidade '${newOpp.title}' criada com sucesso no CRM (Valor: R$ ${newOpp.value.toFixed(2)}).`,
              };
            }
          }
        }
      }
    }

    // C. Atualizar Oportunidade no CRM
    if (crmOppUpdateData && conv.contact_id) {
      let targetOppId = crmOppUpdateData.oppId;

      if (!targetOppId) {
        if (processedOppId) {
          targetOppId = processedOppId;
        } else {
          const { data: existingOpp } = await supabaseAdmin
            .from("opportunities")
            .select("id, stage_id")
            .eq("contact_id", conv.contact_id)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetOppId = existingOpp?.id || null;
        }
      }

      if (targetOppId) {
        const resolvedStage = await resolveStageId(agent.pipeline_id, crmOppUpdateData.stage);

        let currentStageId = processedOppId === targetOppId ? processedStageId : null;
        if (!currentStageId) {
          const { data: curOpp } = await supabaseAdmin
            .from("opportunities")
            .select("stage_id")
            .eq("id", targetOppId)
            .single();
          currentStageId = curOpp?.stage_id || null;
        }

        // Prevenção de duplicidade: só atualiza e registra no histórico se a etapa for realmente diferente da atual!
        if (resolvedStage && resolvedStage !== currentStageId) {
          await supabaseAdmin
            .from("opportunities")
            .update({ stage_id: resolvedStage })
            .eq("id", targetOppId);

          const { data: stName } = await supabaseAdmin
            .from("pipeline_stages")
            .select("name, meta_event_name")
            .eq("id", resolvedStage)
            .single();

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "agent",
            is_internal: true,
            content: `🔄 Oportunidade atualizada pela IA (Movida para etapa: ${stName?.name || resolvedStage}).`,
          });

          await supabaseAdmin.from("opportunity_history").insert({
            opportunity_id: targetOppId,
            action_type: "stage_change",
            description: `Etapa alterada pelo Agente de IA (${agent.name}) para ${stName?.name || resolvedStage}`,
          });

          if (stName?.meta_event_name && conv.contact_id && effectiveCompanyId) {
            try {
              const { data: oppRow } = await supabaseAdmin
                .from("opportunities")
                .select("value")
                .eq("id", targetOppId)
                .single();

              sendMetaCapiEvent({
                companyId: effectiveCompanyId,
                contactId: conv.contact_id,
                opportunityId: targetOppId,
                eventName: stName.meta_event_name,
                value: oppRow?.value ? Number(oppRow.value) : undefined,
                currency: "BRL",
                actionSource: "chat",
              }).catch((capiErr) =>
                console.warn("[ai-generator] Falha ao disparar Meta CAPI para etapa:", capiErr),
              );
            } catch (err) {
              console.warn("[ai-generator] Erro ao preparar Meta CAPI:", err);
            }
          }

          for (const call of toolCalls) {
            if (call.function?.name === "atualizar_oportunidade") {
              toolExecutionResults[call.id] = {
                status: "success",
                message: `Oportunidade movida para a etapa '${stName?.name || resolvedStage}' com sucesso.`,
              };
            }
          }
        } else {
          for (const call of toolCalls) {
            if (call.function?.name === "atualizar_oportunidade") {
              toolExecutionResults[call.id] = {
                status: "success",
                message: `Oportunidade já se encontra na etapa informada. Nenhuma alteração redundante foi efetuada.`,
              };
            }
          }
        }
      }
    }

    // D. Agendar Mensagem Futura
    if (scheduledMessageData && scheduledMessageData.content && scheduledMessageData.dueDate) {
      const parsedDue = parseTaskDueDate(scheduledMessageData.dueDate);
      console.log(
        `[ai-generator] Scheduling message for contact ${conv.contact_id}: "${scheduledMessageData.content.slice(0, 40)}..." at ${parsedDue}`,
      );
      try {
        const scheduled = await scheduleMessage({
          companyId: effectiveCompanyId,
          conversationId,
          contactId: conv.contact_id,
          unitId: effectiveUnitId || fallbackUnitId,
          creatorType: "agent",
          aiAgentId: agent.id,
          content: scheduledMessageData.content,
          scheduledAt: parsedDue,
          metadata: {
            reason: scheduledMessageData.reason,
            agent_name: agent.name,
          },
        });

        const formattedDate = new Date(parsedDue).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });

        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `⏰ Mensagem futura agendada pela IA para ${formattedDate}: "${scheduledMessageData.content}"`,
        });

        for (const call of toolCalls) {
          if (call.function?.name === "agendar_mensagem") {
            toolExecutionResults[call.id] = {
              status: "success",
              message: `Mensagem agendada com sucesso para ${formattedDate}. ID: ${scheduled.id}`,
            };
          }
        }
      } catch (err: any) {
        console.error(`[ai-generator] Erro ao agendar mensagem:`, err);
        for (const call of toolCalls) {
          if (call.function?.name === "agendar_mensagem") {
            toolExecutionResults[call.id] = { status: "error", error: err.message };
          }
        }
      }
    }

    // 9. Se o modelo chamou ferramentas de CRM mas não gerou o texto do cliente, executar Turn 2
    if (
      toolCalls &&
      toolCalls.length > 0 &&
      !isHandoff &&
      !transferAgentInput &&
      !isResolve &&
      (!cleanResponse || cleanResponse.trim().length === 0)
    ) {
      console.log(
        `[ai-generator] LLM called CRM tools without customer text. Executing Turn 2 for response...`,
      );
      const followUpMessages = [
        ...formattedMessages,
        messageObj,
        ...toolCalls.map((tc) => ({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify(
            toolExecutionResults[tc.id] || {
              status: "success",
              message: "Ação de CRM concluída com sucesso.",
            },
          ),
        })),
      ];

      try {
        const followUpRes = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(provider === "openrouter" && {
              "HTTP-Referer": "https://atendi.app",
              "X-Title": "Atendi CRM",
            }),
          },
          body: JSON.stringify({
            model: requestBody.model,
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: agent.max_tokens || 4096,
          }),
        });

        if (followUpRes.ok) {
          const followUpJson = await followUpRes.json();
          const followUpRaw = followUpJson.choices?.[0]?.message?.content || "";
          cleanResponse = sanitizeCustomerFacingText(followUpRaw);
          console.log(`[ai-generator] Turn 2 successfully generated customer response.`);
        } else {
          const errBody = await followUpRes.text();
          console.error(`[ai-generator] Turn 2 API Error (${followUpRes.status}):`, errBody);
        }
      } catch (fErr) {
        console.error(`[ai-generator] Exception during Turn 2:`, fErr);
      }
    }

    // Se a ferramenta de transição trouxe um aviso/despedida amigável e o texto principal veio vazio, aproveita o texto da ferramenta
    if (!cleanResponse) {
      if (handoffCustomerAviso) cleanResponse = handoffCustomerAviso;
      else if (transferAgentAviso) cleanResponse = transferAgentAviso;
      else if (resolveFarewell) cleanResponse = resolveFarewell;
    }

    // Sanitização final rigorosa: NENHUMA tag ou comando em colchetes chega ao WhatsApp do cliente
    cleanResponse = sanitizeCustomerFacingText(cleanResponse);

    // 10. Enviar mensagem limpa para o cliente via Plataforma
    if (cleanResponse.length > 0) {
      const finalMessageText = `*${agent.name}*:\n${cleanResponse}`;
      console.log(`[ai-generator] Sending AI response via Platform Sender...`);
      await sendPlatformMessage({
        conversationId: conversationId,
        text: finalMessageText,
        senderType: "agent",
        aiAgentId: agent.id,
      });
      console.log(`[ai-generator] AI Response successfully sent to customer.`);
    }

    // 11. Executar Ações de Transição de Estado (Lifecycle)

    // A. Delegação Multi-Agente
    if (transferAgentInput) {
      const resolvedTargetAgentId = resolveColleagueAgentId(colleagues, transferAgentInput);

      if (!resolvedTargetAgentId) {
        console.warn(
          `[ai-generator] Could not resolve colleague agent from input: ${transferAgentInput}`,
        );
      } else {
        // Proteção contra loop infinito (máximo 3 transferências em 5 minutos)
        const { data: recentSystemMsgs } = await supabaseAdmin
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", conversationId)
          .eq("sender_type", "system")
          .order("created_at", { ascending: false })
          .limit(10);

        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const transferCount =
          recentSystemMsgs?.filter(
            (m) =>
              m.content.includes("Atendimento transferido pela IA para o colega") &&
              new Date(m.created_at).getTime() > fiveMinutesAgo,
          ).length || 0;

        if (transferCount >= 3) {
          console.warn(
            `[ai-generator] Infinite loop between agents detected! Falling back to human queue.`,
          );
          isHandoff = true;
          handoffNote = "Loop entre IAs detectado. Transferido para equipe humana.";
        } else {
          const { data: targetAgent } = await supabaseAdmin
            .from("ai_agents")
            .select("name")
            .eq("id", resolvedTargetAgentId)
            .single();

          const targetName = targetAgent?.name || "Colega Especialista";
          console.log(
            `[ai-generator] Delegating from ${agent.name} to ${targetName} (${resolvedTargetAgentId})`,
          );

          await supabaseAdmin
            .from("conversations")
            .update({ ai_agent_id: resolvedTargetAgentId })
            .eq("id", conversationId);

          if (conv.current_session_id) {
            await supabaseAdmin.from("session_events").insert({
              session_id: conv.current_session_id,
              event_type: "transferred",
              metadata: {
                by_ai: true,
                targetType: "agent",
                targetId: resolvedTargetAgentId,
                targetName: targetName,
                ai_agent_id: agent.id,
                ai_agent_name: agent.name,
              },
            });
          }

          const systemMsg = `Atendimento transferido pela IA para o colega de equipe: ${targetName}`;
          const { data: insertedMsg } = await supabaseAdmin
            .from("messages")
            .insert({
              conversation_id: conversationId,
              sender_type: "system",
              content: systemMsg,
            })
            .select("id")
            .single();

          if (insertedMsg) {
            const { enqueueAiMessage } = await import("./ai-queue");
            enqueueAiMessage(conversationId, insertedMsg.id, effectiveCompanyId);
          }
        }
      }
    }

    // B. Executar Transbordo Humano (Handoff)
    if (isHandoff) {
      console.log(`[ai-generator] Executing human handoff for conversation ${conversationId}`);

      let targetDeptId = agent.handoff_department_id || null;
      if (handoffDeptInput) {
        const customDeptId = await resolveDepartmentId(effectiveCompanyId, handoffDeptInput);
        if (customDeptId) targetDeptId = customDeptId;
      }

      const updatePayload: any = {
        ai_active: false,
        assigned_agent_id: null,
        status: "waiting",
      };

      let deptName = null;
      if (targetDeptId) {
        updatePayload.department_id = targetDeptId;
        const { data: dept } = await supabaseAdmin
          .from("departments")
          .select("name")
          .eq("id", targetDeptId)
          .single();
        if (dept) deptName = dept.name;

        // Distribuição Round-Robin respeitando estritamente a Unidade
        const { assignDepartmentRoundRobin } = await import("./routing");
        const roundRobinAgent = await assignDepartmentRoundRobin(
          effectiveCompanyId,
          targetDeptId,
          effectiveUnitId,
        );
        if (roundRobinAgent) {
          updatePayload.assigned_agent_id = roundRobinAgent;
        }
      }

      await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);

      const { notifyTransferReceiver } = await import("./transfer-notifications");
      await notifyTransferReceiver({
        conversationId,
        receiverId: updatePayload.assigned_agent_id,
        actorLabel: agent.name ? `A IA ${agent.name}` : "A IA",
        departmentName: deptName,
      });

      const systemMsg = deptName
        ? `Atendimento transferido pela IA para o departamento: ${deptName}`
        : `Atendimento transferido pela IA para a fila de espera.`;

      await supabaseAdmin.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "system",
        content: systemMsg,
      });

      await supabaseAdmin.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "agent",
        is_internal: true,
        content: handoffNote,
        metadata: { ai_generated: true, ai_agent_id: agent.id, ai_agent_name: agent.name },
      });

      if (conv.current_session_id) {
        const sessionUpdate: any = { assigned_agent_id: updatePayload.assigned_agent_id || null };
        if (targetDeptId) sessionUpdate.department_id = targetDeptId;
        await supabaseAdmin
          .from("conversation_sessions")
          .update(sessionUpdate)
          .eq("id", conv.current_session_id);

        await supabaseAdmin.from("session_events").insert({
          session_id: conv.current_session_id,
          event_type: "transferred",
          metadata: {
            targetType: "department",
            targetId: targetDeptId || "queue",
            targetName: deptName || "Fila Geral",
            by_ai: true,
            observation: handoffNote,
          },
        });
      }
    } else if (isResolve) {
      // F. Encerramento Confiável do Atendimento
      console.log(
        `[ai-generator] Resolving conversation ${conversationId}. Reason: ${resolveNote}`,
      );

      const sessionId = conv.current_session_id;

      // Se foi encerramento por inatividade acionado pelo cron, inicializa a Cadência de Reengajamento (D+1)
      let cadenceNextAt: string | null = null;
      let cadenceStep = 0;

      if (isInactivityClose && (agent as any).allow_cadence !== false) {
        // Disparo D+1 em 24h, ajustado para horário comercial (10h da manhã)
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);
        nextDate.setHours(10, 0, 0, 0);
        // Se cair no domingo (0), joga para segunda-feira
        if (nextDate.getDay() === 0) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        cadenceNextAt = nextDate.toISOString();
        cadenceStep = 0; // Passo 0 concluído (sessão finalizada); próximo passo é o 1 (D+1)
        console.log(
          `[ai-generator] Inactivity closure: Cadence scheduled for D+1 at ${cadenceNextAt}`,
        );
      }

      await supabaseAdmin
        .from("conversations")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          current_session_id: null,
          cadence_step: cadenceStep,
          cadence_next_at: cadenceNextAt,
        } as any)
        .eq("id", conversationId);

      if (sessionId) {
        const resolvedReasonId = isInactivityClose
          ? agent.followup_resolution_reason_id || agent.resolution_reason_id || null
          : agent.resolution_reason_id || null;

        await supabaseAdmin
          .from("conversation_sessions")
          .update({
            resolved_at: new Date().toISOString(),
            resolution_reason_id: resolvedReasonId,
            resolution_observation: resolveNote,
          })
          .eq("id", sessionId);

        await supabaseAdmin.from("session_events").insert({
          session_id: sessionId,
          event_type: "resolved",
          metadata: { by_ai: true, observation: resolveNote, isInactivityClose },
        });
      }
    }
  } catch (err) {
    console.error(`[ai-generator] Fatal error:`, err);
  }
}
