import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { recordActivityHeartbeatAction } from "@/lib/api/activity.functions";

// Tempo limite sem interação para considerar o usuário ocioso (3 minutos = 180s)
const IDLE_TIMEOUT_MS = 180_000;
// Intervalo de envio do batimento cardíaco (30 segundos)
const HEARTBEAT_INTERVAL_MS = 30_000;

export type UserActivityStatus = "active" | "idle" | "background" | "offline";

// Eventos de interação do usuário cobrindo cliques, teclado, scroll de containers (chat/listas), touch e formulários
const INTERACTION_EVENTS = [
  "mousemove",
  "pointermove",
  "mousedown",
  "pointerdown",
  "click",
  "keydown",
  "keyup",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "input",
  "change",
  "focusin",
];

export function useActivityTracker() {
  const { session } = useAuth();
  const lastInteractionRef = useRef<number>(Date.now());
  const lastHeartbeatTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") return;

    lastInteractionRef.current = Date.now();
    lastHeartbeatTimeRef.current = Date.now();

    // 1. Canal de comunicação entre abas (BroadcastChannel com fallback em storage)
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        bc = new BroadcastChannel("atendi_activity_sync");
        bc.onmessage = (event) => {
          if (event.data?.type === "interaction" && typeof event.data?.ts === "number") {
            lastInteractionRef.current = Math.max(lastInteractionRef.current, event.data.ts);
          }
        };
      }
    } catch {
      // BroadcastChannel não suportado ou restrito
    }

    // Fallback de sincronização via localStorage event para múltiplos navegadores/janelas
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "ATENDI_LAST_INTERACTION_TS" && e.newValue) {
        const ts = Number(e.newValue);
        if (!isNaN(ts)) {
          lastInteractionRef.current = Math.max(lastInteractionRef.current, ts);
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // 2. Manipulador de eventos de interação (com throttle leve de 500ms para performance)
    let lastBroadcast = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      lastInteractionRef.current = now;

      // Propaga para outras abas a cada 2 segundos no máximo
      if (now - lastBroadcast > 2000) {
        lastBroadcast = now;
        try {
          localStorage.setItem("ATENDI_LAST_INTERACTION_TS", String(now));
          bc?.postMessage({ type: "interaction", ts: now });
        } catch {}
      }
    };

    // Usa capture: true para capturar eventos em divs com overflow (chat, listas, kanban) e elementos com stopPropagation
    INTERACTION_EVENTS.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { capture: true, passive: true });
    });

    // 3. Monitoramento de visibilidade da aba
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleUserInteraction();
      }
    };

    const handleWindowFocus = () => {
      handleUserInteraction();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    // 4. Determina o status atual da aba considerando todas as abas
    const getCurrentStatus = (): UserActivityStatus => {
      const isTabHidden = document.visibilityState === "hidden";
      if (isTabHidden) {
        return "background";
      }
      const timeSinceLastInteraction = Date.now() - lastInteractionRef.current;
      if (timeSinceLastInteraction > IDLE_TIMEOUT_MS) {
        return "idle";
      }
      return "active";
    };

    // 5. Heartbeat periódico a cada 30 segundos com coordenação multi-aba
    const sendHeartbeat = async (statusOverride?: UserActivityStatus) => {
      try {
        const isTabHidden = document.visibilityState === "hidden";
        const now = Date.now();

        // Se esta aba está visível, ela assume prioridade e carimba presença ativa
        if (!isTabHidden) {
          try {
            localStorage.setItem("ATENDI_ACTIVE_TAB_HEARTBEAT", String(now));
          } catch {}
        } else {
          // Se esta aba está em segundo plano, verifica se há outra aba aberta e visível na mesma máquina
          try {
            const lastActiveTab = Number(localStorage.getItem("ATENDI_ACTIVE_TAB_HEARTBEAT") || 0);
            if (now - lastActiveTab < 45_000) {
              // Outra aba já está visível e reportando 'active' ou 'idle' com foco!
              // Não envia 'background' para evitar conflito ou duplicação.
              return;
            }
          } catch {}
        }

        const currentStatus = statusOverride || getCurrentStatus();
        const elapsedSeconds = Math.min(
          Math.max(Math.round((now - lastHeartbeatTimeRef.current) / 1000), 15),
          60
        );
        lastHeartbeatTimeRef.current = now;

        await recordActivityHeartbeatAction({
          data: {
            status: currentStatus,
            intervalSeconds: elapsedSeconds,
          },
        });
      } catch (err) {
        console.debug("[ActivityTracker] Heartbeat skipped or network error:", err);
      }
    };

    // Envia o primeiro heartbeat logo ao montar
    sendHeartbeat("active");

    const heartbeatInterval = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // 6. Ao descarregar a janela / fechar a aba
    const handleBeforeUnload = () => {
      // Se era a única aba visível, tenta marcar offline
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
      INTERACTION_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction, { capture: true });
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try {
        bc?.close();
      } catch {}
    };
  }, [session?.user?.id]);
}
