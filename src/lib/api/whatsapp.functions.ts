import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { syncCloudTemplates } from "../server/whatsapp-cloud-api";

export const syncCloudTemplatesAction = createServerFn({ method: "POST" })
  .inputValidator(z.object({ instanceId: z.string() }))
  .handler(async ({ data }) => {
    try {
      const result = await syncCloudTemplates(data.instanceId);
      return result;
    } catch (e: any) {
      console.error('Failed to sync templates:', e);
      throw new Error(e.message || 'Falha ao sincronizar templates');
    }
  });
