import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { recordActivityHeartbeatAction } from "@/lib/api/activity.functions";

// Tempo limite sem interação para considerar o usuário ocioso (2 minutos)
const IDLE_TIMEOUT_MS = 120_000;
// Intervalo de envio do batimento cardíaco (30 segundos)
const HEARTBEAT_INTERVAL_MS = 30_000;
const INTERVAL_SECONDS = 30;

export type UserActivityStatus = "active" | "idle" | "background" | "offline";

export function useActivityTracker() {
  const { session } = useAuth();
  const lastInteractionRef = useRef<number>(Date.now());
  const isBackgroundRef = useRef<boolean>(typeof document !== "undefined" ? document.visibilityState === "hidden" : false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") return;

    lastInteractionRef.current = Date.now();
    isBackgroundRef.current = document.visibilityState === "hidden";

    // 1. Escuta interações leves do usuário para detectar movimentação
    const handleUserInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    const interactionEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    interactionEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // 2. Escuta quando a aba muda de estado (visível x em segundo plano)
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === "hidden";
      isBackgroundRef.current = isHidden;
      if (!isHidden) {
        lastInteractionRef.current = Date.now();
      }
    };

    const handleWindowBlur = () => {
      // Quando a janela perde o foco (ex: usuário clicou em outro aplicativo no computador)
      // Se a aba não estiver oculta mas sem foco, ainda podemos considerar segundo plano se passar o timeout
    };

    const handleWindowFocus = () => {
      lastInteractionRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    // Função para determinar o status atual
    const getCurrentStatus = (): UserActivityStatus => {
      if (isBackgroundRef.current || document.visibilityState === "hidden") {
        return "background";
      }
      const timeSinceLastInteraction = Date.now() - lastInteractionRef.current;
      if (timeSinceLastInteraction > IDLE_TIMEOUT_MS) {
        return "idle";
      }
      return "active";
    };

    // 3. Heartbeat periódico a cada 30 segundos
    const sendHeartbeat = async (statusOverride?: UserActivityStatus) => {
      try {
        const currentStatus = statusOverride || getCurrentStatus();
        await recordActivityHeartbeatAction({
          data: {
            status: currentStatus,
            intervalSeconds: INTERVAL_SECONDS,
          },
        });
      } catch (err) {
        // Silencioso para não interromper a navegação do usuário em oscilações de rede
        console.debug("[ActivityTracker] Heartbeat skipped or network error:", err);
      }
    };

    // Envia o primeiro heartbeat logo no início
    sendHeartbeat("active");

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // 4. Ao descarregar a janela / fechar a aba
    const handleBeforeUnload = () => {
      // Tenta marcar offline
      recordActivityHeartbeatAction({
        data: {
          status: "offline",
          intervalSeconds: 1,
        },
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      interactionEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [session?.user?.id]);
}
