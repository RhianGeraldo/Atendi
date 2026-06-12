import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { QrCode, Smartphone, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EvoGoClient } from "@/integrations/evogo/client";
import { supabase } from "@/integrations/supabase/client";

interface QrCodeModalProps {
  instance: any; // { id, name, instance_name, evogo_api_key, status }
  company: any; // { evogo_host, evogo_global_token }
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function QrCodeModal({ instance, company, open, onOpenChange, onSuccess }: QrCodeModalProps) {
  const qc = useQueryClient();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "qr" | "connected">("loading");

  useEffect(() => {
    if (!open || !instance || !company?.evogo_host) return;

    setStatus("loading");
    setQrCodeUrl(null);

    const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
    
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;
      try {
        const res: any = await client.getQrCode(instance.evogo_api_key);
        
        const isConnected = res.connected || res.data?.connected || res.data?.Connected === true || res.Connected === true;
        // Verifica se conectou
        if (isConnected) {
          await handleConnected();
          return;
        }

        const qr = res.qrcode || res.data?.qrcode || res.data?.Qrcode;
        // Verifica o QR Code
        if (qr) {
          setStatus("qr");
          if (qr.startsWith("data:image/")) {
            setQrCodeUrl(qr);
          } else {
            // Raw string (pairing code style string), generate image via api.qrserver.com
            setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qr)}`);
          }
        }
      } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("already logged in")) {
          await handleConnected();
          return;
        }
        if (msg.includes("no QR code available") || msg.includes("QR code not generated")) {
          // Ignora silenciosamente para continuar tentando
        } else {
          // Outro erro, logar apenas no console para não floodar a tela
          console.error("Erro ao obter QR Code:", msg);
        }
      }

      if (isPolling) {
        setTimeout(poll, 3000);
      }
    };

    const handleConnected = async () => {
      isPolling = false;
      setStatus("connected");
      
      try {
        let ownerJid = null;
        try {
          const client = new EvoGoClient({ host: company.evogo_host, token: company.evogo_global_token });
          // Precisamos buscar todas as instâncias para pegar o JID
          const allRes: any = await client.getAllInstances();
          const evogoInstances = allRes?.data || [];
          const evoInst = evogoInstances.find((e: any) => e.token === instance.evogo_api_key);
          
          if (evoInst && evoInst.jid) {
            ownerJid = evoInst.jid.split('@')[0].split(':')[0];
          }
        } catch (err) {
          console.error("Erro ao buscar owner da instância:", err);
        }

        // Atualiza banco de dados
        const updateData: any = { status: "connected" };
        if (ownerJid) {
          updateData.owner_jid = ownerJid;
        }

        await supabase
          .from("whatsapp_instances")
          .update(updateData)
          .eq("id", instance.id);
          
        toast.success("WhatsApp conectado com sucesso!");
        qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
        
        if (onSuccess) onSuccess();
        setTimeout(() => onOpenChange(false), 2000);
      } catch (e) {
        console.error("Erro ao salvar status no banco", e);
      }
    };

    poll();

    return () => {
      isPolling = false;
    };
  }, [open, instance, company]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code para vincular o WhatsApp à instância <strong className="font-mono">{instance?.instance_name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 min-h-[300px]">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p>Aguardando QR Code do EvoGo...</p>
            </div>
          )}

          {status === "qr" && qrCodeUrl && (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                <img src={qrCodeUrl} alt="QR Code WhatsApp" className="w-[240px] h-[240px]" />
              </div>
              
              <div className="bg-sidebar-accent/50 text-sm text-sidebar-foreground p-4 rounded-lg w-full space-y-2">
                <p className="font-medium">Como conectar:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs opacity-80">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em <strong>Aparelhos conectados</strong></li>
                  <li>Toque em <strong>Conectar um aparelho</strong></li>
                  <li>Aponte seu celular para esta tela</li>
                </ol>
              </div>
            </div>
          )}

          {status === "connected" && (
            <div className="flex flex-col items-center gap-4 text-success">
              <CheckCircle2 className="h-16 w-16" />
              <p className="font-medium">Aparelho conectado!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
