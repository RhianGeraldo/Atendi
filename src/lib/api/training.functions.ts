import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Helper universal para chamada de LLM respeitando as credenciais da empresa
async function callCompanyLlm({
  companyId,
  systemPrompt,
  userPrompt,
  messages = [],
  temperature = 0.7,
  jsonMode = false,
  modelOverride,
}: {
  companyId: string;
  systemPrompt: string;
  userPrompt?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  jsonMode?: boolean;
  modelOverride?: string;
}): Promise<string> {
  // 1. Obter configurações da empresa
  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("ai_settings, name")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error("Empresa não encontrada para execução de IA.");
  }

  const aiSettings = (company.ai_settings as any) || {};
  let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text;

  if (!provider || provider === "none") {
    if (aiSettings.keys?.openai) provider = "openai";
    else if (aiSettings.keys?.groq) provider = "groq";
    else if (aiSettings.keys?.openrouter) provider = "openrouter";
  }

  if (!provider || provider === "none") {
    throw new Error("Nenhum provedor de IA habilitado. Configure a OpenAI, Groq ou OpenRouter nas Configurações.");
  }

  const apiKey = aiSettings.keys?.[provider];
  if (!apiKey) {
    throw new Error(`Chave de API não configurada para o provedor: ${provider}`);
  }

  const requestMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  if (messages && messages.length > 0) {
    for (const m of messages) {
      requestMessages.push({ role: m.role, content: m.content });
    }
  }

  if (userPrompt) {
    requestMessages.push({ role: "user", content: userPrompt });
  }

  let baseUrl = "https://api.openai.com/v1/chat/completions";
  let defaultModel = "gpt-4o-mini";

  if (provider === "groq") {
    baseUrl = "https://api.groq.com/openai/v1/chat/completions";
    defaultModel = "llama-3.3-70b-versatile";
  } else if (provider === "openrouter") {
    baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    defaultModel = aiSettings.active_chatbot_model || "openai/gpt-4o-mini";
  }

  const model = modelOverride || aiSettings.sales_coach_model || defaultModel;

  const payload: any = {
    model,
    messages: requestMessages,
    temperature,
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[callCompanyLlm] Erro ${provider} (${res.status}):`, errText);
    throw new Error(`Erro na IA (${provider}): ${res.status} - ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("IA retornou uma resposta vazia.");
  }

  return content;
}

