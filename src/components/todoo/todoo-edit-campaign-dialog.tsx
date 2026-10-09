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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Target, DollarSign, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TodooCampaign, TodooCampaignStatus } from "@/types/todoo";
import { toast } from "sonner";

interface Props {
  campaign: TodooCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TodooEditCampaignDialog({
  campaign,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [offerDetails, setOfferDetails] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [slaHours, setSlaHours] = useState<number>(24);
  const [status, setStatus] = useState<TodooCampaignStatus>("active");
  const [targetCount, setTargetCount] = useState<number>(0);
  const [targetRevenue, setTargetRevenue] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (campaign && open) {
      setTitle(campaign.title || "");
      setDescription(campaign.description || "");
      setOfferDetails(campaign.offer_details || "");
      setMessageTemplate(campaign.message_template || "");
      setSlaHours(campaign.sla_hours || 24);
      setStatus(campaign.status || "active");
      setTargetCount(campaign.target_count || 0);
      setTargetRevenue(campaign.target_revenue || 0);
    }
  }, [campaign, open]);

  if (!campaign) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("O título da ação comercial é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase.from("todoo_campaigns") as any)
        .update({
          title: title.trim(),
          description: description.trim() || null,
          offer_details: offerDetails.trim() || null,
          message_template: messageTemplate.trim() || null,
          sla_hours: Number(slaHours) || 24,
          status,
          target_count: Number(targetCount) || 0,
          target_revenue: Number(targetRevenue) || 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      if (error) throw error;

      toast.success("Ação comercial atualizada com sucesso!");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao atualizar campanha:", err);
      toast.error("Erro ao salvar alterações: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Editar Ação Comercial</DialogTitle>
          <DialogDescription className="text-xs">
            Atualize o título, a proposta de valor, o script e as metas desta ação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Título e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-medium">Nome da Ação Comercial</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Reativação Clientes 90 Dias"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TodooCampaignStatus)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Ativa</SelectItem>
                  <SelectItem value="paused" className="text-xs">Pausada</SelectItem>
                  <SelectItem value="completed" className="text-xs">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Descrição / Objetivo da Ação</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique resumidamente qual o objetivo desta campanha..."
              className="h-8 text-xs"
            />
          </div>

          {/* Oferta / Condição Comercial */}
          <div className="space-y-1">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Oferta / Condição Comercial
            </Label>
            <Input
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              placeholder="Ex: Voucher de R$ 150 para retorno ou combo com 30% off"
              className="h-8 text-xs"
            />
          </div>

          {/* Script de Abordagem */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Script de Abordagem Sugerido</Label>
              <span className="text-[10px] text-muted-foreground">
                Variáveis: {"{nome}"}, {"{primeiro_nome}"}, {"{saldo}"}, {"{zona}"}
              </span>
            </div>
            <Textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
              placeholder="Digite o modelo de mensagem que as consultoras usarão..."
              className="text-xs leading-relaxed"
            />
          </div>

          {/* SLA e Metas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-border">
            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                SLA de Contato (Horas)
              </Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={slaHours}
                onChange={(e) => setSlaHours(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Target className="h-3.5 w-3.5 text-emerald-500" />
                Meta de Fechamentos
              </Label>
              <Input
                type="number"
                min={0}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                Meta de Faturamento (R$)
              </Label>
              <Input
                type="number"
                min={0}
                value={targetRevenue}
                onChange={(e) => setTargetRevenue(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
