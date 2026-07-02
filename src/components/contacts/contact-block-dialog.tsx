import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { blockContactAction, unblockContactAction } from "@/lib/api/chat.functions";

export function ContactBlockDialog({ contact }: { contact: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (contact.is_blocked) {
        await unblockContactAction({ data: { contactId: contact.id } });
        toast.success("Contato desbloqueado!");
      } else {
        const finalReason = reason === "Outro" ? customReason : reason;
        if (!finalReason) {
          toast.error("Por favor, informe o motivo do bloqueio.");
          setLoading(false);
          return;
        }
        await blockContactAction({ data: { contactId: contact.id, reason: finalReason } });
        toast.success("Contato bloqueado!");
      }
      qc.invalidateQueries({ queryKey: ["contact-details", contact.id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-journey"] });
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro ao alterar status", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" title={contact.is_blocked ? "Desbloquear" : "Bloquear"}>
          <Ban className={`h-4 w-4 ${contact.is_blocked ? "text-destructive" : "text-muted-foreground"}`} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{contact.is_blocked ? "Desbloquear Contato" : "Bloquear Contato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {!contact.is_blocked && (
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao bloquear este contato, ele não aparecerá mais nas listas de conversas ativas.
              </p>
              <div className="space-y-2">
                <Label>Motivo do bloqueio</Label>
                <Select value={reason} onValueChange={setReason} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spam">Spam / Propaganda</SelectItem>
                    <SelectItem value="Cenas obscenas">Cenas obscenas / Assédio</SelectItem>
                    <SelectItem value="Ofensivo">Linguagem ofensiva</SelectItem>
                    <SelectItem value="Fraude">Fraude / Golpe</SelectItem>
                    <SelectItem value="Outro">Outro motivo...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {reason === "Outro" && (
                <div className="space-y-2 pt-2">
                  <Label>Descreva o motivo</Label>
                  <Input 
                    placeholder="Especifique o motivo..." 
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          )}
          {contact.is_blocked && (
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Este contato está bloqueado pelo seguinte motivo: <strong>{contact.block_reason}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Deseja desbloqueá-lo para que volte a receber e exibir mensagens nas listas?
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant={contact.is_blocked ? "default" : "destructive"} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contact.is_blocked ? "Desbloquear" : "Bloquear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
