import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Calendar,
  FileText,
  Clock,
  XCircle,
  DollarSign,
  Loader2,
} from "lucide-react";
import { TodooLead, TodooOutcomeType } from "@/types/todoo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface Props {
  lead: TodooLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialType?: TodooOutcomeType;
}

export function TodooOutcomeDialog({ lead, open, onOpenChange, onSuccess, initialType = "won" }: Props) {
  const { profile } = useAuth();
  const [outcomeType, setOutcomeType] = useState<TodooOutcomeType>(initialType);
  const [outcomeValue, setOutcomeValue] = useState<string>("");
  const [outcomeNotes, setOutcomeNotes] = useState<string>("");
  const [callbackDate, setCallbackDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcomeType(initialType || "won");
      setOutcomeValue("");
      setOutcomeNotes("");
      setCallbackDate("");
    }
  }, [open, initialType]);

  if (!lead) return null;

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const numericValue = outcomeValue ? parseFloat(outcomeValue.replace(",", ".")) : 0;
      const statusMap: Record<TodooOutcomeType, string> = {
        won: "won",
        scheduled: "scheduled",
        quoted: "quoted",
        callback: "callback",
        lost: "lost",
      };

      const now = new Date().toISOString();

      // Atualiza o lead
      const { error: leadErr } = await (supabase.from("todoo_leads") as any)
        .update({
          status: statusMap[outcomeType],
          outcome_type: outcomeType,
          outcome_notes: outcomeNotes || null,
          outcome_value: numericValue || 0,
          callback_scheduled_at: outcomeType === "callback" && callbackDate ? new Date(callbackDate).toISOString() : null,
          completed_at: outcomeType === "won" || outcomeType === "lost" ? now : null,
          last_interaction_at: now,
          updated_at: now,
        })
        .eq("id", lead.id);

      if (leadErr) throw leadErr;

      // Registra evento de auditoria
      await (supabase.from("todoo_events") as any).insert({
        lead_id: lead.id,
        campaign_id: lead.campaign_id,
        company_id: lead.company_id,
        user_id: profile.id,
        event_type: "outcome_registered",
        notes: `Desfecho registrado: ${outcomeType.toUpperCase()}${outcomeNotes ? ` - ${outcomeNotes}` : ""}`,
        metadata: {
          outcome_type: outcomeType,
          outcome_value: numericValue,
          callback_date: callbackDate || null,
        },
      });

      // Se pediu para retornar (callback), cria automaticamente uma tarefa no Atendi
      if (outcomeType === "callback" && callbackDate) {
        await supabase.from("tasks").insert({
          company_id: lead.company_id,
          unit_id: lead.unit_id,
          contact_id: lead.contact_id || undefined,
          assigned_to: profile.id,
          created_by: profile.id,
          title: `[Todoo] Retornar para ${lead.contact_name}`,
          description: `Retorno de campanha Todoo.\nTelefone: ${lead.contact_phone}\nObs: ${outcomeNotes || "Sem notas adicionais"}`,
          due_date: new Date(callbackDate).toISOString(),
          status: "pending",
        });
      }

      toast.success("Desfecho registrado com sucesso!");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao salvar desfecho:", err);
      toast.error(err.message || "Erro ao salvar desfecho do lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Desfecho Comercial</DialogTitle>
          <DialogDescription>
            Cliente: <span className="font-semibold text-foreground">{lead.contact_name}</span> ({lead.contact_phone})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seletor de Tipo de Desfecho */}
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Qual foi o resultado do contato?
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              <Button
                type="button"
                variant={outcomeType === "won" ? "default" : "outline"}
                className={`justify-start gap-2 h-auto py-2.5 px-3 ${
                  outcomeType === "won" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                }`}
                onClick={() => setOutcomeType("won")}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-left leading-tight">
                  <strong className="block text-xs">Fechou!</strong>
                  <span className="text-[10px] opacity-80">Contrato ganho</span>
                </span>
              </Button>

              <Button
                type="button"
                variant={outcomeType === "scheduled" ? "default" : "outline"}
                className={`justify-start gap-2 h-auto py-2.5 px-3 ${
                  outcomeType === "scheduled" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""
                }`}
                onClick={() => setOutcomeType("scheduled")}
              >
                <Calendar className="h-4 w-4 text-blue-300" />
                <span className="text-left leading-tight">
                  <strong className="block text-xs">Agendou</strong>
                  <span className="text-[10px] opacity-80">Visita / Sessão</span>
                </span>
              </Button>

              <Button
                type="button"
                variant={outcomeType === "quoted" ? "default" : "outline"}
                className={`justify-start gap-2 h-auto py-2.5 px-3 ${
                  outcomeType === "quoted" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                }`}
                onClick={() => setOutcomeType("quoted")}
              >
                <FileText className="h-4 w-4 text-amber-300" />
                <span className="text-left leading-tight">
                  <strong className="block text-xs">Orçamento</strong>
                  <span className="text-[10px] opacity-80">Em análise</span>
                </span>
              </Button>

              <Button
                type="button"
                variant={outcomeType === "callback" ? "default" : "outline"}
                className={`justify-start gap-2 h-auto py-2.5 px-3 ${
                  outcomeType === "callback" ? "bg-purple-600 hover:bg-purple-700 text-white" : ""
                }`}
                onClick={() => setOutcomeType("callback")}
              >
                <Clock className="h-4 w-4 text-purple-300" />
                <span className="text-left leading-tight">
                  <strong className="block text-xs">Retornar</strong>
                  <span className="text-[10px] opacity-80">Ligar depois</span>
                </span>
              </Button>

              <Button
                type="button"
                variant={outcomeType === "lost" ? "default" : "outline"}
                className={`justify-start gap-2 h-auto py-2.5 px-3 col-span-2 sm:col-span-1 ${
                  outcomeType === "lost" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""
                }`}
                onClick={() => setOutcomeType("lost")}
              >
                <XCircle className="h-4 w-4 text-rose-300" />
                <span className="text-left leading-tight">
                  <strong className="block text-xs">Sem Interesse</strong>
                  <span className="text-[10px] opacity-80">Recusou</span>
                </span>
              </Button>
            </div>
          </div>

          {/* Campo de Valor se Fechou ou Orçamento */}
          {(outcomeType === "won" || outcomeType === "quoted") && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <Label htmlFor="outcomeValue" className="text-xs">
                {outcomeType === "won" ? "Valor Fechado (R$)" : "Valor do Orçamento (R$)"}
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="outcomeValue"
                  placeholder="0,00"
                  value={outcomeValue}
                  onChange={(e) => setOutcomeValue(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          )}

          {/* Campo de Data de Retorno se Callback */}
          {outcomeType === "callback" && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <Label htmlFor="callbackDate" className="text-xs">
                Data e Horário para Retornar Contato:
              </Label>
              <Input
                id="callbackDate"
                type="datetime-local"
                value={callbackDate}
                onChange={(e) => setCallbackDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Uma tarefa comercial será criada automaticamente para você nesta data.
              </p>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs">
              Observações / Detalhes da Negociação:
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder={
                outcomeType === "won"
                  ? "Ex: Fechou manutenção anual de 6 sessões de virilha completa em 10x sem juros."
                  : outcomeType === "lost"
                  ? "Ex: Disse que o orçamento está acima do momento e prefere esperar o mês que vem."
                  : "Descreva detalhes importantes da conversa..."
              }
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Confirmar Desfecho"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
