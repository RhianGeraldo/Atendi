/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateConversationSla, DEFAULT_SLA_SETTINGS, type SlaSettings } from "@/lib/sla";
import type { McpContext, McpToolDefinition } from "../types";

export const analyticsTools: McpToolDefinition[] = [
  {
    name: "consultar_metricas_dashboard",
    description:
      "Retorna indicadores de desempenho de vendas, atendimento e conformidade de SLA (leads aguardando, conversas ativas, SLA estourado/alerta, valor total no funil e taxa de conversão), com visão consolidada da rede ou de uma filial específica.",
    security: {
      requiredMenu: "dashboard",
      minRole: "manager",
    },
    inputSchema: {
      type: "object",
      properties: {
        unidade_id: {
          type: "string",
          description:
            "ID (UUID) da unidade para filtrar métricas. Se omitido em chave Matriz, retorna a visão consolidada de todas as unidades.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const targetUnitId = context.unitId || args?.unidade_id;

      // 1. Contagens de Conversas por Status
      let qWaiting = supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "waiting");

      let qActive = supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "active");

      let qResolved = supabaseAdmin
        .from("conversations")
        .select("id, unit_id, contacts!inner(company_id)", { count: "exact", head: true })
        .eq("contacts.company_id", context.companyId)
        .eq("status", "resolved");

      // 2. Contatos
      let qContacts = supabaseAdmin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", context.companyId);

      // 3. Oportunidades
      let qOpps = supabaseAdmin
        .from("opportunities")
        .select("value, status, unit_id, contacts!inner(company_id)")
        .eq("contacts.company_id", context.companyId);

      // 4. Conversas para cálculo de SLA
      let qSlaConvs = supabaseAdmin
        .from("conversations")
        .select(
          `
          id,
          status,
          channel,
          last_message,
          last_message_at,
          last_message_preview,
          started_at,
          contacts!inner(id, name, phone, company_id)
        `,
        )
        .eq("contacts.company_id", context.companyId)
        .neq("status", "resolved")
        .limit(200);

      // 5. Configuração de SLA da empresa
      const qCompany = supabaseAdmin
        .from("companies")
        .select("custom_variables")
        .eq("id", context.companyId)
        .single();

      if (targetUnitId) {
        qWaiting = qWaiting.eq("unit_id", targetUnitId);
        qActive = qActive.eq("unit_id", targetUnitId);
        qResolved = qResolved.eq("unit_id", targetUnitId);
        qContacts = qContacts.eq("unit_id", targetUnitId);
        qOpps = qOpps.eq("unit_id", targetUnitId);
        qSlaConvs = qSlaConvs.eq("unit_id", targetUnitId);
      }

      const [resWait, resAct, resRes, resCont, resOpps, resSlaConvs, resComp] = await Promise.all([
        qWaiting,
        qActive,
        qResolved,
        qContacts,
        qOpps,
        qSlaConvs,
        qCompany,
      ]);

      const oppsList = resOpps.data || [];
      const totalPipelineValue = oppsList
        .filter((o: any) => o.status === "open")
        .reduce((acc: number, curr: any) => acc + (Number(curr.value) || 0), 0);

      const totalWonValue = oppsList
        .filter((o: any) => o.status === "won")
        .reduce((acc: number, curr: any) => acc + (Number(curr.value) || 0), 0);

      const countWon = oppsList.filter((o: any) => o.status === "won").length;
      const countLost = oppsList.filter((o: any) => o.status === "lost").length;
      const countOpen = oppsList.filter((o: any) => o.status === "open").length;

      // Calcular SLA
      const customVars = (resComp.data?.custom_variables as Record<string, any>) || {};
      const slaSettings: SlaSettings = {
        ...DEFAULT_SLA_SETTINGS,
        ...(customVars.sla || {}),
      };

      let breachedCount = 0;
      let warningCount = 0;
      let okCount = 0;

      for (const c of resSlaConvs.data || []) {
        const phone = (c.contacts as any)?.phone || "";
        const isGroup = phone.startsWith("120363") || (phone.includes("-") && phone.length > 18);
        if (isGroup) continue;

        const convRow: any = {
          ...c,
          contact: c.contacts,
        };

        const sla = calculateConversationSla(convRow, slaSettings);
        if (sla.status === "breached") breachedCount++;
        else if (sla.status === "warning") warningCount++;
        else if (sla.status === "ok") okCount++;
      }

      return {
        empresa: context.companyName,
        escopo: targetUnitId
          ? `Unidade ${context.unitName || targetUnitId}`
          : "Consolidado (Todas as Unidades)",
        atendimento: {
          aguardando_resposta: resWait.count || 0,
          em_atendimento: resAct.count || 0,
          resolvidos: resRes.count || 0,
          total_conversas: (resWait.count || 0) + (resAct.count || 0) + (resRes.count || 0),
          sla_compliance: {
            sla_ativo: slaSettings.enabled,
            atendimentos_estourados_atrasados: breachedCount,
            atendimentos_em_alerta_warning: warningCount,
            atendimentos_dentro_do_prazo: okCount,
          },
        },
        contatos: {
          total_cadastrados: resCont.count || 0,
        },
        vendas_pipeline: {
          oportunidades_abertas: countOpen,
          oportunidades_ganhas: countWon,
          oportunidades_perdidas: countLost,
          valor_em_negociacao_reais: totalPipelineValue,
          valor_vendas_fechadas_reais: totalWonValue,
        },
      };
    },
  },
];
