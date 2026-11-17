/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Atualiza a unidade de um contato.
 * Permitido EXCLUSIVAMENTE para administradores (admin_company ou super_admin).
 */
export const updateContactUnitAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      contactId: z.string().uuid(),
      unitId: z.string().uuid().nullable(),
      companyId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    const { contactId, unitId, companyId } = data;
    const userId = context?.userId || context?.user?.id;

    if (!userId) {
      throw new Error("Não autenticado ou sessão expirada.");
    }

    // 1. Verifica se o usuário autenticado é administrador
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, company_id, has_matriz_access")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      throw new Error("Perfil de usuário não encontrado.");
    }

    const isAdmin =
      profile.role === "admin_company" ||
      profile.role === "super_admin" ||
      Boolean(profile.has_matriz_access);

    if (!isAdmin) {
      throw new Error("Apenas administradores podem alterar a unidade do contato.");
    }

    // 2. Busca o contato e valida a empresa
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, company_id, unit_id")
      .eq("id", contactId)
      .single();

    if (contactErr || !contact) {
      throw new Error("Contato não encontrado.");
    }

    const effectiveCompanyId = contact.company_id;

    // Valida se o administrador pertence à empresa do contato (ou é super_admin)
    if (profile.role !== "super_admin" && profile.company_id !== effectiveCompanyId) {
      throw new Error("Acesso negado: você não pertence à empresa deste contato.");
    }

    // 3. Se unitId foi informado, garante que a unidade pertence à empresa do contato
    if (unitId) {
      const { data: unit, error: unitErr } = await supabaseAdmin
        .from("units")
        .select("id, name")
        .eq("id", unitId)
        .eq("company_id", effectiveCompanyId)
        .single();

      if (unitErr || !unit) {
        throw new Error("A unidade selecionada não pertence a esta empresa.");
      }
    }

    // 4. Atualiza a unidade do contato
    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update({ unit_id: unitId })
      .eq("id", contactId);

    if (updateErr) {
      throw new Error(`Erro ao atualizar unidade do contato: ${updateErr.message}`);
    }

    // 5. Sincroniza a unidade nas conversas do contato para manter consistência em filas e filtros
    await supabaseAdmin
      .from("conversations")
      .update({ unit_id: unitId })
      .eq("contact_id", contactId);

    return {
      success: true,
      contactId,
      unitId,
    };
  });

/**
 * Atualiza o status/tipo do contato (lead vs client).
 * Registra became_client_at quando promovido a cliente.
 */
export const updateContactTypeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      contactId: z.string().uuid(),
      contactType: z.enum(["lead", "client"]),
      companyId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    const { contactId, contactType, companyId } = data;
    const userId = context?.userId || context?.user?.id;

    if (!userId) {
      throw new Error("Não autenticado ou sessão expirada.");
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      throw new Error("Perfil de usuário não encontrado.");
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, company_id, contact_type, became_client_at")
      .eq("id", contactId)
      .single();

    if (contactErr || !contact) {
      throw new Error("Contato não encontrado.");
    }

    if (profile.role !== "super_admin" && profile.company_id !== contact.company_id) {
      throw new Error("Acesso negado: você não pertence à empresa deste contato.");
    }

    const updates: Record<string, any> = {
      contact_type: contactType,
    };

    if (contactType === "client") {
      updates.became_client_at = contact.became_client_at || new Date().toISOString();
    } else {
      updates.became_client_at = null;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("contacts")
      .update(updates)
      .eq("id", contactId);

    if (updateErr) {
      throw new Error(`Erro ao atualizar tipo do contato: ${updateErr.message}`);
    }

    return {
      success: true,
      contactId,
      contactType,
    };
  });

/**
 * Atualização em massa do tipo de contato (Lead ou Cliente).
 */
export const bulkUpdateContactTypeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      contactIds: z.array(z.string().uuid()).min(1),
      contactType: z.enum(["lead", "client"]),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    const { contactIds, contactType, companyId } = data;
    const userId = context?.userId || context?.user?.id;

    if (!userId) {
      throw new Error("Não autenticado ou sessão expirada.");
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      throw new Error("Perfil de usuário não encontrado.");
    }

    if (profile.role !== "super_admin" && profile.company_id !== companyId) {
      throw new Error("Acesso negado: você não pertence a esta empresa.");
    }

    const updates: Record<string, any> = {
      contact_type: contactType,
    };

    if (contactType === "client") {
      updates.became_client_at = new Date().toISOString();
    } else {
      updates.became_client_at = null;
    }

    const { error: updateErr, count } = await supabaseAdmin
      .from("contacts")
      .update(updates, { count: "exact" })
      .in("id", contactIds)
      .eq("company_id", companyId);

    if (updateErr) {
      throw new Error(`Erro na atualização em massa: ${updateErr.message}`);
    }

    return {
      success: true,
      updatedCount: count || contactIds.length,
      contactType,
    };
  });
