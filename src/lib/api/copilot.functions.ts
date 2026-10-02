/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserEffectiveMenus } from "@/lib/permissions";
import type { CopilotContext, CopilotRole } from "@/lib/copilot/types";
import { runCopilotEngine } from "@/lib/copilot/engine";

// 1. Ação para processar mensagem e executar ações nativas da plataforma
export const copilotSendMessageAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        })
      ),
      currentRoute: z.string().optional(),
      selectedUnitId: z.string().uuid().optional().nullable(),
      screenContext: z.record(z.any()).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { companyId, messages, currentRoute, selectedUnitId, screenContext } = data;

    // 1. Carregar perfil completo do usuário autenticado
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, name, email, role, department_id, has_matriz_access, custom_role_id, allowed_menus, custom_role:company_roles(id, name, allowed_menus, base_role), user_units(unit_id, role)"
      )
      .eq("id", userId)
      .single();

    if (profErr || !profile) {
      throw new Error("Perfil de usuário não localizado.");
    }

    // 2. Carregar dados da empresa e chaves de IA (ai_settings)
    const { data: company, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, ai_settings")
      .eq("id", companyId)
      .single();

    if (compErr || !company) {
      throw new Error("Empresa não encontrada.");
    }

    // 3. Determinar unidade de contexto
    let unitName: string | null = null;
    let effectiveUnitId = selectedUnitId || null;

    if (!effectiveUnitId && !profile.has_matriz_access && profile.role !== "admin_company" && profile.role !== "super_admin") {
      const userUnits = (profile.user_units as any[]) || [];
      if (userUnits.length > 0) {
        effectiveUnitId = userUnits[0].unit_id;
      }
    }

    if (effectiveUnitId) {
      const { data: u } = await supabaseAdmin
        .from("units")
        .select("name")
        .eq("id", effectiveUnitId)
        .single();
      if (u?.name) unitName = u.name;
    }

    // 4. Calcular permissões de menus e perfil
    const effectiveMenus = getUserEffectiveMenus(profile as any);
    const userRole = (profile.role || "agent") as CopilotRole;
    const userUnits = ((profile.user_units as any[]) || []).map((u) => u.unit_id);

    // 5. Montar contexto de execução do Copilot
    const copilotContext: CopilotContext = {
      companyId,
      companyName: company.name,
      userId,
      userName: profile.name || "Colaborador",
      userEmail: profile.email || "",
      userRole,
      allowedMenus: effectiveMenus,
      hasMatrizAccess: Boolean(profile.has_matriz_access || userRole === "admin_company" || userRole === "super_admin"),
      unitId: effectiveUnitId,
      unitName,
      userUnitIds: userUnits,
    };

    // 6. Executar motor nativo do Copilot
    const result = await runCopilotEngine({
      company,
      context: copilotContext,
      messages,
      currentRoute,
      screenContext,
    });

    return {
      reply: result.reply,
      executedActions: result.executedActions,
      userRole,
      userName: profile.name,
    };
  });

// 2. Ação para obter sugestões rápidas de prompt com base na tela e permissão
export const copilotGetSuggestionsAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      currentRoute: z.string().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const { currentRoute } = data;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const role = (profile?.role || "agent") as CopilotRole;
    const isAdmin = role === "admin_company" || role === "super_admin";

    if (isAdmin) {
      if (currentRoute?.startsWith("/settings")) {
        return [
          "Como está configurado o SLA de atendimento hoje?",
          "Crie uma nova etiqueta chamada 'Cliente VIP' com cor verde",
          "Adicione o motivo de encerramento 'Negociação de Preço'",
          "Quais colaboradores estão cadastrados na empresa?",
        ];
      }
      if (currentRoute?.startsWith("/pipeline")) {
        return [
          "Adicione uma nova etapa 'Demonstração Agendada' no funil de vendas",
          "Quantas oportunidades temos no funil e qual o valor total?",
          "Crie um novo funil de pós-venda para clientes fechados",
        ];
      }
      return [
        "Qual o resumo das métricas e taxa de conversão desta semana?",
        "Cadastre um procedimento de cancelamento no Playbook",
        "Ajuste o limite de primeira resposta do SLA para 5 minutos",
        "Liste todas as etiquetas cadastradas",
      ];
    }

    // Sugestões para Atendentes
    if (currentRoute?.startsWith("/conversations")) {
      return [
        "Como responder a uma objeção de preço alto segundo o Playbook?",
        "Crie uma tarefa para eu retornar para o cliente amanhã às 14h",
        "Pesquise o contato do cliente pelo telefone ou nome",
        "Consulte no Playbook o procedimento de reembolso",
      ];
    }

    if (currentRoute?.startsWith("/pipeline")) {
      return [
        "Quais funis e etapas temos disponíveis no CRM?",
        "Crie uma nova oportunidade de R$ 1.500 no funil",
        "Mova a oportunidade do lead para a próxima etapa",
      ];
    }

    return [
      "Quais tarefas pendentes eu tenho para hoje?",
      "Consulte no Playbook as formas de pagamento aceitas",
      "Como posso acelerar o fechamento de uma proposta?",
      "Pesquise contatos cadastrados recentemente",
    ];
  });

// 3. Ação para transcrever áudio gravado pelo usuário via motor Whisper
export const copilotTranscribeAudioAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      audioBase64: z.string().min(1, "Áudio é obrigatório"),
      mimeType: z.string().optional().default("audio/webm"),
    })
  )
  .handler(async ({ data }) => {
    const { companyId, audioBase64, mimeType } = data;

    // 1. Carregar configurações de IA da empresa
    const { data: company, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, ai_settings")
      .eq("id", companyId)
      .single();

    if (compErr || !company) {
      throw new Error("Empresa não encontrada.");
    }

    const aiSettings = company.ai_settings || {};

    // 2. Determinar provedor e chave de transcrição
    let provider = aiSettings.engines?.transcription;
    if (!provider || provider === "none") {
      if (aiSettings.keys?.groq) provider = "groq";
      else if (aiSettings.keys?.openai) provider = "openai";
      else if (aiSettings.keys?.openrouter) provider = "openrouter";
      else if (process.env.GROQ_API_KEY) provider = "groq";
      else if (process.env.OPENAI_API_KEY) provider = "openai";
      else provider = "groq";
    }

    let apiKey = aiSettings.keys?.[provider];
    if (!apiKey) {
      if (provider === "groq" && process.env.GROQ_API_KEY) apiKey = process.env.GROQ_API_KEY;
      else if (provider === "openai" && process.env.OPENAI_API_KEY) apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
      throw new Error(
        `Nenhuma chave de API configurada para o provedor de transcrição (${provider}). Configure nas Configurações > IA.`
      );
    }

    // 3. Limpar base64 e detectar formato de áudio
    let cleanBase64 = audioBase64;
    if (cleanBase64.includes(",")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }

    const rawMime = mimeType || "audio/webm";
    let ext = "webm";
    if (rawMime.includes("mp4") || rawMime.includes("m4a")) ext = "mp4";
    else if (rawMime.includes("wav")) ext = "wav";
    else if (rawMime.includes("ogg")) ext = "ogg";
    else if (rawMime.includes("mp3") || rawMime.includes("mpeg")) ext = "mp3";
    else ext = "webm";

    const fileName = `audio.${ext}`;

    // 4. Chamar motor Whisper
    let response: Response;

    if (provider === "openrouter") {
      response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/whisper-1",
          input_audio: {
            data: cleanBase64,
            format: ext,
          },
        }),
      });
    } else {
      const buffer = Buffer.from(cleanBase64, "base64");
      const cleanMime = rawMime.split(";")[0];
      const blob = new Blob([buffer], { type: cleanMime });
      const formData = new FormData();
      formData.append("file", blob, fileName);

      let baseUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
      if (provider === "groq") {
        formData.append("model", "whisper-large-v3-turbo");
      } else {
        baseUrl = "https://api.openai.com/v1/audio/transcriptions";
        formData.append("model", "whisper-1");
      }

      formData.append("language", "pt");
      formData.append("response_format", "json");

      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData as any,
      });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("[copilotTranscribeAudioAction] Erro na API de transcrição:", response.status, err);
      throw new Error(`Falha na API de transcrição (${response.status}): ${err}`);
    }

    const apiData = await response.json();
    const text = (apiData.text || "").trim();

    return {
      success: true,
      text,
      provider,
    };
  });

