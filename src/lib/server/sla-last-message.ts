import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSlaLastMessage, SLA_SENDER_TYPES } from "@/lib/sla";

type SlaLastMessage = NonNullable<ReturnType<typeof buildSlaLastMessage>>;

/**
 * Carrega o `last_message` do SLA (mesma regra da tela de conversas) para um lote de conversas.
 * A tabela conversations não guarda a última mensagem: ela vem de messages, só contato/atendente.
 */
export async function loadSlaLastMessages(convIds: string[]): Promise<Map<string, SlaLastMessage>> {
  const result = new Map<string, SlaLastMessage>();
  if (convIds.length === 0) return result;

  const byConv = new Map<string, { sender_type: string; created_at: string }[]>();

  // Lotes de 20 conversas (5 mensagens por conversa): um lote único grande deixaria as
  // conversas paradas sem mensagem quando outras estão muito movimentadas
  const chunks: string[][] = [];
  for (let i = 0; i < convIds.length; i += 20) chunks.push(convIds.slice(i, i + 20));
  const batches = await Promise.all(
    chunks.map((ids) =>
      supabaseAdmin
        .from("messages")
        .select("conversation_id, sender_type, created_at")
        .in("conversation_id", ids)
        .eq("is_internal", false)
        .in("sender_type", [...SLA_SENDER_TYPES])
        .order("created_at", { ascending: false })
        .limit(ids.length * 5),
    ),
  );

  for (const { data: recent } of batches) {
    for (const m of recent ?? []) {
      if (!m.conversation_id) continue;
      const arr = byConv.get(m.conversation_id) ?? [];
      arr.push({ sender_type: m.sender_type, created_at: m.created_at });
      byConv.set(m.conversation_id, arr);
    }
  }

  // Conversas que ficaram de fora do limite do lote são buscadas individualmente
  const missing = convIds.filter((id) => !byConv.has(id));
  const extra = await Promise.all(
    missing.map((id) =>
      supabaseAdmin
        .from("messages")
        .select("sender_type, created_at")
        .eq("conversation_id", id)
        .eq("is_internal", false)
        .in("sender_type", [...SLA_SENDER_TYPES])
        .order("created_at", { ascending: false })
        .limit(5),
    ),
  );
  extra.forEach(({ data }, idx) => {
    if (data && data.length > 0) byConv.set(missing[idx], data);
  });

  for (const [id, msgs] of byConv) {
    const last = buildSlaLastMessage(msgs);
    if (last) result.set(id, last);
  }
  return result;
}
