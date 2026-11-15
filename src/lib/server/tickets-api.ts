import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeTicketWithAI } from "./ticket-ai";

// Cabeçalhos CORS para permitir consumo de sites externos, landing pages e widgets de SAC
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-company-id",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Validação de autenticação para rotas privadas B2B.
 * Suporta Authorization: Bearer <API_KEY> ou x-api-key: <API_KEY>.
 */
async function authenticateRequest(request: Request): Promise<{ companyId: string } | null> {
  const authHeader = request.headers.get("Authorization") || "";
  const apiKeyHeader = request.headers.get("x-api-key") || "";

  let token = "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token) return null;

  // 1. Service Role Key do próprio sistema
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE;
  if (serviceRoleKey && token === serviceRoleKey) {
    const url = new URL(request.url);
    const companyId = request.headers.get("x-company-id") || url.searchParams.get("company_id");
    if (companyId) return { companyId };
  }

  // 2. Chave de API da empresa em mcp_api_keys
  try {
    const { data: keyRecord, error } = await (supabaseAdmin as any)
      .from("mcp_api_keys")
      .select("company_id, active")
      .eq("api_key", token)
      .eq("active", true)
      .maybeSingle();

    if (error || !keyRecord?.company_id) return null;
    return { companyId: keyRecord.company_id };
  } catch {
    return null;
  }
}

/**
 * Roteador principal para /api/tickets e /api/sac/tickets
 */
export async function handleTicketsApi(request: Request): Promise<Response> {
  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // =========================================================================
    // 1. ROTAS PÚBLICAS DE SAC (Para sites externos, formulários e portais de clientes)
    // =========================================================================

    // POST /api/sac/tickets ou POST /api/tickets/public
    if (
      (pathname === "/api/sac/tickets" || pathname === "/api/tickets/public") &&
      request.method === "POST"
    ) {
      return await handlePublicSacCreateTicket(request);
    }

    // GET /api/sac/tickets/track ou GET /api/tickets/track
    if (
      (pathname === "/api/sac/tickets/track" || pathname === "/api/tickets/track") &&
      request.method === "GET"
    ) {
      return await handlePublicSacTrackTicket(url);
    }

    // POST /api/sac/tickets/reply ou POST /api/tickets/reply
    // Permite que o cliente responda a um ticket aberto diretamente pelo site
    if (
      (pathname === "/api/sac/tickets/reply" || pathname === "/api/tickets/reply") &&
      request.method === "POST"
    ) {
      return await handlePublicSacReplyTicket(request);
    }

    // =========================================================================
    // 2. DISPARO INTERNO DE TRIAGEM POR IA (Chamado pelo frontend Atendi)
    // =========================================================================
    if (pathname === "/api/tickets/internal/analyze-ai" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.ticketId && body.companyId) {
        analyzeTicketWithAI(body.ticketId, body.companyId).catch((err) =>
          console.error("[tickets-api] Falha na análise assíncrona da IA:", err)
        );
        return jsonResponse({ success: true, message: "Triagem de IA disparada em segundo plano." });
      }
      return jsonResponse({ error: "ticketId e companyId são obrigatórios." }, 400);
    }

    // =========================================================================
    // 3. ROTAS AUTENTICADAS B2B (Para ERPs, CRMs e backends externos)
    // =========================================================================
    const auth = await authenticateRequest(request);
    if (!auth) {
      return jsonResponse(
        {
          error: "Unauthorized",
          message: "Credencial inválida ou ausente. Forneça x-api-key ou Authorization: Bearer <API_KEY>",
        },
        401
      );
    }

    const { companyId } = auth;

    // GET /api/tickets (Listar tickets)
    if (pathname === "/api/tickets" && request.method === "GET") {
      return await handleB2BListTickets(companyId, url);
    }

    // POST /api/tickets (Criar ticket B2B)
    if (pathname === "/api/tickets" && request.method === "POST") {
      return await handleB2BCreateTicket(companyId, request);
    }

    // Rotas com ID do ticket (UUID)
    const matchUuid = pathname.match(/^\/api\/tickets\/([0-9a-fA-F-]{36})$/);
    if (matchUuid) {
      const ticketId = matchUuid[1];
      if (request.method === "GET") {
        return await handleB2BGetTicket(companyId, ticketId);
      }
      if (request.method === "PATCH") {
        return await handleB2BUpdateTicket(companyId, ticketId, request);
      }
    }

    // POST /api/tickets/:id/messages (Adicionar mensagem ou nota interna)
    const matchMessage = pathname.match(/^\/api\/tickets\/([0-9a-fA-F-]{36})\/messages$/);
    if (matchMessage && request.method === "POST") {
      const ticketId = matchMessage[1];
      return await handleB2BAddMessage(companyId, ticketId, request);
    }

    return jsonResponse({ error: "Endpoint não encontrado" }, 404);
  } catch (err: any) {
    console.error("[Tickets API Error]:", err);
    return jsonResponse({ error: "Internal Server Error", message: err.message }, 500);
  }
}

