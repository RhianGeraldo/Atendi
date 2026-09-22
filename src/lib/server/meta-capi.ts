/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface MetaCapiSettings {
  enabled: boolean;
  pixel_id: string; // Meta Pixel ID ou Dataset ID
  access_token?: string; // Token específico de CAPI ou fallback para meta_system_user_token
  test_event_code?: string; // Código de teste da aba "Test Events" do Meta Events Manager
  track_ctwa_leads?: boolean; // Disparar Lead/Contact quando chegar novo lead de anúncio WhatsApp
  track_stage_moves?: boolean; // Disparar evento ao movimentar de etapa no CRM
  track_won_purchases?: boolean; // Disparar Purchase quando oportunidade for Ganha
  default_lead_value?: number;
  currency?: string; // Default: 'BRL'
}

export interface SendMetaCapiParams {
  companyId: string;
  contactId?: string;
  opportunityId?: string;
  eventName: string; // Ex: 'Lead', 'Contact', 'Schedule', 'Purchase', 'QualifiedLead'
  eventId?: string; // Deduplicação
  value?: number;
  currency?: string;
  contentName?: string;
  ctwaClid?: string;
  actionSource?: "chat" | "system_generated" | "website" | "other";
  customData?: Record<string, any>;
  testEventCode?: string;
  userDataOverride?: {
    phone?: string;
    email?: string;
    name?: string;
  };
}

export interface MetaCapiResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  eventId?: string;
  fbtraceId?: string;
  response?: any;
  error?: string;
}

/**
 * Normaliza e gera hash SHA-256 em hexadecimal conforme exigido pela Meta.
 */
export function hashSha256(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Normaliza número de telefone para o padrão E.164 exigido pela Meta (apenas dígitos, com DDI).
 * Ex: (11) 99999-8888 -> 5511999998888
 */
export function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;

  // Se tem 10 ou 11 dígitos, é um número brasileiro sem DDI
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  return digits;
}

/**
 * Divide nome completo em primeiro e último nome para envio à Meta.
 */
export function splitName(fullName: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Recupera as configurações da Meta CAPI para uma empresa, com fallback resiliente
 * para custom_variables caso a coluna meta_capi_settings ainda não tenha sido migrada.
 */
export async function getMetaCapiConfig(companyId: string): Promise<{
  config: MetaCapiSettings;
  effectiveToken: string | null;
}> {
  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    return {
      config: {
        enabled: false,
        pixel_id: "",
        track_ctwa_leads: true,
        track_stage_moves: true,
        track_won_purchases: true,
        currency: "BRL",
      },
      effectiveToken: null,
    };
  }

  const rawComp = company as any;
  const settings: Partial<MetaCapiSettings> =
    rawComp.meta_capi_settings || rawComp.custom_variables?.meta_capi || {};

  const config: MetaCapiSettings = {
    enabled: !!settings.enabled,
    pixel_id: settings.pixel_id || "",
    access_token: settings.access_token || "",
    test_event_code: settings.test_event_code || "",
    track_ctwa_leads: settings.track_ctwa_leads ?? true,
    track_stage_moves: settings.track_stage_moves ?? true,
    track_won_purchases: settings.track_won_purchases ?? true,
    default_lead_value: settings.default_lead_value,
    currency: settings.currency || "BRL",
  };

  const effectiveToken = config.access_token?.trim() || company.meta_system_user_token || null;

  return { config, effectiveToken };
}

/**
 * Despacha um evento de conversão para a Meta Conversions API (v21.0).
 */
