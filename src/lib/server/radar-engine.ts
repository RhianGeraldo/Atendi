/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeTicketWithAI } from "./ticket-ai";

export interface RadarEvaluationInput {
  messageId?: string;
  conversationId: string;
  contactId: string;
  companyId: string;
  unitId?: string | null;
  content: string;
  senderType: string;
}

export interface RadarAnalysisResult {
  is_risk: boolean;
  category: "churn" | "critical_issue" | "legal_risk" | "severe_dissatisfaction" | "billing";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  suggested_action: string;
  auto_open_ticket: boolean;
}

// Regex com termos-âncora sensíveis em português para filtro ultrarrápido (<1ms, custo 0)
const RADAR_HEURISTIC_REGEX = new RegExp(
  [
    // Churn / Cancelamento
    "\\b(?:cancelar|cancelamento|cancela|cancelou|rescis[aã]o|rescindir|encerrar\\s+contrato|desistir\\s+do\\s+plano|trocar\\s+de\\s+(?:sistema|empresa|fornecedor)|outra\\s+plataforma|concorrente|n[aã]o\\s+quero\\s+mais\\s+(?:continuar|o\\s+servi[çc]o)|muito\\s+caro)\\b",
    // Problemas / Incidentes graves
    "\\b(?:n[aã]o\\s+funciona|parou\\s+de\\s+funcionar|fora\\s+do\\s+ar|sistema\\s+caiu|deu\\s+pau|est[aá]\\s+travado|falha\\s+cr[ií]tica|erro\\s+grave|perdi\\s+(?:dados|vendas)|bloqueado|n[aã]o\\s+consigo\\s+(?:emitir|acessar|logar|vender|usar)|bugado|preju[ií]zo)\\b",
    // Risco jurídico / Reclamações formais
    "\\b(?:procon|processo|processar|vou\\s+processar|advogado|meu\\s+advogado|pequenas\\s+causas|justi[çc]a|notifica[çc][aã]o\\s+extrajudicial|reclame\\s+aqui|pol[ií]cia|boletim\\s+de\\s+ocorr[eê]ncia|golpe|estelionato|danos\\s+morais|propaganda\\s+enganosa)\\b",
    // Insatisfação severa / Quebra de SLA
    "\\b(?:p[eé]ssimo\\s+atendimento|descaso|falta\\s+de\\s+respeito|ningu[eé]m\\s+responde|esperando\\s+h[aá]\\s+(?:horas|dias)|palha[çc]ada|absurdo|vergonha|lixo|porcaria|atendimento\\s+horr[ií]vel|cansei\\s+de\\s+esperar)\\b",
    // Financeiro / Estorno
    "\\b(?:cobran[çc]a\\s+indevida|cobrado\\s+a\\s+mais|duplicad[oa]|estorno|reembolso|devolver\\s+meu\\s+dinheiro|fraude\\s+no\\s+(?:cart[aã]o|boleto))\\b",
  ].join("|"),
  "i",
);

