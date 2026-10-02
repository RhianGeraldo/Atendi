import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";

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
 * Parser resiliente de datas para PostgreSQL (TIMESTAMPTZ)
 * Aceita ISO, formato brasileiro (DD/MM/YYYY HH:mm), termos relativos ("amanhã", "hoje", "em 2 dias", etc.)
 */
function parseTaskDueDate(rawDate: string | undefined | null): string {
  const now = new Date();

  if (!rawDate || typeof rawDate !== "string" || !rawDate.trim()) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }

  const trimmed = rawDate.trim();

  // Se já for ISO 8601 válido
  const directDate = new Date(trimmed);
  if (!isNaN(directDate.getTime()) && trimmed.includes("-") && (trimmed.includes("T") || trimmed.length === 10)) {
    return directDate.toISOString();
  }

  // Formato brasileiro DD/MM/YYYY ou DD/MM/YYYY HH:mm
  const brMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 10;
    const minute = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    const parsed = new Date(year, month, day, hour, minute);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Formato ISO parcial YYYY-MM-DD HH:mm
  const isoLikeMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (isoLikeMatch) {
    const year = parseInt(isoLikeMatch[1], 10);
    const month = parseInt(isoLikeMatch[2], 10) - 1;
    const day = parseInt(isoLikeMatch[3], 10);
    const hour = isoLikeMatch[4] ? parseInt(isoLikeMatch[4], 10) : 10;
    const minute = isoLikeMatch[5] ? parseInt(isoLikeMatch[5], 10) : 0;
    const parsed = new Date(year, month, day, hour, minute);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Termos relativos em português
  const lower = trimmed.toLowerCase();
  let targetHour = 10;
  let targetMinute = 0;
  const timeMatch = lower.match(/(?:às|as|ás|\:)\s*(\d{1,2})(?:[h:](\d{2})?)?/i);
  if (timeMatch) {
    targetHour = parseInt(timeMatch[1], 10);
    if (timeMatch[2]) targetMinute = parseInt(timeMatch[2], 10);
  }

  if (lower.includes("hoje")) {
    const d = new Date(now);
    d.setHours(targetHour > now.getHours() ? targetHour : now.getHours() + 2, targetMinute, 0, 0);
    return d.toISOString();
  }

  if (lower.includes("amanhã") || lower.includes("amanha")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(targetHour, targetMinute, 0, 0);
    return d.toISOString();
  }

  const inDaysMatch = lower.match(/(?:daqui a|em)\s+(\d+)\s+dias?/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(targetHour, targetMinute, 0, 0);
    return d.toISOString();
  }

  const inHoursMatch = lower.match(/(?:daqui a|em)\s+(\d+)\s+horas?/i);
  if (inHoursMatch) {
    const hours = parseInt(inHoursMatch[1], 10);
    const d = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return d.toISOString();
  }

  const weekDays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  for (let i = 0; i < weekDays.length; i++) {
    if (lower.includes(weekDays[i])) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      d.setHours(targetHour, targetMinute, 0, 0);
      return d.toISOString();
    }
  }

  // Fallback seguro: amanhã às 10h
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(10, 0, 0, 0);
  return fallback.toISOString();
}

/**
 * Resolve o stageId de forma tolerante (por UUID ou por nome aproximado na pipeline)
 */
async function resolveStageId(pipelineId: string | null, stageInput: string | null | undefined): Promise<string | null> {
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
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (matchedStage) return matchedStage.id;
  }

  const { data: firstStage } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  return firstStage?.id || null;
}

/**
 * Resolve o colega de IA por UUID ou nome
 */
function resolveColleagueAgentId(colleagues: any[], agentInput: string | null | undefined): string | null {
  if (!agentInput || !colleagues || colleagues.length === 0) return null;
  const trimmed = agentInput.trim();

  const byId = colleagues.find(c => c.id.toLowerCase() === trimmed.toLowerCase());
  if (byId) return byId.id;

  const lower = trimmed.toLowerCase();
  const byName = colleagues.find(c =>
    c.name.toLowerCase() === lower ||
    c.name.toLowerCase().includes(lower) ||
    lower.includes(c.name.toLowerCase()) ||
    (c.ai_type && c.ai_type.toLowerCase().includes(lower))
  );
  if (byName) return byName.id;

  return null;
}

/**
 * Resolve departamento por UUID ou nome
 */
