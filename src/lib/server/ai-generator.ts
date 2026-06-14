import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPlatformMessage } from "./message-sender";

export async function generateAndSendAiResponse(conversationId: string, companyId: string) {
  try {
    // 1. Fetch conversation details to verify AI is still active
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("ai_active, ai_agent_id, whatsapp_instance_id, contact_id, status")
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
      .select("ai_settings")
      .eq("id", companyId)
      .single();

    if (companyErr || !company || !company.ai_settings) {
      console.error(`[ai-generator] Company AI settings not found: ${companyId}`);
      return;
    }

    const aiSettings = company.ai_settings as any;
    
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
      .select("content, sender_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) return;

    // Sort to ascending order (oldest first)
    messages.reverse();

    // 5. Construct Prompts
    const systemPromptParts = [];
    systemPromptParts.push(`Você é ${agent.name}.`);
    if (agent.prompt_personality) systemPromptParts.push(agent.prompt_personality);
    if (agent.prompt_instructions) systemPromptParts.push(agent.prompt_instructions);
    if (agent.prompt_extra_info) systemPromptParts.push(agent.prompt_extra_info);
    
    if (agent.allow_handoff) {
      systemPromptParts.push(agent.prompt_handoff || `INSTRUÇÃO CRÍTICA PARA TRANSFERÊNCIA:\nSe você não souber como resolver o problema, TENTE ajudar primeiro fazendo perguntas para entender melhor a situação. NÃO transfira imediatamente na primeira dúvida. Transfira APENAS se: 1) O cliente pedir explicitamente para falar com um humano, OU 2) Após tentar ajudar, você tiver certeza absoluta que o problema requer suporte técnico/humano que foge totalmente da sua base de conhecimento. Para transferir, inclua EXATAMENTE a tag [TRANSFERIR: motivo detalhado] no final da sua resposta (e não faça perguntas ao cliente se for transferir, pois você não poderá mais responder).`);
    }

    if (agent.allow_resolution) {
      systemPromptParts.push(agent.prompt_resolution || `INSTRUÇÃO CRÍTICA PARA ENCERRAMENTO:\nSe você resolveu completamente o problema do cliente e não há mais nada a ser feito, você DEVE encerrar o atendimento. Para isso, inclua EXATAMENTE a tag [ENCERRAR: resumo do que foi resolvido] no final da sua resposta. Substitua "resumo" por uma breve observação do que foi feito.`);
    }

    const systemPrompt = systemPromptParts.join('\n\n');

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg) => {
        let content = msg.content || '[Anexo ou Mídia]';
        // Strip signature from history so AI doesn't learn to generate it
        if (msg.sender_type === 'agent') {
          const match = content.match(/^\*?.+?\*?:\s*([\s\S]*)$/);
          if (match) content = match[1];
        }
        return {
          role: msg.sender_type === 'contact' ? 'user' : 'assistant',
          content: content,
        };
      })
    ];

    console.log(`[ai-generator] Calling LLM (${provider} - ${agent.model})...`);

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
        model: agent.model.replace('openrouter/', '').replace('groq/', ''),
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
    if (selfSignatureMatch) {
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

    // Check for Resolve Tag
    let isResolve = false;
    let resolveNote = "";
    if (agent.allow_resolution && !isHandoff) {
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

    // Execute Handoff if requested
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
          resolution_reason_id: agent.resolution_reason_id || null,
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
