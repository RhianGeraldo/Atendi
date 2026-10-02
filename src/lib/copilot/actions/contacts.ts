/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CopilotAction, CopilotContext } from "../types";

const DEFAULT_CONTACT_SOURCES = [
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

export const contactsActions: CopilotAction[] = [
  // ─── Buscar contato ───────────────────────────────────────────────────────
  {
    name: "buscar_contato",
    label: "Pesquisar Contatos no CRM",
    description:
      "Pesquisa contatos/leads cadastrados pelo nome, número de telefone ou email. Retorna até 15 resultados, priorizando quem tem telefone preenchido. Para cada contato encontrado, também busca se há conversas abertas vinculadas a ele.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Nome, número de telefone ou email do contato para busca.",
        },
        unidade_nome: {
          type: "string",
          description:
            "Nome da unidade para priorizar na busca (ex: 'Serra', 'Linhares'). Opcional.",
        },
      },
      required: ["termo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const term = params.termo.trim();
      const termOnlyDigits = term.replace(/\D/g, "");
      const isDigitSearch = termOnlyDigits.length >= 4;

      const filters: string[] = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];

      // Variações fonéticas para nomes comuns (ex: Rian <-> Rhian <-> Ryan)
      const termLower = term.toLowerCase();
      if (termLower.includes("rian")) {
        filters.push(`name.ilike.%${term.replace(/rian/gi, "rhian")}%`);
        filters.push(`name.ilike.%${term.replace(/rian/gi, "ryan")}%`);
      } else if (termLower.includes("rhian")) {
        filters.push(`name.ilike.%${term.replace(/rhian/gi, "rian")}%`);
        filters.push(`name.ilike.%${term.replace(/rhian/gi, "ryan")}%`);
      } else if (termLower.includes("ryan")) {
        filters.push(`name.ilike.%${term.replace(/ryan/gi, "rhian")}%`);
        filters.push(`name.ilike.%${term.replace(/ryan/gi, "rian")}%`);
      }

      if (isDigitSearch) {
        // Busca com prioridade para quem termina com os dígitos (ex: final 9987)
        filters.push(`phone.ilike.%${termOnlyDigits}`);
        filters.push(`phone.ilike.%${termOnlyDigits}%`);
        if (termOnlyDigits.length >= 8) {
          filters.push(`phone.ilike.%${termOnlyDigits.slice(-8)}%`);
        }
      } else {
        filters.push(`phone.ilike.%${term}%`);
      }

      const orFilter = Array.from(new Set(filters)).join(",");

      const { data: allContacts, error } = await supabaseAdmin
        .from("contacts")
        .select(
          "id, name, phone, email, source, is_blocked, unit_id, merged_into_id, unit:units(id, name)",
        )
        .eq("company_id", context.companyId)
        .or(orFilter)
        .limit(60);

      if (error) return { success: false, message: `Erro ao buscar contato: ${error.message}` };

      const contacts = allContacts || [];

      // Resolver telefone de contatos mesclados (merged_into_id) se o registro atual estiver sem telefone
      const mergedIds = contacts
        .filter((c: any) => !c.phone && c.merged_into_id)
        .map((c: any) => c.merged_into_id);

      if (mergedIds.length > 0) {
        const { data: parents } = await supabaseAdmin
          .from("contacts")
          .select("id, phone, email")
          .in("id", mergedIds);

        const parentMap = new Map((parents || []).map((p: any) => [p.id, p]));
        for (const c of contacts) {
          if (!c.phone && c.merged_into_id && parentMap.has(c.merged_into_id)) {
            const parent = parentMap.get(c.merged_into_id);
            if (parent?.phone) c.phone = parent.phone;
            if (!c.email && parent?.email) c.email = parent.email;
          }
        }
      }

      const unitNome = (params.unidade_nome || "").toLowerCase();

      contacts.sort((a: any, b: any) => {
        // Se a busca foi por dígitos (ex: final 9987), priorizar quem termina exatamente com eles
        if (isDigitSearch) {
          const aPhone = String(a.phone || "").replace(/\D/g, "");
          const bPhone = String(b.phone || "").replace(/\D/g, "");
          const aEnds = aPhone.endsWith(termOnlyDigits)
            ? 2
            : aPhone.includes(termOnlyDigits)
              ? 1
              : 0;
          const bEnds = bPhone.endsWith(termOnlyDigits)
            ? 2
            : bPhone.includes(termOnlyDigits)
              ? 1
              : 0;
          if (bEnds !== aEnds) return bEnds - aEnds;
        }

        const aHasPhone = a.phone ? 1 : 0;
        const bHasPhone = b.phone ? 1 : 0;
        if (bHasPhone !== aHasPhone) return bHasPhone - aHasPhone;
        if (unitNome) {
          const aUnit = ((a.unit as any)?.name || "").toLowerCase();
          const bUnit = ((b.unit as any)?.name || "").toLowerCase();
          const aMatch = aUnit.includes(unitNome) ? 1 : 0;
          const bMatch = bUnit.includes(unitNome) ? 1 : 0;
          if (bMatch !== aMatch) return bMatch - aMatch;
        }
        return 0;
      });

      const top = contacts.slice(0, 15);
      const contactIds = top.map((c: any) => c.id);
      const conversasPorContato: Record<string, any[]> = {};

      if (contactIds.length > 0) {
        const { data: convs } = await supabaseAdmin
          .from("conversations")
          .select(
            "id, status, channel, whatsapp_instance_id, contact_id, unit:units(name), instance:whatsapp_instances(name, instance_name)",
          )
          .in("contact_id", contactIds)
          .in("status", ["active", "waiting"])
          .order("last_message_at", { ascending: false })
          .limit(30);

        for (const c of convs || []) {
          if (!conversasPorContato[c.contact_id]) conversasPorContato[c.contact_id] = [];
          conversasPorContato[c.contact_id].push(c);
        }
      }

      const result = top.map((c: any) => ({
        id: c.id,
        nome: c.name,
        telefone: c.phone || null,
        email: c.email || null,
        fonte: c.source,
        bloqueado: c.is_blocked,
        unidade: (c.unit as any)?.name || null,
        tem_telefone: !!c.phone,
        conversas_abertas: conversasPorContato[c.id] || [],
      }));

      return {
        success: true,
        message: `${result.length} contato(s) encontrado(s)${unitNome ? ` (priorizando unidade "${params.unidade_nome}")` : ""}.`,
        data: result,
      };
    },
  },

  // ─── Consultar ficha completa ─────────────────────────────────────────────
  {
    name: "consultar_contato",
    label: "Consultar Ficha Completa do Contato",
    description:
      "Obtém a ficha detalhada de um contato pelo ID ou telefone: dados cadastrais, oportunidades ativas no CRM, notas internas e conversas recentes.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID (UUID) do contato." },
        telefone: {
          type: "string",
          description: "Número de telefone (usado se contato_id não for informado).",
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      if (!params.contato_id && !params.telefone) {
        return { success: false, message: "Informe contato_id ou telefone." };
      }

      let query = supabaseAdmin
        .from("contacts")
        .select("*, unit:units(name)")
        .eq("company_id", context.companyId);

      if (params.contato_id) {
        query = query.eq("id", params.contato_id);
      } else {
        const clean = String(params.telefone).replace(/\D/g, "");
        query = query.or(`phone.eq.${clean},phone.ilike.%${clean.slice(-8)}%`);
      }

      const { data: contact, error } = await query.maybeSingle();
      if (error || !contact) return { success: false, message: "Contato não encontrado." };

      const [oppsRes, notesRes, convsRes] = await Promise.all([
        supabaseAdmin
          .from("opportunities")
          .select("id, title, value, status, pipeline_stages(name)")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("contact_notes")
          .select("id, content, created_at")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("conversations")
          .select("id, status, channel, last_message_at, unit:units(name)")
          .eq("contact_id", contact.id)
          .order("last_message_at", { ascending: false })
          .limit(5),
      ]);

      return {
        success: true,
        message: `Ficha de ${contact.name} carregada.`,
        data: {
          contato: {
            id: contact.id,
            nome: contact.name,
            telefone: contact.phone,
            email: contact.email,
            origem: contact.source,
            unidade: (contact.unit as any)?.name || null,
            bloqueado: contact.is_blocked,
            criado_em: contact.created_at,
          },
          oportunidades: oppsRes.data || [],
          notas_recentes: notesRes.data || [],
          conversas_recentes: convsRes.data || [],
        },
      };
    },
  },

  // ─── Criar contato ────────────────────────────────────────────────────────
  {
    name: "criar_contato",
    label: "Cadastrar Novo Contato",
    description:
      "Cadastra um novo contato/lead no CRM. Verifica duplicidade por telefone antes de criar. Campos: nome (obrigatório), telefone (obrigatório), email, origem (ex: Instagram, Site, Indicação), unidade_id.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo do contato." },
        telefone: {
          type: "string",
          description: "Número de telefone com DDD (ex: 5527999998888).",
        },
        email: { type: "string", description: "E-mail do contato (opcional)." },
        origem: {
          type: "string",
          description:
            "Canal de captação: Instagram, WhatsApp direto, Site, Indicação, Meta Ads, Google Ads, Prospecção Ativa, Presencial / Balcão, Outros.",
        },
        unidade_id: { type: "string", description: "ID da unidade (opcional)." },
        observacao: { type: "string", description: "Nota inicial sobre o contato (opcional)." },
      },
      required: ["nome", "telefone"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const name = String(params.nome).trim();
      const rawPhone = String(params.telefone).replace(/\D/g, "");
      const email = params.email ? String(params.email).trim().toLowerCase() : null;
      const source = params.origem ? String(params.origem).trim() : null;
      const unitId = params.unidade_id || null;

      // Verificar duplicidade
      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone")
        .eq("company_id", context.companyId)
        .eq("phone", rawPhone)
        .maybeSingle();

      if (existing) {
        return {
          success: true,
          message: `Contato já existia com o telefone ${rawPhone} (${existing.name}). Retornando registro existente.`,
          data: { ...existing, ja_existia: true },
        };
      }

      const { data: created, error } = await supabaseAdmin
        .from("contacts")
        .insert({
          company_id: context.companyId,
          unit_id: unitId,
          name,
          phone: rawPhone,
          email,
          source,
        })
        .select("id, name, phone, email, source")
        .single();

      if (error || !created)
        return { success: false, message: `Erro ao criar contato: ${error?.message}` };

      if (params.observacao) {
        await supabaseAdmin.from("contact_notes").insert({
          contact_id: created.id,
          user_id: context.userId,
          content: String(params.observacao).trim(),
        });
      }

      return {
        success: true,
        message: `Contato "${created.name}" cadastrado com sucesso! (ID: ${created.id})`,
        data: { ...created, ja_existia: false },
      };
    },
  },

  // ─── Atualizar contato ────────────────────────────────────────────────────
  {
    name: "atualizar_contato",
    label: "Atualizar Dados do Contato",
    description:
      "Atualiza os dados de um contato existente: nome, telefone, email ou canal de origem. Informe apenas os campos que deseja alterar.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID (UUID) do contato a atualizar." },
        nome: { type: "string", description: "Novo nome do contato." },
        telefone: { type: "string", description: "Novo telefone com DDD." },
        email: { type: "string", description: "Novo e-mail." },
        origem: { type: "string", description: "Novo canal de origem." },
      },
      required: ["contato_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const updateData: any = {};
      if (params.nome) updateData.name = String(params.nome).trim();
      if (params.telefone) updateData.phone = String(params.telefone).replace(/\D/g, "");
      if (params.email !== undefined)
        updateData.email = params.email ? String(params.email).trim().toLowerCase() : null;
      if (params.origem !== undefined)
        updateData.source = params.origem ? String(params.origem).trim() : null;

      if (Object.keys(updateData).length === 0) {
        return { success: false, message: "Nenhum campo para atualizar foi informado." };
      }

      const { data: updated, error } = await supabaseAdmin
        .from("contacts")
        .update(updateData)
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .select("id, name, phone, email, source")
        .single();

      if (error || !updated) {
        return {
          success: false,
          message: `Erro ao atualizar: ${error?.message || "Contato não encontrado."}`,
        };
      }

      return {
        success: true,
        message: `Contato "${updated.name}" atualizado com sucesso!`,
        data: updated,
      };
    },
  },

  // ─── Adicionar nota interna ───────────────────────────────────────────────
  {
    name: "adicionar_nota_contato",
    label: "Adicionar Nota Interna no Contato",
    description: "Registra uma anotação interna ou observação privada no histórico de um contato.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID do contato." },
        nota: { type: "string", description: "Texto da anotação/observação." },
      },
      required: ["contato_id", "nota"],
    },
    execute: async (params: any, context: CopilotContext) => {
      // Verificar que o contato pertence à empresa
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .maybeSingle();

      if (!contact) return { success: false, message: "Contato não encontrado ou sem acesso." };

      const { data: note, error } = await supabaseAdmin
        .from("contact_notes")
        .insert({
          contact_id: params.contato_id,
          user_id: context.userId,
          content: params.nota.trim(),
        })
        .select("id, content, created_at")
        .single();

      if (error) return { success: false, message: `Erro ao adicionar nota: ${error.message}` };

      return {
        success: true,
        message: `Nota adicionada com sucesso ao contato ${contact.name}!`,
        data: note,
      };
    },
  },

  // ─── Gerenciar etiquetas ──────────────────────────────────────────────────
  {
    name: "gerenciar_etiquetas_contato",
    label: "Gerenciar Etiquetas do Contato",
    description:
      "Gerencia as etiquetas (tags) de um contato: lista todas as etiquetas da empresa, adiciona uma etiqueta ao contato ou remove.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        acao: {
          type: "string",
          enum: ["listar", "adicionar", "remover"],
          description: "Ação: 'listar' (etiquetas da empresa), 'adicionar' ou 'remover'.",
        },
        contato_id: {
          type: "string",
          description: "ID do contato (obrigatório para adicionar/remover).",
        },
        etiqueta_nome: { type: "string", description: "Nome da etiqueta." },
        etiqueta_id: { type: "string", description: "ID da etiqueta (alternativa ao nome)." },
      },
      required: ["acao"],
    },
    execute: async (params: any, context: CopilotContext) => {
      if (params.acao === "listar") {
        const { data: labels, error } = await supabaseAdmin
          .from("labels")
          .select("id, name, color")
          .eq("company_id", context.companyId)
          .order("name", { ascending: true });

        if (error) return { success: false, message: `Erro: ${error.message}` };
        return {
          success: true,
          message: `${labels?.length || 0} etiqueta(s) encontrada(s).`,
          data: labels || [],
        };
      }

      if (!params.contato_id) {
        return {
          success: false,
          message: "contato_id é obrigatório para adicionar/remover etiqueta.",
        };
      }

      // Validar contato
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .maybeSingle();

      if (!contact) return { success: false, message: "Contato não encontrado." };

      let labelId = params.etiqueta_id;

      if (!labelId && params.etiqueta_nome) {
        const { data: existing } = await supabaseAdmin
          .from("labels")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", params.etiqueta_nome.trim())
          .maybeSingle();

        if (existing) {
          labelId = existing.id;
        } else if (params.acao === "adicionar") {
          const randomColor = `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, "0")}`;
          const { data: newLabel, error: labelErr } = await supabaseAdmin
            .from("labels")
            .insert({
              company_id: context.companyId,
              name: params.etiqueta_nome.trim(),
              color: randomColor,
              external_id: crypto.randomUUID(),
            })
            .select("id")
            .single();
          if (labelErr || !newLabel)
            return { success: false, message: `Erro ao criar etiqueta: ${labelErr?.message}` };
          labelId = newLabel.id;
        }
      }

      if (!labelId) return { success: false, message: "Informe etiqueta_id ou etiqueta_nome." };

      if (params.acao === "adicionar") {
        const { error } = await supabaseAdmin
          .from("contact_labels")
          .upsert(
            { contact_id: params.contato_id, label_id: labelId },
            { onConflict: "contact_id, label_id" },
          );
        if (error)
          return { success: false, message: `Erro ao vincular etiqueta: ${error.message}` };
        return { success: true, message: "Etiqueta adicionada ao contato com sucesso! 🏷️" };
      }

      if (params.acao === "remover") {
        const { error } = await supabaseAdmin
          .from("contact_labels")
          .delete()
          .eq("contact_id", params.contato_id)
          .eq("label_id", labelId);
        if (error) return { success: false, message: `Erro ao remover etiqueta: ${error.message}` };
        return { success: true, message: "Etiqueta removida do contato." };
      }

      return { success: false, message: `Ação inválida: ${params.acao}` };
    },
  },

  // ─── Bloquear contato ─────────────────────────────────────────────────────
  {
    name: "bloquear_contato",
    label: "Bloquear Contato",
    description:
      "Bloqueia um contato informando o motivo (ex: spam, fraude, comportamento inadequado).",
    minRole: "manager",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID do contato a bloquear." },
        motivo: { type: "string", description: "Motivo do bloqueio." },
      },
      required: ["contato_id", "motivo"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .maybeSingle();

      if (!contact) return { success: false, message: "Contato não encontrado." };

      const { error } = await supabaseAdmin
        .from("contacts")
        .update({ is_blocked: true, block_reason: String(params.motivo).trim() })
        .eq("id", params.contato_id);

      if (error) return { success: false, message: `Erro ao bloquear: ${error.message}` };

      return {
        success: true,
        message: `Contato "${contact.name}" bloqueado com sucesso. Motivo: ${params.motivo}`,
      };
    },
  },

  // ─── Desbloquear contato ──────────────────────────────────────────────────
  {
    name: "desbloquear_contato",
    label: "Desbloquear Contato",
    description:
      "Remove o bloqueio de um contato, permitindo que ele receba atendimentos novamente.",
    minRole: "manager",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        contato_id: { type: "string", description: "ID do contato a desbloquear." },
      },
      required: ["contato_id"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .eq("id", params.contato_id)
        .eq("company_id", context.companyId)
        .maybeSingle();

      if (!contact) return { success: false, message: "Contato não encontrado." };

      const { error } = await supabaseAdmin
        .from("contacts")
        .update({ is_blocked: false, block_reason: null })
        .eq("id", params.contato_id);

      if (error) return { success: false, message: `Erro ao desbloquear: ${error.message}` };

      return {
        success: true,
        message: `Contato "${contact.name}" desbloqueado com sucesso! ✅`,
      };
    },
  },

  // ─── Listar origens de contato ────────────────────────────────────────────
  {
    name: "listar_origens_contato",
    label: "Listar Origens de Contato",
    description:
      "Lista todos os canais e fontes de captação de contatos homologados para a empresa (ex: WhatsApp direto, Instagram, Site, Indicação, Meta Ads, Google Ads).",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: any, context: CopilotContext) => {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      const customVars = (comp?.custom_variables as Record<string, any>) || {};
      const sources: string[] =
        Array.isArray(customVars.contact_sources) && customVars.contact_sources.length > 0
          ? customVars.contact_sources
          : DEFAULT_CONTACT_SOURCES;

      return {
        success: true,
        message: `${sources.length} origem(ns) de captação homologada(s) para a empresa.`,
        data: {
          empresa: context.companyName,
          total: sources.length,
          origens: sources,
        },
      };
    },
  },

  // ─── Gerenciar origens de contato ─────────────────────────────────────────
  {
    name: "gerenciar_origens_contato",
    label: "Gerenciar Origens de Contato",
    description:
      "Cadastra uma nova origem/canal de captação de leads na empresa ou remove uma origem existente. Exclusivo para administradores.",
    minRole: "admin_company",
    requiredMenu: "settings",
    parameters: {
      type: "object",
      properties: {
        acao: {
          type: "string",
          enum: ["adicionar", "remover"],
          description:
            "Ação a executar: 'adicionar' (adiciona nova origem) ou 'remover' (exclui da lista).",
        },
        origem: {
          type: "string",
          description:
            "Nome do canal/origem (ex: 'TikTok Ads', 'Evento Presencial', 'Parceria Clínica X').",
        },
      },
      required: ["acao", "origem"],
    },
    execute: async (params: any, context: CopilotContext) => {
      const action = params.acao;
      const sourceName = String(params.origem).trim();

      if (!sourceName) {
        return { success: false, message: "O nome da origem não pode ser vazio." };
      }

      const { data: comp, error: fetchErr } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      if (fetchErr || !comp) {
        return { success: false, message: "Empresa não encontrada." };
      }

      const customVars = (comp.custom_variables as Record<string, any>) || {};
      let currentSources: string[] = Array.isArray(customVars.contact_sources)
        ? [...customVars.contact_sources]
        : [...DEFAULT_CONTACT_SOURCES];

      if (action === "adicionar") {
        if (!currentSources.some((s) => s.toLowerCase() === sourceName.toLowerCase())) {
          currentSources.push(sourceName);
        }
      } else if (action === "remover") {
        currentSources = currentSources.filter((s) => s.toLowerCase() !== sourceName.toLowerCase());
      } else {
        return { success: false, message: `Ação inválida: ${action}` };
      }

      const { error: updErr } = await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...customVars,
            contact_sources: currentSources,
            contact_sources_migrated_v2: true,
          },
        })
        .eq("id", context.companyId);

      if (updErr) {
        return { success: false, message: `Erro ao salvar origens: ${updErr.message}` };
      }

      return {
        success: true,
        message:
          action === "adicionar"
            ? `Origem "${sourceName}" adicionada com sucesso!`
            : `Origem "${sourceName}" removida com sucesso!`,
        data: { origens_atualizadas: currentSources },
      };
    },
  },

  // ─── Listar contatos (compatibilidade MCP) ────────────────────────────────
  {
    name: "listar_contatos",
    label: "Listar Contatos Cadastrados",
    description:
      "Lista ou pesquisa contatos/leads cadastrados no CRM da empresa, com suporte a busca textual, filtro por canal de origem e filtro por filial.",
    minRole: "agent",
    requiredMenu: "contacts",
    parameters: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Termo de busca para pesquisar no nome, telefone ou email do contato.",
        },
        origem: {
          type: "string",
          description:
            "Filtrar por canal/origem de captação do contato (ex: 'Instagram', 'Meta Ads', 'WhatsApp direto', 'Site', 'Indicação').",
        },
        unidade_nome: {
          type: "string",
          description: "Filtrar por nome da unidade específica.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de contatos a retornar (padrão 20, máx 100).",
          default: 20,
        },
      },
    },
    execute: async (params: any, context: CopilotContext) => {
      const limit = Math.min(Math.max(Number(params?.limite) || 20, 1), 100);

      let query = supabaseAdmin
        .from("contacts")
        .select(
          "id, name, phone, email, source, source_details, unit_id, profile_picture_url, is_blocked, created_at, units(name, slug)",
        )
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (params?.unidade_nome) {
        const { data: u } = await supabaseAdmin
          .from("units")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", `%${params.unidade_nome}%`)
          .maybeSingle();
        if (u) query = query.eq("unit_id", u.id);
      } else if (context.unitId && !context.hasMatrizAccess) {
        query = query.eq("unit_id", context.unitId);
      }

      if (params?.origem && typeof params.origem === "string" && params.origem.trim()) {
        query = query.ilike("source", `%${params.origem.trim()}%`);
      }

      if (params?.busca && typeof params.busca === "string" && params.busca.trim()) {
        const term = params.busca.trim();
        query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      }

      const { data: contacts, error } = await query;
      if (error) {
        return { success: false, message: `Erro ao listar contatos: ${error.message}` };
      }

      return {
        success: true,
        message: `${contacts?.length || 0} contato(s) encontrado(s).`,
        data: {
          total: contacts?.length || 0,
          contatos: (contacts || []).map((c: any) => ({
            ...c,
            origem: c.source || null,
            detalhes_origem: c.source_details || null,
          })),
        },
      };
    },
  },
];
