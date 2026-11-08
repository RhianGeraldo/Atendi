/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";

/**
 * Cadência de Reengajamento a Longo Prazo (D+1, D+3, D+7, D+15, D+30)
 * Reengaja contatos cuja conversa foi finalizada por inatividade.
 */

export interface CadenceStepInfo {
  step: number;
  label: string;
  daysFromPrevious: number;
}

export const CADENCE_STEPS: Record<number, CadenceStepInfo> = {
  1: { step: 1, label: "D+1", daysFromPrevious: 1 },
  2: { step: 2, label: "D+3", daysFromPrevious: 2 }, // +2 dias após D+1 = 3 dias totais
  3: { step: 3, label: "D+7", daysFromPrevious: 4 }, // +4 dias após D+3 = 7 dias totais
  4: { step: 4, label: "D+15", daysFromPrevious: 8 }, // +8 dias após D+7 = 15 dias totais
  5: { step: 5, label: "D+30", daysFromPrevious: 15 }, // +15 dias após D+15 = 30 dias totais
};

/**
 * Verifica se o momento atual está dentro do horário comercial de Brasília
 * (Seg a Sex das 09:00 às 18:00, Sáb das 09:00 às 13:00, Domingo fechado)
 */
export function isWithinBusinessHours(date: Date = new Date()): boolean {
  const spTimeStr = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const spDate = new Date(spTimeStr);
  const day = spDate.getDay(); // 0 = Domingo, 6 = Sábado
  const hour = spDate.getHours();
  const minute = spDate.getMinutes();
  const timeNum = hour + minute / 60;

  if (day === 0) return false; // Domingo não envia
  if (day === 6) {
    // Sábado: 09:00 às 13:00
    return timeNum >= 9 && timeNum < 13;
  }
  // Segunda a Sexta: 09:00 às 18:00
  return timeNum >= 9 && timeNum < 18;
}

/**
 * Calcula o próximo horário comercial válido (10:00 da manhã no Horário de Brasília no próximo dia útil).
 * Independe do fuso do servidor (UTC em produção na Vercel/Docker).
 */
export function getNextBusinessDateTime(baseDate: Date = new Date(), addDays: number = 0): Date {
  const spString = baseDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const spDate = new Date(spString);

  if (addDays > 0) {
    spDate.setDate(spDate.getDate() + addDays);
  }

  // Se cair em domingo (0), avança para segunda-feira
  if (spDate.getDay() === 0) {
    spDate.setDate(spDate.getDate() + 1);
  }

  const year = spDate.getFullYear();
  const month = spDate.getMonth();
  const day = spDate.getDate();

  // 10:00 da manhã no Horário de Brasília (UTC-3) => 13:00:00.000Z UTC
  return new Date(Date.UTC(year, month, day, 13, 0, 0, 0));
}

let isCadenceProcessing = false;

/**
 * Processa a fila de cadência de reengajamento (D+1 a D+30).
 * Executado pelo cron periodicamente.
 */