// 1. Minerar Objeções Reais das conversas da empresa
export const mineCompanyObjectionsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      period: z.enum(["week", "month"]).default("week"),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { companyId, period } = data;

    // Calcular período
    const now = new Date();
    const startDate = new Date();
    if (period === "week") {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setDate(now.getDate() - 30);
    }

    // Buscar mensagens recentes enviadas por contatos nas conversas da empresa
    const { data: recentMessages, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("content, created_at, sender_type, conversation_id, conversation:conversations!inner(contact:contacts!inner(company_id))")
      .eq("conversation.contact.company_id", companyId)
      .eq("sender_type", "contact")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(250);

    if (msgErr) {
      console.error("[mineCompanyObjectionsAction] Erro ao buscar mensagens:", msgErr);
      throw new Error(`Falha ao recuperar histórico de conversas para mineração: ${msgErr.message}`);
    }

    let effectiveMessages = recentMessages || [];

    // Fallback se houver poucas mensagens no período selecionado
    if (effectiveMessages.length < 10) {
      const { data: fallbackMessages } = await supabaseAdmin
        .from("messages")
        .select("content, created_at, sender_type, conversation_id, conversation:conversations!inner(contact:contacts!inner(company_id))")
        .eq("conversation.contact.company_id", companyId)
        .eq("sender_type", "contact")
        .order("created_at", { ascending: false })
        .limit(100);

      if (fallbackMessages && fallbackMessages.length > effectiveMessages.length) {
        effectiveMessages = fallbackMessages;
      }
    }

    const messagesText = effectiveMessages
      .map((m) => m.content)
      .filter((c): c is string => !!c && c.trim().length > 10)
      .slice(0, 120)
      .join("\n---\n");

    const systemPrompt = `Você é um Diretor de Inteligência Comercial e Especialista em CRM de Vendas.
Sua missão é analisar as mensagens reais enviadas por clientes (leads) no WhatsApp e Instagram da empresa e identificar as MAIORES OBJEÇÕES e barreiras de compra enfrentadas.

RETORNE RIGOROSAMENTE UM JSON com o seguinte formato:
{
  "objections": [
    {
      "category": "Nome curto da objeção (ex: Preço / Fora do Orçamento)",
      "percentage": 35,
      "description": "Explicação detalhada do porquê o cliente hesita neste ponto",
      "sample_quotes": ["Exemplo de fala real 1", "Exemplo de fala real 2"],
      "count": 14
    }
  ],
  "total_analyzed": 50,
  "executive_summary": "Resumo executivo em 2 parágrafos sobre o padrão de comportamento dos leads",
  "recommended_drills": [
    "Dica prática 1 para treinar a equipe comercial",
    "Dica prática 2 para treinar a equipe comercial"
  ]
}

Regras:
1. Agrupe entre 3 e 6 categorias de objeções mais relevantes.
2. A soma de percentage deve ser aproximadamente 100%.
3. Use o texto real fornecido para extrair as sample_quotes. Caso haja poucas mensagens, use arquétipos clássicos do nicho da empresa complementando com realismo.`;

    const userPrompt = messagesText
      ? `Abaixo estão trechos reais de mensagens recebidas de clientes no período de ${period === "week" ? "últimos 7 dias" : "último mês"}:\n\n${messagesText}`
      : `Não há mensagens suficientes registradas neste período. Crie um mapeamento com as 4 objeções clássicas e mais recorrentes no comércio e serviços brasileiros (Preço/Desconto, Falar com Cônjuge/Sócio, Falta de Tempo, Comparando com Concorrente).`;

    const rawResponse = await callCompanyLlm({
      companyId,
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.3,
    });

    let parsedData: any;
    try {
      parsedData = JSON.parse(rawResponse);
    } catch {
      throw new Error("Falha ao estruturar os dados de mineração de objeções.");
    }

    // Salvar insight no banco de dados
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("sales_objection_insights")
      .insert({
        company_id: companyId,
        period_type: period,
        period_start: startDate.toISOString(),
        period_end: now.toISOString(),
        objections_data: parsedData,
        total_analyzed_conversations: recentMessages?.length || 0,
        created_by: userId,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[mineCompanyObjectionsAction] Erro ao salvar insight:", insertErr);
    }

    return { success: true, insight: inserted || { objections_data: parsedData } };
  });

// 2. Buscar último insight de objeções da empresa
export const fetchObjectionInsightsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { data: insight, error } = await supabaseAdmin
      .from("sales_objection_insights")
      .select("*")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[fetchObjectionInsightsAction] Erro:", error);
      return { insight: null };
    }

    return { insight };
  });

