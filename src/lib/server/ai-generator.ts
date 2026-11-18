import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";
import { scheduleMessage, cancelScheduledMessagesForConversation } from "./scheduled-messages";
import { sendMetaCapiEvent } from "./meta-capi";
import { analyzeTicketWithAI } from "./ticket-ai";

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
    /\[\s*(?:CRIAR[_\s]?OPORTUNIDADE|ATUALIZAR[_\s]?OPORTUNIDADE|MOVER[_\s]?OPORTUNIDADE|TRANSFERIR[_\s]?AGENTE|TRANSFERIR|ENCERRAR|CRIAR[_\s]?TAREFA|AGENDAR[_\s]?MENSAGEM|ABRIR[_\s]?TICKET|TICKET|OPORTUNIDADE|TAREFA)(?::[\s\S]*?)?\]/gi,
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
  p = p.replace(/\[\s*(?:CRIAR_|ATUALIZAR_|MOVER_|TRANSFERIR|ENCERRAR|ABRIR_).*?\]/gi, "");
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

/**
 * Resolução inteligente e hierárquica do Agente de IA para uma conversa:
 * 1. Prioridade 1: Agente ativo vinculado diretamente à instância/canal (instance_id)
 * 2. Prioridade 2: Agente atual da conversa (se ainda estiver ativo e válido)
 * 3. Prioridade 3: Agente ativo vinculado à unidade física (unit_id)
 * 4. Prioridade 4: Agente Principal ativo da empresa (is_main_agent = true)
 * 5. Prioridade 5: Agente ativo por padrão (active_by_default = true)
 * 6. Fallback final: Primeiro agente ativo disponível na empresa
 */