export async function sendMetaCapiEvent(params: SendMetaCapiParams): Promise<MetaCapiResult> {
  const { companyId } = params;

  try {
    const { config, effectiveToken } = await getMetaCapiConfig(companyId);

    // Se a CAPI estiver desabilitada e não for um teste forçado
    if (!config.enabled && !params.testEventCode) {
      return {
        success: false,
        skipped: true,
        reason: "Meta CAPI está desativada nas configurações da empresa.",
      };
    }

    if (!config.pixel_id) {
      return {
        success: false,
        error: "ID do Pixel/Dataset da Meta não configurado.",
      };
    }

    if (!effectiveToken) {
      return {
        success: false,
        error:
          "Token de Acesso da Meta não encontrado (configure no CAPI ou conecte o Usuário do Sistema Meta).",
      };
    }

    let phone = params.userDataOverride?.phone;
    let email = params.userDataOverride?.email;
    let name = params.userDataOverride?.name;
    let ctwaClid = params.ctwaClid;

    // 1. Se tem contactId, buscar dados do contato
    let contactId = params.contactId;

    // 2. Se tem opportunityId, buscar dados da oportunidade
    let oppValue = params.value;
    let contentName = params.contentName;

    if (params.opportunityId) {
      const { data: opp } = await supabaseAdmin
        .from("opportunities")
        .select("id, title, value, contact_id")
        .eq("id", params.opportunityId)
        .maybeSingle();

      if (opp) {
        if (!contactId && opp.contact_id) contactId = opp.contact_id;
        if (oppValue === undefined && opp.value !== null && opp.value !== undefined) {
          oppValue = Number(opp.value);
        }
        if (!contentName && opp.title) contentName = opp.title;
      }
    }

    // Se temos contactId e faltam dados de usuário, buscar contato
    if (contactId && (!phone || !email || !name)) {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id, name, phone, email")
        .eq("id", contactId)
        .maybeSingle();

      if (contact) {
        if (!phone && contact.phone) phone = contact.phone;
        if (!email && contact.email) email = contact.email;
        if (!name && contact.name) name = contact.name;
      }
    }

    // 3. Se não temos ctwaClid explícito, buscar o mais recente do contato em ad_leads
    if (!ctwaClid && contactId) {
      const { data: adLead } = await supabaseAdmin
        .from("ad_leads")
        .select("ctwa_clid")
        .eq("contact_id", contactId)
        .not("ctwa_clid", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (adLead?.ctwa_clid) {
        ctwaClid = adLead.ctwa_clid;
      }
    }

    // 4. Montar user_data com SHA-256 e ctwa_clid não hasheado
    const userData: Record<string, any> = {};

    const normalizedPhone = normalizePhone(phone);
    const hashedPhone = hashSha256(normalizedPhone);
    if (hashedPhone) {
      userData.ph = [hashedPhone];
    }

    const hashedEmail = hashSha256(email);
    if (hashedEmail) {
      userData.em = [hashedEmail];
    }

    const { firstName, lastName } = splitName(name);
    const hashedFn = hashSha256(firstName);
    if (hashedFn) {
      userData.fn = [hashedFn];
    }

    const hashedLn = hashSha256(lastName);
    if (hashedLn) {
      userData.ln = [hashedLn];
    }

    // Regra da Meta: ctwa_clid NUNCA deve ser hasheado!
    if (ctwaClid) {
      userData.ctwa_clid = ctwaClid.trim();
    }

    // Se nenhum identificador foi fornecido, a Meta rejeitará o evento
    if (!hashedPhone && !hashedEmail && !userData.ctwa_clid) {
      // Para testes manuais onde o contato não foi especificado, usamos um fallback de teste seguro
      if (params.testEventCode) {
        userData.ph = [hashSha256("5511999999999")!];
        userData.em = [hashSha256("test@atendi.ai")!];
      } else {
        return {
          success: false,
          error:
            "Nenhum dado de identificação do usuário disponível (telefone, email ou ctwa_clid).",
        };
      }
    }

    // 5. Montar custom_data
    const customData: Record<string, any> = {
      ...(params.customData || {}),
    };

    const currency = params.currency || config.currency || "BRL";
    if (oppValue !== undefined && oppValue !== null) {
      customData.value = Number(oppValue);
      customData.currency = currency;
    } else if (params.eventName === "Lead" && config.default_lead_value) {
      customData.value = Number(config.default_lead_value);
      customData.currency = currency;
    }

    if (contentName) {
      customData.content_name = contentName;
    }

    // 6. Montar payload do evento CAPI (v21.0)
    const eventId =
      params.eventId || `atendi_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const testCode = params.testEventCode || config.test_event_code || undefined;

    const eventPayload: Record<string, any> = {
      event_name: params.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: params.actionSource || (ctwaClid ? "chat" : "system_generated"),
      user_data: userData,
    };

    if (Object.keys(customData).length > 0) {
      eventPayload.custom_data = customData;
    }

    const requestBody: Record<string, any> = {
      data: [eventPayload],
    };

    if (testCode) {
      requestBody.test_event_code = testCode;
    }

    // 7. Enviar requisição para Meta Graph API
    const metaEndpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(config.pixel_id)}/events`;

    const metaRes = await fetch(metaEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = await metaRes.json().catch(() => ({}));
    const isSuccess = metaRes.ok && (!responseJson.error || responseJson.events_received > 0);

    const logStatus = isSuccess ? "success" : "error";
    let errorMessage = isSuccess ? null : responseJson.error?.message || `HTTP ${metaRes.status}`;

    if (!isSuccess && responseJson.error) {
      if (responseJson.error.code === 100 && responseJson.error.error_subcode === 33) {
        errorMessage = `Permissão insuficiente no Pixel/Dataset '${config.pixel_id}'. O token de acesso utilizado não possui a permissão 'ads_management' ou não tem acesso a este conjunto de dados. Gere um Token de Acesso dedicado na aba 'Configurações > API de Conversões' do seu Pixel no Gerenciador de Eventos da Meta e cole-o no campo 'Token de Acesso (CAPI)'.`;
      } else if (responseJson.error.code === 190) {
        errorMessage = `Token de acesso da Meta expirado ou revogado (${responseJson.error.message}). Gere um novo token no Gerenciador de Eventos.`;
      }
    }

    // 8. Gravar log em meta_capi_logs (com tolerância a falha caso tabela não exista)
    try {
      await supabaseAdmin.from("meta_capi_logs").insert({
        company_id: companyId,
        contact_id: contactId || null,
        opportunity_id: params.opportunityId || null,
        event_name: params.eventName,
        event_id: eventId,
        ctwa_clid: ctwaClid || null,
        value: customData.value || null,
        currency: customData.currency || currency,
        status: logStatus,
        test_code: testCode || null,
        request_payload: requestBody,
        response_payload: responseJson,
        error_message: errorMessage,
      });
    } catch (logErr: any) {
      // Ignora erro 42P01 (relação meta_capi_logs inexistente)
      if (logErr?.code !== "42P01") {
        console.warn("[Meta CAPI] Falha ao registrar log:", logErr);
      }
    }

    if (!isSuccess) {
      return {
        success: false,
        eventId,
        error: errorMessage || "Erro desconhecido ao enviar evento para a Meta.",
        response: responseJson,
      };
    }

    return {
      success: true,
      eventId,
      fbtraceId: responseJson.fbtrace_id,
      response: responseJson,
    };
  } catch (err: any) {
    console.error("[Meta CAPI] Exceção ao despachar evento:", err);
    return {
      success: false,
      error: err.message || "Falha de comunicação com a Meta Conversions API.",
    };
  }
}
