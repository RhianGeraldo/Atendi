import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import {
  startAtendiCallsVoiceCallAction,
  hangupAtendiCallsVoiceCallAction,
} from "@/lib/api/atendicalls.functions";

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

interface WavoipContextType {
  wavoip: any | null;
  incomingOffer: CallOffer | null;
  activeCall: CallActive | null;
  callStatus: CallStatus | "CONNECTING" | null;
  instances: any[] | undefined;
  isConnecting: boolean;
  connectingPhone: string | null;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  /** true quando a chamada foi iniciada com sucesso pelo AtendiCalls */
  startCall: (phone: string, contactName?: string, fromToken?: string) => Promise<boolean>;
  endCall: () => Promise<void>;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  isMuted: boolean;
  activeContactName: string | null;
  isSpeakerOn: boolean;
  toggleSpeaker: () => void;
}

const WavoipContext = createContext<WavoipContextType | undefined>(undefined);

export function WavoipProvider({ children }: { children: React.ReactNode }) {
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

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCallIdRef = useRef<string | null>(null);

  const closeCallWithDelay = useCallback(() => {
    setCallStatus("ENDED");
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveCall(null);
      setCallStatus(null);
      setIsMuted(false);
      setIsSpeakerOn(false);
      setActiveContactName(null);
      currentCallIdRef.current = null;
    }, 2000);
  }, []);

  // Busca instâncias configuradas com AtendiCalls ou Wavoip para a unidade e departamento
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
        .select("id, atendicalls_token, atendicalls_url, wavoip_token, name, unit_id, department_id")
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

      // Normaliza para que wavoip_token e atendicalls_token coexistam
      return (data ?? []).map((inst: any) => ({
        ...inst,
        wavoip_token: inst.atendicalls_token || inst.wavoip_token,
      }));
    },
    staleTime: 60000,
  });

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
            console.log(`[AtendiCalls] Atualização Realtime recebida para chamada ${currentId}:`, rawStatus);

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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, closeCallWithDelay]);

  const acceptCall = useCallback(async () => {
    // Para chamadas recebidas caso implementado pelo motor
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
   */
  const startCall = useCallback(
    async (phone: string, contactName?: string, fromToken?: string) => {
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 8) {
        toast.error("Número de telefone inválido para chamada.");
        return false;
      }
      const finalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const displayName = contactName || finalPhone;

      toast.info(`Iniciando chamada para ${displayName}...`);
      setActiveContactName(contactName || null);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
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
        setActiveCall(callObj);
        setCallStatus("CALLING");

        // Simula transição suave para chamada tocando após disparo bem sucedido
        setTimeout(() => {
          setCallStatus((prev) => (prev === "CALLING" ? "RINGING" : prev));
        }, 1500);

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
    [profile?.company_id]
  );

  /**
   * Desliga a chamada de forma segura no AtendiCalls (VPS)
   */
  const endCall = useCallback(async () => {
    const callId = currentCallIdRef.current || activeCall?.id;
    if (callId) {
      try {
        await hangupAtendiCallsVoiceCallAction({
          data: {
            callId,
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
    toast.info("Microfone silenciado");
  }, []);

  const unmute = useCallback(async () => {
    setIsMuted(false);
    toast.info("Microfone ativado");
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  return (
    <WavoipContext.Provider
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
      }}
    >
      {children}
    </WavoipContext.Provider>
  );
}

export function useWavoip() {
  const context = useContext(WavoipContext);
  if (context === undefined) {
    throw new Error("useWavoip must be used within a WavoipProvider");
  }
  return context;
}

// Exporta alias moderno useAtendiCalls
export const useAtendiCalls = useWavoip;
