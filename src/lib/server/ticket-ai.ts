import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface TicketAIAnalysis {
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;
  suggested_solution: string;
  tags: string[];
  can_auto_resolve: boolean;
  auto_reply_message?: string;
}

/**
 * Executa a triagem inteligente e classificação de prioridade do chamado via IA.
 * Também verifica se o agente de IA pode resolver a solicitação de forma autônoma.
 */
export async function analyzeTicketWithAI(ticketId: string, companyId: string) {
  try {
    // 1. Busca os dados do chamado e da empresa
    const { data: ticket, error: ticketError } = await (supabaseAdmin as any)
      .from("tickets")
      .select(`
        id,
        title,
        description,
        scope,
        priority,
        status,
        tags,
        unit:units!unit_id(name),
        department:departments!department_id(name)
      `)
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.warn("[ticket-ai] Ticket não encontrado para análise:", ticketId);
      return;
    }

    const { data: company } = await (supabaseAdmin as any)
      .from("companies")
      .select("id, name, ai_settings")
      .eq("id", companyId)
      .single();

    const aiSettings = company?.ai_settings || {};

    // 2. Resolve provedor e chave de API
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
      console.info("[ticket-ai] Nenhuma chave de IA configurada para triagem automática.");
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

    // 3. Prompt de Triagem e Classificação de Helpdesk
    const systemPrompt = `Você é um Especialista Sênior em Triagem de Helpdesk, SAC e Suporte Corporativo.
Sua missão é analisar o chamado aberto, avaliar o impacto real e a gravidade para definir a PRIORIDADE exata, fornecer um pré-diagnóstico com sugestão de resolução, e determinar se um Agente de IA pode resolver o problema autonomamente.

CRITÉRIOS DE PRIORIDADE:
- "urgent": Paralisação total de operações, sistemas de pagamento/caixa fora do ar, risco financeiro ou jurídico iminente, vazamento de dados, cliente de alto valor impedido de operar.
- "high": Problemas críticos que afetam vários usuários ou clientes, mas com contorno temporário parcial.
- "medium": Demandas operacionais rotineiras, dúvidas contratuais padrão, solicitações com prazo comercial normal.
- "low": Dúvidas simples de procedimentos, melhorias visuais, solicitações de material ou acessos secundários não urgentes.

Critérios para "can_auto_resolve":
- Marque true APENAS se a dúvida/solicitação for perfeitamente explicável e resolvida com um passo a passo claro, orientação de política conhecida ou autoatendimento.
- Marque false se exigir ação física (hardware quebrado, conserto no local), autorização gerencial humana ou acesso a painéis restritos.

Responda ESTRITAMENTE em formato JSON com o seguinte formato:
{
  "priority": "low" | "medium" | "high" | "urgent",
  "reason": "Frase concisa explicando o motivo da prioridade baseada no impacto operacional real",
  "suggested_solution": "Passo a passo ou pré-diagnóstico recomendado para solucionar o problema",
  "tags": ["tag1", "tag2"],
  "can_auto_resolve": true ou false,
  "auto_reply_message": "Texto completo, educado e resolutivo para ser enviado ao solicitante caso can_auto_resolve seja true"
}`;

    const userMessage = `DADOS DO CHAMADO:
Empresa: ${company?.name || "Empresa"}
Escopo: ${ticket.scope === "internal" ? "Chamado Interno entre Colaboradores/Setores" : "Suporte a Cliente / SAC"}
Unidade: ${ticket.unit?.name || "Não especificada"}
Departamento: ${ticket.department?.name || "Geral"}
Título: ${ticket.title}
Descrição Detalhada: ${ticket.description}`;

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider === "openrouter" && {
          "HTTP-Referer": "https://atendi.ai",
          "X-Title": "Atendi Tickets AI",
        }),
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ticket-ai] Erro na API do LLM:", response.status, errText);
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return;

    const analysis: TicketAIAnalysis = JSON.parse(rawContent);

    // 4. Salva a classificação no ticket
    const mergedTags = Array.from(new Set([...(ticket.tags || []), ...(analysis.tags || [])]));
    const updatePayload: Record<string, any> = {
      priority: analysis.priority || "medium",
      ai_priority_reason: analysis.reason || null,
      ai_suggested_solution: analysis.suggested_solution || null,
      ai_auto_resolved: Boolean(analysis.can_auto_resolve),
      ai_analyzed_at: new Date().toISOString(),
      tags: mergedTags,
    };

    if (analysis.can_auto_resolve && analysis.auto_reply_message) {
      updatePayload.status = "resolved";
      updatePayload.resolved_at = new Date().toISOString();
    }

    await (supabaseAdmin as any)
      .from("tickets")
      .update(updatePayload)
      .eq("id", ticketId);

    // 5. Se o agente resolveu sozinho, envia mensagem pública no chamado
    if (analysis.can_auto_resolve && analysis.auto_reply_message) {
      await (supabaseAdmin as any).from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_user_id: null,
        sender_contact_id: null,
        is_internal_note: false,
        content: `🤖 **Resposta do Agente Virtual:**\n\n${analysis.auto_reply_message}\n\n*(Caso esta orientação não resolva completamente o problema, responda a este chamado para reabertura automática e encaminhamento a um atendente humano).*`,
      });
    } else {
      // 6. Se precisa de atendente humano, registra nota interna com a sugestão e o motivo da prioridade
      await (supabaseAdmin as any).from("ticket_messages").insert({
        ticket_id: ticketId,
        sender_user_id: null,
        sender_contact_id: null,
        is_internal_note: true,
        content: `🤖 **Triagem Inteligente da IA:**\n\n• **Prioridade:** ${analysis.priority.toUpperCase()}\n• **Motivo:** ${analysis.reason}\n\n💡 **Diagnóstico e Sugestão de Resolução:**\n${analysis.suggested_solution}`,
      });
    }

    console.info(`[ticket-ai] Ticket #${ticketId} triado com sucesso: Prioridade ${analysis.priority}`);
  } catch (err: any) {
    console.error("[ticket-ai] Falha na análise do ticket por IA:", err?.message || err);
  }
}
