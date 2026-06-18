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


  const updateCallLog = async (data: any) => {
    try {
      const payload: any = {};
      if (data.status !== undefined) payload.status = data.status;
      if (data.started_at !== undefined) payload.started_at = data.started_at;
      if (data.ended_at !== undefined) payload.ended_at = data.ended_at;
      if (data.recording_url !== undefined) payload.recording_url = data.recording_url;

      const { error } = await supabase.from('call_logs').update(payload).eq('wavoip_call_id', data.wavoip_call_id);
      if (error) console.error("[Wavoip] Erro ao atualizar log:", error);
    } catch (e) {
      console.error("[Wavoip] Exceção update log:", e);
    }
  };

  const upsertCallLog = async (data: any) => {
    if (!profile?.company_id) return;
    try {
      let contact_id = data.contact_id;
      if (!contact_id && data.peer_number) {
        const phoneSuffix = data.peer_number.replace(/\D/g, "").slice(-8);
        const { data: contacts } = await supabase.from('contacts').select('id').eq('company_id', profile.company_id).ilike('phone', `%${phoneSuffix}%`).limit(1);
        if (contacts && contacts.length > 0) contact_id = contacts[0].id;
      }
      
      const payload: any = {
        wavoip_call_id: data.wavoip_call_id,
        company_id: profile.company_id,
        direction: data.direction,
        status: data.status,
      };
      
      if (data.whatsapp_instance_id !== undefined) payload.whatsapp_instance_id = data.whatsapp_instance_id;
      if (contact_id !== undefined) payload.contact_id = contact_id;
      if (data.assigned_agent_id !== undefined) payload.assigned_agent_id = data.assigned_agent_id;
      if (data.started_at !== undefined) payload.started_at = data.started_at;
      if (data.ended_at !== undefined) payload.ended_at = data.ended_at;
      if (data.duration_seconds !== undefined) payload.duration_seconds = data.duration_seconds;
      if (data.recording_url !== undefined) payload.recording_url = data.recording_url;
      if (data.peer_number !== undefined) payload.peer_number = data.peer_number;

      const { error } = await supabase.from('call_logs').upsert(payload, { onConflict: 'wavoip_call_id' });
      if (error) console.error("[Wavoip] Erro ao salvar log:", error);
    } catch (e) {
      console.error("[Wavoip] Exceção log:", e);
    }
  };

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeCallRef = useRef<any>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

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
        // Busca as instâncias da unidade selecionada OU as instâncias globais da empresa (Sede, unit_id null)
        // Isso garante que se o cliente ligar no número principal, o atendente consiga receber.
        q = q.or(`unit_id.eq.${selectedUnitId},unit_id.is.null`);
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
            .ilike("phone", `%${phoneSuffix}%`);

          if (contacts && contacts.length > 0) {
            const contactIds = contacts.map((c: any) => c.id);
            const activeContactName = contacts[0].name; // Usa o nome do primeiro
            
            console.log(`[Wavoip] Encontrados ${contactIds.length} contatos para o telefone. IDs:`, contactIds);

            // Busca TODAS as conversas ativas/em espera para esses contatos NA MESMA INSTÂNCIA
            const { data: activeConvs, error: convError } = await supabase
              .from("conversations")
              .select("id, assigned_agent_id")
              .in("contact_id", contactIds)
              .in("status", ["waiting", "active"])
              .eq("whatsapp_instance_id", instance.id);

            if (convError) {
              console.error("[Wavoip] Erro ao buscar conversas do contato:", convError);
            }

            console.log(`[Wavoip] Conversas ativas no banco para o contato na instância ${instance.name}:`, activeConvs);

            let convsInThisInstance: any[] = activeConvs || [];

            console.log(`[Wavoip] Conversas filtradas para a instância atual (${instance.name}):`, convsInThisInstance);

            if (convsInThisInstance.length > 0) {
              // Verifica se o usuário atual é o dono de alguma das conversas nesta instância
              const myConv = convsInThisInstance.find((c: any) => c.assigned_agent_id === profile.id);
              
              if (!myConv) {
                // Se o usuário atual não é o dono, verifica se existe OUTRO dono
                const otherConv = convsInThisInstance.find((c: any) => c.assigned_agent_id !== null);
                if (otherConv) {
                  console.log(`[Wavoip] Chamada ignorada. O contato já está sendo atendido por ${otherConv.assigned_agent_id} na instância ${instance.name}.`);
                  return; // Silencia para este usuário
                }
              } else {
                console.log(`[Wavoip] Chamada permitida. Usuário atual é o dono do ticket na instância ${instance.name}.`);
              }
            } else {
              console.log(`[Wavoip] Nenhum ticket em andamento na instância ${instance.name}. Tocando para todos os usuários com acesso a ela!`);
            }
            
            // Define o nome do contato que ligou
            setActiveContactName(activeContactName);
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
      offer.on("unanswered", () => {
        const instance = instances.find((i: any) => i.wavoip_token === offer.device_token);
        upsertCallLog({
          wavoip_call_id: offer.id,
          whatsapp_instance_id: instance?.id,
          assigned_agent_id: profile?.id,
          direction: 'INCOMING',
          status: 'NOT_ANSWERED',
          peer_number: offer.peer.phone,
          ended_at: new Date().toISOString(),
        });
        setIncomingOffer(null);
      });
      offer.on("ended", () => {
        if (!activeCallRef.current) {
          const instance = instances.find((i: any) => i.wavoip_token === offer.device_token);
          upsertCallLog({
            wavoip_call_id: offer.id,
            whatsapp_instance_id: instance?.id,
            assigned_agent_id: profile?.id,
            direction: 'INCOMING',
            status: 'NOT_ANSWERED',
            peer_number: offer.peer.phone,
            ended_at: new Date().toISOString(),
          });
        }
        setIncomingOffer(null);
      });
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
        
        call.on("status", (status) => {
          setCallStatus(status);
          if (status === 'ENDED' || status === 'REJECTED' || status === 'FAILED' || status === 'DISCONNECTED') {
            updateCallLog({
              wavoip_call_id: call.id,
              status,
              ended_at: new Date().toISOString(),
              recording_url: `https://storage.wavoip.com/${call.id}`
            });
            setTimeout(closeCallWithDelay, 1000);
          } else {
            updateCallLog({ wavoip_call_id: call.id, status });
          }
        });
        
          const instance = instances.find((i: any) => i.wavoip_token === call.device_token);
          upsertCallLog({
            wavoip_call_id: call.id,
            whatsapp_instance_id: instance?.id,
            assigned_agent_id: profile?.id,
            direction: 'INCOMING',
            status: call.status,
            peer_number: call.peer.phone,
            started_at: new Date().toISOString(),
          });
      }
    } catch (e) {
      console.error(e);
    }
  }, [incomingOffer]);

  const rejectCall = useCallback(async () => {
    if (!incomingOffer) return;
    try {
      console.log("Rejeitando chamada API Wavoip...", incomingOffer.id);
      if (typeof incomingOffer.reject === "function") {
        await incomingOffer.reject();
        console.log("Chamada rejeitada na API Wavoip.");
        const instance = instances.find((i: any) => i.wavoip_token === incomingOffer.device_token);
        upsertCallLog({
          wavoip_call_id: incomingOffer.id,
          whatsapp_instance_id: instance?.id,
          assigned_agent_id: profile?.id,
          direction: 'INCOMING',
          status: 'REJECTED',
          peer_number: incomingOffer.peer.phone,
          ended_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Erro ao recusar chamada:", e);
    } finally {
      setIncomingOffer(null);
      setActiveContactName(null);
      setCallStatus(null);
    }
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
        
        call.on("status", (status) => {
          setCallStatus(status);
          if (status === 'ENDED' || status === 'REJECTED' || status === 'FAILED' || status === 'DISCONNECTED') {
            updateCallLog({
              wavoip_call_id: call.id,
              status,
              ended_at: new Date().toISOString(),
              recording_url: `https://storage.wavoip.com/${call.id}`
            });
            setTimeout(closeCallWithDelay, 1000);
          } else {
            updateCallLog({ wavoip_call_id: call.id, status });
          }
        });
        const instance = instances.find((i: any) => i.wavoip_token === call.device_token);
        upsertCallLog({
          wavoip_call_id: call.id,
          whatsapp_instance_id: instance?.id,
          assigned_agent_id: profile?.id,
          direction: 'OUTGOING',
          status: call.status,
          peer_number: call.peer.phone,
          started_at: new Date().toISOString(),
        });
        call.on("peerAccept", (active) => {
           setActiveCall(active);
           setCallStatus(active.status);
           
           active.on("status", (status) => {
             setCallStatus(status);
             if (status === 'ENDED' || status === 'REJECTED' || status === 'FAILED' || status === 'DISCONNECTED') {
               updateCallLog({
                 wavoip_call_id: active.id,
                 status,
                 ended_at: new Date().toISOString(),
                 recording_url: `https://storage.wavoip.com/${active.id}`
               });
               setTimeout(closeCallWithDelay, 1000);
             } else {
               updateCallLog({ wavoip_call_id: active.id, status });
             }
           });
           
           updateCallLog({
             wavoip_call_id: active.id,
             status: 'ACTIVE',
             started_at: new Date().toISOString()
           });
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
