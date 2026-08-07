import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Phone, Mail, User, UserPlus, Loader2, Building, RefreshCw, ShieldAlert, X, Link, ExternalLink, Image as ImageIcon, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactDetailsSheet } from "@/components/contacts/contact-details-sheet";
import { CreateContactDialog } from "@/components/contacts/create-contact-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", activeCompanyId, searchTerm, selectedUnitId, dateRange],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      // Se não tem unidade selecionada (Empresa Mãe), pega todos os contatos.
      // Se tem unidade, pega apenas os contatos que têm conversas na unidade logada.
      const relation = selectedUnitId ? 'conversations!inner' : 'conversations';
      
      let query = supabase
        .from("contacts")
        .select(`
          *,
          ${relation} (
            unit_id,
            units ( name ),
            started_at
          )
        `)
        .eq("company_id", activeCompanyId!)
        .is("merged_into_id", null)
        .order("created_at", { ascending: false });

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
        return {
          ...c,
          last_unit_name: lastConv?.units?.name
        };
      });
    },
  });

  const { data: adLeads, isLoading: isLoadingAds } = useQuery({
    queryKey: ["ad-leads", activeCompanyId, searchTerm, selectedUnitId, dateRange],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("ad_leads")
        .select(`
          id,
          created_at,
          ad_title,
          ad_body,
          source_url,
          thumbnail_url,
          conversion_source,
          source_app,
          contact:contacts!inner (
            id,
            name,
            phone,
            company_id
          )
        `)
        .eq('company_id', activeCompanyId!)
        .is("contact.merged_into_id", null)
        .order('created_at', { ascending: false });

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
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

      let validAdLeads = data.filter((lead: any) => {
        // Ensure we only process contacts, not groups
        const phone = lead.contact?.phone;
        if (phone && phone.length > 17) return false;

        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const nameMatch = lead.contact?.name?.toLowerCase().includes(searchLower);
          const phoneMatch = lead.contact?.phone?.toLowerCase().includes(searchLower);
          if (!nameMatch && !phoneMatch) return false;
        }
        
        return true;
      });

      // Deduplicate by contactId so we only show the latest ad interaction per contact
      const uniqueLeadsMap = new Map();
      for (const lead of validAdLeads) {
        const contactId = lead.contact.id;
        if (!uniqueLeadsMap.has(contactId)) {
          uniqueLeadsMap.set(contactId, {
            contact: lead.contact,
            messageId: lead.id, // Using ad_lead id as key for React list
            createdAt: lead.created_at,
            adData: {
              title: lead.ad_title,
              body: lead.ad_body,
              sourceURL: lead.source_url,
              thumbnailURL: lead.thumbnail_url,
              originalImageURL: lead.thumbnail_url
            },
            conversionSource: lead.conversion_source,
            sourceApp: lead.source_app
          });
        }
      }

      return Array.from(uniqueLeadsMap.values());
    }
  });

  const regularContacts = (contacts || []).filter((c: any) => !c.is_blocked);
  const blockedContacts = (contacts || []).filter((c: any) => c.is_blocked);

  const filteredRegularContacts = regularContacts.filter((contact: any) => {
    if (channelFilter === "whatsapp") {
      if (contact.instagram_username && !contact.phone) return false;
    }
    if (channelFilter === "instagram") {
      if (!contact.instagram_username) return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const name = (contact.name || "").toLowerCase();
      const phone = (contact.phone || "").toLowerCase();
      const email = (contact.email || "").toLowerCase();
      const insta = (contact.instagram_username || "").toLowerCase();

      if (
        !name.includes(term) &&
        !phone.includes(term) &&
        !email.includes(term) &&
        !insta.includes(term)
      ) {
        return false;
      }
    }
    return true;
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
        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Contatos
            </span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <User className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold">{regularContacts.length}</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dateRange ? "No período selecionado" : "Base ativa"}
          </p>
        </Card>

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Leads de Anúncios
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <Link className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {adLeads?.length || 0}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Origem Meta Ads</p>
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

        <Card className="p-4 bg-card/70 backdrop-blur-sm border-border/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bloqueados
            </span>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
            {blockedContacts.length}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Lista negra</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-9 w-fit">
                <TabsTrigger value="all" className="text-xs">Todos os Contatos</TabsTrigger>
                <TabsTrigger value="ads" className="text-xs">Origem Anúncio</TabsTrigger>
                <TabsTrigger value="blocked" className="text-xs">Bloqueados</TabsTrigger>
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
                    qc.invalidateQueries({ queryKey: ["ad-leads"] });
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
            <TabsContent value="all" className="m-0 border-none p-0">
              {isLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRegularContacts.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="min-w-[650px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Contato / Canal</TableHead>
                        <TableHead className="hidden md:table-cell">Tags</TableHead>
                        <TableHead className="hidden sm:table-cell">Data de Cadastro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRegularContacts.map((contact: any) => (
                        <TableRow 
                          key={contact.id} 
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedContactId(contact.id)}
                        >
                          <TableCell className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{contact.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-4">
                            <div className="flex flex-col gap-1 text-muted-foreground">
                              {contact.phone && contact.phone.length <= 15 && (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3 w-3" />
                                  <span>{contact.phone}</span>
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
                                  <span>@{contact.instagram_username}</span>
                                </div>
                              )}
                              {contact.email && (
                                <div className="flex items-center gap-1.5">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate max-w-[150px]">{contact.email}</span>
                                </div>
                              )}
                              {!contact.phone && !contact.email && !contact.instagram_username && <span>-</span>}
                            </div>
                            {!selectedUnitId && contact.last_unit_name && (
                              <div className="flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit">
                                <Building className="h-3 w-3 shrink-0" />
                                <span className="truncate">Última unid: {contact.last_unit_name}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-4 hidden md:table-cell">
                            {contact.tags && contact.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {contact.tags.slice(0, 2).map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                                {contact.tags.length > 2 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    +{contact.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="p-4 hidden sm:table-cell text-muted-foreground">
                            {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-3 mb-4">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">Nenhum contato encontrado</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    {searchTerm 
                      ? "Não encontramos resultados para a sua busca."
                      : "Os contatos aparecerão aqui automaticamente quando iniciarem uma conversa."}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ads" className="m-0 border-none p-0">
              {isLoadingAds ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : adLeads && adLeads.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Lead</TableHead>
                        <TableHead>Anúncio</TableHead>
                        <TableHead className="hidden sm:table-cell">Mídia</TableHead>
                        <TableHead className="hidden md:table-cell">Origem</TableHead>
                        <TableHead>Data do Contato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adLeads.map((lead: any) => (
                        <TableRow 
                          key={lead.messageId} 
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedContactId(lead.contact.id)}
                        >
                          <TableCell className="p-4">
                            <div className="flex flex-col">
                              <span className="font-medium">{lead.contact.name || "Sem nome"}</span>
                              <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                                <Phone className="h-3 w-3" />
                                <span>{lead.contact.phone}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="p-4">
                            <div className="flex flex-col gap-1 max-w-[200px] sm:max-w-[300px]">
                              <span className="font-medium line-clamp-2" title={lead.adData.title}>
                                {lead.adData.title || "Anúncio sem título"}
                              </span>
                              {lead.adData.body && (
                                <span className="text-xs text-muted-foreground line-clamp-2" title={lead.adData.body}>
                                  {lead.adData.body}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-4 hidden sm:table-cell">
                            {lead.adData.thumbnailURL || lead.adData.originalImageURL ? (
                              <div className="relative h-12 w-12 rounded overflow-hidden bg-muted flex items-center justify-center border shrink-0">
                                <img 
                                  src={lead.adData.thumbnailURL || lead.adData.originalImageURL} 
                                  alt="Ad thumbnail" 
                                  className="h-full w-full object-cover relative z-10"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('p-2');
                                  }}
                                />
                                <ImageIcon className="h-4 w-4 text-muted-foreground absolute inset-0 m-auto z-0" />
                              </div>
                            ) : (
                              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center border text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-4 hidden md:table-cell">
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap gap-1">
                                {lead.conversionSource && (
                                  <Badge variant="secondary" className="w-fit text-[10px]">
                                    {lead.conversionSource}
                                  </Badge>
                                )}
                                {lead.sourceApp && (
                                  <Badge variant="outline" className="w-fit text-[10px] capitalize">
                                    {lead.sourceApp}
                                  </Badge>
                                )}
                              </div>
                              {lead.adData.sourceURL && (
                                <a 
                                  href={lead.adData.sourceURL} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs text-primary flex items-center gap-1 hover:underline w-fit"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Ver anúncio <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-4 text-muted-foreground">
                            {format(new Date(lead.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-3 mb-4">
                    <Link className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">Nenhum lead de anúncio encontrado</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    {searchTerm 
                      ? "Não encontramos resultados para a sua busca."
                      : "Os contatos que chegarem através de anúncios do WhatsApp aparecerão aqui."}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="blocked" className="m-0 border-none p-0">
              {isLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : blockedContacts.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Motivo do Bloqueio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedContacts.map((contact: any) => (
                        <TableRow 
                          key={contact.id} 
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedContactId(contact.id)}
                        >
                          <TableCell className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                                <User className="h-4 w-4 text-destructive" />
                              </div>
                              <span className="font-medium text-destructive">{contact.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-4">
                            <div className="flex flex-col gap-1 text-muted-foreground">
                              {contact.phone && (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3 w-3" />
                                  <span>{contact.phone}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-4">
                            <span className="text-muted-foreground">{contact.block_reason || "-"}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-3 mb-4">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">Nenhum contato bloqueado</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Contatos bloqueados aparecerão aqui.
                  </p>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      <ContactDetailsSheet 
        contactId={selectedContactId} 
        open={!!selectedContactId} 
        onOpenChange={(open) => !open && setSelectedContactId(null)} 
      />
    </div>
  );
}
