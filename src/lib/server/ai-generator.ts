import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";

export async function generateAndSendAiResponse(conversationId: string, companyId: string) {
  try {
    // 1. Fetch conversation details to verify AI is still active
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("ai_active, ai_agent_id, whatsapp_instance_id, contact_id, status, contacts(name, phone)")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) {
      console.error(`[ai-generator] Conversation not found: ${conversationId}`);
      return;
    }

    if (!conv.ai_active || !conv.ai_agent_id || conv.status === "resolved") {
      console.log(`[ai-generator] AI not active or conversation resolved. Aborting generation for ${conversationId}`);
      return;
    }

    // 2. Fetch AI Agent details
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("ai_agents")
      .select("*")
      .eq("id", conv.ai_agent_id)
      .single();

    if (agentErr || !agent || !agent.is_active) {
      console.error(`[ai-generator] AI Agent not found or inactive: ${conv.ai_agent_id}`);
      return;
    }

    // 3. Fetch Company AI Settings for API Keys
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("ai_settings, document, address, business_hours, custom_variables, name")
      .eq("id", companyId)
      .single();

    if (companyErr || !company || !company.ai_settings) {
      console.error(`[ai-generator] Company AI settings not found: ${companyId}`);
      return;
    }

    // Fetch Unit if applicable
    let unitData: any = null;
    if (conv.unit_id) {
      const { data: unit } = await supabaseAdmin
        .from("units")
        .select("document, address, business_hours, custom_variables, name")
        .eq("id", conv.unit_id)
        .single();
      unitData = unit;
    }

    const aiSettings = company.ai_settings as any;
    
    // Fetch colleagues (only the allowed agents configured as skills)
    let colleagues: any[] = [];
    if (agent.allowed_agent_ids && agent.allowed_agent_ids.length > 0) {
      const { data } = await supabaseAdmin
        .from('ai_agents')
        .select('id, name, ai_type, description')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .in('id', agent.allowed_agent_ids)
        .neq('id', agent.id);
      colleagues = data || [];
    }
    
    // Determine provider and API key
    let provider = agent.provider || 'default';
    if (provider === 'default') {
      provider = aiSettings.engines?.chatbot || 'openai';
    }

    const apiKey = aiSettings.keys?.[provider];
    if (!apiKey) {
      console.error(`[ai-generator] Missing API key for provider ${provider}`);
      return;
    }

    let baseUrl = 'https://api.openai.com/v1/chat/completions';
    if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    else if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    // 4. Fetch Conversation History (last 20 messages)
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("content, sender_type, created_at, media_type, transcription")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) return;

    // Sort to ascending order (oldest first)
    messages.reverse();

    // Merge custom variables, Unit overrides Company
    const compVars = typeof company.custom_variables === 'object' && company.custom_variables !== null ? company.custom_variables : {};
    const unitVars = (unitData && typeof unitData.custom_variables === 'object' && unitData.custom_variables !== null) ? unitData.custom_variables : {};
    const mergedCustomVars = { ...compVars, ...unitVars };

    // Format Info blocks
    const infoEmpresa = `EMPRESA: ${company.name || ''}\nCNPJ: ${company.document || ''}\nEndereço: ${company.address || ''}\nHorários: ${company.business_hours || ''}\n${Object.entries(compVars).length ? `Variáveis:\n${Object.entries(compVars).map(([k,v]) => `- ${k}: ${v}`).join('\n')}` : ''}`.trim();
    
    let infoUnidade = "";
    if (unitData) {
      infoUnidade = `UNIDADE: ${unitData.name || ''}\nCNPJ: ${unitData.document || ''}\nEndereço: ${unitData.address || ''}\nHorários: ${unitData.business_hours || ''}\n${Object.entries(unitVars).length ? `Variáveis:\n${Object.entries(unitVars).map(([k,v]) => `- ${k}: ${v}`).join('\n')}` : ''}`.trim();
    }

    // Helper to replace variables
    const applyVars = (text: string | null | undefined) => {
      if (!text) return "";
      let t = text;
      // Built-in vars
      if (conv.contacts?.name) t = t.replace(/\{\{nome_cliente\}\}/g, conv.contacts.name);
      if (conv.contacts?.phone) t = t.replace(/\{\{telefone\}\}/g, conv.contacts.phone);
      
      // Info Blocks
      t = t.replace(/\{\{info_empresa\}\}/g, infoEmpresa);
      t = t.replace(/\{\{info_unidade\}\}/g, infoUnidade || infoEmpresa); // fallback to empresa
      
      // Standard Fields (Unit fallback to Company)
      t = t.replace(/\{\{cnpj\}\}/g, unitData?.document || company.document || '');
      t = t.replace(/\{\{endereco\}\}/g, unitData?.address || company.address || '');
      t = t.replace(/\{\{horarios\}\}/g, unitData?.business_hours || company.business_hours || '');
      
      // Custom Vars
      for (const [key, value] of Object.entries(mergedCustomVars)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        t = t.replace(regex, String(value));
      }
      
      return t;
    };

    // 5. Construct Prompts
    const systemPromptParts = [];
    systemPromptParts.push(`Você é ${agent.name}.`);
    if (agent.prompt_personality) systemPromptParts.push(applyVars(agent.prompt_personality));
    if (agent.prompt_instructions) systemPromptParts.push(applyVars(agent.prompt_instructions));
    if (agent.prompt_extra_info) systemPromptParts.push(applyVars(agent.prompt_extra_info));
    
    if (agent.allow_handoff) {
      systemPromptParts.push(applyVars(agent.prompt_handoff) || `INSTRUÇÃO CRÍTICA PARA TRANSFERÊNCIA:\nSe você não souber como resolver o problema, TENTE ajudar primeiro fazendo perguntas para entender melhor a situação. NÃO transfira imediatamente na primeira dúvida. Transfira APENAS se: 1) O cliente pedir explicitamente para falar com um humano, OU 2) Após tentar ajudar, você tiver certeza absoluta que o problema requer suporte técnico/humano que foge totalmente da sua base de conhecimento. Para transferir, inclua EXATAMENTE a tag [TRANSFERIR: motivo detalhado] no final da sua resposta (e não faça perguntas ao cliente se for transferir, pois você não poderá mais responder).`);
    }

    if (agent.allow_resolution) {
      systemPromptParts.push(applyVars(agent.prompt_resolution) || `INSTRUÇÃO CRÍTICA PARA ENCERRAMENTO:
1. Se você acabou de oferecer uma solução ou instrução, NÃO encerre. Termine sua mensagem perguntando se funcionou e AGUARDE a resposta do cliente.
2. Só encerre se o cliente confirmar que o problema foi resolvido, ou se despedir, OU se você for instruído pelo [SISTEMA] a encerrar por falta de resposta.
Para encerrar, inclua EXATAMENTE a tag [ENCERRAR: resumo do que foi resolvido] no final da sua resposta.`);
    }

    if (colleagues && colleagues.length > 0) {
      const colleaguesList = colleagues.map(c => `- ${c.name} (ID: ${c.id}) - O que ele faz: ${c.description || c.ai_type}`).join('\n');
      systemPromptParts.push(`INSTRUÇÃO CRÍTICA PARA TRABALHO EM EQUIPE (MULTI-AGENTES):\nVocê trabalha em uma equipe. Se o assunto do cliente for de competência de outro agente, você DEVE transferir a conversa para ele. Para transferir para outro agente, inclua a tag [TRANSFERIR_AGENTE: X] no final da sua resposta, substituindo X pelo ID exato do colega desejado.\nNUNCA crie um loop infinito de transferências (não devolva para quem acabou de enviar).\nColegas disponíveis:\n${colleaguesList}`);
    }

    if (agent.allow_tasks) {
      systemPromptParts.push(applyVars(agent.prompt_tasks) || `INSTRUÇÃO PARA CRIAR TAREFA:\nVocê tem acesso direto ao CRM para criar tarefas de acompanhamento. Para criar uma tarefa, use a tag [CRIAR_TAREFA: Título | Descrição | YYYY-MM-DD HH:MM] no final da sua resposta.`);
    }

    if (agent.allow_opportunities) {
      systemPromptParts.push(applyVars(agent.prompt_opportunities) || `INSTRUÇÃO PARA CRIAR OPORTUNIDADE:\nVocê pode criar e gerenciar oportunidades de negócio. Use a tag [CRIAR_OPORTUNIDADE: Título da Venda | Valor Numérico | id_da_etapa]. Para atualizar use [ATUALIZAR_OPORTUNIDADE: id_oportunidade | id_nova_etapa].`);

      if (agent.pipeline_id) {
        const { data: stages } = await supabaseAdmin.from("pipeline_stages").select("id, name").eq("pipeline_id", agent.pipeline_id).order("order_index");
        if (stages && stages.length > 0) {
          const stagesList = stages.map(s => `- ${s.name} (ID: ${s.id})`).join('\n');
          systemPromptParts.push(`CONTEXTO DO SEU FUNIL:\nVocê opera no funil atual. As etapas disponíveis são:\n${stagesList}`);
        }

        const { data: opps } = await supabaseAdmin.from("opportunities").select("id, title, value, stage_id").eq("contact_id", conv.contact_id);
        if (opps && opps.length > 0) {
          const oppsList = opps.map(o => `- ID Oportunidade: ${o.id} | Título: ${o.title} | Etapa Atual: ${o.stage_id}`).join('\n');
          systemPromptParts.push(`OPORTUNIDADES ATUAIS DO CLIENTE:\n${oppsList}\nSe o cliente já tiver uma oportunidade sobre o assunto, você deve ATUALIZAR a existente movendo de etapa com [ATUALIZAR_OPORTUNIDADE: id_oportunidade | etapa_id | id_nova_etapa], e NÃO criar uma nova.`);
        }
      }
    }

    const systemPrompt = systemPromptParts.join('\n\n');

    // Flag to detect if this response was triggered by an inactivity close instruction
    let isInactivityClose = false;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg) => {
        let content = msg.content || '';
        
        // Include audio transcription if available
        if (msg.media_type === 'audio' && msg.transcription) {
          content = `[Áudio Transcrito Pelo Sistema]: "${msg.transcription}"`;
        } else if (!content) {
          content = '[Anexo ou Mídia]';
        }

        // Strip signature from history so AI doesn't learn to generate it
        if (msg.sender_type === 'agent') {
          const match = content.match(/^\*?.+?\*?:\s*([\s\S]*)$/);
          if (match) content = match[1];
        }
        let role = msg.sender_type === 'contact' ? 'user' : 'assistant';
        
        // Treat system messages as user context so the AI knows what just happened internally
        if (msg.sender_type === 'system') {
          role = 'user';
          content = `[MENSAGEM INTERNA DO SISTEMA]: ${content}`;
          if (content.includes('transferido pela IA para o colega')) {
             const defaultHandoffReceiveInstruction = `Um colega de equipe transferiu este cliente para você. Leia o histórico acima para entender o contexto e continue o atendimento a partir de agora de acordo com a sua especialidade. NÃO transfira de volta sem antes tentar ajudar o cliente.`;
             const instructionToUse = agent.prompt_receive_handoff ? applyVars(agent.prompt_receive_handoff) : defaultHandoffReceiveInstruction;
             content += `\n[INSTRUÇÃO CRÍTICA]: ${instructionToUse}`;
          }
          if (content.includes('SYSTEM_FOLLOW_UP_1')) {
            const defaultFollowup = `[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente está há muito tempo sem responder. Envie UMA mensagem curta, amigável e natural perguntando se ele conseguiu resolver a questão anterior ou se precisa de ajuda. NÃO encerre o atendimento ainda.`;
            content = agent.prompt_followup ? `[INSTRUÇÃO CRÍTICA DE SISTEMA: ACOMPANHAMENTO]\n${applyVars(agent.prompt_followup)}` : defaultFollowup;
          }
          if (content.includes('SYSTEM_FOLLOW_UP_2')) {
            const defaultFollowup2 = `[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente não respondeu ao seu primeiro follow-up. Envie um aviso amigável informando que, se não houver resposta, o atendimento será encerrado em breve. NÃO encerre o atendimento ainda.`;
            content = agent.prompt_followup ? `[INSTRUÇÃO CRÍTICA DE SISTEMA: ACOMPANHAMENTO (2º AVISO)]\n${applyVars(agent.prompt_followup)}` : defaultFollowup2;
          }
          if (content.includes('SYSTEM_RESOLVE_INACTIVE')) {
            content = `[INSTRUÇÃO CRÍTICA DE SISTEMA]: O cliente ignorou todas as tentativas de contato. Despeça-se cordialmente e encerre o atendimento AGORA usando a tag [ENCERRAR: Encerrado por falta de comunicação do cliente].`;
            isInactivityClose = true; // flag to use followup resolution reason
          }
        }
        
        return {
          role: role as any,
          content: content,
        };
      })
    ];

    let finalModel = agent.model || 'default';
    if (finalModel === 'default') {
      finalModel = aiSettings.active_chatbot_model || 'meta-llama/llama-3-8b-instruct:free';
    }

    console.log(`[ai-generator] Calling LLM (${provider} - ${finalModel})...`);

    // 6. Call LLM API
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(provider === 'openrouter' && {
           "HTTP-Referer": "https://atendi.app",
           "X-Title": "Atendi CRM"
        })
      },
      body: JSON.stringify({
        model: finalModel.replace('openrouter/', '').replace('groq/', ''),
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: agent.max_tokens || 4096
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-generator] LLM API Error (${response.status}):`, errorText);
      return;
    }

    const responseJson = await response.json();
    const aiResponseText = responseJson.choices?.[0]?.message?.content;

    if (!aiResponseText) {
      console.error(`[ai-generator] Invalid LLM response:`, responseJson);
      return;
    }

    // Strip any signature the AI might have generated itself (e.g. "**Agente**: Olá")
    let cleanResponse = aiResponseText.trim();
    const selfSignatureMatch = cleanResponse.match(/^([A-Za-z0-9 _\-\*]+):\s*([\s\S]*)$/);
    if (selfSignatureMatch && !selfSignatureMatch[1].toLowerCase().includes('http')) {
      cleanResponse = selfSignatureMatch[2].trim();
    }

    // Check for Handoff Tag
    let isHandoff = false;
    let handoffNote = "";
    if (agent.allow_handoff) {
      // Support both [TRANSFERIR] and [TRANSFERIR: motivo]
      const handoffMatch = cleanResponse.match(/\[TRANSFERIR(?::\s*(.*?))?\]/i);
      if (handoffMatch) {
        isHandoff = true;
        handoffNote = handoffMatch[1] ? handoffMatch[1].trim() : "Cliente solicitou atendimento humano ou IA não soube responder.";
        cleanResponse = cleanResponse.replace(/\[TRANSFERIR(?::\s*.*?)?\]/gi, '').trim();
      }
    }

    // Check for Multi-Agent Transfer Tag
    let transferAgentId = null;
    const transferAgentMatch = cleanResponse.match(/\[TRANSFERIR_?AGENTE:\s*([a-zA-Z0-9\-]+)\]/i);
    if (transferAgentMatch) {
      transferAgentId = transferAgentMatch[1].trim();
      cleanResponse = cleanResponse.replace(/\[TRANSFERIR_?AGENTE:\s*[a-zA-Z0-9\-]+\]/gi, '').trim();
    }

    // Check for CRM Tasks Tag
    let crmTaskDetails = null;
    if (agent.allow_tasks) {
      const taskMatch = cleanResponse.match(/\[CRIAR_TAREFA:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
      if (taskMatch) {
        crmTaskDetails = {
          title: taskMatch[1].trim(),
          description: taskMatch[2].trim(),
          dueDate: taskMatch[3].trim()
        };
        cleanResponse = cleanResponse.replace(/\[CRIAR_TAREFA:\s*.*?\s*\|\s*.*?\s*\|\s*.*?\]/gi, '').trim();
      }
    }

    // Check for CRM Opportunity Tag
    let crmOpportunityDetails = null;
    let crmUpdateOppDetails = null;
    if (agent.allow_opportunities) {
      const oppMatch = cleanResponse.match(/\[CRIAR_OPORTUNIDADE:\s*(.*?)\s*\|\s*([0-9\.,]+)\s*\|\s*([a-zA-Z0-9\-]+)\]/i);
      if (oppMatch) {
        crmOpportunityDetails = {
          title: oppMatch[1].trim(),
          value: parseFloat(oppMatch[2].trim().replace(',', '.')),
          stageId: oppMatch[3].trim()
        };
        cleanResponse = cleanResponse.replace(/\[CRIAR_OPORTUNIDADE:\s*.*?\s*\|\s*[0-9\.,]+\s*\|\s*[a-zA-Z0-9\-]+\]/gi, '').trim();
      }

      const updateOppMatch = cleanResponse.match(/\[ATUALIZAR_OPORTUNIDADE:\s*([a-zA-Z0-9\-]+)\s*\|\s*([a-zA-Z0-9\-]+)\]/i);
      if (updateOppMatch) {
        crmUpdateOppDetails = {
          opportunityId: updateOppMatch[1].trim(),
          stageId: updateOppMatch[2].trim()
        };
        cleanResponse = cleanResponse.replace(/\[ATUALIZAR_OPORTUNIDADE:\s*[a-zA-Z0-9\-]+\s*\|\s*[a-zA-Z0-9\-]+\]/gi, '').trim();
      }
    }

    // Check for Resolve Tag
    let isResolve = false;
    let resolveNote = "";
    if (agent.allow_resolution && !isHandoff && !transferAgentId) {
      const resolveMatch = cleanResponse.match(/\[ENCERRAR(?::\s*(.*?))?\]/i);
      if (resolveMatch) {
        isResolve = true;
        resolveNote = resolveMatch[1] ? resolveMatch[1].trim() : "Atendimento concluído pela IA.";
        cleanResponse = cleanResponse.replace(/\[ENCERRAR(?::\s*.*?)?\]/gi, '').trim();
      }
    }

    // If the message is completely empty after stripping the tag, don't send a blank message
    if (cleanResponse.length > 0) {
      // 7. Add signature and send message via platform sender
      const finalMessageText = `*${agent.name}*:\n${cleanResponse}`;
      
      console.log(`[ai-generator] Sending AI response via Platform Sender...`);
      await sendPlatformMessage({
        conversationId: conversationId,
        text: finalMessageText,
        senderType: 'agent',
        aiAgentId: agent.id,
      });
      console.log(`[ai-generator] AI Response successfully sent and saved.`);
    }

    // 8. Execute Backend Actions based on Extracted Tags

    // A. Multi-Agent Transfer
    if (transferAgentId) {
      // Loop protection: check how many agent transfers occurred recently
      const { data: recentSystemMsgs } = await supabaseAdmin
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'system')
        .order('created_at', { ascending: false })
        .limit(10);
      
      const fiveMinutesAgo = new Date().getTime() - 5 * 60 * 1000;
      const transferCount = recentSystemMsgs?.filter(m => 
        m.content.includes('Atendimento transferido pela IA para o colega') &&
        new Date(m.created_at).getTime() > fiveMinutesAgo
      ).length || 0;

      if (transferCount >= 3) {
        console.warn(`[ai-generator] Infinite loop detected! Transferring to human fallback.`);
        isHandoff = true;
        handoffNote = "Loop infinito de IAs detectado. Transferido para humanos.";
      } else {
        // Fetch target agent name
        const { data: targetAgent } = await supabaseAdmin.from('ai_agents').select('name').eq('id', transferAgentId).single();
        const targetName = targetAgent?.name || 'Desconhecido';

        console.log(`[ai-generator] Transferring from ${agent.name} to ${targetName} (${transferAgentId})`);

        await supabaseAdmin
          .from('conversations')
          .update({ ai_agent_id: transferAgentId })
          .eq('id', conversationId);

        const { data: conv } = await supabaseAdmin.from('conversations').select('current_session_id').eq('id', conversationId).single();
        if (conv?.current_session_id) {
           await supabaseAdmin.from('session_events').insert({
              session_id: conv.current_session_id,
              event_type: 'transferred',
              metadata: { by_ai: true, targetType: 'agent', targetId: transferAgentId, targetName: targetName, ai_agent_id: agent.id, ai_agent_name: agent.name }
           });
        }

        const systemMsg = `Atendimento transferido pela IA para o colega de equipe: ${targetName}`;
        const { data: insertedMsg } = await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'system',
          content: systemMsg
        }).select('id').single();

        // Enqueue the new AI agent to respond immediately to this system message
        if (insertedMsg) {
           const { enqueueAiMessage } = await import('./ai-queue');
           enqueueAiMessage(conversationId, insertedMsg.id, companyId);
        }
      }
    }

    // B. Create Task
    if (crmTaskDetails) {
      const { data: convData } = await supabaseAdmin.from('conversations').select('contact_id, unit_id').eq('id', conversationId).single();
      if (convData && convData.contact_id && convData.unit_id) {
        await supabaseAdmin.from('tasks').insert({
          title: crmTaskDetails.title,
          description: crmTaskDetails.description,
          due_date: crmTaskDetails.dueDate, // Must be parseable by Postgres (e.g., YYYY-MM-DD HH:MM)
          contact_id: convData.contact_id,
          unit_id: convData.unit_id,
          status: 'pending',
          priority: 'medium',
          task_type: 'follow_up'
        });
        await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'agent',
          is_internal: true,
          content: `Tarefa criada pela IA: ${crmTaskDetails.title} (Para: ${crmTaskDetails.dueDate})`
        });
      }
    }

    // C. Create Opportunity
    if (crmOpportunityDetails) {
      const { data: convData } = await supabaseAdmin.from('conversations').select('contact_id, unit_id').eq('id', conversationId).single();
      if (convData && convData.contact_id && convData.unit_id) {
        let stageId = crmOpportunityDetails.stageId;
        if (!stageId && agent.pipeline_id) {
            const { data: firstStage } = await supabaseAdmin
              .from('pipeline_stages')
              .select('id')
              .eq('pipeline_id', agent.pipeline_id)
              .order('order_index', { ascending: true })
              .limit(1)
              .single();
             stageId = firstStage?.id;
        }

        await supabaseAdmin.from('opportunities').insert({
          title: crmOpportunityDetails.title,
          value: crmOpportunityDetails.value,
          contact_id: convData.contact_id,
          unit_id: convData.unit_id,
          conversation_id: conversationId,
          stage_id: stageId || null
        });
        await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'agent',
          is_internal: true,
          content: `Oportunidade criada pela IA: ${crmOpportunityDetails.title} (Valor: ${crmOpportunityDetails.value})`
        });
      }
    }

    // D. Update Opportunity
    if (crmUpdateOppDetails) {
      await supabaseAdmin.from('opportunities')
        .update({ stage_id: crmUpdateOppDetails.stageId })
        .eq('id', crmUpdateOppDetails.opportunityId);
        
      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        is_internal: true,
        content: `Oportunidade atualizada pela IA (Movida para etapa: ${crmUpdateOppDetails.stageId}).`
      });
    }

    // C. Execute Handoff if requested
    if (isHandoff) {
      console.log(`[ai-generator] Handoff requested for conversation ${conversationId}`);
      
      const updatePayload: any = { 
        ai_active: false,
        assigned_agent_id: null,
        status: 'waiting'
      };
      
      let deptName = null;
      if (agent.handoff_department_id) {
        updatePayload.department_id = agent.handoff_department_id;
        const { data: dept } = await supabaseAdmin.from('departments').select('name').eq('id', agent.handoff_department_id).single();
        if (dept) deptName = dept.name;
      }

      await supabaseAdmin
        .from('conversations')
        .update(updatePayload)
        .eq('id', conversationId);

      // Add a system message for UI
      const systemMsg = deptName 
        ? `Atendimento transferido pela IA para o departamento: ${deptName}`
        : `Atendimento transferido pela IA para a fila de espera.`;

      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'system',
        content: systemMsg
      });

      // Add internal note with the reason
      await supabaseAdmin.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        is_internal: true,
        content: handoffNote,
        metadata: { ai_generated: true, ai_agent_id: agent.id, ai_agent_name: agent.name }
      });
      
      const { data: conv } = await supabaseAdmin.from('conversations').select('current_session_id').eq('id', conversationId).single();
      if (conv?.current_session_id) {
         const sessionUpdate: any = { assigned_agent_id: null };
         if (agent.handoff_department_id) sessionUpdate.department_id = agent.handoff_department_id;
         await supabaseAdmin.from('conversation_sessions').update(sessionUpdate).eq('id', conv.current_session_id);
         
         await supabaseAdmin.from('session_events').insert({
            session_id: conv.current_session_id, 
            event_type: 'transferred',
            metadata: { targetType: 'department', targetId: agent.handoff_department_id || 'queue', targetName: deptName || 'Fila Geral', by_ai: true }
         });
      }
    } else if (isResolve) {
      console.log(`[ai-generator] Resolve requested for conversation ${conversationId}`);
      
      // Get the session ID before we clear it from the conversation
      const { data: conv } = await supabaseAdmin.from('conversations').select('current_session_id').eq('id', conversationId).single();
      const sessionId = conv?.current_session_id;

      await supabaseAdmin
        .from('conversations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          current_session_id: null
        })
        .eq('id', conversationId);

      if (sessionId) {
        await supabaseAdmin.from('conversation_sessions').update({
          resolved_at: new Date().toISOString(),
          resolution_reason_id: isInactivityClose
            ? (agent.followup_resolution_reason_id || agent.resolution_reason_id || null)
            : (agent.resolution_reason_id || null),
          resolution_observation: resolveNote
        }).eq('id', sessionId);

        await supabaseAdmin.from('session_events').insert({
          session_id: sessionId, 
          event_type: 'resolved',
          metadata: { by_ai: true, observation: resolveNote }
        });
      }
    }

  } catch (err) {
    console.error(`[ai-generator] Fatal error:`, err);
  }
}
