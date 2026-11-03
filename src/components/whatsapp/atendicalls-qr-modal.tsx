import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PhoneCall,
  Loader2,
  CheckCircle2,
  RefreshCw,
  QrCode,
  AlertCircle,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAtendiCallsStatusAction,
  createAtendiCallsInstanceAction,
  disconnectAtendiCallsInstanceAction,
} from "@/lib/api/atendicalls.functions";

interface AtendiCallsQrModalProps {
  instance: any; // { id, name, company_id, atendicalls_token, atendicalls_url }
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AtendiCallsQrModal({
  instance,
  open,
  onOpenChange,
  onSuccess,
}: AtendiCallsQrModalProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState<"loading" | "qr" | "connected" | "error">("loading");
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [lineInfo, setLineInfo] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPollingRef = useRef(false);

  useEffect(() => {
    if (!open || !instance?.id) {
      isPollingRef.current = false;
      return;
    }

    isPollingRef.current = true;
    setLoading(true);
    setErrorMessage(null);

    const checkAndPoll = async () => {
      try {
        const res = await getAtendiCallsStatusAction({
          data: {
            instanceId: instance.id,
            companyId: instance.company_id,
            autoCreate: true, // Gera automaticamente a linha e o QR Code se não existir
          },
        });

        if (res.isConnected) {
          setStatus("connected");
          setLineInfo(res.instance);
          setLoading(false);
          isPollingRef.current = false;
          qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
          return;
        }

        if (res.qrcode) {
          setStatus("qr");
          setQrCodeBase64(res.qrcode);
          setLineInfo(res.instance);
          setLoading(false);
        } else {
          setStatus("loading");
        }
      } catch (err: any) {
        console.warn("[AtendiCalls] Erro no status inicial:", err);
        setErrorMessage(err.message || "Falha ao obter status do motor AtendiCalls.");
        setStatus("error");
        setLoading(false);
      }

      // Inicia o polling contínuo para detectar quando o usuário escanear
      pollConnection();
    };

    const pollConnection = async () => {
      if (!isPollingRef.current) return;

      try {
        const res = await getAtendiCallsStatusAction({
          data: {
            instanceId: instance.id,
            companyId: instance.company_id,
          },
        });

        if (res.isConnected) {
          setStatus("connected");
          setLineInfo(res.instance);
          isPollingRef.current = false;
          toast.success("Linha de Voz AtendiCalls Conectada!", {
            description: `WhatsApp conectado: ${res.instance?.pushName || res.instance?.jid || "Linha ativa"}`,
          });
          qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
          if (onSuccess) onSuccess();
          return;
        }

        if (res.qrcode && res.qrcode !== qrCodeBase64) {
          setQrCodeBase64(res.qrcode);
          setStatus("qr");
        }
      } catch (err) {
        // Ignora erros transitórios durante o polling
      }

      if (isPollingRef.current) {
        setTimeout(pollConnection, 3000);
      }
    };

    checkAndPoll();

    return () => {
      isPollingRef.current = false;
    };
  }, [open, instance?.id]);

  const handleRegenerateQr = async () => {
    if (!instance?.id) return;
    setGenerating(true);
    setErrorMessage(null);
    try {
      const res = await createAtendiCallsInstanceAction({
        data: {
          instanceId: instance.id,
          name: instance.name || "Linha Atendi",
        },
      });

      if (res.qrcode) {
        setQrCodeBase64(res.qrcode);
        setStatus("qr");
        toast.info("Novo QR Code gerado. Aponte a câmera do WhatsApp.");
      } else {
        toast.success("Linha criada na VPS!");
      }
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
    } catch (err: any) {
      toast.error("Erro ao gerar QR Code", { description: err.message });
      setErrorMessage(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!instance?.id) return;
    setDisconnecting(true);
    try {
      await disconnectAtendiCallsInstanceAction({
        data: { instanceId: instance.id },
      });
      setStatus("loading");
      setLineInfo(null);
      setQrCodeBase64(null);
      toast.success("Linha de voz desvinculada.");
      qc.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      // Gera imediatamente um novo QR Code para pareamento
      handleRegenerateQr();
    } catch (err: any) {
      toast.error("Erro ao desconectar linha de voz", { description: err.message });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
            <PhoneCall className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold">
            Conectar Linha de Voz (AtendiCalls IA)
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            Canal: <strong className="text-foreground">{instance?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Status Badge */}
        <div className="flex justify-center my-1">
          {status === "connected" ? (
            <Badge className="bg-emerald-600 text-white gap-1 px-3 py-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conexão de Voz Ativa
            </Badge>
          ) : status === "qr" ? (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 gap-1 px-3 py-1 text-xs">
              <QrCode className="h-3.5 w-3.5 animate-pulse" /> Aguardando Leitura do QR Code
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 px-3 py-1 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando Linha na VPS...
            </Badge>
          )}
        </div>

        {/* Conteúdo: Loading */}
        {loading && status === "loading" && (
          <div className="flex flex-col items-center justify-center p-8 space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              Conectando ao motor AtendiCalls...
            </p>
            <p className="text-xs text-muted-foreground">
              Preparando túnel VoIP e linha para chamadas com IA.
            </p>
          </div>
        )}

        {/* Conteúdo: QR Code */}
        {status === "qr" && qrCodeBase64 && (
          <div className="space-y-4 py-2">
            <div className="relative mx-auto flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner border max-w-[280px]">
              <img
                src={qrCodeBase64}
                alt="QR Code AtendiCalls"
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="bg-muted/40 border rounded-xl p-3 text-left space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Como conectar:</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Abra o WhatsApp no celular da empresa.</li>
                <li>Toque nos <strong>três pontinhos</strong> ou <strong>Configurações</strong>.</li>
                <li>Selecione <strong>Aparelhos Conectados &gt; Conectar aparelho</strong>.</li>
                <li>Aponte a câmera para o QR Code acima.</li>
              </ol>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                Aguardando leitura no WhatsApp...
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRegenerateQr}
                disabled={generating}
                className="h-7 text-xs gap-1"
              >
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Recarregar QR
              </Button>
            </div>
          </div>
        )}

        {/* Conteúdo: Conectado */}
        {status === "connected" && (
          <div className="space-y-4 py-3">
            <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
              <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="h-5 w-5" />
                Linha pronta para chamadas com IA
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Esta instância agora realiza ligações de voz no WhatsApp através do motor AtendiCalls com IA conversacional e gravação estéreo.
              </p>

              {lineInfo && (
                <div className="bg-background/80 rounded-xl p-3 border space-y-1.5 text-xs text-left">
                  {lineInfo.pushName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome da Conta:</span>
                      <span className="font-medium text-foreground">{lineInfo.pushName}</span>
                    </div>
                  )}
                  {lineInfo.jid && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Número / JID:</span>
                      <span className="font-mono text-foreground text-[11px]">{lineInfo.jid}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Motor VPS:</span>
                    <span className="font-mono text-muted-foreground text-[11px]">calls.esteticaelaser.com.br</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/20 gap-1.5"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Desconectar Linha de Voz
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
              >
                Concluir
              </Button>
            </div>
          </div>
        )}

        {/* Conteúdo: Erro */}
        {status === "error" && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Não foi possível gerar a linha no AtendiCalls
            </p>
            {errorMessage && (
              <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg">
                {errorMessage}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleRegenerateQr}
              disabled={generating}
              className="gap-1.5"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tentar Novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