export async function resolveAiAgentForConversation({
  companyId,
  instanceId,
  unitId,
  currentAgentId,
}: {
  companyId: string;
  instanceId?: string | null;
  unitId?: string | null;
  currentAgentId?: string | null;
}): Promise<{
  agent: { id: string; name: string; is_main_agent: boolean; active_by_default: boolean } | null;
  aiActive: boolean;
}> {
  // 1. Prioridade 1: Agente ativo vinculado especificamente a este canal/instância
  if (instanceId) {
    const { data: instanceAgent } = await supabaseAdmin
      .from("ai_agents")
      .select("id, name, is_main_agent, active_by_default, is_active")
      .eq("company_id", companyId)
      .eq("instance_id", instanceId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (instanceAgent) {
      return {
        agent: instanceAgent,
        aiActive: true, // Se há um agente dedicado para este canal, ele deve atender ativamente!
      };
    }
  }

  // 2. Prioridade 2: Se a conversa já possui um agente (ex: delegação multi-agente em andamento), verificar se ainda está ativo
  if (currentAgentId) {
    const { data: currentAgent } = await supabaseAdmin
      .from("ai_agents")
      .select("id, name, is_main_agent, active_by_default, is_active")
      .eq("id", currentAgentId)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();

    if (currentAgent) {
      return {
        agent: currentAgent,
        aiActive: true,
      };
    }
  }

  // 3. Prioridade 3: Agente ativo vinculado à unidade física
  if (unitId) {
    const { data: unitAgent } = await supabaseAdmin
      .from("ai_agents")
      .select("id, name, is_main_agent, active_by_default, is_active")
      .eq("company_id", companyId)
      .eq("unit_id", unitId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (unitAgent) {
      return {
        agent: unitAgent,
        aiActive: unitAgent.active_by_default ?? true,
      };
    }
  }

  // 4. Prioridade 4: Agente Principal ativo da empresa (is_main_agent = true)
  const { data: mainAgents } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, is_main_agent, active_by_default, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("is_main_agent", true)
    .limit(1);

  if (mainAgents && mainAgents.length > 0) {
    const mainAgent = mainAgents[0];
    return {
      agent: mainAgent,
      aiActive: mainAgent.active_by_default ?? false,
    };
  }

  // 5. Prioridade 5: Agente ativo por padrão (active_by_default = true)
  const { data: defaultAgents } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, is_main_agent, active_by_default, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("active_by_default", true)
    .limit(1);

  if (defaultAgents && defaultAgents.length > 0) {
    return {
      agent: defaultAgents[0],
      aiActive: true,
    };
  }

  // 6. Fallback final: Primeiro agente ativo da empresa
  const { data: anyActiveAgent } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, is_main_agent, active_by_default, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (anyActiveAgent) {
    return {
      agent: anyActiveAgent,
      aiActive: anyActiveAgent.active_by_default ?? false,
    };
  }

  return { agent: null, aiActive: false };
}

export async function generateAndSendAiResponse(conversationId: string, companyId: string) {
  try {
    // 1. Buscar detalhes da conversa com garantia estrita de Empresa e Unidade
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, channel, ai_active, ai_agent_id, whatsapp_instance_id, contact_id, status, unit_id, current_session_id, contacts(name, phone, company_id, unit_id, instagram_username), whatsapp_instances(unit_id, company_id)",
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
    const hasSpecificUnit = !!(
      conv.unit_id ||
      (instData as any)?.unit_id ||
      conv.contacts?.unit_id
    );
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

    // 2. Buscar ou Re-resolver o Agente Ativo para este atendimento
    let agent: any = null;

    // Se já tinha um agentId, verifica se ele existe e continua ativo
    if (conv.ai_agent_id) {
      const { data: foundAgent } = await supabaseAdmin
        .from("ai_agents")
        .select("*")
        .eq("id", conv.ai_agent_id)
        .eq("is_active", true)
        .maybeSingle();

      // Só aceitamos o agente anterior se a instância NÃO tiver um agente dedicado diferente
      if (foundAgent) {
        if (!conv.whatsapp_instance_id || !foundAgent.instance_id || foundAgent.instance_id === conv.whatsapp_instance_id) {
          agent = foundAgent;
        }
      }
    }

    // Se não há agente ou o anterior está inativo ou há um agente dedicado para a instância:
    if (!agent) {
      console.log(
        `[ai-generator] Resolving best active AI agent for conversation ${conversationId} (instance: ${conv.whatsapp_instance_id})...`,
      );
      const resolution = await resolveAiAgentForConversation({
        companyId: effectiveCompanyId,
        instanceId: conv.whatsapp_instance_id,
        unitId: effectiveUnitId,
      });

      if (resolution.agent) {
        const { data: resolvedAgent } = await supabaseAdmin
          .from("ai_agents")
          .select("*")
          .eq("id", resolution.agent.id)
          .single();

        agent = resolvedAgent;
        await supabaseAdmin
          .from("conversations")
          .update({ ai_agent_id: resolution.agent.id, ai_active: true })
          .eq("id", conversationId);
        console.log(
          `[ai-generator] Conversation ${conversationId} updated to AI Agent: ${agent.name} (${agent.id})`,
        );
      }
    }

    if (!agent) {
      console.error(
        `[ai-generator] AI Agent not found or no active agent in company for conversation ${conversationId}. Aborting.`,
      );
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

    const channelNameMap: Record<string, string> = {
      whatsapp: "WhatsApp",
      instagram: "Instagram Direct",
      messenger: "Facebook Messenger",
      webchat: "Webchat",
    };
    const channelRaw = ((conv as any).channel as string) || "whatsapp";
    const currentChannel = channelNameMap[channelRaw] || channelRaw;

    const contextHeader = [
      `=== CONTEXTO DO ATENDIMENTO ATUAL (DADOS AUTORITATIVOS DO SISTEMA) ===`,
      `DATA E HORA ATUAL: ${spNowStr} (Horário de Brasília - America/Sao_Paulo)`,
      `EMPRESA: ${companyName}`,
      `CANAL DE COMUNICAÇÃO: ${currentChannel}`,
      hasSpecificUnit
        ? `UNIDADE ATUAL DE ATENDIMENTO: ${unitName}`
        : `LOCALIZAÇÃO: Central Geral da Rede (Unidade física ainda não vinculada)`,
      rawClientName
        ? `NOME DO CLIENTE: ${rawClientName} (Primeiro nome: ${clientFirstName})`
        : `NOME DO CLIENTE: Não informado ainda`,
      conv.contacts?.phone ? `TELEFONE DO CLIENTE: ${conv.contacts.phone}` : null,
      channelRaw === "instagram" && (conv.contacts as any)?.instagram_username
        ? `PERFIL DO INSTAGRAM: @${(conv.contacts as any).instagram_username.replace(/^@/, "")}`
        : null,
      hasSpecificUnit
        ? unitData?.address
          ? `ENDEREÇO DA UNIDADE: ${unitData.address}`
          : null
        : `UNIDADES DISPONÍVEIS NA REDE: ${availableUnitsList}`,
      hasSpecificUnit
        ? unitData?.business_hours
          ? `HORÁRIOS DA UNIDADE: ${unitData.business_hours}`
          : null
        : company.business_hours
          ? `HORÁRIOS DA REDE: ${company.business_hours}`
          : null,
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
3. O cliente é uma pessoa real conversando via ${currentChannel} e NUNCA deve ler comandos técnicos de bastidor. Qualquer tag exposta no texto é uma falha grave.
4. Para ferramentas que interagem com o cliente (como transferir_atendimento, delegar_para_outro_agente_ia ou encerrar_atendimento), preencha o argumento 'aviso' ou 'despedida' com a mensagem calorosa, curta e natural que o cliente lerá.
5. AÇÕES DO CRM (OPORTUNIDADES E TAREFAS): Quando o cliente demonstrar interesse em um serviço/procedimento, solicitar proposta, orçamento ou concordar em agendar/comprar, NÃO adie para depois: CHAME IMEDIATAMENTE a ferramenta 'criar_oportunidade' (ou 'atualizar_oportunidade' se já houver uma oportunidade aberta) nesta mesma resposta junto com a mensagem natural ao cliente.
6. RETORNO / AGENDAMENTO DE MENSAGEM: Se o cliente pedir para chamá-lo mais tarde, amanhã, daqui a algumas horas ou em dia específico (ex: 'me chame amanhã às 10h', 'vou ver com meu marido e te respondo à noite'), use a ferramenta 'agendar_mensagem' com o texto a enviar e a data/horário.
7. TAMANHO DE MENSAGEM NO CANAL (${currentChannel.toUpperCase()} - RESPOSTAS CURTAS):
- NUNCA envie mensagens longas, prolixas ou 'textões'. NUNCA envie listas longas com dezenas de tópicos ou vários emojis por linha.
- Cada mensagem deve ter no máximo de 2 a 3 frases/parágrafos curtíssimos (1 a 2 linhas cada).
- Escreva exatamente como uma pessoa real digita no ${currentChannel}: direto ao ponto, caloroso, simpático e objetivo.
- Faça SEMPRE APENAS UMA pergunta direta e simples ao final para que o cliente responda com facilidade.
8. DIVISÃO CLARA DE RESPONSABILIDADES (CADA IA FAZ APENAS UMA COISA):
- Cada IA da empresa possui uma especialidade restrita. NUNCA tente abraçar o trabalho de outra IA:
  * SDR (Triagem): Descobre rapidamente o interesse e intenção. Assim que souber o que o lead quer, passa para a especialista (Vendas ou Agendamento). Não vende nem agenda.
  * Vendas (Consultora / Closer): Conduz a proposta comercial, valores e fecha a oportunidade no CRM. Assim que o cliente aceitar e for agendar dia/horário, passa para a especialista de Agendamento. Não gerencia a grade de agendamentos.
  * Agendamento: Escolhe datas, horários e orienta o comparecimento. Não vende tratamentos nem negocia valores; se o cliente pedir novos procedimentos, passa para Vendas.
- Quando a necessidade for de competência de outro colega, acione IMEDIATAMENTE 'delegar_para_outro_agente_ia'.
9. FLUXO ESPECIAL DE MIGRAÇÃO PARA O WHATSAPP (INSTAGRAM DIRECT):
- Quando estiver atendendo no Instagram Direct, o objetivo é acolher, qualificar e migrar o cliente para o WhatsApp da unidade mais próxima:
  1) Descubra com simpatia o primeiro nome (se ainda não souber) e o procedimento/região de interesse.
  2) Pergunte qual cidade/unidade física fica mais próxima para ela (Aracruz, Linhares, Mantena, São Mateus ou Serra).
  3) Assim que ela indicar a cidade, use 'definir_unidade' e convide para o WhatsApp: explique que vai enviar fotos dos resultados, detalhes do protocolo e as condições especiais com valores direto no WhatsApp, pedindo o número com DDD.
  4) Assim que o cliente fornecer o número de WhatsApp, chame IMEDIATAMENTE a ferramenta nativa 'chamar_no_whatsapp' informando o telefone, unidade e a mensagem inicial de acolhimento.
  5) No texto enviado no Instagram, avise calorosamente que você já enviou uma mensagem para ela no WhatsApp pelo número oficial da unidade.
================================================`);

    if (agent.prompt_personality)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_personality)));
    if (agent.prompt_instructions)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_instructions)));
    if (agent.prompt_extra_info)
      systemPromptParts.push(cleanPromptDirective(applyVars(agent.prompt_extra_info)));

    // Roster de colegas multi-agente disponíveis (contexto para a ferramenta delegar_para_outro_agente_ia)
    if (colleagues && colleagues.length > 0) {
      const colleaguesList = colleagues
        .map((c) => `- ${c.name} (${c.ai_type || "Geral"}): ${c.description || "Especialista"}`)
        .join("\n");
      systemPromptParts.push(`EQUIPE DE COLEGAS DE IA DISPONÍVEIS:\n${colleaguesList}`);
    }

    // Contexto de Funil do CRM (etapas e oportunidades ativas para as ferramentas de CRM)
    if (agent.allow_opportunities && agent.pipeline_id) {
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
        systemPromptParts.push(`OPORTUNIDADE ABERTA DO CLIENTE NO CRM:\n${oppsList}`);
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

    if (agent.allow_tickets) {
      tools.push({
        type: "function",
        function: {
          name: "abrir_ticket",
          description:
            "Abre um chamado/ticket formal de suporte ou atendimento quando houver problema técnico, link com falha, reclamação grave ou quando não conseguir resolver a solicitação do cliente no chat.",
          parameters: {
            type: "object",
            properties: {
              assunto: {
                type: "string",
                description:
                  "Título conciso do chamado (ex: 'Falha no link de agendamento', 'Reclamação sobre atendimento', 'Solicitação de estorno').",
              },
              descricao: {
                type: "string",
                description:
                  "Detalhamento completo do problema relatado pelo cliente e o que foi tentado.",
              },
              departamento_sugerido: {
                type: "string",
                description:
                  "Nome do departamento sugerido (ex: 'Suporte', 'Financeiro', 'Comercial', 'Operações', 'Recepção'). Opcional.",
              },
              prioridade: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description:
                  "Prioridade do chamado: 'low' (baixa), 'medium' (média/normal), 'high' (alta) ou 'urgent' (urgente).",
              },
              aviso_ao_cliente: {
                type: "string",
                description:
                  "Mensagem empática que será dita ao cliente para tranquilizá-lo de que o chamado foi registrado.",
              },
            },
            required: ["assunto", "descricao"],
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

    // Ferramenta nativa para Chamar no WhatsApp através da Unidade
    tools.push({
      type: "function",
      function: {
        name: "chamar_no_whatsapp",
        description:
          "Inicia o atendimento ativo no WhatsApp do cliente através da instância oficial da unidade física mais próxima (Aracruz, Linhares, Mantena, São Mateus ou Serra). Acione imediatamente assim que o cliente fornecer o número de WhatsApp no Instagram/Direct.",
        parameters: {
          type: "object",
          properties: {
            telefone: {
              type: "string",
              description:
                "Número de WhatsApp com DDD informado pelo cliente (ex: '27999998888', '(27) 99888-7766').",
            },
            unidade_nome: {
              type: "string",
              description:
                "Nome da cidade ou unidade física desejada pelo cliente ('Aracruz', 'Linhares', 'Mantena', 'São Mateus' ou 'Serra').",
            },
            mensagem_whatsapp: {
              type: "string",
              description:
                "Primeira mensagem calorosa, personalizada e acolhedora que será enviada para o WhatsApp do cliente pelo número da unidade.",
            },
          },
          required: ["telefone"],
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
    let chamarNoWhatsappData: {
      telefone: string;
      unidade_nome?: string | null;
      mensagem_whatsapp?: string;
    } | null = null;
    let openTicketData: {
      subject: string;
      description: string;
      department?: string | null;
      priority?: string;
      customerNotice?: string | null;
    } | null = null;
    let openTicketNotice: string | null = null;

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
        } else if (fnName === "chamar_no_whatsapp") {
          chamarNoWhatsappData = {
            telefone: args.telefone || "",
            unidade_nome: args.unidade_nome || null,
            mensagem_whatsapp: args.mensagem_whatsapp || "",
          };
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
        } else if (fnName === "abrir_ticket" && agent.allow_tickets) {
          openTicketData = {
            subject: args.assunto || "Chamado aberto via IA",
            description: args.descricao || "",
            department: args.departamento_sugerido || null,
            priority: ["low", "medium", "high", "urgent"].includes(args.prioridade)
              ? args.prioridade
              : "medium",
            customerNotice: args.aviso_ao_cliente
              ? sanitizeCustomerFacingText(args.aviso_ao_cliente)
              : null,
          };
          if (openTicketData.customerNotice) {
            openTicketNotice = openTicketData.customerNotice;
          }
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

    if (!openTicketData && agent.allow_tickets) {
      const ticketMatch = cleanResponse.match(
        /\[ABRIR_TICKET:\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?\]/i,
      );
      if (ticketMatch) {
        openTicketData = {
          subject: ticketMatch[1].trim(),
          description: ticketMatch[2].trim(),
          department: ticketMatch[3] ? ticketMatch[3].trim() : null,
          priority: "medium",
        };
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
      const normalizeStr = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const searchNorm = normalizeStr(cleanUnitInput);

      let matchedUnit = allCompanyUnits?.find((u) => {
        const uNorm = normalizeStr(u.name);
        return uNorm.includes(searchNorm) || searchNorm.includes(uNorm);
      });

      if (!matchedUnit) {
        const { data: dbMatched } = await supabaseAdmin
          .from("units")
          .select("id, name")
          .eq("company_id", effectiveCompanyId)
          .ilike("name", `%${cleanUnitInput}%`)
          .limit(1)
          .maybeSingle();
        if (dbMatched) matchedUnit = dbMatched as any;
      }

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
        await supabaseAdmin.from("contacts").update({ name: cleanName }).eq("id", conv.contact_id);

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

    // Execução da Ferramenta: Chamar no WhatsApp pela Instância da Unidade
    if (chamarNoWhatsappData && conv.contact_id) {
      try {
        let rawPhone = String(chamarNoWhatsappData.telefone || "")
          .replace(/\D/g, "")
          .replace(/^0+/, ""); // Remove zeros à esquerda (ex: 027...)

        if (rawPhone.length >= 10 && rawPhone.length <= 11) {
          rawPhone = "55" + rawPhone;
        }

        if (rawPhone.length < 12) {
          console.warn(
            `[ai-generator] chamar_no_whatsapp: Telefone inválido (${chamarNoWhatsappData.telefone})`,
          );
          for (const call of toolCalls) {
            if (call.function?.name === "chamar_no_whatsapp") {
              toolExecutionResults[call.id] = {
                status: "error",
                error: "Número de telefone incompleto ou sem DDD. Peça o DDD para o cliente.",
              };
            }
          }
        } else {
          const normalizeStr = (s: string) =>
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

          // 1. Resolver unidade de destino
          let targetUnitId = effectiveUnitId;
          let targetUnitName = unitName;

          if (chamarNoWhatsappData.unidade_nome && allCompanyUnits) {
            const searchNorm = normalizeStr(chamarNoWhatsappData.unidade_nome);
            const matched = allCompanyUnits.find((u) => {
              const uNorm = normalizeStr(u.name);
              return uNorm.includes(searchNorm) || searchNorm.includes(uNorm);
            });
            if (matched) {
              targetUnitId = matched.id;
              targetUnitName = matched.name;
            }
          }

          if (!targetUnitId && fallbackUnitId) {
            targetUnitId = fallbackUnitId;
            const fallbackUnit = allCompanyUnits?.find((u) => u.id === fallbackUnitId);
            if (fallbackUnit) targetUnitName = fallbackUnit.name;
          }

          // 2. Atualizar o telefone e unidade no contato
          await supabaseAdmin
            .from("contacts")
            .update({
              phone: rawPhone,
              ...(targetUnitId ? { unit_id: targetUnitId } : {}),
            })
            .eq("id", conv.contact_id);

          // 3. Buscar as instâncias de WhatsApp da empresa
          let targetInstanceId: string | null = null;
          let targetInstanceName: string | null = null;

          const { data: companyInstances } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id, name, instance_name, unit_id, provider, network, status")
            .eq("company_id", effectiveCompanyId)
            .neq("provider", "instagram")
            .neq("provider", "messenger");

          if (companyInstances && companyInstances.length > 0) {
            // Prioridade 1: instância de WhatsApp da unidade com status 'connected'
            let matchedInst = companyInstances.find(
              (i) => i.unit_id === targetUnitId && i.status === "connected",
            );
            // Prioridade 2: qualquer instância de WhatsApp da unidade
            if (!matchedInst) {
              matchedInst = companyInstances.find((i) => i.unit_id === targetUnitId);
            }
            // Prioridade 3: qualquer instância 'connected' de WhatsApp da empresa
            if (!matchedInst) {
              matchedInst = companyInstances.find((i) => i.status === "connected");
            }
            // Fallback: primeira instância de WhatsApp
            if (!matchedInst) {
              matchedInst = companyInstances[0];
            }

            targetInstanceId = matchedInst?.id || null;
            targetInstanceName = matchedInst?.name || matchedInst?.instance_name || null;
          }

          if (!targetInstanceId) {
            throw new Error("Nenhuma instância de WhatsApp disponível para envio.");
          }

          // 4. Buscar ou criar conversa de WhatsApp para este contato
          let whatsappConvId: string | null = null;
          const { data: existingWaConvs } = await supabaseAdmin
            .from("conversations")
            .select("id, status")
            .eq("contact_id", conv.contact_id)
            .eq("whatsapp_instance_id", targetInstanceId)
            .order("last_message_at", { ascending: false })
            .limit(1);

          if (existingWaConvs && existingWaConvs.length > 0) {
            whatsappConvId = existingWaConvs[0].id;
            await supabaseAdmin
              .from("conversations")
              .update({
                status: "active",
                ai_active: true,
                ai_agent_id: agent.id,
                remote_id: rawPhone,
                last_message_at: new Date().toISOString(),
              })
              .eq("id", whatsappConvId);
          } else {
            const { data: newWaConv, error: newConvErr } = await supabaseAdmin
              .from("conversations")
              .insert({
                company_id: effectiveCompanyId,
                contact_id: conv.contact_id,
                whatsapp_instance_id: targetInstanceId,
                unit_id: targetUnitId,
                channel: "whatsapp",
                remote_id: rawPhone,
                status: "active",
                ai_active: true,
                ai_agent_id: agent.id,
                started_at: new Date().toISOString(),
                last_message_at: new Date().toISOString(),
                last_message_preview: (
                  chamarNoWhatsappData.mensagem_whatsapp || "Atendimento iniciado"
                ).substring(0, 50),
              })
              .select("id")
              .single();

            if (newConvErr || !newWaConv) {
              throw new Error(`Erro ao criar conversa no WhatsApp: ${newConvErr?.message}`);
            }
            whatsappConvId = newWaConv.id;

            // Criar sessão correspondente em conversation_sessions
            const { data: newSession } = await supabaseAdmin
              .from("conversation_sessions")
              .insert({
                conversation_id: whatsappConvId,
                started_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (newSession) {
              await supabaseAdmin
                .from("conversations")
                .update({ current_session_id: newSession.id })
                .eq("id", whatsappConvId);
            }
          }

          // 5. Preparar mensagem de abertura no WhatsApp
          const firstName = clientFirstName || "";
          const defaultWaMsg = `Olá${firstName ? `, ${firstName}` : ""}! Aqui é a ${agent.name} da Estética & Laser${targetUnitName ? ` de ${targetUnitName}` : ""} ✨ Conforme combinamos lá no Instagram, vim aqui te atender com todo carinho! Como posso te ajudar hoje?`;
          const finalWaMsg = (chamarNoWhatsappData.mensagem_whatsapp || defaultWaMsg).trim();

          // 6. Enviar a mensagem para o cliente no WhatsApp através da instância da filial
          console.log(
            `[ai-generator] Calling customer on WhatsApp (${rawPhone}) via instance ${targetInstanceName} (${targetUnitName})...`,
          );
          await sendPlatformMessage({
            conversationId: whatsappConvId,
            text: `*${agent.name}*:\n${finalWaMsg}`,
            senderType: "agent",
            aiAgentId: agent.id,
          });

          // 7. Inserir nota de auditoria no histórico da conversa do Instagram
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "system",
            content: `📱 Atendimento migrado para o WhatsApp com sucesso!\nNúmero: +${rawPhone}\nUnidade: ${targetUnitName || "Central"}\nInstância: ${targetInstanceName}`,
            is_internal: true,
            created_at: new Date().toISOString(),
          });

          for (const call of toolCalls) {
            if (call.function?.name === "chamar_no_whatsapp") {
              toolExecutionResults[call.id] = {
                status: "success",
                message: `Mensagem enviada com sucesso no WhatsApp (+${rawPhone}) pela filial de ${targetUnitName || "sua região"} através da instância '${targetInstanceName}'. Avise a cliente no Instagram com simpatia que você já chamou ela no WhatsApp para ela dar uma olhada!`,
              };
            }
          }
        }
      } catch (err: any) {
        console.error(`[ai-generator] Erro ao chamar no WhatsApp:`, err);
        for (const call of toolCalls) {
          if (call.function?.name === "chamar_no_whatsapp") {
            toolExecutionResults[call.id] = {
              status: "error",
              error: err.message || "Falha ao enviar mensagem no WhatsApp.",
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

    // E. Abertura Autônoma de Chamado / Ticket
    if (openTicketData && effectiveCompanyId) {
      console.log(
        `[ai-generator] Opening ticket: "${openTicketData.subject}" (Contact: ${conv.contact_id})`,
      );

      // Resolução de departamento sugerido
      let matchedDeptId: string | null = null;
      if (openTicketData.department) {
        const { data: dept } = await supabaseAdmin
          .from("departments")
          .select("id, name")
          .eq("company_id", effectiveCompanyId)
          .ilike("name", `%${openTicketData.department.trim()}%`)
          .limit(1)
          .maybeSingle();
        if (dept) {
          matchedDeptId = dept.id;
        }
      }

      // Prevenção de duplicidade: verificar se já existe chamado aberto nas últimas 24h para este contato ou conversa
      const dedupCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let dedupQuery = supabaseAdmin
        .from("tickets")
        .select("id, ticket_number, title, status")
        .eq("company_id", effectiveCompanyId)
        .not("status", "in", '("resolved","closed","cancelled")')
        .gte("created_at", dedupCutoff)
        .order("created_at", { ascending: false })
        .limit(1);

      if (conv.contact_id) {
        dedupQuery = dedupQuery.eq("requester_contact_id", conv.contact_id);
      } else {
        dedupQuery = dedupQuery.eq("conversation_id", conversationId);
      }

      const { data: existingTickets } = await dedupQuery;

      if (existingTickets && existingTickets.length > 0) {
        const existingTicket = existingTickets[0];
        console.log(
          `[ai-generator] Recent ticket #${existingTicket.ticket_number} already open. Appending note instead of creating duplicate.`,
        );

        // Anexar como nota interna no ticket existente
        await supabaseAdmin.from("ticket_messages").insert({
          ticket_id: existingTicket.id,
          is_internal_note: true,
          content: `🤖 O cliente voltou a relatar uma situação durante o atendimento com a IA (${agent.name}):\n\n*Assunto:* ${openTicketData.subject}\n*Descrição:* ${openTicketData.description}`,
        });

        // Registrar aviso no chat da conversa
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `🎫 Chamado #${existingTicket.ticket_number} já estava aberto para este cliente. Nova atualização anexada internamente ao ticket pela IA.`,
        });

        for (const call of toolCalls) {
          if (call.function?.name === "abrir_ticket") {
            toolExecutionResults[call.id] = {
              status: "success",
              ticket_id: existingTicket.id,
              ticket_number: existingTicket.ticket_number,
              message: `Chamado #${existingTicket.ticket_number} já se encontra aberto para este cliente. Uma nota interna com os novos detalhes foi anexada ao chamado existente.`,
            };
          }
        }
      } else {
        let targetUnitId = effectiveUnitId || fallbackUnitId;
        if (!targetUnitId) {
          const { data: firstUnit } = await supabaseAdmin
            .from("units")
            .select("id")
            .eq("company_id", effectiveCompanyId)
            .limit(1)
            .maybeSingle();
          targetUnitId = firstUnit?.id || null;
        }

        if (!targetUnitId) {
          console.error(
            `[ai-generator] Não foi possível abrir ticket: nenhuma unidade encontrada para a empresa ${effectiveCompanyId}`,
          );
          for (const call of toolCalls) {
            if (call.function?.name === "abrir_ticket") {
              toolExecutionResults[call.id] = {
                status: "error",
                error: "Nenhuma unidade cadastrada encontrada para vincular o chamado.",
              };
            }
          }
        } else {
          const priorityToUse = (openTicketData.priority || "medium") as
            "low" | "medium" | "high" | "urgent";

          const cleanSubject = openTicketData.subject?.replace(/\.$/, "") || "Atendimento";
          const formattedTitle = openTicketData.subject?.startsWith("[IA")
            ? openTicketData.subject
            : `[IA · SUPORTE] ${conv.contact?.name ? `${conv.contact.name} — ` : ""}${cleanSubject}`;

          const { data: newTicket, error: ticketErr } = await supabaseAdmin
            .from("tickets")
            .insert({
              company_id: effectiveCompanyId,
              unit_id: targetUnitId,
              department_id: matchedDeptId,
              scope: "external",
              origin: "ai_agent",
              title: formattedTitle,
              description: openTicketData.description,
              status: "new",
              priority: priorityToUse,
              requester_contact_id: conv.contact_id || null,
              conversation_id: conversationId,
              tags: ["aberto-por-ia"],
            })
            .select("id, ticket_number, title")
            .single();

          if (ticketErr) {
            console.error(`[ai-generator] Erro ao criar ticket:`, ticketErr);
            for (const call of toolCalls) {
              if (call.function?.name === "abrir_ticket") {
                toolExecutionResults[call.id] = { status: "error", error: ticketErr.message };
              }
            }
          } else {
            const formattedCode = `IA-${String(newTicket.ticket_number).padStart(5, "0")}`;
            console.log(`[ai-generator] Ticket ${formattedCode} successfully created!`);

            // Mensagem interna no chat da conversa
            await supabaseAdmin.from("messages").insert({
              conversation_id: conversationId,
              sender_type: "agent",
              is_internal: true,
              content: `🎫 Chamado ${formattedCode} aberto pela IA (${agent.name}): ${newTicket.title} (Prioridade: ${priorityToUse})`,
            });

            // Disparar análise de IA do chamado em background
            analyzeTicketWithAI(newTicket.id, effectiveCompanyId).catch((aiErr) =>
              console.warn(
                `[ai-generator] Falha ao analisar ticket #${newTicket.ticket_number} com IA:`,
                aiErr,
              ),
            );

            for (const call of toolCalls) {
              if (call.function?.name === "abrir_ticket") {
                toolExecutionResults[call.id] = {
                  status: "success",
                  ticket_id: newTicket.id,
                  ticket_number: newTicket.ticket_number,
                  ticket_code: formattedCode,
                  message: `Chamado ${formattedCode} ('${newTicket.title}') aberto com sucesso na central de tickets da empresa.`,
                };
              }
            }
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
      else if (openTicketNotice) cleanResponse = openTicketNotice;
      else if (openTicketData) {
        cleanResponse =
          "Abri um chamado formal com a nossa equipe especializada para verificar essa questão com prioridade. Em breve entraremos em contato!";
      }
    }

    // Sanitização final rigorosa: NENHUMA tag ou comando em colchetes chega ao cliente
    cleanResponse = sanitizeCustomerFacingText(cleanResponse);

    // 10. Enviar mensagem limpa para o cliente via Plataforma
    if (cleanResponse.length > 0) {
      const isWhatsapp = !channelRaw || channelRaw === "whatsapp";
      // No WhatsApp usamos *Nome*: para negrito nativo. Em outros canais (Instagram, Messenger) evitamos markdown que fica cru
      const finalMessageText = isWhatsapp
        ? `*${agent.name}*:\n${cleanResponse}`
        : `${agent.name}:\n${cleanResponse}`;
      console.log(`[ai-generator] Sending AI response via Platform Sender (${currentChannel})...`);
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