// 3. Iniciar Simulação de Treinamento "Às Cegas" (Blind Roleplay)
export const startBlindTrainingSessionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      channel: z.enum(["whatsapp", "instagram"]).default("whatsapp"),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { companyId, channel } = data;

    // 1. Obter informações da empresa
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, custom_variables, ai_settings")
      .eq("id", companyId)
      .single();

    const companyName = company?.name || "Nossa Empresa";

    // 2. Buscar último insight de objeções mineradas
    const { data: latestInsight } = await supabaseAdmin
      .from("sales_objection_insights")
      .select("objections_data")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let objectionsPool: string[] = [
      "Objeção de Preço: O cliente acha caro, pede desconto imediatamente e diz que no concorrente é mais acessível.",
      "Objeção de Autoridade: O cliente gosta da proposta mas diz que precisa falar com o cônjuge/sócio antes de qualquer decisão.",
      "Objeção de Insegurança/Tempo: O cliente tem medo de não conseguir aplicar ou não ter tempo na rotina corrida.",
      "Objeção de Procrastinação: O cliente diz 'Vou pensar com calma e qualquer coisa te chamo semana que vem'.",
      "Objeção do Catálogo: O cliente é monossilábico, pede 'me manda a tabela de preços' e evita responder perguntas abertas.",
    ];

    const minedObjections = (latestInsight?.objections_data as any)?.objections;
    if (Array.isArray(minedObjections) && minedObjections.length > 0) {
      objectionsPool = minedObjections.map(
        (o: any) => `${o.category}: ${o.description} (Exemplo real: "${o.sample_quotes?.[0] || 'Achei caro'}")`
      );
    }

    // Sortear um cenário de objeção oculta
    const hiddenScenario = objectionsPool[Math.floor(Math.random() * objectionsPool.length)];

    // Sortear persona de lead brasileira
    const personas = [
      { name: "Camila Ribeiro", profile: "Profissional autônoma, comunicativa porém muito cautelosa com investimentos." },
      { name: "Lucas Fernandes", profile: "Empresário dinâmico, prático, objetivo e sem paciência para enrolação." },
      { name: "Mariana Souza", profile: "Consumidora atenta a detalhes, já pesquisou várias opções no mercado." },
      { name: "Rodrigo Meirelles", profile: "Pede desconto logo de início e testa a segurança da vendedora." },
      { name: "Beatriz Nogueira", profile: "Simpática, mas tem receio de tomar decisão sem o marido aprovar." },
      { name: "Felipe Duarte", profile: "Interessado porém desconfiado se o produto realmente entrega o que promete." },
    ];
    const chosenPersona = personas[Math.floor(Math.random() * personas.length)];

    // 3. Obter procedimentos do Playbook da empresa
    const playbookSummary = await getCompanyPlaybookSummary(companyId);

    // Gerar primeira mensagem de abertura realista usando LLM
    const openingPrompt = `Você é ${chosenPersona.name}. Perfil: ${chosenPersona.profile}.
Você está enviando a PRIMEIRA mensagem no WhatsApp para a empresa "${companyName}".
${playbookSummary ? `A EMPRESA OFERECE OS SEGUINTES SERVIÇOS/PROCEDIMENTOS:\n${playbookSummary}\n` : ""}
Você viu um anúncio nas redes sociais ou post sobre a empresa e tem curiosidade genuína em saber mais sobre algum dos serviços ou agendar uma avaliação.
Escreva a PRIMEIRA mensagem de abertura que você enviaria no WhatsApp para iniciar contato.
REGRAS:
- Seja 100% natural, como alguém mandando WhatsApp (ex: "Oi, boa tarde! Vi o post de vocês sobre...", "Olá, tudo bem? Queria entender como funciona o serviço").
- NÃO mencione nenhuma objeção agora! Você acabou de chegar.
- Escreva APENAS o texto da mensagem e nada mais.`;

    const initialMessageContent = await callCompanyLlm({
      companyId,
      systemPrompt: openingPrompt,
      temperature: 0.8,
    });

    // Criar a sessão no banco
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sales_training_sessions")
      .insert({
        company_id: companyId,
        user_id: userId,
        lead_name: chosenPersona.name,
        lead_channel: channel,
        hidden_scenario: hiddenScenario,
        status: "in_progress",
      })
      .select()
      .single();

    if (sessionErr || !session) {
      console.error("[startBlindTrainingSessionAction] Erro ao criar sessão:", sessionErr);
      throw new Error("Falha ao iniciar sessão de treino.");
    }

    // Inserir a primeira mensagem do lead
    const { data: initialMsg, error: msgErr } = await supabaseAdmin
      .from("sales_training_messages")
      .insert({
        session_id: session.id,
        sender_type: "lead",
        content: initialMessageContent.trim(),
      })
      .select()
      .single();

    if (msgErr) {
      console.error("[startBlindTrainingSessionAction] Erro ao salvar primeira mensagem:", msgErr);
    }

    return {
      success: true,
      session,
      initialMessage: initialMsg,
    };
  });

