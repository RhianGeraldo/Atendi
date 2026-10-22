/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import {
  currentTodooMonth,
  todooDayBounds,
  todooRange,
  type TodooRangeKey,
} from "@/components/todoo/todoo-period";
import type { McpContext, McpToolDefinition, McpToolSecurity } from "../types";

// Meu Todoo: metas de cadastro, desempenho (Gincana/Indicadores) e pendências do dia.
// Os cálculos seguem as telas (Meu Dia, Painel da Equipe, Gincana), para os números baterem.

const SECURITY: McpToolSecurity = { requiredMenu: "todoo", minRole: "manager" };

// Mesmo limite do Meu Dia: lead em conversa sem interação há 48h vira follow-up
const FOLLOWUP_AFTER_HOURS = 48;
// Papéis que sempre aparecem; os demais só com atividade (como no Painel da Equipe)
const TEAM_ROLES = ["agent", "manager"];

const PERIOD_ENUM = ["mes_atual", "mes_anterior", "tudo"];
const PERIOD_KEY: Record<string, TodooRangeKey> = {
  mes_atual: "month",
  mes_anterior: "last_month",
  tudo: "all",
};

const pct = (done: number, total: number) =>
  total > 0 ? Math.round((done / total) * 1000) / 10 : null;

/** Pessoas ativas da empresa, com as unidades de cada uma. */
async function loadTeam(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, role, active, user_units(unit_id)")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Erro ao carregar a equipe: ${error.message}`);
  return (data || []).map((p: any) => ({
    id: p.id as string,
    name: p.name as string,
    role: p.role as string,
    unitIds: ((p.user_units as any[]) || []).map((u) => u.unit_id as string),
  }));
}