async function resolveDepartmentId(companyId: string, deptInput: string | null | undefined): Promise<string | null> {
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
      .select("id, ai_active, ai_agent_id, whatsapp_instance_id, contact_id, status, unit_id, current_session_id, contacts(name, phone, company_id, unit_id), whatsapp_instances(unit_id, company_id)")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) {
      console.error(`[ai-generator] Conversation not found: ${conversationId}`);
      return;
    }

    if (!conv.ai_active || conv.status === "resolved") {
      console.log(`[ai-generator] AI not active or conversation resolved. Aborting generation for ${conversationId}`);
      return;
    }

    // Garantia 1º: Empresa e Unidade sempre resolvidas
    const instData = Array.isArray(conv.whatsapp_instances) ? conv.whatsapp_instances[0] : conv.whatsapp_instances;
    const effectiveCompanyId = companyId || conv.contacts?.company_id || (instData as any)?.company_id;
    let effectiveUnitId = conv.unit_id || conv.contacts?.unit_id || (instData as any)?.unit_id || null;

    if (!effectiveUnitId && effectiveCompanyId) {
      const { data: defaultUnit } = await supabaseAdmin
        .from("units")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .limit(1)
        .maybeSingle();
      if (defaultUnit) {
        effectiveUnitId = defaultUnit.id;
      }
    }

    if (!conv.unit_id && effectiveUnitId) {
      await supabaseAdmin.from("conversations").update({ unit_id: effectiveUnitId }).eq("id", conversationId);
    }

    let agentIdToUse = conv.ai_agent_id;

    if (!agentIdToUse) {
      console.log(`[ai-generator] No AI agent assigned to conversation ${conversationId}. Auto-assigning best available agent...`);
      const { data: defaultAgents } = await supabaseAdmin
        .from("ai_agents")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .eq("is_active", true)
        .eq("is_main_agent", true)
        .limit(1);

      if (defaultAgents && defaultAgents.length > 0) {
        agentIdToUse = defaultAgents[0].id;
        await supabaseAdmin.from("conversations").update({ ai_agent_id: agentIdToUse }).eq("id", conversationId);
      } else {
        console.log(`[ai-generator] No active AI agents found in company ${effectiveCompanyId}. Aborting.`);
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

    // 4. Histórico recente de mensagens (20 mensagens)
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, created_at, media_type, transcription")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) return;
    messages.reverse();

    // Mesclar variáveis personalizadas (Unidade sobressai à Empresa)
    const compVars = typeof company.custom_variables === "object" && company.custom_variables !== null ? company.custom_variables : {};
    const unitVars = (unitData && typeof unitData.custom_variables === "object" && unitData.custom_variables !== null) ? unitData.custom_variables : {};
    const mergedCustomVars = { ...compVars, ...unitVars };

    const infoEmpresa = `EMPRESA: ${company.name || ""}\nCNPJ: ${company.document || ""}\nEndereço: ${company.address || ""}\nHorários: ${company.business_hours || ""}\n${Object.entries(compVars).length ? `Variáveis:\n${Object.entries(compVars).map(([k,v]) => `- ${k}: ${v}`).join("\n")}` : ""}`.trim();

    let infoUnidade = "";
    if (unitData) {
      infoUnidade = `UNIDADE: ${unitData.name || ""}\nCNPJ: ${unitData.document || ""}\nEndereço: ${unitData.address || ""}\nHorários: ${unitData.business_hours || ""}\n${Object.entries(unitVars).length ? `Variáveis:\n${Object.entries(unitVars).map(([k,v]) => `- ${k}: ${v}`).join("\n")}` : ""}`.trim();
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
    const contextHeader = [
      `=== CONTEXTO DO ATENDIMENTO ATUAL (DADOS AUTORITATIVOS DO SISTEMA) ===`,
      `EMPRESA: ${companyName}`,
      `UNIDADE ATUAL DE ATENDIMENTO: ${unitName}`,
      rawClientName ? `NOME DO CLIENTE: ${rawClientName} (Primeiro nome: ${clientFirstName})` : `NOME DO CLIENTE: Não informado ainda`,
      conv.contacts?.phone ? `TELEFONE DO CLIENTE: ${conv.contacts.phone}` : null,
      unitData?.address ? `ENDEREÇO DA UNIDADE: ${unitData.address}` : (company.address ? `ENDEREÇO DA EMPRESA: ${company.address}` : null),
      unitData?.business_hours ? `HORÁRIOS DA UNIDADE: ${unitData.business_hours}` : (company.business_hours ? `HORÁRIOS: ${company.business_hours}` : null),
      `--- DIRETRIZES CRÍTICAS DE CONTEXTO E LOCALIZAÇÃO ---`,
      `1. O cliente JÁ ESTÁ em contato diretamente com a unidade '${unitName}'. Você está respondendo exclusivamente pela unidade '${unitName}'.`,
      `2. NUNCA pergunte 'qual unidade você prefere?', 'qual cidade você está?' ou apresente lista de outras unidades/cidades da empresa. A unidade já está 100% definida como '${unitName}'. Só aborde outras filiais se o próprio cliente disser explicitamente que deseja atendimento em outra cidade.`,
      rawClientName ? `3. O nome do cliente já é conhecido (${rawClientName}). Trate-o com naturalidade e cordialidade (preferencialmente chamando por ${clientFirstName}). NUNCA pergunte 'qual é o seu nome?' ou 'com quem estou falando?'.` : null,
      `======================================================================`
    ].filter(Boolean).join("\n");

    systemPromptParts.push(contextHeader);

    if (agent.prompt_personality) systemPromptParts.push(applyVars(agent.prompt_personality));
    if (agent.prompt_instructions) systemPromptParts.push(applyVars(agent.prompt_instructions));
    if (agent.prompt_extra_info) systemPromptParts.push(applyVars(agent.prompt_extra_info));

    // Instruções orientativas (o modelo agora tem ferramentas nativas)
    if (agent.allow_handoff) {
      systemPromptParts.push(
        applyVars(agent.prompt_handoff) ||
        `DIRETRIZ DE TRANSFERÊNCIA HUMANA:\nSe você não souber como resolver a solicitação do cliente após tentar ajudar ou se ele solicitar explicitamente atendimento humano, chame a ferramenta 'transferir_atendimento' com o motivo detalhado.`
      );
    }

    if (agent.allow_resolution) {
      systemPromptParts.push(
        applyVars(agent.prompt_resolution) ||
        `DIRETRIZ DE ENCERRAMENTO:\nQuando o cliente tiver suas dúvidas sanadas, confirmar que deu tudo certo ou se despedir cordialmente, chame a ferramenta 'encerrar_atendimento' com o resumo do que foi concluído.`
      );
    }

    if (colleagues && colleagues.length > 0) {
      const colleaguesList = colleagues.map(c => `- ${c.name} (${c.ai_type || 'Geral'}): ${c.description || 'Especialista'}`).join("\n");
      systemPromptParts.push(
        `TRABALHO EM EQUIPE (MULTI-AGENTES):\nSe a solicitação for de competência de outro colega especialista, chame a ferramenta 'delegar_para_outro_agente_ia' informando o nome ou ID do colega.\nColegas disponíveis:\n${colleaguesList}`
      );
    }

    if (agent.allow_tasks) {
      systemPromptParts.push(
        applyVars(agent.prompt_tasks) ||
        `CRIAÇÃO DE TAREFAS NO CRM:\nVocê pode agendar tarefas e follow-ups para a equipe usando a ferramenta 'criar_tarefa'. Informe data e hora previstas (ex: 'amanhã às 14:00', '2026-10-10 10:00').`
      );
    }

    if (agent.allow_opportunities) {
      systemPromptParts.push(
        applyVars(agent.prompt_opportunities) ||
        `OPORTUNIDADES DE VENDAS NO CRM:\nVocê tem acesso direto ao funil de vendas. Quando o cliente demonstrar interesse comercial ou solicitar proposta, chame 'criar_oportunidade'. Para avançar de etapa no funil, chame 'atualizar_oportunidade'.`
      );

      if (agent.pipeline_id) {
        const { data: stages } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id, name")
          .eq("pipeline_id", agent.pipeline_id)
          .order("order_index");
        if (stages && stages.length > 0) {
          const stagesList = stages.map(s => `- ${s.name} (ID: ${s.id})`).join("\n");
          systemPromptParts.push(`ETAPAS DO FUNIL DESTE AGENTE:\n${stagesList}`);
        }

        const { data: opps } = await supabaseAdmin
          .from("opportunities")
          .select("id, title, value, stage_id")
          .eq("contact_id", conv.contact_id);
        if (opps && opps.length > 0) {
          const oppsList = opps.map(o => `- Oportunidade ID: ${o.id} | Título: ${o.title} | Etapa Atual: ${o.stage_id}`).join("\n");
          systemPromptParts.push(`OPORTUNIDADES EXISTENTES DO CLIENTE:\n${oppsList}\nSe o cliente já tiver oportunidade aberta sobre o assunto, utilize 'atualizar_oportunidade' em vez de criar uma nova.`);
        }
      }
    }

    const systemPrompt = systemPromptParts.join("\n\n");

    let isInactivityClose = false;

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg) => {
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
          if (content.includes("transferido pela IA para o colega")) {
            const defaultHandoffReceive = "Um colega de equipe transferiu este cliente para você. Leia o histórico acima para entender o contexto e continue o atendimento a partir de agora de acordo com a sua especialidade. NÃO transfira de volta sem antes tentar ajudar o cliente.";
            const inst = agent.prompt_receive_handoff ? applyVars(agent.prompt_receive_handoff) : defaultHandoffReceive;
            content += `\n[INSTRUÇÃO CRÍTICA]: ${inst}`;
          }
          if (content.includes("SYSTEM_FOLLOW_UP_1")) {
            const defaultFollowup = "[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente está há muito tempo sem responder. Envie UMA mensagem curta, amigável e natural perguntando se ele conseguiu resolver a questão anterior ou se precisa de ajuda. NÃO encerre o atendimento ainda.";
            content = agent.prompt_followup ? `[INSTRUÇÃO CRÍTICA DE SISTEMA: ACOMPANHAMENTO]\n${applyVars(agent.prompt_followup)}` : defaultFollowup;
          }
          if (content.includes("SYSTEM_FOLLOW_UP_2")) {
            const defaultFollowup2 = "[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente não respondeu ao seu primeiro follow-up. Envie um aviso amigável informando que, se não houver resposta, o atendimento será encerrado em breve. NÃO encerre o atendimento ainda.";
            content = agent.prompt_followup ? `[INSTRUÇÃO CRÍTICA DE SISTEMA: ACOMPANHAMENTO (2º AVISO)]\n${applyVars(agent.prompt_followup)}` : defaultFollowup2;
          }
          if (content.includes("SYSTEM_RESOLVE_INACTIVE")) {
            content = "[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente ignorou as tentativas de contato. Despeça-se cordialmente agora. O sistema finalizará o atendimento.";
            isInactivityClose = true;
          }
        }

        return { role: role as any, content };
      })
    ];

    let finalModel = agent.model || "default";
    if (finalModel === "default") {
      finalModel = aiSettings.active_chatbot_model || "gpt-4o-mini";
    }

    // 6. Construir Declaração Nativa de Tools (JSON Schema)
    const tools: any[] = [];

    if (agent.allow_handoff) {
      tools.push({
        type: "function",
        function: {
          name: "transferir_atendimento",
          description: "Transfere o atendimento para a equipe ou fila humana de atendentes quando o cliente solicita ou o assunto foge do seu escopo.",
          parameters: {
            type: "object",
            properties: {
              motivo: { type: "string", description: "Motivo claro e detalhado do transbordo para os atendentes." },
              departamento_nome_ou_id: { type: "string", description: "Nome ou ID do departamento de destino (opcional)." }
            },
            required: ["motivo"]
          }
        }
      });
    }

    if (agent.allow_resolution) {
      tools.push({
        type: "function",
        function: {
          name: "encerrar_atendimento",
          description: "Encerra o chamado e marca como resolvido quando a dúvida do cliente for sanada ou ele se despedir com sucesso.",
          parameters: {
            type: "object",
            properties: {
              resumo: { type: "string", description: "Breve resumo do que foi concluído com sucesso." }
            },
            required: ["resumo"]
          }
        }
      });
    }

    if (colleagues && colleagues.length > 0) {
      const colleaguesDesc = colleagues.map(c => `${c.name} (${c.ai_type || 'Geral'})`).join(", ");
      tools.push({
        type: "function",
        function: {
          name: "delegar_para_outro_agente_ia",
          description: `Transfere a conversa para outro colega de IA especialista. Colegas disponíveis: ${colleaguesDesc}`,
          parameters: {
            type: "object",
            properties: {
              agente_nome_ou_id: { type: "string", description: "Nome ou ID do agente colega para quem transferir." },
              motivo: { type: "string", description: "Motivo da delegação para o colega." }
            },
            required: ["agente_nome_ou_id"]
          }
        }
      });
    }

    if (agent.allow_tasks) {
      tools.push({
        type: "function",
        function: {
          name: "criar_tarefa",
          description: "Agenda uma tarefa de follow-up ou lembrete no CRM para a equipe.",
          parameters: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Título claro da tarefa." },
              descricao: { type: "string", description: "Descrição ou notas de contexto da tarefa." },
              data_hora: { type: "string", description: "Data e horário de vencimento (ex: 'amanhã às 14h', '2026-10-15 10:00')." }
            },
            required: ["titulo", "data_hora"]
          }
        }
      });
    }

    if (agent.allow_opportunities) {
      tools.push({
        type: "function",
        function: {
          name: "criar_oportunidade",
          description: "Cria uma oportunidade de venda no funil do CRM para este cliente.",
          parameters: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Título da oportunidade (ex: 'Interesse em Plano Premium')." },
              valor: { type: "number", description: "Valor financeiro numérico estimado (ex: 1500.00)." },
              etapa_nome_ou_id: { type: "string", description: "Nome da etapa do funil (ex: 'Qualificação', 'Proposta') ou UUID." }
            },
            required: ["titulo"]
          }
        }
      });

      tools.push({
        type: "function",
        function: {
          name: "atualizar_oportunidade",
          description: "Move uma oportunidade existente do cliente para outra etapa do funil.",
          parameters: {
            type: "object",
            properties: {
              oportunidade_id: { type: "string", description: "ID da oportunidade (opcional se houver apenas uma)." },
              nova_etapa_nome_ou_id: { type: "string", description: "Nome ou ID da nova etapa no funil." }
            },
            required: ["nova_etapa_nome_ou_id"]
          }
        }
      });
    }

    console.log(`[ai-generator] Calling LLM (${provider} - ${finalModel}) with ${tools.length} native tools...`);

    const requestBody: any = {
      model: finalModel.replace("openrouter/", "").replace("groq/", ""),
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: agent.max_tokens || 4096
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
        "Authorization": `Bearer ${apiKey}`,
        ...(provider === "openrouter" && {
          "HTTP-Referer": "https://atendi.app",
          "X-Title": "Atendi CRM"
        })
      },
      body: JSON.stringify(requestBody)
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

    // Limpeza de assinaturas manuais e tags residuais
    let cleanResponse = rawAiText.trim();
    const selfSignatureMatch = cleanResponse.match(/^([A-Za-z0-9 _\-\*]+):\s*([\s\S]*)$/);
    if (selfSignatureMatch && !selfSignatureMatch[1].toLowerCase().includes("http")) {
      cleanResponse = selfSignatureMatch[2].trim();
    }

    // Flags e acumuladores de ações
    let isHandoff = false;
    let handoffNote = "";
    let handoffDeptInput: string | null = null;

    let isResolve = false;
    let resolveNote = "";

    let transferAgentInput: string | null = null;

    let crmTaskData: { title: string; description: string; dueDate: string } | null = null;
    let crmOppCreateData: { title: string; value: number; stage: string | null } | null = null;
    let crmOppUpdateData: { oppId: string | null; stage: string } | null = null;

    // A. Processar Native Tool Calls
    if (toolCalls && toolCalls.length > 0) {
      console.log(`[ai-generator] Processing ${toolCalls.length} tool calls...`);
      for (const call of toolCalls) {
        const fnName = call.function?.name;
        let args: any = {};
        try {
          args = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call.function?.arguments || {};
        } catch (e) {
          console.error(`[ai-generator] Erro ao parsear argumentos da tool ${fnName}:`, call.function?.arguments);
        }

        if (fnName === "transferir_atendimento" && agent.allow_handoff) {
          isHandoff = true;
          handoffNote = args.motivo || "Cliente solicitou atendimento humano ou IA realizou transbordo.";
          handoffDeptInput = args.departamento_nome_ou_id || null;
        } else if (fnName === "encerrar_atendimento" && agent.allow_resolution) {
          isResolve = true;
          resolveNote = args.resumo || "Atendimento concluído com sucesso pela IA.";
        } else if (fnName === "delegar_para_outro_agente_ia") {
          transferAgentInput = args.agente_nome_ou_id || null;
        } else if (fnName === "criar_tarefa" && agent.allow_tasks) {
          crmTaskData = {
            title: args.titulo || "Acompanhamento de Atendimento",
            description: args.descricao || "",
            dueDate: args.data_hora || ""
          };
        } else if (fnName === "criar_oportunidade" && agent.allow_opportunities) {
          crmOppCreateData = {
            title: args.titulo || "Nova Oportunidade",
            value: parseCurrencyValue(args.valor),
            stage: args.etapa_nome_ou_id || null
          };
        } else if (fnName === "atualizar_oportunidade" && agent.allow_opportunities) {
          crmOppUpdateData = {
            oppId: args.oportunidade_id || null,
            stage: args.nova_etapa_nome_ou_id || args.etapa_nome_ou_id || ""
          };
        }
      }
    }

    // B. Retrocompatibilidade: Extração por Regex legadas caso não tenha vindo por tool_call
    if (!isHandoff && agent.allow_handoff) {
      const handoffMatch = cleanResponse.match(/\[TRANSFERIR(?::\s*(.*?))?\]/i);
      if (handoffMatch) {
        isHandoff = true;
        handoffNote = handoffMatch[1] ? handoffMatch[1].trim() : "Cliente solicitou atendimento humano ou IA não soube responder.";
        cleanResponse = cleanResponse.replace(/\[TRANSFERIR(?::\s*.*?)?\]/gi, "").trim();
      }
    }

    if (!transferAgentInput) {
      const transferAgentMatch = cleanResponse.match(/\[TRANSFERIR_?AGENTE:\s*(.*?)\]/i);
      if (transferAgentMatch) {
        transferAgentInput = transferAgentMatch[1].trim();
        cleanResponse = cleanResponse.replace(/\[TRANSFERIR_?AGENTE:\s*.*?\]/gi, "").trim();
      }
    }

    if (!crmTaskData && agent.allow_tasks) {
      const taskMatch = cleanResponse.match(/\[CRIAR_TAREFA:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
      if (taskMatch) {
        crmTaskData = {
          title: taskMatch[1].trim(),
          description: taskMatch[2].trim(),
          dueDate: taskMatch[3].trim()
        };
        cleanResponse = cleanResponse.replace(/\[CRIAR_TAREFA:\s*.*?\s*\|\s*.*?\s*\|\s*.*?\]/gi, "").trim();
      }
    }

    if (!crmOppCreateData && agent.allow_opportunities) {
      const oppMatch = cleanResponse.match(/\[CRIAR_OPORTUNIDADE:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
      if (oppMatch) {
        crmOppCreateData = {
          title: oppMatch[1].trim(),
          value: parseCurrencyValue(oppMatch[2]),
          stage: oppMatch[3].trim()
        };
        cleanResponse = cleanResponse.replace(/\[CRIAR_OPORTUNIDADE:\s*.*?\s*\|\s*.*?\s*\|\s*.*?\]/gi, "").trim();
      }
    }

    if (!crmOppUpdateData && agent.allow_opportunities) {
      const updateOppMatch3 = cleanResponse.match(/\[ATUALIZAR_OPORTUNIDADE:\s*([^\s\|]+)\s*\|\s*([^\s\|]+)\s*\|\s*([^\s\|\]]+)\]/i);
      if (updateOppMatch3) {
        crmOppUpdateData = {
          oppId: updateOppMatch3[1].trim(),
          stage: updateOppMatch3[3].trim()
        };
        cleanResponse = cleanResponse.replace(/\[ATUALIZAR_OPORTUNIDADE:\s*[^\s\|]+\s*\|\s*[^\s\|]+\s*\|\s*[^\s\|\]]+\]/gi, "").trim();
      } else {
        const updateOppMatch2 = cleanResponse.match(/\[ATUALIZAR_OPORTUNIDADE:\s*([^\s\|]+)\s*\|\s*([^\s\|\]]+)\]/i);
        if (updateOppMatch2) {
          crmOppUpdateData = {
            oppId: updateOppMatch2[1].trim(),
            stage: updateOppMatch2[2].trim()
          };
          cleanResponse = cleanResponse.replace(/\[ATUALIZAR_OPORTUNIDADE:\s*[^\s\|]+\s*\|\s*[^\s\|\]]+\]/gi, "").trim();
        }
      }
    }

    if (!isResolve && agent.allow_resolution && !isHandoff && !transferAgentInput) {
      const resolveMatch = cleanResponse.match(/\[ENCERRAR(?::\s*(.*?))?\]/i);
      if (resolveMatch) {
        isResolve = true;
        resolveNote = resolveMatch[1] ? resolveMatch[1].trim() : "Atendimento concluído pela IA.";
        cleanResponse = cleanResponse.replace(/\[ENCERRAR(?::\s*.*?)?\]/gi, "").trim();
      }
    }

    // Se for encerramento por inatividade acionado pelo cron, forçar resolução garantida
    if (isInactivityClose) {
      isResolve = true;
      if (!resolveNote) resolveNote = "Encerrado automaticamente por inatividade do cliente.";
    }

    // 8. Enviar mensagem limpa para o cliente via Plataforma
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

    // 9. Executar Ações de Backend Estruturadas

    // A. Delegação Multi-Agente
    if (transferAgentInput) {
      const resolvedTargetAgentId = resolveColleagueAgentId(colleagues, transferAgentInput);

      if (!resolvedTargetAgentId) {
        console.warn(`[ai-generator] Could not resolve colleague agent from input: ${transferAgentInput}`);
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
        const transferCount = recentSystemMsgs?.filter(m =>
          m.content.includes("Atendimento transferido pela IA para o colega") &&
          new Date(m.created_at).getTime() > fiveMinutesAgo
        ).length || 0;

        if (transferCount >= 3) {
          console.warn(`[ai-generator] Infinite loop between agents detected! Falling back to human queue.`);
          isHandoff = true;
          handoffNote = "Loop entre IAs detectado. Transferido para equipe humana.";
        } else {
          const { data: targetAgent } = await supabaseAdmin
            .from("ai_agents")
            .select("name")
            .eq("id", resolvedTargetAgentId)
            .single();

          const targetName = targetAgent?.name || "Colega Especialista";
          console.log(`[ai-generator] Delegating from ${agent.name} to ${targetName} (${resolvedTargetAgentId})`);

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
                ai_agent_name: agent.name
              }
            });
          }

          const systemMsg = `Atendimento transferido pela IA para o colega de equipe: ${targetName}`;
          const { data: insertedMsg } = await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "system",
            content: systemMsg
          }).select("id").single();

          if (insertedMsg) {
            const { enqueueAiMessage } = await import("./ai-queue");
            enqueueAiMessage(conversationId, insertedMsg.id, effectiveCompanyId);
          }
        }
      }
    }

    // B. Criar Tarefa no CRM
    if (crmTaskData && conv.contact_id) {
      const parsedDue = parseTaskDueDate(crmTaskData.dueDate);
      console.log(`[ai-generator] Creating task: "${crmTaskData.title}" for ${parsedDue}`);

      const { data: newTask, error: taskErr } = await supabaseAdmin.from("tasks").insert({
        title: crmTaskData.title,
        description: crmTaskData.description || null,
        due_date: parsedDue,
        contact_id: conv.contact_id,
        unit_id: effectiveUnitId,
        status: "pending",
        priority: "medium",
        task_type: "follow_up"
      }).select("id, title").single();

      if (taskErr) {
        console.error(`[ai-generator] Failed to create task:`, taskErr);
      } else {
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `📌 Tarefa criada pela IA: ${newTask.title} (Previsão: ${new Date(parsedDue).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})`
        });
      }
    }

    // C. Criar Oportunidade no CRM
    if (crmOppCreateData && conv.contact_id) {
      const resolvedStage = await resolveStageId(agent.pipeline_id, crmOppCreateData.stage);
      console.log(`[ai-generator] Creating opportunity: "${crmOppCreateData.title}" (Value: ${crmOppCreateData.value}, Stage: ${resolvedStage})`);

      const { data: newOpp, error: oppErr } = await supabaseAdmin.from("opportunities").insert({
        title: crmOppCreateData.title,
        value: crmOppCreateData.value,
        contact_id: conv.contact_id,
        unit_id: effectiveUnitId,
        conversation_id: conversationId,
        stage_id: resolvedStage,
        status: "open"
      }).select("id, title, value").single();

      if (oppErr) {
        console.error(`[ai-generator] Failed to create opportunity:`, oppErr);
      } else {
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "agent",
          is_internal: true,
          content: `💰 Oportunidade criada pela IA: ${newOpp.title} (Valor: R$ ${newOpp.value.toFixed(2)})`
        });

        await supabaseAdmin.from("opportunity_history").insert({
          opportunity_id: newOpp.id,
          action_type: "created",
          description: `Oportunidade criada automaticamente pelo Agente de IA (${agent.name})`
        });
      }
    }

    // D. Atualizar Oportunidade no CRM
    if (crmOppUpdateData && conv.contact_id) {
      let targetOppId = crmOppUpdateData.oppId;

      if (!targetOppId) {
        const { data: existingOpp } = await supabaseAdmin
          .from("opportunities")
          .select("id")
          .eq("contact_id", conv.contact_id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        targetOppId = existingOpp?.id || null;
      }

      if (targetOppId) {
        const resolvedStage = await resolveStageId(agent.pipeline_id, crmOppUpdateData.stage);
        if (resolvedStage) {
          await supabaseAdmin
            .from("opportunities")
            .update({ stage_id: resolvedStage })
            .eq("id", targetOppId);

          const { data: stName } = await supabaseAdmin.from("pipeline_stages").select("name").eq("id", resolvedStage).single();

          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "agent",
            is_internal: true,
            content: `🔄 Oportunidade atualizada pela IA (Movida para etapa: ${stName?.name || resolvedStage}).`
          });

          await supabaseAdmin.from("opportunity_history").insert({
            opportunity_id: targetOppId,
            action_type: "stage_changed",
            description: `Etapa alterada pelo Agente de IA (${agent.name}) para ${stName?.name || resolvedStage}`
          });
        }
      }
    }

    // E. Executar Transbordo Humano (Handoff)
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
        status: "waiting"
      };

      let deptName = null;
      if (targetDeptId) {
        updatePayload.department_id = targetDeptId;
        const { data: dept } = await supabaseAdmin.from("departments").select("name").eq("id", targetDeptId).single();
        if (dept) deptName = dept.name;

        // Distribuição Round-Robin respeitando estritamente a Unidade
        const { assignDepartmentRoundRobin } = await import("./routing");
        const roundRobinAgent = await assignDepartmentRoundRobin(effectiveCompanyId, targetDeptId, effectiveUnitId);
        if (roundRobinAgent) {
          updatePayload.assigned_agent_id = roundRobinAgent;
        }
      }

      await supabaseAdmin.from("conversations").update(updatePayload).eq("id", conversationId);

      const systemMsg = deptName
        ? `Atendimento transferido pela IA para o departamento: ${deptName}`
        : `Atendimento transferido pela IA para a fila de espera.`;

      await supabaseAdmin.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "system",
        content: systemMsg
      });

      await supabaseAdmin.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "agent",
        is_internal: true,
        content: handoffNote,
        metadata: { ai_generated: true, ai_agent_id: agent.id, ai_agent_name: agent.name }
      });

      if (conv.current_session_id) {
        const sessionUpdate: any = { assigned_agent_id: updatePayload.assigned_agent_id || null };
        if (targetDeptId) sessionUpdate.department_id = targetDeptId;
        await supabaseAdmin.from("conversation_sessions").update(sessionUpdate).eq("id", conv.current_session_id);

        await supabaseAdmin.from("session_events").insert({
          session_id: conv.current_session_id,
          event_type: "transferred",
          metadata: {
            targetType: "department",
            targetId: targetDeptId || "queue",
            targetName: deptName || "Fila Geral",
            by_ai: true,
            observation: handoffNote
          }
        });
      }
    } else if (isResolve) {
      // F. Encerramento Confiável do Atendimento
      console.log(`[ai-generator] Resolving conversation ${conversationId}. Reason: ${resolveNote}`);

      const sessionId = conv.current_session_id;

      await supabaseAdmin
        .from("conversations")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          current_session_id: null
        })
        .eq("id", conversationId);

      if (sessionId) {
        const resolvedReasonId = isInactivityClose
          ? (agent.followup_resolution_reason_id || agent.resolution_reason_id || null)
          : (agent.resolution_reason_id || null);

        await supabaseAdmin.from("conversation_sessions").update({
          resolved_at: new Date().toISOString(),
          resolution_reason_id: resolvedReasonId,
          resolution_observation: resolveNote
        }).eq("id", sessionId);

        await supabaseAdmin.from("session_events").insert({
          session_id: sessionId,
          event_type: "resolved",
          metadata: { by_ai: true, observation: resolveNote, isInactivityClose }
        });
      }
    }

  } catch (err) {
    console.error(`[ai-generator] Fatal error:`, err);
  }
}