export async function processCadenceQueue(): Promise<{ processed: number; skipped: number }> {
  if (isCadenceProcessing) {
    return { processed: 0, skipped: 0 };
  }
  isCadenceProcessing = true;

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Se estiver fora do horário comercial, não dispara mensagens aos clientes agora
    if (!isWithinBusinessHours(now)) {
      return { processed: 0, skipped: 0 };
    }

    // Busca conversas resolvidas com cadência ativa cujo horário já chegou
    const { data: convs, error } = await (supabaseAdmin as any)
      .from("conversations")
      .select(
        `
        id,
        company_id,
        unit_id,
        contact_id,
        status,
        resolved_at,
        ai_agent_id,
        cadence_step,
        cadence_next_at,
        contacts (
          id,
          name,
          phone,
          company_id
        ),
        ai_agents (
          id,
          name,
          prompt_personality,
          prompt_cadence,
          allow_cadence,
          model,
          provider
        )
      `,
      )
      .eq("status", "resolved")
      .not("cadence_next_at", "is", null)
      .lte("cadence_next_at", nowIso)
      .lt("cadence_step", 5)
      .limit(10);

    if (error || !convs || convs.length === 0) {
      return { processed: 0, skipped: 0 };
    }

    let processedCount = 0;
    let skippedCount = 0;

    for (const conv of convs) {
      const agent = conv.ai_agents;
      const contact = conv.contacts;

      if (!agent || agent.allow_cadence === false) {
        // Agente desabilitou cadência: encerra
        await (supabaseAdmin as any)
          .from("conversations")
          .update({ cadence_step: 5, cadence_next_at: null })
          .eq("id", conv.id);
        skippedCount++;
        continue;
      }

      // 1. Checa se o contato mandou mensagem depois de ter sido resolvido
      const resolvedAt = conv.resolved_at || conv.cadence_next_at;
      const { data: contactMsgs } = await supabaseAdmin
        .from("messages")
        .select("id, created_at")
        .eq("conversation_id", conv.id)
        .eq("sender_type", "contact")
        .gt("created_at", resolvedAt)
        .limit(1);

      if (contactMsgs && contactMsgs.length > 0) {
        // Cliente já interagiu: encerra cadência
        await (supabaseAdmin as any)
          .from("conversations")
          .update({ cadence_step: 0, cadence_next_at: null })
          .eq("id", conv.id);
        skippedCount++;
        continue;
      }

      const nextStepNum = (conv.cadence_step || 0) + 1;
      const stepInfo = CADENCE_STEPS[nextStepNum];
      if (!stepInfo) {
        await (supabaseAdmin as any)
          .from("conversations")
          .update({ cadence_step: 5, cadence_next_at: null })
          .eq("id", conv.id);
        continue;
      }

      // 2. Buscar histórico recente da conversa para dar contexto ao modelo
      const { data: recentMsgs } = await supabaseAdmin
        .from("messages")
        .select("content, sender_type, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const historyFormatted = (recentMsgs || [])
        .reverse()
        .filter((m) => m.content && !m.content.startsWith("[SISTEMA]"))
        .map((m) => `${m.sender_type === "contact" ? "Cliente" : "Atendente"}: ${m.content}`)
        .join("\n");

      const contactName = (contact?.name || "").trim();
      const firstName = contactName ? contactName.split(/\s+/)[0] : "";
      const effectiveCompanyId = conv.company_id || contact?.company_id;

      // 3. Buscar configurações da empresa para chave LLM
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("ai_settings, name")
        .eq("id", effectiveCompanyId)
        .single();

      const aiSettings = (company?.ai_settings as any) || {};
      const provider = agent.provider || aiSettings.engines?.chatbot || "openai";
      const apiKey = aiSettings.keys?.[provider];

      let generatedMessage = "";

      if (apiKey) {
        let baseUrl = "https://api.openai.com/v1/chat/completions";
        if (provider === "groq") baseUrl = "https://api.groq.com/openai/v1/chat/completions";
        else if (provider === "openrouter")
          baseUrl = "https://openrouter.ai/api/v1/chat/completions";

        let model = agent.model || aiSettings.active_chatbot_model || "gpt-4o-mini";
        model = model.replace("openrouter/", "").replace("groq/", "");

        const promptText = `Você é ${agent.name}.
O cliente ${contactName ? `(${contactName})` : ""} esteve em contato conosco anteriormente, mas parou de responder e a conversa foi encerrada.
Hoje estamos no passo ${stepInfo.step} (${stepInfo.label}) da cadência de reengajamento a longo prazo.

DIRETRIZES DE REENGAJAMENTO:
1. Mensagem de WhatsApp CURTÍSSIMA (apenas 1 a 2 frases curtas, no máximo 25 a 30 palavras).
2. Tom caloroso, amigável, educado e natural. Jamais soe invasivo ou como cobrança.
3. Retome o assunto com leveza baseando-se no que conversamos anteriormente e faça UMA pergunta simples no final.
4. NUNCA cite termos técnicos como 'cadência', 'sistema', 'inatividade' ou tags em colchetes.
${agent.prompt_cadence ? `DIRETRIZ ESPECÍFICA DA EMPRESA:\n${agent.prompt_cadence}` : ""}

HISTÓRICO RECENTE:
${historyFormatted || "Conversa anterior sobre serviços e dúvidas gerais."}
`;

        try {
          const res = await fetch(baseUrl, {
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
              model,
              messages: [{ role: "system", content: promptText }],
              temperature: 0.7,
              max_tokens: 150,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            generatedMessage = data.choices?.[0]?.message?.content?.trim() || "";
          }
        } catch (apiErr) {
          console.error(`[cadence] Erro ao chamar LLM para cadência:`, apiErr);
        }
      }

      // Fallback amigável se a LLM não responder
      if (!generatedMessage) {
        if (stepInfo.step === 1) {
          generatedMessage = firstName
            ? `Oi ${firstName}, tudo bem? Vi que conversamos ontem e queria saber se você conseguiu dar uma olhadinha!`
            : "Olá! Tudo bem? Vi que conversamos ontem e queria saber se você ainda precisa de alguma ajuda!";
        } else if (stepInfo.step === 2) {
          generatedMessage = firstName
            ? `Oi ${firstName}, passando rapidinho para saber se ficou alguma dúvida do nosso contato anterior!`
            : "Olá! Passando rapidinho para saber se ficou alguma dúvida da nossa conversa!";
        } else {
          generatedMessage = firstName
            ? `Olá ${firstName}! Tudo bem com você? Ficamos à disposição caso ainda queira dar continuidade, tá bom?`
            : "Olá! Tudo bem? Ficamos à inteira disposição caso ainda queira dar continuidade!";
        }
      }

      // Limpeza de tags
      generatedMessage = generatedMessage.replace(/\[.*?\]/g, "").trim();

      console.log(
        `[cadence] Envio do passo ${stepInfo.label} para conversa ${conv.id} (${contactName}): "${generatedMessage}"`,
      );

      // 4. Enviar mensagem pelo WhatsApp
      try {
        await sendPlatformMessage({
          conversationId: conv.id,
          text: `*${agent.name}*:\n${generatedMessage}`,
          senderType: "agent",
          aiAgentId: agent.id,
          keepStatus: true,
          metadata: {
            ai_generated: true,
            cadence_step: stepInfo.step,
            cadence_label: stepInfo.label,
          },
        });

        // 5. Inserir nota interna no histórico da conversa
        await supabaseAdmin.from("messages").insert({
          conversation_id: conv.id,
          sender_type: "agent",
          is_internal: true,
          content: `📅 Cadência de Reengajamento (${stepInfo.label}) disparada pela IA (${agent.name}).`,
        });

        // 6. Criar Tarefa no CRM para visibilidade da equipe comercial
        if (conv.contact_id) {
          await supabaseAdmin.from("tasks").insert({
            title: `Cadência ${stepInfo.label}: ${contactName || "Cliente"}`,
            description: `Mensagem de reengajamento (${stepInfo.label}) enviada automaticamente pela IA (${agent.name}): "${generatedMessage}"`,
            contact_id: conv.contact_id,
            unit_id: conv.unit_id || null,
            status: "completed",
            priority: stepInfo.step >= 4 ? "medium" : "low",
            task_type: "follow_up",
            due_date: new Date().toISOString(),
          });
        }

        // 7. Calcular próximo passo da cadência
        let nextCadenceDate: string | null = null;
        if (nextStepNum < 5) {
          const nextStepInfo = CADENCE_STEPS[nextStepNum + 1];
          const nextDate = getNextBusinessDateTime(new Date(), nextStepInfo.daysFromPrevious);
          nextCadenceDate = nextDate.toISOString();
        }

        await (supabaseAdmin as any)
          .from("conversations")
          .update({
            cadence_step: nextStepNum,
            cadence_next_at: nextCadenceDate,
          })
          .eq("id", conv.id);

        processedCount++;
      } catch (sendErr) {
        console.error(`[cadence] Falha ao enviar mensagem de cadência para ${conv.id}:`, sendErr);
        // Tenta novamente daqui a 2 horas dentro do horário comercial
        const retryDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await (supabaseAdmin as any)
          .from("conversations")
          .update({ cadence_next_at: retryDate.toISOString() })
          .eq("id", conv.id);
      }
    }

    return { processed: processedCount, skipped: skippedCount };
  } finally {
    isCadenceProcessing = false;
  }
}
