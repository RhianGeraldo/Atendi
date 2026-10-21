import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTodooPipeline } from "./todoo-stages";
import { formatTodooPhone } from "./todoo-period";
import {
  TODOO_AUTO_STATUS,
  TODOO_AUTO_WEEKDAYS,
  type TodooAutoMessage,
  type TodooAutoQueueStatus,
  type TodooAutoUnit,
} from "./todoo-auto";

type MediaType = "image" | "video" | "audio" | "document";

const MEDIA_META: Record<MediaType, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Video },
  audio: { label: "Áudio", icon: Mic },
  document: { label: "Documento", icon: FileText },
};

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const VARIABLES = ["{{primeiro_nome}}", "{{cliente}}", "{{consultora}}", "{{indicadora}}", "{{unidade}}", "{{saudacao}}"];

const mediaTypeOf = (mime: string): MediaType =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";

const isMediaType = (t: string | null | undefined): t is MediaType =>
  t === "image" || t === "video" || t === "audio" || t === "document";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Envio automático da cadência: mensagens de cada etapa, unidades e fila. */
export function TodooAutoDialog({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState("messages");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] grid-cols-1 overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-500" />
            Envio automático
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cada tentativa sai sozinha pelo número da unidade, um contato por vez. Se a cliente responder, a
            cadência pausa e a consultora assume. Envio automático não conta na meta nem no ranking.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="messages" className="text-xs">Mensagens</TabsTrigger>
            <TabsTrigger value="units" className="text-xs">Unidades</TabsTrigger>
            <TabsTrigger value="queue" className="text-xs">Fila</TabsTrigger>
          </TabsList>
          <TabsContent value="messages" className="pt-2">
            {open && <MessagesTab />}
          </TabsContent>
          <TabsContent value="units" className="pt-2">
            {open && <UnitsTab />}
          </TabsContent>
          <TabsContent value="queue" className="pt-2">
            {open && tab === "queue" && <QueueTab />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

interface Draft {
  id: string | null;
  campaignId: string;
  content: string;
  media: { type: MediaType; url: string; name: string } | null;
}

function MessagesTab() {
  const { activeCompanyId } = useActiveCompany();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { stages } = useTodooPipeline();
  const attemptStages = stages.filter((s) => s.kind === "attempt");
  const [stageId, setStageId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stageId && attemptStages[0]) setStageId(attemptStages[0].id);
  }, [stageId, attemptStages]);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["todoo-auto-campaigns", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_campaigns") as any)
        .select("id, title, status")
        .eq("company_id", activeCompanyId)
        .neq("status", "archived")
        .order("title");
      if (error) throw error;
      return (data || []) as { id: string; title: string; status: string }[];
    },
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["todoo-auto-messages", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_auto_messages") as any)
        .select("id, company_id, stage_id, campaign_id, content, media_type, media_url, media_name, active, created_at")
        .eq("company_id", activeCompanyId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as TodooAutoMessage[];
    },
  });

  const { data: quickMessages = [] } = useQuery({
    queryKey: ["todoo-quick-messages-list", activeCompanyId],
    enabled: !!activeCompanyId && !!draft,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_messages")
        .select("id, shortcut, name, content, media_type")
        .eq("company_id", activeCompanyId!)
        .order("shortcut");
      if (error) throw error;
      return data || [];
    },
  });

  const stageMessages = messages.filter((m) => m.stage_id === stageId);
  const countByStage = (id: string) => messages.filter((m) => m.stage_id === id && m.active).length;
  const campaignTitle = (id: string | null) =>
    id ? campaigns.find((c) => c.id === id)?.title || "Ação" : "Todas as ações";
  const stageIndex = attemptStages.findIndex((s) => s.id === stageId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["todoo-auto-messages", activeCompanyId] });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error("Arquivo muito grande (máximo 16 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((d) => d && { ...d, media: { type: mediaTypeOf(file.type), url: reader.result as string, name: file.name } });
    reader.readAsDataURL(file);
  };

  const importQuickMessage = async (id: string) => {
    const qm = quickMessages.find((q) => q.id === id);
    if (!qm) return;
    let media: Draft["media"] = null;
    if (isMediaType(qm.media_type)) {
      const { data } = await supabase.from("quick_messages").select("media_url").eq("id", id).single();
      if (data?.media_url) media = { type: qm.media_type, url: data.media_url, name: qm.name || qm.shortcut };
    }
    setDraft((d) => d && { ...d, content: qm.content || "", media });
  };

  const save = async () => {
    if (!draft || !stageId || !activeCompanyId) return;
    if (!draft.content.trim() && !draft.media) {
      toast.error("Escreva a mensagem ou anexe uma mídia.");
      return;
    }
    setSaving(true);
    try {
      const row = {
        company_id: activeCompanyId,
        stage_id: stageId,
        campaign_id: draft.campaignId === "all" ? null : draft.campaignId,
        content: draft.content.trim() || null,
        media_type: draft.media?.type ?? null,
        media_url: draft.media?.url ?? null,
        media_name: draft.media?.name ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = draft.id
        ? await (supabase.from("todoo_auto_messages") as any).update(row).eq("id", draft.id)
        : await (supabase.from("todoo_auto_messages") as any).insert({ ...row, created_by: profile?.id ?? null });
      if (error) throw error;
      toast.success(draft.id ? "Mensagem atualizada" : "Mensagem adicionada");
      setDraft(null);
      refresh();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: TodooAutoMessage, active: boolean) => {
    const { error } = await (supabase.from("todoo_auto_messages") as any)
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", m.id);
    if (error) toast.error("Erro: " + error.message);
    refresh();
  };

  const remove = async (m: TodooAutoMessage) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    const { error } = await (supabase.from("todoo_auto_messages") as any).delete().eq("id", m.id);
    if (error) toast.error("Erro: " + error.message);
    refresh();
  };

  if (attemptStages.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">O funil ainda não tem tentativas.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {attemptStages.map((s) => {
          const count = countByStage(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStageId(s.id);
                setDraft(null);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                stageId === s.id ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
              <span className={cn("text-[10px]", count === 0 ? "text-muted-foreground" : "text-emerald-600")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {stageIndex === 0
          ? "Sai assim que o card entra em A contatar."
          : `Sai quando vence a espera de ${attemptStages[stageIndex - 1]?.name ?? "a tentativa anterior"}.`}{" "}
        Com mais de uma mensagem, uma é sorteada a cada envio. Etapa sem mensagem continua manual.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {stageMessages.length === 0 && !draft && (
            <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
              Nenhuma mensagem nesta etapa.
            </p>
          )}
          {stageMessages.map((m, i) => {
            const Icon = isMediaType(m.media_type) ? MEDIA_META[m.media_type].icon : null;
            return (
              <div
                key={m.id}
                className={cn("flex items-start gap-2 rounded-lg border bg-card p-2.5", !m.active && "opacity-60")}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-semibold">Variação {i + 1}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {campaignTitle(m.campaign_id)}
                    </span>
                    {Icon && (
                      <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        {m.media_name || MEDIA_META[m.media_type as MediaType].label}
                      </span>
                    )}
                  </div>
                  {m.content && <p className="whitespace-pre-wrap text-xs">{m.content}</p>}
                </div>
                <Switch checked={m.active} onCheckedChange={(v) => toggleActive(m, v)} title="Ativa" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setDraft({
                      id: m.id,
                      campaignId: m.campaign_id ?? "all",
                      content: m.content || "",
                      media:
                        m.media_url && isMediaType(m.media_type)
                          ? { type: m.media_type, url: m.media_url, name: m.media_name || "Mídia" }
                          : null,
                    })
                  }
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(m)}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {draft ? (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={draft.campaignId} onValueChange={(v) => setDraft({ ...draft, campaignId: v })}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas as ações</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    Só {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {quickMessages.length > 0 && (
              <Select value="" onValueChange={importQuickMessage}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Usar mensagem rápida..." />
                </SelectTrigger>
                <SelectContent>
                  {quickMessages.map((q) => (
                    <SelectItem key={q.id} value={q.id} className="text-xs">
                      /{q.shortcut} {q.name ? `· ${q.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            placeholder="{{saudacao}}, {{primeiro_nome}}! Aqui é a {{consultora}}..."
            rows={5}
            className="text-sm resize-none bg-background"
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            {VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted/70"
                onClick={() => setDraft({ ...draft, content: `${draft.content}${v}` })}
              >
                {v}
              </button>
            ))}
          </div>
          {draft.media ? (
            <div className="flex items-center gap-2 rounded-md border bg-background p-2 text-xs">
              {(() => {
                const Icon = MEDIA_META[draft.media.type].icon;
                return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
              })()}
              <span className="min-w-0 flex-1 truncate">{draft.media.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {draft.media.type === "audio" ? "o texto vai em seguida" : "o texto vai como legenda"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDraft({ ...draft, media: null })}
                title="Tirar mídia"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anexar mídia
              </Button>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar mensagem
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={() => setDraft({ id: null, campaignId: "all", content: "", media: null })}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar mensagem
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

interface UnitDraft {
  enabled: boolean;
  instanceId: string;
  intervalMin: string;
  intervalMax: string;
  windowStart: string;
  windowEnd: string;
  weekdays: number[];
  dailyLimit: string;
}

const toDraft = (cfg: TodooAutoUnit | undefined): UnitDraft => ({
  enabled: cfg?.enabled ?? false,
  instanceId: cfg?.instance_id ?? "",
  intervalMin: String((cfg?.interval_min_seconds ?? 120) / 60),
  intervalMax: String((cfg?.interval_max_seconds ?? 180) / 60),
  windowStart: (cfg?.window_start ?? "08:00").slice(0, 5),
  windowEnd: (cfg?.window_end ?? "19:00").slice(0, 5),
  weekdays: cfg?.weekdays ?? [1, 2, 3, 4, 5, 6],
  dailyLimit: cfg?.daily_limit ? String(cfg.daily_limit) : "",
});

function UnitsTab() {
  const { activeCompanyId } = useActiveCompany();

  const { data, isLoading } = useQuery({
    queryKey: ["todoo-auto-units", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [units, instances, configs, pending, sentToday] = await Promise.all([
        supabase.from("units").select("id, name").eq("company_id", activeCompanyId!).order("name"),
        (supabase.from("whatsapp_instances") as any)
          .select("id, name, unit_id, provider, network")
          .eq("company_id", activeCompanyId)
          .order("name"),
        (supabase.from("todoo_auto_units") as any).select("*").eq("company_id", activeCompanyId),
        fetchAllPages(() =>
          (supabase.from("todoo_auto_queue") as any)
            .select("id, unit_id")
            .eq("company_id", activeCompanyId)
            .in("status", ["pending", "sending"])
            .order("id"),
        ),
        fetchAllPages(() =>
          (supabase.from("todoo_auto_queue") as any)
            .select("id, unit_id")
            .eq("company_id", activeCompanyId)
            .eq("status", "sent")
            .gte("finished_at", dayStart.toISOString())
            .order("id"),
        ),
      ]);
      for (const r of [units, instances, configs, pending, sentToday]) if (r.error) throw r.error;
      const count = (rows: { unit_id: string }[]) =>
        rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.unit_id]: (acc[r.unit_id] || 0) + 1 }), {});
      return {
        units: (units.data || []) as { id: string; name: string }[],
        instances: ((instances.data || []) as any[]).filter(
          (i) => (!i.network || i.network === "whatsapp") && i.provider !== "instagram" && i.provider !== "messenger",
        ) as { id: string; name: string; unit_id: string | null }[],
        configs: (configs.data || []) as TodooAutoUnit[],
        pending: count(pending.data),
        sentToday: count(sentToday.data),
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (data.units.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma unidade cadastrada.</p>;
  }

  return (
    <div className="space-y-2">
      {data.units.map((u) => (
        <UnitCard
          key={u.id}
          unit={u}
          config={data.configs.find((c) => c.unit_id === u.id)}
          instances={data.instances.filter((i) => i.unit_id === u.id)}
          pending={data.pending[u.id] || 0}
          sentToday={data.sentToday[u.id] || 0}
        />
      ))}
      <p className="text-[10px] text-muted-foreground">
        Horários de Brasília. Ao ligar, os cards vencidos da unidade entram na fila e saem um por vez, no intervalo.
      </p>
    </div>
  );
}

function UnitCard({
  unit,
  config,
  instances,
  pending,
  sentToday,
}: {
  unit: { id: string; name: string };
  config: TodooAutoUnit | undefined;
  instances: { id: string; name: string }[];
  pending: number;
  sentToday: number;
}) {
  const { activeCompanyId } = useActiveCompany();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<UnitDraft>(() => toDraft(config));
  const [saving, setSaving] = useState(false);
  const saved = useMemo(() => toDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => setDraft(saved), [saved]);

  const save = async (next: UnitDraft) => {
    if (!activeCompanyId) return;
    const min = Number(next.intervalMin.replace(",", "."));
    const max = Number(next.intervalMax.replace(",", "."));
    const limit = next.dailyLimit.trim() ? Number(next.dailyLimit) : null;
    if (next.enabled && !next.instanceId) {
      toast.error("Escolha o número de WhatsApp do envio automático.");
      return;
    }
    if (!(min >= 0.5) || !(max >= min)) {
      toast.error("Intervalo inválido: mínimo de 0,5 min e o máximo não pode ser menor que o mínimo.");
      return;
    }
    if (next.windowEnd <= next.windowStart) {
      toast.error("O horário final precisa ser depois do inicial.");
      return;
    }
    if (next.weekdays.length === 0) {
      toast.error("Escolha ao menos um dia da semana.");
      return;
    }
    if (limit !== null && !(limit > 0)) {
      toast.error("Limite diário inválido.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase.from("todoo_auto_units") as any).upsert(
        {
          unit_id: unit.id,
          company_id: activeCompanyId,
          enabled: next.enabled,
          instance_id: next.instanceId || null,
          interval_min_seconds: Math.round(min * 60),
          interval_max_seconds: Math.round(max * 60),
          window_start: next.windowStart,
          window_end: next.windowEnd,
          weekdays: [...next.weekdays].sort(),
          daily_limit: limit,
          enabled_at: next.enabled && !config?.enabled ? new Date().toISOString() : config?.enabled_at ?? null,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "unit_id" },
      );
      if (error) throw error;
      toast.success(
        next.enabled && !config?.enabled
          ? `Envio automático ligado em ${unit.name}`
          : !next.enabled && config?.enabled
            ? `Envio automático desligado em ${unit.name}`
            : "Configuração salva",
      );
      queryClient.invalidateQueries({ queryKey: ["todoo-auto-units", activeCompanyId] });
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = (enabled: boolean) => {
    if (enabled && !window.confirm(
      `Ligar o envio automático em ${unit.name}? Os cards vencidos desta unidade entram na fila e as mensagens começam a sair.`,
    )) return;
    // Salva junto o que estiver editado; se não passar na validação, nada muda
    save({ ...draft, enabled });
  };

  return (
    <div className={cn("space-y-2.5 rounded-lg border bg-card p-3", draft.enabled && "border-emerald-500/50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{unit.name}</span>
        {config?.enabled && (
          <span className="text-[10px] text-muted-foreground">
            {pending} na fila · {sentToday} enviadas hoje
            {config.next_send_at && new Date(config.next_send_at).getTime() > Date.now()
              ? ` · próxima ${formatDistanceToNow(new Date(config.next_send_at), { locale: ptBR, addSuffix: true })}`
              : ""}
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs">
          {config?.enabled ? "Ligado" : "Desligado"}
          <Switch checked={!!config?.enabled} disabled={saving} onCheckedChange={toggleEnabled} />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Número de WhatsApp</Label>
          {instances.length === 0 ? (
            <p className="text-[11px] text-destructive">Nenhum número conectado nesta unidade.</p>
          ) : (
            <Select value={draft.instanceId} onValueChange={(v) => setDraft({ ...draft, instanceId: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Escolha o número..." />
              </SelectTrigger>
              <SelectContent>
                {instances.map((i) => (
                  <SelectItem key={i.id} value={i.id} className="text-xs">
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Intervalo entre contatos (minutos)</Label>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              inputMode="decimal"
              value={draft.intervalMin}
              onChange={(e) => setDraft({ ...draft, intervalMin: e.target.value })}
              className="h-8 w-16 text-xs"
            />
            a
            <Input
              inputMode="decimal"
              value={draft.intervalMax}
              onChange={(e) => setDraft({ ...draft, intervalMax: e.target.value })}
              className="h-8 w-16 text-xs"
            />
            <span className="text-[10px]">sorteado a cada envio</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Horário</Label>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              type="time"
              value={draft.windowStart}
              onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })}
              className="h-8 w-24 text-xs"
            />
            às
            <Input
              type="time"
              value={draft.windowEnd}
              onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })}
              className="h-8 w-24 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Dias e limite por dia</Label>
          <div className="flex flex-wrap items-center gap-1">
            {TODOO_AUTO_WEEKDAYS.map((d) => {
              const on = draft.weekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  title={d.label}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      weekdays: on ? draft.weekdays.filter((w) => w !== d.value) : [...draft.weekdays, d.value],
                    })
                  }
                  className={cn(
                    "h-7 w-7 rounded-md border text-[11px] font-medium",
                    on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.short}
                </button>
              );
            })}
            <Input
              inputMode="numeric"
              value={draft.dailyLimit}
              onChange={(e) => setDraft({ ...draft, dailyLimit: e.target.value.replace(/\D/g, "") })}
              placeholder="Sem limite"
              className="ml-1 h-7 w-24 text-xs"
              title="Máximo de mensagens por dia nesta unidade"
            />
          </div>
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
            Desfazer
          </Button>
          <Button type="button" size="sm" onClick={() => save(draft)} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

interface QueueRow {
  id: string;
  status: TodooAutoQueueStatus;
  reason: string | null;
  scheduled_for: string;
  created_at: string;
  finished_at: string | null;
  attempts: number;
  content_sent: string | null;
  unit: { name: string } | null;
  lead: { contact_name: string; contact_phone: string } | null;
  to_stage: { name: string } | null;
}

function QueueTab() {
  const { activeCompanyId } = useActiveCompany();
  const [status, setStatus] = useState<"all" | TodooAutoQueueStatus>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["todoo-auto-queue", activeCompanyId, status],
    enabled: !!activeCompanyId,
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = (supabase.from("todoo_auto_queue") as any)
        .select(
          "id, status, reason, scheduled_for, created_at, finished_at, attempts, content_sent, unit:units(name), lead:todoo_leads(contact_name, contact_phone), to_stage:todoo_stages!todoo_auto_queue_to_stage_id_fkey(name)",
        )
        .eq("company_id", activeCompanyId)
        .order(status === "pending" ? "scheduled_for" : "created_at", { ascending: status === "pending" })
        .limit(200);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as QueueRow[];
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
            {(Object.keys(TODOO_AUTO_STATUS) as TodooAutoQueueStatus[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {TODOO_AUTO_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">Últimos 200 · atualiza a cada 30s</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
          Nada na fila.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((r) => {
            const meta = TODOO_AUTO_STATUS[r.status];
            const when = r.finished_at || (r.status === "pending" ? r.scheduled_for : r.created_at);
            return (
              <div key={r.id} className="flex items-start gap-2 p-2 text-xs">
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", meta.className)}>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{r.lead?.contact_name || "Card removido"}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatTodooPhone(r.lead?.contact_phone)} · {r.to_stage?.name} · {r.unit?.name}
                    </span>
                  </p>
                  {(r.reason || r.content_sent) && (
                    <p className="truncate text-[10px] text-muted-foreground" title={r.reason || r.content_sent || ""}>
                      {r.reason || r.content_sent}
                    </p>
                  )}
                </div>
                <span
                  className="shrink-0 text-[10px] text-muted-foreground"
                  title={format(new Date(when), "dd/MM/yyyy HH:mm")}
                >
                  {format(new Date(when), "dd/MM HH:mm")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
