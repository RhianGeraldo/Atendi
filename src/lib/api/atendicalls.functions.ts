import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  resolveAtendiCallsConfig,
  getAtendiCallsConnectStatus,
  createAtendiCallsInstance,
  startAtendiCallsVoiceCall,
  startAtendiCallsHumanCall,
  sendAtendiCallsWebRTCOffer,
  syncCompanyKeysToAtendiCalls,
  hangupAtendiCallsVoiceCall,
  getAtendiCallsCallDetails,
  type AtendiCallsAgentConfig,
} from "@/lib/server/atendicalls-api";
import { getPhoneVariants } from "@/lib/utils";

/**
 * Consulta o status da linha WhatsApp no AtendiCalls (conectada ou QR Code).
 * Se autoCreate for true e a instância ainda não possuir linha na VPS,
 * cria automaticamente e retorna o QR Code gerado.
 */
export const getAtendiCallsStatusAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      instanceId: z.string().uuid().optional().nullable(),
      companyId: z.string().uuid().optional().nullable(),
      token: z.string().optional().nullable(),
      apiUrl: z.string().optional().nullable(),
      autoCreate: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    // 1. Se autoCreate ativo e temos instanceId, verifica se precisa criar a linha
    if (data.autoCreate && data.instanceId && !data.token) {
      const { data: inst } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, name, instance_name, atendicalls_token, atendicalls_url")
        .eq("id", data.instanceId)
        .maybeSingle();

      if (inst && !inst.atendicalls_token) {
        try {
          // O mesmo nome que já está no Atendi / na outra conexão (EvoGo/Stevo)
          const targetName = inst.instance_name || inst.name || "whatsapp";
          const created = await createAtendiCallsInstance({
            name: targetName,
            apiUrl: inst.atendicalls_url || undefined,
          });
          const newToken = created.token || created.instance?.token;
          if (newToken) {
            await supabaseAdmin
              .from("whatsapp_instances")
              .update({
                atendicalls_token: newToken,
                atendicalls_url: "https://calls.esteticaelaser.com.br",
                wavoip_token: newToken,
              })
              .eq("id", data.instanceId);
          }
          const qrcodeBase64 =
            created.qrcode?.base64 || (typeof created.qrcode === "string" ? created.qrcode : null);
          return {
            success: true,
            status: created.status as any,
            isConnected: false,
            qrcode: qrcodeBase64,
            instance: created.instance,
            apiUrl: inst.atendicalls_url || "https://calls.esteticaelaser.com.br",
            token: newToken,
          };
        } catch (createErr: any) {
          console.warn("[AtendiCalls] Falha ao auto-criar instância na VPS:", createErr);
          return {
            success: false,
            status: "disconnected" as const,
            isConnected: false,
            qrcode: null,
            instance: null,
            error: createErr.message || "Falha ao criar linha de voz na VPS",
            apiUrl: inst.atendicalls_url || "https://calls.esteticaelaser.com.br",
          };
        }
      }
    }

    let config: { token: string; apiUrl: string };
    if (data.token && data.token.trim()) {
      config = {
        token: data.token.trim(),
        apiUrl: (data.apiUrl?.trim() || "https://calls.esteticaelaser.com.br").replace(/\/+$/, ""),
      };
    } else {
      config = await resolveAtendiCallsConfig(data.instanceId, data.companyId);
    }
    try {
      const status = await getAtendiCallsConnectStatus(config);
      return { success: true, ...status, apiUrl: config.apiUrl };
    } catch (err: any) {
      return {
        success: false,
        status: "disconnected" as const,
        isConnected: false,
        qrcode: null,
        instance: null,
        error: err.message,
        apiUrl: config.apiUrl,
      };
    }
  });

/**
 * Cria ou regenera a linha do AtendiCalls no motor da VPS para uma instância
 */
export const createAtendiCallsInstanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      instanceId: z.string().uuid(),
      name: z.string().optional().nullable(),
      customToken: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { data: inst, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, name, instance_name, company_id, atendicalls_token, atendicalls_url")
      .eq("id", data.instanceId)
      .single();

    if (error || !inst) {
      throw new Error("Instância não encontrada.");
    }

    // O mesmo nome que já está no Atendi / na outra conexão (EvoGo/Stevo)
    const lineName = inst.instance_name || data.name?.trim() || inst.name || "whatsapp";
    const res = await createAtendiCallsInstance({
      name: lineName,
      token: data.customToken?.trim() || undefined,
      apiUrl: inst.atendicalls_url || undefined,
    });

    const token = res.token || res.instance?.token;
    if (token) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({
          atendicalls_token: token,
          atendicalls_url: "https://calls.esteticaelaser.com.br",
          wavoip_token: token,
        })
        .eq("id", data.instanceId);
    }

    const qrcodeBase64 = res.qrcode?.base64 || (typeof res.qrcode === "string" ? res.qrcode : null);

    return {
      success: true,
      status: res.status,
      token,
      qrcode: qrcodeBase64,
      instance: res.instance,
    };
  });

