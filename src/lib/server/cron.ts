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
    // Auto-expire calls stuck in ACTIVE or RINGING for more than 5 minutes
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: cleanedCalls, error: cleanupErr } = await supabaseAdmin
        .from('call_logs')
        .update({ 
          status: 'FAILED',
          ended_at: new Date().toISOString()
        })
        .in('status', ['ACTIVE', 'RINGING'])
        .lt('started_at', fiveMinutesAgo)
        .select('id');
      
      if (cleanupErr) {
        console.error('[cron] Error cleaning up stuck calls:', cleanupErr);
      } else if (cleanedCalls && cleanedCalls.length > 0) {
        console.log(`[cron] Cleaned up ${cleanedCalls.length} stuck call logs.`);
      }
    } catch (cleanupEx) {
      console.error('[cron] Exception during stuck calls cleanup:', cleanupEx);
    }

    console.log('[cron] Starting follow-up scan...');
    
    // Find active conversations that are handled by AI
    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select('id, last_message_at, ai_followup_count, ai_last_followup_at, ai_agent_id, contacts(company_id)')
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

      // ✅ FIX: measure inactivity from the last CLIENT message, not conversation.last_message_at
      // When AI sends a follow-up, it updates last_message_at but the client still hasn't replied.
      const { data: lastContactMsg } = await supabaseAdmin
        .from('messages')
        .select('created_at, sender_type')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'contact')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Also fetch the last message overall to check who sent it
      const { data: lastMsg } = await supabaseAdmin
        .from('messages')
        .select('sender_type')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Only follow up if client was the last to NOT send (i.e., AI or system sent last)
      if (!lastMsg || lastMsg.sender_type === 'contact') continue;

      // Use last contact message time as the inactivity baseline
      // If there's no contact message yet, use conversation start
      const baselineTime = lastContactMsg
        ? new Date(lastContactMsg.created_at).getTime()
        : new Date(conv.last_message_at || 0).getTime();

      const timeSinceClientMsg = now - baselineTime;

      if (timeSinceClientMsg >= timeoutMs) {
        const currentCount = conv.ai_followup_count || 0;

        // ✅ FIX 2: Also enforce interval between follow-up attempts.
        // After sending follow-up 1, the next cron run (1 min later) must NOT immediately
        // fire follow-up 2 — it should wait another full interval since the last follow-up sent.
        const lastFollowupAt = (conv as any).ai_last_followup_at
          ? new Date((conv as any).ai_last_followup_at).getTime()
          : null;

        // If a follow-up was already sent, require another full interval before the next one
        if (lastFollowupAt && (now - lastFollowupAt) < timeoutMs) {
          console.log(`[cron] Skipping conv ${conv.id} — waiting for next interval (${Math.round((timeoutMs - (now - lastFollowupAt)) / 60000)}min remaining)`);
          continue;
        }

        let systemInstruction = null;

        if (currentCount === 0) {
          systemInstruction = 'SYSTEM_FOLLOW_UP_1';
          await supabaseAdmin.from('conversations').update({ ai_followup_count: 1, ai_last_followup_at: new Date().toISOString() } as any).eq('id', conv.id);
        } else if (currentCount > 0 && currentCount < maxAttempts) {
          systemInstruction = 'SYSTEM_FOLLOW_UP_2';
          await supabaseAdmin.from('conversations').update({ ai_followup_count: currentCount + 1, ai_last_followup_at: new Date().toISOString() } as any).eq('id', conv.id);
        } else if (currentCount >= maxAttempts) {
          systemInstruction = 'SYSTEM_RESOLVE_INACTIVE';
          // Don't increment — AI will resolve the conversation in its response
        }

        if (systemInstruction) {
          console.log(`[cron] Triggering ${systemInstruction} for conversation ${conv.id} (count=${currentCount}, timeSinceClient=${Math.round(timeSinceClientMsg/60000)}min)`);
          
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

    return new Response(JSON.stringify({ status: 'success', processed: processedCount }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('[cron] Fatal error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
