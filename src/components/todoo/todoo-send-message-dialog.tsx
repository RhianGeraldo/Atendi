import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Mic,
  Search,
  Send,
  Video,
  X,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { sendMessageAction, sendProactiveMessageAction } from "@/lib/api/chat.functions";
import { fillQuickMessageVariables } from "@/lib/quick-message-vars";
import { ContactChatButton } from "@/components/chat/contact-chat-button";
import type { TodooLead } from "@/types/todoo";
import { formatTodooPhone } from "./todoo-period";
import type { TodooStage } from "./todoo-stages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MediaType = "image" | "video" | "audio" | "document";

interface WhatsappInstanceRow {
  id: string;
  name: string;
  instance_name: string;
  provider: string | null;
  network: string | null;
  unit_id: string | null;
  department_id: string | null;
}

interface QuickMessageRow {
  id: string;
  shortcut: string;
  name: string | null;
  content: string | null;
  media_type: string | null;
  folder_id: string | null;
}

const MEDIA_META: Record<MediaType, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Video },
  audio: { label: "Áudio", icon: Mic },
  document: { label: "Documento", icon: FileText },
};

const isMediaType = (t: string | null | undefined): t is MediaType =>
  t === "image" || t === "video" || t === "audio" || t === "document";

interface Props {
  lead: TodooLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Próxima etapa da cadência: com ela, o envio pode registrar a tentativa */
  nextStage?: TodooStage | null;
  onSent?: () => void;
}

