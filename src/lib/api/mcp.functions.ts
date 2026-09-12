import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMcpApiKey } from "../mcp/auth";

// 1. Listar chaves MCP ativas da empresa
export const listMcpKeysAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: keys, error } = await supabaseAdmin
      .from("mcp_api_keys")
      .select("id, name, key_prefix, unit_id, is_active, last_used_at, created_at, units(name, slug)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listMcpKeysAction] Erro ao buscar chaves:", error);
      return { keys: [] };
    }

    return { keys: keys || [] };
  });

// 2. Criar nova chave MCP (retorna o token bruto UMA única vez)
export const createMcpKeyAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().optional().nullable(),
      name: z.string().min(1, "O nome da chave é obrigatório."),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { companyId, unitId, name } = data;

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
    })
  )
  .handler(async ({ data }) => {
    const { keyId, companyId } = data;

    const { error } = await supabaseAdmin
      .from("mcp_api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("company_id", companyId);

    if (error) {
      console.error("[revokeMcpKeyAction] Erro ao revogar chave:", error);
      throw new Error(`Falha ao revogar chave: ${error.message}`);
    }

    return { success: true };
  });
