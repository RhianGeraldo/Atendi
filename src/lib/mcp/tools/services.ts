/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition } from "../types";

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export const servicesTools: McpToolDefinition[] = [
  // 1. Consulta Consultiva para IA e Atendentes (Busca por Áreas e Degraus)
  {
    name: "buscar_servicos_combos",
    description:
      "Busca pacotes e combos de serviços no catálogo comercial oficial com inteligência de vendas (opção intermediária recomendada, upsell, downsell e cross-sell) com base nas áreas de interesse do cliente, unidade física e momento da negociação.",
    security: {
      category: "services",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        areas: {
          type: "array",
          items: { type: "string" },
          description:
            "Áreas do corpo que o cliente mencionou interesse (ex: ['virilha', 'axilas'], ['pernas'], ['barba']).",
        },
        estrategia: {
          type: "string",
          enum: [
            "apresentacao_inicial",
            "intermediario",
            "upsell",
            "downsell",
            "cross_sell",
            "todos",
          ],
          description:
            "Momento comercial: 'apresentacao_inicial' ou 'intermediario' (1ª oferta / âncora ideal), 'downsell' (cliente achou caro / salvar venda com opção mais acessível ou avulsa), 'upsell' (adicionar pernas ou corpo todo para ticket maior), 'cross_sell' (adicionar clareamento ou tratamento complementar), 'todos' (retornar todas as opções mapeadas).",
          default: "apresentacao_inicial",
        },
        categoria: {
          type: "string",
          description:
            "Categoria desejada: 'laser' (depilação a laser), 'clareamento', 'facial', 'corporal'. Opcional.",
        },
        unidade_id: {
          type: "string",
          description:
            "ID da unidade física (filial) para verificar valores específicos locais. Opcional.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const targetUnitId = args?.unidade_id || context.unitId || null;
      const estrategia = args?.estrategia || "apresentacao_inicial";
      const inputAreas: string[] = Array.isArray(args?.areas)
        ? args.areas.map((a: string) => normalizeString(a)).filter(Boolean)
        : [];
      const categoria = args?.categoria ? normalizeString(args.categoria) : null;

      let query = supabaseAdmin
        .from("company_services_packages")
        .select("*")
        .eq("company_id", context.companyId)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (targetUnitId) {
        query = query.or(`unit_id.is.null,unit_id.eq.${targetUnitId}`);
      }

      if (categoria) {
        query = query.eq("category", categoria);
      }

      const { data: allPackages, error } = await query;
      if (error) {
        throw new Error(`Erro ao buscar pacotes no catálogo: ${error.message}`);
      }

      if (!allPackages || allPackages.length === 0) {
        return {
          encontrado: false,
          mensagem: "Nenhum pacote ativo encontrado no catálogo para os critérios informados.",
        };
      }

      function matchesAreas(pkg: any): boolean {
        if (inputAreas.length === 0) return true;
        const pkgAreasNormalized = (pkg.areas || []).map((a: string) => normalizeString(a));
        const pkgNameNormalized = normalizeString(pkg.name);

        return inputAreas.some((inputArea) => {
          const inArea = pkgAreasNormalized.some(
            (pa: string) => pa.includes(inputArea) || inputArea.includes(pa),
          );
          const inName = pkgNameNormalized.includes(inputArea);
          return inArea || inName;
        });
      }

      const matchedPackages = allPackages.filter(matchesAreas);
      const pool = matchedPackages.length > 0 ? matchedPackages : allPackages;

      const intermediate =
        pool.find((p) => p.strategic_role === "intermediate") ||
        pool.find((p) => p.type === "combo") ||
        pool[0];

      const upsells = allPackages.filter(
        (p) =>
          p.strategic_role === "upsell" ||
          ((p.installment_value || p.cash_price || 0) >
            (intermediate?.installment_value || intermediate?.cash_price || 0) &&
            p.id !== intermediate?.id),
      );

      const downsells = allPackages.filter(
        (p) =>
          p.strategic_role === "downsell" ||
          ((p.installment_value || p.cash_price || 0) <
            (intermediate?.installment_value || intermediate?.cash_price || 0) &&
            p.id !== intermediate?.id),
      );

      const crossSells = allPackages.filter(
        (p) =>
          p.strategic_role === "cross_sell" ||
          p.type === "addon" ||
          p.category === "clareamento" ||
          p.category === "facial",
      );

      function formatItem(pkg: any) {
        if (!pkg) return null;
        return {
          id: pkg.id,
          nome: pkg.name,
          tipo: pkg.type,
          areas: pkg.areas,
          sessoes: pkg.sessions_count,
          preco_tabela: pkg.anchor_price ? `R$ ${Number(pkg.anchor_price).toFixed(2)}` : null,
          parcelado:
            pkg.installment_text ||
            (pkg.installment_value
              ? `12x de R$ ${Number(pkg.installment_value).toFixed(2)}`
              : null),
          a_vista: pkg.cash_price ? `R$ ${Number(pkg.cash_price).toFixed(2)}` : null,
          formas_pagamento: pkg.payment_methods,
          brindes_bonus: pkg.bonus_gift,
          dica_comercial_ia: pkg.sales_pitch,
        };
      }

      return {
        encontrado: true,
        estrategia_solicitada: estrategia,
        opcao_intermediaria_recomendada: formatItem(intermediate),
        opcao_downsell: formatItem(downsells[0]),
        outros_downsells: downsells.slice(1, 3).map(formatItem),
        opcao_upsell: formatItem(upsells[0]),
        outros_upsells: upsells.slice(1, 3).map(formatItem),
        opcao_cross_sell: formatItem(crossSells[0]),
        diretriz_venda:
          estrategia === "downsell"
            ? "O cliente achou caro ou hesitou: ofereça com empatia a 'opcao_downsell' destacando a parcela mais suave ou a sessão avulsa para começar."
            : estrategia === "upsell"
              ? "O cliente quer mais áreas ou corpo completo: apresente a 'opcao_upsell' destacando o maior desconto global por área tratada."
              : estrategia === "cross_sell"
                ? "O cliente mencionou manchas/foliculite: apresente a 'opcao_cross_sell' com 50% de desconto adicional ao pacote de laser."
                : "Apresente a 'opcao_intermediaria_recomendada' com entusiasmo e naturalidade (1 a 2 linhas), destacando a parcela no cartão recorrente que não bloqueia o limite e o brinde incluso. Termine com uma pergunta simples de fechamento.",
      };
    },
  },

  // 2. Listagem do Catálogo Completo com Filtros
  {
    name: "listar_servicos_catalogo",
    description:
      "Lista os serviços, pacotes e combos cadastrados no catálogo da empresa com detalhes de preços, parcelamento e papel estratégico.",
    security: {
      category: "services",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        somente_ativos: {
          type: "boolean",
          description: "Filtrar apenas itens ativos. Padrão: true.",
          default: true,
        },
        categoria: {
          type: "string",
          description:
            "Filtrar por categoria ('laser', 'clareamento', 'facial', 'corporal'). Opcional.",
        },
        papel_estrategico: {
          type: "string",
          enum: ["intermediate", "upsell", "downsell", "cross_sell"],
          description: "Filtrar por papel estratégico. Opcional.",
        },
        unidade_id: {
          type: "string",
          description: "Filtrar por ID da unidade física ou null para rede inteira. Opcional.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const activeOnly = args?.somente_ativos !== false;

      let query = supabaseAdmin
        .from("company_services_packages")
        .select("*")
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: true });

      if (activeOnly) query = query.eq("is_active", true);
      if (args?.categoria) query = query.eq("category", args.categoria);
      if (args?.papel_estrategico) query = query.eq("strategic_role", args.papel_estrategico);
      if (args?.unidade_id) query = query.eq("unit_id", args.unidade_id);

      const { data, error } = await query;
      if (error) {
        throw new Error(`Erro ao listar catálogo: ${error.message}`);
      }

      return {
        total: data?.length || 0,
        servicos: data || [],
      };
    },
  },

  // 3. Obter Detalhes de um Serviço/Pacote
  {
    name: "obter_servico_pacote",
    description: "Retorna os detalhes completos de um serviço ou pacote específico pelo ID ou Nome.",
    security: {
      category: "services",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "UUID do pacote de serviço.",
        },
        nome: {
          type: "string",
          description: "Nome do pacote de serviço (caso não saiba o ID).",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      if (!args?.id && !args?.nome) {
        throw new Error("Informe o 'id' ou o 'nome' do pacote.");
      }

      let query = supabaseAdmin
        .from("company_services_packages")
        .select("*")
        .eq("company_id", context.companyId);

      if (args.id) {
        query = query.eq("id", args.id);
      } else {
        query = query.ilike("name", `%${args.nome.trim()}%`);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw new Error(`Erro ao buscar pacote: ${error.message}`);
      if (!data) return { encontrado: false, mensagem: "Pacote não encontrado." };

      return { encontrado: true, pacote: data };
    },
  },

  // 4. Criar Novo Serviço / Combo (Gestão via MCP)
  {
    name: "criar_servico_pacote",
    description:
      "Cadastra um novo pacote ou combo comercial no catálogo para que as IAs possam vendê-lo no WhatsApp/Instagram.",
    security: {
      category: "services",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome comercial do pacote (ex: 'Combo Trio: Virilha + Axilas + Perianal').",
        },
        areas: {
          type: "array",
          items: { type: "string" },
          description: "Lista de áreas inclusas (ex: ['Virilha Completa', 'Perianal', 'Axilas']).",
        },
        papel_estrategico: {
          type: "string",
          enum: ["intermediate", "upsell", "downsell", "cross_sell"],
          description:
            "Papel comercial na negociação: 'intermediate' (carro-chefe/âncora), 'upsell' (ticket maior), 'downsell' (salva-venda), 'cross_sell' (venda cruzada).",
        },
        sessoes: {
          type: "number",
          description: "Quantidade de sessões (ex: 10). Padrão: 10.",
          default: 10,
        },
        tipo: {
          type: "string",
          enum: ["combo", "single_area", "addon"],
          description: "Tipo do serviço ('combo', 'single_area' ou 'addon'). Padrão: 'combo'.",
          default: "combo",
        },
        categoria: {
          type: "string",
          enum: ["laser", "clareamento", "facial", "corporal"],
          description: "Categoria do tratamento. Padrão: 'laser'.",
          default: "laser",
        },
        preco_a_vista: {
          type: "number",
          description: "Valor à vista / PIX em reais (ex: 599.00).",
        },
        preco_tabela_ancora: {
          type: "number",
          description: "Valor de tabela cheio sem desconto para ancoragem (ex: 1200.00).",
        },
        texto_parcelamento: {
          type: "string",
          description:
            "Texto exato do parcelamento como a IA falará (ex: '12x de R$ 59,90'). Obrigatório.",
        },
        formas_pagamento: {
          type: "array",
          items: { type: "string" },
          description:
            "Formas aceitas (ex: ['recorrente', 'cartao', 'pix']). Padrão: ['recorrente', 'cartao', 'pix'].",
        },
        brinde_bonus: {
          type: "string",
          description:
            "Brinde de fechamento (ex: '10 sessões de Buço de presente + brinde exclusivo').",
        },
        dica_venda_ia: {
          type: "string",
          description:
            "Orientação confidencial de venda que a IA usará no momento de ofertar este pacote.",
        },
        unidade_id: {
          type: "string",
          description: "ID da unidade física específica ou null para aplicar em todas as filiais.",
        },
        ativo: {
          type: "boolean",
          description: "Se o pacote já entra ativo para venda imediata. Padrão: true.",
          default: true,
        },
      },
      required: ["nome", "areas", "papel_estrategico", "texto_parcelamento"],
    },
    handler: async (args: any, context: McpContext) => {
      if (!args.nome?.trim()) throw new Error("Nome do pacote é obrigatório.");
      if (!Array.isArray(args.areas) || args.areas.length === 0) {
        throw new Error("Pelo menos uma área de tratamento deve ser informada.");
      }

      // Buscar maior order_index para colocar no final
      const { data: lastPkg } = await supabaseAdmin
        .from("company_services_packages")
        .select("order_index")
        .eq("company_id", context.companyId)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (lastPkg?.order_index || 0) + 1;

      const payload = {
        company_id: context.companyId,
        unit_id: args.unidade_id || null,
        name: args.nome.trim(),
        description: args.descricao || null,
        type: args.tipo || "combo",
        category: args.categoria || "laser",
        strategic_role: args.papel_estrategico,
        areas: args.areas,
        sessions_count: Number(args.sessoes) || 10,
        anchor_price: args.preco_tabela_ancora ? Number(args.preco_tabela_ancora) : null,
        cash_price: args.preco_a_vista ? Number(args.preco_a_vista) : null,
        installment_text: args.texto_parcelamento.trim(),
        payment_methods: args.formas_pagamento || ["recorrente", "cartao", "pix"],
        bonus_gift: args.brinde_bonus ? args.brinde_bonus.trim() : null,
        sales_pitch: args.dica_venda_ia ? args.dica_venda_ia.trim() : null,
        is_active: args.ativo !== false,
        order_index: nextOrder,
      };

      const { data, error } = await supabaseAdmin
        .from("company_services_packages")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(`Erro ao cadastrar pacote: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Pacote "${data.name}" cadastrado com sucesso e já disponível para as IAs!`,
        pacote: data,
      };
    },
  },

  // 5. Atualizar Serviço / Pacote Existente
  {
    name: "atualizar_servico_pacote",
    description:
      "Atualiza valores, parcelas, áreas, brindes ou regras de um pacote comercial existente.",
    security: {
      category: "services",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "UUID do pacote a ser atualizado.",
        },
        nome: { type: "string", description: "Novo nome do pacote." },
        areas: { type: "array", items: { type: "string" }, description: "Novas áreas inclusas." },
        sessoes: { type: "number", description: "Nova quantidade de sessões." },
        papel_estrategico: {
          type: "string",
          enum: ["intermediate", "upsell", "downsell", "cross_sell"],
        },
        preco_a_vista: { type: "number", description: "Novo preço à vista / PIX." },
        preco_tabela_ancora: { type: "number", description: "Novo preço de tabela âncora." },
        texto_parcelamento: {
          type: "string",
          description: "Novo texto de parcelamento (ex: '12x de R$ 49,90').",
        },
        brinde_bonus: { type: "string", description: "Novo brinde de fechamento." },
        dica_venda_ia: { type: "string", description: "Nova dica de venda para a IA." },
        ativo: { type: "boolean", description: "Status ativo/inativo." },
      },
      required: ["id"],
    },
    handler: async (args: any, context: McpContext) => {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (args.nome !== undefined) updateData.name = args.nome.trim();
      if (args.areas !== undefined) updateData.areas = args.areas;
      if (args.sessoes !== undefined) updateData.sessions_count = Number(args.sessoes);
      if (args.papel_estrategico !== undefined) updateData.strategic_role = args.papel_estrategico;
      if (args.preco_a_vista !== undefined) updateData.cash_price = Number(args.preco_a_vista);
      if (args.preco_tabela_ancora !== undefined)
        updateData.anchor_price = Number(args.preco_tabela_ancora);
      if (args.texto_parcelamento !== undefined)
        updateData.installment_text = args.texto_parcelamento.trim();
      if (args.brinde_bonus !== undefined) updateData.bonus_gift = args.brinde_bonus?.trim() || null;
      if (args.dica_venda_ia !== undefined)
        updateData.sales_pitch = args.dica_venda_ia?.trim() || null;
      if (args.ativo !== undefined) updateData.is_active = Boolean(args.ativo);

      const { data, error } = await supabaseAdmin
        .from("company_services_packages")
        .update(updateData)
        .eq("id", args.id)
        .eq("company_id", context.companyId)
        .select()
        .single();

      if (error) throw new Error(`Erro ao atualizar pacote: ${error.message}`);
      if (!data) throw new Error("Pacote não encontrado nesta empresa.");

      return {
        sucesso: true,
        mensagem: `Pacote "${data.name}" atualizado com sucesso!`,
        pacote: data,
      };
    },
  },

  // 6. Ativar / Pausar Pacote Rapidamente
  {
    name: "alternar_status_servico_pacote",
    description: "Ativa ou pausa um pacote comercial para que a IA comece ou pare de ofertá-lo.",
    security: {
      category: "services",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do pacote." },
        ativo: {
          type: "boolean",
          description: "true para ativar, false para pausar a oferta do pacote.",
        },
      },
      required: ["id", "ativo"],
    },
    handler: async (args: any, context: McpContext) => {
      const { data, error } = await supabaseAdmin
        .from("company_services_packages")
        .update({ is_active: args.ativo, updated_at: new Date().toISOString() })
        .eq("id", args.id)
        .eq("company_id", context.companyId)
        .select("id, name, is_active")
        .single();

      if (error) throw new Error(`Erro ao alternar status: ${error.message}`);

      return {
        sucesso: true,
        mensagem: `Pacote "${data.name}" agora está ${data.is_active ? "ATIVO para vendas" : "PAUSADO"}.`,
        pacote: data,
      };
    },
  },

  // 7. Excluir Serviço / Pacote
  {
    name: "excluir_servico_pacote",
    description: "Remove permanentemente um pacote do catálogo de serviços da empresa.",
    security: {
      category: "services",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID do pacote a ser removido." },
      },
      required: ["id"],
    },
    handler: async (args: any, context: McpContext) => {
      const { error } = await supabaseAdmin
        .from("company_services_packages")
        .delete()
        .eq("id", args.id)
        .eq("company_id", context.companyId);

      if (error) throw new Error(`Erro ao excluir pacote: ${error.message}`);

      return {
        sucesso: true,
        mensagem: "Pacote removido com sucesso do catálogo.",
      };
    },
  },

  // 8. Consultar Estratégia Comercial Global da Empresa
  {
    name: "consultar_estrategia_vendas",
    description:
      "Retorna a campanha ativa, política de parcelamento recorrente, brindes oficiais e diretrizes globais de venda consultiva da empresa.",
    security: {
      category: "services",
      minRole: "agent",
    },
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_args: any, context: McpContext) => {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("name, custom_variables")
        .eq("id", context.companyId)
        .single();

      const strategy = (comp?.custom_variables as any)?.sales_strategy || {};

      // Contagem de pacotes ativos por estratégia
      const { data: pkgs } = await supabaseAdmin
        .from("company_services_packages")
        .select("strategic_role, is_active")
        .eq("company_id", context.companyId)
        .eq("is_active", true);

      const stats = {
        total_ativos: pkgs?.length || 0,
        intermediarios: pkgs?.filter((p) => p.strategic_role === "intermediate").length || 0,
        upsells: pkgs?.filter((p) => p.strategic_role === "upsell").length || 0,
        downsells: pkgs?.filter((p) => p.strategic_role === "downsell").length || 0,
        cross_sells: pkgs?.filter((p) => p.strategic_role === "cross_sell").length || 0,
      };

      return {
        empresa: comp?.name,
        campanha_ativa: strategy.campaign_active_name || "Campanha Padrão de Vendas (50% OFF)",
        brinde_oficial_fechamento:
          strategy.campaign_bonus_headline ||
          "10 sessões de Buço de presente + brinde exclusivo no fechamento",
        parcelamento_recorrente_padrao: strategy.default_recurrent_installments || 12,
        desconto_cross_sell_percentual: strategy.allow_cross_sell_discount || 50,
        permitir_downsell_automatico: strategy.allow_downsell_automatically !== false,
        diretrizes_venda_consultiva:
          strategy.consultative_pitch_guidelines ||
          "Apresente sempre o combo intermediário com entusiasmo; use o cartão recorrente que não compromete o limite bancário; mantenha respostas curtas de 1 a 2 linhas com uma pergunta final.",
        estatisticas_catalogo: stats,
      };
    },
  },

  // 9. Configurar / Alterar Estratégia Comercial Global da Empresa
  {
    name: "configurar_estrategia_vendas",
    description:
      "Altera as regras e parâmetros da estratégia de vendas da empresa (nome da campanha atual, brinde da semana, desconto de cross-sell e diretrizes da IA). Tem efeito imediato nas conversas da Helena e do SDR.",
    security: {
      category: "services",
      minRole: "manager",
      isWriteAction: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        nome_campanha_ativa: {
          type: "string",
          description: "Nome ou tema da campanha atual (ex: 'Semana Laser Friday 50% OFF').",
        },
        brinde_oficial_fechamento: {
          type: "string",
          description:
            "Brinde/bônus de urgência divulgado pela IA (ex: 'Ganhe 10 sessões de Buço de presente hoje').",
        },
        parcelas_recorrentes_padrao: {
          type: "number",
          description: "Número de parcelas padrão da recorrência (ex: 12). Padrão: 12.",
        },
        desconto_cross_sell_percentual: {
          type: "number",
          description: "Percentual de desconto na venda cruzada/clareamento (ex: 50). Padrão: 50.",
        },
        permitir_downsell_automatico: {
          type: "boolean",
          description: "Se a IA tem autonomia para fazer downsell se o cliente hesitar.",
        },
        diretrizes_venda_consultiva: {
          type: "string",
          description:
            "Instruções e regras específicas da clínica que serão injetadas diretamente no prompt dos agentes.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const { data: comp } = await supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      const currentVars = (comp?.custom_variables as any) || {};
      const currentStrategy = currentVars.sales_strategy || {};

      const updatedStrategy = {
        ...currentStrategy,
        ...(args.nome_campanha_ativa !== undefined && {
          campaign_active_name: args.nome_campanha_ativa.trim(),
        }),
        ...(args.brinde_oficial_fechamento !== undefined && {
          campaign_bonus_headline: args.brinde_oficial_fechamento.trim(),
        }),
        ...(args.parcelas_recorrentes_padrao !== undefined && {
          default_recurrent_installments: Number(args.parcelas_recorrentes_padrao),
        }),
        ...(args.desconto_cross_sell_percentual !== undefined && {
          allow_cross_sell_discount: Number(args.desconto_cross_sell_percentual),
        }),
        ...(args.permitir_downsell_automatico !== undefined && {
          allow_downsell_automatically: Boolean(args.permitir_downsell_automatico),
        }),
        ...(args.diretrizes_venda_consultiva !== undefined && {
          consultative_pitch_guidelines: args.diretrizes_venda_consultiva.trim(),
        }),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from("companies")
        .update({
          custom_variables: {
            ...currentVars,
            sales_strategy: updatedStrategy,
          },
        })
        .eq("id", context.companyId);

      if (error) throw new Error(`Erro ao salvar estratégia de vendas: ${error.message}`);

      return {
        sucesso: true,
        mensagem:
          "Estratégia comercial atualizada com sucesso! As novas diretrizes e campanhas já estão ativas para as IAs.",
        estrategia_atual: updatedStrategy,
      };
    },
  },
];
