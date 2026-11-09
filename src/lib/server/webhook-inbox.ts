import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatQueue } from "./chat-queue";

/**
 * Caixa de entrada de webhooks (tabela webhook_inbox) com fila serial por chat
 * (inspirada na arquitetura do Chatwoot).
 *
 * 1. O payload é gravado na tabela antes de rodar.
 * 2. Deduplicação instantânea via externalId (dropa retries de rede em 0ms).
 * 3. O processamento é serializado por chave de chat (chatKey): mensagens da
 *    mesma conversa nunca rodam simultaneamente, garantindo ordem estrita (FIFO)
 *    e eliminando condições de corrida entre eco e cliente.
 * 4. Chats de clientes diferentes continuam rodando em paralelo sem bloqueio.
 * 5. Se o processamento falhar, o item fica salvo e é reprocessado com backoff.
 */

export interface InboxProcessOptions {
  /** true quando é um reprocessamento (o evento original falhou) */
  isRetry: boolean;
}

export interface InboxMeta {
  event?: string | null;
  instanceName?: string | null;
  externalId?: string | null;
  chatKey?: string | null;
  /** Mantém o payload após o sucesso (para diagnóstico; some na limpeza de 3 dias) */
  keepPayload?: boolean;
}

type Processor = (payload: any, opts: InboxProcessOptions) => Promise<void>;

// Espera antes da tentativa N+1 (segundos). Depois da última, o item vira 'failed'.
const BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1800];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return [e.code, e.message, e.details].filter(Boolean).join(" | ") || JSON.stringify(err);
  }
  return String(err);
}

async function markDone(id: string, keepPayload = false) {
  const update: Record<string, unknown> = {
    status: "done",
    processed_at: new Date().toISOString(),
    last_error: null,
  };
  if (!keepPayload) update.payload = null;
  await (supabaseAdmin.from("webhook_inbox" as any) as any).update(update).eq("id", id);
}

async function markError(id: string, attempts: number, err: unknown) {
  const failed = attempts >= MAX_ATTEMPTS;
  const waitSeconds = BACKOFF_SECONDS[Math.min(attempts, MAX_ATTEMPTS) - 1] ?? 1800;
  await (supabaseAdmin.from("webhook_inbox" as any) as any)
    .update({
      status: failed ? "failed" : "error",
      last_error: errorText(err).slice(0, 2000),
      next_attempt_at: new Date(Date.now() + waitSeconds * 1000).toISOString(),
      locked_at: null,
    })
    .eq("id", id);
  if (failed) {
    console.error(`[webhook-inbox] Item ${id} falhou ${attempts}x e foi marcado como 'failed'.`);
  }
}

/**
 * Grava o payload na caixa de entrada e processa de forma serializada por chat.
 * Nunca lança para fora: falhas ficam salvas para reprocessamento.
 */
export async function processWithInbox(
  provider: string,
  payload: any,
  meta: InboxMeta,
  processor: Processor,
): Promise<void> {
  // 1. Deduplicação precoce em memória com escopo por instância (dropa retries idênticos na mesma instância)
  const dedupKey = meta.externalId ? `${meta.instanceName || "inst"}:${meta.externalId}` : null;
  if (dedupKey && chatQueue.checkAndStart(dedupKey)) {
    console.log(`[webhook-inbox] Mensagem ${meta.externalId} duplicada ou já em andamento em ${meta.instanceName}. Descartando.`);
    return;
  }

  let inboxId: string | null = null;
  try {
    const { data, error } = await (supabaseAdmin.from("webhook_inbox" as any) as any)
      .insert({
        provider,
        event: meta.event ?? null,
        instance_name: meta.instanceName ?? null,
        external_id: meta.externalId ?? null,
        payload,
        status: "processing",
        attempts: 1,
        locked_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    inboxId = data.id;
  } catch (err) {
    console.error("[webhook-inbox] Não foi possível gravar na caixa de entrada:", errorText(err));
  }

  const queueKey = meta.chatKey || meta.instanceName || "global";

  const runTask = async () => {
    try {
      await processor(payload, { isRetry: false });
      if (inboxId) await markDone(inboxId, meta.keepPayload);
      if (dedupKey) chatQueue.markSuccess(dedupKey);
    } catch (err) {
      if (dedupKey) chatQueue.markFailed(dedupKey);
      console.error(
        `[webhook-inbox] Falha ao processar ${provider} (${inboxId}), será reprocessado:`,
        errorText(err),
      );
      if (inboxId) await markError(inboxId, 1, err);
    }
  };

  // Enfileira na fila serializada do chat
  await chatQueue.enqueue(queueKey, runTask);
}

/** Reprocessa itens vencidos da fila. Retorna quantos foram processados com sucesso. */
export async function drainInbox(provider: string, processor: Processor, limit = 3): Promise<number> {
  let ok = 0;
  try {
    const { data: items, error } = await (supabaseAdmin.rpc as any)("claim_webhook_inbox", {
      _provider: provider,
      _limit: limit,
    });
    if (error) throw error;

    for (const item of (items || []) as any[]) {
      if (!item.payload) {
        await markDone(item.id);
        continue;
      }
      const queueKey = item.instance_name || "global";
      await chatQueue.enqueue(queueKey, async () => {
        try {
          await processor(item.payload, { isRetry: true });
          await markDone(item.id);
          ok++;
          console.log(`[webhook-inbox] Reprocessado com sucesso: ${item.id} (tentativa ${item.attempts})`);
        } catch (err) {
          await markError(item.id, item.attempts, err);
        }
      });
    }

    // Limpeza ocasional de itens concluídos antigos
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      await (supabaseAdmin.from("webhook_inbox" as any) as any)
        .delete()
        .eq("status", "done")
        .lt("processed_at", cutoff);
    }
  } catch (err) {
    console.error("[webhook-inbox] Falha ao drenar a fila:", errorText(err));
  }
  return ok;
}