/** Envia mensagem pelo WhatsApp sem sair do Todoo, com as mensagens rápidas da empresa. */
export function TodooSendMessageDialog({ lead, open, onOpenChange, nextStage, onSent }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const { unitIds: myUnitIds } = useAccessibleUnits();
  const queryClient = useQueryClient();

  const [instanceName, setInstanceName] = useState("");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<{ type: MediaType; url: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [loadingQuickId, setLoadingQuickId] = useState<string | null>(null);
  const [registerAttempt, setRegisterAttempt] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setMedia(null);
    setSearch("");
    setRegisterAttempt(true);
  }, [open, lead?.id]);

  const isManagement =
    profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager";

  // Números de WhatsApp: os da unidade do lead (ou, sem unidade, os que a pessoa pode usar)
  const { data: instances = [], isLoading: loadingInstances } = useQuery({
    queryKey: [
      "todoo-send-instances",
      activeCompanyId,
      lead?.unit_id ?? null,
      selectedUnitId,
      myUnitIds.join(","),
      profile?.id,
      profile?.department_id,
    ],
    enabled: open && !!activeCompanyId && !!lead,
    queryFn: async () => {
      // "network" ainda não está nos tipos gerados do Supabase
      let query = (supabase.from("whatsapp_instances") as any)
        .select("id, name, instance_name, provider, network, unit_id, department_id")
        .eq("company_id", activeCompanyId!)
        .order("name", { ascending: true });
      if (lead?.unit_id) {
        query = query.eq("unit_id", lead.unit_id);
      } else if (selectedUnitId && selectedUnitId !== "all") {
        // Lead sem unidade: o número da unidade selecionada no topo
        query = query.eq("unit_id", selectedUnitId);
      } else if (!isManagement) {
        // Consultora: só os números das unidades dela (ou sem unidade), do seu departamento
        query = query.or(
          myUnitIds.length > 0 ? `unit_id.in.(${myUnitIds.join(",")}),unit_id.is.null` : "unit_id.is.null",
        );
        query = profile?.department_id
          ? query.or(`department_id.eq.${profile.department_id},department_id.is.null`)
          : query.is("department_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as WhatsappInstanceRow[]).filter(
        (inst) =>
          (!inst.network || inst.network === "whatsapp") && inst.provider !== "instagram" && inst.provider !== "messenger",
      );
    },
  });

  useEffect(() => {
    if (!open) return;
    if (instances.length === 0) {
      setInstanceName("");
    } else if (!instances.some((i) => i.instance_name === instanceName)) {
      setInstanceName(instances[0].instance_name);
    }
  }, [open, instances, instanceName]);

  // Mensagens rápidas (sem a mídia, que é pesada: ela vem só ao escolher)
  const { data: quickData, isLoading: loadingQuick } = useQuery({
    queryKey: ["todoo-quick-messages", activeCompanyId],
    enabled: open && !!activeCompanyId,
    staleTime: 60_000,
    queryFn: async () => {
      const [messagesRes, foldersRes, companyRes] = await Promise.all([
        supabase
          .from("quick_messages")
          .select("id, shortcut, name, content, media_type, folder_id")
          .eq("company_id", activeCompanyId!)
          .order("shortcut", { ascending: true }),
        supabase
          .from("quick_message_folders")
          .select("id, name")
          .eq("company_id", activeCompanyId!)
          .order("name", { ascending: true }),
        supabase.from("companies").select("name, custom_variables").eq("id", activeCompanyId!).maybeSingle(),
      ]);
      if (messagesRes.error) throw messagesRes.error;
      if (foldersRes.error) throw foldersRes.error;
      return {
        messages: (messagesRes.data || []) as QuickMessageRow[],
        folders: (foldersRes.data || []) as { id: string; name: string }[],
        company: companyRes.data as { name: string; custom_variables: unknown } | null,
      };
    },
  });

  const { data: unitData } = useQuery({
    queryKey: ["todoo-send-unit", lead?.unit_id],
    enabled: open && !!lead?.unit_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("name, custom_variables").eq("id", lead!.unit_id!).maybeSingle();
      return data as { name: string; custom_variables: unknown } | null;
    },
  });

  // Agrupa por pasta, filtrando pela busca
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (quickData?.messages || []).filter(
      (m) =>
        !term ||
        m.shortcut.toLowerCase().includes(term) ||
        (m.name || "").toLowerCase().includes(term) ||
        (m.content || "").toLowerCase().includes(term),
    );
    const folders = quickData?.folders || [];
    const result: { id: string; name: string | null; items: QuickMessageRow[] }[] = [];
    const root = list.filter((m) => !m.folder_id || !folders.some((f) => f.id === m.folder_id));
    if (root.length) result.push({ id: "root", name: null, items: root });
    for (const f of folders) {
      const items = list.filter((m) => m.folder_id === f.id);
      if (items.length) result.push({ id: f.id, name: f.name, items });
    }
    return result;
  }, [quickData, search]);

  const instanceLabel = instances.find((i) => i.instance_name === instanceName)?.name || instanceName;

  const pickQuickMessage = async (qm: QuickMessageRow) => {
    if (!lead) return;
    setText(
      fillQuickMessageVariables(qm.content || "", {
        clientName: lead.contact_name,
        phone: lead.contact_phone,
        agentName: profile?.name,
        companyName: quickData?.company?.name,
        unitName: unitData?.name ?? lead.unit?.name,
        instanceName: instanceLabel,
        companyVariables: quickData?.company?.custom_variables,
        unitVariables: unitData?.custom_variables,
      }),
    );

    if (!isMediaType(qm.media_type)) {
      setMedia(null);
      return;
    }
    setLoadingQuickId(qm.id);
    try {
      const { data, error } = await supabase.from("quick_messages").select("media_url").eq("id", qm.id).single();
      if (error) throw error;
      setMedia(data?.media_url ? { type: qm.media_type, url: data.media_url, name: qm.name || qm.shortcut } : null);
    } catch (err: any) {
      toast.error("Não foi possível carregar a mídia: " + err.message);
      setMedia(null);
    } finally {
      setLoadingQuickId(null);
    }
  };

  const canRegister = !!nextStage;

  const handleSend = async () => {
    if (!lead || !activeCompanyId || !profile) return;
    if (!instanceName) {
      toast.error("Nenhum número de WhatsApp disponível para esta unidade.");
      return;
    }
    if (!text.trim() && !media) {
      toast.error("Escreva a mensagem ou escolha uma mensagem rápida.");
      return;
    }

    setSending(true);
    try {
      // 1. Abre (ou cria) a conversa do contato nesse número, com as mesmas regras do Atendimento
      const opened = await sendProactiveMessageAction({
        data: { phone: lead.contact_phone, instanceName, companyId: activeCompanyId },
      });
      const conversationId = opened.conversationId as string;

      // 2. Envia como no Atendimento (assinatura, mídia e histórico). Áudio não tem legenda:
      //    vai o áudio e depois o texto.
      if (media && media.type === "audio") {
        await sendMessageAction({
          data: { conversationId, text: "", mediaType: "audio", mediaBase64: media.url },
        });
        if (text.trim()) {
          await sendMessageAction({ data: { conversationId, text: text.trim(), mediaType: "text" } });
        }
      } else if (media) {
        await sendMessageAction({
          data: { conversationId, text: text.trim(), mediaType: media.type, mediaBase64: media.url },
        });
      } else {
        await sendMessageAction({ data: { conversationId, text: text.trim(), mediaType: "text" } });
      }

      // 3. Cadência: registra a tentativa e avança o card (a mensagem já saiu)
      let attemptSaved = false;
      try {
        if (canRegister && registerAttempt && nextStage) {
          const { error } = await (supabase.from("todoo_leads") as any)
            .update({ stage_id: nextStage.id, updated_at: new Date().toISOString() })
            .eq("id", lead.id);
          if (error) throw error;
          attemptSaved = true;
          await (supabase.from("todoo_events") as any).insert({
            lead_id: lead.id,
            campaign_id: lead.campaign_id,
            company_id: lead.company_id,
            user_id: profile.id,
            event_type: nextStage.kind === "attempt" ? "cadence_attempt" : "cadence_moved",
            notes: `Mensagem enviada pelo Todoo: ${nextStage.name}`,
            metadata: { from: lead.stage_id ?? null, to: nextStage.id, conversation_id: conversationId },
          });
        } else {
          await (supabase.from("todoo_leads") as any)
            .update({ last_interaction_at: new Date().toISOString() })
            .eq("id", lead.id);
        }
      } catch (err: any) {
        toast.warning("Mensagem enviada, mas a tentativa não foi registrada", { description: err?.message });
      }

      toast.success(
        attemptSaved && nextStage
          ? `Mensagem enviada · ${lead.contact_name} foi para ${nextStage.name}`
          : `Mensagem enviada para ${lead.contact_name}`,
      );
      queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
      queryClient.invalidateQueries({ queryKey: ["todoo-my-day"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onSent?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao enviar", { description: err?.message });
    } finally {
      setSending(false);
    }
  };

  const MediaIcon = media ? MEDIA_META[media.type].icon : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[92vh] grid-cols-1 overflow-y-auto overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-base">Enviar mensagem</DialogTitle>
          <DialogDescription className="text-xs">
            {lead?.contact_name} · {formatTodooPhone(lead?.contact_phone)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Número que envia */}
          <div className="space-y-1">
            <Label className="text-xs">Enviar pelo WhatsApp</Label>
            {loadingInstances ? (
              <div className="h-8 flex items-center text-xs text-muted-foreground gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando números...
              </div>
            ) : instances.length === 0 ? (
              <p className="text-xs text-destructive">Nenhum número de WhatsApp conectado para esta unidade.</p>
            ) : instances.length === 1 ? (
              <p className="text-xs font-medium">{instances[0].name}</p>
            ) : (
              <Select value={instanceName} onValueChange={setInstanceName}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {instances.map((i) => (
                    <SelectItem key={i.id} value={i.instance_name} className="text-xs">
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Mensagens rápidas */}
          <div className="rounded-lg border">
            <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold shrink-0">Mensagens rápidas</span>
              <div className="relative ml-auto w-40">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="h-7 pl-6 text-xs"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {loadingQuick ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : groups.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {search ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem rápida cadastrada."}
                </p>
              ) : (
                groups.map((g) => (
                  <div key={g.id}>
                    {g.name && (
                      <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        <Folder className="h-3 w-3" />
                        {g.name}
                      </div>
                    )}
                    {g.items.map((qm) => {
                      const Icon = isMediaType(qm.media_type) ? MEDIA_META[qm.media_type].icon : null;
                      return (
                        <button
                          key={qm.id}
                          type="button"
                          onClick={() => pickQuickMessage(qm)}
                          disabled={loadingQuickId === qm.id}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                        >
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            /{qm.shortcut}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{qm.name || qm.shortcut}</span>
                            {qm.content && (
                              <span className="block truncate text-[10px] text-muted-foreground">{qm.content}</span>
                            )}
                          </span>
                          {loadingQuickId === qm.id ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                          ) : (
                            Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mídia escolhida */}
          {media && MediaIcon && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              {media.type === "image" ? (
                <img src={media.url} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded bg-background shrink-0">
                  <MediaIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{media.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {MEDIA_META[media.type].label}
                  {media.type === "audio" ? " · o texto vai em seguida" : text.trim() ? " · com a mensagem como legenda" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setMedia(null)}
                title="Tirar mídia"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Texto */}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escolha uma mensagem rápida ou escreva aqui..."
            rows={5}
            className="text-sm resize-none"
          />

          {canRegister && nextStage && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={registerAttempt} onCheckedChange={(v) => setRegisterAttempt(v === true)} />
              Registrar como <strong>{nextStage.name}</strong>
            </label>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {lead && (
            <ContactChatButton
              contactId={lead.contact_id}
              contactName={lead.contact_name}
              phone={lead.contact_phone}
              unitId={lead.unit_id}
              trigger={
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir conversa
                </Button>
              }
            />
          )}
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || !instanceName || (!text.trim() && !media)}
            className={cn("gap-1.5")}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
