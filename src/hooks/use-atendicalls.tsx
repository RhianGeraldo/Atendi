import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import {
  startAtendiCallsVoiceCallAction,
  hangupAtendiCallsVoiceCallAction,
  acceptAtendiCallsCallAction,
  rejectAtendiCallsCallAction,
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

const ACTIVE_CALL_STORAGE_KEY = "atendicalls_active_call_session";

interface StoredCallSession {
  callId: string;
  sessionId: string | null;
  token: string | null;
  apiUrl: string | null;
  instanceId: string | null;
  peerPhone: string;
  peerDisplayName: string;
  status: CallStatus | "CONNECTING";
  savedAt: number;
}

function saveActiveCallSession(data: StoredCallSession) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_CALL_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearActiveCallSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
  } catch {}
}

function getStoredActiveCallSession(): StoredCallSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_CALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCallSession;
    // Ignora sessões salvas há mais de 2 horas
    if (Date.now() - parsed.savedAt > 2 * 60 * 60 * 1000) {
      clearActiveCallSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

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
  const activeCallRef = useRef<CallActive | null>(activeCall);
  activeCallRef.current = activeCall;
  const callStatusRef = useRef<CallStatus>(callStatus);
  callStatusRef.current = callStatus;

  // Estabelece ou reconecta o canal de áudio WebRTC de forma segura
  const establishWebRTC = useCallback(
    async (
      callId: string,
      sessionId?: string | null,
      token?: string | null,
      apiUrl?: string | null,
    ) => {
      if (webrtcRef.current) return webrtcRef.current;
      try {
        console.log(`[AtendiCalls WebRTC] Conectando áudio para chamada ${callId}...`);
        const webrtc = await openAtendiCallsWebRTC({
          sdpAnswerCallback: async (sdpOffer) => {
            const ans = await sendAtendiCallsWebRTCOfferAction({
              data: {
                callId,
                sessionId,
                token,
                apiUrl,
                sdpOffer,
              },
            });
            return ans.sdpAnswer;
          },
        });
        webrtcRef.current = webrtc;
        setRemoteStream(webrtc.remoteStream);
        return webrtc;
      } catch (audioErr: any) {
        console.warn(
          "[AtendiCalls WebRTC] Microfone do navegador não pôde ser ativado:",
          audioErr,
        );
        return null;
      }
    },
    [],
  );

  const closeCallWithDelay = useCallback(() => {
    isEndingRef.current = true;
    clearActiveCallSession();
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
      clearActiveCallSession();
    }, 1500);
  }, []);

  // Recupera chamada em andamento ao navegar ou recarregar a página
  useEffect(() => {
    const stored = getStoredActiveCallSession();
    if (!stored || activeCall) return;

    console.log("[AtendiCalls] Restaurando chamada ativa do armazenamento:", stored);
    currentCallIdRef.current = stored.callId;
    currentSessionIdRef.current = stored.sessionId;
    currentTokenRef.current = stored.token;
    currentApiUrlRef.current = stored.apiUrl;
    currentInstanceIdRef.current = stored.instanceId;
    setActiveContactName(stored.peerDisplayName);
    setActiveCall({
      id: stored.callId,
      peer: {
        phone: stored.peerPhone,
        displayName: stored.peerDisplayName,
      },
      status: stored.status,
      device_token: stored.token || undefined,
    });
    setCallStatus(stored.status);

    syncAtendiCallsCallStatusAction({
      data: {
        callId: stored.callId,
        companyId: profile?.company_id,
        instanceId: stored.instanceId,
        token: stored.token,
        apiUrl: stored.apiUrl,
      },
    })
      .then((res) => {
        if (res?.success) {
          if (res.status === "ACTIVE") {
            setCallStatus("ACTIVE");
            saveActiveCallSession({ ...stored, status: "ACTIVE" });
            establishWebRTC(stored.callId, stored.sessionId, stored.token, stored.apiUrl);
          } else if (res.status === "ENDED") {
            closeCallWithDelay();
          } else {
            establishWebRTC(stored.callId, stored.sessionId, stored.token, stored.apiUrl);
          }
        } else {
          establishWebRTC(stored.callId, stored.sessionId, stored.token, stored.apiUrl);
        }
      })
      .catch(() => {
        establishWebRTC(stored.callId, stored.sessionId, stored.token, stored.apiUrl);
      });
  }, [profile?.company_id, activeCall, establishWebRTC, closeCallWithDelay]);

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

  // Identificador estável de instâncias para evitar reconexões desnecessárias de SSE
  const instancesTokenKey = useMemo(() => {
    if (!instances?.length) return "";
    return instances
      .map((i: any) => `${i.id}:${i.atendicalls_token || i.wavoip_token || ""}`)
      .sort()
      .join("|");
  }, [instances]);

  // Conexão Realtime SSE direta com o motor AtendiCalls para eventos instantâneos em todas as instâncias disponíveis
  useEffect(() => {
    if (!instances || !instances.length) return;

    let clientId = localStorage.getItem("atendicalls.clientId");
    if (!clientId) {
      clientId = "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("atendicalls.clientId", clientId);
    }

    // Coleta todas as instâncias únicas com token configurado (suporta múltiplas instâncias simultâneas)
    const uniqueInstances = new Map<string, { token: string; apiUrl: string; instanceId: string }>();
    for (const inst of instances) {
      const token = inst.atendicalls_token || inst.wavoip_token;
      if (token && !uniqueInstances.has(token)) {
        uniqueInstances.set(token, {
          token,
          apiUrl: (inst.atendicalls_url || "https://calls.esteticaelaser.com.br").replace(/\/+$/, ""),
          instanceId: inst.id,
        });
      }
    }

    // Se houver chamada em andamento com token específico não mapeado, inclui no monitoramento
    if (currentTokenRef.current && !uniqueInstances.has(currentTokenRef.current)) {
      uniqueInstances.set(currentTokenRef.current, {
        token: currentTokenRef.current,
        apiUrl: (currentApiUrlRef.current || "https://calls.esteticaelaser.com.br").replace(/\/+$/, ""),
        instanceId: currentInstanceIdRef.current || "",
      });
    }

    const eventSources: EventSource[] = [];

    uniqueInstances.forEach(({ token, apiUrl, instanceId }) => {
      try {
        const sseUrl = `${apiUrl}/api/events?clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(token)}`;
        const es = new EventSource(sseUrl);

        es.onmessage = (event) => {
          try {
            if (isEndingRef.current) return;
            const payload = JSON.parse(event.data);
            const currentId = currentCallIdRef.current;

            if (payload.type === "call-list") {
              const calls = payload.calls || [];
              // Importante: Apenas restaura se este navegador já possuir o ID da chamada (evita roubar chamadas de outros operadores)
              if (!currentId) return;

              const liveCall = calls.find((c: any) => {
                const isLive =
                  c.status === "connected" ||
                  c.status === "active" ||
                  c.status === "ringing" ||
                  c.status === "calling" ||
                  c.status === "starting" ||
                  c.status === "connecting";
                if (!isLive) return false;
                return c.callId === currentId || c.id === currentId;
              });

              if (liveCall && !isEndingRef.current) {
                const callId = liveCall.callId || liveCall.id;
                const mappedStatus =
                  liveCall.status === "connected" || liveCall.status === "active"
                    ? "ACTIVE"
                    : "RINGING";
                const peerPhone = liveCall.peer || "";
                const peerName = liveCall.name || peerPhone || "Cliente";

                currentCallIdRef.current = callId;
                currentSessionIdRef.current = liveCall.sessionId || currentSessionIdRef.current;
                currentTokenRef.current = token;
                currentApiUrlRef.current = apiUrl;
                currentInstanceIdRef.current = instanceId;

                setActiveCall((prev) =>
                  prev && prev.id === callId
                    ? prev
                    : {
                        id: callId,
                        peer: {
                          phone: peerPhone,
                          displayName: peerName,
                        },
                        status: mappedStatus,
                        device_token: token,
                      },
                );
                setCallStatus((prev) => (prev !== "ENDED" ? mappedStatus : prev));
                setActiveContactName((prev) => prev || peerName);

                saveActiveCallSession({
                  callId,
                  sessionId: liveCall.sessionId || currentSessionIdRef.current,
                  token,
                  apiUrl,
                  instanceId,
                  peerPhone,
                  peerDisplayName: peerName,
                  status: mappedStatus,
                  savedAt: Date.now(),
                });

                if (!webrtcRef.current) {
                  establishWebRTC(callId, liveCall.sessionId, token, apiUrl);
                }
              }
            } else if (payload.type === "call-status") {
              const rawStatus = (payload.status || "").toLowerCase();
              const matchesCall =
                currentId && (payload.id === currentId || payload.callId === currentId);

              if (matchesCall) {
                if (
                  rawStatus === "connected" ||
                  rawStatus === "active" ||
                  rawStatus === "connecting"
                ) {
                  if (!isEndingRef.current) {
                    setCallStatus("ACTIVE");
                    const stored = getStoredActiveCallSession();
                    if (stored) {
                      saveActiveCallSession({ ...stored, status: "ACTIVE" });
                    }
                    if (!webrtcRef.current) {
                      establishWebRTC(
                        currentId,
                        payload.sessionId || currentSessionIdRef.current,
                        token,
                        apiUrl,
                      );
                    }
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
              if (currentId && (payload.id === currentId || payload.callId === currentId)) {
                isEndingRef.current = true;
                setCallStatus("ENDED");
                closeCallWithDelay();
              }
            } else if (payload.type === "incoming") {
              // Notifica chamada recebida para esta instância se o atendente estiver livre
              if (
                !currentCallIdRef.current &&
                (!activeCallRef.current ||
                  callStatusRef.current === "ENDED" ||
                  callStatusRef.current === null)
              ) {
                setIncomingOffer({
                  id: payload.id,
                  peer: {
                    phone: payload.peer || "",
                    displayName: payload.name || payload.peer || "Cliente",
                    profilePicture: payload.pictureUrl,
                  },
                  status: "RINGING",
                  device_token: token,
                });
                setCallStatus("RINGING");
              }
            } else if (payload.type === "incoming-claimed") {
              // Se outro operador atendeu em outro computador, descarta o modal de chamada recebida
              setIncomingOffer((prev) => (prev?.id === payload.id ? null : prev));
            }
          } catch {}
        };

        es.onerror = () => {
          // Reconexão automática pelo navegador
        };

        eventSources.push(es);
      } catch (err) {
        console.warn(`[AtendiCalls SSE] Erro ao conectar instância ${instanceId}:`, err);
      }
    });

    return () => {
      eventSources.forEach((es) => es.close());
    };
  }, [instancesTokenKey, instances, establishWebRTC, closeCallWithDelay]);

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
    const callId = incomingOffer.id;
    const token = incomingOffer.device_token || currentTokenRef.current;
    const matchedInst = instances?.find(
      (i: any) => i.atendicalls_token === token || i.wavoip_token === token,
    );
    const apiUrl = (
      matchedInst?.atendicalls_url || "https://calls.esteticaelaser.com.br"
    ).replace(/\/+$/, "");

    currentCallIdRef.current = callId;
    currentTokenRef.current = token;
    currentApiUrlRef.current = apiUrl;
    currentInstanceIdRef.current = matchedInst?.id || null;

    setActiveCall(incomingOffer);
    setIncomingOffer(null);
    setCallStatus("ACTIVE");

    try {
      await acceptAtendiCallsCallAction({
        data: {
          callId,
          token,
          apiUrl,
        },
      });
    } catch (e) {
      console.warn("[AtendiCalls] Erro ao enviar aceite de chamada:", e);
    }

    saveActiveCallSession({
      callId,
      sessionId: null,
      token,
      apiUrl,
      instanceId: matchedInst?.id || null,
      peerPhone: incomingOffer.peer.phone,
      peerDisplayName: incomingOffer.peer.displayName || incomingOffer.peer.phone,
      status: "ACTIVE",
      savedAt: Date.now(),
    });

    await establishWebRTC(callId, null, token, apiUrl);
  }, [incomingOffer, instances, establishWebRTC]);

  const rejectCall = useCallback(async () => {
    if (!incomingOffer) return;
    const callId = incomingOffer.id;
    const token = incomingOffer.device_token || currentTokenRef.current;
    const matchedInst = instances?.find(
      (i: any) => i.atendicalls_token === token || i.wavoip_token === token,
    );
    const apiUrl = (
      matchedInst?.atendicalls_url || "https://calls.esteticaelaser.com.br"
    ).replace(/\/+$/, "");

    setIncomingOffer(null);
    setActiveContactName(null);
    setCallStatus(null);

    try {
      await rejectAtendiCallsCallAction({
        data: {
          callId,
          token,
          apiUrl,
        },
      });
    } catch (e) {
      console.warn("[AtendiCalls] Erro ao enviar rejeição de chamada:", e);
    }
  }, [incomingOffer, instances]);

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

      if (activeCall && (callStatus === "ACTIVE" || callStatus === "CALLING" || callStatus === "RINGING")) {
        toast.warning("Você já possui uma chamada em andamento neste navegador.");
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

      const effectiveToken =
        fromToken ||
        instances?.[0]?.atendicalls_token ||
        instances?.[0]?.wavoip_token;
      const matchedInst = instances?.find(
        (i: any) =>
          i.atendicalls_token === effectiveToken || i.wavoip_token === effectiveToken,
      );

      try {
        const res = await startAtendiCallsVoiceCallAction({
          data: {
            phone: finalPhone,
            contactName: displayName,
            fromToken: effectiveToken,
            instanceId: matchedInst?.id,
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
          device_token: effectiveToken,
        };

        currentCallIdRef.current = res.callId;
        currentSessionIdRef.current = res.sessionId || null;
        currentTokenRef.current = effectiveToken || res.token || null;
        currentApiUrlRef.current = res.apiUrl || null;
        currentInstanceIdRef.current = matchedInst?.id || null;

        setActiveCall(callObj);
        setCallStatus("CALLING");

        saveActiveCallSession({
          callId: res.callId,
          sessionId: res.sessionId || null,
          token: effectiveToken || res.token || null,
          apiUrl: res.apiUrl || null,
          instanceId: matchedInst?.id || null,
          peerPhone: finalPhone,
          peerDisplayName: displayName,
          status: "CALLING",
          savedAt: Date.now(),
        });

        // Inicia negociação de áudio WebRTC imediatamente pelo navegador
        await establishWebRTC(res.callId, res.sessionId, effectiveToken || res.token, res.apiUrl);

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
    [profile?.company_id, instances, establishWebRTC],
  );

  /**
   * Desliga a chamada de forma segura no AtendiCalls (VPS)
   */
  const endCall = useCallback(async () => {
    // Marca encerramento e para imediatamente o polling para não reabrir a chamada
    isEndingRef.current = true;
    clearActiveCallSession();
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
