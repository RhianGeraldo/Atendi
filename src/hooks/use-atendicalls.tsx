import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import {
  startAtendiCallsVoiceCallAction,
  hangupAtendiCallsVoiceCallAction,
  syncAtendiCallsCallStatusAction,
  sendAtendiCallsWebRTCOfferAction,
} from "@/lib/api/atendicalls.functions";
import { openAtendiCallsWebRTC, type AtendiCallsWebRTCConnection } from "@/lib/audio/webrtc";

export type CallStatus =
  | "CALLING"
  | "RINGING"
  | "ACTIVE"
  | "ENDED"
  | "FAILED"
  | "REJECTED"
  | "CONNECTING"
  | "MISSED"
  | "NOT_ANSWERED";

export interface CallActive {
  id: string;
  peer: {
    phone: string;
    displayName?: string;
    profilePicture?: string;
  };
  status?: string;
  device_token?: string;
}

export type CallOffer = CallActive;
export type CallOutgoing = CallActive;

export interface AtendiCallsContextType {
  incomingOffer: CallOffer | null;
  activeCall: CallActive | null;
  callStatus: CallStatus | "CONNECTING" | null;
  instances: any[] | undefined;
  isConnecting: boolean;
  connectingPhone: string | null;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  /** Dispara chamada pelo AtendiCalls no navegador via WebRTC */
  startCall: (
    phone: string,
    contactName?: string,
    fromToken?: string,
    mode?: string,
    agentPrompt?: string,
  ) => Promise<boolean>;
  endCall: () => Promise<void>;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  isMuted: boolean;
  activeContactName: string | null;
  isSpeakerOn: boolean;
  toggleSpeaker: () => void;
  remoteStream: MediaStream | null;
  // Compatibilidade com código legado
  wavoip?: any | null;
}

const AtendiCallsContext = createContext<AtendiCallsContextType | undefined>(undefined);

