import { useWavoip } from "@/hooks/use-wavoip";
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function WavoipCallOverlay() {
  const { incomingOffer, activeCall, callStatus, acceptCall, rejectCall, endCall, mute, unmute, isMuted } = useWavoip();

  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === "CONNECTED") {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (!incomingOffer && !activeCall) return null;

  // Chamada recebida
  if (incomingOffer && !activeCall) {
    const caller = incomingOffer.peer;
    return (
      <div className="fixed bottom-6 right-6 z-[100] w-80 bg-background border shadow-xl rounded-xl overflow-hidden animate-in slide-in-from-bottom-5">
        <div className="bg-primary/10 p-4 text-center">
          <Avatar className="w-16 h-16 mx-auto mb-3 border-2 border-background shadow-sm">
            <AvatarImage src={caller.profilePicture || ""} alt={caller.displayName || caller.phone} />
            <AvatarFallback><User className="w-8 h-8 text-muted-foreground" /></AvatarFallback>
          </Avatar>
          <h3 className="font-semibold text-lg">{caller.displayName || "Desconhecido"}</h3>
          <p className="text-sm text-muted-foreground">{caller.phone}</p>
          <div className="mt-2 text-xs font-medium text-primary animate-pulse flex items-center justify-center gap-1">
            <PhoneCall className="w-3 h-3" /> Chamada de Áudio
          </div>
        </div>
        <div className="p-4 flex gap-3">
          <Button variant="destructive" className="flex-1 rounded-full h-12" onClick={rejectCall}>
            <PhoneOff className="w-5 h-5 mr-2" /> Recusar
          </Button>
          <Button className="flex-1 rounded-full h-12 bg-green-600 hover:bg-green-700" onClick={acceptCall}>
            <Phone className="w-5 h-5 mr-2" /> Aceitar
          </Button>
        </div>
      </div>
    );
  }

  // Chamada ativa ou saindo
  if (activeCall) {
    const peer = activeCall.peer;
    return (
      <div className="fixed bottom-6 right-6 z-[100] w-80 bg-background border shadow-xl rounded-xl overflow-hidden animate-in slide-in-from-bottom-5">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border shadow-sm">
              <AvatarImage src={peer.profilePicture || ""} alt={peer.displayName || peer.phone} />
              <AvatarFallback><User className="w-5 h-5 text-muted-foreground" /></AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-sm leading-tight line-clamp-1">{peer.displayName || peer.phone}</h3>
              <div className="text-xs font-mono text-muted-foreground mt-0.5">
                {callStatus === "CALLING" && "Discando..."}
                {callStatus === "CONNECTING" && "Conectando..."}
                {callStatus === "CONNECTED" && formatDuration(callDuration)}
                {!["CALLING", "CONNECTING", "CONNECTED"].includes(callStatus || "") && (callStatus || "Aguardando")}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-muted/30 p-3 flex justify-center gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            className={`rounded-full h-12 w-12 border-2 ${isMuted ? 'bg-muted border-muted-foreground/30' : ''}`}
            onClick={isMuted ? unmute : mute}
            disabled={callStatus !== "CONNECTED"}
          >
            {isMuted ? <MicOff className="w-5 h-5 text-muted-foreground" /> : <Mic className="w-5 h-5" />}
          </Button>
          
          <Button 
            variant="destructive" 
            size="icon" 
            className="rounded-full h-12 w-12 shadow-md hover:scale-105 transition-transform"
            onClick={endCall}
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
