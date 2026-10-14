import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Checagens de permissão para código de servidor que usa a service role
 * (e portanto não passa pelo RLS). Espelham as regras do banco:
 * - super_admin: tudo
 * - admin_company: todas as unidades e a Rede da própria empresa
 * - demais: só as unidades vinculadas (user_units); a Rede (unit_id nulo)
 *   apenas com acesso Matriz/Rede (has_matriz_access)
 */

interface AccessProfile {
  id: string;
  role: string;
  company_id: string | null;
  has_matriz_access: boolean | null;
  active: boolean | null;
}

async function loadAccessProfile(userId: string): Promise<AccessProfile> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, company_id, has_matriz_access, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Usuário não encontrado.");
  if (data.active === false && data.role !== "super_admin") {
    throw new Error("Usuário desativado.");
  }
  return data as AccessProfile;
}

export async function assertConversationAccess(userId: string, conversationId: string) {
  const { data, error } = await (supabaseAdmin.rpc as any)("user_can_access_conversation", {
    _user: userId,
    _conversation: conversationId,
  });
  if (error) {
    console.error("[access-control] Falha ao verificar acesso à conversa:", error);
    throw new Error("Falha ao verificar permissão da conversa.");
  }
  if (!data) throw new Error("Você não tem permissão para acessar esta conversa.");
}

export async function assertMessageAccess(userId: string, messageId: string): Promise<string> {
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg?.conversation_id) throw new Error("Mensagem não encontrada.");
  await assertConversationAccess(userId, msg.conversation_id);
  return msg.conversation_id;
}

export async function assertCompanyAccess(userId: string, companyId: string | null | undefined) {
  const profile = await loadAccessProfile(userId);
  if (profile.role === "super_admin") return profile;
  if (!companyId || profile.company_id !== companyId) {
    throw new Error("Você não tem permissão para acessar dados desta empresa.");
  }
  return profile;
}

export async function assertCompanyUnitAccess(
  userId: string,
  companyId: string | null | undefined,
  unitId: string | null | undefined,
) {
  const profile = await assertCompanyAccess(userId, companyId);
  if (profile.role === "super_admin" || profile.role === "admin_company") return;

  if (!unitId) {
    if (profile.has_matriz_access) return;
    throw new Error("Você não tem permissão para atuar na Rede.");
  }

  const { data: link } = await supabaseAdmin
    .from("user_units")
    .select("unit_id")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .maybeSingle();
  if (!link) throw new Error("Você não tem permissão para atuar nesta unidade.");
}

export async function assertContactAccess(userId: string, contactId: string) {
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("company_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) throw new Error("Contato não encontrado.");
  await assertCompanyAccess(userId, contact.company_id);
}
