/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Avisa o atendente que recebeu uma transferência. O registro em `notifications`
 * aparece no sino do cabeçalho e dispara som, toast e notificação do navegador
 * (use-global-notifications escuta o INSERT via Realtime).
 * Não notifica quem transferiu para si mesmo. Falhas não interrompem a transferência.
 */
export async function notifyTransferReceiver({
  conversationId,
  receiverId,
  actorId,
  actorLabel,
  departmentName,
}: {
  conversationId: string;
  receiverId: string | null | undefined;
  actorId?: string | null;
  /** Nome exibido quando não há usuário autor (ex.: "A IA") */
  actorLabel?: string | null;
  departmentName?: string | null;
}) {
  if (!receiverId || (actorId && receiverId === actorId)) return;

  try {
    const [{ data: actorProfile }, { data: convData }] = await Promise.all([
      actorId
        ? supabaseAdmin.from("profiles").select("name").eq("id", actorId).maybeSingle()
        : Promise.resolve({ data: null as { name: string | null } | null }),
      supabaseAdmin
        .from("conversations")
        .select("channel, contacts(company_id, name, phone)")
        .eq("id", conversationId)
        .maybeSingle(),
    ]);

    const contact = (convData as any)?.contacts;
    if (!convData || !contact?.company_id) return;

    const contactName = contact.name || contact.phone || "um contato";
    const actorName = actorProfile?.name || actorLabel || "Um colega";
    const viaDept = departmentName ? ` (departamento ${departmentName})` : "";

    await supabaseAdmin.from("notifications" as any).insert({
      company_id: contact.company_id,
      user_id: receiverId,
      type: `transfer_${(convData as any).channel || "whatsapp"}`,
      title: "Novo Atendimento",
      message: `${actorName} transferiu o contato ${contactName} para você${viaDept}.`,
      link: `/conversations?c=${conversationId}`,
    });
  } catch (err) {
    console.warn("[TransferNotifications] Falha ao notificar o atendente:", err);
  }
}
