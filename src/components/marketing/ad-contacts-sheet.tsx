/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Search,
  MessageSquare,
  ExternalLink,
  DollarSign,
  Trophy,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAdContactsAction, type MarketingAdItem, type MarketingAdContact } from "@/lib/api/marketing.functions";

interface AdContactsSheetProps {
  ad: MarketingAdItem | null;
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  unitId?: string | null;
}

export function AdContactsSheet({
  ad,
  isOpen,
  onClose,
  companyId,
  unitId,
}: AdContactsSheetProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["marketing-ad-contacts", companyId, ad?.source_id, unitId],
    queryFn: async () => {
      if (!ad?.source_id) return [];
      return await getAdContactsAction({
        data: {
          companyId,
          sourceId: ad.source_id,
          unitId: unitId || null,
          limit: 200,
          offset: 0,
        },
      });
    },
    enabled: isOpen && !!ad?.source_id && !!companyId,
  });

  const filteredContacts = React.useMemo(() => {
    if (!contacts) return [];
    if (!search.trim()) return contacts;
    const term = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.contact_name?.toLowerCase().includes(term) ||
        c.contact_phone?.includes(term) ||
        c.unit_name?.toLowerCase().includes(term),
    );
  }, [contacts, search]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val || 0);
  };

  const handleOpenConversation = (conversationId: string | null) => {
    if (!conversationId) return;
    onClose();
    navigate({
      to: "/conversations",
      search: (prev: any) => ({ ...prev, id: conversationId }),
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col bg-background">
        {/* Header com miniatura do anúncio */}
        <SheetHeader className="p-5 border-b bg-muted/20">
          <div className="flex items-start gap-3">
            {ad?.thumbnail_url ? (
              <img
                src={ad.thumbnail_url}
                alt={ad.ad_title || "Criativo"}
                className="w-14 h-14 rounded-lg object-cover border shadow-sm shrink-0 bg-muted"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border">
                <Users className="w-6 h-6 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                  {ad?.source_app || "Instagram / FB"}
                </Badge>
                {ad?.source_id && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    ID: {ad.source_id}
                  </span>
                )}
              </div>
              <SheetTitle className="text-base font-semibold leading-snug line-clamp-2 mt-1">
                {ad?.ad_title || "Anúncio sem título"}
              </SheetTitle>
              {ad?.campaign_name && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Campanha: <span className="font-medium text-foreground">{ad.campaign_name}</span>
                </p>
              )}
            </div>
          </div>

          {/* Mini cards de resumo */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t">
            <div className="bg-background/80 p-2.5 rounded-md border text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">Leads</span>
              <span className="text-base font-bold text-foreground">{ad?.leads_count || 0}</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40 text-center">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block">Vendas</span>
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">{ad?.won_count || 0}</span>
            </div>
            <div className="bg-sky-50 dark:bg-sky-950/20 p-2.5 rounded-md border border-sky-200/50 dark:border-sky-800/40 text-center">
              <span className="text-[10px] text-sky-600 dark:text-sky-400 uppercase font-bold block">Receita</span>
              <span className="text-sm font-bold text-sky-700 dark:text-sky-300">{formatCurrency(ad?.won_revenue || 0)}</span>
            </div>
          </div>
        </SheetHeader>

        {/* Barra de pesquisa */}
        <div className="p-4 border-b bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm h-9"
            />
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-border/40">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="pt-2 flex items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-medium">Nenhum contato encontrado</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                {search ? "Tente buscar com outro termo." : "Este anúncio ainda não possui contatos registrados."}
              </p>
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.lead_id}
                className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 hover:bg-muted/40 p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {contact.contact_name || "Contato sem nome"}
                    </span>
                    {contact.unit_name && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        <Building2 className="w-2.5 h-2.5 mr-1" />
                        {contact.unit_name}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>{contact.contact_phone || "Sem telefone"}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {contact.lead_created_at
                        ? format(new Date(contact.lead_created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : "Data desc."}
                    </span>
                  </div>

                  {/* Status no CRM */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {contact.opportunity_status === "won" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] h-5 gap-1">
                        <Trophy className="w-3 h-3" />
                        Venda Ganha • {formatCurrency(contact.opportunity_value)}
                      </Badge>
                    ) : contact.opportunity_status === "lost" ? (
                      <Badge variant="outline" className="text-rose-600 dark:text-rose-400 border-rose-300 text-[10px] h-5 gap-1">
                        <XCircle className="w-3 h-3" />
                        Perdida
                      </Badge>
                    ) : contact.opportunity_status === "open" ? (
                      <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 text-[10px] h-5 gap-1">
                        <Clock className="w-3 h-3" />
                        Em Negociação
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Sem oportunidade criada
                      </span>
                    )}
                  </div>
                </div>

                {/* Botão para abrir conversa */}
                {contact.conversation_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 shrink-0 text-xs text-primary hover:bg-primary/10"
                    onClick={() => handleOpenConversation(contact.conversation_id)}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Conversar</span>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
