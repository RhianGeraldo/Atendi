import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Send, Paperclip, Smile, MoreVertical, Search, MessageCircle, Phone, Mail, Tag, MessageSquarePlus, Loader2, Mic, Square, X, Image as ImageIcon, SmilePlus, Plus, PanelRight, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendMessageAction, sendProactiveMessageAction, reactToMessageAction, fetchContactInfoAction, toggleContactLabelAction, createLabelAction, assignConversationAction, transferConversationAction, updateContactFromWhatsappAction } from "@/lib/api/chat.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/common/channel-icon";
import { StatusBadge } from "@/components/common/status-badge";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { formatRelative, initials, formatPhone, formatMessageTime } from "@/lib/format";
import { useUnit } from "@/lib/unit-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import EmojiPicker from "emoji-picker-react";
import TextareaAutosize from "react-textarea-autosize";
import { TransferDialog } from "@/components/chat/transfer-dialog";
import { ContactDetailsTabs, ContactEditDialog } from "@/components/contacts/contact-details-sheet";

export const Route = createFileRoute("/_authenticated/conversations")({
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      c: search.c as string | undefined,
      tab: search.tab as "waiting" | "active" | "resolved" | "groups" | undefined,
    }
  }
});

type Status = "waiting" | "active" | "resolved";
type TabType = Status | "groups";

interface ConvRow {
  id: string;
  channel: "whatsapp" | "instagram";
  status: Status;
  last_message_at: string;
  started_at: string;
  tags: string[];
  unread_count?: number;
  last_message_preview?: string | null;
  contact: { 
    id: string; 
    name: string; 
    phone: string | null; 
    email: string | null; 
    tags: string[];
    contact_labels?: { labels: { id: string; name: string; color: string | null } }[];
  };
  department: { name: string } | null;
  assigned_agent?: { name: string } | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  unit_id: string;
  whatsapp_instance_id: string | null;
}

