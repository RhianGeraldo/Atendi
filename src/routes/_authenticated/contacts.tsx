import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Phone, Mail, User, UserPlus, Loader2, Building, RefreshCw, ShieldAlert, X, Link, ExternalLink, Image as ImageIcon, Calendar as CalendarIcon, Tag, CheckSquare, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactDetailsSheet } from "@/components/contacts/contact-details-sheet";
import { CreateContactDialog } from "@/components/contacts/create-contact-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Estados para seleção e ações em massa
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [bulkLabelId, setBulkLabelId] = useState("");

  const { data: counts } = useQuery({
    queryKey: ["contacts-counts", activeCompanyId, selectedUnitId, dateRange],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let qTotal = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", activeCompanyId!)
        .eq("is_blocked", false)
        .is("merged_into_id", null);

      let qAds = supabase
        .from("contacts")
        .select("id, ad_leads!inner(id)", { count: "exact", head: true })
        .eq("company_id", activeCompanyId!)
        .eq("is_blocked", false)
        .is("merged_into_id", null);

      let qBlocked = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", activeCompanyId!)
        .eq("is_blocked", true)
        .is("merged_into_id", null);

      if (dateRange?.from) {
        qTotal = qTotal.gte("created_at", dateRange.from.toISOString());
        qAds = qAds.gte("created_at", dateRange.from.toISOString());
        qBlocked = qBlocked.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        qTotal = qTotal.lte("created_at", toDate.toISOString());
        qAds = qAds.lte("created_at", toDate.toISOString());
        qBlocked = qBlocked.lte("created_at", toDate.toISOString());
      }

      const [resTotal, resAds, resBlocked] = await Promise.all([qTotal, qAds, qBlocked]);

      return {
        total: resTotal.count || 0,
        ads: resAds.count || 0,
        blocked: resBlocked.count || 0,
      };
    },
  });

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", activeCompanyId, searchTerm, selectedUnitId, dateRange, activeTab],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // Se não tem unidade selecionada (Empresa Mãe), pega todos os contatos.
      // Se tem unidade, pega apenas os contatos que têm conversas na unidade logada.
      const relation = selectedUnitId ? 'conversations!inner' : 'conversations';
      const adRelation = activeTab === 'ads' ? 'ad_leads!inner' : 'ad_leads';
      
      let query = supabase
        .from("contacts")
        .select(`
          *,
          contact_labels (
            label_id,
            labels ( id, name, color )
          ),
          ${adRelation} (
            id,
            ad_title,
            ad_body,
            source_url,
            thumbnail_url,
            conversion_source,
            source_app,
            created_at
          ),
          ${relation} (
            unit_id,
            units ( name ),
            started_at
          )
        `)
        .eq("company_id", activeCompanyId!)
        .is("merged_into_id", null)
        .order("created_at", { ascending: false });

      if (activeTab === "blocked") {
        query = query.eq("is_blocked", true);
      } else {
        query = query.eq("is_blocked", false);
      }

      if (selectedUnitId) {
        query = query.eq("conversations.unit_id", selectedUnitId);
      }

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      if (dateRange?.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        query = query.lte("created_at", toDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter out groups (WhatsApp group IDs are usually 18 digits, Instagram PSIDs are ~16)
      return data.filter(c => !c.phone || c.phone.length <= 17).map(c => {
        // Sort conversations to get the latest
        const sortedConvs = (c.conversations || []).sort((a: any, b: any) => 
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        );
        const lastConv = sortedConvs[0];

        // Sort ad_leads to get the latest
        const sortedAds = (c.ad_leads || []).sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latestAd = sortedAds[0] || null;

        return {
          ...c,
          last_unit_name: lastConv?.units?.name,
          latest_ad: latestAd,
          has_ad: !!latestAd,
        };
      });
    },
  });

  const allContacts = contacts || [];
  const regularContacts = allContacts.filter((c: any) => !c.is_blocked);
  const blockedContacts = allContacts.filter((c: any) => c.is_blocked);
  const adContactsCount = allContacts.filter((c: any) => c.has_ad).length;

  const filteredContacts = allContacts.filter((contact: any) => {
    // 1. Tab filter (already filtered in query, but extra client check)
    if (activeTab === "blocked") {
      if (!contact.is_blocked) return false;
    } else {
      if (contact.is_blocked) return false;

      if (activeTab === "ads") {
        if (!contact.has_ad) return false;
      }
    }

    // 2. Channel dropdown filter
    if (channelFilter === "whatsapp") {
      if (contact.instagram_username && !contact.phone) return false;
    }
    if (channelFilter === "instagram") {
      if (!contact.instagram_username && !contact.instagram_id) return false;
    }

    // 3. Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const name = (contact.name || "").toLowerCase();
      const phone = (contact.phone || "").toLowerCase();
      const email = (contact.email || "").toLowerCase();
      const insta = (contact.instagram_username || "").toLowerCase();
      const adTitle = (contact.latest_ad?.ad_title || "").toLowerCase();

      if (
        !name.includes(term) &&
        !phone.includes(term) &&
        !email.includes(term) &&
        !insta.includes(term) &&
        !adTitle.includes(term)
      ) {
        return false;
      }
    }

    return true;
  });

  // Consulta etiquetas disponíveis para a ação em massa
  const { data: labels } = useQuery({
    queryKey: ["labels", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labels")
        .select("id, name, color")
        .eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const allVisibleIds = filteredContacts.map((c: any) => c.id);
  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id: string) => selectedContactIds.has(id));
  const isSomeSelected = allVisibleIds.some((id: string) => selectedContactIds.has(id));

  const toggleSelectContact = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(allVisibleIds));
    }
  };

  // Mutação para aplicar etiqueta em massa
  const applyBulkLabel = useMutation({
    mutationFn: async (labelId: string) => {
      if (!labelId) throw new Error("Selecione uma etiqueta");
      const contactIds = Array.from(selectedContactIds);
      if (!contactIds.length) throw new Error("Nenhum contato selecionado");

      const rows = contactIds.map((cId) => ({
        contact_id: cId,
        label_id: labelId,
      }));

      const { error } = await supabase
        .from("contact_labels")
        .upsert(rows, { onConflict: "contact_id, label_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      const labelObj = labels?.find((l) => l.id === bulkLabelId);
      toast.success(`Etiqueta "${labelObj?.name || 'selecionada'}" aplicada a ${selectedContactIds.size} contato(s)!`);
      setIsAddLabelModalOpen(false);
      setSelectedContactIds(new Set());
      setBulkLabelId("");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao aplicar etiqueta em lote.");
    },
  });

  const now = new Date();
  const newThisMonthCount = regularContacts.filter((c: any) => {
    if (!c.created_at) return false;
    const dt = new Date(c.created_at);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Top KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card 
          className={cn(
            "p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm cursor-pointer transition-all hover:border-primary/50",
            activeTab === "all" && "ring-1 ring-primary/50"
          )}
          onClick={() => setActiveTab("all")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Contatos
            </span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{counts?.total ?? regularContacts.length}</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dateRange ? "No período selecionado" : "Base ativa"}
          </p>
        </Card>

        <Card 
          className={cn(
            "p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm cursor-pointer transition-all hover:border-blue-500/50",
            activeTab === "ads" && "ring-1 ring-blue-500/50"
          )}
          onClick={() => setActiveTab("ads")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Leads de Anúncios
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <Link className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {counts?.ads ?? adContactsCount}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Origem Meta Ads (CTWA)</p>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Novos no Mês
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <UserPlus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {newThisMonthCount}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastrados neste mês</p>
        </Card>

        <Card 
          className={cn(
            "p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm cursor-pointer transition-all hover:border-destructive/50",
            activeTab === "blocked" && "ring-1 ring-destructive/50"
          )}
          onClick={() => setActiveTab("blocked")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bloqueados
            </span>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
            {counts?.blocked ?? blockedContacts.length}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Lista negra</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-9 w-fit">
                <TabsTrigger value="all" className="text-xs">
                  Todos os Contatos ({counts?.total ?? regularContacts.length})
                </TabsTrigger>
                <TabsTrigger value="ads" className="text-xs">
                  Origem Anúncio ({counts?.ads ?? adContactsCount})
                </TabsTrigger>
                <TabsTrigger value="blocked" className="text-xs">
                  Bloqueados ({counts?.blocked ?? blockedContacts.length})
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search Input */}
                <div className="relative w-full sm:w-48 md:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar nome, fone, e-mail..."
                    className="pl-8 h-8 text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Channel Filter */}
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[125px] h-8 text-xs">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Canais</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                  </SelectContent>
                </Select>

                {/* Date Filter */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs font-normal",
                        !dateRange && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM")} - {format(dateRange.to, "dd/MM")}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy")
                        )
                      ) : (
                        "Filtrar Data"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>

                {dateRange && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setDateRange(undefined)}>
                    Limpar
                  </Button>
                )}

                {/* Refresh Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["contacts"] });
                    qc.invalidateQueries({ queryKey: ["contacts-counts"] });
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
                </Button>

                {/* Create Contact Action Button */}
                <CreateContactDialog />
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[750px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 px-4">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Selecionar todos os contatos"
                        />
                      </TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Telefone / Canal</TableHead>
                      <TableHead>Origem / Campanha</TableHead>
                      <TableHead className="hidden md:table-cell">Etiquetas</TableHead>
                      <TableHead className="hidden sm:table-cell">Data de Cadastro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact: any) => {
                      const isSelected = selectedContactIds.has(contact.id);
                      return (
                        <TableRow 
                          key={contact.id} 
                          className={cn(
                            "hover:bg-muted/50 cursor-pointer transition-colors",
                            isSelected && "bg-primary/5 hover:bg-primary/10",
                            contact.is_blocked && "opacity-80"
                          )}
                          onClick={() => setSelectedContactId(contact.id)}
                        >
                          <TableCell 
                            className="w-12 px-4" 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectContact(contact.id)}
                              aria-label={`Selecionar ${contact.name}`}
                            />
                          </TableCell>
                          <TableCell className="p-4">
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                                contact.is_blocked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                              )}>
                                {contact.is_blocked ? (
                                  <ShieldAlert className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn("font-medium text-sm truncate", contact.is_blocked && "text-destructive")}>
                                    {contact.name || "Sem nome"}
                                  </span>
                                  {contact.is_blocked && (
                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                                      Bloqueado
                                    </Badge>
                                  )}
                                </div>
                                {contact.is_blocked && contact.block_reason && (
                                  <span className="text-[11px] text-muted-foreground truncate" title={contact.block_reason}>
                                    Motivo: {contact.block_reason}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="p-4">
                            <div className="flex flex-col gap-1 text-muted-foreground">
                              {contact.phone && contact.phone.length <= 15 && (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3 w-3 text-foreground/70" />
                                  <span className="text-xs">{contact.phone}</span>
                                </div>
                              )}
                              {contact.phone && contact.phone.length > 15 && !contact.instagram_username && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs" title="ID do Canal">ID: {contact.phone}</span>
                                </div>
                              )}
                              {contact.instagram_username && (
                                <div className="flex items-center gap-1.5">
                                  <User className="h-3 w-3 text-pink-500" />
                                  <span className="text-xs font-medium text-pink-600 dark:text-pink-400">@{contact.instagram_username}</span>
                                </div>
                              )}
                              {contact.email && (
                                <div className="flex items-center gap-1.5">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate max-w-[150px] text-xs">{contact.email}</span>
                                </div>
                              )}
                              {!contact.phone && !contact.email && !contact.instagram_username && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                            {!selectedUnitId && contact.last_unit_name && (
                              <div className="flex items-center gap-1 mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit">
                                <Building className="h-3 w-3 shrink-0" />
                                <span className="truncate">Última unid: {contact.last_unit_name}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-4">
                            {contact.has_ad && contact.latest_ad ? (
                              <div className="flex items-center gap-2.5 max-w-[260px]">
                                {contact.latest_ad.thumbnail_url ? (
                                  <img 
                                    src={contact.latest_ad.thumbnail_url} 
                                    alt="Ad thumbnail" 
                                    className="h-9 w-9 rounded-md object-cover border border-border shrink-0 shadow-2xs"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="h-9 w-9 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shrink-0">
                                    <Megaphone className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 h-4 font-normal bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                      <Link className="h-2.5 w-2.5" /> Anúncio CTWA
                                    </Badge>
                                    {contact.latest_ad.source_app && (
                                      <span className="text-[9px] text-muted-foreground uppercase font-medium">
                                        {contact.latest_ad.source_app}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-medium truncate mt-0.5" title={contact.latest_ad.ad_title || "Anúncio sem título"}>
                                    {contact.latest_ad.ad_title || "Anúncio do Meta"}
                                  </span>
                                  {contact.latest_ad.source_url && (
                                    <a 
                                      href={contact.latest_ad.source_url} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="text-[10px] text-primary flex items-center gap-1 hover:underline w-fit"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Ver anúncio <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (contact.instagram_username || contact.instagram_id) ? (
                              <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 font-normal w-fit bg-pink-500/5 text-pink-600 dark:text-pink-400 border-pink-500/20">
                                <User className="h-3 w-3 text-pink-500" />
                                Instagram Direct
                              </Badge>
                            ) : contact.phone ? (
                              <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 font-normal w-fit bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                <Phone className="h-3 w-3 text-emerald-500" />
                                WhatsApp Orgânico
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Direto / Manual</span>
                            )}
                          </TableCell>
                          <TableCell className="p-4 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {contact.contact_labels?.map((cl: any) => {
                                const label = cl.labels;
                                if (!label) return null;
                                return (
                                  <Badge 
                                    key={label.id} 
                                    variant="outline" 
                                    className="text-[10px] gap-1 px-2 py-0 h-5 font-normal"
                                    style={{
                                      backgroundColor: `${label.color || '#6b7280'}15`,
                                      color: label.color || '#6b7280',
                                      borderColor: `${label.color || '#6b7280'}40`,
                                    }}
                                  >
                                    <span 
                                      className="h-1.5 w-1.5 rounded-full shrink-0" 
                                      style={{ backgroundColor: label.color || '#6b7280' }} 
                                    />
                                    {label.name}
                                  </Badge>
                                );
                              })}
                              {contact.tags && contact.tags.length > 0 && contact.tags.map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-[10px]">
                                  {tag}
                                </Badge>
                              ))}
                              {!contact.contact_labels?.length && (!contact.tags || contact.tags.length === 0) && (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-4 hidden sm:table-cell text-muted-foreground text-xs">
                            {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-3 mb-4">
                  {activeTab === "ads" ? (
                    <Link className="h-6 w-6 text-muted-foreground" />
                  ) : activeTab === "blocked" ? (
                    <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                  ) : (
                    <User className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-medium">
                  {activeTab === "ads" 
                    ? "Nenhum lead de anúncio encontrado" 
                    : activeTab === "blocked"
                    ? "Nenhum contato bloqueado"
                    : "Nenhum contato encontrado"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  {searchTerm 
                    ? "Não encontramos resultados para a sua busca."
                    : activeTab === "ads"
                    ? "Os contatos que chegarem através de anúncios do Meta/WhatsApp aparecerão aqui."
                    : activeTab === "blocked"
                    ? "Nenhum contato está bloqueado no momento."
                    : "Os contatos aparecerão aqui automaticamente quando iniciarem uma conversa."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* Barra Flutuante de Ações em Massa */}
      {selectedContactIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-card/95 backdrop-blur-md border border-border px-4 py-2.5 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>{selectedContactIds.size} selecionado{selectedContactIds.size > 1 ? "s" : ""}</span>
          </div>

          <div className="h-4 w-px bg-border" />

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium shadow-xs"
            onClick={() => {
              if (labels && labels.length > 0 && !bulkLabelId) {
                setBulkLabelId(labels[0].id);
              }
              setIsAddLabelModalOpen(true);
            }}
          >
            <Tag className="h-3.5 w-3.5" />
            Adicionar Etiqueta
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedContactIds(new Set())}
          >
            Desmarcar
          </Button>
        </div>
      )}

      {/* Modal para Adicionar Etiqueta em Massa */}
      <Dialog open={isAddLabelModalOpen} onOpenChange={setIsAddLabelModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Tag className="h-4 w-4 text-primary" />
              Adicionar Etiqueta em Massa
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione qual etiqueta será vinculada aos {selectedContactIds.size} contato{selectedContactIds.size > 1 ? "s" : ""} selecionado{selectedContactIds.size > 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {!labels?.length ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                Você ainda não possui etiquetas cadastradas. Crie suas etiquetas em <b>Configurações &gt; Etiquetas</b>.
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="bulk-label-select" className="text-xs text-muted-foreground">
                  Selecione a etiqueta:
                </Label>
                <Select value={bulkLabelId} onValueChange={setBulkLabelId}>
                  <SelectTrigger id="bulk-label-select" className="w-full">
                    <SelectValue placeholder="Selecione uma etiqueta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {labels.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: l.color || "#6b7280" }}
                          />
                          <span>{l.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsAddLabelModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => applyBulkLabel.mutate(bulkLabelId)}
              disabled={applyBulkLabel.isPending || !bulkLabelId || selectedContactIds.size === 0}
            >
              {applyBulkLabel.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Aplicando...
                </>
              ) : (
                `Aplicar a ${selectedContactIds.size} contato(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactDetailsSheet 
        contactId={selectedContactId} 
        open={!!selectedContactId} 
        onOpenChange={(open) => !open && setSelectedContactId(null)} 
      />
    </div>
  );
}
