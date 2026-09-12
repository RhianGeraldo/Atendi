import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext } from "./types";

export function hashMcpToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export async function createMcpApiKey({
  companyId,
  unitId,
  name,
  userId,
  permissions = ["all"],
}: {
  companyId: string;
  unitId?: string | null;
  name: string;
  userId?: string;
  permissions?: string[];
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
        let companyName = "Empresa";
        let unitName: string | null = null;

        if (tokenRow.company_id) {
          const { data: c } = await supabaseAdmin
            .from("companies")
            .select("name")
            .eq("id", tokenRow.company_id)
            .single();
          if (c?.name) companyName = c.name;
        }

        if (tokenRow.unit_id) {
          const { data: u } = await supabaseAdmin
            .from("units")
            .select("name")
            .eq("id", tokenRow.unit_id)
            .single();
          if (u?.name) unitName = u.name;
        }

        return {
          keyId: `oauth_${tokenRow.user_id}`,
          companyId: tokenRow.company_id,
          unitId: tokenRow.unit_id,
          companyName,
          unitName,
          keyName: "Claude.ai OAuth Connector",
          permissions: ["all"],
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

        if (profile?.company_id) {
          const companyId = profile.company_id;
          const companyName = (profile.companies as any)?.name || "Empresa";

          return {
            keyId: `supabase_${userId}`,
            companyId,
            unitId: null,
            companyName,
            unitName: null,
            keyName: `OAuth User (${authUser.user.email || "Supabase"})`,
            permissions: ["all"],
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
      .select("id, company_id, unit_id, name, permissions, is_active, expires_at, companies(name), units(name)")
      .eq("key_hash", hash)
      .single();

    if (error || !key || !key.is_active) {
      return null;
    }

    // Verificar expiração se configurada
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
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
      unitId: key.unit_id,
      companyName,
      unitName,
      keyName: key.name,
      permissions: key.permissions || ["all"],
    };
  }

  return null;
}
