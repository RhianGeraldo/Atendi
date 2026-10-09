import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Sparkles,
  Gift,
  CheckCircle2,
  Calendar,
  Clock,
  TrendingUp,
  DollarSign,
  Copy,
  Send,
  Check,
  ChevronDown,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAuth } from "@/lib/auth-context";
import { ConvRow } from "@/components/chat/conversation-types";
import { TodooLead, TodooOutcomeType } from "@/types/todoo";
import { TodooOutcomeDialog } from "./todoo-outcome-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  conv: ConvRow;
}

export function TodooConversationBanner({ conv }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeType, setOutcomeType] = useState<TodooOutcomeType>("won");
  const [scriptPopoverOpen, setScriptPopoverOpen] = useState(false);

  // Busca se este contato possui lead ativo no Todoo
  const { data: todooLead, refetch: refetchLead } = useQuery({
    queryKey: [
      "todoo-active-lead-for-conv",
      conv.contact_id,
      conv.contact?.phone,
      activeCompanyId,
    ],
    enabled: !!activeCompanyId && (!!conv.contact_id || !!conv.contact?.phone),
    queryFn: async () => {
      let query = (supabase.from("todoo_leads") as any)
        .select(`
          *,
          campaign:todoo_campaigns(id, title, type, message_template, offer_details)
        `)
        .eq("company_id", activeCompanyId)
        .not("status", "in", '("won","lost")')
        .order("created_at", { ascending: false })
        .limit(1);

      if (conv.contact_id) {
        query = query.eq("contact_id", conv.contact_id);
      } else if (conv.contact?.phone) {
        const cleanPhone = conv.contact.phone.replace(/\D/g, "");
        query = query.or(
          `contact_phone.ilike.%${cleanPhone}%,contact_phone.eq.${conv.contact.phone}`,
        );
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        console.error("Erro ao buscar lead do Todoo para a conversa:", error);
        return null;
      }
      return data as TodooLead | null;
    },
  });

  if (!todooLead) return null;

  // Renderiza o script com variáveis personalizadas
  const renderScript = (lead: TodooLead) => {
    let template =
      lead.campaign?.message_template ||
      "Olá {nome}! Tudo bem? Gostaria de conversar com você sobre uma condição especial que preparamos.";

    const contactName = conv.contact?.name || lead.contact_name || "Cliente";
    const firstName = contactName.split(" ")[0];
    const custom = lead.custom_fields || {};

    template = template.replace(/\{nome\}/gi, contactName);
    template = template.replace(/\{primeiro_nome\}/gi, firstName);
    template = template.replace(
      /\{saldo\}/gi,
      custom.saldo || custom.saldo_sessoes || "seu saldo de sessões",
    );
    template = template.replace(
      /\{zona\}/gi,
      custom.zona || custom.zonas || "nova área",
    );
    template = template.replace(
      /\{consultora\}/gi,
      profile?.name || "sua consultora",
    );
    template = template.replace(
      /\{voucher\}/gi,
      custom.voucher || "VOUCHER150",
    );

    return template;
  };

  const scriptText = renderScript(todooLead);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    toast.success("Script copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsertInChat = () => {
    window.dispatchEvent(
      new CustomEvent("insert-chat-text", { detail: scriptText }),
    );
    toast.success("Script inserido no campo de mensagem!");
    setScriptPopoverOpen(false);
  };

  const handleOpenOutcome = (type: TodooOutcomeType) => {
    setOutcomeType(type);
    setOutcomeDialogOpen(true);
  };

  return (
    <div className="w-full bg-card/95 border-b border-border/80 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-3 shrink-0 z-10 text-xs">
      {/* Lado Esquerdo: Tag Discreta + Resumo da Oferta */}
      <div className="flex items-center gap-2 min-w-0">
        <Badge
          variant="outline"
          className="text-[11px] font-medium py-0 px-1.5 gap-1 border-primary/30 text-primary bg-primary/5 shrink-0"
        >
          <Target className="h-3 w-3 text-primary" />
          <span>{todooLead.campaign?.title || "Campanha Todoo"}</span>
        </Badge>

        {todooLead.campaign?.offer_details && (
          <span className="text-muted-foreground truncate text-[11px] hidden sm:inline">
            Oferta:{" "}
            <span className="text-foreground font-medium">
              {todooLead.campaign.offer_details}
            </span>
          </span>
        )}
      </div>

      {/* Lado Direito: Apenas 2 Ações Limpas (Script e Menu de Desfecho) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Botão 1: Script */}
        <Popover open={scriptPopoverOpen} onOpenChange={setScriptPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1.5 border-border hover:bg-muted/60"
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Script</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 sm:w-96 p-3 space-y-2.5 text-xs shadow-md"
            align="end"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-border">
              <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Script da Campanha
              </span>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {todooLead.campaign?.title}
              </Badge>
            </div>

            <div className="p-2.5 rounded bg-muted/60 border border-border text-foreground leading-relaxed whitespace-pre-wrap select-all font-sans text-xs">
              {scriptText}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={handleCopyScript}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copiar
                  </>
                )}
              </Button>

              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 bg-primary text-primary-foreground shadow-xs"
                onClick={handleInsertInChat}
              >
                <Send className="h-3 w-3" />
                Inserir no Chat
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Botão 2: Menu Dropdown de Desfecho */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-7 text-xs px-2.5 gap-1 bg-primary text-primary-foreground shadow-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Desfecho</span>
              <ChevronDown className="h-3 w-3 opacity-70 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 text-xs">
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
              Registrar Desfecho
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 cursor-pointer font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-700 focus:bg-emerald-50 dark:focus:bg-emerald-950/40"
              onClick={() => handleOpenOutcome("won")}
            >
              <DollarSign className="h-4 w-4" />
              <span>Fechou Venda! 🎉</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="gap-2 cursor-pointer focus:bg-blue-50 dark:focus:bg-blue-950/40"
              onClick={() => handleOpenOutcome("scheduled")}
            >
              <Calendar className="h-4 w-4 text-blue-500" />
              <span>Agendou Visita 📅</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="gap-2 cursor-pointer focus:bg-indigo-50 dark:focus:bg-indigo-950/40"
              onClick={() => handleOpenOutcome("quoted")}
            >
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              <span>Em Negociação 💬</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="gap-2 cursor-pointer focus:bg-amber-50 dark:focus:bg-amber-950/40"
              onClick={() => handleOpenOutcome("callback")}
            >
              <Clock className="h-4 w-4 text-amber-500" />
              <span>Agendar Retorno ⏰</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="gap-2 cursor-pointer text-muted-foreground focus:text-destructive focus:bg-destructive/10"
              onClick={() => handleOpenOutcome("lost")}
            >
              <XCircle className="h-4 w-4" />
              <span>Não Teve Interesse ❌</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modal de Desfecho Completo */}
      <TodooOutcomeDialog
        lead={todooLead}
        open={outcomeDialogOpen}
        onOpenChange={setOutcomeDialogOpen}
        onSuccess={() => {
          refetchLead();
          queryClient.invalidateQueries({ queryKey: ["todoo-leads"] });
          queryClient.invalidateQueries({ queryKey: ["todoo-metrics"] });
        }}
      />
    </div>
  );
}