export function AtendiCallsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();

  const [incomingOffer, setIncomingOffer] = useState<CallOffer | null>(null);
  const [activeCall, setActiveCall] = useState<CallActive | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus | "CONNECTING" | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [activeContactName, setActiveContactName] = useState<string | null>(null);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingPhone, setConnectingPhone] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCallIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const currentTokenRef = useRef<string | null>(null);
  const currentApiUrlRef = useRef<string | null>(null);
  const currentInstanceIdRef = useRef<string | null>(null);
  const isEndingRef = useRef<boolean>(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const webrtcRef = useRef<AtendiCallsWebRTCConnection | null>(null);

  const closeCallWithDelay = useCallback(() => {
    isEndingRef.current = true;
    setCallStatus("ENDED");
    if (webrtcRef.current) {
      try {
        webrtcRef.current.close();
      } catch {}
      webrtcRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveCall(null);
      setCallStatus(null);
      setIsMuted(false);
      setIsSpeakerOn(false);
      setActiveContactName(null);
      setRemoteStream(null);
      currentCallIdRef.current = null;
      currentSessionIdRef.current = null;
      currentTokenRef.current = null;
      currentApiUrlRef.current = null;
      currentInstanceIdRef.current = null;
      isEndingRef.current = false;
    }, 1500);
  }, []);

  // Polling em tempo real durante chamadas ativas para sincronizar atendimento e encerramento no AtendiCalls
  useEffect(() => {
    const currentId = currentCallIdRef.current;
    const isCallLive =
      callStatus === "CALLING" || callStatus === "RINGING" || callStatus === "ACTIVE";

    if (!currentId || !isCallLive || isEndingRef.current) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      const activeId = currentCallIdRef.current;
      if (!activeId || isEndingRef.current) return;

      try {
        const res = await syncAtendiCallsCallStatusAction({
          data: {
            callId: activeId,
            companyId: profile?.company_id,
            instanceId: currentInstanceIdRef.current,
            token: currentTokenRef.current,
            apiUrl: currentApiUrlRef.current,
          },
        });

        if (isEndingRef.current) return;

        if (res?.success) {
          if (res.status === "ACTIVE") {
            setCallStatus((prev) => (prev !== "ACTIVE" && prev !== "ENDED" ? "ACTIVE" : prev));
          } else if (res.status === "ENDED") {
            isEndingRef.current = true;
            setCallStatus("ENDED");
            closeCallWithDelay();
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch (err) {
        // Ignora erros transitórios no loop de polling
      }
    }, 800);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [callStatus, profile?.company_id, closeCallWithDelay]);

  // Busca instâncias configuradas com AtendiCalls para a unidade e departamento
  const { data: instances } = useQuery({
    queryKey: [
      "atendicalls_instances_tokens",
      profile?.company_id,
      selectedUnitId,
      profile?.id,
      profile?.role,
      profile?.department_id,
    ],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select(
          "id, atendicalls_token, atendicalls_url, wavoip_token, name, unit_id, department_id",
        )
        .eq("company_id", profile!.company_id!)
        .or("atendicalls_token.not.is.null,wavoip_token.not.is.null");

      if (selectedUnitId) {
        q = q.or(`unit_id.eq.${selectedUnitId},unit_id.is.null`);
      }

      const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";
      if (!isAdmin) {
        if (profile?.department_id) {
          q = q.or(`department_id.eq.${profile.department_id},department_id.is.null`);
        } else {
          q = q.is("department_id", null);
        }
      }

      const { data, error } = await q;
      if (error) throw error;

      // Normaliza para que atendicalls_token e wavoip_token coexistam
      return (data ?? []).map((inst: any) => ({
        ...inst,
        atendicalls_token: inst.atendicalls_token || inst.wavoip_token,
        wavoip_token: inst.atendicalls_token || inst.wavoip_token,
      }));
    },
    staleTime: 60000,
  });

  // Conexão Realtime SSE direta com o motor AtendiCalls para eventos instantâneos (ringing, connected, ended)
  useEffect(() => {
    const effectiveToken =
      currentTokenRef.current ||
      instances?.find((i: any) => i.atendicalls_token || i.wavoip_token)?.atendicalls_token ||
      instances?.find((i: any) => i.atendicalls_token || i.wavoip_token)?.wavoip_token;
    if (!effectiveToken) return;

    const matchedInst = instances?.find(
      (i: any) =>
        i.atendicalls_token === effectiveToken || i.wavoip_token === effectiveToken,
    );
    const apiUrl = (
      currentApiUrlRef.current ||
      matchedInst?.atendicalls_url ||
      "https://calls.esteticaelaser.com.br"
    ).replace(/\/+$/, "");

    let clientId = localStorage.getItem("atendicalls.clientId");
    if (!clientId) {
      clientId = "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("atendicalls.clientId", clientId);
    }

    const sseUrl = `${apiUrl}/api/events?clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(effectiveToken)}`;
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          if (isEndingRef.current) return;
          const payload = JSON.parse(event.data);
          const currentId = currentCallIdRef.current;

          if (payload.type === "call-status") {
            const rawStatus = (payload.status || "").toLowerCase();
            const matchesCall =
              !currentId || payload.id === currentId || payload.callId === currentId;

            if (matchesCall) {
              if (
                rawStatus === "connected" ||
                rawStatus === "active" ||
                rawStatus === "connecting"
              ) {
                if (!isEndingRef.current) {
                  setCallStatus("ACTIVE");
                }
              } else if (rawStatus === "ringing" || rawStatus === "calling") {
                if (!isEndingRef.current) {
                  setCallStatus("RINGING");
                }
              } else if (
                rawStatus === "ended" ||
                rawStatus === "terminated" ||
                rawStatus === "rejected" ||
                rawStatus === "failed"
              ) {
                isEndingRef.current = true;
                setCallStatus("ENDED");
                closeCallWithDelay();
              }
            }
          } else if (payload.type === "call-ended") {
            if (!currentId || payload.id === currentId || payload.callId === currentId) {
              isEndingRef.current = true;
              setCallStatus("ENDED");
              closeCallWithDelay();
            }
          }
        } catch {}
      };

      eventSource.onerror = () => {
        // O navegador reconecta o EventSource automaticamente
      };
    } catch (err) {
      console.warn("[AtendiCalls SSE] Erro ao conectar EventSource:", err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [instances, callStatus, closeCallWithDelay]);

  // Monitora mudanças no banco de dados via Supabase Realtime para a chamada ativa
  useEffect(() => {
    if (!profile?.company_id) return;

    const channel = supabase
      .channel("active_call_logs_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_logs",
          filter: `company_id=eq.${profile.company_id}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;

          const currentId = currentCallIdRef.current;
          if (!currentId) return;

          if (newRow.call_id === currentId || newRow.wavoip_call_id === currentId) {
            const rawStatus = (newRow.status || "").toUpperCase();
            console.log(
              `[AtendiCalls] Atualização Realtime recebida para chamada ${currentId}:`,
              rawStatus,
            );

            if (rawStatus === "ACTIVE" || rawStatus === "IN_PROGRESS") {
              setCallStatus("ACTIVE");
            } else if (rawStatus === "RINGING" || rawStatus === "CALLING") {
              setCallStatus(rawStatus as CallStatus);
            } else if (
              rawStatus === "ENDED" ||
              rawStatus === "COMPLETED" ||
              rawStatus === "MISSED" ||
              rawStatus === "REJECTED" ||
              rawStatus === "FAILED" ||
              rawStatus === "NOT_ANSWERED"
            ) {
              setCallStatus("ENDED");
              closeCallWithDelay();
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, closeCallWithDelay]);

  const acceptCall = useCallback(async () => {
    if (!incomingOffer) return;
    setActiveCall(incomingOffer);
    setIncomingOffer(null);
    setCallStatus("ACTIVE");
  }, [incomingOffer]);

  const rejectCall = useCallback(async () => {
    if (!incomingOffer) return;
    setIncomingOffer(null);
    setActiveContactName(null);
    setCallStatus(null);
  }, [incomingOffer]);

  /**
   * Dispara ligação através do motor AtendiCalls na VPS
   * Sempre realiza chamada direta pelo navegador com atendente humano
   */
  const startCall = useCallback(
    async (
      phone: string,
      contactName?: string,
      fromToken?: string,
      _mode?: string,
      _agentPrompt?: string,
    ) => {
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 8) {
        toast.error("Número de telefone inválido para chamada.");
        return false;
      }
      const finalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const displayName = contactName || finalPhone;

      toast.info(`Iniciando ligação para ${displayName}...`);
      setActiveContactName(contactName || null);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (webrtcRef.current) {
        try {
          webrtcRef.current.close();
        } catch {}
        webrtcRef.current = null;
      }
      isEndingRef.current = false;
      setIsConnecting(true);
      setConnectingPhone(finalPhone);

      try {
        const res = await startAtendiCallsVoiceCallAction({
          data: {
            phone: finalPhone,
            contactName: displayName,
            fromToken,
            companyId: profile?.company_id,
          },
        });

        setIsConnecting(false);

        if (!res?.success || !res?.callId) {
          toast.error("Não foi possível iniciar a chamada no AtendiCalls.");
          setActiveContactName(null);
          return false;
        }

        const callObj: CallActive = {
          id: res.callId,
          peer: {
            phone: finalPhone,
            displayName,
          },
          status: "CALLING",
          device_token: fromToken,
        };

        currentCallIdRef.current = res.callId;
        currentSessionIdRef.current = res.sessionId || null;
        currentTokenRef.current = fromToken || res.token || null;
        currentApiUrlRef.current = res.apiUrl || null;
        const matchedInst = instances?.find(
          (i: any) => i.atendicalls_token === fromToken || i.wavoip_token === fromToken,
        );
        currentInstanceIdRef.current = matchedInst?.id || null;

        setActiveCall(callObj);
        setCallStatus("CALLING");

        // Inicia negociação de áudio WebRTC imediatamente pelo navegador
        try {
          const webrtc = await openAtendiCallsWebRTC({
            sdpAnswerCallback: async (sdpOffer) => {
              const ans = await sendAtendiCallsWebRTCOfferAction({
                data: {
                  callId: res.callId,
                  sessionId: res.sessionId,
                  token: fromToken || res.token,
                  apiUrl: res.apiUrl,
                  sdpOffer,
                },
              });
              return ans.sdpAnswer;
            },
          });
          webrtcRef.current = webrtc;
          setRemoteStream(webrtc.remoteStream);
        } catch (audioErr: any) {
          console.warn(
            "[AtendiCalls WebRTC] Microfone do navegador não pôde ser ativado:",
            audioErr,
          );
          toast.warning("Ligação iniciada, mas o acesso ao microfone não foi concedido.");
        }

        setTimeout(() => {
          setCallStatus((prev) => (prev === "CALLING" ? "RINGING" : prev));
        }, 1200);

        return true;
      } catch (e: any) {
        console.error("[AtendiCalls] Falha ao disparar chamada:", e);
        toast.error("Erro ao ligar", {
          description: e?.message || "Falha ao se comunicar com o motor AtendiCalls.",
        });
        setIsConnecting(false);
        setActiveContactName(null);
        return false;
      }
    },
    [profile?.company_id, instances],
  );

  /**
   * Desliga a chamada de forma segura no AtendiCalls (VPS)
   */
  const endCall = useCallback(async () => {
    // Marca encerramento e para imediatamente o polling para não reabrir a chamada
    isEndingRef.current = true;
    setCallStatus("ENDED");
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (webrtcRef.current) {
      try {
        webrtcRef.current.close();
      } catch {}
      webrtcRef.current = null;
    }
    const callId = currentCallIdRef.current || activeCall?.id;
    if (callId) {
      try {
        await hangupAtendiCallsVoiceCallAction({
          data: {
            callId,
            sessionId: currentSessionIdRef.current,
            instanceId: currentInstanceIdRef.current,
            companyId: profile?.company_id,
          },
        });
      } catch (err: any) {
        console.warn("[AtendiCalls] Erro ao desligar chamada:", err?.message || err);
      }
    }
    closeCallWithDelay();
  }, [activeCall, profile?.company_id, closeCallWithDelay]);

  const mute = useCallback(async () => {
    setIsMuted(true);
    webrtcRef.current?.mute();
    toast.info("Microfone silenciado");
  }, []);

  const unmute = useCallback(async () => {
    setIsMuted(false);
    webrtcRef.current?.unmute();
    toast.info("Microfone ativado");
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  return (
    <AtendiCallsContext.Provider
      value={{
        wavoip: null,
        incomingOffer,
        activeCall,
        callStatus,
        acceptCall,
        rejectCall,
        startCall,
        endCall,
        mute,
        unmute,
        isMuted,
        activeContactName,
        isSpeakerOn,
        toggleSpeaker,
        instances,
        isConnecting,
        connectingPhone,
        remoteStream,
      }}
    >
      {children}
    </AtendiCallsContext.Provider>
  );
}

export function useAtendiCalls() {
  const context = useContext(AtendiCallsContext);
  if (context === undefined) {
    throw new Error("useAtendiCalls must be used within an AtendiCallsProvider");
  }
  return context;
}

// Aliases de compatibilidade
export const useWavoip = useAtendiCalls;
export const WavoipProvider = AtendiCallsProvider;
