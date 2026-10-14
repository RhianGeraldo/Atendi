import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Caixa de entrada de webhooks (tabela webhook_inbox).
 *
 * O payload é gravado antes do processamento. Se o processamento falhar
 * (timeout, lock, erro de banco), ele fica salvo e é reprocessado depois com
 * backoff — a mensagem atrasa, mas não se perde.
 *
 * A drenagem da fila acontece "de carona" nos próprios webhooks (chegam vários
 * por minuto) e também pela rota /api/cron/webhook-inbox.
 */

export interface InboxProcessOptions {
  /** true quando é um reprocessamento (o evento original falhou) */
  isRetry: boolean;
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

async function markDone(id: string) {
  await (supabaseAdmin.from("webhook_inbox" as any) as any)
    .update({ status: "done", payload: null, processed_at: new Date().toISOString(), last_error: null })
    .eq("id", id);
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
 * Grava o payload e processa. Nunca lança: falhas ficam registradas para
 * reprocessamento. Se nem a gravação na caixa for possível, processa direto
 * (comportamento anterior) e relança o erro do processamento.
 */
export async function processWithInbox(
  provider: string,
  payload: any,
  meta: { event?: string | null; instanceName?: string | null; externalId?: string | null },
  processor: Processor,
): Promise<void> {
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

  if (!inboxId) {
    await processor(payload, { isRetry: false });
    return;
  }

  try {
    await processor(payload, { isRetry: false });
    await markDone(inboxId);
  } catch (err) {
    console.error(`[webhook-inbox] Falha ao processar ${provider} (${inboxId}), será reprocessado:`, errorText(err));
    await markError(inboxId, 1, err);
  }
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
      try {
        await processor(item.payload, { isRetry: true });
        await markDone(item.id);
        ok++;
        console.log(`[webhook-inbox] Reprocessado com sucesso: ${item.id} (tentativa ${item.attempts})`);
      } catch (err) {
        await markError(item.id, item.attempts, err);
      }
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
