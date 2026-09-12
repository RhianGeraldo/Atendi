import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

export const contactsTools: McpToolDefinition[] = [
  {
    name: "listar_contatos",
    description: "Lista ou pesquisa contatos/leads cadastrados no CRM da empresa, com suporte a busca por nome/telefone e filtro por unidade.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Termo de busca para pesquisar no nome, telefone ou email do contato.",
        },
        unidade_id: {
          type: "string",
          description: "Filtrar contatos vinculados a uma unidade específica. Opcional para chave Matriz.",
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
        .select("id, name, phone, email, unit_id, profile_picture_url, is_blocked, created_at, units(name, slug)")
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
    description: "Obtém a ficha detalhada de um contato pelo ID ou pelo número de telefone (com histórico, tags e oportunidades).",
    inputSchema: {
      type: "object",
      properties: {
        contato_id: {
          type: "string",
          description: "ID (UUID) do contato no Atendi.",
        },
        telefone: {
          type: "string",
          description: "Número de telefone com DDD (ex: '5511999998888'). Usado caso contato_id não seja informado.",
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
    description: "Cadastra um novo contato/lead no CRM do Atendi, vinculando à unidade correspondente.",
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
          description: "ID (UUID) da unidade à qual o contato pertence. Se a chave for de filial, usa a filial da chave.",
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
    description: "Atualiza os dados de um contato existente (nome, telefone, email ou troca de unidade).",
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
      if (args.email !== undefined) updateData.email = args.email ? String(args.email).trim().toLowerCase() : null;
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
        throw new Error(`Erro ao atualizar contato: ${error?.message || "Contato não encontrado ou sem permissão"}`);
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
];
