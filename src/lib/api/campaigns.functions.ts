/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeCampaignPhone } from "../campaign-template";
import { getPhoneVariants } from "../utils";
import { processCampaignsQueue } from "../server/campaign-processor";

/**
 * Valida acesso da empresa do usuário autenticado
 */
async function assertCompanyAccess(userId: string, companyId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .single();

  if (!profile || (profile.company_id !== companyId && profile.role !== "super_admin")) {
    throw new Error("Acesso negado: você não pertence a esta empresa.");
  }
}

/**
 * Listagem paginada de campanhas da empresa com estatísticas
 */
export const listCampaignsAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supabaseAdmin
      .from("campaigns")
      .select(
        `
        id,
        company_id,
        unit_id,
        created_by,
        name,
        description,
        status,
        audience_type,
        message_type,
        content,
        media_url,
        whatsapp_instance_ids,
        settings,
        scheduled_at,
        started_at,
        completed_at,
        stats,
        created_at,
        units(id, name),
        profiles:created_by(id, name)
      `,
        { count: "exact" },
      )
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.unitId && data.unitId !== "all") {
      query = query.eq("unit_id", data.unitId);
    }

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    if (data.search && data.search.trim()) {
      query = query.ilike("name", `%${data.search.trim()}%`);
    }

    const { data: campaigns, error, count } = await query;

    if (error) {
      throw new Error(`Erro ao listar campanhas: ${error.message}`);
    }

    return {
      campaigns: campaigns || [],
      total: count || 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * Detalhes de uma campanha específica
 */
export const getCampaignDetailsAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      campaignId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const { data: campaign, error } = await supabaseAdmin
      .from("campaigns")
      .select(
        `
        *,
        units(id, name),
        profiles:created_by(id, name)
      `,
      )
      .eq("id", data.campaignId)
      .eq("company_id", data.companyId)
      .single();

    if (error || !campaign) {
      throw new Error("Campanha não encontrada.");
    }

    // Busca detalhes das instâncias configuradas
    let instances: any[] = [];
    if (campaign.whatsapp_instance_ids && campaign.whatsapp_instance_ids.length > 0) {
      const { data: instData } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, name, instance_name, status, unit_id")
        .in("id", campaign.whatsapp_instance_ids);
      instances = instData || [];
    }

    // Busca variações cadastradas de mensagens da campanha
    const { data: messages } = await (supabaseAdmin.from("campaign_messages") as any)
      .select("*")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: true });

    return {
      campaign: {
        ...campaign,
        messages: messages || [],
      },
      instances,
    };
  });

/**
 * Listagem de destinatários paginada de uma campanha
 */
export const listCampaignRecipientsAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      campaignId: z.string().uuid(),
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }),
  )
  .handler(async ({ data }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = (supabaseAdmin.from("campaign_recipients") as any)
      .select(
        `
        *,
        campaign_messages (
          id,
          name,
          message_type
        )
      `,
        { count: "exact" },
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: recipients, error, count } = await query;

    if (error) {
      throw new Error(`Erro ao listar destinatários: ${error.message}`);
    }

    return {
      recipients: recipients || [],
      total: count || 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * Preview da contagem de audiência baseada em critérios da base
 */
export const previewAudienceCountAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      filters: z.object({
        inactivity_days: z.number().optional().nullable(),
        tags: z.array(z.string()).optional(),
        excluded_tags: z.array(z.string()).optional(),
        unit_ids: z.array(z.string().uuid()).optional(),
        only_without_open_conversations: z.boolean().optional(),
        contact_type: z.enum(["all", "lead", "client"]).optional().nullable(),
        sources: z.array(z.string()).optional(),
        ddds: z.array(z.string()).optional(),
        created_after: z.string().optional().nullable(),
        created_before: z.string().optional().nullable(),
      }),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const { data: count, error } = await supabaseAdmin.rpc("count_campaign_audience_contacts", {
      p_company_id: data.companyId,
      p_filters: data.filters,
    });

    if (error) {
      console.error("[campaigns] Erro no preview da audiência:", error);
      throw new Error(`Falha ao calcular audiência: ${error.message}`);
    }

    return { count: Number(count) || 0 };
  });

/**
 * Busca a lista detalhada de contatos da audiência segmentada para prévia / revisão
 */
export const previewAudienceContactsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      filters: z.object({
        inactivity_days: z.number().optional().nullable(),
        tags: z.array(z.string()).optional(),
        excluded_tags: z.array(z.string()).optional(),
        unit_ids: z.array(z.string().uuid()).optional(),
        only_without_open_conversations: z.boolean().optional(),
        contact_type: z.enum(["all", "lead", "client"]).optional().nullable(),
        sources: z.array(z.string()).optional(),
        ddds: z.array(z.string()).optional(),
        created_after: z.string().optional().nullable(),
        created_before: z.string().optional().nullable(),
      }),
      limit: z.number().default(500),
      offset: z.number().default(0),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const { data: contacts, error } = await supabaseAdmin.rpc("get_campaign_audience_contacts", {
      p_company_id: data.companyId,
      p_filters: data.filters,
      p_limit: data.limit,
      p_offset: data.offset,
    });

    if (error) {
      console.error("[campaigns] Erro ao buscar contatos da audiência:", error);
      throw new Error(`Falha ao carregar lista de contatos: ${error.message}`);
    }

    return { contacts: contacts || [] };
  });

