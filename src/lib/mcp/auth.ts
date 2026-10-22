/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserEffectiveMenus } from "@/lib/permissions";
import type { McpContext, McpRole } from "./types";

type McpUserIdentity = { profileCompanyId: string | null } & Pick<
  McpContext,
  | "userId"
  | "userName"
  | "userEmail"
  | "userRole"
  | "allowedMenus"
  | "hasMatrizAccess"
  | "userUnitIds"
>;

/**
 * Carrega quem está por trás do token (mesmo cálculo de permissões do Copilot).
 * Sem perfil ou com perfil inativo, retorna null e o token é recusado.
 */
async function loadMcpUserIdentity(userId: string): Promise<McpUserIdentity | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, company_id, name, email, role, active, has_matriz_access, allowed_menus, custom_role:company_roles(id, name, allowed_menus, base_role), user_units(unit_id)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile || (profile as any).active === false) return null;

  const userRole = ((profile as any).role || "agent") as McpRole;
  return {
    profileCompanyId: (profile as any).company_id || null,
    userId,
    userName: (profile as any).name || null,
    userEmail: (profile as any).email || null,
    userRole,
    allowedMenus: getUserEffectiveMenus(profile as any),
    hasMatrizAccess: Boolean(
      (profile as any).has_matriz_access ||
      userRole === "admin_company" ||
      userRole === "super_admin",
    ),
    userUnitIds: (((profile as any).user_units as any[]) || []).map((u) => u.unit_id),
  };
}

/**
 * Empresa e unidade que o token pode usar, conforme quem está por trás dele.
 * Sem acesso à Matriz, a pessoa fica na unidade escolhida (se for dela) ou na primeira
 * unidade dela, como no Copilot. Retorna null se o perfil não é dessa empresa.
 */
async function resolveIdentityScope(
  identity: McpUserIdentity,
  companyId: string,
  requestedUnitId: string | null,
): Promise<{
  identity: Omit<McpUserIdentity, "profileCompanyId">;
  unitId: string | null;
  unitName: string | null;
} | null> {
  const { profileCompanyId, ...rest } = identity;
  if (rest.userRole !== "super_admin" && profileCompanyId !== companyId) return null;

  let unitId: string | null = requestedUnitId;
  if (!rest.hasMatrizAccess) {
    const ownUnits = rest.userUnitIds || [];
    if (!unitId || !ownUnits.includes(unitId)) unitId = ownUnits[0] || null;
  }

  let unitName: string | null = null;
  if (unitId) {
    const { data: unit } = await supabaseAdmin
      .from("units")
      .select("name, company_id")
      .eq("id", unitId)
      .maybeSingle();
    if (!unit || unit.company_id !== companyId) {
      unitId = null;
    } else {
      unitName = unit.name;
    }
  }

  return { identity: rest, unitId, unitName };
}

