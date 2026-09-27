import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchAutomationEvent } from "@/lib/server/automation-engine";

export const dispatchAutomationAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      companyId: z.string().uuid(),
      unitId: z.string().uuid().nullable().optional(),
      contactId: z.string().uuid(),
      conversationId: z.string().uuid().nullable().optional(),
      triggerType: z.enum(["ad_lead_first_message", "contact_created", "message_received"]),
      metadata: z.record(z.any()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await dispatchAutomationEvent(data);
    return { success: true };
  });
