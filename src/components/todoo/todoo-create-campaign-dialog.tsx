import { useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import * as XLSX from "xlsx";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Upload,
  Database,
  Users,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Layers,
  HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { TodooCampaignType, TodooDistributionMode } from "@/types/todoo";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const TEMPLATES = [
  {
    type: "retention_saldo" as TodooCampaignType,
    title: "Saldo ≤ 3 Sessões (Clube de Manutenção Anual)",
    description: "Clientes na reta final do tratamento. Oferta de blindagem contra retorno folicular.",
    defaultScript:
      "Olá, {primeiro_nome}! Tudo bem? Acompanhei seu protocolo e vi que você já está na reta final com {saldo} sessões restantes. Para garantir que sua pele continue 100% lisa e blindada contra folículos residuais, temos uma condição especial no nosso Clube de Manutenção Anual antes de encerrar seu pacote. Posso te explicar como funciona?",
    defaultOffer: "Plano Anual Recorrente em até 12x sem juros ou desconto no Pix",
    defaultSla: 24,
  },
  {
    type: "upsell_zones" as TodooCampaignType,
    title: "Zonas em Aberto (Combo Multi-Regiões)",
    description: "Clientes com 1 ou 2 áreas contratadas. Sugestão de combo na mesma ida à clínica.",
    defaultScript:
      "Oi, {primeiro_nome}! Passando para ver como está sua pele após o último atendimento! Como você já tem excelentes resultados em {zona}, nossa especialista reservou uma condição de combo para incluir uma nova região aproveitando o mesmo horário da sua cabine. Fica super prático para você. Quer dar uma olhada na simulação?",
    defaultOffer: "Desconto progressivo casadinho para 2ª região na mesma sessão",
    defaultSla: 24,
  },
  {
    type: "reactivation" as TodooCampaignType,
    title: "Reativação de Inativos (> 45/60 Dias)",
    description: "Base fria de clientes que pararam de agendar ou não respondem há tempo.",
    defaultScript:
      "Oi, {primeiro_nome}! Sentimos muito a sua falta aqui na clínica! Sei que a correria do dia a dia atrapalha, mas separei uma cortesia de reavaliação de pele para você retomar seus cuidados sem custo neste mês. Consigo segurar um horário para você nesta semana?",
    defaultOffer: "Sessão cortesia de retorno + condição especial para retomada",
    defaultSla: 12,
  },
  {
    type: "mgm_referral" as TodooCampaignType,
    title: "Desafio 3 Amigas (Member-Get-Member)",
    description: "Momento de encantamento visual (2ª/3ª sessão). Vouchers para presentear amigas.",
    defaultScript:
      "Oi, {primeiro_nome}! Ficamos muito felizes em ver como você está amando seus resultados! Liberamos no seu nome 3 vouchers nominais no valor de R$ 150 para você presentear suas melhores amigas. E o melhor: para cada amiga que iniciar, você ganha créditos automáticos no seu tratamento! Quem são as 3 amigas que você gostaria de presentear?",
    defaultOffer: "3 Vouchers de R$ 150 válidos por 7 dias + créditos para indicadora",
    defaultSla: 24,
  },
  {
    type: "quote_followup" as TodooCampaignType,
    title: "Follow-up de Orçamentos (Cadência D+1, D+3)",
    description: "Orçamentos passados na cabine ou recepção que ainda não foram fechados.",
    defaultScript:
      "Oi, {primeiro_nome}! Tudo bem? A nossa especialista que atendeu você deixou reservada a condição especial da sua proposta de {zona}. Como a tabela atualiza esta semana, a gerência me autorizou a manter o valor promocional e incluir uma pequena área de cortesia se confirmarmos hoje. O que você acha?",
    defaultOffer: "Manutenção do valor promocional + pequena área bônus",
    defaultSla: 12,
  },
  {
    type: "custom" as TodooCampaignType,
    title: "Ação Comercial Personalizada",
    description: "Crie uma lista com suas próprias regras, script e objetivo de vendas.",
    defaultScript: "Olá {primeiro_nome}! Temos uma novidade incrível para você aqui na clínica.",
    defaultOffer: "Condição exclusiva personalizada",
    defaultSla: 24,
  },
];

export function TodooCreateCampaignDialog({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const fileInputId = useId();

  // Etapa do Wizard (1: Template, 2: Origem dos Contatos, 3: Script & Oferta, 4: Distribuição & Metas)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Estado do formulário
  const [campaignType, setCampaignType] = useState<TodooCampaignType>("retention_saldo");
  const [title, setTitle] = useState("Clube de Manutenção Anual (Saldo ≤ 3)");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState(TEMPLATES[0].defaultScript);
  const [offerDetails, setOfferDetails] = useState(TEMPLATES[0].defaultOffer);
  const [slaHours, setSlaHours] = useState<number>(24);
  const [redistributeOnSla, setRedistributeOnSla] = useState(true);
  const [distributionMode, setDistributionMode] = useState<TodooDistributionMode>("round_robin");
  const [targetRevenue, setTargetRevenue] = useState("");

  // Origem dos Contatos
  const [sourceType, setSourceType] = useState<"internal_crm" | "erp_import">("internal_crm");

  // Filtros internos do CRM
  const [crmInactivityDays, setCrmInactivityDays] = useState("30");
  const [crmStatusFilter, setCrmStatusFilter] = useState("resolved");
  const [crmSelectedReason, setCrmSelectedReason] = useState<string>("all");
  const [crmMatchedCount, setCrmMatchedCount] = useState<number | null>(null);
  const [crmLoadingCount, setCrmLoadingCount] = useState(false);
  const [crmLeadsData, setCrmLeadsData] = useState<any[]>([]);

  // Importação externa ERP (CSV/Excel)
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [colName, setColName] = useState<string>("");
  const [colPhone, setColPhone] = useState<string>("");
  const [colSaldo, setColSaldo] = useState<string>("");
  const [colZona, setColZona] = useState<string>("");
  const [colUltimaSessao, setColUltimaSessao] = useState<string>("");

  // Consultoras participantes
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Busca consultoras/atendentes da empresa
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["todoo-team-members", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, role")
        .eq("company_id", activeCompanyId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Busca motivos de encerramento para o filtro
  const { data: resolutionReasons = [] } = useQuery({
    queryKey: ["todoo-resolution-reasons", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resolution_reasons")
        .select("id, label")
        .eq("company_id", activeCompanyId)
        .order("order");
      if (error) throw error;
      return data || [];
    },
  });

  // Quando escolhe um template
  const handleSelectTemplate = (template: typeof TEMPLATES[0]) => {
    setCampaignType(template.type);
    setTitle(template.title);
    setDescription(template.description);
    setScript(template.defaultScript);
    setOfferDetails(template.defaultOffer);
    setSlaHours(template.defaultSla);
  };

  // Puxar contatos da base do Atendi
  const handleQueryCrmContacts = async () => {
    if (!activeCompanyId) return;
    setCrmLoadingCount(true);

    try {
      let query = supabase
        .from("conversations")
        .select(`
          id,
          last_message_at,
          status,
          resolution_reason_id,
          contact:contacts!inner(id, name, phone, tags, company_id)
        `)
        .eq("contact.company_id", activeCompanyId);

      if (crmStatusFilter === "resolved") {
        query = query.eq("status", "resolved");
      }

      if (crmSelectedReason && crmSelectedReason !== "all") {
        query = query.eq("resolution_reason_id", crmSelectedReason);
      }

      // Filtro de data de inatividade
      if (crmInactivityDays && parseInt(crmInactivityDays) > 0) {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - parseInt(crmInactivityDays));
        query = query.lte("last_message_at", thresholdDate.toISOString());
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;

      // Filtra contatos com telefone válido
      const validContacts = (data || [])
        .filter((c: any) => c.contact && c.contact.phone)
        .map((c: any) => ({
          contact_id: c.contact.id,
          name: c.contact.name || "Cliente",
          phone: c.contact.phone,
          tags: c.contact.tags || [],
          last_message_at: c.last_message_at,
        }));

      // Remove duplicados de telefone
      const uniqueMap = new Map();
      validContacts.forEach((vc) => {
        if (!uniqueMap.has(vc.phone)) {
          uniqueMap.set(vc.phone, vc);
        }
      });

      const uniqueList = Array.from(uniqueMap.values());
      setCrmLeadsData(uniqueList);
      setCrmMatchedCount(uniqueList.length);
      toast.success(`${uniqueList.length} contatos encontrados na base do Atendi!`);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao buscar contatos do CRM: " + err.message);
    } finally {
      setCrmLoadingCount(false);
    }
  };

  // Upload e Parsing de Arquivo ERP (CSV ou XLSX)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop()?.toLowerCase();

    if (fileExt === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[];
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            setColumnHeaders(headers);
            setImportedRows(rows);
            autoDetectColumns(headers);
            toast.success(`${rows.length} linhas lidas do arquivo CSV!`);
          }
        },
        error: (error) => {
          toast.error("Erro ao processar CSV: " + error.message);
        },
      });
    } else if (fileExt === "xlsx" || fileExt === "xls") {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rows: any[] = XLSX.utils.sheet_to_json(ws);
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            setColumnHeaders(headers);
            setImportedRows(rows);
            autoDetectColumns(headers);
            toast.success(`${rows.length} linhas lidas da planilha Excel!`);
          }
        } catch (err: any) {
          toast.error("Erro ao ler planilha: " + err.message);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error("Formato não suportado. Por favor use arquivos .csv ou .xlsx");
    }
  };

  // Tenta adivinhar as colunas da planilha automaticamente
  const autoDetectColumns = (headers: string[]) => {
    const normalize = (h: string) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    headers.forEach((h) => {
      const n = normalize(h);
      if (n.includes("nome") || n.includes("paciente") || n.includes("cliente")) {
        setColName(h);
      } else if (n.includes("tel") || n.includes("cel") || n.includes("whats") || n.includes("fone")) {
        setColPhone(h);
      } else if (n.includes("saldo") || n.includes("sess")) {
        setColSaldo(h);
      } else if (n.includes("zona") || n.includes("area") || n.includes("regiao") || n.includes("proc")) {
        setColZona(h);
      } else if (n.includes("data") || n.includes("ultima") || n.includes("visita")) {
        setColUltimaSessao(h);
      }
    });
  };

  // Submissão Final e Distribuição Round-Robin
  const handleCreateCampaign = async () => {
    if (!profile || !activeCompanyId) return;
    setSubmitting(true);

    try {
      // 1. Prepara a lista consolidada de leads
      let finalLeads: Array<{
        name: string;
        phone: string;
        contact_id?: string;
        custom_fields: Record<string, any>;
      }> = [];

      if (sourceType === "internal_crm") {
        if (crmLeadsData.length === 0) {
          throw new Error("Por favor, clique em 'Filtrar Contatos' para localizar os clientes do CRM.");
        }
        finalLeads = crmLeadsData.map((c) => ({
          name: c.name,
          phone: c.phone,
          contact_id: c.contact_id,
          custom_fields: {
            tags: c.tags,
            last_message_at: c.last_message_at,
          },
        }));
      } else {
        if (!colName || !colPhone || importedRows.length === 0) {
          throw new Error("Por favor, selecione as colunas de Nome e Telefone da planilha.");
        }
        finalLeads = importedRows.map((row) => ({
          name: String(row[colName] || "Cliente").trim(),
          phone: String(row[colPhone] || "").replace(/\D/g, ""),
          custom_fields: {
            saldo: colSaldo ? row[colSaldo] : undefined,
            zona: colZona ? row[colZona] : undefined,
            ultima_sessao: colUltimaSessao ? row[colUltimaSessao] : undefined,
          },
        })).filter((l) => l.phone.length >= 8);
      }

      if (finalLeads.length === 0) {
        throw new Error("Nenhum lead válido com telefone encontrado.");
      }

      // 2. Cria a Campanha em todoo_campaigns
      const { data: campaignData, error: campaignErr } = await (supabase.from("todoo_campaigns") as any)
        .insert({
          company_id: activeCompanyId,
          title,
          description: description || null,
          type: campaignType,
          source_type: sourceType,
          status: "active",
          message_template: script,
          offer_details: offerDetails || null,
          sla_hours: slaHours,
          redistribute_on_sla_breach: redistributeOnSla,
          distribution_mode: distributionMode,
          target_count: finalLeads.length,
          target_revenue: targetRevenue ? parseFloat(targetRevenue.replace(",", ".")) : 0,
          created_by: profile.id,
        })
        .select()
        .single();

      if (campaignErr) throw campaignErr;

      // 3. Distribuição Round-Robin entre as consultoras selecionadas
      const assignedConsultants = selectedUserIds.length > 0 ? selectedUserIds : [profile.id];
      const now = new Date();
      const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString();

      const leadsToInsert = finalLeads.map((lead, idx) => {
        const assignedUserId = assignedConsultants[idx % assignedConsultants.length];
        return {
          campaign_id: campaignData.id,
          company_id: activeCompanyId,
          contact_id: lead.contact_id || null,
          contact_name: lead.name,
          contact_phone: lead.phone,
          assigned_user_id: assignedUserId,
          assigned_at: now.toISOString(),
          sla_deadline: slaDeadline,
          status: "pending",
          custom_fields: lead.custom_fields,
        };
      });

      // Insere em lotes de 100 para alta performance
      const chunkSize = 100;
      for (let i = 0; i < leadsToInsert.length; i += chunkSize) {
        const chunk = leadsToInsert.slice(i, i + chunkSize);
        const { error: insertErr } = await (supabase.from("todoo_leads") as any).insert(chunk);
        if (insertErr) throw insertErr;
      }

      toast.success(`Ação Comercial "${title}" criada com ${finalLeads.length} leads distribuídos!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao criar campanha.");
    } finally {
      setSubmitting(false);
    }
  };

  const insertVariable = (varName: string) => {
    setScript((prev) => prev + varName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary font-mono text-xs">
              Passo {step} de 4
            </Badge>
            <DialogTitle className="text-lg">
              {step === 1 && "Escolha o Template & Objetivo Clínico"}
              {step === 2 && "Origem dos Contatos (ERP ou CRM)"}
              {step === 3 && "Personalize o Script Comercial"}
              {step === 4 && "Distribuição da Equipe & Regras de SLA"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {step === 1 && "Selecione uma estratégia testada nos manuais ou crie uma personalizada."}
            {step === 2 && "Puxe clientes inativos da base do Atendi ou faça upload de planilha do seu ERP."}
            {step === 3 && "Defina a abordagem sugerida para a consultora com variáveis inteligentes."}
            {step === 4 && "Configure o rodízio round-robin, tempo de resposta e meta de vendas."}
          </DialogDescription>
        </DialogHeader>

        {/* PASSO 1: TEMPLATES */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TEMPLATES.map((tmpl) => {
                const isSelected = campaignType === tmpl.type;
                return (
                  <button
                    key={tmpl.type}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                        : "border-border hover:border-border/80 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-xs text-foreground">{tmpl.title}</h4>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        SLA: {tmpl.defaultSla}h
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Nome da Ação Comercial</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
        )}

        {/* PASSO 2: ORIGEM DOS CONTATOS */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase">
                De onde virão os contatos desta lista?
              </Label>
              <RadioGroup
                value={sourceType}
                onValueChange={(val: any) => setSourceType(val)}
                className="grid grid-cols-2 gap-3 mt-2"
              >
                <div
                  onClick={() => setSourceType("internal_crm")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    sourceType === "internal_crm"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="internal_crm" id="source_crm" />
                  <div>
                    <Label htmlFor="source_crm" className="font-semibold text-xs cursor-pointer">
                      Puxar do Atendi (CRM)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Filtros de atendimentos, conversas finalizadas e clientes sem contato.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setSourceType("erp_import")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    sourceType === "erp_import"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <RadioGroupItem value="erp_import" id="source_erp" />
                  <div>
                    <Label htmlFor="source_erp" className="font-semibold text-xs cursor-pointer">
                      Importar do ERP (Planilha)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Upload de CSV ou Excel com saldo de sessões, zonas e datas do ERP.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* SELEÇÃO CRM ATENDI */}
            {sourceType === "internal_crm" && (
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-semibold">Filtros Inteligentes de Atendimentos</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Dias de Inatividade (sem contato)</Label>
                    <Select value={crmInactivityDays} onValueChange={setCrmInactivityDays}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">Mais de 15 dias sem mensagem</SelectItem>
                        <SelectItem value="30">Mais de 30 dias sem mensagem</SelectItem>
                        <SelectItem value="45">Mais de 45 dias sem mensagem</SelectItem>
                        <SelectItem value="60">Mais de 60 dias sem mensagem</SelectItem>
                        <SelectItem value="90">Mais de 90 dias sem mensagem</SelectItem>
                        <SelectItem value="0">Qualquer período</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Motivo de Encerramento</Label>
                    <Select value={crmSelectedReason} onValueChange={setCrmSelectedReason}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Motivos</SelectItem>
                        {resolutionReasons.map((r: any) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleQueryCrmContacts}
                    disabled={crmLoadingCount}
                  >
                    {crmLoadingCount ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      "Filtrar Contatos Elegíveis"
                    )}
                  </Button>

                  {crmMatchedCount !== null && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ {crmMatchedCount} contatos encontrados
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* SELEÇÃO ERP / PLANILHA */}
            {sourceType === "erp_import" && (
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-semibold">Upload da Planilha do ERP (CSV ou XLSX)</h4>
                </div>

                <label
                  htmlFor={fileInputId}
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-xs font-medium text-foreground">
                    Clique para selecionar arquivo do seu ERP
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Suporta .csv, .xlsx ou .xls
                  </span>
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    className="sr-only"
                    onChange={handleFileUpload}
                  />
                </label>

                {columnHeaders.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs font-semibold">Mapeamento de Colunas:</Label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Coluna de Nome: *</span>
                        <Select value={colName} onValueChange={setColName}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {columnHeaders.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Coluna de WhatsApp/Telefone: *</span>
                        <Select value={colPhone} onValueChange={setColPhone}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {columnHeaders.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Saldo de Sessões (Opcional):</span>
                        <Select value={colSaldo} onValueChange={setColSaldo}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Ignorar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhum</SelectItem>
                            {columnHeaders.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Área/Procedimento (Opcional):</span>
                        <Select value={colZona} onValueChange={setColZona}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Ignorar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhum</SelectItem>
                            {columnHeaders.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-[11px] text-emerald-600 font-medium">
                      ✓ {importedRows.length} clientes carregados da planilha
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PASSO 3: SCRIPT & OFERTA */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Script Comercial para WhatsApp</Label>
                <span className="text-[11px] text-muted-foreground">Clique nas variáveis para inserir</span>
              </div>

              {/* Chips de Variáveis */}
              <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                {[
                  { label: "Nome", tag: "{nome}" },
                  { label: "Primeiro Nome", tag: "{primeiro_nome}" },
                  { label: "Saldo de Sessões", tag: "{saldo}" },
                  { label: "Área/Zona", tag: "{zona}" },
                  { label: "Nome da Consultora", tag: "{consultora}" },
                  { label: "Voucher Bônus", tag: "{voucher}" },
                ].map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground font-mono transition-colors"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>

              <Textarea
                rows={5}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Digite a mensagem que a consultora enviará..."
                className="font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Condição / Oferta Autorizada (Guia para a Consultora)</Label>
              <Input
                value={offerDetails}
                onChange={(e) => setOfferDetails(e.target.value)}
                placeholder="Ex: Até 10x sem juros no cartão ou 10% no Pix + pequena área bônus"
              />
            </div>
          </div>
        )}

        {/* PASSO 4: DISTRIBUIÇÃO & REGRAS */}
        {step === 4 && (
          <div className="space-y-4 py-2">
            {/* Consultoras Participantes */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Equipe Participante do Rodízio
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 rounded-lg border border-border">
                {teamMembers.map((member: any) => {
                  const isChecked = selectedUserIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUserIds([...selectedUserIds, member.id]);
                          } else {
                            setSelectedUserIds(selectedUserIds.filter((id) => id !== member.id));
                          }
                        }}
                      />
                      <span className="truncate">{member.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Os leads serão distribuídos igualmente (Round-Robin) entre as pessoas marcadas.
              </p>
            </div>

            {/* SLA e Repasse */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div>
                <Label className="text-xs">SLA de 1º Contato</Label>
                <Select value={String(slaHours)} onValueChange={(v) => setSlaHours(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 Horas (Urgência Alta)</SelectItem>
                    <SelectItem value="24">24 Horas (Padrão Recomendado)</SelectItem>
                    <SelectItem value="48">48 Horas (Janela Ampla)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Meta de Vendas da Campanha (R$)</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex: 50.000,00"
                  value={targetRevenue}
                  onChange={(e) => setTargetRevenue(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="redistribute"
                checked={redistributeOnSla}
                onCheckedChange={(c: any) => setRedistributeOnSla(c)}
              />
              <Label htmlFor="redistribute" className="text-xs cursor-pointer">
                <strong>Regra de Ouro:</strong> Redistribuir lead para a próxima consultora se o SLA expirar
              </Label>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as any)}
              disabled={submitting}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (step === 2 && sourceType === "internal_crm" && crmLeadsData.length === 0) {
                  toast.error("Por favor, clique em 'Filtrar Contatos' antes de prosseguir.");
                  return;
                }
                if (step === 2 && sourceType === "erp_import" && (!colName || !colPhone)) {
                  toast.error("Por favor, mapeie as colunas de Nome e Telefone.");
                  return;
                }
                setStep((s) => (s + 1) as any);
              }}
            >
              Avançar
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleCreateCampaign} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Distribuindo Leads...
                </>
              ) : (
                "Criar Lista & Iniciar Todoo"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
