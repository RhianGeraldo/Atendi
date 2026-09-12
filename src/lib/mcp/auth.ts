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

export async function validateMcpToken(rawToken: string): Promise<McpContext | null> {
  if (!rawToken || !rawToken.startsWith("atendi_mcp_")) {
    return null;
  }

  const hash = hashMcpToken(rawToken);

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