const CATEGORY_LABELS: Record<string, string> = {
  churn: "Risco de Cancelamento (Churn)",
  critical_issue: "Incidente Crítico / Falha Operacional",
  legal_risk: "Risco Jurídico / Escalação Legal",
  severe_dissatisfaction: "Insatisfação Grave / Descaso",
  billing: "Disputa Financeira / Reembolso",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

/**
 * Avalia uma mensagem de cliente em tempo real via Radar de Conversas.
 * Opera de forma não-bloqueante (fire-and-forget).
 */
export async function evaluateMessageForRadar(input: RadarEvaluationInput): Promise<void> {
  try {
    const { conversationId, contactId, companyId, content, senderType } = input;

    // 1. Apenas mensagens enviadas pelo cliente / contato são candidatas a risco
    if (senderType !== "contact" || !content || typeof content !== "string") {
      return;
    }

    const trimmed = content.trim();
    if (trimmed.length < 3) {
      return;
    }

    // 2. ESTÁGIO 1: Filtro Heurístico Ultra-Rápido (Custo Zero de tokens)
    if (!RADAR_HEURISTIC_REGEX.test(trimmed)) {
      return;
    }

    // 3. Verifica se a empresa tem o Radar habilitado e busca credenciais de IA
    const { data: company, error: companyErr } = await (supabaseAdmin as any)
      .from("companies")
      .select("id, name, ai_settings")
      .eq("id", companyId)
      .single();

    if (companyErr || !company) {
      return;
    }

    const aiSettings = company.ai_settings || {};
    const radarSettings = aiSettings.radar_settings || {};

    // Se a empresa desativou explicitamente o radar, ignora
    if (radarSettings.enabled === false) {
      return;
    }

    // 4. Rate-limiting de alerta por conversa para evitar spam de alertas repetidos
    // Se já foi gerado um alerta para esta conversa nos últimos 15 minutos, não duplicamos ticket
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recentAlerts } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select("id, status, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", fifteenMinutesAgo)
      .in("status", ["pending", "in_review", "ticket_created"])
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) {
      console.log(
        `[radar-engine] Conversa ${conversationId} já possui alerta ativo recente. Ignorando novo disparo.`,
      );
      return;
    }

    // 5. ESTÁGIO 2: Análise Semântica com IA (LLM Background)
    // Resolve chaves de IA da empresa (com fallback para env vars)
    let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text || "openai";
    if (!provider || provider === "none") {
      if (aiSettings.keys?.openai) provider = "openai";
      else if (aiSettings.keys?.groq) provider = "groq";
      else if (aiSettings.keys?.openrouter) provider = "openrouter";
      else provider = "openai";
    }

    let apiKey = aiSettings.keys?.[provider];
    if (!apiKey) {
      if (provider === "openai" && process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === "groq" && process.env.GROQ_API_KEY) {
        apiKey = process.env.GROQ_API_KEY;
      }
    }

    if (!apiKey) {
      console.warn("[radar-engine] Nenhuma chave de IA configurada para avaliar alerta do radar.");
      return;
    }

    let baseUrl = "https://api.openai.com/v1/chat/completions";
    let modelName = aiSettings.active_chatbot_model || "gpt-4o-mini";

    if (provider === "groq") {
      baseUrl = "https://api.groq.com/openai/v1/chat/completions";
      modelName = "llama-3.3-70b-versatile";
    } else if (provider === "openrouter") {
      baseUrl = "https://openrouter.ai/api/v1/chat/completions";
      modelName = aiSettings.active_chatbot_model || "openai/gpt-4o-mini";
    }

    // Busca contexto recente da conversa (últimas 6 mensagens)
    const { data: historyMessages } = await (supabaseAdmin as any)
      .from("messages")
      .select("content, sender_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(6);

    const formattedHistory = (historyMessages || [])
      .reverse()
      .map((m: any) => `${m.sender_type === "contact" ? "Cliente" : "Atendente"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `Você é o Sentinela do Radar de Atendimento ao Cliente de uma empresa de tecnologia/serviços.
Sua missão é ler o contexto recente e a última mensagem do cliente para identificar com alta precisão se há RISCO REAL de Churn/Cancelamento, Incidente Técnico Crítico, Risco Jurídico (Procon/Processo), Insatisfação Severa ou Cobrança Indevida.

CUIDADO COM FALSOS POSITIVOS:
- Se o cliente disser apenas "cancelei a reunião de amanhã" ou "já paguei o boleto antigo que foi cancelado", NÃO é risco de cancelamento da empresa (is_risk = false).
- Se for uma dúvida comum sobre como alterar forma de pagamento ou se um recurso existe, NÃO é incidente crítico (is_risk = false).
- Apenas marque is_risk = true se o cliente realmente manifestar insatisfação, ameaça de saída, reclamação grave de defeito no produto ou menção jurídica.

CATEGORIAS POSSÍVEIS:
- "churn": Risco de cancelamento de plano, rescisão contratual, migração para concorrente.
- "critical_issue": Sistema ou serviço fora do ar, recursos essenciais travados, perda de dados ou vendas.
- "legal_risk": Ameaça ou citação de Procon, processo judicial, advogado, polícia, Reclame Aqui, propaganda enganosa.
- "severe_dissatisfaction": Falta de resposta prolongada, desrespeito percebido, atrito agressivo.
- "billing": Cobrança duplicada, valor cobrado incorretamente, estorno ou reembolso contestado.

SEVERIDADES:
- "critical": Risco jurídico iminente, ameaça direta de cancelamento de cliente importante, sistema 100% parado.
- "high": Forte insatisfação com pedido de cancelamento ou problema técnico grave com contorno parcial.
- "medium": Reclamação expressiva de demora ou cobrança que requer atenção da supervisão.
- "low": Desconforto leve com possibilidade de reversão simples.

Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "is_risk": boolean,
  "category": "churn" | "critical_issue" | "legal_risk" | "severe_dissatisfaction" | "billing",
  "severity": "low" | "medium" | "high" | "critical",
  "summary": "Resumo de 1 frase descrevendo a dor exata do cliente",
  "suggested_action": "Ação recomendada imediata para a equipe/gestor contornar o problema",
  "auto_open_ticket": boolean
}`;

    const userPrompt = `Histórico Recente da Conversa:
${formattedHistory || `Cliente: ${trimmed}`}

Última Mensagem Analisada:
"${trimmed}"

Avalie e retorne o JSON de triagem do Radar:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      console.warn(`[radar-engine] Erro na API de IA (${response.status}):`, await response.text());
      return;
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) return;

    let parsedResult: RadarAnalysisResult;
    try {
      parsedResult = JSON.parse(rawContent);
    } catch {
      console.warn("[radar-engine] Resposta não pôde ser convertida para JSON:", rawContent);
      return;
    }

    // Se a IA determinou que não é um risco real, encerra
    if (!parsedResult.is_risk) {
      return;
    }

    console.log(
      `[radar-engine] 🚨 Risco detectado na conversa ${conversationId}! Categoria: ${parsedResult.category}, Severidade: ${parsedResult.severity}`,
    );

    // Busca detalhes do contato e da conversa
    const { data: convData } = await (supabaseAdmin as any)
      .from("conversations")
      .select("id, unit_id, channel_id, contact:contacts!contact_id(id, name, phone, email)")
      .eq("id", conversationId)
      .single();

    let targetUnitId = input.unitId || convData?.unit_id || null;
    if (!targetUnitId) {
      const { data: firstUnit } = await (supabaseAdmin as any)
        .from("units")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstUnit) {
        targetUnitId = firstUnit.id;
      }
    }
    const contactName = convData?.contact?.name || "Cliente";

    // 6. Insere o alerta na tabela conversation_radar_alerts
    const { data: alertData, error: alertErr } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .insert({
        company_id: companyId,
        unit_id: targetUnitId,
        conversation_id: conversationId,
        contact_id: contactId,
        category: parsedResult.category,
        severity: parsedResult.severity,
        trigger_message: trimmed,
        ai_summary: parsedResult.summary,
        suggested_action: parsedResult.suggested_action,
        status: "pending",
      })
      .select("id")
      .single();

    if (alertErr) {
      console.error("[radar-engine] Erro ao salvar alerta do radar:", alertErr);
      return;
    }

    // Atualiza status do radar na conversa
    await (supabaseAdmin as any)
      .from("conversations")
      .update({
        radar_status: "active",
        radar_last_alert_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // 7. Decide se deve abrir ticket automático (Origem: 'radar')
    // Abre automaticamente se auto_open_ticket for true OU severidade for 'critical' ou 'high'
    // (a menos que a empresa tenha desativado a auto_abertura em radarSettings.auto_open_ticket === false)
    const shouldAutoOpen =
      radarSettings.auto_open_ticket !== false &&
      (parsedResult.auto_open_ticket ||
        parsedResult.severity === "critical" ||
        parsedResult.severity === "high");

    let createdTicketId: string | null = null;
    let createdTicketNumber: number | null = null;

    if (shouldAutoOpen && targetUnitId) {
      // Define prioridade compatível com a tabela tickets
      const priorityMap: Record<string, "low" | "medium" | "high" | "urgent"> = {
        low: "low",
        medium: "medium",
        high: "high",
        critical: "urgent",
      };
      const ticketPriority = priorityMap[parsedResult.severity] || "high";

      // Busca departamento padrão para tickets de radar se configurado
      let departmentId = radarSettings.ticket_department_id || null;
      if (!departmentId) {
        // Tenta encontrar um departamento existente de 'Suporte' ou 'SAC'
        const { data: depts } = await (supabaseAdmin as any)
          .from("departments")
          .select("id")
          .eq("company_id", companyId)
          .ilike("name", "%suporte%")
          .limit(1);

        if (depts && depts.length > 0) {
          departmentId = depts[0].id;
        }
      }

      const categoryLabel = CATEGORY_LABELS[parsedResult.category] || "Risco Operacional";
      const categoryTagMap: Record<string, string> = {
        churn: "CHURN",
        critical_issue: "INCIDENTE",
        legal_risk: "JURÍDICO",
        severe_dissatisfaction: "INSATISFAÇÃO",
        billing: "FINANCEIRO",
      };
      const categoryTag = categoryTagMap[parsedResult.category] || "RISCO";
      const cleanSummary = parsedResult.summary?.replace(/\.$/, "") || categoryLabel;
      const formattedTitle = `[RADAR · ${categoryTag}] ${contactName} — ${cleanSummary}`;

      const { data: newTicket, error: ticketErr } = await (supabaseAdmin as any)
        .from("tickets")
        .insert({
          company_id: companyId,
          unit_id: targetUnitId,
          department_id: departmentId,
          scope: "external",
          origin: "radar",
          title: formattedTitle,
          description:
            `Chamado aberto automaticamente pelo Radar de Conversas do Atendi.\n\n` +
            `🚨 Alerta: ${categoryLabel} (Severidade: ${SEVERITY_LABELS[parsedResult.severity]})\n` +
            `📝 Diagnóstico da IA: ${parsedResult.summary}\n` +
            `💡 Sugestão de Contorno: ${parsedResult.suggested_action}\n\n` +
            `💬 Mensagem do Cliente: "${trimmed}"`,
          status: "new",
          priority: ticketPriority,
          requester_contact_id: contactId,
          conversation_id: conversationId,
          tags: [
            "radar-conversas",
            `radar-${parsedResult.category}`,
            `severidade-${parsedResult.severity}`,
          ],
        })
        .select("id, ticket_number, title")
        .single();

      if (ticketErr) {
        console.error("[radar-engine] Falha ao criar ticket automático do radar:", ticketErr);
      } else if (newTicket) {
        createdTicketId = newTicket.id;
        createdTicketNumber = newTicket.ticket_number;
        const formattedCode = `RAD-${String(newTicket.ticket_number).padStart(5, "0")}`;
        console.log(
          `[radar-engine] Ticket ${formattedCode} (origin: radar) criado com sucesso!`,
        );

        // Atualiza o alerta com o ticket_id e status 'ticket_created'
        await (supabaseAdmin as any)
          .from("conversation_radar_alerts")
          .update({
            ticket_id: newTicket.id,
            status: "ticket_created",
          })
          .eq("id", alertData.id);

        // Dispara a triagem inteligente de IA do chamado em segundo plano
        analyzeTicketWithAI(newTicket.id, companyId).catch((err) =>
          console.warn(`[radar-engine] Falha ao triar ticket #${newTicket.ticket_number}:`, err),
        );
      }
    }

    // 8. Insere nota interna no chat para que o atendente humano/supervisor veja de imediato
    const categoryLabel = CATEGORY_LABELS[parsedResult.category] || "Risco";
    const severityLabel = SEVERITY_LABELS[parsedResult.severity] || "Média";

    let internalMessage =
      `🚨 [RADAR DE CONVERSAS] Alerta de ${categoryLabel} (${severityLabel}) detectado!\n\n` +
      `📌 Diagnóstico: ${parsedResult.summary}\n` +
      `👉 Sugestão: ${parsedResult.suggested_action}`;

    if (createdTicketNumber) {
      const formattedCode = `RAD-${String(createdTicketNumber).padStart(5, "0")}`;
      internalMessage += `\n\n🎫 Chamado urgente ${formattedCode} criado automaticamente pelo Radar para acompanhamento da gerência.`;
    }

    await (supabaseAdmin as any).from("messages").insert({
      conversation_id: conversationId,
      sender_type: "agent",
      is_internal: true,
      content: internalMessage,
    });
  } catch (err) {
    console.error("[radar-engine] Erro inesperado ao avaliar mensagem no radar:", err);
  }
}

