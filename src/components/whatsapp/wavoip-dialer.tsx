import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useWavoip } from "@/hooks/use-wavoip";
import { Phone, Delete, X, Bell, Settings, PhoneForwarded } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDraggable } from "@/hooks/use-draggable";

interface WavoipDialerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WavoipDialer({ open, onOpenChange }: WavoipDialerProps) {
  const [phone, setPhone] = useState("");
  const { startCall, instances } = useWavoip();
  const { profile } = useAuth();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances, selectedInstanceId]);

  const handleDial = (digit: string) => {
    setPhone((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setPhone((prev) => prev.slice(0, -1));
  };

  const makeCall = async () => {
    if (phone.length >= 8) {
      let contactName = undefined;
      
      if (profile?.company_id) {
        const cleanPhone = phone.replace(/\D/g, '');
        const { data } = await supabase
          .from("contacts")
          .select("name")
          .eq("company_id", profile.company_id)
          .like("phone", `%${cleanPhone}%`)
          .limit(1)
          .maybeSingle();
          
        if (data && data.name) {
          contactName = data.name;
        }
      }

      const selectedInstance = instances?.find(i => i.id === selectedInstanceId);
      startCall(phone, contactName, selectedInstance?.wavoip_token);
      onOpenChange(false);
      setPhone("");
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keydown events if they are originating from within the Select dropdown or other inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).closest('[role="listbox"]')) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleDial(e.key);
      } else if (e.key === '*' || e.key === '#') {
        handleDial(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        makeCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, phone, selectedInstanceId]);

  const formatDisplayNumber = (num: string) => {
    let formatted = num;
    if (formatted.length > 2) formatted = `(${formatted.slice(0, 2)}) ${formatted.slice(2)}`;
    if (formatted.length > 10) formatted = `${formatted.slice(0, 10)}-${formatted.slice(10)}`;
    return formatted;
  };

  const { position, handleMouseDown, dragRef, isDragging } = useDraggable();

  if (!open) return null;

  return createPortal(
    <div 
      ref={dragRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className={`fixed bottom-6 right-6 z-[100] w-[320px] sm:w-[340px] h-[550px] bg-white text-slate-800 border border-slate-200 shadow-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-5 flex flex-col font-sans ${isDragging ? 'cursor-grabbing select-none' : 'cursor-default'}`}
    >
      <div className={`flex justify-between items-center p-4 shrink-0 border-b border-slate-100 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <div className="flex items-center gap-2">
          <PhoneForwarded className="w-4 h-4 text-slate-400" />
          {instances && instances.length > 0 ? (
            <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
              <SelectTrigger className="h-8 w-[180px] border-slate-200 bg-slate-50 text-xs">
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id} className="text-xs">
                    {instance.name || "Instância Wavoip"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-slate-400">Nenhuma instância ativa</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-slate-600">
          <button 
            onClick={() => {
              onOpenChange(false);
              setPhone("");
            }}
            className="hover:text-slate-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 px-6 pb-6 flex flex-col overflow-hidden">
        {/* Input Display */}
        <div className="flex flex-col items-center justify-center h-16 shrink-0 mb-2 mt-2">
          <div className="text-3xl font-light tracking-wide truncate w-full text-center text-slate-700">
            {phone ? formatDisplayNumber(phone) : <span className="text-slate-400">Digite...</span>}
          </div>
        </div>

        {/* Dialpad */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 mx-auto w-full max-w-[260px] shrink-0 mt-auto">
          {[
            { n: '1', l: '' }, { n: '2', l: 'ABC' }, { n: '3', l: 'DEF' },
            { n: '4', l: 'GHI' }, { n: '5', l: 'JKL' }, { n: '6', l: 'MNO' },
            { n: '7', l: 'PQRS' }, { n: '8', l: 'TUV' }, { n: '9', l: 'WXYZ' },
            { n: '*', l: '' }, { n: '0', l: '+' }, { n: '#', l: '' }
          ].map((btn) => (
            <button
              key={btn.n}
              onClick={() => handleDial(btn.n)}
              className="w-[60px] h-[60px] rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] active:bg-[#d1d5db] flex flex-col items-center justify-center transition-colors mx-auto"
            >
              <span className="text-2xl font-medium text-slate-800">{btn.n}</span>
              {btn.l && <span className="text-[9px] font-medium text-slate-400 tracking-widest leading-none mt-0.5">{btn.l}</span>}
            </button>
          ))}
          
          {/* Bottom row: empty, call button, delete */}
          <div />
          <button
            onClick={makeCall}
            disabled={phone.length < 8 || !selectedInstanceId}
            className="w-[60px] h-[60px] rounded-full bg-[#10b981] hover:bg-[#059669] active:bg-[#047857] flex items-center justify-center transition-colors mx-auto mt-1 disabled:opacity-50"
          >
            <Phone className="w-7 h-7 text-white fill-white" />
          </button>
          <div className="flex items-center justify-center mt-1">
            {phone.length > 0 && (
              <button
                onClick={handleBackspace}
                className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
              >
                <Delete className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
