/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const INITIAL_CONTACT_SOURCES = [
  "WhatsApp direto",
  "Instagram",
  "Site",
  "Indicação",
  "Google Ads",
  "Meta Ads",
  "Tráfego Pago",
  "Prospecção Ativa",
  "Presencial / Balcão",
  "Outros",
];

// Alias para manter compatibilidade
export const DEFAULT_CONTACT_SOURCES = INITIAL_CONTACT_SOURCES;

/**
 * 1. Obtém as origens de contato configuradas da empresa.
 * Se a empresa ainda não tiver migrado ou configurado, inicializa com as sugestões padrão na base da empresa.
 */
export const getCompanyContactSourcesAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: comp, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !comp) {
      return [];
    }

    const customVars = (comp.custom_variables as Record<string, any>) || {};

    // Se ainda não tiver migrado para a versão totalmente customizável, inicializa a lista na empresa
    if (!customVars.contact_sources_migrated_v2) {
      const existing = Array.isArray(customVars.contact_sources) ? customVars.contact_sources : [];
      const combined = [...INITIAL_CONTACT_SOURCES];
      for (const s of existing) {
        if (!combined.some((item) => item.toLowerCase() === s.toLowerCase())) {
          combined.push(s);
        }
      }

      await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...customVars,
            contact_sources: combined,
            contact_sources_migrated_v2: true,
          },
        })
        .eq("id", companyId);

      return combined;
    }

    return (customVars.contact_sources as string[]) || [];
  });

/**
 * 2. Adiciona uma nova origem à empresa
 */
export const addCompanyContactSourceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      source: z.string().min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, source } = data;
    const trimmed = source.trim();
    if (!trimmed) return { success: false, sources: [] };

    const { data: comp, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !comp) {
      throw new Error("Empresa não encontrada.");
    }

    const customVars = (comp.custom_variables as Record<string, any>) || {};
    let currentSources = Array.isArray(customVars.contact_sources) ? [...customVars.contact_sources] : [];

    if (!customVars.contact_sources_migrated_v2) {
      const combined = [...INITIAL_CONTACT_SOURCES];
      for (const s of currentSources) {
        if (!combined.some((item) => item.toLowerCase() === s.toLowerCase())) {
          combined.push(s);
        }
      }
      currentSources = combined;
    }

    if (!currentSources.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      currentSources.push(trimmed);
    }

    const updatedVars = { 
      ...customVars, 
      contact_sources: currentSources,
      contact_sources_migrated_v2: true,
    };
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ custom_variables: updatedVars })
      .eq("id", companyId);

    if (updateError) throw updateError;

    return { success: true, sources: currentSources };
  });

/**
 * 3. Remove uma origem da empresa (com opção de desvincular contatos existentes)
 */
export const removeCompanyContactSourceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      source: z.string(),
      clearContacts: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, source, clearContacts } = data;

    const { data: comp, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !comp) {
      throw new Error("Empresa não encontrada.");
    }

    const customVars = (comp.custom_variables as Record<string, any>) || {};
    let currentSources = Array.isArray(customVars.contact_sources) ? [...customVars.contact_sources] : [];

    if (!customVars.contact_sources_migrated_v2) {
      const combined = [...INITIAL_CONTACT_SOURCES];
      for (const s of currentSources) {
        if (!combined.some((item) => item.toLowerCase() === s.toLowerCase())) {
          combined.push(s);
        }
      }
      currentSources = combined;
    }

    const filtered = currentSources.filter((s) => s.toLowerCase() !== source.toLowerCase());

    const updatedVars = { 
      ...customVars, 
      contact_sources: filtered,
      contact_sources_migrated_v2: true,
    };

    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ custom_variables: updatedVars })
      .eq("id", companyId);

    if (updateError) throw updateError;

    if (clearContacts) {
      await supabaseAdmin
        .from("contacts")
        .update({ source: null })
        .eq("company_id", companyId)
        .ilike("source", source);
    }

    return { success: true, sources: filtered };
  });

/**
 * 4. Atualiza a origem e detalhes de um contato
 */
export const updateContactSourceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      contactId: z.string().uuid(),
      source: z.string().nullable().optional(),
      source_details: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { contactId, source, source_details } = data;

    const updatePayload: Record<string, any> = {};
    if (source !== undefined) updatePayload.source = source && source.trim() ? source.trim() : null;
    if (source_details !== undefined) updatePayload.source_details = source_details && source_details.trim() ? source_details.trim() : null;

    const { error } = await supabaseAdmin
      .from("contacts")
      .update(updatePayload)
      .eq("id", contactId);

    if (error) throw error;
    return { success: true };
  });

