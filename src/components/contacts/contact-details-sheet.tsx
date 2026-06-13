import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { History, MessageCircle, Phone, Mail, Clock, CalendarDays, Loader2, Smartphone, Target, CheckSquare, DollarSign, Save, User, Plus, Trash2, Edit2, MessageSquare, Video, MoreHorizontal, Circle, CalendarClock, CheckCircle2, Users, Megaphone, ExternalLink, Image as ImageIcon, Map } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { TaskDialog } from "@/components/crm/task-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ContactDetailsSheetProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ContactTasks({ contactId }: { contactId: string }) {
  const qc = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["contact-tasks", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const toggleTask = useMutation({
    mutationFn: async (task: any) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] }); // Might be linked to an opp
    }
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-tasks", contactId] });
      qc.invalidateQueries({ queryKey: ["opp-tasks"] });
      toast.success("Tarefa removida!");
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Tarefas</h3>
        </div>
        <TaskDialog contactId={contactId}>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
          </Button>
        </TaskDialog>
      </div>

      <div className="space-y-2 mt-4">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
            Nenhuma tarefa pendente.
          </div>
        ) : (
          tasks.map((task: any) => (
            <div key={task.id} className="flex flex-col gap-1 p-3 border rounded-lg group bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <button onClick={() => toggleTask.mutate(task)} className="text-muted-foreground hover:text-primary transition-colors">
                    {task.status === 'done' ? <CheckSquare className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
                  </button>
                  {task.task_type === "call" && <Phone className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                  {task.task_type === "message" && <MessageSquare className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                  {task.task_type === "meeting" && <Video className="h-4 w-4 text-purple-500 flex-shrink-0" />}
                  {task.task_type === "follow_up" && <CalendarClock className="h-4 w-4 text-orange-500 flex-shrink-0" />}
                  {(task.task_type === "other" || !task.task_type) && <CheckSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                  
                  <div className="flex flex-col overflow-hidden">
                    <span className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {format(new Date(task.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" onClick={() => deleteTask.mutate(task.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {task.opportunity_id && (
                <div className="flex pl-11">
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Vinculado a Oportunidade</Badge>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ContactAdsHistory({ contactId }: { contactId: string }) {
  const { data: ads, isLoading } = useQuery({
    queryKey: ["contact-ads-history", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`
          id,
          created_at,
          metadata,
          conversations!inner (
            contact_id
          )
        `)
        .eq("conversations.contact_id", contactId)
        .not("metadata", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const validAds = data.filter((msg: any) => {
        const meta = msg.metadata;
        if (!meta) return false;
        
        const adReply = meta.externalAdReply || 
                        meta.contextInfo?.externalAdReply || 
                        meta.extendedTextMessage?.contextInfo?.externalAdReply ||
                        meta.Message?.extendedTextMessage?.contextInfo?.externalAdReply;
        return !!adReply;
      }).map((msg: any) => {
        const meta = msg.metadata;
        const adReply = meta.externalAdReply || 
                        meta.contextInfo?.externalAdReply || 
                        meta.extendedTextMessage?.contextInfo?.externalAdReply ||
                        meta.Message?.extendedTextMessage?.contextInfo?.externalAdReply;
        
        const conversionSource = meta.conversionSource || 
                                 meta.contextInfo?.conversionSource || 
                                 meta.extendedTextMessage?.contextInfo?.conversionSource ||
                                 meta.Message?.extendedTextMessage?.contextInfo?.conversionSource;

        return {
          id: msg.id,
          createdAt: msg.created_at,
          adData: adReply,
          conversionSource,
          sourceApp: adReply.sourceApp
        };
      });

      return validAds;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ads || ads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed mt-4">
        Nenhum histórico de anúncios encontrado para este contato.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Megaphone className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Jornada de Anúncios</h3>
      </div>
      
      <div className="flex flex-col">
        {ads.map((ad: any, index: number) => (
          <React.Fragment key={ad.id}>
            <div className="flex-1 min-w-0 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary shrink-0">
                  <Megaphone className="h-3.5 w-3.5" />
                </div>
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                <span className="text-xs font-medium text-muted-foreground">
                  {format(new Date(ad.createdAt), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {index === 0 && (
                  <Badge className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 shadow-none border-none">
                    Mais Recente
                  </Badge>
                )}
              </div>

              <div className="flex gap-4">
                {ad.adData.thumbnailURL || ad.adData.originalImageURL ? (
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md overflow-hidden bg-muted flex items-center justify-center border shrink-0">
                    <img 
                      src={ad.adData.thumbnailURL || ad.adData.originalImageURL} 
                      alt="Ad thumbnail" 
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement?.classList.add('p-2');
                      }}
                    />
                    <ImageIcon className="h-5 w-5 text-muted-foreground absolute -z-10" />
                  </div>
                ) : (
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md bg-muted flex items-center justify-center border text-muted-foreground shrink-0">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h4 className="font-semibold text-sm sm:text-base line-clamp-2 leading-tight" title={ad.adData.title}>
                    {ad.adData.title || "Anúncio sem título"}
                  </h4>
                  {ad.adData.body && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1" title={ad.adData.body}>
                      {ad.adData.body}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {ad.conversionSource && (
                      <Badge variant="secondary" className="text-[10px]">
                        {ad.conversionSource}
                      </Badge>
                    )}
                    {ad.sourceApp && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {ad.sourceApp}
                      </Badge>
                    )}
                    {ad.adData.sourceURL && (
                      <a 
                        href={ad.adData.sourceURL} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline ml-auto"
                      >
                        Ver anúncio <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {index < ads.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ContactJourney({ contactId }: { contactId: string }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["contact-journey", contactId],
    queryFn: async () => {
      const [
        { data: messages },
        { data: sessions },
        { data: opportunities },
        { data: tasks },
        { data: contactNotes },
        { data: oppNotes }
      ] = await Promise.all([
        supabase
          .from("messages")
          .select(`id, created_at, metadata, conversations!inner(contact_id)`)
          .eq("conversations.contact_id", contactId)
          .not("metadata", "is", null),
          
        supabase
          .from("conversation_sessions" as any)
          .select(`id, started_at, resolved_at, resolution_observation, whatsapp_instances(name), resolution_reasons(label), assigned_agent:profiles!conversation_sessions_assigned_agent_id_fkey(name)`)
          .eq("contact_id", contactId),

        supabase
          .from("opportunities")
          .select(`id, title, value, created_at, pipeline_stages(name, color, pipelines(name))`)
          .eq("contact_id", contactId),

        supabase
          .from("tasks")
          .select(`id, title, due_date, status, task_type, created_at`)
          .eq("contact_id", contactId),

        supabase
          .from("contact_notes" as any)
          .select(`id, content, created_at, profiles(name, email)`)
          .eq("contact_id", contactId),

        supabase
          .from("opportunity_notes" as any)
          .select(`id, content, created_at, profiles(name, email), opportunities!inner(id, title, contact_id)`)
          .eq("opportunities.contact_id", contactId)
      ]);

      const journeyEvents: any[] = [];

      if (messages) {
        messages.forEach(msg => {
          const meta = msg.metadata;
          const adReply = meta?.externalAdReply || meta?.contextInfo?.externalAdReply || meta?.extendedTextMessage?.contextInfo?.externalAdReply || meta?.Message?.extendedTextMessage?.contextInfo?.externalAdReply;
          if (adReply) {
            const conversionSource = meta.conversionSource || meta.contextInfo?.conversionSource || meta.extendedTextMessage?.contextInfo?.conversionSource || meta.Message?.extendedTextMessage?.contextInfo?.conversionSource;
            journeyEvents.push({
              id: `ad-${msg.id}`,
              date: new Date(msg.created_at),
              type: 'ad',
              data: { adReply, conversionSource, sourceApp: adReply.sourceApp }
            });
          }
        });
      }

      if (sessions) {
        sessions.forEach((sess: any) => {
          journeyEvents.push({
            id: `sess-${sess.id}`,
            date: new Date(sess.started_at),
            type: 'conversation',
            data: sess
          });
        });
      }

      if (opportunities) {
        opportunities.forEach((opp: any) => {
          journeyEvents.push({
            id: `opp-${opp.id}`,
            date: new Date(opp.created_at),
            type: 'opportunity',
            data: opp
          });
        });
      }

      if (tasks) {
        tasks.forEach((task: any) => {
          journeyEvents.push({
            id: `task-${task.id}`,
            date: new Date(task.created_at),
            type: 'task',
            data: task
          });
        });
      }

      if (contactNotes) {
        contactNotes.forEach((note: any) => {
          journeyEvents.push({
            id: `cnote-${note.id}`,
            date: new Date(note.created_at),
            type: 'note',
            data: { ...note, isOppNote: false }
          });
        });
      }

      if (oppNotes) {
        oppNotes.forEach((note: any) => {
          journeyEvents.push({
            id: `onote-${note.id}`,
            date: new Date(note.created_at),
            type: 'note',
            data: { ...note, isOppNote: true }
          });
        });
      }

      return journeyEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
  });

  const getDuration = (start: string, end?: string | null) => {
    if (!end) return "Em andamento";
    const mins = differenceInMinutes(new Date(end), new Date(start));
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed mt-4">
        Nenhum evento registrado na jornada deste contato.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Map className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Jornada do Lead</h3>
      </div>
      
      <div className="flex flex-col">
        {events.map((event: any, index: number) => {
          // AD EVENT
          if (event.type === 'ad') {
            const adData = event.data.adReply;
            return (
              <React.Fragment key={event.id}>
                <div className="flex-1 min-w-0 p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary shrink-0">
                      <Megaphone className="h-3.5 w-3.5" />
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(event.date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    {adData.thumbnailURL || adData.originalImageURL ? (
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md overflow-hidden bg-muted flex items-center justify-center border shrink-0">
                        <img 
                          src={adData.thumbnailURL || adData.originalImageURL} 
                          alt="Ad thumbnail" 
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('p-2');
                          }}
                        />
                        <ImageIcon className="h-5 w-5 text-muted-foreground absolute -z-10" />
                      </div>
                    ) : (
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-md bg-muted flex items-center justify-center border text-muted-foreground shrink-0">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-xs font-semibold text-primary mb-1">Interação via Anúncio</span>
                      <h4 className="font-semibold text-sm sm:text-base line-clamp-2 leading-tight" title={adData.title}>
                        {adData.title || "Anúncio sem título"}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {event.data.conversionSource && (
                          <Badge variant="secondary" className="text-[10px]">
                            {event.data.conversionSource}
                          </Badge>
                        )}
                        {event.data.sourceApp && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {event.data.sourceApp}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {index < events.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
              </React.Fragment>
            );
          }

          // CONVERSATION EVENT
          if (event.type === 'conversation') {
            const sess = event.data;
            return (
              <React.Fragment key={event.id}>
                <div className="flex-1 min-w-0 p-3 rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/10 text-blue-500 shrink-0">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-blue-600">Atendimento</span>
                    <span className="text-xs font-mono text-muted-foreground uppercase truncate">#{sess.id.substring(0, 8)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{format(event.date, "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5 text-[10px] bg-muted px-2 py-0.5 rounded-full font-medium">
                        <Smartphone className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="truncate max-w-[80px]">{sess.whatsapp_instances?.name || "WhatsApp"}</span>
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                        {getDuration(sess.started_at, sess.resolved_at)}
                      </div>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-start gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold block mb-0.5 text-foreground/80">Atendido por</span>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        {sess.assigned_agent?.name || "Bot / Não atribuído"}
                      </span>
                    </div>
                  </div>
                </div>
                {index < events.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
              </React.Fragment>
            );
          }

          // OPPORTUNITY EVENT
          if (event.type === 'opportunity') {
            const opp = event.data;
            return (
              <React.Fragment key={event.id}>
                <div className="flex-1 min-w-0 p-3 rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-500/10 text-green-600 shrink-0">
                      <Target className="h-3.5 w-3.5" />
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(event.date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-green-600 mb-1 block">Oportunidade Criada</span>
                      <div className="font-medium">{opp.title}</div>
                      {opp.pipeline_stages?.pipelines?.name && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Funil: {opp.pipeline_stages.pipelines.name}
                        </div>
                      )}
                    </div>
                    {opp.pipeline_stages && (
                      <Badge style={{ backgroundColor: opp.pipeline_stages.color, color: '#fff' }} variant="outline">
                        {opp.pipeline_stages.name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-green-600 font-medium text-sm mt-3">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(opp.value || 0)}
                    </span>
                  </div>
                </div>
                {index < events.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
              </React.Fragment>
            );
          }

          // TASK EVENT
          if (event.type === 'task') {
            const task = event.data;
            const isDone = task.status === 'done';
            return (
              <React.Fragment key={event.id}>
                <div className="flex-1 min-w-0 p-3 rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${isDone ? 'bg-emerald-500/10 text-emerald-600' : 'bg-orange-500/10 text-orange-600'}`}>
                      {isDone ? <CheckSquare className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(event.date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div>
                    <span className={`text-xs font-semibold mb-1 block ${isDone ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {isDone ? 'Tarefa Concluída' : 'Tarefa Criada'}
                    </span>
                    <span className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                        <CalendarDays className="h-3 w-3" />
                        Vencimento: {format(new Date(task.due_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    )}
                  </div>
                </div>
                {index < events.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
              </React.Fragment>
            );
          }

          // NOTE EVENT
          if (event.type === 'note') {
            const note = event.data;
            return (
              <React.Fragment key={event.id}>
                <div className="flex-1 min-w-0 p-3 rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 text-amber-600 shrink-0">
                      <Edit2 className="h-3.5 w-3.5" />
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(event.date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-amber-600 mb-1 block">Anotação Adicionada</span>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground mt-2">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span>{note.profiles?.name || note.profiles?.email || "Usuário"}</span>
                      </div>
                      {note.isOppNote && note.opportunities && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1.5 text-primary">
                            <Target className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{note.opportunities.title}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {index < events.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
              </React.Fragment>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export function ContactDetailsTabs({ contactId }: { contactId: string }) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: contact, isLoading: isLoadingContact } = useQuery({
    queryKey: ["contact-details", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ["contact-conversations", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_sessions" as any)
        .select(`
          id,
          conversation_id,
          started_at,
          resolved_at,
          resolution_observation,
          whatsapp_instance_id,
          whatsapp_instances (
            name,
            instance_name
          ),
          resolution_reason:resolution_reasons (
            label
          ),
          assigned_agent:profiles!conversation_sessions_assigned_agent_id_fkey (
            name
          ),
          session_events (
            id,
            event_type,
            metadata,
            created_at,
            actor:profiles!session_events_actor_id_fkey (
              name
            )
          )
        `)
        .eq("contact_id", contactId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getDuration = (start: string, end?: string | null) => {
    if (!end) return "Em andamento";
    const mins = differenceInMinutes(new Date(end), new Date(start));
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const { data: opportunities, isLoading: isLoadingOpportunities } = useQuery({
    queryKey: ["contact-opportunities", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(`
          id,
          title,
          value,
          expected_close_date,
          created_at,
          pipeline_stages (
            name,
            color,
            pipelines (
              name
            )
          )
        `)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "waiting":
        return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
      case "active":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
      case "resolved":
        return "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case "waiting": return "Aguardando";
      case "active": return "Em Atendimento";
      case "resolved": return "Resolvido";
      default: return status;
    }
  };

  if (isLoadingContact) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
        Contato não encontrado.
      </div>
    );
  }

  return (
    <Tabs defaultValue="jornada" className="flex-1 flex flex-col h-full min-h-0 w-full">
      <div className="px-4 pt-4 border-b w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/50 mb-3 gap-1">
          <TabsTrigger value="jornada" className="px-1 py-1.5 text-[10px] sm:text-[11px] font-bold truncate">Jornada</TabsTrigger>
          <TabsTrigger value="observacoes" className="px-1 py-1.5 text-[10px] sm:text-[11px] truncate">Notas</TabsTrigger>
          <TabsTrigger value="conversations" className="px-1 py-1.5 text-[10px] sm:text-[11px] truncate">Histórico</TabsTrigger>
          <TabsTrigger value="opportunities" className="px-1 py-1.5 text-[10px] sm:text-[11px] truncate">CRM</TabsTrigger>
          <TabsTrigger value="tasks" className="px-1 py-1.5 text-[10px] sm:text-[11px] truncate">Tarefas</TabsTrigger>
          <TabsTrigger value="ads" className="px-1 py-1.5 text-[10px] sm:text-[11px] truncate">Anúncios</TabsTrigger>
        </TabsList>
      </div>

      <ScrollArea className="flex-1 p-4">

        <TabsContent value="jornada" className="mt-0">
          <ContactJourney contactId={contactId} />
        </TabsContent>

        <TabsContent value="observacoes" className="mt-0">
          <div className="flex items-center gap-2 mb-6">
            <History className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Observações</h3>
          </div>
          <ContactNotes contactId={contactId} />
        </TabsContent>

        <TabsContent value="conversations" className="mt-0">
          <div className="flex items-center gap-2 mb-6">
            <History className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Histórico de Atendimentos</h3>
          </div>

          {isLoadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              Nenhum atendimento encerrado registrado.
            </div>
          ) : (
            <div className="flex flex-col">
              {sessions.map((session: any, index: number) => (
                <React.Fragment key={session.id}>
                  <div className="flex-1 min-w-0 p-3 rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div className="min-w-[130px] flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground shrink-0">
                            <MessageCircle className="h-3 w-3" />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground uppercase truncate">#{session.id.substring(0, 8)}</span>
                          <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", session.resolved_at ? getStatusColor("resolved") : getStatusColor("active"))}>
                            {session.resolved_at ? "Resolvido" : "Em Andamento"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{format(new Date(session.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-1.5 shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
                        <div className="flex items-center gap-1.5 text-[10px] bg-muted px-2 py-0.5 rounded-full font-medium">
                          <Smartphone className="h-3 w-3 text-green-500 shrink-0" />
                          <span className="truncate max-w-[100px]">{session.whatsapp_instances?.name || "WhatsApp"}</span>
                        </div>
                        <div className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                          {getDuration(session.started_at, session.resolved_at)}
                        </div>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    <div className="space-y-2.5">
                      {/* Agent info */}
                      <div className="flex items-start gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-semibold block mb-0.5 text-foreground/80">Atendente</span>
                          <span className="text-[11px] text-muted-foreground truncate block">
                            {session.assigned_agent?.name || "Não atribuído"}
                          </span>
                        </div>
                      </div>

                      {/* Resolution details */}
                      {session.resolved_at && (
                        <div className="mt-2 rounded-md bg-primary/5 border border-primary/10 px-2.5 py-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{session.resolution_reason?.label || "Atendimento Encerrado"}</span>
                          </div>
                          {session.resolution_observation && (
                            <p className="text-[11px] text-muted-foreground pl-5 leading-relaxed italic line-clamp-3">
                              "{session.resolution_observation}"
                            </p>
                          )}
                        </div>
                      )}
                      
                      {/* Timeline details (Jornada) */}
                      {session.session_events && session.session_events.length > 0 && (
                        <div className="mt-4 border-t pt-3">
                          <button 
                            onClick={() => toggleSession(session.id)}
                            className="flex items-center justify-between w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors group/toggle"
                          >
                            <div className="flex items-center gap-1.5">
                              <History className="h-3.5 w-3.5" />
                              <span>{expandedSessions.has(session.id) ? "Ocultar linha do tempo" : "Ver linha do tempo"}</span>
                            </div>
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] group-hover/toggle:bg-muted-foreground/20 transition-colors">
                              {session.session_events.length} {session.session_events.length === 1 ? 'evento' : 'eventos'}
                            </span>
                          </button>
                          
                          {expandedSessions.has(session.id) && (
                            <div className="mt-3 pl-2 border-l-2 border-muted space-y-3 w-full animate-in slide-in-from-top-2 fade-in duration-200">
                              {session.session_events.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((event: any) => (
                                <div key={event.id} className="flex items-start gap-2 text-xs text-muted-foreground w-full">
                                  <span className="shrink-0 font-mono text-[10px] mt-0.5">{format(new Date(event.created_at), "HH:mm")}</span>
                                  <div className="flex-1 min-w-0 break-words leading-relaxed pr-1">
                                    {event.event_type === 'started' && <span>Ticket aberto</span>}
                                    {event.event_type === 'assigned' && <span>Atribuído para <strong>{event.actor?.name || 'Sistema'}</strong></span>}
                                    {event.event_type === 'transferred' && <span>Transferido por <strong>{event.actor?.name || 'Sistema'}</strong>{event.metadata?.targetName ? <span> para <strong>{event.metadata.targetName}</strong></span> : ''}</span>}
                                    {event.event_type === 'returned_to_queue' && <span>Retornado à fila por <strong>{event.actor?.name || 'Sistema'}</strong></span>}
                                    {event.event_type === 'resolved' && <span>Encerrado por <strong>{event.actor?.name || 'Sistema'}</strong></span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {index < sessions.length - 1 && <div className="w-0.5 h-4 bg-border mx-auto my-1"></div>}
                </React.Fragment>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="opportunities" className="mt-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Oportunidades</h3>
            </div>
            <OpportunityDialog defaultContactId={contactId}>
              <Button size="sm" variant="outline" className="h-8">
                <Plus className="h-4 w-4 mr-1" /> Nova
              </Button>
            </OpportunityDialog>
          </div>

          {isLoadingOpportunities ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !opportunities || opportunities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              Nenhuma oportunidade registrada para este contato.
            </div>
          ) : (
            <div className="space-y-4">
              {opportunities.map((opp: any) => (
                <div key={opp.id} className="flex flex-col gap-3 p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{opp.title}</div>
                      {opp.pipeline_stages?.pipelines?.name && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Funil: {opp.pipeline_stages.pipelines.name}
                        </div>
                      )}
                    </div>
                    {opp.pipeline_stages && (
                      <Badge style={{ backgroundColor: opp.pipeline_stages.color, color: '#fff' }} variant="outline">
                        {opp.pipeline_stages.name}
                      </Badge>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-green-600 font-medium">
                      <DollarSign className="h-4 w-4" />
                      <span>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(opp.value || 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      <span>{format(new Date(opp.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-0">
          <ContactTasks contactId={contactId} />
        </TabsContent>

        <TabsContent value="ads" className="mt-0">
          <ContactAdsHistory contactId={contactId} />
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

export function ContactDetailsSheet({ contactId, open, onOpenChange }: ContactDetailsSheetProps) {
  const { data: contact, isLoading: isLoadingContact } = useQuery({
    queryKey: ["contact-details", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col">
        {isLoadingContact ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !contact ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">
            Contato não encontrado.
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-2xl">{contact.name}</SheetTitle>
                <ContactEditDialog contact={contact} />
              </div>
              <SheetDescription className="flex flex-col gap-2 mt-2">
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <CalendarDays className="h-4 w-4" />
                  <span>Cadastrado em {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
              </SheetDescription>

              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-4">
                  {contact.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </SheetHeader>

            <ContactDetailsTabs contactId={contactId!} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactEditForm({ contact, onSuccess }: { contact: any, onSuccess?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(contact.name || "");
  const [email, setEmail] = useState(contact.email || "");

  // Update states if contact changes
  useEffect(() => {
    setName(contact.name || "");
    setEmail(contact.email || "");
  }, [contact]);

  const updateContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contacts")
        .update({ name, email })
        .eq("id", contact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["contact-details", contact.id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onSuccess?.();
    },
    onError: (e) => {
      toast.error("Erro ao atualizar", { description: (e as Error).message });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateContact.mutate();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Contato</Label>
          <Input 
            id="name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Nome completo"
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone (WhatsApp)</Label>
          <Input 
            id="phone" 
            value={contact.phone || ""} 
            disabled 
            className="bg-muted"
            title="O número de telefone é o identificador único e não pode ser alterado."
          />
          <p className="text-[10px] text-muted-foreground">O número é usado para deduplicação automática.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input 
            id="email" 
            type="email"
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="email@empresa.com"
          />
        </div>

        <div className="pt-4">
          <Button 
            type="submit" 
            className="w-full" 
            disabled={updateContact.isPending || (name === contact.name && email === (contact.email || ""))}
          >
            {updateContact.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  );
}



export function ContactEditDialog({ contact }: { contact: any }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Editar contato">
          <Edit2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <ContactEditForm contact={contact} onSuccess={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactNotes({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [newNote, setNewNote] = useState("");

  const { data: notes, isLoading } = useQuery({
    queryKey: ["contact-notes", contactId],
    queryFn: async () => {
      // 1. Fetch contact notes
      const { data: contactNotes, error: err1 } = await supabase
        .from("contact_notes" as any)
        .select(`
          id,
          content,
          created_at,
          profiles (
            name,
            email
          )
        `)
        .eq("contact_id", contactId);
      
      if (err1 && err1.code !== '42P01') throw err1;

      // 2. Fetch opportunity notes for this contact
      const { data: oppNotes, error: err2 } = await supabase
        .from("opportunity_notes" as any)
        .select(`
          id,
          content,
          created_at,
          profiles (
            name,
            email
          ),
          opportunities!inner (
            id,
            title,
            contact_id
          )
        `)
        .eq("opportunities.contact_id", contactId);
      
      if (err2 && err2.code !== '42P01') throw err2;

      const allNotes: any[] = [];
      if (contactNotes) {
        allNotes.push(...contactNotes.map((n: any) => ({ ...n, type: 'contact' })));
      }
      if (oppNotes) {
        allNotes.push(...oppNotes.map((n: any) => ({ ...n, type: 'opportunity', opportunity: n.opportunities })));
      }

      return allNotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contact_notes" as any)
        .insert({
          contact_id: contactId,
          user_id: user?.id,
          content: newNote
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewNote("");
      toast.success("Observação adicionada!");
      qc.invalidateQueries({ queryKey: ["contact-notes", contactId] });
    },
    onError: (e) => toast.error("Erro ao adicionar", { description: (e as Error).message })
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Textarea 
          placeholder="Adicione uma observação sobre este contato..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="resize-none"
          rows={3}
        />
        <div className="flex justify-end">
          <Button 
            onClick={() => addNote.mutate()}
            disabled={!newNote.trim() || addNote.isPending}
          >
            {addNote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar Observação
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !notes || notes.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
            Nenhuma observação registrada.
          </div>
        ) : (
          notes.map((note: any) => (
            <div key={note.id} className="p-3 border rounded-lg space-y-2 bg-muted/30">
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  <span>{note.profiles?.name || note.profiles?.email || "Usuário"}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>{format(new Date(note.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
                {note.type === 'opportunity' && note.opportunity && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-1.5 text-primary">
                      <Target className="h-3 w-3" />
                      <span className="truncate max-w-[150px]">{note.opportunity.title}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
