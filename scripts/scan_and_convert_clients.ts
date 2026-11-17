import { createClient } from "@supabase/supabase-js";

// Lê variáveis de ambiente do Bun / .env
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !serviceKey) {
  console.error("ERRO: SUPABASE_URL ou SERVICE_ROLE não configurados no .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("==========================================================");
  console.log("   VARREDURA DE COMPRAS NO CRM & CONVERSÃO DE CLIENTES   ");
  console.log("==========================================================\n");

  const clientsToPromote = new Map<
    string,
    {
      contactId: string;
      reason: string;
      details: string;
      date?: string;
    }
  >();

  // -------------------------------------------------------------
  // 1. Busca oportunidades com status = 'won' (Ganho)
  // -------------------------------------------------------------
  console.log("1. Buscando oportunidades com status = 'won' no CRM...");
  const { data: wonOpps, error: wonErr } = await supabase
    .from("opportunities")
    .select("id, contact_id, title, value, status, stage_id, created_at")
    .eq("status", "won")
    .not("contact_id", "is", null);

  if (wonErr) {
    console.error("Erro ao buscar oportunidades won:", wonErr.message);
  } else {
    console.log(`   -> Encontradas ${wonOpps?.length || 0} oportunidade(s) marcadas como WON.`);
    (wonOpps || []).forEach((opp) => {
      if (!opp.contact_id) return;
      clientsToPromote.set(opp.contact_id, {
        contactId: opp.contact_id,
        reason: "Oportunidade Ganha (status = won)",
        details: `Oportunidade: "${opp.title}" (R$ ${Number(opp.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
        date: opp.created_at,
      });
    });
  }

  // -------------------------------------------------------------
  // 2. Busca etapas do funil que representam Ganho / Venda / Purchase
  // -------------------------------------------------------------
  console.log("\n2. Analisando etapas do funil (pipeline_stages) que representam fechamento/compra...");
  const { data: stages, error: stagesErr } = await supabase
    .from("pipeline_stages")
    .select("id, name, meta_event_name");

  if (stagesErr) {
    console.error("Erro ao buscar etapas:", stagesErr.message);
  } else {
    const wonKeywords = [
      "ganho",
      "ganha",
      "ganhou",
      "fechado",
      "fechada",
      "venda realizada",
      "comprou",
      "cliente",
      "contrato assinado",
      "pago",
      "concluído",
      "concluida",
    ];

    const wonStageIds = (stages || [])
      .filter((s) => {
        const lower = (s.name || "").toLowerCase();
        const isPurchaseEvent = (s.meta_event_name || "").toLowerCase() === "purchase";
        const hasKeyword = wonKeywords.some((kw) => lower.includes(kw));
        return isPurchaseEvent || hasKeyword;
      })
      .map((s) => ({ id: s.id, name: s.name }));

    console.log(`   -> Etapas identificadas como Fechamento/Venda (${wonStageIds.length}):`, wonStageIds.map((s) => s.name).join(", ") || "Nenhuma específica");

    if (wonStageIds.length > 0) {
      const ids = wonStageIds.map((s) => s.id);
      const { data: stageOpps, error: stageOppsErr } = await supabase
        .from("opportunities")
        .select("id, contact_id, title, value, stage_id, created_at")
        .in("stage_id", ids)
        .not("contact_id", "is", null);

      if (stageOppsErr) {
        console.error("Erro ao buscar oportunidades por etapa:", stageOppsErr.message);
      } else {
        console.log(`   -> Encontradas ${stageOpps?.length || 0} oportunidade(s) nessas etapas de fechamento.`);
        (stageOpps || []).forEach((opp) => {
          if (!opp.contact_id) return;
          const stageName = wonStageIds.find((s) => s.id === opp.stage_id)?.name || "Fechamento";
          if (!clientsToPromote.has(opp.contact_id)) {
            clientsToPromote.set(opp.contact_id, {
              contactId: opp.contact_id,
              reason: `Etapa de Fechamento: "${stageName}"`,
              details: `Oportunidade: "${opp.title}" (R$ ${Number(opp.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
              date: opp.created_at,
            });
          }
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Busca desfechos de venda no Todoo (todoo_leads com status/outcome 'won')
  // -------------------------------------------------------------
  console.log("\n3. Buscando vendas registradas na esteira comercial Todoo...");
  const { data: todooWon, error: todooErr } = await supabase
    .from("todoo_leads")
    .select("id, contact_id, contact_name, contact_phone, status, outcome_type, outcome_value, outcome_notes, completed_at, created_at")
    .or("status.eq.won,outcome_type.eq.won")
    .not("contact_id", "is", null);

  if (todooErr) {
    console.error("Erro ao buscar vendas no Todoo:", todooErr.message);
  } else {
    console.log(`   -> Encontrados ${todooWon?.length || 0} lead(s) com desfecho GANHO no Todoo.`);
    (todooWon || []).forEach((lead) => {
      if (!lead.contact_id) return;
      if (!clientsToPromote.has(lead.contact_id)) {
        clientsToPromote.set(lead.contact_id, {
          contactId: lead.contact_id,
          reason: "Venda Concluída no Todoo",
          details: `Desfecho GANHO (R$ ${Number(lead.outcome_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) - ${lead.outcome_notes || ""}`,
          date: lead.completed_at || lead.created_at,
        });
      }
    });
  }

  // -------------------------------------------------------------
  // 4. Busca logs de conversão de compra no Meta CAPI (Purchase)
  // -------------------------------------------------------------
  console.log("\n4. Verificando eventos de compra registrados no Meta CAPI (Purchase)...");
  const { data: capiPurchases, error: capiErr } = await supabase
    .from("meta_capi_logs")
    .select("id, contact_id, event_name, status, value, created_at")
    .eq("event_name", "Purchase")
    .eq("status", "success")
    .not("contact_id", "is", null);

  if (capiErr) {
    console.error("Erro ao buscar logs CAPI:", capiErr.message);
  } else {
    console.log(`   -> Encontrados ${capiPurchases?.length || 0} evento(s) Purchase no Meta CAPI.`);
    (capiPurchases || []).forEach((log) => {
      if (!log.contact_id) return;
      if (!clientsToPromote.has(log.contact_id)) {
        clientsToPromote.set(log.contact_id, {
          contactId: log.contact_id,
          reason: "Evento de Compra Meta CAPI (Purchase)",
          details: `Valor: R$ ${Number(log.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          date: log.created_at,
        });
      }
    });
  }

  console.log(`\n-> TOTAL DE CONTATOS IDENTIFICADOS COM HISTÓRICO DE COMPRA: ${clientsToPromote.size}`);

  if (clientsToPromote.size === 0) {
    console.log("\nNenhum contato com histórico de compra foi encontrado no banco de dados.");
    return;
  }

  // -------------------------------------------------------------
  // 5. Consulta os dados atuais desses contatos para verificar status atual
  // -------------------------------------------------------------
  const contactIdsArray = Array.from(clientsToPromote.keys());
  const { data: existingContacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, name, phone, email, contact_type, became_client_at, company_id")
    .in("id", contactIdsArray);

  if (contactsErr) {
    console.error("Erro ao carregar contatos:", contactsErr.message);
    process.exit(1);
  }

  const contactsMap = new Map((existingContacts || []).map((c) => [c.id, c]));

  let alreadyClientCount = 0;
  let newlyPromotedCount = 0;
  const updatePromises: Promise<any>[] = [];

  console.log("\n==========================================================");
  console.log("            LISTA DE CONTATOS IDENTIFICADOS               ");
  console.log("==========================================================");

  for (const [contactId, info] of clientsToPromote.entries()) {
    const contact = contactsMap.get(contactId);
    if (!contact) continue;

    const isAlreadyClient = contact.contact_type === "client";
    const statusText = isAlreadyClient ? "[JÁ ERA CLIENTE]" : "[PROMOVENDO A CLIENTE]";

    if (isAlreadyClient) {
      alreadyClientCount++;
    } else {
      newlyPromotedCount++;
      const becameDate = contact.became_client_at || info.date || new Date().toISOString();
      updatePromises.push(
        supabase
          .from("contacts")
          .update({
            contact_type: "client",
            became_client_at: becameDate,
          })
          .eq("id", contactId)
      );
    }

    console.log(`${statusText} ${contact.name || "Sem Nome"} (${contact.phone || contact.email || "Sem contato"})`);
    console.log(`   Motivo: ${info.reason}`);
    console.log(`   Detalhes: ${info.details}\n`);
  }

  if (updatePromises.length > 0) {
    console.log(`Atualizando ${updatePromises.length} contato(s) no banco de dados...`);
    const results = await Promise.all(updatePromises);
    const hasErrors = results.some((r) => r.error);
    if (hasErrors) {
      console.error("Alguns contatos apresentaram erro ao atualizar.");
    } else {
      console.log("✅ Todos os contatos foram atualizados com sucesso!");
    }
  }

  console.log("\n==========================================================");
  console.log("                 RESUMO DA EXECUÇÃO                       ");
  console.log("==========================================================");
  console.log(`Total com compras identificadas : ${clientsToPromote.size}`);
  console.log(`Já estavam como Cliente         : ${alreadyClientCount}`);
  console.log(`Promovidos para Cliente agora   : ${newlyPromotedCount}`);
  console.log("==========================================================\n");
}

main().catch((err) => {
  console.error("Erro fatal na execução:", err);
  process.exit(1);
});