/**
 * Realiza uma varredura retroativa no histórico de conversas recentes da empresa
 * para identificar cancelamentos ou incidentes pendentes que não foram processados.
 */
export async function scanRecentConversationsForRadar({
  companyId,
  unitId,
  daysBack = 15,
  limit = 100,
}: {
  companyId: string;
  unitId?: string | null;
  daysBack?: number;
  limit?: number;
}): Promise<{ scanned: number; matched: number; alertsCreated: number }> {
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  let query = (supabaseAdmin as any)
    .from("conversations")
    .select(
      `
      id,
      unit_id,
      last_message_at,
      contact_id,
      contact:contacts!contact_id!inner(id, company_id, name)
    `,
    )
    .eq("contact.company_id", companyId)
    .gte("last_message_at", sinceDate)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (unitId) {
    query = query.eq("unit_id", unitId);
  }

  const { data: convs, error } = await query;
  if (error || !convs) {
    console.error("[radar-engine] Erro ao buscar conversas para varredura:", error);
    return { scanned: 0, matched: 0, alertsCreated: 0 };
  }

  let scanned = 0;
  let matched = 0;
  let alertsCreated = 0;

  for (const conv of convs) {
    scanned++;
    // Busca mensagens do contato nesta conversa
    const { data: contactMsgs } = await (supabaseAdmin as any)
      .from("messages")
      .select("id, content, sender_type, created_at")
      .eq("conversation_id", conv.id)
      .eq("sender_type", "contact")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!contactMsgs || contactMsgs.length === 0) continue;

    // Procura mensagem que acione a heurística
    const suspiciousMsg = contactMsgs.find(
      (m: any) => m.content && RADAR_HEURISTIC_REGEX.test(m.content),
    );

    if (!suspiciousMsg) continue;
    matched++;

    // Verifica se já tem alerta
    const { data: existingAlerts } = await (supabaseAdmin as any)
      .from("conversation_radar_alerts")
      .select("id")
      .eq("conversation_id", conv.id)
      .limit(1);

    if (existingAlerts && existingAlerts.length > 0) {
      continue;
    }

    try {
      await evaluateMessageForRadar({
        messageId: suspiciousMsg.id,
        conversationId: conv.id,
        contactId: conv.contact_id,
        companyId: companyId,
        unitId: conv.unit_id,
        content: suspiciousMsg.content,
        senderType: "contact",
      });
      alertsCreated++;
    } catch (evalErr) {
      console.warn(`[radar-engine] Erro ao avaliar conversa ${conv.id} na varredura:`, evalErr);
    }
  }

  return { scanned, matched, alertsCreated };
}