// 4. Enviar mensagem da consultora e receber réplica do Lead Simulado
export const sendTrainingMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
      content: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const { sessionId, content } = data;

    // 1. Obter a sessão
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("sales_training_sessions")
      .select("*, companies(name)")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) {
      throw new Error("Sessão de treinamento não encontrada.");
    }

    if (session.status !== "in_progress") {
      throw new Error("Esta sessão de treinamento já foi concluída.");
    }

    const companyName = (session.companies as any)?.name || "Nossa Empresa";

    // 2. Salvar mensagem da consultora
    await supabaseAdmin.from("sales_training_messages").insert({
      session_id: sessionId,
      sender_type: "trainee",
      content: content.trim(),
    });

    // 3. Buscar histórico completo da conversa
    const { data: historyMessages } = await supabaseAdmin
      .from("sales_training_messages")
      .select("sender_type, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const formattedHistory = (historyMessages || []).map((m) => ({
      role: (m.sender_type === "lead" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

    const playbookSummary = await getCompanyPlaybookSummary(session.company_id);

    const systemPrompt = `Você é ${session.lead_name}, um potencial cliente conversando pelo WhatsApp com uma consultora de vendas da empresa "${companyName}".

SUA CARACTERÍSTICA E OBJEÇÃO OCULTA:
${session.hidden_scenario}
${playbookSummary ? `\nSERVIÇOS, PROCEDIMENTOS E POLÍTICAS CONHECIDAS DA EMPRESA:\n${playbookSummary}\n` : ""}

DIRETRIZES FUNDAMENTAIS DE COMPORTAMENTO:
1. NUNCA saia do personagem. Você NÃO é uma IA, é uma pessoa real brasileira no WhatsApp.
2. Seja autêntico: use linguagem natural, pontuação levemente informal, emojis ocasionais quando couber.
3. CONDUÇÃO DA CONVERSA:
   - Se a vendedora fizer perguntas de sondagem (para entender sua necessidade, rotina ou dor), responda de forma colaborativa e conte seu contexto.
   - Se a consultora explicar os procedimentos ou apresentar os benefícios com clareza, mostre interesse genuíno. Se ela for confusa ou insegura, demonstre dúvida.
   - Quando a vendedora falar de preço, valores ou forçar um fechamento, INSIRA A SUA OBJEÇÃO de forma espontânea e firme.
   - Se a consultora contornar bem a objeção (mostrar empatia, ancorar valor na transformação, desarmar sua dúvida com segurança), mostre-se convencido(a) e concorde em avançar/comprar.
   - Se a consultora for fria, evasiva, der desconto precipitado sem defender valor, ou insistir sem ouvir, reaja com desinteresse ("Ah, entendi... vou dar uma olhada e qualquer coisa te chamo").
4. Responda APENAS como o cliente falando, sem explicações extras.`;

    // 4. Executar resposta do lead
    const leadReplyContent = await callCompanyLlm({
      companyId: session.company_id,
      systemPrompt,
      messages: formattedHistory,
      temperature: 0.75,
    });

    // 5. Salvar resposta do lead
    const { data: savedReply, error: replyErr } = await supabaseAdmin
      .from("sales_training_messages")
      .insert({
        session_id: sessionId,
        sender_type: "lead",
        content: leadReplyContent.trim(),
      })
      .select()
      .single();

    if (replyErr) {
      console.error("[sendTrainingMessageAction] Erro ao salvar réplica do lead:", replyErr);
    }

    return {
      success: true,
      leadMessage: savedReply,
    };
  });

