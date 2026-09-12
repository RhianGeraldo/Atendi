/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const contactsTools: McpToolDefinition[] = [
  {
    name: "listar_contatos",
    description:
      "Lista ou pesquisa contatos/leads cadastrados no CRM da empresa, com suporte a busca por nome/telefone e filtro por unidade.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Termo de busca para pesquisar no nome, telefone ou email do contato.",
        },
        unidade_id: {
          type: "string",
          description:
            "Filtrar contatos vinculados a uma unidade específica. Opcional para chave Matriz.",
        },
        limite: {
          type: "number",
          description: "Quantidade máxima de contatos a retornar (padrão 20, máx 100).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const limit = Math.min(Math.max(Number(args?.limite) || 20, 1), 100);
      const targetUnitId = context.unitId || args?.unidade_id;

      let query = supabaseAdmin
        .from("contacts")
        .select(
          "id, name, phone, email, unit_id, profile_picture_url, is_blocked, created_at, units(name, slug)",
        )
        .eq("company_id", context.companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (targetUnitId) {
        query = query.eq("unit_id", targetUnitId);
      }

      if (args?.busca && typeof args.busca === "string" && args.busca.trim()) {
        const term = args.busca.trim();
        query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      }

      const { data: contacts, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar contatos: ${error.message}`);
      }

      return {
        total: contacts?.length || 0,
        contatos: contacts || [],
      };
    },
  },
  {
    name: "consultar_contato",
    description:
      "Obtém a ficha detalhada de um contato pelo ID ou pelo número de telefone (com histórico, tags e oportunidades).",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato no Atendi.",
        },
        telefone: {
          type: "string",
          description:
            "Número de telefone com DDD (ex: '5511999998888'). Usado caso contato_id não seja informado.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args?.contato_id;
      const phone = args?.telefone;

      if (!contactId && !phone) {
        throw new Error("Informe contato_id ou telefone para consultar o contato.");
      }

      let query = supabaseAdmin
        .from("contacts")
        .select("*, units(name, slug)")
        .eq("company_id", context.companyId);

      if (contactId) {
        query = query.eq("id", contactId);
      } else if (phone) {
        const cleanPhone = String(phone).replace(/\D/g, "");
        query = query.or(`phone.eq.${cleanPhone},phone.ilike.%${cleanPhone.slice(-8)}%`);
      }

      const { data: contact, error } = await query.maybeSingle();
      if (error || !contact) {
        throw new Error("Contato não encontrado.");
      }

      // Se a chave for restrita a uma unidade e o contato for de outra, validar
      if (context.unitId && contact.unit_id && contact.unit_id !== context.unitId) {
        throw new Error("Acesso negado: o contato pertence a outra filial.");
      }

      // Buscar oportunidades ativas vinculadas
      const { data: opps } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, value, status, stage_id, pipeline_stages(name), units(name)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false });

      // Buscar notas recentes
      const { data: notes } = await supabaseAdmin
        .from("contact_notes")
        .select("id, content, created_at, profiles(name)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
        .limit(10);

      return {
        contato: contact,
        oportunidades: opps || [],
        ultimas_notas: notes || [],
      };
    },
  },
  {
    name: "criar_contato",
    description:
      "Cadastra um novo contato/lead no CRM do Atendi, vinculando à unidade correspondente.",
    inputSchema: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome completo do contato.",
        },
        telefone: {
          type: "string",
          description: "Número de telefone com DDD (ex: '5511999998888').",
        },
        email: {
          type: "string",
          description: "Endereço de e-mail do contato (opcional).",
        },
        unidade_id: {
          type: "string",
          description:
            "ID (UUID) da unidade à qual o contato pertence. Se a chave for de filial, usa a filial da chave.",
        },
        observacoes: {
          type: "string",
          description: "Nota inicial sobre o contato (opcional).",
        },
      },
      required: ["nome", "telefone"],
    },
    handler: async (args: any, context: McpContext) => {
      const name = String(args.nome).trim();
      const rawPhone = String(args.telefone).replace(/\D/g, "");
      const email = args.email ? String(args.email).trim().toLowerCase() : null;
      const targetUnitId = context.unitId || args.unidade_id || null;

      if (!name || !rawPhone) {
        throw new Error("Nome e telefone são obrigatórios para criar um contato.");
      }

      // Verificar se já existe contato com esse telefone na empresa
      const { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone, unit_id")
        .eq("company_id", context.companyId)
        .eq("phone", rawPhone)
        .maybeSingle();

      if (existing) {
        return {
          sucesso: true,
          mensagem: `Contato já existia com o telefone ${rawPhone}. Retornando registro existente.`,
          contato: existing,
          ja_existia: true,
        };
      }

      const { data: created, error } = await supabaseAdmin
        .from("contacts")
        .insert({
          company_id: context.companyId,
          unit_id: targetUnitId,
          name,
          phone: rawPhone,
          email,
        })
        .select("*, units(name, slug)")
        .single();

      if (error || !created) {
        throw new Error(`Erro ao criar contato: ${error?.message}`);
      }

      if (args.observacoes && typeof args.observacoes === "string") {
        await supabaseAdmin.from("contact_notes").insert({
          contact_id: created.id,
          content: args.observacoes.trim(),
        });
      }

      return {
        sucesso: true,
        contato: created,
        ja_existia: false,
      };
    },
  },
  {
    name: "atualizar_contato",
    description:
      "Atualiza os dados de um contato existente (nome, telefone, email ou troca de unidade).",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato a atualizar.",
        },
        nome: {
          type: "string",
          description: "Novo nome do contato.",
        },
        telefone: {
          type: "string",
          description: "Novo telefone com DDD.",
        },
        email: {
          type: "string",
          description: "Novo email do contato.",
        },
        unidade_id: {
          type: "string",
          description: "Novo ID de unidade (apenas para chaves com visão Matriz).",
        },
      },
      required: ["contato_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args.contato_id;
      const updateData: any = {};

      if (args.nome) updateData.name = String(args.nome).trim();
      if (args.telefone) updateData.phone = String(args.telefone).replace(/\D/g, "");
      if (args.email !== undefined)
        updateData.email = args.email ? String(args.email).trim().toLowerCase() : null;
      if (args.unidade_id !== undefined && !context.unitId) updateData.unit_id = args.unidade_id;

      let query = supabaseAdmin
        .from("contacts")
        .update(updateData)
        .eq("id", contactId)
        .eq("company_id", context.companyId);

      if (context.unitId) {
        query = query.eq("unit_id", context.unitId);
      }

      const { data: updated, error } = await query.select("*, units(name, slug)").single();
      if (error || !updated) {
        throw new Error(
          `Erro ao atualizar contato: ${error?.message || "Contato não encontrado ou sem permissão"}`,
        );
      }

      return {
        sucesso: true,
        contato: updated,
      };
    },
  },
  {
    name: "adicionar_nota_contato",
    description: "Registra uma anotação interna no histórico do contato.",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato.",
        },
        nota: {
          type: "string",
          description: "Texto da anotação a ser registrada.",
        },
      },
      required: ["contato_id", "nota"],
    },
    handler: async (args: any, context: McpContext) => {
      const { data: note, error } = await supabaseAdmin
        .from("contact_notes")
        .insert({
          contact_id: args.contato_id,
          content: String(args.nota).trim(),
        })
        .select()
        .single();

      if (error || !note) {
        throw new Error(`Erro ao adicionar nota: ${error?.message}`);
      }

      return {
        sucesso: true,
        nota,
      };
    },
  },
  {
    name: "gerenciar_etiquetas_contato",
    description:
      "Gerencia etiquetas (tags) dos contatos: lista as etiquetas da empresa, adiciona uma etiqueta ao contato ou remove.",
    inputSchema: {
      type: "object",
      properties: {
        acao: {
          type: "string",
          enum: ["listar", "adicionar", "remover"],
          description:
            "Ação a executar: 'listar' (todas as etiquetas da empresa), 'adicionar' (atribuir etiqueta ao contato) ou 'remover' (remover etiqueta do contato).",
        },
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato. Obrigatório para 'adicionar' e 'remover'.",
        },
        etiqueta_id: {
          type: "string",
          description: "ID (UUID) da etiqueta a ser adicionada ou removida.",
        },
        etiqueta_nome: {
          type: "string",
          description:
            "Nome da etiqueta (usado para localizar ou criar caso 'etiqueta_id' não seja informado na ação 'adicionar').",
        },
      },
      required: ["acao"],
    },
    handler: async (args: any, context: McpContext) => {
      const { acao, contato_id, etiqueta_id, etiqueta_nome } = args;

      if (acao === "listar") {
        const { data: labels, error } = await supabaseAdmin
          .from("labels")
          .select("id, name, color")
          .eq("company_id", context.companyId)
          .order("name", { ascending: true });

        if (error) throw new Error(`Erro ao listar etiquetas: ${error.message}`);
        return { total: labels?.length || 0, etiquetas: labels || [] };
      }

      if (!contato_id) {
        throw new Error("Parâmetro 'contato_id' é obrigatório para adicionar ou remover etiqueta.");
      }

      // Validar se o contato pertence à empresa
      const { data: contact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, company_id")
        .eq("id", contato_id)
        .eq("company_id", context.companyId)
        .single();

      if (cErr || !contact) {
        throw new Error("Contato não encontrado ou acesso negado.");
      }

      let targetLabelId = etiqueta_id;

      if (!targetLabelId && etiqueta_nome) {
        // Buscar etiqueta por nome
        const { data: existing } = await supabaseAdmin
          .from("labels")
          .select("id")
          .eq("company_id", context.companyId)
          .ilike("name", etiqueta_nome.trim())
          .maybeSingle();

        if (existing) {
          targetLabelId = existing.id;
        } else if (acao === "adicionar") {
          // Criar nova etiqueta com cor aleatória
          const randomColor = `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, "0")}`;
          const { data: created, error: createErr } = await supabaseAdmin
            .from("labels")
            .insert({
              company_id: context.companyId,
              name: etiqueta_nome.trim(),
              color: randomColor,
              external_id: crypto.randomUUID(),
            })
            .select("id")
            .single();

          if (createErr || !created) {
            throw new Error(`Erro ao criar nova etiqueta: ${createErr?.message}`);
          }
          targetLabelId = created.id;
        }
      }

      if (!targetLabelId) {
        throw new Error("Informe 'etiqueta_id' ou 'etiqueta_nome'.");
      }

      if (acao === "adicionar") {
        const { error } = await supabaseAdmin
          .from("contact_labels")
          .upsert({ contact_id, label_id: targetLabelId }, { onConflict: "contact_id, label_id" });

        if (error) throw new Error(`Erro ao vincular etiqueta: ${error.message}`);
        return {
          sucesso: true,
          mensagem: "Etiqueta vinculada ao contato com sucesso!",
          contato_id,
          etiqueta_id: targetLabelId,
        };
      } else if (acao === "remover") {
        const { error } = await supabaseAdmin
          .from("contact_labels")
          .delete()
          .eq("contact_id", contact_id)
          .eq("label_id", targetLabelId);

        if (error) throw new Error(`Erro ao desvincular etiqueta: ${error.message}`);
        return {
          sucesso: true,
          mensagem: "Etiqueta removida do contato com sucesso!",
          contato_id,
          etiqueta_id: targetLabelId,
        };
      }

      throw new Error(`Ação inválida: ${acao}`);
    },
  },
  {
    name: "bloquear_contato",
    description:
      "Bloqueia um contato/lead no Atendi informando o motivo de bloqueio (ex: spam, fraude, agressividade).",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato a ser bloqueado.",
        },
        motivo: {
          type: "string",
          description: "Motivo do bloqueio do contato.",
        },
      },
      required: ["contato_id", "motivo"],
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args.contato_id;
      const reason = String(args.motivo).trim();

      const { data: contact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, company_id")
        .eq("id", contactId)
        .eq("company_id", context.companyId)
        .single();

      if (cErr || !contact) {
        throw new Error("Contato não encontrado ou acesso negado.");
      }

      const { error } = await supabaseAdmin
        .from("contacts")
        .update({
          is_blocked: true,
          block_reason: reason,
        })
        .eq("id", contactId);

      if (error) {
        throw new Error(`Erro ao bloquear contato: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Contato bloqueado com sucesso!",
        contato_id: contactId,
        motivo: reason,
      };
    },
  },
  {
    name: "desbloquear_contato",
    description: "Remove o bloqueio de um contato no Atendi, permitindo novas conversas.",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato a ser desbloqueado.",
        },
      },
      required: ["contato_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const contactId = args.contato_id;

      const { data: contact, error: cErr } = await supabaseAdmin
        .from("contacts")
        .select("id, company_id")
        .eq("id", contactId)
        .eq("company_id", context.companyId)
        .single();

      if (cErr || !contact) {
        throw new Error("Contato não encontrado ou acesso negado.");
      }

      const { error } = await supabaseAdmin
        .from("contacts")
        .update({
          is_blocked: false,
          block_reason: null,
        })
        .eq("id", contactId);

      if (error) {
        throw new Error(`Erro ao desbloquear contato: ${error.message}`);
      }

      return {
        sucesso: true,
        mensagem: "Contato desbloqueado com sucesso!",
        contato_id: contactId,
      };
    },
  },
];