export function hashMcpToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export async function createMcpApiKey({
  companyId,
  unitId,
  name,
  userId,
  permissions = ["all"],
  actsAsUserId = null,
}: {
  companyId: string;
  unitId?: string | null;
  name: string;
  userId?: string;
  permissions?: string[];
  /** Perfil que a chave representa (ex: usuário "Assistente IA" do chat interno) */
  actsAsUserId?: string | null;
}): Promise<{ rawToken: string; key: any }> {
  // Gerar token de alta entropia
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const rawToken = `atendi_mcp_live_${randomBytes}`;
  const keyPrefix = rawToken.slice(0, 20);
  const keyHash = hashMcpToken(rawToken);

  const { data, error } = await supabaseAdmin
    .from("mcp_api_keys")
    .insert({
      company_id: companyId,
      unit_id: unitId || null,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      permissions,
      created_by: userId || null,
      // Só envia a coluna quando usada: chaves comuns funcionam mesmo sem a migration
      ...(actsAsUserId ? { acts_as_user_id: actsAsUserId } : {}),
      is_active: true,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[createMcpApiKey] Erro ao cadastrar chave:", error);
    throw new Error(`Falha ao criar chave MCP: ${error?.message || "Erro desconhecido"}`);
  }

  return { rawToken, key: data };
}

/**
 * Valida o token de autenticação recebido pelo servidor MCP.
 * Suporta 3 formatos:
 * 1. Chaves de API estáticas: `atendi_mcp_live_...`
 * 2. Tokens OAuth emitidos pelo fluxo Claude.ai: `atendi_mcp_oauth_...`
 * 3. JWTs emitidos pelo Supabase Auth: `eyJ...`
 */
export async function validateMcpToken(rawToken: string): Promise<McpContext | null> {
  if (!rawToken) return null;

  const trimmedToken = rawToken.trim();

  // 1. Suporte a Tokens emitidos via fluxo OAuth nativo (Claude.ai / ChatGPT)
  if (trimmedToken.startsWith("atendi_mcp_oauth_")) {
    try {
      const { data: tokenRow, error: tokenErr } = await supabaseAdmin
        .from("mcp_oauth_tokens")
        .select("access_token, user_id, company_id, unit_id, scope, expires_at")
        .eq("access_token", trimmedToken)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (!tokenErr && tokenRow) {
        const loaded = await loadMcpUserIdentity(tokenRow.user_id);
        if (!loaded) return null;
        const scope = await resolveIdentityScope(loaded, tokenRow.company_id, tokenRow.unit_id);
        if (!scope) return null;

        let companyName = "Empresa";

        if (tokenRow.company_id) {
          const { data: c } = await supabaseAdmin
            .from("companies")
            .select("name")
            .eq("id", tokenRow.company_id)
            .single();
          if (c?.name) companyName = c.name;
        }

        return {
          keyId: `oauth_${tokenRow.user_id}`,
          companyId: tokenRow.company_id,
          unitId: scope.unitId,
          companyName,
          unitName: scope.unitName,
          keyName: "Claude.ai OAuth Connector",
          permissions: ["all"],
          ...scope.identity,
        };
      }
    } catch (e) {
      console.warn("[validateMcpToken] Erro ao validar token oauth:", e);
    }
  }

  // 2. Suporte a JWTs do Supabase Auth (caso autenticado via Supabase GoTrue)
  if (trimmedToken.startsWith("eyJ")) {
    try {
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.getUser(trimmedToken);
      if (!authErr && authUser?.user) {
        const userId = authUser.user.id;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("company_id, name, companies:company_id(name)")
          .eq("id", userId)
          .single();

        const loaded = profile?.company_id ? await loadMcpUserIdentity(userId) : null;
        const scope = loaded
          ? await resolveIdentityScope(loaded, profile!.company_id!, null)
          : null;
        if (profile?.company_id && scope) {
          const companyId = profile.company_id;
          const companyName = (profile.companies as any)?.name || "Empresa";

          return {
            keyId: `supabase_${userId}`,
            companyId,
            unitId: scope.unitId,
            companyName,
            unitName: scope.unitName,
            keyName: `OAuth User (${authUser.user.email || "Supabase"})`,
            permissions: ["all"],
            ...scope.identity,
          };
        }
      }
    } catch (e) {
      console.warn("[validateMcpToken] Erro ao validar token Supabase JWT:", e);
    }
  }

  // 3. Suporte a Chaves de API Estáticas (`atendi_mcp_live_...`)
  if (trimmedToken.startsWith("atendi_mcp_")) {
    const hash = hashMcpToken(trimmedToken);

    const { data: key, error } = await supabaseAdmin
      .from("mcp_api_keys")
      // "*" em vez de listar acts_as_user_id: funciona antes e depois da migration que cria a coluna
      .select("*, companies(name), units(name)")
      .eq("key_hash", hash)
      .single();

    if (error || !key || !key.is_active) {
      return null;
    }

    // Verificar expiração se configurada
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    // Chave com identidade própria (ex: Assistente IA do chat interno)
    let scope: Awaited<ReturnType<typeof resolveIdentityScope>> = null;
    const actsAsUserId = (key as any).acts_as_user_id as string | null | undefined;
    if (actsAsUserId) {
      const loaded = await loadMcpUserIdentity(actsAsUserId);
      scope = loaded ? await resolveIdentityScope(loaded, key.company_id, key.unit_id) : null;
      if (!scope) return null;
    }

    // Atualizar last_used_at em background
    supabaseAdmin
      .from("mcp_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", key.id)
      .then(() => {})
      .catch((err) => console.warn("[validateMcpToken] Erro ao atualizar last_used_at:", err));

    const companyName = (key.companies as any)?.name || "Empresa";
    const unitName = key.unit_id ? (key.units as any)?.name || null : null;

    return {
      keyId: key.id,
      companyId: key.company_id,
      unitId: scope ? scope.unitId : key.unit_id,
      companyName,
      unitName: scope ? scope.unitName : unitName,
      keyName: key.name,
      permissions: key.permissions || ["all"],
      ...scope?.identity,
      keyGrantsAll: Boolean(scope && (key.permissions || ["all"]).includes("all")),
    };
  }

  return null;
}