/**
 * 5. Renomeia qualquer origem da empresa e opcionalmente atualiza todos os contatos associados
 */
export const renameCompanyContactSourceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      oldSource: z.string(),
      newSource: z.string().min(1).max(100),
      updateContacts: z.boolean().optional().default(true),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId, oldSource, newSource, updateContacts } = data;
    const trimmedNew = newSource.trim();

    const { data: comp, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !comp) {
      throw new Error("Empresa não encontrada.");
    }

    const customVars = (comp.custom_variables as Record<string, any>) || {};
    let currentSources = Array.isArray(customVars.contact_sources) ? [...customVars.contact_sources] : [];

    if (!customVars.contact_sources_migrated_v2) {
      const combined = [...INITIAL_CONTACT_SOURCES];
      for (const s of currentSources) {
        if (!combined.some((item) => item.toLowerCase() === s.toLowerCase())) {
          combined.push(s);
        }
      }
      currentSources = combined;
    }

    const updatedSources = currentSources.map((s) =>
      s.toLowerCase() === oldSource.toLowerCase() ? trimmedNew : s
    );
    if (!updatedSources.some((s) => s.toLowerCase() === trimmedNew.toLowerCase())) {
      updatedSources.push(trimmedNew);
    }

    const updatedVars = { 
      ...customVars, 
      contact_sources: updatedSources,
      contact_sources_migrated_v2: true,
    };
    await supabaseAdmin
      .from("companies")
      .update({ custom_variables: updatedVars })
      .eq("id", companyId);

    if (updateContacts) {
      await supabaseAdmin
        .from("contacts")
        .update({ source: trimmedNew })
        .eq("company_id", companyId)
        .ilike("source", oldSource);
    }

    return { success: true, sources: updatedSources };
  });

/**
 * 6. Restaura as sugestões iniciais de origens para a empresa
 */
export const resetCompanyContactSourcesAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: comp, error } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    if (error || !comp) {
      throw new Error("Empresa não encontrada.");
    }

    const customVars = (comp.custom_variables as Record<string, any>) || {};
    const updatedVars = { 
      ...customVars, 
      contact_sources: [...INITIAL_CONTACT_SOURCES],
      contact_sources_migrated_v2: true,
    };

    await supabaseAdmin
      .from("companies")
      .update({ custom_variables: updatedVars })
      .eq("id", companyId);

    return { success: true, sources: INITIAL_CONTACT_SOURCES };
  });

/**
 * 7. Obtém todas as origens configuradas da empresa com contagem estatística de contatos
 */
export const getSourcesWithStatsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { companyId } = data;

    const { data: comp } = await supabaseAdmin
      .from("companies")
      .select("custom_variables")
      .eq("id", companyId)
      .single();

    const customVars = (comp?.custom_variables as Record<string, any>) || {};
    let sources: string[] = [];

    if (!customVars.contact_sources_migrated_v2) {
      const existing = Array.isArray(customVars.contact_sources) ? customVars.contact_sources : [];
      const combined = [...INITIAL_CONTACT_SOURCES];
      for (const s of existing) {
        if (!combined.some((item) => item.toLowerCase() === s.toLowerCase())) {
          combined.push(s);
        }
      }
      sources = combined;
      await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...customVars,
            contact_sources: sources,
            contact_sources_migrated_v2: true,
          },
        })
        .eq("id", companyId);
    } else {
      sources = Array.isArray(customVars.contact_sources) ? customVars.contact_sources : [];
    }

    // Consulta contatos para calcular a contagem por origem
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("source")
      .eq("company_id", companyId)
      .not("source", "is", null);

    const counts: Record<string, number> = {};
    (contacts || []).forEach((c) => {
      if (c.source) {
        const key = c.source.trim();
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    const result = sources.map((name) => {
      let count = 0;
      Object.entries(counts).forEach(([s, cnt]) => {
        if (s.toLowerCase() === name.toLowerCase()) {
          count += cnt;
        }
      });
      return {
        name,
        count,
      };
    });

    // Se houver contatos com origens que não estão na lista configurada, exibe-as para gerenciamento
    Object.keys(counts).forEach((orphanSrc) => {
      if (!sources.some((s) => s.toLowerCase() === orphanSrc.toLowerCase())) {
        let count = 0;
        Object.entries(counts).forEach(([s, cnt]) => {
          if (s.toLowerCase() === orphanSrc.toLowerCase()) {
            count += cnt;
          }
        });
        result.push({
          name: orphanSrc,
          count,
        });
      }
    });

    return result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });
