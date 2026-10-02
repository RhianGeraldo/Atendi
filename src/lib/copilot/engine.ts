/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CopilotContext } from "./types";
import { getAuthorizedCopilotActions, executeCopilotAction } from "./registry";

export interface CopilotEngineInput {
  company: {
    id: string;
    name: string;
    ai_settings: any;
  };
  context: CopilotContext;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  currentRoute?: string;
  screenContext?: Record<string, any>;
}

export interface CopilotEngineOutput {
  reply: string;
  executedActions: Array<{
    tool: string;
    label?: string;
    args: any;
    success: boolean;
    resultSummary: string;
  }>;
}

export async function runCopilotEngine({
  company,
  context,
  messages,
  currentRoute,
  screenContext,
}: CopilotEngineInput): Promise<CopilotEngineOutput> {
  const aiSettings = company.ai_settings || {};

  // 1. Resolver Provedor e Chave de API
  let provider = aiSettings.engines?.chatbot || aiSettings.engines?.text || "openai";

  if (!provider || provider === "none") {
    if (aiSettings.keys?.openai) provider = "openai";
    else if (aiSettings.keys?.groq) provider = "groq";
    else if (aiSettings.keys?.openrouter) provider = "openrouter";
    else provider = "openai";
  }

  let apiKey = aiSettings.keys?.[provider];
  if (!apiKey) {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === "groq" && process.env.GROQ_API_KEY) {
      apiKey = process.env.GROQ_API_KEY;
    }
  }

  // Se nenhuma chave estiver configurada, responde amigavelmente sem estourar erro
  if (!apiKey) {
    return {
      reply: `⚠️ **Configuração de IA necessária**\n\nNenhuma chave de API de inteligência artificial foi configurada para a empresa **${company.name}**.\n\nPara ativar o Copilot:\n1. Acesse o menu **Configurações**.\n2. Na aba **Agentes IA**, cadastre sua chave da **OpenAI**, **Groq** ou **OpenRouter**.\n3. Salve as alterações e volte a conversar com o Copilot.`,
      executedActions: [],
    };
  }

  let baseUrl = "https://api.openai.com/v1/chat/completions";
  let modelName = aiSettings.active_chatbot_model || "gpt-4o-mini";

  if (provider === "groq") {
    baseUrl = "https://api.groq.com/openai/v1/chat/completions";
    modelName = "llama-3.3-70b-versatile";
  } else if (provider === "openrouter") {
    baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    modelName = aiSettings.active_chatbot_model || "openai/gpt-4o-mini";
  }

  // 2. Obter ações autorizadas para o usuário
  const authorizedActions = getAuthorizedCopilotActions(context);

  const isAdmin = context.userRole === "admin_company" || context.userRole === "super_admin";
  const isManager = context.userRole === "manager";

  // 3. Montar System Prompt especializado
  const availableActionsList = authorizedActions
    .map((a) => `- ${a.name}: ${a.label} (${a.description})`)
    .join("\n");

  const now = new Date();
  const dataExtenso = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  const horaExtenso = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const amanhaIso = tomorrow.toISOString().split("T")[0];

  const systemPrompt = `Você é o Atendi Copilot, o assistente oficial inteligente integrado na plataforma AtendiAI.
Você auxilia colaboradores e gestores em suas rotinas diárias e executa ações no sistema.

[DATA E HORA ATUAL DO SISTEMA]
- Data de Hoje: ${dataExtenso}
- Hora Atual: ${horaExtenso} (Horário de Brasília)
- Ano Corrente: ${now.getFullYear()}
- Data de Amanhã: ${amanhaIso}
- DIRETRIZ TEMPORAL MANDATÓRIA: Para termos como "hoje", "amanhã", dias da semana ou prazos, calcule a data estritamente com base na Data Atual fornecida acima (${dataExtenso}). NUNCA utilize anos antigos como 2023 ou 2024.

[USUÁRIO ATUAL]
- Nome: ${context.userName || "Colaborador"}
- Papel: ${context.userRole.toUpperCase()} (${isAdmin ? "Administrador da Empresa" : isManager ? "Gerente" : "Atendente Operacional"})
- Empresa: ${context.companyName}
- Unidade: ${context.unitName || "Visão Matriz (Todas as Unidades)"}
- Menus Permitidos: ${context.allowedMenus.join(", ")}
${currentRoute ? `- Tela Atual no Sistema: ${currentRoute}` : ""}
${screenContext ? `- Contexto da Tela: ${JSON.stringify(screenContext)}` : ""}

[AÇÕES DISPONÍVEIS PARA ESTE USUÁRIO]
${availableActionsList}

[DIRETRIZES DE ATUAÇÃO]
1. Se o usuário pedir para realizar uma ação cadastrada acima (ex: alterar SLA, criar etiqueta, criar tarefa, mover oportunidade, consultar playbook), execute a ferramenta ou responda em formato estruturado.
2. ${
    isAdmin
      ? "O usuário é ADMINISTRADOR: você pode executar ajustes de configurações, SLAs, funis de vendas, etiquetas e procedimentos."
      : "O usuário é ATENDENTE: você NÃO PODE alterar configurações do sistema nem horários de filiais. Se ele solicitar algo restrito a administradores, recuse educadamente explicando que seu perfil tem foco em atendimento e vendas."
  }
3. Responda em Português (Brasil) de forma clara, prestativa e objetiva. Use formatação Markdown (tópicos, negrito, tabelas) quando apropriado.
4. REGRA CRÍTICA para envio de mensagens via WhatsApp (enviar_mensagem_proativa):
   - NUNCA use o nome da unidade do contexto (ex: "Visão Matriz", "Serra") como valor do campo "instance_name".
   - O campo "instance_name" deve ser o valor técnico retornado pela ferramenta listar_instancias_whatsapp (campo "instance_name" do resultado).
   - SEMPRE chame listar_instancias_whatsapp PRIMEIRO (filtrando pela unidade desejada com "unidade_nome") para obter o instance_name correto antes de chamar enviar_mensagem_proativa.
   - Após listar, escolha a instância cujo campo "instance_name" corresponda ao canal/unidade solicitado pelo usuário.
   - SEMPRE passe o campo "nome_contato" com o nome que o usuário citou (ex: "Rian Geraldo") para que o sistema valide a integridade antes do disparo.
5. PROTOCOLO OBRIGATÓRIO DE CONFIRMAÇÃO DE DESTINATÁRIO NO WHATSAPP:
   - Enviar WhatsApp é uma ação real e externa que notifica o cliente instantaneamente.
   - Se você buscou um contato por telefone ou final de dígitos (ex: 'final 9987') e o nome registrado no sistema for DIFERENTE do nome que o usuário mencionou (ex: usuário pediu para enviar para 'Rian Geraldo' e o número retornado no sistema pertence a 'Restaurante e lanchonete Borges Silva'):
     * NUNCA envie a mensagem diretamente no mesmo turno!
     * PARE a execução de ferramentas imediatamente.
     * Apresente ao usuário os dados encontrados e peça confirmação:
       "Localizei o contato **[Nome Encontrado no Sistema]** com o telefone **[Telefone]** (Unidade: **[Unidade]**). Como o nome cadastrado é diferente de **[Nome Solicitado]**, você confirma o envio da mensagem para este número?"
   - Se a busca retornar múltiplos contatos com nomes ou números parecidos, liste-os e pergunte para qual deles enviar antes de disparar.
   - Somente após o usuário responder confirmando expressamente (ex: "Sim, pode enviar", "É ele mesmo"), chame enviar_mensagem_proativa com o parâmetro "confirmado: true".
6. EXECUÇÃO COMPLETA DE MÚLTIPLAS AÇÕES (FLUXOS COMPOSTOS):
   - Se o usuário pediu mais de uma ação no diálogo (ex: "Envie uma mensagem para fulano E crie uma tarefa para amanhã às 14h"):
   - Assim que o envio da mensagem for realizado, NÃO pare: execute IMEDIATAMENTE a ação seguinte (chame criar_tarefa com a data/hora solicitadas). Conclua todas as etapas que o usuário pediu.
7. RESOLUÇÃO DE CONTATOS E PARÂMETROS:
   - "Rian", "Rhian" e "Ryan" referem-se ao mesmo nome em português. Se buscar um e não encontrar, busque os outros.
   - Quando tiver o número de telefone, passe-o SEMPRE no campo "telefone". Nunca passe número de telefone no campo "contato_id" (que espera UUID).`;

  // Mapear ações para o formato de ferramentas padrão
  const toolsPayload = authorizedActions.map((action) => ({
    type: "function",
    function: {
      name: action.name,
      description: `${action.label}: ${action.description}`,
      parameters: action.parameters,
    },
  }));

  const executedActions: CopilotEngineOutput["executedActions"] = [];

  const conversationHistory: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-14),
  ];

  try {
    let turns = 0;
    const maxTurns = 6;
    let finalContent = "";

    while (turns < maxTurns) {
      turns++;

      const payload: any = {
        model: modelName,
        messages: conversationHistory,
        temperature: 0.3,
      };

      if (toolsPayload.length > 0) {
        payload.tools = toolsPayload;
        payload.tool_choice = "auto";
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter"
            ? {
                "HTTP-Referer": "https://atendiai.com.br",
                "X-Title": "Atendi Copilot",
              }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Se o provedor rejeitar "tools" (erro 400 comum em alguns modelos do OpenRouter)
      if (!response.ok && toolsPayload.length > 0 && response.status === 400) {
        console.warn(
          `[CopilotEngine] Provedor ${provider} rejeitou tools. Tentando modo conversacional sem tools...`,
        );
        delete payload.tools;
        delete payload.tool_choice;
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 30000);
        response = await fetch(baseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller2.signal,
        });
        clearTimeout(timeoutId2);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CopilotEngine] Erro na API do LLM:`, errorText);
        return {
          reply: `Desculpe, ocorreu uma instabilidade na comunicação com o motor de inteligência artificial (${provider}): ${response.status}. Verifique suas credenciais em Configurações.`,
          executedActions: [],
        };
      }

      const resJson = await response.json();
      const assistantMessage = resJson.choices?.[0]?.message;

      if (!assistantMessage) {
        return {
          reply: "Não foi possível obter uma resposta válida do assistente.",
          executedActions: [],
        };
      }

      // 4. Se o modelo chamou ferramentas nativas
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        conversationHistory.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const actionName = toolCall.function.name;
          let parsedParams = {};
          try {
            parsedParams = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            parsedParams = {};
          }

          // Executar ação nativa no sistema
          const actionResult = await executeCopilotAction(actionName, parsedParams, context);

          executedActions.push({
            tool: actionName,
            args: parsedParams,
            success: actionResult.success,
            resultSummary: actionResult.message,
          });

          conversationHistory.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(actionResult),
          });
        }
      } else {
        // Resposta textual final
        finalContent = assistantMessage.content || "";
        break;
      }
    }

    if (!finalContent && executedActions.length > 0) {
      const falhas = executedActions.filter((a) => !a.success);
      const sucessos = executedActions.filter((a) => a.success);

      if (falhas.length > 0) {
        finalContent =
          `⚠️ **Atenção:** Algumas ações não puderam ser concluídas:\n` +
          falhas.map((f) => `- ❌ ${f.resultSummary}`).join("\n") +
          (sucessos.length > 0
            ? `\n\n✅ **Ações concluídas:**\n` +
              sucessos.map((s) => `- ${s.resultSummary}`).join("\n")
            : "");
      } else {
        finalContent = sucessos.map((s) => s.resultSummary).join("\n\n");
      }
    }

    return {
      reply: finalContent,
      executedActions,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return {
        reply: "A resposta do assistente demorou demais (timeout de 30s). Tente novamente.",
        executedActions,
      };
    }
    console.error(`[CopilotEngine] Exceção no motor:`, err);
    return {
      reply: `Desculpe, ocorreu um erro ao processar sua solicitação: ${err?.message || "Erro desconhecido"}.`,
      executedActions,
    };
  }
}
