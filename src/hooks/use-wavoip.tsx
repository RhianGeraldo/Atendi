import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { toast } from "sonner";
import { Wavoip, CallOffer, CallActive, CallOutgoing, CallStatus } from "@wavoip/wavoip-api";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";

interface WavoipContextType {
  wavoip: Wavoip | null;
  incomingOffer: CallOffer | null;
  activeCall: CallActive | CallOutgoing | null;
  callStatus: CallStatus | null;
  instances: any[] | undefined;
  isConnecting: boolean;
  connectingPhone: string | null;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  startCall: (phone: string, contactName?: string, fromToken?: string) => Promise<void>;
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

  const [wavoip, setWavoip] = useState<Wavoip | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<CallOffer | null>(null);
  const [activeCall, setActiveCall] = useState<CallActive | CallOutgoing | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [activeContactName, setActiveContactName] = useState<string | null>(null);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingPhone, setConnectingPhone] = useState<string | null>(null);

  // Fetch tokens for the current unit
  const { data: instances } = useQuery({
    queryKey: ["wavoip_instances_tokens", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select("id, wavoip_token, name")
        .eq("company_id", profile!.company_id!)
        .not("wavoip_token", "is", null);

      if (selectedUnitId) {
        q = q.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!instances || instances.length === 0) {
      if (wavoip) {
        // cleanup if possible or wait for re-init
      }
      return;
    }

    const tokens = instances.map(i => i.wavoip_token).filter(Boolean) as string[];
    if (tokens.length === 0) return;

    const wavoipInstance = new Wavoip({ tokens, platform: "atendi-crm" });
    setWavoip(wavoipInstance);

    const unsubOffer = wavoipInstance.on("offer", (offer) => {
      console.log("Chamada recebida de", offer.peer.phone);
      setIncomingOffer(offer);
      setCallStatus(offer.status);
      setActiveContactName(null);

      offer.on("status", setCallStatus);
      offer.on("acceptedElsewhere", () => setIncomingOffer(null));
      offer.on("unanswered", () => setIncomingOffer(null));
      offer.on("ended", () => setIncomingOffer(null));
    });

    return () => {
      unsubOffer();
      // Optionally clean up wavoip connections if supported by the library
    };
  }, [instances]);

  const acceptCall = useCallback(async () => {
    if (!incomingOffer) return;
    try {
      const { call, err } = await incomingOffer.accept();
      if (err) {
        console.error("Erro ao aceitar chamada:", err);
        return;
      }
      if (call) {
        setIncomingOffer(null);
        setActiveCall(call);
        setCallStatus(call.status);
        call.on("status", setCallStatus);
        call.on("ended", () => {
          setActiveCall(null);
          setCallStatus(null);
          setIsMuted(false);
          setIsSpeakerOn(false);
          setActiveContactName(null);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [incomingOffer]);

  const rejectCall = useCallback(async () => {
    if (!incomingOffer) return;
    await incomingOffer.reject();
    setIncomingOffer(null);
    setActiveContactName(null);
  }, [incomingOffer]);

  const startCall = useCallback(async (phone: string, contactName?: string, fromToken?: string) => {
    if (!wavoip) {
      toast.error("Wavoip não conectado", { description: "Nenhuma instância ativa possui token do Wavoip configurado." });
      return;
    }
    const finalPhone = phone.replace(/\D/g, '');
    toast.info(`Iniciando chamada para ${contactName || finalPhone}...`);
    console.log("📞 Tentando ligar para o número do contato:", finalPhone);
    setActiveContactName(contactName || null);
    setIsConnecting(true);
    setConnectingPhone(finalPhone);
    try {
      const startParams: any = { to: finalPhone };
      if (fromToken) {
        startParams.fromTokens = [fromToken];
      }
      const { call, err } = await wavoip.startCall(startParams);
      setIsConnecting(false);
      if (err) {
        let errorMsg = err.message || "Não foi possível iniciar a chamada";
        
        // Verifica se algum device retornou o motivo "CALLING_SAME_PHONE"
        if (err.devices && Array.isArray(err.devices)) {
          const samePhoneError = err.devices.find((d: any) => d.reason === "CALLING_SAME_PHONE");
          if (samePhoneError) {
            errorMsg = "Você não pode ligar para o próprio número da instância conectada.";
          }
        }
        
        toast.error("Erro ao ligar", { description: errorMsg });
        console.error("Erro detalhado do Wavoip:", JSON.stringify(err, null, 2));
        setActiveContactName(null);
        return;
      }
      if (call) {
        setActiveCall(call);
        setCallStatus(call.status);
        call.on("status", setCallStatus);
        call.on("peerAccept", (active) => {
           setActiveCall(active);
           setCallStatus(active.status);
           active.on("status", setCallStatus);
           active.on("ended", () => {
             setActiveCall(null);
             setCallStatus(null);
             setIsMuted(false);
             setIsSpeakerOn(false);
             setActiveContactName(null);
           });
        });
        call.on("peerReject", () => {
          setActiveCall(null);
          setCallStatus(null);
          setActiveContactName(null);
        });
        call.on("unanswered", () => {
          setActiveCall(null);
          setCallStatus(null);
          setActiveContactName(null);
        });
        call.on("ended", () => {
          setActiveCall(null);
          setCallStatus(null);
          setActiveContactName(null);
        });
      }
    } catch (e) {
      console.error(e);
      setActiveContactName(null);
      setIsConnecting(false);
    }
  }, [wavoip]);

  const endCall = useCallback(async () => {
    if (!activeCall) return;
    try {
      await activeCall.end();
    } catch (e) {
      console.error(e);
    }
    setActiveCall(null);
    setCallStatus(null);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setActiveContactName(null);
  }, [activeCall]);

  const mute = useCallback(async () => {
    if (!activeCall) return;
    try {
      if ((activeCall as any).status === "CONNECTED") {
        await (activeCall as CallActive).mute();
      }
      setIsMuted(true);
    } catch (e) {
      console.error("Erro ao mutar", e);
    }
  }, [activeCall]);

  const unmute = useCallback(async () => {
    if (!activeCall) return;
    try {
      if ((activeCall as any).status === "CONNECTED") {
        await (activeCall as CallActive).unmute();
      }
      setIsMuted(false);
    } catch (e) {
      console.error("Erro ao desmutar", e);
    }
  }, [activeCall]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(prev => !prev);
  }, []);

  return (
    <WavoipContext.Provider
      value={{
        wavoip,
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
        connectingPhone
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
