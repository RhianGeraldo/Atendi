import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueAiMessage } from "./ai-queue";

export async function handleCronFollowUps(request: Request): Promise<Response> {
  // Simple auth check to prevent abuse, e.g., Bearer token or simple secret
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET || 'atendi-cron-secret-123';
  
  // Accept if it's localhost (dev) or has the correct secret
  const url = new URL(request.url);
  if (url.hostname !== 'localhost' && authHeader !== `Bearer ${cronSecret}` && url.searchParams.get('secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    console.log('[cron] Starting follow-up scan...');
    
    // Find active conversations that are handled by AI
    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select('id, last_message_at, ai_followup_count, ai_agent_id, contacts(company_id)')
      .eq('ai_active', true)
      .in('status', ['active', 'waiting']);

    if (error) {
      console.error('[cron] Error fetching conversations:', error);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    if (!conversations || conversations.length === 0) {
      return new Response(JSON.stringify({ status: 'success', message: 'No active AI conversations found.' }), { status: 200 });
    }

    const now = new Date().getTime();
    let processedCount = 0;

    for (const conv of conversations) {
      if (!conv.ai_agent_id) continue;

      // Fetch dynamic settings for this agent
      const { data: agent } = await supabaseAdmin
        .from('ai_agents')
        .select('allow_followup, followup_interval_minutes, followup_max_attempts')
        .eq('id', conv.ai_agent_id)
        .single();

      if (!agent || !agent.allow_followup) continue;

      const timeoutMs = (agent.followup_interval_minutes || 15) * 60 * 1000;
      const maxAttempts = agent.followup_max_attempts || 2;

      const lastMsgTime = new Date(conv.last_message_at || 0).getTime();
      const timeSinceLastMsg = now - lastMsgTime;

      if (timeSinceLastMsg >= timeoutMs) {
        // We need to check who sent the last message. We only follow up if the AI was the last to send
        const { data: lastMsg } = await supabaseAdmin
          .from('messages')
          .select('sender_type')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // If the user sent the last message, the AI is probably already processing it or failed.
        // We only trigger follow-up if the AI (agent) or system sent the last message and the user didn't reply.
        if (lastMsg && (lastMsg.sender_type === 'agent' || lastMsg.sender_type === 'system')) {
          
          const currentCount = conv.ai_followup_count || 0;
          let systemInstruction = null;

          if (currentCount === 0) {
            systemInstruction = 'SYSTEM_FOLLOW_UP_1';
            await supabaseAdmin.from('conversations').update({ ai_followup_count: 1 }).eq('id', conv.id);
          } else if (currentCount > 0 && currentCount < maxAttempts) {
            systemInstruction = 'SYSTEM_FOLLOW_UP_2'; // Used for all subsequent attempts before max
            await supabaseAdmin.from('conversations').update({ ai_followup_count: currentCount + 1 }).eq('id', conv.id);
          } else if (currentCount >= maxAttempts) {
            systemInstruction = 'SYSTEM_RESOLVE_INACTIVE';
            // We don't increment anymore, the AI will resolve the conversation in its response
          }

          if (systemInstruction) {
            console.log(`[cron] Triggering ${systemInstruction} for conversation ${conv.id}`);
            
            // Insert the invisible system message
            const { data: insertedMsg } = await supabaseAdmin.from('messages').insert({
              conversation_id: conv.id,
              sender_type: 'system',
              content: `[SISTEMA]: ${systemInstruction}`,
              is_internal: true
            }).select('id').single();

            if (insertedMsg && conv.contacts?.company_id) {
              // Trigger AI queue
              enqueueAiMessage(conv.id, insertedMsg.id, conv.contacts.company_id);
              processedCount++;
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ status: 'success', processed: processedCount }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('[cron] Fatal error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