function ConversationsPage() {
  const { c: searchConvId, tab: searchTab } = Route.useSearch();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabType>(searchTab || "waiting");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchConvId || null);
  const [showSidebar, setShowSidebar] = useState(true);
  const { selectedUnitId } = useUnit();

  const { profile } = useAuth();
  
  const { data: conversations } = useQuery({
    queryKey: ["conversations", tab, selectedUnitId, profile?.id, profile?.role, profile?.department_id],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(
          "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, contact:contacts(id,name,phone,email,tags,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name)"
        );

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      } else {
        query = query.is("unit_id", null);
      }

      const { data, error } = await query.order("last_message_at", { ascending: false });
      if (error) throw error;
      
      const allConvs = (data ?? []) as unknown as ConvRow[];
      
      return allConvs.filter(c => {
        const isGroup = c.contact?.phone && (c.contact.phone.startsWith('120363') || c.contact.phone.includes('-'));
        if (tab === "groups") return isGroup;
        if (isGroup) return false;

        const isAdmin = profile?.role === "admin_company";
        const isManager = profile?.role === "manager";
        const isMyDept = c.department_id === profile?.department_id;
        const isGeneral = !c.department_id;
        const isAssignedToMe = c.assigned_agent_id === profile?.id;

        if (tab === "waiting") {
          const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
          if (!canSeeWaiting) return false;
          if (isAdmin || isManager) return c.status === "waiting";
          return c.status === "waiting" && (!c.assigned_agent_id || c.assigned_agent_id === profile?.id);
        }
        if (tab === "active") {
          const canSeeActive = isAdmin || (isManager && isMyDept) || isAssignedToMe;
          return c.status === "active" && canSeeActive;
        }
        if (tab === "resolved") {
          const canSeeResolved = isAdmin || (isManager && isMyDept) || isAssignedToMe;
          return c.status === "resolved" && canSeeResolved;
        }
        return false;
      });
    },
  });

  useEffect(() => {
    if (searchTab && searchTab !== tab) {
      setTab(searchTab as TabType);
    }
  }, [searchTab]);

  useEffect(() => {
    if (searchConvId && searchConvId !== selectedId) {
      setSelectedId(searchConvId);
    }
  }, [searchConvId]);

  const { data: unreadCounts } = useQuery({
    queryKey: ["unread-counts", selectedUnitId, profile?.id, profile?.department_id],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("status, unread_count, department_id, assigned_agent_id, contact:contacts(phone)")
        .gt("unread_count", 0);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      } else {
        query = query.is("unit_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      const counts = { waiting: 0, active: 0, resolved: 0, groups: 0 };
      
      data.forEach(c => {
        const isGroup = c.contact?.phone && (c.contact.phone.startsWith('120363') || c.contact.phone.includes('-'));
        if (isGroup) {
          counts.groups += c.unread_count || 0;
        } else {
          const isAdmin = profile?.role === "admin_company";
          const isManager = profile?.role === "manager";
          const isMyDept = c.department_id === profile?.department_id;
          const isGeneral = !c.department_id;
          const isAssignedToMe = c.assigned_agent_id === profile?.id;

          if (c.status === 'waiting') {
            const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
            if (canSeeWaiting) {
              if (isAdmin || isManager || !c.assigned_agent_id || c.assigned_agent_id === profile?.id) {
                counts.waiting++;
              }
            }
          }
          if (c.status === 'active') {
            const canSeeActive = isAdmin || (isManager && isMyDept) || isAssignedToMe;
            if (canSeeActive) counts.active++;
          }
          if (c.status === 'resolved') {
            const canSeeResolved = isAdmin || (isManager && isMyDept) || isAssignedToMe;
            if (canSeeResolved) counts.resolved++;
          }
        }
      });
      
      return counts;
    }
  });

  // Realtime
  useEffect(() => {
    // Usando um ID aleatório para o canal para evitar problemas de desconexão silenciosa no Vite HMR
    const channelId = `conversations-rt-${Math.random()}`;
    const ch = supabase
      .channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        console.log("Realtime: conversations updated", payload);
        qc.refetchQueries({ queryKey: ["conversations"] });
        qc.refetchQueries({ queryKey: ["unread-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        console.log("Realtime: messages updated", payload);
        qc.refetchQueries({ queryKey: ["messages"] });
        qc.refetchQueries({ queryKey: ["conversations"] });
        qc.refetchQueries({ queryKey: ["unread-counts"] });
      })
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.contact?.name.toLowerCase().includes(s) ||
      (c.contact?.phone ?? "").includes(s)
    );
  });

  const selected = filtered.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou número"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <NewConversationDialog onCreated={(id) => {
              setTab("active");
              setSelectedId(id);
            }} />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabType)} className="mt-3">
            <TabsList className="grid w-full grid-cols-4 h-auto py-1">
              <TabsTrigger value="waiting" className="px-1 py-1.5 text-xs relative">
                Aguard.
                {unreadCounts && unreadCounts.waiting > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white">
                    {unreadCounts.waiting}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="px-1 py-1.5 text-xs relative">
                Andamento
                {unreadCounts && unreadCounts.active > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white">
                    {unreadCounts.active}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="px-1 py-1.5 text-xs relative">
                Resolvidos
                {unreadCounts && unreadCounts.resolved > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white">
                    {unreadCounts.resolved}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="groups" className="px-1 py-1.5 text-xs relative">
                Grupos
                {unreadCounts && unreadCounts.groups > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white">
                    {unreadCounts.groups}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="flex-1">
          {filtered.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              selected={selectedId === c.id}
              onClick={() => setSelectedId(c.id)}
              currentUserId={profile?.id}
            />
          ))}
          {!filtered.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {selected ? (
          <ChatPanel 
            conv={selected} 
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onAssigned={() => setTab("active")}
          />
        ) : (
          <EmptyChat />
        )}
      </section>

      {/* Contact Info Sidebar */}
      {selected && showSidebar && (
        <aside className="hidden w-[280px] shrink-0 flex-col border-l border-border bg-card lg:flex xl:w-[320px]">
          <ContactSidebar conv={selected} onClose={() => setShowSidebar(false)} />
        </aside>
      )}
    </div>
  );
}

function ContactSidebar({ conv, onClose }: { conv: ConvRow, onClose?: () => void }) {
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const [searchLabel, setSearchLabel] = useState("");

  const { data: allLabels } = useQuery({
    queryKey: ["labels", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data } = await supabase.from('labels').select('*').eq('company_id', profile.company_id);
      return data || [];
    },
    enabled: !!profile?.company_id
  });

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, action }: { labelId: string, action: "add" | "remove" }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({ data: { unitId: selectedUnitId, contactId: conv.contact.id, labelId, action } });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(e.message)
  });

  const createLabel = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedUnitId) return;
      const res = await createLabelAction({ data: { unitId: selectedUnitId, name } });
      if (!res?.success || !res.label) throw new Error(res?.error || "Falha ao criar etiqueta");
      return res.label;
    },
    onSuccess: async (label) => {
      qc.invalidateQueries({ queryKey: ["labels", profile?.company_id] });
      // Auto assign the newly created label
      if (conv.contact?.id && selectedUnitId) {
        toggleLabel.mutate({ labelId: label.id, action: "add" });
      }
      setSearchLabel("");
      toast.success("Etiqueta criada!");
    },
    onError: (e) => toast.error((e as Error).message)
  });
  
  const { data: profilePictureUrl } = useQuery({
    queryKey: ["contact-profile-pic", conv.contact?.id, selectedUnitId],
    queryFn: async () => {
      if (!conv.contact?.id || (!conv.unit_id && !conv.whatsapp_instance_id)) return null;
      return await fetchContactInfoAction({ data: { contactId: conv.contact.id, unitId: conv.unit_id, whatsappInstanceId: conv.whatsapp_instance_id } });
    },
    enabled: !!conv.contact?.id && !!conv.unit_id,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      return await updateContactFromWhatsappAction({
        data: { contactId: conv.contact.id, unitId: conv.unit_id, whatsappInstanceId: conv.whatsapp_instance_id }
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        if (data.updatedName === "Foto Encontrada") {
          toast.success(data.message || "Foto de perfil atualizada!");
        } else {
          toast.success(`Nome atualizado para: ${data.updatedName}`);
        }
      } else if (data?.message) {
        toast.info(data.message);
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-profile-pic", conv.contact.id] });
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao atualizar contato.");
    }
  });

  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end p-2 pb-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="border-b border-border p-4 pt-0 flex flex-col items-center justify-center space-y-3 relative">
        <Avatar className="h-24 w-24 border">
          {profilePictureUrl ? (
            <img src={profilePictureUrl} alt={conv.contact?.name} className="h-full w-full object-cover" />
          ) : (
            <AvatarFallback className={cn("text-2xl", isGroup ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary")}>
              {isGroup ? <Users className="h-10 w-10" /> : initials(conv.contact.name)}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="text-center w-full relative">
          <div className="flex items-center justify-center gap-1 max-w-[80%] mx-auto">
            <h3 className="font-semibold text-lg truncate">{contactName || "Desconhecido"}</h3>
            <ContactEditDialog contact={conv.contact} />
          </div>
          <p className="text-sm text-muted-foreground">{isGroup ? "Múltiplos Participantes" : formatPhone(conv.contact.phone)}</p>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Atualizar dados do WhatsApp"
            onClick={() => updateContact.mutate()}
            disabled={updateContact.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${updateContact.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="p-4 border-b border-border space-y-2">
        <div className="flex items-center justify-between pb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Tag className="h-3 w-3 inline mr-1" /> Etiquetas
          </h4>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-xs px-2 gap-1 rounded-full">
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-48" align="end">
              <Command>
                <CommandInput 
                  placeholder="Buscar etiqueta..." 
                  className="h-8" 
                  value={searchLabel}
                  onValueChange={setSearchLabel}
                />
                <CommandList>
                  <CommandEmpty>
                    {searchLabel.length > 0 ? (
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-sm h-8 font-normal"
                        onClick={() => createLabel.mutate(searchLabel)}
                        disabled={createLabel.isPending}
                      >
                        Criar "{searchLabel}"
                      </Button>
                    ) : "Nenhuma etiqueta encontrada."}
                  </CommandEmpty>
                  <CommandGroup>
                    {allLabels?.map(label => {
                      const isSelected = conv.contact?.contact_labels?.some(cl => cl.labels?.id === label.id);
                      return (
                        <CommandItem
                          key={label.id}
                          onSelect={() => {
                            toggleLabel.mutate({ labelId: label.id, action: isSelected ? "remove" : "add" });
                          }}
                        >
                          <div 
                            className="w-2 h-2 rounded-full mr-2" 
                            style={{ backgroundColor: label.color || "#6b7280" }}
                          />
                          <span className="flex-1 text-xs">{label.name}</span>
                          {isSelected && <Square className="h-3 w-3 opacity-50 bg-primary/20" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap gap-2">
          {conv.contact?.contact_labels?.map((cl) => {
            const label = cl.labels;
            if (!label) return null;
            const hexColor = label.color || "#6b7280";
            return (
              <Badge 
                key={label.id} 
                variant="outline" 
                style={{ 
                  backgroundColor: `${hexColor}1a`, 
                  color: hexColor, 
                  borderColor: `${hexColor}33` 
                }}
              >
                {label.name}
              </Badge>
            );
          })}
          {!conv.contact?.contact_labels?.length && (
            <span className="text-xs text-muted-foreground">Nenhuma etiqueta</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {conv.contact?.id && (
          <ContactDetailsTabs contactId={conv.contact.id} />
        )}
      </div>
    </div>
  );
}

function NewConversationDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [instanceName, setInstanceName] = useState("");

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances"],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("company_id", profile.company_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id,
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("Usuário sem empresa");
      const res = await sendProactiveMessageAction({
        data: {
          phone,
          text,
          instanceName,
          companyId: profile.company_id,
        }
      });
      return res;
    },
    onSuccess: (res) => {
      if (res.conversationId) {
        onCreated(res.conversationId);
      }
      setOpen(false);
      setPhone("");
      setText("");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Mensagem enviada com sucesso!");
    },
    onError: (e) => {
      toast.error("Erro ao enviar mensagem", { description: (e as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Inicie um atendimento enviando uma mensagem ativa para o cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Instância (Remetente)</Label>
            <Select value={instanceName} onValueChange={setInstanceName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {instances?.map((inst) => (
                  <SelectItem key={inst.instance_name} value={inst.instance_name}>
                    {inst.instance_name}
                  </SelectItem>
                ))}
                {!instances?.length && (
                  <SelectItem value="none" disabled>Nenhuma instância encontrada</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número do Cliente</Label>
            <Input 
              placeholder="Ex: 5511999999999" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
            <p className="text-[10px] text-muted-foreground">Inclua o DDI (55) e o DDD.</p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea 
              placeholder="Digite a primeira mensagem..." 
              value={text} 
              onChange={e => setText(e.target.value)} 
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            onClick={() => send.mutate()} 
            disabled={!phone || !text || !instanceName || send.isPending}
          >
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationItem({
  conv,
  selected,
  onClick,
  currentUserId,
}: {
  conv: ConvRow;
  selected: boolean;
  onClick: () => void;
  currentUserId?: string;
}) {
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full max-w-full overflow-hidden items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40",
        selected && "bg-accent/60",
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className={cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted")}>
          {isGroup ? <Users className="h-4 w-4" /> : initials(conv.contact?.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 grid">
        <div className="flex items-center gap-2">
          <ChannelIcon channel={conv.channel} className="h-4 w-4 shrink-0" />
          <span className={cn("truncate text-sm font-medium flex-1", conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground")}>
            {contactName}
          </span>
          <span className={cn("whitespace-nowrap shrink-0 text-[11px]", conv.unread_count && conv.unread_count > 0 ? "font-bold text-success" : "text-muted-foreground")}>
            {formatRelative(conv.last_message_at)}
          </span>
        </div>
        {conv.last_message_preview && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {conv.last_message_preview}
          </div>
        )}
        <div className="mt-1.5 flex min-h-[20px] items-center gap-1.5">
          {conv.department?.name && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {conv.department.name}
            </Badge>
          )}
          {conv.status === "active" && conv.assigned_agent?.name && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/30">
              {conv.assigned_agent.name}
            </Badge>
          )}
          {conv.status === "waiting" && conv.assigned_agent_id && conv.assigned_agent_id === currentUserId && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px] font-normal bg-orange-500 hover:bg-orange-600">
              Transferido
            </Badge>
          )}
          {conv.tags?.map((t) => (
            <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {t}
            </Badge>
          ))}
          {conv.unread_count && conv.unread_count > 0 ? (
            <Badge className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold hover:bg-success">
              {conv.unread_count}
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
        <MessageCircle className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium">Selecione uma conversa</h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Escolha um atendimento na lista ao lado para visualizar as mensagens.
      </p>
    </div>
  );
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: "agent" | "contact" | "system";
  content: string | null;
  media_type: "text" | "image" | "audio" | "video" | "document";
  media_url?: string | null;
  created_at: string;
  quoted_content?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  reactions?: Record<string, string[]>;
  isOptimistic?: boolean;
  profiles?: { name: string };
}

function ChatPanel({ 
  conv,
  showSidebar,
  onToggleSidebar,
  onAssigned
}: { 
  conv: ConvRow;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  onAssigned?: () => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_type, content, media_type, media_url, created_at, quoted_content, is_edited, is_deleted, reactions, profiles(name)")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    
    // Reset unread count when chat is opened
    if (conv.id && conv.unread_count && conv.unread_count > 0) {
      supabase.rpc('reset_unread_count', { conv_id: conv.id }).then(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["unread-counts"] });
      });
    }
  }, [messages?.length, conv.id, conv.unread_count, qc]);

  const send = useMutation({
    mutationFn: async (payload: { content: string; mediaType?: "text"|"image"|"video"|"audio"|"document"; mediaBase64?: string }) => {
      await sendMessageAction({ data: { conversationId: conv.id, text: payload.content, mediaType: payload.mediaType, mediaBase64: payload.mediaBase64 } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      const optimisticMsg: MessageRow = {
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_type: "agent",
        content: payload.content,
        media_type: payload.mediaType || "text",
        media_url: payload.mediaBase64 || null,
        created_at: new Date().toISOString(),
        isOptimistic: true,
        profiles: profile?.name ? { name: profile.name } : undefined
      };

      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => [...(old || []), optimisticMsg]);
      setText("");
      setSelectedFile(null);
      
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);

      return { previousMessages, content: payload.content };
    },
    onError: (e, variables, context) => {
      if (context?.previousMessages) {
        qc.setQueryData(["messages", conv.id], context.previousMessages);
      }
      setText(context?.content || "");
      toast.error("Erro ao enviar", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
      await reactToMessageAction({ data: { conversationId: conv.id, messageId, emoji } });
    },
    onMutate: async ({ messageId, emoji }) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === messageId ? { ...m, reactions: emoji ? { [emoji]: 1 } : {} } : m);
      });
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao reagir", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      let type = "document";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";
      
      setSelectedFile({ file, base64, type });
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // reset
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          send.mutate({ content: "", mediaType: "audio", mediaBase64: base64data });
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Erro ao acessar microfone", { description: String(err) });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // prevent onstop from sending
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const handleSend = () => {
    if (selectedFile) {
      send.mutate({ content: text.trim(), mediaType: selectedFile.type as any, mediaBase64: selectedFile.base64 });
    } else if (text.trim()) {
      send.mutate({ content: text.trim() });
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const resolve = useMutation({
    mutationFn: async () => {
      await supabase
        .from("conversations")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento encerrado");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const assignConv = useMutation({
    mutationFn: async () => {
      await assignConversationAction({ data: { conversationId: conv.id } });
    },
    onSuccess: () => {
      toast.success("Atendimento puxado para você.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onAssigned?.();
    },
    onError: (e) => {
      toast.error("Erro ao puxar atendimento", { description: (e as Error).message });
    }
  });

  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className={cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted")}>
                {isGroup ? <Users className="h-4 w-4" /> : initials(conv.contact?.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {contactName}
                <ChannelIcon channel={conv.channel} className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {conv.department?.name && <span>{conv.department.name}</span>}
                <span>•</span>
                <StatusBadge status={conv.status} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conv.status === "active" && !isGroup && (
              <>
                <TransferDialog conv={conv} />
                <Button variant="outline" size="sm" onClick={() => resolve.mutate()}>
                  Encerrar
                </Button>
              </>
            )}
            <button 
              className={cn("rounded p-2 text-muted-foreground hover:bg-accent", showSidebar && "bg-accent")}
              onClick={onToggleSidebar}
              title="Informações do Contato"
            >
              <PanelRight className="h-4 w-4" />
            </button>
            <button className="rounded p-2 text-muted-foreground hover:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4"
        >
          {messages?.map((m) => (
            <MessageBubble 
              key={m.id} 
              m={m} 
              isGroup={isGroup}
              onReact={(emoji) => react.mutate({ messageId: m.id, emoji })} 
            />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-3 flex flex-col gap-2 relative">
          {(conv.status === 'waiting' || (conv.status === 'active' && conv.assigned_agent_id && conv.assigned_agent_id !== profile?.id)) && !isGroup && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card gap-2">
              {(!conv.assigned_agent_id || conv.assigned_agent_id === profile?.id || profile?.role === 'admin_company' || profile?.role === 'manager') ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground text-center px-4">
                    {!conv.assigned_agent_id 
                      ? "Esta conversa está na fila e aguardando um agente." 
                      : conv.assigned_agent_id === profile?.id 
                        ? "Esta conversa foi transferida para você." 
                        : conv.status === 'active'
                          ? `Esta conversa está sendo atendida por ${conv.assigned_agent?.name || 'outro agente'}.`
                          : "Esta conversa foi transferida para outro agente."}
                  </p>
                  <Button onClick={() => assignConv.mutate()} disabled={assignConv.isPending}>
                    {assignConv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {!conv.assigned_agent_id ? "Atender Cliente" : (conv.assigned_agent_id === profile?.id ? "Aceitar Transferência" : "Assumir Conversa")}
                  </Button>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  {conv.status === 'active' ? "Em atendimento por outro agente." : "Aguardando aceite do agente transferido."}
                </p>
              )}
            </div>
          )}
          {selectedFile && (
            <div className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8">
              <button 
                onClick={() => setSelectedFile(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              {selectedFile.type === 'image' ? (
                <img src={selectedFile.base64} alt="preview" className="h-12 w-12 object-cover rounded-md" />
              ) : (
                <div className="h-12 w-12 bg-muted rounded-md flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-xs truncate max-w-[150px]">
                {selectedFile.file.name}
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {!isRecording ? (
              <>
                <input type="file" id="file-upload" hidden onChange={handleFileChange} />
                <label htmlFor="file-upload" className="rounded p-2 text-muted-foreground hover:bg-accent cursor-pointer">
                  <Paperclip className="h-4 w-4" />
                </label>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="rounded p-2 text-muted-foreground hover:bg-accent">
                      <Smile className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="p-0 border-none w-auto shadow-xl">
                    <EmojiPicker onEmojiClick={(e) => setText(prev => prev + e.emoji)} />
                  </PopoverContent>
                </Popover>
                
                <TextareaAutosize
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  minRows={1}
                  maxRows={6}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
                
                {(text.trim() || selectedFile) ? (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={send.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={startRecording}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between flex-1 bg-destructive/10 text-destructive px-4 py-2 rounded-md border border-destructive/20 h-[40px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
                  <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 hover:bg-destructive/20 hover:text-destructive text-destructive/80" onClick={cancelRecording}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 px-3 bg-destructive hover:bg-destructive/90 text-white" onClick={stopRecording}>
                    <Send className="h-3 w-3 mr-1" />
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="break-all">{value}</div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*|_{1}[^_]+_{1}|~[^~]+~)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith('~') && part.endsWith('~')) return <del key={i}>{part.slice(1, -1)}</del>;
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function MessageBubble({ m, isGroup, onReact }: { m: MessageRow, isGroup?: boolean, onReact?: (emoji: string) => void }) {
  const mine = m.sender_type === "agent";
  
  let senderName = null;
  let displayContent = m.content || "";

  if (isGroup && m.sender_type === "contact") {
    const match = displayContent.match(/^(.+?):\n([\s\S]*)$/);
    if (match) {
      senderName = match[1];
      displayContent = match[2];
    }
  } else if (mine) {
    if (m.profiles?.name) {
      senderName = m.profiles.name;
    }
    
    // Check if user has signature enabled (it would be manually inserted as *Name*:\n...)
    const hasSignature = displayContent.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      // Strip signature visually so it doesn't duplicate the header
      displayContent = hasSignature[2];
      if (!senderName) {
        senderName = hasSignature[1];
      }
    }
  }

  return (
    <div className={cn("flex relative", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] flex flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card text-foreground border border-border",
          m.is_deleted && "opacity-60",
          m.isOptimistic && "opacity-70"
        )}
      >
        {senderName && (
          <div className={cn(
            "mb-1 text-xs font-bold",
            mine ? "text-primary-foreground/90" : "text-primary/80 dark:text-primary/90"
          )}>
            {senderName}
          </div>
        )}
        {onReact && !m.isOptimistic && !m.is_deleted && (
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground z-10",
                mine ? "-left-10" : "-right-10"
              )}>
                <SmilePlus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-auto p-2 flex gap-1 rounded-full shadow-lg border-border">
              {QUICK_EMOJIS.map(e => (
                <button 
                  key={e} 
                  onClick={() => onReact(e)} 
                  className="hover:bg-accent rounded-full p-2 text-xl transition-transform hover:scale-125"
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {m.quoted_content && !m.is_deleted && (
          <div className="mb-2 rounded bg-black/10 dark:bg-white/10 p-2 text-xs border-l-4 opacity-90 border-l-current">
            <span className="font-semibold block mb-0.5 text-[10px] uppercase opacity-70">Mensagem Respondida</span>
            <span className="line-clamp-3 opacity-90">{m.quoted_content}</span>
          </div>
        )}

        {m.is_deleted ? (
          <div className="flex items-center gap-1.5 italic">
            <span className="text-[16px]">🚫</span>
            Mensagem apagada
          </div>
        ) : m.media_type === "image" && m.media_url ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" 
                />
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none flex justify-center items-center">
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-h-[85vh] w-auto rounded-md object-contain" 
                />
              </DialogContent>
            </Dialog>
            {displayContent && displayContent !== "📷 Imagem" && (
              <div className="mt-2"><FormattedText text={displayContent} /></div>
            )}
          </div>
        ) : m.media_type === "audio" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <audio controls src={m.media_url} className="h-10 w-48" />
            {displayContent && displayContent !== "🎵 Áudio" && <div className="text-xs"><FormattedText text={displayContent} /></div>}
          </div>
        ) : m.media_type === "video" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <video controls src={m.media_url} className="max-w-[200px] rounded-lg" />
            {displayContent && displayContent !== "🎥 Vídeo" && <div className="text-xs"><FormattedText text={displayContent} /></div>}
          </div>
        ) : (
          <FormattedText text={displayContent} />
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {m.is_edited && <span className="italic">Editado</span>}
          <span>{formatMessageTime(m.created_at)}</span>
        </div>
        
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className="absolute -bottom-3 right-2 flex gap-1 bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-sm">
            {Object.entries(m.reactions).map(([emoji, count]) => (
              <span key={emoji}>{emoji} {count > 1 ? count : ''}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