/**
 * Desconecta / desvincula a linha de voz do AtendiCalls da instância
 */
export const disconnectAtendiCallsInstanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      instanceId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({
        atendicalls_token: null,
      })
      .eq("id", data.instanceId);

    return { success: true };
  });

/**
 * Dispara uma chamada telefônica de voz pelo AtendiCalls
 * Suporta modo atendente humano (WebRTC pelo navegador) ou agente com IA
 */
export const startAtendiCallsVoiceCallAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      phone: z.string().min(8),
      contactName: z.string().optional().nullable(),
      contactId: z.string().uuid().optional().nullable(),
      instanceId: z.string().uuid().optional().nullable(),
      fromToken: z.string().optional().nullable(),
      companyId: z.string().uuid().optional().nullable(),
      mode: z.enum(["human", "ai"]).default("human"),
      systemPrompt: z.string().optional().nullable(),
      firstMessage: z.string().optional().nullable(),
      variables: z.record(z.any()).optional().nullable(),
      voice: z.string().optional().nullable(),
      model: z.string().optional().nullable(),
      provider: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const cleanPhone = data.phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // 1. Resolver instância se fromToken foi passado
    let effectiveInstanceId = data.instanceId;
    let effectiveCompanyId = data.companyId;

    if (!effectiveInstanceId && data.fromToken) {
      const { data: instByToken } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, company_id")
        .or(`atendicalls_token.eq.${data.fromToken},wavoip_token.eq.${data.fromToken}`)
        .limit(1);
      if (instByToken && instByToken.length > 0) {
        effectiveInstanceId = instByToken[0].id;
        if (!effectiveCompanyId) effectiveCompanyId = instByToken[0].company_id;
      }
    }

    // 2. Resolver empresa e contato
    let effectiveContactId = data.contactId;

    if (!effectiveContactId) {
      const variants = getPhoneVariants(formattedPhone);
      const { data: contacts } = await supabaseAdmin
        .from("contacts")
        .select("id, company_id, name")
        .in("phone", variants.length ? variants : [formattedPhone])
        .limit(1);

      if (contacts && contacts.length > 0) {
        effectiveContactId = contacts[0].id;
        if (!effectiveCompanyId) effectiveCompanyId = contacts[0].company_id;
      }
    }

    if (!effectiveCompanyId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", context.userId)
        .single();
      effectiveCompanyId = profile?.company_id;
    }

    if (!effectiveCompanyId) {
      throw new Error("Não foi possível identificar a empresa para realizar a ligação.");
    }

    // 3. Resolver instância padrão se ainda não identificada
    if (!effectiveInstanceId) {
      const { data: inst } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .order("status", { ascending: false })
        .limit(1);
      effectiveInstanceId = inst?.[0]?.id || null;
    }

    // 4. Resolver credenciais AtendiCalls
    const config = await resolveAtendiCallsConfig(effectiveInstanceId, effectiveCompanyId);
    const contactDisplayName = data.contactName || "Cliente";

    // Inicia chamada para o operador humano atender pelo navegador via WebRTC
    const result = await startAtendiCallsHumanCall({
      phone: formattedPhone,
      config,
    });
    const callId = result.callId;
    const sessionId = result.sessionId;

    // 5. Registrar entrada inicial em call_logs com status CALLING
    if (callId) {
      await supabaseAdmin.from("call_logs").upsert(
        {
          call_id: callId,
          wavoip_call_id: callId,
          company_id: effectiveCompanyId,
          whatsapp_instance_id: effectiveInstanceId,
          contact_id: effectiveContactId,
          assigned_agent_id: context.userId,
          direction: "OUTGOING",
          status: "CALLING",
          peer_number: formattedPhone,
          started_at: new Date().toISOString(),
          provider: "atendicalls",
          metadata: {
            initiated_by: context.userId,
            sessionId,
          },
        },
        { onConflict: "call_id" },
      );
    }

    return {
      success: true,
      callId,
      sessionId,
      phone: formattedPhone,
      contactName: contactDisplayName,
      token: config.token,
      apiUrl: config.apiUrl,
    };
  });

