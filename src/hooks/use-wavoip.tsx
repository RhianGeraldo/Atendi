import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { toast } from "sonner";
import { Wavoip, Offer as CallOffer, CallActive, CallOutgoing, CallStatus } from "@wavoip/wavoip-api";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";

interface WavoipContextType {
  wavoip: Wavoip | null;
  incomingOffer: CallOffer | null;
  activeCall: CallActive | CallOutgoing | null;
  callStatus: CallStatus | "CONNECTING" | null;
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
  const [callStatus, setCallStatus] = useState<CallStatus | "CONNECTING" | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [activeContactName, setActiveContactName] = useState<string | null>(null);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingPhone, setConnectingPhone] = useState<string | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const closeCallWithDelay = useCallback(() => {
    setCallStatus("ENDED" as any);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveCall(null);
      setCallStatus(null);
      setIsMuted(false);
      setIsSpeakerOn(false);
      setActiveContactName(null);
    }, 2000);
  }, []);

  // Fetch tokens for the current unit
  const { data: instances } = useQuery({
    queryKey: ["wavoip_instances_tokens", profile?.company_id, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_instances")
        .select("id, wavoip_token, name, unit_id")
        .eq("company_id", profile!.company_id!)
        .not("wavoip_token", "is", null);

      if (selectedUnitId) {
        q = q.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    // Removido refetchInterval para evitar que o hook useEffect remonte a cada 30 segundos,
    // o que causava a desconexão do socket do Wavoip e orfanava as ligações ativas.
    staleTime: Infinity,
  });

  // Handle incoming calls
  useEffect(() => {
    if (!instances || instances.length === 0) return;

    const tokens = instances.map((i: any) => i.wavoip_token).filter(Boolean) as string[];
    if (tokens.length === 0) return;

    const wavoipInstance = new Wavoip({ tokens, platform: "atendi-crm" });
    setWavoip(wavoipInstance);
    
    wavoipInstance.getDevices().forEach((device: any) => {
      device.onStatus((status: string) => {
        console.log(`[Wavoip] Dispositivo ${device.token.substring(0, 8)}... status: ${status}`);
      });
    });

    const unsubOffer = wavoipInstance.on("offer", async (offer: any) => {
      console.log("Chamada recebida de", offer.peer.phone);

      try {
        if (offer.peer.phone && profile?.company_id) {
          // Encontra a instância exata que recebeu a chamada
          const instance = instances.find((i: any) => i.wavoip_token === offer.device_token);
          if (!instance) {
            console.warn("Chamada recebida para um token não carregado nesta sessão.");
            return;
          }

          // Remove todos os caracteres que não sejam números
          const cleanPhone = offer.peer.phone.replace(/\D/g, "");
          const phoneSuffix = cleanPhone.slice(-8);

          const { data: contacts } = await supabase
            .from("contacts")
            .select("id, name")
            .eq("company_id", profile.company_id)
            .ilike("phone", `%${phoneSuffix}%`)
            .limit(1);

          if (contacts && contacts.length > 0) {
            const contact = contacts[0];
            
            // Busca conversa ativa garantindo que ELA PERTENCE à exata instância que está tocando
            const { data: conv } = await supabase
              .from("conversations")
              .select("assigned_agent_id, conversation_sessions!inner(whatsapp_instance_id)")
              .eq("contact_id", contact.id)
              .eq("unit_id", instance.unit_id as string)
              .eq("conversation_sessions.whatsapp_instance_id", instance.id)
              .in("status", ["waiting", "active"])
              .order("started_at", { ascending: false })
              .limit(1);

            if (conv && conv.length > 0) {
              const assignedAgent = conv[0].assigned_agent_id;
              // Se a conversa desta instância exata já tem um dono e não é o usuário atual, silencia.
              if (assignedAgent && assignedAgent !== profile.id) {
                console.log(`Chamada de ${offer.peer.phone} ignorada localmente. Pertence ao atendente ${assignedAgent} na instância ${instance.name}`);
                return;
              }
            }
            
            // Define o nome do contato que ligou
            setActiveContactName(contact.name);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar dono do contato para chamada:", err);
      }

      toast.info(`Recebendo chamada de ${offer.peer.phone}...`);
      setIncomingOffer(offer);
      setCallStatus(offer.status);
      
      offer.on("status", setCallStatus);
      offer.on("acceptedElsewhere", () => setIncomingOffer(null));
      offer.on("unanswered", () => setIncomingOffer(null));
      offer.on("ended", () => setIncomingOffer(null));
    });

    Promise.all(wavoipInstance.wakeUpDevices()).then((results) => {
      console.log("Wavoip devices awakened for incoming calls:", results);
    }).catch(err => {
      console.error("Failed to wake up Wavoip devices:", err);
    });

    return () => {
      unsubOffer();
      const allTokens = wavoipInstance.getDevices().map((d: any) => d.token);
      wavoipInstance.removeDevices(allTokens);
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
        call.on("ended", closeCallWithDelay);
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

  const startCall = useCallback(async (phone: string, contactName?: string, fromToken?: string) => {
    if (!wavoip) {
      toast.error("Wavoip não conectado", { description: "Nenhuma instância ativa possui token do Wavoip configurado." });
      return;
    }
    const finalPhone = phone.replace(/\D/g, '');
    toast.info(`Iniciando chamada para ${contactName || finalPhone}...`);
    console.log("📞 Tentando ligar para o número do contato:", finalPhone);
    setActiveContactName(contactName || null);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
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
           active.on("ended", closeCallWithDelay);
        });
        call.on("peerReject", closeCallWithDelay);
        call.on("unanswered", closeCallWithDelay);
        call.on("ended", closeCallWithDelay);
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
    closeCallWithDelay();
  }, [activeCall]);

  const mute = useCallback(async () => {
    if (!activeCall) return;
    try {
      if ((activeCall as any).status === "ACTIVE") {
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
      if ((activeCall as any).status === "ACTIVE") {
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
