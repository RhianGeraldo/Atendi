import { useWavoip } from "@/hooks/use-wavoip";
import { PhoneOff, Mic, MicOff, PhoneCall, User, Pause, Video, PhoneForwarded, Grip, Bell, Settings, X, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDraggable } from "@/hooks/use-draggable";

export function WavoipCallOverlay() {
  const { incomingOffer, activeCall, callStatus, acceptCall, rejectCall, endCall, mute, unmute, isMuted, activeContactName, isConnecting, connectingPhone } = useWavoip();

  const [callDuration, setCallDuration] = useState(0);
  const { position, handleMouseDown, dragRef, isDragging } = useDraggable();

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

  if (!incomingOffer && !activeCall && !isConnecting) return null;

  // Header comum
  const Header = () => (
    <div className={`flex justify-end items-center p-4 pb-2 shrink-0 gap-4 text-slate-600 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
      <Bell className="w-4 h-4 cursor-pointer hover:text-slate-900 transition-colors" />
      <Settings className="w-4 h-4 cursor-pointer hover:text-slate-900 transition-colors" />
      <button className="hover:text-slate-900 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  // Chamada recebida
  if (incomingOffer && !activeCall) {
    const caller = incomingOffer.peer;
    return createPortal(
      <div 
        ref={dragRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className={`fixed bottom-6 right-6 z-[100] w-[320px] sm:w-[340px] h-[550px] bg-white border border-slate-200 shadow-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-5 text-slate-800 flex flex-col font-sans ${isDragging ? 'cursor-grabbing select-none' : 'cursor-default'}`}
      >
        <Header />
        
        <div className="flex flex-col items-center mt-2 mb-6 gap-2">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
            <MessageCircle className="w-4 h-4" /> Whatsapp Audio
          </div>
          
          <div className="text-slate-400 text-sm mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Recebendo chamada...
          </div>
          
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl border-[3px] border-green-500/30 animate-ping" />
            <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-slate-200 flex items-center justify-center relative z-10 overflow-hidden shadow-sm">
              {caller.profilePicture ? (
                <img src={caller.profilePicture} alt="Caller" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-slate-400" />
              )}
            </div>
          </div>
          <h3 className="text-2xl font-light text-slate-800">{caller.displayName || "Desconhecido"}</h3>
          <p className="text-lg text-slate-500 font-light">{caller.phone}</p>
        </div>

        <div className="p-8 flex justify-around items-center mt-auto mb-8">
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={rejectCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-transform hover:scale-105 shadow-md"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Recusar</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-[#10b981] hover:bg-[#059669] flex items-center justify-center transition-transform hover:scale-105 shadow-md"
            >
              <PhoneCall className="w-6 h-6 text-white fill-white" />
            </button>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Aceitar</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Chamada ativa ou saindo
  if (activeCall) {
    const peer = activeCall.peer;
    const displayName = activeContactName || peer.displayName || "Desconhecido";
    
    return createPortal(
      <div 
        ref={dragRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className={`fixed bottom-6 right-6 z-[100] w-[320px] sm:w-[340px] h-[550px] bg-white border border-slate-200 shadow-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-5 text-slate-800 flex flex-col font-sans ${isDragging ? 'cursor-grabbing select-none' : 'cursor-default'}`}
      >
        <Header />
        
        <div className="flex flex-col items-center mt-2 mb-8 gap-2">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
            <MessageCircle className="w-4 h-4" /> Whatsapp Audio
          </div>
          
          <div className="flex items-center justify-center gap-4 w-full px-8">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
              {peer.profilePicture ? (
                <img src={peer.profilePicture} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-slate-400" />
              )}
            </div>
            
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="text-slate-400 text-xs mb-0.5 truncate">
                {callStatus === "CALLING" && "Chamando..."}
                {callStatus === "CONNECTING" && "Conectando..."}
                {callStatus === "CONNECTED" && formatDuration(callDuration)}
                {!["CALLING", "CONNECTING", "CONNECTED"].includes(callStatus || "") && (callStatus || "Aguardando")}
              </div>
              <h3 className="text-xl font-light text-slate-800 truncate">{displayName}</h3>
              {displayName !== peer.phone && (
                <p className="text-sm text-slate-500 font-light truncate">{peer.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* 3x2 Grid Controls */}
        <div className="px-8 mt-auto mb-10">
          <div className="grid grid-cols-3 gap-y-6 gap-x-4">
            <div className="flex flex-col items-center gap-2">
              <button className="w-[52px] h-[52px] rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center transition-colors text-slate-700">
                <Pause className="w-5 h-5 fill-current" />
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Espera</span>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <button className="w-[52px] h-[52px] rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center transition-colors text-slate-700">
                <Video className="w-5 h-5 fill-current" />
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Vídeo</span>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <button 
                onClick={isMuted ? unmute : mute}
                className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-colors ${
                  isMuted ? 'bg-slate-800 text-white' : 'bg-[#f3f4f6] hover:bg-[#e5e7eb] text-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 fill-current" />}
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Silenciar</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button className="w-[52px] h-[52px] rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center transition-colors text-slate-700">
                <PhoneForwarded className="w-5 h-5 fill-current" />
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Transferir</span>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <button 
                onClick={endCall}
                className="w-[52px] h-[52px] rounded-full bg-[#ef4444] hover:bg-[#dc2626] flex items-center justify-center transition-transform hover:scale-105 shadow-md text-white"
              >
                <PhoneOff className="w-5 h-5 fill-current" />
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Finalizar</span>
            </div>
            
            <div className="flex flex-col items-center gap-2">
              <button className="w-[52px] h-[52px] rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] flex items-center justify-center transition-colors text-slate-700">
                <Grip className="w-5 h-5 fill-current" />
              </button>
              <span className="text-[10px] text-slate-400 tracking-wider">Teclado</span>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Chamada iniciando (dialing)
  if (isConnecting) {
    const displayName = activeContactName || "Desconhecido";
    
    return createPortal(
      <div 
        ref={dragRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className={`fixed bottom-6 right-6 z-[100] w-[320px] sm:w-[340px] h-[550px] bg-white border border-slate-200 shadow-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-5 text-slate-800 flex flex-col font-sans ${isDragging ? 'cursor-grabbing select-none' : 'cursor-default'}`}
      >
        <Header />
        
        <div className="flex flex-col items-center mt-2 mb-8 gap-2">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
            <MessageCircle className="w-4 h-4" /> Whatsapp Audio
          </div>
          
          <div className="text-slate-400 text-sm mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" /> Iniciando chamada...
          </div>
          
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-2xl bg-slate-100 border-2 border-slate-200 flex items-center justify-center relative z-10 overflow-hidden shadow-sm">
              <User className="w-10 h-10 text-slate-400" />
            </div>
          </div>
          <h3 className="text-2xl font-light text-slate-800">{displayName}</h3>
          <p className="text-lg text-slate-500 font-light">{connectingPhone}</p>
        </div>

        <div className="p-8 flex justify-center items-center mt-auto mb-8">
          <div className="flex flex-col items-center gap-2">
            <button 
              className="w-[52px] h-[52px] rounded-full bg-[#ef4444] opacity-50 cursor-not-allowed flex items-center justify-center shadow-md text-white"
            >
              <PhoneOff className="w-5 h-5 fill-current" />
            </button>
            <span className="text-[10px] text-slate-400 tracking-wider">Cancelando...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }
  
  return null;
}
