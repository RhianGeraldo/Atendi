import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Phone, MessageSquare, Video, CalendarClock, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUnit } from "@/lib/unit-context";
import { useAuth } from "@/lib/auth-context";

export function TaskDialog({ 
  children, 
  contactId,
  opportunityId,
  defaultUnitId,
  taskToEdit,
  open: controlledOpen,
  onOpenChange: setControlledOpen
}: { 
  children?: React.ReactNode, 
  contactId?: string,
  opportunityId?: string,
  defaultUnitId?: string,
  taskToEdit?: any,
  open?: boolean,
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("other");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      if (taskToEdit) {
        setTitle(taskToEdit.title || "");
        setTaskType(taskToEdit.task_type || "other");
        setDueDate(taskToEdit.due_date ? new Date(taskToEdit.due_date).toISOString().slice(0, 16) : "");
        setDescription(taskToEdit.description || "");
      } else {
        setTitle("");
        setTaskType("other");
        setDueDate("");
        setDescription("");
      }
    }
  }, [open, taskToEdit]);

  const addTask = useMutation({
    mutationFn: async () => {
      if (!title.trim()) return;
      let unitId = selectedUnitId || defaultUnitId;
      
      if (!taskToEdit && !unitId) {
        if (contactId) {
          const { data: convData } = await supabase
            .from("conversations")
            .select("unit_id")
            .eq("contact_id", contactId)
            .not("unit_id", "is", null)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
            
          if (convData?.unit_id) {
            unitId = convData.unit_id;
          }
        }
        
        if (!unitId) {
          const { data: fallbackUnit } = await supabase.from("units").select("id").limit(1).maybeSingle();
          if (fallbackUnit?.id) unitId = fallbackUnit.id;
        }
      }

      if (!taskToEdit && !unitId) throw new Error("Não foi possível determinar a unidade para esta tarefa.");
      
      const payload: any = {
        title,
        task_type: taskType,
        status: taskToEdit?.status || "pending",
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        description: description || null
      };

      if (!taskToEdit) {
        payload.unit_id = unitId;
        payload.assigned_to = profile?.id;
        if (contactId) payload.contact_id = contactId;
        if (opportunityId) payload.opportunity_id = opportunityId;
        
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").update(payload).eq("id", taskToEdit.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false);
      toast.success(taskToEdit ? "Tarefa atualizada!" : "Tarefa criada!");
      if (contactId) qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      if (opportunityId) qc.invalidateQueries({ queryKey: ["opp-tasks", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["contact-opportunities"] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{taskToEdit ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Título da Tarefa</Label>
            <Input placeholder="Ex: Ligar para confirmar proposta" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call"><div className="flex items-center gap-2"><Phone className="h-4 w-4" /><span>Ligar</span></div></SelectItem>
                  <SelectItem value="message"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /><span>Mensagem</span></div></SelectItem>
                  <SelectItem value="meeting"><div className="flex items-center gap-2"><Video className="h-4 w-4" /><span>Reunião</span></div></SelectItem>
                  <SelectItem value="follow_up"><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /><span>Follow-up</span></div></SelectItem>
                  <SelectItem value="other"><div className="flex items-center gap-2"><MoreHorizontal className="h-4 w-4" /><span>Outro</span></div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data e Hora</Label>
              <Input 
                type="datetime-local" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)}
                onClick={(e) => {
                  try {
                    if (typeof e.currentTarget.showPicker === 'function') {
                      e.currentTarget.showPicker();
                    }
                  } catch (err) {
                    // Ignore if not supported or already open
                  }
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea 
              placeholder="Detalhes adicionais..." 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="resize-none"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => addTask.mutate()} disabled={!title.trim() || addTask.isPending}>
            Salvar Tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
