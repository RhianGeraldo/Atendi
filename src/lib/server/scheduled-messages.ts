/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";

export interface ScheduleMessageInput {
  companyId: string;
  conversationId: string;
  contactId?: string | null;
  unitId?: string | null;
  creatorType: "user" | "agent" | "system";
  userId?: string | null;
  aiAgentId?: string | null;
  content: string;
  mediaType?: "image" | "video" | "audio" | "document" | null;
  mediaUrl?: string | null;
  scheduledAt: string | Date;
  metadata?: Record<string, any>;
}

/**
 * Agenda uma nova mensagem para envio futuro no WhatsApp
 */
export async function scheduleMessage(input: ScheduleMessageInput) {
  const scheduledDate =
    typeof input.scheduledAt === "string" ? new Date(input.scheduledAt) : input.scheduledAt;

  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Data de agendamento inválida.");
  }

  // Previne agendamento no passado (com tolerância de 10 segundos)
  if (scheduledDate.getTime() < Date.now() - 10000) {
    throw new Error("Não é possível agendar mensagens no passado.");
  }

  // Resolver dados da conversa se não fornecidos
  let contactId = input.contactId || null;
  let unitId = input.unitId || null;
  let companyId = input.companyId;

  if (!contactId || !unitId || !companyId) {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("contact_id, unit_id, contacts(company_id)")
      .eq("id", input.conversationId)
      .single();

    if (conv) {
      if (!contactId) contactId = conv.contact_id;
      if (!unitId) unitId = conv.unit_id;
      if (!companyId) companyId = (conv.contacts as any)?.company_id;
    }
  }

  const { data: scheduled, error } = await supabaseAdmin
    .from("scheduled_messages")
    .insert({
      company_id: companyId,
      conversation_id: input.conversationId,
      contact_id: contactId,
      unit_id: unitId,
      creator_type: input.creatorType,
      user_id: input.userId || null,
      ai_agent_id: input.aiAgentId || null,
      content: input.content.trim(),
      media_type: input.mediaType || null,
      media_url: input.mediaUrl || null,
      scheduled_at: scheduledDate.toISOString(),
      status: "pending",
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error || !scheduled) {
    console.error("[scheduled-messages] Erro ao agendar mensagem:", error);
    throw new Error(error?.message || "Falha ao gravar agendamento no banco de dados.");
  }

  console.log(
    `[scheduled-messages] Mensagem agendada (${scheduled.id}) para ${scheduledDate.toISOString()} na conversa ${input.conversationId}`,
  );
  return scheduled;
}

/**
 * Cancela mensagens agendadas pendentes de uma conversa
 * (ex: quando o cliente interage ou quando o atendente cancela manualmente)
 */
export async function cancelScheduledMessagesForConversation(
  conversationId: string,
  reason: string = "Cancelado pelo sistema",
  creatorType?: "agent" | "user" | "all",
) {
  let query = (supabaseAdmin as any)
    .from("scheduled_messages")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId)
    .eq("status", "pending");

  if (creatorType === "agent") {
    query = query.in("creator_type", ["agent", "system"]);
  } else if (creatorType === "user") {
    query = query.eq("creator_type", "user");
  }

  const { data: updated, error } = await query.select("id");

  if (error) {
    console.error(
      `[scheduled-messages] Erro ao cancelar mensagens agendadas da conversa ${conversationId}:`,
      error,
    );
    return 0;
  }

  if (updated && updated.length > 0) {
    console.log(
      `[scheduled-messages] ${updated.length} mensagem(ns) agendada(s) cancelada(s) na conversa ${conversationId}. Motivo: ${reason}`,
    );
  }

  return updated ? updated.length : 0;
}

/**
 * Lista mensagens agendadas pendentes de uma conversa
 */
export async function listPendingScheduledMessages(conversationId: string) {
  const { data: list, error } = await supabaseAdmin
    .from("scheduled_messages")
    .select(
      "id, content, media_type, media_url, scheduled_at, status, creator_type, user_id, ai_agent_id, metadata, created_at",
    )
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("[scheduled-messages] Erro ao listar mensagens agendadas:", error);
    return [];
  }

  return list || [];
}

/**
 * Cancela um agendamento específico por ID
 */
export async function cancelScheduledMessageById(
  scheduledId: string,
  reason: string = "Cancelado manualmente",
) {
  const { data, error } = await supabaseAdmin
    .from("scheduled_messages")
    .update({
      status: "cancelled",
      cancel_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduledId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) {
    console.error(`[scheduled-messages] Erro ao cancelar agendamento ${scheduledId}:`, error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Processa a fila de mensagens agendadas com vencimento atingido (chamado pelo Cron a cada 1 minuto)
 */
export async function processScheduledMessages(): Promise<{
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const nowIso = new Date().toISOString();

  // Buscar mensagens pendentes vencidas (até 50 por rodada)
  const { data: pendings, error } = await supabaseAdmin
    .from("scheduled_messages")
    .select("*, conversations(id, status, whatsapp_instance_id)")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[scheduled-messages] Erro ao buscar mensagens agendadas vencidas:", error);
    return { sent: 0, failed: 0, cancelled: 0 };
  }

  if (!pendings || pendings.length === 0) {
    return { sent: 0, failed: 0, cancelled: 0 };
  }

  console.log(
    `[scheduled-messages] Processando ${pendings.length} mensagem(ns) agendada(s) vencida(s)...`,
  );

  let sentCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  for (const item of pendings) {
    try {
      // 1. Verificar se houve resposta do cliente após o agendamento (regra de auto-cancelamento)
      const autoCancel = item.metadata?.auto_cancel_on_client_reply ?? true;

      if (autoCancel && item.conversation_id) {
        const { data: clientReplies } = await supabaseAdmin
          .from("messages")
          .select("id, created_at")
          .eq("conversation_id", item.conversation_id)
          .eq("sender_type", "contact")
          .gte("created_at", item.created_at)
          .limit(1);

        if (clientReplies && clientReplies.length > 0) {
          console.log(
            `[scheduled-messages] Auto-cancelando mensagem agendada ${item.id}: cliente respondeu antes do envio.`,
          );
          await supabaseAdmin
            .from("scheduled_messages")
            .update({
              status: "cancelled",
              cancel_reason: "Cliente interagiu na conversa antes do envio agendado.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          cancelledCount++;
          continue;
        }
      }

      // 2. Enviar via Plataforma
      const isFromAgent = item.creator_type === "agent";
      console.log(
        `[scheduled-messages] Enviando mensagem agendada ${item.id} para a conversa ${item.conversation_id}...`,
      );

      await sendPlatformMessage({
        conversationId: item.conversation_id,
        text: item.content,
        senderType: "agent",
        senderId: item.user_id || undefined,
        aiAgentId: item.ai_agent_id || undefined,
        mediaType: item.media_type || undefined,
        mediaBase64: item.media_url || undefined,
        metadata: {
          scheduled_message_id: item.id,
          creator_type: item.creator_type,
          ...(item.metadata || {}),
        },
      });

      // 3. Atualizar status para 'sent'
      await supabaseAdmin
        .from("scheduled_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      sentCount++;
      console.log(`[scheduled-messages] Mensagem agendada ${item.id} enviada com sucesso!`);
    } catch (err: any) {
      console.error(`[scheduled-messages] Falha ao enviar mensagem agendada ${item.id}:`, err);
      await supabaseAdmin
        .from("scheduled_messages")
        .update({
          status: "failed",
          error_message: err?.message || String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      failedCount++;
    }
  }

  return { sent: sentCount, failed: failedCount, cancelled: cancelledCount };
}