// 5. Encerrar Treinamento e Gerar Avaliação (Scorecard Dinâmico + Linha a Linha)
export const finishTrainingSessionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { sessionId } = data;

    // 1. Obter a sessão e histórico
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("sales_training_sessions")
      .select("*, companies(name, ai_settings)")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) {
      throw new Error("Sessão de treinamento não encontrada.");
    }

    const { data: messages } = await supabaseAdmin
      .from("sales_training_messages")
      .select("sender_type, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (!messages || messages.length <= 1) {
      throw new Error("A conversa é muito curta para uma avaliação de vendas. Interaja mais antes de finalizar.");
    }

    const aiSettings = (session.companies as any)?.ai_settings || {};
    const companyName = (session.companies as any)?.name || "Nossa Empresa";

    const formattedTranscript = messages
      .map((m) => `${m.sender_type === "trainee" ? "Consultora" : `Cliente (${session.lead_name})`}: "${m.content}"`)
      .join("\n");

    // Prompt configurável nas configurações da empresa ou fallback padrão dos 6 pilares
    const customCoachPrompt = aiSettings.sales_coach_evaluation_prompt;
    const playbookSummary = await getCompanyPlaybookSummary(session.company_id);

    const baseSystemPrompt = `Você é o Diretor Comercial e Sales Coach de Elite da empresa "${companyName}".
Sua função é auditar rigorosamente o atendimento simulado entre a consultora e o lead no WhatsApp.

${customCoachPrompt ? `DIRETRIZES ESPECÍFICAS DA EMPRESA:\n${customCoachPrompt}` : `CRITÉRIOS DE AVALIAÇÃO (Scorecard de Performance 0 a 10):
1. Condução do Funil: A consultora liderou a conversa com perguntas ou deixou o cliente guiar?
2. Investigação de Dor: Fez perguntas abertas para entender a real necessidade antes de oferecer?
3. Construção de Valor: Conectou os benefícios da solução às dores e desejos do cliente?
4. Ancoragem de Preço: Defendeu o valor antes de falar o preço? Criou contraste e justificou o investimento?
5. Contorno de Objeções: Desarmou as hesitações do cliente com empatia e técnica, sem dar desconto precipitado?
6. Chance de Conversão: Qual a probabilidade real de fechamento desse lead pelo atendimento prestado?`}

${playbookSummary ? `\nPLAYBOOK OFICIAL DE PROCEDIMENTOS E POLÍTICAS DA EMPRESA:\n${playbookSummary}\n
DIRETRIZES DE AUDITORIA COM BASE NO PLAYBOOK:
- Verifique se a consultora explicou os procedimentos com precisão técnica e clareza comercial de acordo com o Playbook oficial.
- Verifique se ela defendeu os pontos-chave, benefícios e condições aprovadas pela clínica.
- No array "comparatives" ("coach_suggested"), forneça scripts de alta conversão embasados no Playbook e nas explicações oficiais da empresa para que a consultora aprenda a fala correta!\n` : ""}

CENÁRIO OCULTO DO CLIENTE:
${session.hidden_scenario}

RETORNE RIGOROSAMENTE UM JSON estruturado da seguinte forma:
{
  "scorecard": [
    { "criteria": "Condução do Funil", "score": 8.0, "feedback": "Exemplo de justificativa curta e direta" },
    { "criteria": "Investigação de Dor", "score": 7.0, "feedback": "Exemplo de justificativa curta e direta" },
    { "criteria": "Construção de Valor", "score": 6.5, "feedback": "Exemplo de justificativa curta e direta" },
    { "criteria": "Ancoragem de Preço", "score": 4.5, "feedback": "Exemplo de justificativa curta e direta" },
    { "criteria": "Contorno de Objeções", "score": 5.0, "feedback": "Exemplo de justificativa curta e direta" },
    { "criteria": "Chance de Conversão", "score": 6.0, "feedback": "Exemplo de justificativa curta e direta" }
  ],
  "overall_score": 6.2,
  "outcome": "won | lost | in_progress",
  "outcome_label": "Venda Realizada com Sucesso! | Negociação Esfriou / Perdida | Negociação Aberta",
  "strengths": [
    "Ponto forte 1 observado na consultora",
    "Ponto forte 2 observado na consultora"
  ],
  "improvements": [
    "Ponto crítico de melhoria 1",
    "Ponto crítico de melhoria 2"
  ],
  "comparatives": [
    {
      "moment": "Quando o cliente perguntou X ou colocou a objeção Y",
      "trainee_said": "Trecho exato do que a consultora falou",
      "coach_suggested": "Exatamente o que a consultora deveria ter falado (script pronto de alta conversão)",
      "tactical_reason": "Explicação tática do porquê a fala sugerida converte mais"
    }
  ],
  "executive_summary_markdown": "Resumo acolhedor, inspirador e técnico do treinador para a consultora em Markdown."
}`;

    const userPrompt = `Abaixo está a transcrição completa do atendimento de treino:\n\n${formattedTranscript}`;

    const rawResponse = await callCompanyLlm({
      companyId: session.company_id,
      systemPrompt: baseSystemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.2,
    });

    let evaluation: any;
    try {
      evaluation = JSON.parse(rawResponse);
    } catch (e) {
      console.error("[finishTrainingSessionAction] Erro parse JSON:", rawResponse);
      throw new Error("Falha ao estruturar a avaliação do treinamento.");
    }

    const overallScore = typeof evaluation.overall_score === "number" ? evaluation.overall_score : 5.0;
    const outcome = evaluation.outcome || "in_progress";

    // Atualizar a sessão
    const { data: updatedSession, error: updateErr } = await supabaseAdmin
      .from("sales_training_sessions")
      .update({
        status: "completed",
        overall_score: overallScore,
        outcome,
        scorecard_json: evaluation,
        feedback_markdown: evaluation.executive_summary_markdown || "",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateErr) {
      console.error("[finishTrainingSessionAction] Erro ao atualizar sessão:", updateErr);
      throw new Error(`Falha ao salvar as informações da avaliação: ${updateErr.message}`);
    }

    return {
      success: true,
      evaluation,
      session: updatedSession || session,
    };
  });