/**
 * Criação e agendamento/disparo de uma nova campanha
 */
export const createCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
      name: z.string().min(2, "Nome da campanha muito curto"),
      description: z.string().optional(),
      audienceType: z.enum(["segment", "import"]),
      audienceFilters: z
        .object({
          inactivity_days: z.number().optional().nullable(),
          tags: z.array(z.string()).optional(),
          excluded_tags: z.array(z.string()).optional(),
          unit_ids: z.array(z.string().uuid()).optional(),
          only_without_open_conversations: z.boolean().optional(),
          contact_type: z.enum(["all", "lead", "client"]).optional().nullable(),
          sources: z.array(z.string()).optional(),
          ddds: z.array(z.string()).optional(),
          created_after: z.string().optional().nullable(),
          created_before: z.string().optional().nullable(),
        })
        .optional(),
      importedRecipients: z
        .array(
          z.object({
            phone: z.union([z.string(), z.number()]),
            name: z.string().optional().nullable(),
            unitId: z.string().uuid().optional().nullable(),
            customVariables: z.record(z.any()).optional(),
          }),
        )
        .optional(),
      saveImportedToContacts: z.boolean().optional(),
      messages: z
        .array(
          z.object({
            name: z.string().default("Variação 1"),
            messageType: z.enum(["text", "image", "video", "audio", "document"]).default("text"),
            content: z.string().min(1, "Mensagem não pode ser vazia"),
            mediaUrl: z.string().optional().nullable(),
            mediaName: z.string().optional().nullable(),
          }),
        )
        .optional(),
      messageType: z
        .enum(["text", "image", "video", "audio", "document"])
        .default("text")
        .optional(),
      content: z.string().optional(),
      mediaUrl: z.string().optional().nullable(),
      mediaName: z.string().optional().nullable(),
      whatsappInstanceIds: z.array(z.string().uuid()).min(1, "Selecione ao menos 1 instância"),
      settings: z
        .object({
          min_delay_seconds: z.number().default(25),
          max_delay_seconds: z.number().default(55),
          batch_size: z.number().default(20),
          batch_cooldown_seconds: z.number().default(180),
          allowed_start_time: z.string().default("08:00"),
          allowed_end_time: z.string().default("20:00"),
          allowed_days: z.array(z.number()).default([1, 2, 3, 4, 5, 6]),
        })
        .default({}),
      scheduledAt: z.string().nullable().optional(),
      startImmediately: z.boolean().default(true),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const isScheduled = !!data.scheduledAt && !data.startImmediately;
    const initialStatus = isScheduled ? "scheduled" : "running";
    const nowIso = new Date().toISOString();

    // Determina variações de mensagens
    const rawMessages =
      data.messages && data.messages.length > 0
        ? data.messages
        : [
            {
              name: "Variação 1",
              messageType: data.messageType || "text",
              content: data.content || "Olá!",
              mediaUrl: data.mediaUrl || null,
              mediaName: data.mediaName || null,
            },
          ];

    const primaryMessage = rawMessages[0];

    // 1. Cria a campanha no banco
    const { data: campaign, error: campErr } = await (supabaseAdmin.from("campaigns") as any)
      .insert({
        company_id: data.companyId,
        unit_id: data.unitId || null,
        created_by: context.userId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        status: initialStatus,
        audience_type: data.audienceType,
        audience_filters: data.audienceFilters || {},
        message_type: primaryMessage.messageType,
        content: primaryMessage.content,
        media_url: primaryMessage.mediaUrl || null,
        media_name: primaryMessage.mediaName || null,
        whatsapp_instance_ids: data.whatsappInstanceIds,
        settings: data.settings,
        scheduled_at: isScheduled ? new Date(data.scheduledAt!).toISOString() : null,
        started_at: isScheduled ? null : nowIso,
      })
      .select()
      .single();

    if (campErr || !campaign) {
      throw new Error(`Falha ao criar campanha: ${campErr?.message}`);
    }

    // 1.1 Insere todas as variações em campaign_messages
    const variationRows = rawMessages.map((m, idx) => ({
      campaign_id: campaign.id,
      company_id: data.companyId,
      name: m.name?.trim() || `Variação ${idx + 1}`,
      message_type: m.messageType,
      content: m.content,
      media_url: m.mediaUrl || null,
      media_name: m.mediaName || null,
      is_active: true,
    }));

    const { data: insertedMessages, error: msgErr } = await (
      supabaseAdmin.from("campaign_messages") as any
    )
      .insert(variationRows)
      .select("id, name, message_type");

    if (msgErr) {
      console.error("[campaigns] Erro ao cadastrar variações de mensagens:", msgErr);
    }

    const availableVariations: Array<{ id: string; name: string }> = insertedMessages || [];
    const variationCount = availableVariations.length;

    // 2. Popula os destinatários distribuindo entre as variações
    let totalAdded = 0;

    if (data.audienceType === "import") {
      const rows = data.importedRecipients || [];
      const cleanRecipients: any[] = [];
      const seenPhones = new Set<string>();

      for (const row of rows) {
        const sanitized = sanitizeCampaignPhone(row.phone);
        if (sanitized.valid && !seenPhones.has(sanitized.phone)) {
          seenPhones.add(sanitized.phone);
          const assignedVariation =
            variationCount > 0
              ? availableVariations[cleanRecipients.length % variationCount]
              : null;

          const targetUnitId =
            row.unitId || (data.unitId && data.unitId !== "all" ? data.unitId : null);

          cleanRecipients.push({
            campaign_id: campaign.id,
            company_id: data.companyId,
            unit_id: targetUnitId,
            phone: sanitized.phone,
            name: row.name?.trim() || null,
            custom_variables: row.customVariables || {},
            status: "pending",
            campaign_message_id: assignedVariation?.id || null,
          });
        }
      }

      if (cleanRecipients.length === 0) {
        // Se nenhum número foi válido, remove a campanha criada
        await supabaseAdmin.from("campaigns").delete().eq("id", campaign.id);
        throw new Error("Nenhum telefone válido encontrado na lista importada.");
      }

      // Se saveImportedToContacts = true, vincula e salva os contatos na base com a unidade
      if (data.saveImportedToContacts && cleanRecipients.length > 0) {
        for (const rec of cleanRecipients) {
          try {
            const phoneVariants = getPhoneVariants(rec.phone);
            const { data: existing } = await supabaseAdmin
              .from("contacts")
              .select("id, unit_id")
              .eq("company_id", data.companyId)
              .in("phone", phoneVariants)
              .limit(1)
              .maybeSingle();

            if (existing) {
              if (!existing.unit_id && rec.unit_id) {
                await supabaseAdmin
                  .from("contacts")
                  .update({ unit_id: rec.unit_id })
                  .eq("id", existing.id);
              }
              rec.contact_id = existing.id;
            } else {
              const { data: newCt } = await supabaseAdmin
                .from("contacts")
                .insert({
                  company_id: data.companyId,
                  unit_id: rec.unit_id,
                  name: rec.name || rec.phone,
                  phone: rec.phone,
                  tags: ["campanha", "importado"],
                })
                .select("id")
                .single();

              if (newCt) {
                rec.contact_id = newCt.id;
              }
            }
          } catch (ctErr) {
            console.error("[campaigns] Erro ao sincronizar contato importado com unidade:", ctErr);
          }
        }
      }

      // Inserção em lotes de 500 no banco
      const CHUNK_SIZE = 500;
      for (let i = 0; i < cleanRecipients.length; i += CHUNK_SIZE) {
        const chunk = cleanRecipients.slice(i, i + CHUNK_SIZE);
        const { error: insErr } = await supabaseAdmin.from("campaign_recipients").insert(chunk);
        if (insErr) {
          console.error("[campaigns] Erro ao inserir lote de destinatários:", insErr);
        }
      }
      totalAdded = cleanRecipients.length;
    } else {
      // Segmentação dinâmica da base
      const { data: contacts, error: segErr } = await supabaseAdmin.rpc(
        "get_campaign_audience_contacts",
        {
          p_company_id: data.companyId,
          p_filters: data.audienceFilters || {},
          p_limit: 10000,
          p_offset: 0,
        },
      );

      if (segErr || !contacts || contacts.length === 0) {
        await supabaseAdmin.from("campaigns").delete().eq("id", campaign.id);
        throw new Error("Nenhum contato encontrado para os filtros selecionados.");
      }

      const segmentRecipients: any[] = [];
      const seenPhones = new Set<string>();

      for (const ct of contacts) {
        const sanitized = sanitizeCampaignPhone(ct.phone);
        if (sanitized.valid && !seenPhones.has(sanitized.phone)) {
          seenPhones.add(sanitized.phone);
          const assignedVariation =
            variationCount > 0
              ? availableVariations[segmentRecipients.length % variationCount]
              : null;

          const targetUnitId =
            ct.unit_id || (data.unitId && data.unitId !== "all" ? data.unitId : null);

          segmentRecipients.push({
            campaign_id: campaign.id,
            company_id: data.companyId,
            unit_id: targetUnitId,
            contact_id: ct.id,
            phone: sanitized.phone,
            name: ct.name?.trim() || null,
            custom_variables: {},
            status: "pending",
            campaign_message_id: assignedVariation?.id || null,
          });
        }
      }

      const CHUNK_SIZE = 500;
      for (let i = 0; i < segmentRecipients.length; i += CHUNK_SIZE) {
        const chunk = segmentRecipients.slice(i, i + CHUNK_SIZE);
        await supabaseAdmin.from("campaign_recipients").insert(chunk);
      }
      totalAdded = segmentRecipients.length;
    }

    // 3. Atualiza estatísticas da campanha
    await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: campaign.id });

    // 4. Se configurado para iniciar imediatamente, engatilha o worker
    if (!isScheduled) {
      processCampaignsQueue().catch((e) =>
        console.error("[campaigns] Erro no processamento inicial da campanha:", e),
      );
    }

    return {
      success: true,
      campaignId: campaign.id,
      totalRecipients: totalAdded,
    };
  });

/**
 * Pausa uma campanha em execução
 */
export const pauseCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      campaignId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", data.campaignId)
      .eq("company_id", data.companyId);

    if (error) {
      throw new Error(`Falha ao pausar campanha: ${error.message}`);
    }

    return { success: true };
  });

/**
 * Retoma uma campanha pausada
 */
export const resumeCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      campaignId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", data.campaignId)
      .eq("company_id", data.companyId);

    if (error) {
      throw new Error(`Falha ao retomar campanha: ${error.message}`);
    }

    processCampaignsQueue().catch((e) =>
      console.error("[campaigns] Erro ao retomar fila da campanha:", e),
    );

    return { success: true };
  });

/**
 * Cancela uma campanha
 */
export const cancelCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      campaignId: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAccess(context.userId, data.companyId);

    const nowIso = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("id", data.campaignId)
      .eq("company_id", data.companyId);

    if (error) {
      throw new Error(`Falha ao cancelar campanha: ${error.message}`);
    }

    // Cancela os pendentes
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ status: "cancelled", updated_at: nowIso })
      .eq("campaign_id", data.campaignId)
      .eq("status", "pending");

    await supabaseAdmin.rpc("recalculate_campaign_stats", { p_campaign_id: data.campaignId });

    return { success: true };
  });
