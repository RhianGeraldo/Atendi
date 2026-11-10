/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp,
  Search,
  Filter,
  Users,
  DollarSign,
  Trophy,
  ExternalLink,
  RefreshCw,
  Eye,
  Percent,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  Instagram,
  Facebook,
  MessageCircle,
  HelpCircle,
  Clock,
  ArrowUpRight,
  Maximize2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProtectedMenuRoute } from "@/components/auth/protected-menu-route";
import { useActiveCompany } from "@/lib/active-company-context";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import {
  getMarketingAnalyticsAction,
  type MarketingAdItem,
} from "@/lib/api/marketing.functions";
import { AdContactsSheet } from "@/components/marketing/ad-contacts-sheet";

export const Route = createFileRoute("/_authenticated/marketing")({
  component: () => (
    <ProtectedMenuRoute menuKey="marketing">
      <MarketingPage />
    </ProtectedMenuRoute>
  ),
});

function MarketingPage() {
  const { activeCompanyId } = useActiveCompany();
  const { units } = useAccessibleUnits();

  // Filtros
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "leads" | "won" | "conversion">("revenue");

  // Anúncio selecionado para a Sheet de contatos
  const [selectedAdForContacts, setSelectedAdForContacts] = useState<MarketingAdItem | null>(null);
  // Anúncio selecionado para o modal de prévia em alta resolução
  const [previewAd, setPreviewAd] = useState<MarketingAdItem | null>(null);

  // Calcula datas a partir do período selecionado
  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodFilter === "today") {
      return {
        start: startOfDay(now).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    }
    if (periodFilter === "7d") {
      return {
        start: startOfDay(subDays(now, 7)).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    }
    if (periodFilter === "30d") {
      return {
        start: startOfDay(subDays(now, 30)).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    }
    if (periodFilter === "90d") {
      return {
        start: startOfDay(subDays(now, 90)).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    }
    return { start: null, end: null };
  }, [periodFilter]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: [
      "marketing-analytics",
      activeCompanyId,
      unitFilter,
      platformFilter,
      dateRange.start,
      dateRange.end,
    ],
    queryFn: async () => {
      if (!activeCompanyId) return { kpis: null, ads: [] };
      return await getMarketingAnalyticsAction({
        data: {
          companyId: activeCompanyId,
          unitId: unitFilter !== "all" ? unitFilter : null,
          sourceApp: platformFilter !== "all" ? platformFilter : null,
          startDate: dateRange.start,
          endDate: dateRange.end,
        },
      });
    },
    enabled: !!activeCompanyId,
    staleTime: 1000 * 60 * 3, // 3 min
  });

  const kpis = data?.kpis || {
    total_leads: 0,
    total_opportunities: 0,
    total_won_deals: 0,
    total_won_revenue: 0,
    conversion_rate: 0,
    ticket_medio: 0,
  };

  // Filtra e ordena anúncios
  const sortedAds = useMemo(() => {
    let list = data?.ads || [];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (ad) =>
          ad.ad_title?.toLowerCase().includes(term) ||
          ad.ad_body?.toLowerCase().includes(term) ||
          ad.source_id?.includes(term) ||
          ad.campaign_name?.toLowerCase().includes(term),
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "revenue") return (b.won_revenue || 0) - (a.won_revenue || 0);
      if (sortBy === "leads") return (b.leads_count || 0) - (a.leads_count || 0);
      if (sortBy === "won") return (b.won_count || 0) - (a.won_count || 0);
      if (sortBy === "conversion") return (b.conversion_rate || 0) - (a.conversion_rate || 0);
      return 0;
    });
  }, [data?.ads, searchTerm, sortBy]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val || 0);
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 pb-20">
      {/* Barra de Filtros & Ações */}
      <Card className="border shadow-xs bg-card/60 backdrop-blur-xs">
        <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            {/* Período */}
            <div className="flex items-center gap-1.5 min-w-[130px]">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="h-8.5 text-xs font-medium">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo o Período</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Unidade */}
            {units && units.length > 0 && (
              <div className="flex items-center gap-1.5 min-w-[140px]">
                <Select value={unitFilter} onValueChange={setUnitFilter}>
                  <SelectTrigger className="h-8.5 text-xs font-medium">
                    <SelectValue placeholder="Todas as Unidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Unidades</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Plataforma */}
            <div className="flex items-center gap-1.5 min-w-[140px]">
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="h-8.5 text-xs font-medium">
                  <SelectValue placeholder="Plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Instagram & Facebook</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Busca por texto */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtrar por título, texto ou ID do criativo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8.5 text-xs h-8.5"
              />
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-1.5 min-w-[150px]">
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-8.5 text-xs font-medium">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Maior Faturamento (R$)</SelectItem>
                  <SelectItem value="leads">Mais Leads</SelectItem>
                  <SelectItem value="won">Mais Vendas Ganhas</SelectItem>
                  <SelectItem value="conversion">Maior Taxa de Conversão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botão de atualização */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8.5 gap-1.5 text-xs cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </Button>
        </CardContent>
      </Card>

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Leads */}
        <Card className="border shadow-xs bg-card hover:border-primary/30 transition-colors">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Leads de Anúncio
            </CardTitle>
            <Users className="w-4 h-4 text-sky-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {kpis.total_leads.toLocaleString("pt-BR")}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Contatos únicos captados
            </p>
          </CardContent>
        </Card>

        {/* Oportunidades CRM */}
        <Card className="border shadow-xs bg-card hover:border-primary/30 transition-colors">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Oportunidades
            </CardTitle>
            <MessageCircle className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {kpis.total_opportunities.toLocaleString("pt-BR")}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Entraram no funil de vendas
            </p>
          </CardContent>
        </Card>

        {/* Vendas Ganhas */}
        <Card className="border shadow-xs bg-card hover:border-emerald-500/40 transition-colors bg-gradient-to-br from-card to-emerald-500/5">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Vendas Ganhas
            </CardTitle>
            <Trophy className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              {kpis.total_won_deals.toLocaleString("pt-BR")}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Clientes fechados
            </p>
          </CardContent>
        </Card>

        {/* Faturamento Gerado */}
        <Card className="border shadow-xs bg-card hover:border-emerald-500/40 transition-colors bg-gradient-to-br from-card to-emerald-500/10">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Faturamento
            </CardTitle>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 truncate">
              {formatCurrency(kpis.total_won_revenue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Receita direta confirmada
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border shadow-xs bg-card hover:border-primary/30 transition-colors">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Conversão
            </CardTitle>
            <Percent className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {kpis.conversion_rate.toFixed(1)}%
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Leads ➔ Vendas ganhas
            </p>
          </CardContent>
        </Card>

        {/* Ticket Médio */}
        <Card className="border shadow-xs bg-card hover:border-primary/30 transition-colors">
          <CardHeader className="p-3.5 pb-1 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ticket Médio
            </CardTitle>
            <Sparkles className="w-4 h-4 text-violet-500" />
          </CardHeader>
          <CardContent className="p-3.5 pt-1">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {formatCurrency(kpis.ticket_medio)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Média por venda ganha
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seção Principal: Galeria de Criativos & Tabela */}
      <Tabs defaultValue="gallery" className="w-full space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Performance por Anúncio Criativo
            </h2>
            <p className="text-xs text-muted-foreground">
              {sortedAds.length} criativos ativos com tráfego e leads registrados
            </p>
          </div>

          <TabsList className="h-9">
            <TabsTrigger value="gallery" className="text-xs gap-1.5 cursor-pointer">
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Galeria de Criativos</span>
            </TabsTrigger>
            <TabsTrigger value="table" className="text-xs gap-1.5 cursor-pointer">
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela Comparativa</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Galeria de Criativos */}
        <TabsContent value="gallery" className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="h-72 animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : sortedAds.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Users className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-3" />
              <h3 className="text-base font-semibold">Nenhum anúncio encontrado</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Não foram encontrados leads para os filtros selecionados. Tente expandir o período ou alterar a unidade.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedAds.map((ad) => {
                const isInstagram = ad.source_app?.toLowerCase() === "instagram";
                return (
                  <Card
                    key={ad.source_id}
                    className="border shadow-xs hover:border-primary/40 hover:shadow-md transition-all flex flex-col overflow-hidden group bg-card"
                  >
                    {/* Imagem / Header do Card */}
                    <div
                      className="relative h-60 sm:h-64 w-full bg-muted/20 dark:bg-muted/10 overflow-hidden border-b flex items-center justify-center p-2.5 group/img cursor-pointer select-none"
                      onClick={() => setPreviewAd(ad)}
                      title="Clique para ampliar o criativo"
                    >
                      {ad.thumbnail_url ? (
                        <>
                          {/* Ambient background blur */}
                          <div
                            className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-40 dark:opacity-25 scale-125 pointer-events-none transition-transform duration-500 group-hover/img:scale-150"
                            style={{ backgroundImage: `url(${ad.thumbnail_url})` }}
                          />

                          {/* Imagem do criativo centralizada e nítida */}
                          <img
                            src={ad.thumbnail_url}
                            alt={ad.ad_title || "Criativo"}
                            className="relative z-10 max-h-full max-w-full rounded-md object-contain shadow-sm transition-transform duration-300 group-hover/img:scale-[1.03]"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-muted gap-2 text-muted-foreground/40">
                          <ImageIcon className="w-10 h-10" />
                          <span className="text-xs">Sem prévia</span>
                        </div>
                      )}

                      {/* Badge da Plataforma */}
                      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase font-bold tracking-wider backdrop-blur-md bg-background/85 shadow-xs border flex items-center gap-1 text-foreground"
                        >
                          {isInstagram ? (
                            <Instagram className="w-3 h-3 text-pink-600 shrink-0" />
                          ) : (
                            <Facebook className="w-3 h-3 text-blue-600 shrink-0" />
                          )}
                          <span>{ad.source_app || "Instagram"}</span>
                        </Badge>
                      </div>

                      {/* Botões de Ação no Topo Direito: Zoom e Link Externo */}
                      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewAd(ad);
                          }}
                          className="p-1.5 rounded-md bg-background/85 backdrop-blur-md hover:bg-background border shadow-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Ampliar criativo"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>

                        {ad.source_url && (
                          <a
                            href={ad.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-md bg-background/85 backdrop-blur-md hover:bg-background border shadow-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title="Ver anúncio/post original no Instagram ou Facebook"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Badge de Faturamento em Destaque no Criativo */}
                      {ad.won_revenue > 0 && (
                        <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none">
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md border-0">
                            {formatCurrency(ad.won_revenue)}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Conteúdo do Card */}
                    <CardContent className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
                          <span>ID: {ad.source_id}</span>
                          {ad.campaign_name && (
                            <span className="truncate max-w-[150px] font-sans font-medium text-foreground">
                              {ad.campaign_name}
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold text-sm text-foreground mt-1 line-clamp-1 group-hover:text-primary transition-colors">
                          {ad.ad_title || "Criativo sem título"}
                        </h3>

                        {ad.ad_body && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {ad.ad_body}
                          </p>
                        )}
                      </div>

                      {/* Métricas do Anúncio */}
                      <div className="mt-4 pt-3 border-t space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-muted/40 p-2 rounded-md">
                            <span className="text-[10px] text-muted-foreground block font-medium">Leads</span>
                            <span className="text-sm font-bold text-foreground">{ad.leads_count}</span>
                          </div>
                          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-md border border-emerald-200/40 dark:border-emerald-800/30">
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">Vendas</span>
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{ad.won_count}</span>
                          </div>
                          <div className="bg-sky-50 dark:bg-sky-950/20 p-2 rounded-md border border-sky-200/40 dark:border-sky-800/30">
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 block font-medium">Conv.</span>
                            <span className="text-sm font-bold text-sky-700 dark:text-sky-400">{ad.conversion_rate.toFixed(1)}%</span>
                          </div>
                        </div>

                        {/* Botão para abrir os contatos */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs gap-1.5 h-8.5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors cursor-pointer"
                          onClick={() => setSelectedAdForContacts(ad)}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Ver {ad.leads_count} Contatos deste Criativo</span>
                          <ArrowUpRight className="w-3.5 h-3.5 ml-auto opacity-70" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Tabela Comparativa */}
        <TabsContent value="table" className="space-y-4">
          <Card className="border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[320px]">Criativo / Anúncio</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Oportunidades</TableHead>
                    <TableHead className="text-right">Vendas Ganhas</TableHead>
                    <TableHead className="text-right font-bold">Faturamento (R$)</TableHead>
                    <TableHead className="text-right">Conversão (%)</TableHead>
                    <TableHead className="text-right">Ticket Médio</TableHead>
                    <TableHead className="text-center w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9} className="h-14 animate-pulse bg-muted/20" />
                      </TableRow>
                    ))
                  ) : sortedAds.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                        Nenhum criativo encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedAds.map((ad) => (
                      <TableRow key={ad.source_id} className="hover:bg-muted/30">
                        {/* Imagem + Título */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {ad.thumbnail_url ? (
                              <button
                                type="button"
                                onClick={() => setPreviewAd(ad)}
                                className="relative w-11 h-11 rounded-md overflow-hidden border shrink-0 bg-muted/40 cursor-pointer group/thumb hover:ring-2 hover:ring-primary/50 transition-all flex items-center justify-center"
                                title="Clique para ampliar o criativo"
                              >
                                <img
                                  src={ad.thumbnail_url}
                                  alt={ad.ad_title}
                                  className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-200"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white">
                                  <Eye className="w-4 h-4" />
                                </div>
                              </button>
                            ) : (
                              <div className="w-11 h-11 rounded-md bg-muted flex items-center justify-center shrink-0 border">
                                <Users className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-xs text-foreground line-clamp-1" title={ad.ad_title}>
                                {ad.ad_title || "Criativo sem título"}
                              </p>
                              <span className="text-[10px] text-muted-foreground font-mono block">
                                ID: {ad.source_id}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Plataforma */}
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                            {ad.source_app || "Instagram"}
                          </Badge>
                        </TableCell>

                        {/* Leads */}
                        <TableCell className="text-right font-medium text-xs">
                          {ad.leads_count}
                        </TableCell>

                        {/* Oportunidades */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {ad.opportunities_count}
                        </TableCell>

                        {/* Vendas */}
                        <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {ad.won_count}
                        </TableCell>

                        {/* Faturamento */}
                        <TableCell className="text-right text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(ad.won_revenue)}
                        </TableCell>

                        {/* Conversão */}
                        <TableCell className="text-right text-xs font-semibold">
                          {ad.conversion_rate.toFixed(1)}%
                        </TableCell>

                        {/* Ticket Médio */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatCurrency(ad.ticket_medio)}
                        </TableCell>

                        {/* Ações */}
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-primary hover:bg-primary/10 cursor-pointer"
                            onClick={() => setSelectedAdForContacts(ad)}
                          >
                            <Users className="w-3.5 h-3.5 mr-1" />
                            <span>Contatos</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sheet de Contatos do Anúncio */}
      <AdContactsSheet
        ad={selectedAdForContacts}
        isOpen={!!selectedAdForContacts}
        onClose={() => setSelectedAdForContacts(null)}
        companyId={activeCompanyId || ""}
        unitId={unitFilter !== "all" ? unitFilter : null}
      />

      {/* Modal de Prévia em Alta Resolução do Criativo */}
      <Dialog open={!!previewAd} onOpenChange={(open) => !open && setPreviewAd(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background border shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Lado Esquerdo: Imagem Completa em Alta Resolução */}
            <div className="relative bg-muted/30 min-h-[300px] max-h-[520px] flex items-center justify-center p-4 overflow-hidden border-b md:border-b-0 md:border-r">
              {previewAd?.thumbnail_url && (
                <div
                  className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-35 dark:opacity-20 scale-125 pointer-events-none"
                  style={{ backgroundImage: `url(${previewAd.thumbnail_url})` }}
                />
              )}
              {previewAd?.thumbnail_url ? (
                <img
                  src={previewAd.thumbnail_url}
                  alt={previewAd.ad_title || "Criativo"}
                  className="relative z-10 max-h-[460px] max-w-full rounded-lg object-contain shadow-md"
                />
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Sem imagem disponível</p>
                </div>
              )}
            </div>

            {/* Lado Direito: Detalhes, KPIs e Ações */}
            <div className="p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[11px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                    {previewAd?.source_app?.toLowerCase() === "instagram" ? (
                      <Instagram className="w-3.5 h-3.5 text-pink-600" />
                    ) : (
                      <Facebook className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    <span>{previewAd?.source_app || "Instagram"}</span>
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">
                    ID: {previewAd?.source_id}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-base text-foreground leading-snug">
                    {previewAd?.ad_title || "Criativo sem título"}
                  </h3>
                  {previewAd?.ad_body && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-5 whitespace-pre-line leading-relaxed">
                      {previewAd.ad_body}
                    </p>
                  )}
                </div>

                {/* Grid de Métricas do Criativo */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t">
                  <div className="p-2.5 rounded-lg bg-muted/40 border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Leads</span>
                    <span className="text-base font-bold text-foreground">{previewAd?.leads_count || 0}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold block">Faturamento</span>
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(previewAd?.won_revenue || 0)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Conversão</span>
                    <span className="text-base font-bold text-foreground">
                      {previewAd ? ((previewAd.won_count / Math.max(1, previewAd.leads_count)) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Ticket Médio</span>
                    <span className="text-base font-bold text-foreground">
                      {formatCurrency(previewAd?.ticket_medio || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col gap-2 pt-4 border-t mt-4">
                {previewAd?.source_url && (
                  <Button
                    variant="outline"
                    className="w-full text-xs font-semibold justify-center gap-1.5 cursor-pointer"
                    onClick={() => window.open(previewAd.source_url!, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ver no {previewAd.source_app || "Instagram/Facebook"}</span>
                  </Button>
                )}
                <Button
                  className="w-full text-xs font-semibold justify-center gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => {
                    const ad = previewAd;
                    setPreviewAd(null);
                    setSelectedAdForContacts(ad);
                  }}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Ver Leads ({previewAd?.leads_count || 0})</span>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
