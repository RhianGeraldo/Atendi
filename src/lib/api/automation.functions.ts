import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchAutomationEvent } from "../server/automation-engine";

/**
 * Dispara evento do motor de automação a partir do frontend autenticado
 */
export const triggerAutomationAction = createServerFn({ method: "POST" })
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
    await dispatchAutomationEvent({
      companyId: data.companyId,
      unitId: data.unitId || null,
      contactId: data.contactId,
      conversationId: data.conversationId || null,
      triggerType: data.triggerType,
      metadata: data.metadata,
    });

    return { success: true };
  });
