import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMcpApiKey } from "../mcp/auth";

// Quem chama precisa ser da empresa (ou super admin); adminOnly exige admin da empresa.
async function assertCompanyAccess(userId: string, companyId: string, adminOnly = false) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .maybeSingle();

  // app_role em types.ts está desatualizado (sem super_admin)
  if ((profile?.role as string) === "super_admin") return;
  if (!profile || profile.company_id !== companyId) {
    throw new Error("Acesso negado a esta empresa.");
  }
  if (adminOnly && profile.role !== "admin_company") {
    throw new Error("Somente o administrador da empresa pode fazer isso.");
  }
}

// 1. Listar chaves MCP ativas da empresa
export const listMcpKeysAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { companyId } = data;
    await assertCompanyAccess((context as { userId: string }).userId, companyId);

    // "*" funciona antes e depois da migration de acts_as_user_id; a resposta leva só
    // os campos da tela (nunca o key_hash)
    const { data: rows, error } = await supabaseAdmin
      .from("mcp_api_keys")
      .select("*, units(name, slug)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listMcpKeysAction] Erro ao buscar chaves:", error);
      return { keys: [] };
    }

    const actsAsIds = (rows || [])
      .map((k) => (k as { acts_as_user_id?: string | null }).acts_as_user_id)
      .filter((id): id is string => !!id);
    const actsAsNames = new Map<string, string>();
    if (actsAsIds.length > 0) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .in("id", actsAsIds);
      for (const p of people || []) actsAsNames.set(p.id, p.name);
    }

    const keys = (rows || []).map((k) => {
      const actsAsUserId = (k as { acts_as_user_id?: string | null }).acts_as_user_id || null;
      return {
        id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        unit_id: k.unit_id,
        is_active: k.is_active,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
        units: k.units,
        acts_as_user_id: actsAsUserId,
        acts_as: actsAsUserId ? { name: actsAsNames.get(actsAsUserId) || null } : null,
      };
    });

    return { keys };
  });

// 2. Criar nova chave MCP (retorna o token bruto UMA única vez)
export const createMcpKeyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().optional().nullable(),
      name: z.string().min(1, "O nome da chave é obrigatório."),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { companyId, unitId, name } = data;
    await assertCompanyAccess(userId, companyId);

    const result = await createMcpApiKey({
      companyId,
      unitId: unitId || null,
      name,
      userId,
    });

    return {
      success: true,
      rawToken: result.rawToken,
      key: result.key,
    };
  });

// 3. Revogar chave MCP
export const revokeMcpKeyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      keyId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { keyId, companyId } = data;
    await assertCompanyAccess((context as { userId: string }).userId, companyId);

    const { error } = await supabaseAdmin
      .from("mcp_api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("company_id", companyId);

    if (error) {
      console.error("[revokeMcpKeyAction] Erro ao revogar chave:", error);
      throw new Error(`Falha ao revogar chave: ${error.message}`);
    }

    // Chave do Assistente IA: o usuário dele sai da equipe junto
    const { data: revoked } = await supabaseAdmin
      .from("mcp_api_keys")
      .select("*")
      .eq("id", keyId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (revoked?.acts_as_user_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ active: false, online: false })
        .eq("id", revoked.acts_as_user_id);
    }

    return { success: true };
  });

// 4. Criar Assistente IA do chat interno: um usuário próprio da empresa + chave MCP que age
// como ele (só ferramentas do chat interno). A equipe conversa com ele como com um colega.
export const createTeamChatBotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      botName: z.string().trim().min(2, "Informe o nome do assistente.").max(60),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { companyId, botName } = data;
    await assertCompanyAccess(userId, companyId, true);

    // E-mail em domínio reservado (.invalid): ninguém recebe nem faz login com ele
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: `assistente-ia-${crypto.randomBytes(6).toString("hex")}@bots.atendi.invalid`,
      password: crypto.randomBytes(32).toString("hex"),
      email_confirm: true,
      // company_id no metadata: o trigger handle_new_user já cria o perfil na empresa
      user_metadata: { name: botName, company_id: companyId, is_bot: true },
    });

    if (authErr || !created?.user) {
      throw new Error(
        `Falha ao criar usuário do assistente: ${authErr?.message || "desconhecido"}`,
      );
    }
    const botId = created.user.id;

    try {
      // Sem departamento, sem unidade e offline: fica fora da distribuição de atendimentos
      const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
        id: botId,
        company_id: companyId,
        name: botName,
        email: created.user.email!,
        role: "agent",
        active: true,
        online: false,
        use_signature: false,
      });
      if (profErr) throw new Error(`Falha ao criar perfil do assistente: ${profErr.message}`);

      const result = await createMcpApiKey({
        companyId,
        unitId: null,
        name: `${botName} (chat interno)`,
        userId,
        permissions: ["team_chat"],
        actsAsUserId: botId,
      });

      return {
        success: true,
        botUserId: botId,
        rawToken: result.rawToken,
        key: result.key,
      };
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(botId).catch(() => {});
      throw err;
    }
  });
