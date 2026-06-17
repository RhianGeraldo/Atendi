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
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  startCall: (phone: string) => Promise<void>;
  endCall: () => Promise<void>;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  isMuted: boolean;
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

  // Fetch tokens for the current unit
  const { data: instances } = useQuery({
    queryKey: ["wavoip_instances_tokens", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select("wavoip_token")
        .eq("company_id", profile!.company_id!)
        .not("wavoip_token", "is", null);

      if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
      else q = q.is("unit_id", null);

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
  }, [incomingOffer]);

  const startCall = useCallback(async (phone: string) => {
    if (!wavoip) {
      toast.error("Wavoip não conectado", { description: "Nenhuma instância ativa possui token do Wavoip configurado." });
      return;
    }
    toast.info("Iniciando chamada...");
    try {
      const { call, err } = await wavoip.startCall({ to: phone });
      if (err) {
        toast.error("Erro ao ligar", { description: err.message || "Não foi possível iniciar a chamada" });
        console.error("Não foi possível iniciar a chamada:", err);
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
           });
        });
        call.on("peerReject", () => {
          setActiveCall(null);
          setCallStatus(null);
        });
        call.on("unanswered", () => {
          setActiveCall(null);
          setCallStatus(null);
        });
        call.on("ended", () => {
          setActiveCall(null);
          setCallStatus(null);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [wavoip]);

  const endCall = useCallback(async () => {
    if (!activeCall) return;
    await activeCall.end();
    setActiveCall(null);
    setCallStatus(null);
    setIsMuted(false);
  }, [activeCall]);

  const mute = useCallback(async () => {
    if (!activeCall) return;
    await activeCall.mute();
    setIsMuted(true);
  }, [activeCall]);

  const unmute = useCallback(async () => {
    if (!activeCall) return;
    await activeCall.unmute();
    setIsMuted(false);
  }, [activeCall]);

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
        isMuted
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
