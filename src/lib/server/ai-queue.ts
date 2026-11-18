import { generateAndSendAiResponse } from "./ai-generator";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Janela de silêncio de 7 segundos para agrupar mensagens consecutivas do cliente
const BUFFER_MS = 7000;

/**
 * Despacha uma tarefa assíncrona em background.
 * No Vercel/Nitro, registra em `waitUntil` para garantir que a função
 * continue executando mesmo após a resposta HTTP 200 ter sido enviada à Meta/provedor.
 * Em Node local ou VPS, anexa tratamento de erro no event loop.
 */
export function dispatchBackgroundTask(promise: Promise<unknown>, request?: Request | null) {
  try {
    const vercelCtx = (request as any)?.runtime?.vercel?.context;
    if (vercelCtx && typeof vercelCtx.waitUntil === "function") {
      vercelCtx.waitUntil(promise);
      return;
    }

    if (request && typeof (request as any).waitUntil === "function") {
      (request as any).waitUntil(promise);
      return;
    }

    const globalWaitUntil = (globalThis as any)?.__wait_until__;
    if (typeof globalWaitUntil === "function") {
      globalWaitUntil(promise);
      return;
    }
  } catch (e) {
    console.warn("[ai-queue] Erro ao registrar waitUntil:", e);
  }

  // Fallback para Node puro / dev: anexa catch para evitar unhandled rejection
  promise.catch((err) => {
    console.error("[ai-queue] Erro não tratado em background:", err);
  });
}

/**
 * Executa o timer de silêncio (7 segundos) e, caso o cliente não tenha enviado
 * nenhuma mensagem mais nova, dispara a resposta unificada da IA.
 */
export async function enqueueAiMessage(
  conversationId: string,
  messageId: string,
  companyId: string,
) {
  console.log(
    `[ai-queue] AI response queued for conversation ${conversationId}. Waiting ${BUFFER_MS / 1000}s for silence...`,
  );

  // Aguarda a janela de silêncio de 7 segundos
  await new Promise((resolve) => setTimeout(resolve, BUFFER_MS));

  try {
    // Após 7 segundos, verifica no banco se chegaram NOVAS mensagens de contato/atendimento (ignora notas internas)
    const { data: latestMsg } = await supabaseAdmin
      .from("messages")
      .select("id, is_internal")
      .eq("conversation_id", conversationId)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .single();

    // Se a mensagem mais recente no banco AINDA FOR esta, significa que o cliente
    // parou de digitar por 7 segundos. A IA pode responder!
    if (latestMsg && latestMsg.id === messageId) {
      console.log(
        `[ai-queue] Buffer of ${BUFFER_MS / 1000}s reached and no new messages. Triggering AI response...`,
      );
      await generateAndSendAiResponse(conversationId, companyId);
    } else {
      console.log(
        `[ai-queue] Newer message found in conversation ${conversationId}. Skipping this trigger.`,
      );
    }
  } catch (err) {
    console.error(
      `[ai-queue] Error generating AI response for conversation ${conversationId}:`,
      err,
    );
  }
}

/**
 * Helper que enfileira a IA e registra em background via waitUntil, permitindo
 * que o webhook retorne HTTP 200 imediatamente para a Meta/EvoGo/Stevo.
 */
export function scheduleAiMessage(
  conversationId: string,
  messageId: string,
  companyId: string,
  request?: Request | null,
) {
  const job = enqueueAiMessage(conversationId, messageId, companyId);
  dispatchBackgroundTask(job, request);
}