/**
 * CRIAÇÃO PÚBLICA DE TICKET (SAC DE SITE / WIDGET)
 */
async function handlePublicSacCreateTicket(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const {
    company_slug,
    company_id,
    name,
    phone,
    email,
    title,
    description,
    unit_slug,
    unit_id,
    department_id,
    department_name,
    priority = "medium",
    tags = [],
  } = body;

  if (!title?.trim() || !description?.trim()) {
    return jsonResponse({ error: "Título e descrição do chamado são obrigatórios." }, 400);
  }
  if (!name?.trim()) {
    return jsonResponse({ error: "Nome do solicitante é obrigatório." }, 400);
  }
  if (!phone?.trim() && !email?.trim()) {
    return jsonResponse({ error: "Informe ao menos um telefone ou e-mail de contato." }, 400);
  }

  // 1. Identifica a empresa
  let targetCompanyId = company_id;
  if (!targetCompanyId && company_slug) {
    const { data: comp } = await (supabaseAdmin as any)
      .from("companies")
      .select("id")
      .eq("slug", company_slug.trim())
      .maybeSingle();
    targetCompanyId = comp?.id;
  }
  if (!targetCompanyId) {
    return jsonResponse({ error: "Empresa não encontrada ou não informada." }, 404);
  }

  // 2. Identifica a unidade responsável
  let targetUnitId = unit_id;
  if (!targetUnitId && unit_slug) {
    const { data: u } = await (supabaseAdmin as any)
      .from("units")
      .select("id")
      .eq("company_id", targetCompanyId)
      .eq("slug", unit_slug.trim())
      .maybeSingle();
    targetUnitId = u?.id;
  }
  if (!targetUnitId) {
    // Fallback: primeira unidade ativa da empresa
    const { data: defaultUnit } = await (supabaseAdmin as any)
      .from("units")
      .select("id")
      .eq("company_id", targetCompanyId)
      .eq("active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    targetUnitId = defaultUnit?.id;
  }
  if (!targetUnitId) {
    return jsonResponse({ error: "Nenhuma unidade ativa disponível para esta empresa." }, 400);
  }

  // 3. Identifica departamento (opcional)
  let targetDeptId = department_id;
  if (!targetDeptId && department_name) {
    const { data: dept } = await (supabaseAdmin as any)
      .from("departments")
      .select("id")
      .eq("unit_id", targetUnitId)
      .ilike("name", `%${department_name.trim()}%`)
      .limit(1)
      .maybeSingle();
    targetDeptId = dept?.id;
  }

  // 4. Localiza ou cria o contato com segurança contra duplicações (código 23505)
  let contactId: string | null = null;
  const cleanPhone = phone ? phone.replace(/\D/g, "") : null;

  if (cleanPhone) {
    const { data: existingContact } = await (supabaseAdmin as any)
      .from("contacts")
      .select("id")
      .eq("company_id", targetCompanyId)
      .ilike("phone", `%${cleanPhone.slice(-8)}%`)
      .limit(1)
      .maybeSingle();
    contactId = existingContact?.id;
  }

  if (!contactId && email) {
    const { data: existingContactByEmail } = await (supabaseAdmin as any)
      .from("contacts")
      .select("id")
      .eq("company_id", targetCompanyId)
      .eq("email", email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    contactId = existingContactByEmail?.id;
  }

  // Cria contato se não existir
  if (!contactId) {
    const { data: newContact, error: contactErr } = await (supabaseAdmin as any)
      .from("contacts")
      .insert({
        company_id: targetCompanyId,
        unit_id: targetUnitId,
        name: name.trim(),
        phone: cleanPhone || null,
        email: email?.trim().toLowerCase() || null,
        tags: ["sac-site"],
      })
      .select("id")
      .maybeSingle();

    if (contactErr) {
      // Se houver conflito de índice único concorrente (23505), busca o existente
      if (contactErr.code === "23505" && cleanPhone) {
        const { data: recoveredContact } = await (supabaseAdmin as any)
          .from("contacts")
          .select("id")
          .eq("company_id", targetCompanyId)
          .ilike("phone", `%${cleanPhone.slice(-8)}%`)
          .limit(1)
          .maybeSingle();
        contactId = recoveredContact?.id;
      }
    } else {
      contactId = newContact?.id;
    }
  }

  // 5. Cria o Ticket
  const finalTags = Array.isArray(tags) ? Array.from(new Set([...tags, "sac-web"])) : ["sac-web"];
  const { data: newTicket, error: ticketErr } = await (supabaseAdmin as any)
    .from("tickets")
    .insert({
      company_id: targetCompanyId,
      unit_id: targetUnitId,
      department_id: targetDeptId || null,
      scope: "external",
      title: title.trim(),
      description: description.trim(),
      priority: ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
      status: "new",
      requester_contact_id: contactId,
      tags: finalTags,
    })
    .select("id, ticket_number, status, priority, created_at")
    .single();

  if (ticketErr) {
    console.error("[Tickets API] Erro ao criar ticket:", ticketErr);
    return jsonResponse({ error: "Falha ao registrar ticket", details: ticketErr.message }, 500);
  }

  // 6. Insere a descrição como primeira mensagem do ticket
  await (supabaseAdmin as any).from("ticket_messages").insert({
    ticket_id: newTicket.id,
    sender_contact_id: contactId,
    is_internal_note: false,
    content: description.trim(),
  });

  // 7. Triagem Inteligente e Classificação de Prioridade em segundo plano
  analyzeTicketWithAI(newTicket.id, targetCompanyId).catch((err) =>
    console.error("[tickets-api] Falha na triagem por IA do SAC:", err)
  );

  return jsonResponse(
    {
      success: true,
      message: "Ticket de SAC registrado com sucesso!",
      ticket: {
        id: newTicket.id,
        ticket_number: newTicket.ticket_number,
        status: newTicket.status,
        created_at: newTicket.created_at,
      },
    },
    201
  );
}

/**
 * CONSULTA DE STATUS DO TICKET POR CLIENTE (TRACKING SAC)
 */
async function handlePublicSacTrackTicket(url: URL): Promise<Response> {
  const ticketNumberParam = url.searchParams.get("ticket_number");
  const phone = url.searchParams.get("phone");
  const email = url.searchParams.get("email");

  if (!ticketNumberParam) {
    return jsonResponse({ error: "Parâmetro ticket_number é obrigatório." }, 400);
  }

  const ticketNumber = parseInt(ticketNumberParam, 10);
  if (isNaN(ticketNumber)) {
    return jsonResponse({ error: "Número de ticket inválido." }, 400);
  }

  const { data: ticket, error } = await (supabaseAdmin as any)
    .from("tickets")
    .select(`
      id,
      ticket_number,
      title,
      status,
      priority,
      created_at,
      resolved_at,
      unit:units!unit_id(name),
      department:departments!department_id(name),
      requester_contact:contacts!requester_contact_id(name, phone, email)
    `)
    .eq("ticket_number", ticketNumber)
    .maybeSingle();

  if (error || !ticket) {
    return jsonResponse({ error: "Ticket não encontrado." }, 404);
  }

  // Validação simples de segurança quando telefone ou e-mail são fornecidos
  if (phone || email) {
    const contact = ticket.requester_contact;
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const contactPhone = contact?.phone ? contact.phone.replace(/\D/g, "") : "";

    const phoneMatch = cleanPhone && contactPhone && contactPhone.includes(cleanPhone.slice(-8));
    const emailMatch = email && contact?.email && contact.email.toLowerCase() === email.toLowerCase().trim();

    if (!phoneMatch && !emailMatch) {
      return jsonResponse({ error: "Dados de contato não correspondem a este ticket." }, 403);
    }
  }

  // Mensagens públicas (oculta notas internas confidenciais da equipe)
  const { data: messages = [] } = await (supabaseAdmin as any)
    .from("ticket_messages")
    .select("id, content, created_at, sender_user:profiles!sender_user_id(name), sender_contact:contacts!sender_contact_id(name)")
    .eq("ticket_id", ticket.id)
    .eq("is_internal_note", false)
    .order("created_at", { ascending: true });

  return jsonResponse({
    success: true,
    ticket: {
      number: ticket.ticket_number,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      unit: ticket.unit?.name,
      department: ticket.department?.name,
      created_at: ticket.created_at,
      resolved_at: ticket.resolved_at,
      messages: messages.map((m: any) => ({
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        sender: m.sender_user?.name || m.sender_contact?.name || "Atendimento",
      })),
    },
  });
}

/**
 * CLIENTE RESPONDE A UM TICKET PELO SITE (SAC REPLY)
 */
async function handlePublicSacReplyTicket(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { ticket_number, phone, email, content } = body;

  if (!ticket_number || !content?.trim()) {
    return jsonResponse({ error: "ticket_number e content são obrigatórios." }, 400);
  }
  if (!phone?.trim() && !email?.trim()) {
    return jsonResponse({ error: "Informe o telefone ou e-mail cadastrado no chamado." }, 400);
  }

  const num = parseInt(String(ticket_number), 10);
  if (isNaN(num)) return jsonResponse({ error: "ticket_number inválido." }, 400);

  const { data: ticket, error } = await (supabaseAdmin as any)
    .from("tickets")
    .select("id, status, requester_contact_id, requester_contact:contacts!requester_contact_id(phone, email)")
    .eq("ticket_number", num)
    .maybeSingle();

  if (error || !ticket) return jsonResponse({ error: "Ticket não encontrado." }, 404);

  // Confere solicitante
  const contact = ticket.requester_contact;
  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
  const contactPhone = contact?.phone ? contact.phone.replace(/\D/g, "") : "";
  const phoneMatch = cleanPhone && contactPhone && contactPhone.includes(cleanPhone.slice(-8));
  const emailMatch = email && contact?.email && contact.email.toLowerCase() === email.toLowerCase().trim();

  if (!phoneMatch && !emailMatch) {
    return jsonResponse({ error: "Dados de contato não correspondem a este ticket." }, 403);
  }

  // Insere resposta do cliente
  const { data: newMsg, error: msgErr } = await (supabaseAdmin as any)
    .from("ticket_messages")
    .insert({
      ticket_id: ticket.id,
      sender_contact_id: ticket.requester_contact_id,
      is_internal_note: false,
      content: content.trim(),
    })
    .select("id, content, created_at")
    .single();

  if (msgErr) throw msgErr;

  // Se o chamado estava como 'pending', volta para 'in_progress' automaticamente
  if (ticket.status === "pending" || ticket.status === "resolved") {
    await (supabaseAdmin as any)
      .from("tickets")
      .update({ status: "in_progress", resolved_at: null })
      .eq("id", ticket.id);
  }

  return jsonResponse({
    success: true,
    message: "Resposta enviada com sucesso!",
    message_data: newMsg,
  }, 201);
}

/**
 * B2B: LISTAGEM DE TICKETS DA EMPRESA
 */
async function handleB2BListTickets(companyId: string, url: URL): Promise<Response> {
  const status = url.searchParams.get("status");
  const scope = url.searchParams.get("scope");
  const unitId = url.searchParams.get("unit_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  let query = (supabaseAdmin as any)
    .from("tickets")
    .select(`
      id,
      ticket_number,
      title,
      description,
      status,
      priority,
      scope,
      created_at,
      unit:units!unit_id(id, name),
      department:departments!department_id(id, name),
      requester_user:profiles!requester_user_id(id, name, email),
      requester_contact:contacts!requester_contact_id(id, name, phone, email),
      assigned_user:profiles!assigned_to_user_id(id, name, email)
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (scope) query = query.eq("scope", scope);
  if (unitId) query = query.eq("unit_id", unitId);

  const { data: tickets, error } = await query;
  if (error) throw error;

  return jsonResponse({ success: true, count: tickets?.length || 0, tickets: tickets || [] });
}

/**
 * B2B: CONSULTAR TICKET ESPECÍFICO
 */
async function handleB2BGetTicket(companyId: string, ticketId: string): Promise<Response> {
  const { data: ticket, error } = await (supabaseAdmin as any)
    .from("tickets")
    .select(`
      *,
      unit:units!unit_id(id, name),
      department:departments!department_id(id, name),
      requester_user:profiles!requester_user_id(id, name, email),
      requester_contact:contacts!requester_contact_id(id, name, phone, email),
      assigned_user:profiles!assigned_to_user_id(id, name, email)
    `)
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !ticket) {
    return jsonResponse({ error: "Ticket não encontrado." }, 404);
  }

  // Busca histórico de mensagens
  const { data: messages = [] } = await (supabaseAdmin as any)
    .from("ticket_messages")
    .select(`
      id,
      content,
      is_internal_note,
      attachments,
      created_at,
      sender_user:profiles!sender_user_id(id, name, email),
      sender_contact:contacts!sender_contact_id(id, name)
    `)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  return jsonResponse({ success: true, ticket: { ...ticket, messages } });
}

/**
 * B2B: CRIAR TICKET PROGRAMATICAMENTE
 */
async function handleB2BCreateTicket(companyId: string, request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const {
    unit_id,
    department_id,
    title,
    description,
    scope = "external",
    priority = "medium",
    requester_contact_id,
    requester_user_id,
    assigned_to_user_id,
    tags = [],
  } = body;

  if (!unit_id || !title?.trim() || !description?.trim()) {
    return jsonResponse({ error: "unit_id, title e description são obrigatórios." }, 400);
  }

  const { data: newTicket, error } = await (supabaseAdmin as any)
    .from("tickets")
    .insert({
      company_id: companyId,
      unit_id,
      department_id: department_id || null,
      title: title.trim(),
      description: description.trim(),
      scope,
      priority,
      status: "new",
      requester_contact_id: requester_contact_id || null,
      requester_user_id: requester_user_id || null,
      assigned_to_user_id: assigned_to_user_id || null,
      tags: Array.isArray(tags) ? tags : [],
    })
    .select()
    .single();

  if (error) throw error;

  // Triagem por IA em background
  analyzeTicketWithAI(newTicket.id, companyId).catch((err) =>
    console.error("[tickets-api] Falha na triagem por IA do B2B:", err)
  );

  return jsonResponse({ success: true, ticket: newTicket }, 201);
}

/**
 * B2B: ADICIONAR MENSAGEM OU NOTA
 */
async function handleB2BAddMessage(companyId: string, ticketId: string, request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { content, is_internal_note = false, sender_user_id, sender_contact_id } = body;

  if (!content?.trim()) {
    return jsonResponse({ error: "content não pode ser vazio." }, 400);
  }

  // Valida pertencimento do ticket
  const { data: ticket } = await (supabaseAdmin as any)
    .from("tickets")
    .select("id, status")
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!ticket) return jsonResponse({ error: "Ticket não encontrado." }, 404);

  const { data: newMsg, error } = await (supabaseAdmin as any)
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      content: content.trim(),
      is_internal_note: !!is_internal_note,
      sender_user_id: sender_user_id || null,
      sender_contact_id: sender_contact_id || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Se o chamado era 'new', move automaticamente para 'in_progress'
  if (ticket.status === "new") {
    await (supabaseAdmin as any)
      .from("tickets")
      .update({ status: "in_progress", first_responded_at: new Date().toISOString() })
      .eq("id", ticketId);
  }

  return jsonResponse({ success: true, message: newMsg }, 201);
}

/**
 * B2B: ATUALIZAR STATUS OU PRIORIDADE
 */
async function handleB2BUpdateTicket(companyId: string, ticketId: string, request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { status, priority, assigned_to_user_id } = body;

  const updates: Record<string, any> = {};
  if (status) {
    updates.status = status;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    else if (status === "closed") updates.closed_at = new Date().toISOString();
    else if (status === "in_progress" || status === "pending") {
      updates.resolved_at = null; // Reabertura
    }
  }
  if (priority) updates.priority = priority;
  if (assigned_to_user_id !== undefined) updates.assigned_to_user_id = assigned_to_user_id || null;

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: "Nenhum campo para atualizar." }, 400);
  }

  const { data: updated, error } = await (supabaseAdmin as any)
    .from("tickets")
    .update(updates)
    .eq("id", ticketId)
    .eq("company_id", companyId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!updated) return jsonResponse({ error: "Ticket não encontrado." }, 404);

  return jsonResponse({ success: true, ticket: updated });
}