// 6. Listar sessões de treino com filtros
export const fetchTrainingSessionsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      userId: z.string().uuid().optional(),
      status: z.enum(["all", "in_progress", "completed"]).default("all"),
      limit: z.number().default(30),
    })
  )
  .handler(async ({ data }) => {
    const { companyId, userId, status, limit } = data;

    let query = supabaseAdmin
      .from("sales_training_sessions")
      .select("*, profiles(name, email, avatar_url)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: sessions, error } = await query;
    if (error) {
      console.error("[fetchTrainingSessionsAction] Erro:", error);
      return { sessions: [] };
    }

    return { sessions: sessions || [] };
  });

// 7. Obter detalhes e mensagens de uma sessão específica
export const fetchTrainingSessionDetailsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sessionId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { sessionId } = data;

    const { data: session, error: sessErr } = await supabaseAdmin
      .from("sales_training_sessions")
      .select("*, profiles(name, email, avatar_url)")
      .eq("id", sessionId)
      .single();

    if (sessErr || !session) {
      throw new Error("Sessão não encontrada.");
    }

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("sales_training_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (msgErr) {
      console.error("[fetchTrainingSessionDetailsAction] Erro mensagens:", msgErr);
    }

    return {
      session,
      messages: messages || [],
    };
  });

// ============================================================================
// 8. Playbook Comercial & Procedimentos da Empresa
// ============================================================================