/** Mês 'YYYY-MM' válido ou o mês atual. */
function resolveMonth(raw: unknown): string {
  const month = String(raw || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentTodooMonth();
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00-03:00`).toISOString();
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = new Date(`${next}-01T00:00:00-03:00`).toISOString();
  return { start, end, daysInMonth: new Date(y, m, 0).getDate() };
}

export const todooTools: McpToolDefinition[] = [
  {
    name: "consultar_metas_todoo",
    description:
      "Meu Todoo: cadastros (indicações captadas) de cada consultora contra a meta de cadastros do mês. No mês atual mostra também cadastros de hoje, meta de hoje e quanto falta. Use para saber quem está atrás da meta.",
    security: SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        mes: {
          type: "string",
          description: "Mês no formato 'YYYY-MM'. Padrão: mês atual.",
        },
        consultora_id: {
          type: "string",
          description: "ID (UUID) da consultora para ver só ela.",
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade: só consultoras dessa unidade.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const month = resolveMonth(args?.mes);
      const isCurrent = month === currentTodooMonth();
      const { start, end, daysInMonth } = monthBounds(month);
      const day = todooDayBounds();
      const unitId = context.unitId || args?.unidade_id || null;

      const [team, goalsRes, capturesRes] = await Promise.all([
        loadTeam(context.companyId),
        (supabaseAdmin.from("todoo_goals") as any)
          .select("user_id, target_contacts, contacts_period")
          .eq("company_id", context.companyId)
          .eq("month_year", month),
        fetchAllPages(() =>
          (supabaseAdmin.from("todoo_referrals") as any)
            .select("id, captured_by_user_id, created_at")
            .eq("company_id", context.companyId)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true }),
        ),
      ]);
      if (goalsRes.error) throw new Error(`Erro ao carregar metas: ${goalsRes.error.message}`);
      if (capturesRes.error) {
        throw new Error(`Erro ao carregar cadastros: ${capturesRes.error.message}`);
      }

      const goals = new Map<string, { target: number; period: "daily" | "monthly" }>();
      for (const g of goalsRes.data || []) {
        if (Number(g.target_contacts) > 0) {
          goals.set(g.user_id, {
            target: Number(g.target_contacts),
            period: g.contacts_period === "daily" ? "daily" : "monthly",
          });
        }
      }
      const monthCount = new Map<string, number>();
      const todayCount = new Map<string, number>();
      for (const c of capturesRes.data || []) {
        if (!c.captured_by_user_id) continue;
        monthCount.set(c.captured_by_user_id, (monthCount.get(c.captured_by_user_id) || 0) + 1);
        if (isCurrent && c.created_at >= day.dayStart) {
          todayCount.set(c.captured_by_user_id, (todayCount.get(c.captured_by_user_id) || 0) + 1);
        }
      }

      const rows = team
        .filter((p) => !args?.consultora_id || p.id === args.consultora_id)
        .filter((p) => !unitId || p.unitIds.includes(unitId))
        .filter(
          (p) => TEAM_ROLES.includes(p.role) || goals.has(p.id) || (monthCount.get(p.id) || 0) > 0,
        )
        .map((p) => {
          const goal = goals.get(p.id);
          const doneMonth = monthCount.get(p.id) || 0;
          const doneToday = todayCount.get(p.id) || 0;
          // Meta diária vale todos os dias do mês; mensal é o número do mês
          const monthTarget = goal
            ? goal.period === "daily"
              ? goal.target * daysInMonth
              : goal.target
            : 0;

          let today: Record<string, number> | null = null;
          if (isCurrent && goal) {
            // Igual ao Meu Dia: meta mensal divide o que falta (sem hoje) pelos dias restantes
            const todayTarget =
              goal.period === "daily"
                ? goal.target
                : Math.ceil(
                    Math.max(0, goal.target - (doneMonth - doneToday)) / day.daysLeftInMonth,
                  );
            today = {
              cadastros_hoje: doneToday,
              meta_hoje: todayTarget,
              falta_hoje: Math.max(0, todayTarget - doneToday),
            };
          } else if (isCurrent) {
            today = { cadastros_hoje: doneToday };
          }

          return {
            consultora_id: p.id,
            consultora: p.name,
            meta: goal
              ? {
                  tipo: goal.period === "daily" ? "diária" : "mensal",
                  valor: goal.target,
                  equivalente_no_mes: monthTarget,
                }
              : null,
            cadastros_no_mes: doneMonth,
            percentual_da_meta_do_mes: goal ? pct(doneMonth, monthTarget) : null,
            falta_no_mes: goal ? Math.max(0, monthTarget - doneMonth) : null,
            ...(today || {}),
          };
        })
        .sort(
          (a, b) => (a.percentual_da_meta_do_mes ?? 999) - (b.percentual_da_meta_do_mes ?? 999),
        );

      return {
        mes: month,
        dias_restantes_no_mes: isCurrent ? day.daysLeftInMonth : 0,
        total_cadastros_no_mes: rows.reduce((s, r) => s + r.cadastros_no_mes, 0),
        total_meta_do_mes: rows.reduce((s, r) => s + (r.meta?.equivalente_no_mes || 0), 0),
        consultoras_sem_meta: rows.filter((r) => !r.meta).map((r) => r.consultora),
        consultoras: rows,
      };
    },
  },
  {
    name: "consultar_desempenho_todoo",
    description:
      "Meu Todoo: indicadores e ranking da Gincana por consultora (leads recebidos, contatados, agendados, orçamentos, fechados, faturamento, SLA do 1º contato no prazo/atrasado e pontos), com o total da equipe. Mesmos números das abas Gincana e Indicadores.",
    security: SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: PERIOD_ENUM,
          description:
            "Período pela data em que o lead foi distribuído: 'mes_atual' (padrão), 'mes_anterior' ou 'tudo'.",
          default: "mes_atual",
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade. Se omitido em chave Matriz, toda a rede.",
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const periodo = PERIOD_KEY[args?.periodo] ? args.periodo : "mes_atual";
      const { from, to } = todooRange(PERIOD_KEY[periodo]);
      const params = {
        p_company_id: context.companyId,
        p_unit_id: context.unitId || args?.unidade_id || null,
        p_from: from,
        p_to: to,
      };

      const [metricsRes, rankingRes] = await Promise.all([
        (supabaseAdmin as any).rpc("todoo_metrics", params),
        (supabaseAdmin as any).rpc("todoo_ranking", params),
      ]);
      if (metricsRes.error) {
        throw new Error(`Erro ao carregar indicadores: ${metricsRes.error.message}`);
      }
      if (rankingRes.error)
        throw new Error(`Erro ao carregar ranking: ${rankingRes.error.message}`);

      const m = metricsRes.data || {};
      return {
        periodo,
        regra_de_pontos:
          "+10 fechou, +5 agendou, +2 orçamento, +2 1º contato no prazo, -5 1º contato atrasado (mínimo 0)",
        equipe: {
          leads: m.total || 0,
          contatados: m.contacted || 0,
          agendados: m.scheduled || 0,
          orcamentos: m.quoted || 0,
          fechados: m.won || 0,
          sem_interesse: m.lost || 0,
          faturamento: Number(m.revenue || 0),
          taxa_contato: pct(m.contacted || 0, m.total || 0),
          taxa_agendamento: pct(m.scheduled || 0, m.total || 0),
          taxa_fechamento: pct(m.won || 0, m.total || 0),
          sla_1o_contato_no_prazo: m.sla_on_time || 0,
          sla_1o_contato_atrasado: m.sla_late || 0,
        },
        ranking: (rankingRes.data || []).map((r: any, i: number) => ({
          posicao: i + 1,
          consultora_id: r.user_id,
          consultora: r.user_name,
          pontos: Number(r.points),
          leads: Number(r.assigned),
          contatados: Number(r.contacted),
          agendados: Number(r.scheduled),
          orcamentos: Number(r.quoted),
          fechados: Number(r.won),
          faturamento: Number(r.revenue),
          sla_no_prazo: Number(r.sla_on_time),
          sla_atrasado: Number(r.sla_late),
          taxa_fechamento: pct(Number(r.won), Number(r.assigned)),
        })),
      };
    },
  },
  {
    name: "consultar_pendencias_todoo",
    description:
      "Meu Todoo: o dia de cada consultora, como no Painel da Equipe — a contatar, tentativas da cadência que vencem hoje, retornos, follow-ups (em conversa sem interação há 48h), tarefas do CRM, trabalhados hoje, atrasados e progresso do dia. Pode listar os cards atrasados para cobrar.",
    security: SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        consultora_id: {
          type: "string",
          description: "ID (UUID) da consultora para ver só ela.",
        },
        unidade_id: {
          type: "string",
          description: "ID (UUID) da unidade. Se omitido em chave Matriz, toda a rede.",
        },
        listar_atrasados: {
          type: "boolean",
          description: "Inclui a lista dos itens atrasados de cada consultora (padrão true).",
          default: true,
        },
        limite_por_consultora: {
          type: "number",
          description: "Máximo de itens atrasados listados por consultora (padrão 10, máx. 50).",
          default: 10,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const bounds = todooDayBounds();
      const month = currentTodooMonth();
      const unitId = context.unitId || args?.unidade_id || null;
      const onlyUser: string | null = args?.consultora_id || null;
      const listOverdue = args?.listar_atrasados !== false;
      const perUser = Math.min(Math.max(Number(args?.limite_por_consultora) || 10, 1), 50);
      const db = supabaseAdmin as any;

      const buildLeads = () => {
        let q = db
          .from("todoo_leads")
          .select(
            "id, contact_name, contact_phone, assigned_user_id, unit_id, status, stage_id, card_status_id, next_action_at, sla_deadline, callback_scheduled_at, last_interaction_at, campaign:todoo_campaigns!inner(title, status), unit:units(name)",
          )
          .eq("company_id", context.companyId)
          // Ação pausada ou concluída sai da fila (como no Meu Dia)
          .eq("campaign.status", "active")
          .or(
            `status.in.(pending,contacted,quoted,callback),last_interaction_at.gte.${bounds.dayStart}`,
          )
          .order("sla_deadline", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true });
        if (onlyUser) q = q.eq("assigned_user_id", onlyUser);
        if (unitId) q = q.eq("unit_id", unitId);
        return q;
      };
      const buildTasks = () => {
        let q = db
          .from("tasks")
          .select("id, title, due_date, assigned_to, unit_id, contacts(name, phone)")
          .eq("company_id", context.companyId)
          .eq("status", "pending")
          .lt("due_date", bounds.dayEnd)
          .not("title", "ilike", "[Todoo]%")
          .order("due_date", { ascending: true })
          .order("id", { ascending: true });
        if (onlyUser) q = q.eq("assigned_to", onlyUser);
        if (unitId) q = q.eq("unit_id", unitId);
        return q;
      };

      const [team, leadsRes, tasksRes, autoRes, stagesRes, statusesRes, goalsRes, capturesRes] =
        await Promise.all([
          loadTeam(context.companyId),
          fetchAllPages(buildLeads),
          fetchAllPages(buildTasks),
          fetchAllPages(() =>
            db
              .from("todoo_auto_queue")
              .select("id, lead_id")
              .eq("company_id", context.companyId)
              .in("status", ["pending", "sending"])
              .order("id", { ascending: true }),
          ),
          db
            .from("todoo_stages")
            .select("id, name, kind, position")
            .eq("company_id", context.companyId)
            .order("position"),
          db
            .from("todoo_card_statuses")
            .select("id, name, behavior, position, is_default")
            .eq("company_id", context.companyId)
            .order("position"),
          db
            .from("todoo_goals")
            .select("user_id, target_contacts, contacts_period")
            .eq("company_id", context.companyId)
            .eq("month_year", month)
            .gt("target_contacts", 0),
          fetchAllPages(() =>
            db
              .from("todoo_referrals")
              .select("id, captured_by_user_id, created_at")
              .eq("company_id", context.companyId)
              .gte("created_at", bounds.monthStart)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true }),
          ),
        ]);
      for (const res of [
        leadsRes,
        tasksRes,
        autoRes,
        stagesRes,
        statusesRes,
        goalsRes,
        capturesRes,
      ]) {
        if (res.error) throw new Error(`Erro ao carregar o Todoo: ${res.error.message}`);
      }

      const stages: any[] = stagesRes.data || [];
      const statuses: any[] = statusesRes.data || [];
      const autoPending = new Set((autoRes.data || []).map((r: any) => r.lead_id));
      const stageOf = (l: any) => stages.find((s) => s.id === l.stage_id) ?? stages[0];
      const behaviorOf = (l: any) =>
        (
          statuses.find((s) => s.id === l.card_status_id) ??
          statuses.find((s) => s.is_default) ??
          statuses[0]
        )?.behavior ?? (l.status === "pending" ? "active" : "paused");

      const now = Date.now();
      const followupLimit = now - FOLLOWUP_AFTER_HOURS * 60 * 60 * 1000;
      const isPast = (iso: string | null) => !!iso && new Date(iso).getTime() < now;
      const leadItem = (l: any, tipo: string, venceu_em: string | null) => ({
        tipo,
        lead_id: l.id,
        contato: l.contact_name,
        telefone: l.contact_phone,
        acao_comercial: l.campaign?.title || null,
        unidade: l.unit?.name || null,
        etapa: stageOf(l)?.name || null,
        venceu_em,
      });

      const buildPlan = (userId: string) => {
        const leads = (leadsRes.data || []).filter((l: any) => l.assigned_user_id === userId);
        const cadence = leads.map((l: any) => ({
          lead: l,
          stage: stageOf(l),
          behavior: behaviorOf(l),
        }));

        const callbacks = leads.filter(
          (l: any) =>
            l.status === "callback" &&
            (!l.callback_scheduled_at || l.callback_scheduled_at < bounds.dayEnd),
        );
        const toContact = cadence
          .filter(
            (c: any) =>
              c.behavior === "active" &&
              !autoPending.has(c.lead.id) &&
              (c.stage ? c.stage.kind === "start" : c.lead.status === "pending"),
          )
          .map((c: any) => c.lead);
        const attempts = cadence
          .filter(
            (c: any) =>
              c.behavior === "active" &&
              !autoPending.has(c.lead.id) &&
              c.stage?.kind === "attempt" &&
              !!c.lead.next_action_at &&
              c.lead.next_action_at < bounds.dayEnd,
          )
          .map((c: any) => c.lead);
        const followups = cadence
          .filter(
            (c: any) =>
              c.behavior === "paused" &&
              c.lead.status !== "callback" &&
              (!c.lead.last_interaction_at ||
                new Date(c.lead.last_interaction_at).getTime() < followupLimit),
          )
          .map((c: any) => c.lead);
        const workedToday = leads.filter(
          (l: any) => l.last_interaction_at && l.last_interaction_at >= bounds.dayStart,
        ).length;
        const crmTasks = (tasksRes.data || []).filter((t: any) => t.assigned_to === userId);

        const goal = (goalsRes.data || []).find((g: any) => g.user_id === userId);
        const myCaptures = (capturesRes.data || []).filter(
          (c: any) => c.captured_by_user_id === userId,
        );
        const captureDone = myCaptures.filter((c: any) => c.created_at >= bounds.dayStart).length;
        let captureTarget = 0;
        if (goal?.contacts_period === "daily") {
          captureTarget = goal.target_contacts;
        } else if (goal) {
          const remaining = Math.max(0, goal.target_contacts - (myCaptures.length - captureDone));
          captureTarget = Math.ceil(remaining / bounds.daysLeftInMonth);
        }

        const overdueItems = [
          ...toContact
            .filter((l: any) => isPast(l.sla_deadline))
            .map((l: any) => leadItem(l, "a_contatar", l.sla_deadline)),
          ...attempts
            .filter((l: any) => isPast(l.next_action_at))
            .map((l: any) => leadItem(l, "tentativa", l.next_action_at)),
          ...callbacks
            .filter((l: any) => isPast(l.callback_scheduled_at))
            .map((l: any) => leadItem(l, "retorno", l.callback_scheduled_at)),
          ...crmTasks
            .filter((t: any) => isPast(t.due_date))
            .map((t: any) => ({
              tipo: "tarefa_crm",
              tarefa_id: t.id,
              titulo: t.title,
              contato: t.contacts?.name || null,
              telefone: t.contacts?.phone || null,
              venceu_em: t.due_date,
            })),
        ].sort((a, b) => (a.venceu_em || "").localeCompare(b.venceu_em || ""));

        const captureRemaining = Math.max(0, captureTarget - captureDone);
        const pending =
          callbacks.length +
          toContact.length +
          attempts.length +
          followups.length +
          crmTasks.length +
          captureRemaining;
        const done = workedToday + Math.min(captureDone, captureTarget);

        return {
          hasActivity: leads.length > 0 || myCaptures.length > 0 || crmTasks.length > 0,
          summary: {
            progresso_do_dia: pct(done, done + pending) ?? 0,
            feitos: done,
            total_do_dia: done + pending,
            trabalhados_hoje: workedToday,
            a_contatar: toContact.length,
            tentativas_hoje: attempts.length,
            retornos: callbacks.length,
            follow_ups: followups.length,
            tarefas_crm: crmTasks.length,
            cadastros_hoje: captureDone,
            meta_cadastros_hoje: captureTarget,
            atrasados: overdueItems.length,
          },
          overdueItems,
        };
      };

      const rows = team
        .filter((p) => !onlyUser || p.id === onlyUser)
        .map((p) => {
          const plan = buildPlan(p.id);
          const inUnit = !unitId || p.unitIds.includes(unitId);
          if (!plan.hasActivity && !(TEAM_ROLES.includes(p.role) && inUnit)) return null;
          return {
            consultora_id: p.id,
            consultora: p.name,
            ...plan.summary,
            ...(listOverdue && plan.overdueItems.length > 0
              ? { itens_atrasados: plan.overdueItems.slice(0, perUser) }
              : {}),
          };
        })
        .filter((r): r is NonNullable<typeof r> => !!r)
        .sort(
          (a, b) => b.atrasados - a.atrasados || a.consultora.localeCompare(b.consultora, "pt-BR"),
        );

      const sum = (key: keyof (typeof rows)[number]) =>
        rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
      return {
        dia: bounds.dayStart.slice(0, 10),
        equipe: {
          pessoas: rows.length,
          progresso_do_dia: pct(sum("feitos"), sum("total_do_dia")) ?? 0,
          trabalhados_hoje: sum("trabalhados_hoje"),
          ainda_para_chamar: sum("a_contatar") + sum("tentativas_hoje"),
          cadastros_hoje: sum("cadastros_hoje"),
          meta_cadastros_hoje: sum("meta_cadastros_hoje"),
          atrasados: sum("atrasados"),
        },
        consultoras: rows,
      };
    },
  },
];
