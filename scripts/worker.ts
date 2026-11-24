/**
 * Atendi Background Worker (Inspirado no Sidekiq do Chatwoot)
 *
 * Processa filas de webhooks em segundo plano com FOR UPDATE SKIP LOCKED.
 * Pronto para rodar em servidor próprio (VPS dedicada, Docker ou PM2):
 *
 *   bun run scripts/worker.ts
 *   ou
 *   pm2 start scripts/worker.ts --name atendi-worker
 */

import { drainInbox } from "@/lib/server/webhook-inbox";
import { processarPayloadZernio } from "@/lib/server/zernio-webhook";
import { processWhatsappCloudWebhookBody } from "@/lib/server/whatsapp-cloud-webhook";

let isRunning = true;

const handleShutdown = () => {
  console.log("\n[Worker] Sinal de parada recebido. Finalizando tarefas ativas...");
  isRunning = false;
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWorker() {
  console.log("==================================================");
  console.log("🚀 Atendi Background Worker Iniciado");
  console.log("   Consumindo webhook_inbox via FOR UPDATE SKIP LOCKED");
  console.log("==================================================");

  while (isRunning) {
    try {
      let processedTotal = 0;

      // 1. Drena fila da Zernio
      const zernioOk = await drainInbox(
        "zernio",
        async (payload) => {
          await processarPayloadZernio(payload, null);
        },
        5,
      );
      processedTotal += zernioOk;

      // 2. Drena fila do WhatsApp Cloud
      const cloudOk = await drainInbox(
        "whatsapp-cloud",
        async (payload) => {
          await processWhatsappCloudWebhookBody(payload);
        },
        5,
      );
      processedTotal += cloudOk;

      // Se processou itens, faz novo ciclo rápido (200ms); se a fila estava vazia, aguarda 1500ms
      const waitTime = processedTotal > 0 ? 200 : 1500;
      await sleep(waitTime);
    } catch (err) {
      console.error("[Worker] Erro no loop de processamento:", err);
      await sleep(3000);
    }
  }

  console.log("[Worker] Processo encerrado com segurança.");
  process.exit(0);
}

runWorker().catch((err) => {
  console.error("[Worker Fatal]", err);
  process.exit(1);
});