export async function getCompanyPlaybookSummary(companyId: string): Promise<string> {
  try {
    const { data: procedures } = await supabaseAdmin
      .from("sales_playbook_procedures")
      .select("title, category, content, key_points, target_audience")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (!procedures || procedures.length === 0) {
      return "";
    }

    const categoryLabels: Record<string, string> = {
      procedure: "Procedimentos & Serviços",
      faq: "Explicações & Perguntas Frequentes (FAQ)",
      pricing: "Regras de Preços & Condições Comerciais",
      objection_script: "Scripts de Contorno de Objeções",
      policy: "Políticas & Diretrizes de Atendimento",
    };

    const grouped: Record<string, typeof procedures> = {};
    for (const proc of procedures) {
      const cat = proc.category || "procedure";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(proc);
    }

    let summary = "=== PROCEDIMENTOS E PLAYBOOK OFICIAL DA EMPRESA ===\n";
    for (const [cat, list] of Object.entries(grouped)) {
      const label = categoryLabels[cat] || cat;
      summary += `\n[CATEGORIA: ${label.toUpperCase()}]\n`;
      for (const item of list) {
        summary += `• ${item.title}:\n`;
        summary += `  Explicação/Conteúdo: ${item.content}\n`;
        if (item.key_points && item.key_points.length > 0) {
          summary += `  Pontos-chave/Gatilhos: ${item.key_points.join(", ")}\n`;
        }
        if (item.target_audience) {
          summary += `  Público/Indicação: ${item.target_audience}\n`;
        }
      }
    }

    return summary;
  } catch (e) {
    console.error("[getCompanyPlaybookSummary] Erro ao carregar playbook:", e);
    return "";
  }
}

// Listar procedimentos do playbook com filtros
export const fetchSalesPlaybookProceduresAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      category: z.string().optional(),
      search: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const { companyId, category, search } = data;

    let query = supabaseAdmin
      .from("sales_playbook_procedures")
      .select("*, profiles(name, email)")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},content.ilike.${term}`);
    }

    const { data: procedures, error } = await query;
    if (error) {
      console.error("[fetchSalesPlaybookProceduresAction] Erro:", error);
      return { procedures: [] };
    }

    return { procedures: procedures || [] };
  });

// Criar ou atualizar procedimento no playbook
export const upsertSalesPlaybookProcedureAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      companyId: z.string().uuid(),
      title: z.string().min(1, "O título é obrigatório."),
      category: z.enum(["procedure", "faq", "pricing", "objection_script", "policy"]).default("procedure"),
      content: z.string().min(1, "O conteúdo explicativo é obrigatório."),
      keyPoints: z.array(z.string()).default([]),
      targetAudience: z.string().optional(),
      isActive: z.boolean().default(true),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { id, companyId, title, category, content, keyPoints, targetAudience, isActive } = data;

    if (id) {
      const { data: updated, error } = await supabaseAdmin
        .from("sales_playbook_procedures")
        .update({
          title: title.trim(),
          category,
          content: content.trim(),
          key_points: keyPoints,
          target_audience: targetAudience?.trim() || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select()
        .single();

      if (error) {
        console.error("[upsertSalesPlaybookProcedureAction] Erro update:", error);
        throw new Error(`Falha ao atualizar procedimento: ${error.message}`);
      }
      return { success: true, procedure: updated };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("sales_playbook_procedures")
        .insert({
          company_id: companyId,
          title: title.trim(),
          category,
          content: content.trim(),
          key_points: keyPoints,
          target_audience: targetAudience?.trim() || null,
          is_active: isActive,
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        console.error("[upsertSalesPlaybookProcedureAction] Erro insert:", error);
        throw new Error(`Falha ao criar procedimento: ${error.message}`);
      }
      return { success: true, procedure: created };
    }
  });

// Excluir procedimento do playbook
export const deleteSalesPlaybookProcedureAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      companyId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { id, companyId } = data;
    const { error } = await supabaseAdmin
      .from("sales_playbook_procedures")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("[deleteSalesPlaybookProcedureAction] Erro:", error);
      throw new Error(`Falha ao excluir procedimento: ${error.message}`);
    }

    return { success: true };
  });
