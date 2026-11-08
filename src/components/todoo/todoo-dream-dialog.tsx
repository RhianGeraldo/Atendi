import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Calendar, Target, Heart, Check, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { toast } from "sonner";
import { triggerConfetti, formatCurrency } from "./todoo-dreams";
import type { TodooDream } from "@/types/todoo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dreamToEdit?: TodooDream | null;
  targetUserId?: string;
  onSuccess?: () => void;
}

const QUICK_IMAGE_PRESETS = [
  {
    label: "Bolsa",
    emoji: "👜",
    url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80",
  },
  {
    label: "Viagem",
    emoji: "✈️",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80",
  },
  {
    label: "Jantar",
    emoji: "🍷",
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
  },
  {
    label: "Tênis",
    emoji: "👟",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
  },
  {
    label: "Celular",
    emoji: "📱",
    url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
  },
];

export function TodooDreamDialog({
  open,
  onOpenChange,
  dreamToEdit,
  targetUserId,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const queryClient = useQueryClient();

  // Helper local para obter data YYYY-MM-DD no fuso local do usuário
  const getLocalDateStr = (d = new Date()) => {
    return d.toLocaleDateString("en-CA");
  };

  const todayStr = getLocalDateStr();
  const firstDayOfMonthStr = `${todayStr.slice(0, 7)}-01`;

  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState<number | "">(300);
  const [imageUrl, setImageUrl] = useState("");
  const [startedAt, setStartedAt] = useState(firstDayOfMonthStr);
  const [saving, setSaving] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);

  // Busca comissão padrão configurada pela gerência
  const { data: companyCommission = 5 } = useQuery({
    queryKey: ["todoo-dream-company-commission", activeCompanyId],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from("todoo_dream_settings") as any)
        .select("commission_rate")
        .eq("company_id", activeCompanyId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao buscar comissão da empresa:", error);
      }
      return Number(data?.commission_rate) || 5;
    },
  });

  const effectiveCommission = dreamToEdit?.commission_rate || companyCommission;

  useEffect(() => {
    if (dreamToEdit) {
      setTitle(dreamToEdit.title);
      setTargetValue(dreamToEdit.target_value);
      setImageUrl(dreamToEdit.image_url || "");
      const d = dreamToEdit.started_at ? dreamToEdit.started_at.split("T")[0] : todayStr;
      setStartedAt(d);
      setShowCustomDate(d !== firstDayOfMonthStr && d !== todayStr);
    } else {
      setTitle("");
      setTargetValue(300);
      setImageUrl(QUICK_IMAGE_PRESETS[0].url);
      setStartedAt(firstDayOfMonthStr);
      setShowCustomDate(false);
    }
  }, [dreamToEdit, open]);

  const numValue = Number(targetValue) || 0;
  const requiredSales = effectiveCommission > 0 ? numValue / (effectiveCommission / 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveUserId = targetUserId || user?.id;
    if (!effectiveUserId || !activeCompanyId) {
      toast.error("Usuário ou empresa não identificados.");
      return;
    }
    if (!title.trim()) {
      toast.error("Informe o nome do seu sonho.");
      return;
    }
    if (numValue <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    setSaving(true);
    try {
      if (dreamToEdit) {
        const { error } = await (supabase.from("todoo_dreams") as any)
          .update({
            title: title.trim(),
            target_value: numValue,
            commission_rate: effectiveCommission,
            image_url: imageUrl.trim() || null,
            started_at: startedAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", dreamToEdit.id);

        if (error) throw error;
        toast.success("Sonho atualizado com sucesso!");
      } else {
        // Verifica se o usuário já tem algum sonho em foco
        const { data: existingFeatured } = await (supabase.from("todoo_dreams") as any)
          .select("id")
          .eq("company_id", activeCompanyId)
          .eq("user_id", effectiveUserId)
          .eq("status", "in_progress")
          .eq("is_featured", true)
          .limit(1)
          .maybeSingle();

        const shouldBeFeatured = !existingFeatured;

        const { error } = await (supabase.from("todoo_dreams") as any).insert({
          company_id: activeCompanyId,
          unit_id: selectedUnitId || null,
          user_id: effectiveUserId,
          title: title.trim(),
          target_value: numValue,
          commission_rate: effectiveCommission,
          category: "outro",
          image_url: imageUrl.trim() || null,
          started_at: startedAt,
          status: "in_progress",
          is_featured: shouldBeFeatured,
        });

        if (error) throw error;
        triggerConfetti();
        toast.success("✨ Sonho fixado no seu mural! Boas vendas!");
      }

      await queryClient.invalidateQueries({ queryKey: ["todoo-dreams"] });
      await queryClient.invalidateQueries({ queryKey: ["todoo-active-dream"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Erro ao salvar sonho:", err);
      toast.error(err?.message || "Erro ao salvar sonho.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-3xl overflow-hidden border border-pink-500/20">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {dreamToEdit ? "Editar Sonho" : "Meu Novo Sonho"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Defina o que você quer conquistar com suas vendas no Todoo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Nome do Sonho */}
          <div className="space-y-1.5">
            <Label htmlFor="dream-title" className="text-xs font-bold text-foreground">
              O que você quer conquistar? *
            </Label>
            <Input
              id="dream-title"
              placeholder="Ex: Bolsa Schutz, Viagem pra Praia, Jantar Especial..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 text-sm rounded-xl"
              autoFocus
              required
            />
          </div>

          {/* Valor do Sonho */}
          <div className="space-y-1.5">
            <Label htmlFor="dream-value" className="text-xs font-bold text-foreground">
              Quanto custa? (R$) *
            </Label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                R$
              </span>
              <Input
                id="dream-value"
                type="number"
                step="0.01"
                min="1"
                placeholder="300,00"
                value={targetValue}
                onChange={(e) =>
                  setTargetValue(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="h-11 pl-10 text-base font-black text-pink-600 dark:text-pink-400 rounded-xl"
                required
              />
            </div>
          </div>

          {/* Imagem do Sonho com Prévia e Presets */}
          <div className="space-y-2">
            <Label htmlFor="dream-image" className="text-xs font-bold text-foreground">
              Foto do Sonho
            </Label>
            <div className="flex gap-3 items-center">
              {/* Prévia da Foto */}
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 border-2 border-pink-500/20 bg-muted flex items-center justify-center shadow-xs">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Prévia"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Heart className="w-6 h-6 text-pink-400/50" />
                )}
              </div>

              {/* Input e Chips Rápidos */}
              <div className="flex-1 space-y-1.5">
                <Input
                  id="dream-image"
                  placeholder="Cole o link da foto do produto ou loja..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />

                {/* Chips com ícones */}
                <div className="flex flex-wrap gap-1">
                  {QUICK_IMAGE_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setImageUrl(p.url)}
                      className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 ${
                        imageUrl === p.url
                          ? "bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30 font-bold shadow-xs scale-105"
                          : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                      }`}
                    >
                      <span>{p.emoji}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Contagem das Vendas */}
          <div className="space-y-2 pt-1">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Contagem das Vendas
            </Label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/80">
              <button
                type="button"
                onClick={() => {
                  setStartedAt(firstDayOfMonthStr);
                  setShowCustomDate(false);
                }}
                className={`text-xs py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  startedAt === firstDayOfMonthStr && !showCustomDate
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Início do Mês
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartedAt(todayStr);
                  setShowCustomDate(false);
                }}
                className={`text-xs py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  startedAt === todayStr && !showCustomDate
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setShowCustomDate(true)}
                className={`text-xs py-1.5 px-2 rounded-lg font-semibold transition-all ${
                  showCustomDate
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Outra Data
              </button>
            </div>

            {showCustomDate && (
              <Input
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className="h-9 text-xs rounded-xl mt-1.5"
              />
            )}
          </div>

          {/* Cartão de Simulação Gamificado */}
          <div className="rounded-2xl border border-pink-500/25 bg-gradient-to-r from-pink-500/10 via-purple-500/5 to-amber-500/5 p-3.5 flex items-center justify-between gap-3 shadow-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground block">
                Comissão da equipe: <strong>{effectiveCommission}%</strong>
              </span>
              <span className="text-xs font-extrabold text-foreground block">
                Meta para realizar:
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-black text-pink-600 dark:text-pink-400 block tracking-tight">
                {formatCurrency(requiredSales)}
              </span>
              <span className="text-[10px] text-muted-foreground">em vendas no CRM</span>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-xl text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white gap-2 shadow-sm rounded-xl text-xs h-9 font-semibold"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {dreamToEdit ? "Salvar Alterações" : "Fixar no Meu Mural"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
