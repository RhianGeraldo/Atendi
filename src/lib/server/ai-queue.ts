import { generateAndSendAiResponse } from "./ai-generator";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUFFER_MS = 10000; // 10 seconds

export function enqueueAiMessage(conversationId: string, messageId: string, companyId: string) {
  console.log(`[ai-queue] AI response queued for conversation ${conversationId}. Waiting ${BUFFER_MS/1000}s for silence...`);

  // Fire and forget timer
  setTimeout(async () => {
    try {
      // After 10 seconds, query the DB to check if any NEW messages arrived
      const { data: latestMsg } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // If the latest message in the DB is STILL the one that triggered this timeout,
      // it means the user stopped typing for 10 seconds. We can proceed!
      if (latestMsg && latestMsg.id === messageId) {
        console.log(`[ai-queue] Buffer of ${BUFFER_MS/1000}s reached and no new messages. Triggering AI response...`);
        await generateAndSendAiResponse(conversationId, companyId);
      } else {
        console.log(`[ai-queue] Newer message found in conversation ${conversationId}. Skipping this trigger.`);
      }
    } catch (err) {
      console.error(`[ai-queue] Error generating AI response for conversation ${conversationId}:`, err);
    }
  }, BUFFER_MS);
}