/**
 * Negocia SDP Offer com o motor AtendiCalls para estabelecer áudio WebRTC bidirecional no navegador
 */
export const sendAtendiCallsWebRTCOfferAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      callId: z.string(),
      sessionId: z.string().optional().nullable(),
      token: z.string().optional().nullable(),
      apiUrl: z.string().optional().nullable(),
      sdpOffer: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const config = await resolveAtendiCallsConfig(null, null);
    if (data.token) config.token = data.token;
    if (data.apiUrl) config.apiUrl = data.apiUrl;

    const res = await sendAtendiCallsWebRTCOffer({
      callId: data.callId,
      sessionId: data.sessionId || undefined,
      sdpOffer: data.sdpOffer,
      config,
    });

    return { success: true, sdpAnswer: res.sdpAnswer };
  });

/**
 * Desliga chamada em andamento
 */
export const hangupAtendiCallsVoiceCallAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      callId: z.string().min(1),
      sessionId: z.string().optional().nullable(),
      instanceId: z.string().uuid().optional().nullable(),
      companyId: z.string().uuid().optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const config = await resolveAtendiCallsConfig(data.instanceId, data.companyId);
    const hungUp = await hangupAtendiCallsVoiceCall(
      data.callId,
      config,
      data.sessionId || undefined,
    );

    if (hungUp) {
      await supabaseAdmin
        .from("call_logs")
        .update({ status: "ENDED", ended_at: new Date().toISOString() })
        .eq("call_id", data.callId);
    }

    return { success: hungUp };
  });

/**
 * Consulta e sincroniza em tempo real o status de uma chamada ativa com o motor AtendiCalls
 */
export const syncAtendiCallsCallStatusAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      callId: z.string().min(1),
      instanceId: z.string().uuid().optional().nullable(),
      companyId: z.string().uuid().optional().nullable(),
      token: z.string().optional().nullable(),
      apiUrl: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    let effectiveInstanceId = data.instanceId;
    let effectiveCompanyId = data.companyId;

    // Se não tiver instanceId ou token, consulta o call_logs para descobrir a instância exata da chamada
    if (!data.token && !effectiveInstanceId) {
      const { data: callLogRow } = await supabaseAdmin
        .from("call_logs")
        .select("whatsapp_instance_id, company_id")
        .eq("call_id", data.callId)
        .maybeSingle();

      if (callLogRow) {
        effectiveInstanceId = callLogRow.whatsapp_instance_id;
        if (!effectiveCompanyId) effectiveCompanyId = callLogRow.company_id;
      }
    }

    const config = await resolveAtendiCallsConfig(effectiveInstanceId, effectiveCompanyId);
    if (data.token && data.token.trim()) {
      config.token = data.token.trim();
    }
    if (data.apiUrl && data.apiUrl.trim()) {
      config.apiUrl = data.apiUrl.trim().replace(/\/+$/, "");
    }

    if (!config.token) {
      return { success: false, status: "unknown" };
    }

    try {
      const details = await getAtendiCallsCallDetails(data.callId, config);
      const rawStatus = (details.call?.status || details.call?.Status || "").toLowerCase();
      const isConnected =
        rawStatus === "connected" || rawStatus === "active" || rawStatus === "in_progress";
      const isEnded =
        !isConnected &&
        (details.isEnded ||
          rawStatus === "ended" ||
          rawStatus === "terminated" ||
          rawStatus === "failed");

      if (isConnected) {
        // Marca como ACTIVE no banco se ainda não estiver
        await supabaseAdmin
          .from("call_logs")
          .update({ status: "ACTIVE" })
          .eq("call_id", data.callId)
          .neq("status", "ACTIVE")
          .neq("status", "ENDED");

        return { success: true, status: "ACTIVE" };
      }

      if (isEnded) {
        // Formata transcrição das falas da IA e do Cliente
        let transcriptText: string | null = null;
        if (Array.isArray(details.transcript) && details.transcript.length > 0) {
          transcriptText = details.transcript
            .map((t: any) => `${t.role === "assistant" ? "Atendente (IA)" : "Cliente"}: ${t.text}`)
            .join("\n");
        }

        const updatePayload: any = {
          status: "ENDED",
          ended_at: new Date().toISOString(),
          recording_url: `/api/calls/${data.callId}/audio`,
        };
        if (transcriptText) {
          updatePayload.transcription = transcriptText;
        }

        await supabaseAdmin
          .from("call_logs")
          .update(updatePayload)
          .eq("call_id", data.callId)
          .neq("status", "ENDED");

        return { success: true, status: "ENDED", transcript: transcriptText };
      }

      return { success: true, status: "RINGING" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
