/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Sparkles,
  AlertCircle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Layers,
  Filter,
  Users,
  Smartphone,
  Info,
  RefreshCw,
  Send,
  Loader2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  X,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import {
  createCampaignAction,
  previewAudienceCountAction,
  previewAudienceContactsAction,
} from "@/lib/api/campaigns.functions";
import {
  renderCampaignMessage,
  sanitizeCampaignPhone,
} from "@/lib/campaign-template";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess?: () => void;
}

const INACTIVITY_PRESETS = [15, 30, 45, 60, 90, 120, 180];

export function CreateCampaignDialog({ open, onOpenChange, companyId, onSuccess }: Props) {
  const qc = useQueryClient();
  const { units: accessibleUnits = [] } = useAccessibleUnits();

  // Wizard Step: 1 = Audiência, 2 = Mensagem, 3 = Configuração/Anti-ban, 4 = Revisão
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Informações Básicas
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [unitId, setUnitId] = useState<string>("all");

  // Audiência
  const [audienceType, setAudienceType] = useState<"segment" | "import">("segment");

  // Critérios de Segmentação
  const [inactivityDays, setInactivityDays] = useState<number>(30);
  const [useInactivity, setUseInactivity] = useState<boolean>(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [onlyWithoutOpenConvs, setOnlyWithoutOpenConvs] = useState<boolean>(true);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [isCalculatingCount, setIsCalculatingCount] = useState(false);

  // Destinatários para prévia na Revisão
  const [previewContacts, setPreviewContacts] = useState<any[]>([]);
  const [isLoadingPreviewContacts, setIsLoadingPreviewContacts] = useState(false);
  const [reviewSearchTerm, setReviewSearchTerm] = useState("");

  // Importação de Planilha
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [phoneCol, setPhoneCol] = useState<string>("");
  const [nameCol, setNameCol] = useState<string>("");
  const [saveImportedToContacts, setSaveImportedToContacts] = useState(true);

  // Mensagem
  const [messageType, setMessageType] = useState<"text" | "image" | "video" | "audio" | "document">("text");
  const [messageContent, setMessageContent] = useState(
    "{Olá|Oi|Oie} {{primeiro_nome}}, tudo bem? Estamos com condições especiais na {{unidade}} este mês para você!"
  );
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaName, setMediaName] = useState<string>("");
  const [mediaMode, setMediaMode] = useState<"upload" | "url">("upload");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [testSeed, setTestSeed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configurações & Anti-ban
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [minDelay, setMinDelay] = useState<number>(25);
  const [maxDelay, setMaxDelay] = useState<number>(55);
  const [batchSize, setBatchSize] = useState<number>(20);
  const [batchCooldown, setBatchCooldown] = useState<number>(180); // 3 minutos
  const [allowedStart, setAllowedStart] = useState<string>("08:30");
  const [allowedEnd, setAllowedEnd] = useState<string>("19:30");
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduledDate, setScheduledDate] = useState<string>("");

  // Busca tags/labels existentes
  const { data: labels = [] } = useQuery({
    queryKey: ["campaign-labels", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("labels")
        .select("id, name, color")
        .eq("company_id", companyId)
        .order("name");
      return data || [];
    },
  });

  // Busca instâncias de WhatsApp conectadas
  const { data: instances = [] } = useQuery({
    queryKey: ["campaign-instances", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, status, unit_id")
        .eq("company_id", companyId)
        .order("name");
      return data || [];
    },
  });

  const connectedInstances = useMemo(
    () => instances.filter((i) => i.status === "connected" || i.status === "open"),
    [instances]
  );

  // Cálculo automático da audiência com debounce quando os filtros mudam
  useEffect(() => {
    if (!open || audienceType !== "segment" || !companyId) return;

    const timer = setTimeout(() => {
      calculateAudienceCount();
    }, 400);

    return () => clearTimeout(timer);
  }, [inactivityDays, useInactivity, selectedTags, unitId, onlyWithoutOpenConvs, open, audienceType, companyId]);

  const calculateAudienceCount = async () => {
    setIsCalculatingCount(true);
    try {
      const res = await previewAudienceCountAction({
        data: {
          companyId,
          filters: {
            inactivity_days: useInactivity ? inactivityDays : null,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            unit_ids: unitId && unitId !== "all" ? [unitId] : undefined,
            only_without_open_conversations: onlyWithoutOpenConvs,
          },
        },
      });
      setAudienceCount(res.count);
    } catch (e: any) {
      console.error("[campaigns] Erro ao calcular audiência:", e);
    } finally {
      setIsCalculatingCount(false);
    }
  };

  // Carrega contatos detalhados ao entrar no Passo 4 (Revisão)
  useEffect(() => {
    if (step === 4 && audienceType === "segment" && companyId) {
      setIsLoadingPreviewContacts(true);
      previewAudienceContactsAction({
        data: {
          companyId,
          filters: {
            inactivity_days: useInactivity ? inactivityDays : null,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
            unit_ids: unitId && unitId !== "all" ? [unitId] : undefined,
            only_without_open_conversations: onlyWithoutOpenConvs,
          },
          limit: 1000,
        },
      })
        .then((res) => {
          setPreviewContacts(res.contacts || []);
        })
        .catch((err) => {
          console.error("[campaigns] Erro ao carregar contatos de prévia:", err);
        })
        .finally(() => {
          setIsLoadingPreviewContacts(false);
        });
    }
  }, [step, audienceType, companyId, inactivityDays, useInactivity, selectedTags, unitId, onlyWithoutOpenConvs]);

  // Upload direto de arquivo de mídia para o Supabase Storage
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMedia(true);
    try {
      let detectedType: "image" | "video" | "audio" | "document" = "document";
      if (file.type.startsWith("image/")) detectedType = "image";
      else if (file.type.startsWith("video/")) detectedType = "video";
      else if (file.type.startsWith("audio/")) detectedType = "audio";

      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `campaigns/${companyId}/${Date.now()}_${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("media").getPublicUrl(filePath);

      setMediaUrl(publicData.publicUrl);
      setMediaName(file.name);
      setMessageType(detectedType);
      toast.success(`Arquivo "${file.name}" anexado com sucesso!`);
    } catch (err: any) {
      toast.error("Falha ao enviar arquivo: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveMedia = () => {
    setMediaUrl("");
    setMediaName("");
    setMessageType("text");
  };

  // Processamento do Arquivo Importado (CSV ou XLSX)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.meta.fields && results.meta.fields.length > 0) {
            setColumnHeaders(results.meta.fields);
            setParsedRows(results.data);
            autoDetectColumns(results.meta.fields);
            toast.success(`${results.data.length} linhas carregadas do CSV!`);
          }
        },
        error: (err) => {
          toast.error("Erro ao ler CSV: " + err.message);
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const firstSheet = wb.SheetNames[0];
          const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
            header: 1,
            defval: "",
          });

          if (data && data.length > 1) {
            const headers = (data[0] as string[]).map((h) => String(h).trim()).filter(Boolean);
            const rows = data.slice(1).map((rowArr) => {
              const obj: Record<string, any> = {};
              headers.forEach((h, idx) => {
                obj[h] = rowArr[idx] !== undefined ? String(rowArr[idx]).trim() : "";
              });
              return obj;
            });

            setColumnHeaders(headers);
            setParsedRows(rows);
            autoDetectColumns(headers);
            toast.success(`${rows.length} contatos carregados da planilha Excel!`);
          }
        } catch (err: any) {
          toast.error("Erro ao processar planilha: " + err.message);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error("Formato inválido. Use .csv ou .xlsx");
    }
  };

  const autoDetectColumns = (headers: string[]) => {
    const lower = headers.map((h) => h.toLowerCase());
    const phoneIdx = lower.findIndex((h) =>
      h.includes("tel") || h.includes("cel") || h.includes("phone") || h.includes("whatsapp") || h.includes("contato")
    );
    if (phoneIdx !== -1) setPhoneCol(headers[phoneIdx]);

    const nameIdx = lower.findIndex((h) =>
      h.includes("nome") || h.includes("name") || h.includes("cliente") || h.includes("lead")
    );
    if (nameIdx !== -1) setNameCol(headers[nameIdx]);
  };

  // Resumo de contatos importados
  const importSummary = useMemo(() => {
    if (!phoneCol || parsedRows.length === 0) return { total: 0, valid: 0, rows: [] };

    let validCount = 0;
    const formattedRows: any[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const rawPhone = row[phoneCol];
      const sanitized = sanitizeCampaignPhone(rawPhone);
      const isUnique = !seen.has(sanitized.phone);
      if (sanitized.valid && isUnique) {
        seen.add(sanitized.phone);
        validCount++;
      }
      formattedRows.push({
        phone: sanitized.valid ? sanitized.phone : rawPhone,
        isValid: sanitized.valid,
        name: nameCol ? row[nameCol] : "Cliente",
        extras: row,
      });
    }

    return { total: parsedRows.length, valid: validCount, rows: formattedRows };
  }, [parsedRows, phoneCol, nameCol]);

  // Preview de Mensagem com Spintax resolvido
  const messagePreview = useMemo(() => {
    const dummyClient =
      audienceType === "import" && importSummary.rows[0]
        ? importSummary.rows[0].name
        : previewContacts[0]?.name || "Mariana Silva";
    const dummyPhone =
      audienceType === "import" && importSummary.rows[0]
        ? importSummary.rows[0].phone
        : previewContacts[0]?.phone || "5511999998888";

    return renderCampaignMessage(
      messageContent,
      {
        clientName: dummyClient,
        phone: dummyPhone,
        companyName: "Nossa Empresa",
        unitName: "Unidade Central",
        customVariables: importSummary.rows[0]?.extras || {},
      },
      true
    );
  }, [messageContent, audienceType, importSummary, previewContacts, testSeed]);

  // Tempo estimado de disparo
  const estimatedTime = useMemo(() => {
    const totalRecipients = audienceType === "import" ? importSummary.valid : (audienceCount || 0);
    const avgDelaySec = (minDelay + maxDelay) / 2;
    const numInstances = Math.max(selectedInstanceIds.length, 1);

    const totalSeconds = (totalRecipients * avgDelaySec) / numInstances;
    const minutes = Math.ceil(totalSeconds / 60);

    if (minutes < 60) return `~${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `~${hours}h ${remMin}min`;
  }, [audienceType, importSummary.valid, audienceCount, minDelay, maxDelay, selectedInstanceIds.length]);

  // Filtro de busca na tabela de revisão
  const filteredReviewContacts = useMemo(() => {
    const term = reviewSearchTerm.toLowerCase().trim();
    if (audienceType === "import") {
      if (!term) return importSummary.rows;
      return importSummary.rows.filter(
        (r) =>
          String(r.name || "").toLowerCase().includes(term) ||
          String(r.phone || "").toLowerCase().includes(term)
      );
    } else {
      if (!term) return previewContacts;
      return previewContacts.filter(
        (c) =>
          String(c.name || "").toLowerCase().includes(term) ||
          String(c.phone || "").toLowerCase().includes(term)
      );
    }
  }, [audienceType, importSummary.rows, previewContacts, reviewSearchTerm]);

  // Mutation de criação da campanha
  const createMutation = useMutation({
    mutationFn: () => {
      let importedRecipientsList: any[] | undefined = undefined;
      if (audienceType === "import") {
        importedRecipientsList = parsedRows.map((r) => {
          const rawPhone = r[phoneCol];
          const rawName = nameCol ? r[nameCol] : undefined;
          const { [phoneCol]: _, [nameCol]: __, ...rest } = r;
          return {
            phone: rawPhone,
            name: rawName,
            customVariables: rest,
          };
        });
      }

      return createCampaignAction({
        data: {
          companyId,
          unitId: unitId === "all" ? null : unitId,
          name: campaignName.trim(),
          description: description.trim() || undefined,
          audienceType,
          audienceFilters:
            audienceType === "segment"
              ? {
                  inactivity_days: useInactivity ? inactivityDays : null,
                  tags: selectedTags,
                  unit_ids: unitId === "all" ? undefined : [unitId],
                  only_without_open_conversations: onlyWithoutOpenConvs,
                }
              : undefined,
          importedRecipients: importedRecipientsList,
          saveImportedToContacts,
          messageType,
          content: messageContent,
          mediaUrl: mediaUrl.trim() || null,
          mediaName: mediaName.trim() || null,
          whatsappInstanceIds: selectedInstanceIds,
          settings: {
            min_delay_seconds: minDelay,
            max_delay_seconds: maxDelay,
            batch_size: batchSize,
            batch_cooldown_seconds: batchCooldown,
            allowed_start_time: allowedStart,
            allowed_end_time: allowedEnd,
            allowed_days: [1, 2, 3, 4, 5, 6],
          },
          scheduledAt: scheduleMode === "schedule" && scheduledDate ? scheduledDate : null,
          startImmediately: scheduleMode === "now",
        },
      });
    },
    onSuccess: (data) => {
      toast.success(`Campanha criada com sucesso! ${data.totalRecipients} destinatários na fila.`);
      qc.invalidateQueries({ queryKey: ["campaigns-list"] });
      onOpenChange(false);
      onSuccess?.();
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao criar campanha");
    },
  });

  const resetForm = () => {
    setStep(1);
    setCampaignName("");
    setDescription("");
    setParsedRows([]);
    setImportFileName(null);
    setAudienceCount(null);
    setPreviewContacts([]);
    setMediaUrl("");
    setMediaName("");
    setMessageType("text");
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!campaignName.trim()) {
        toast.error("Informe um nome para a campanha.");
        return;
      }
      if (audienceType === "import") {
        if (parsedRows.length === 0 || !phoneCol) {
          toast.error("Importe uma planilha e selecione a coluna de telefone.");
          return;
        }
        if (importSummary.valid === 0) {
          toast.error("Nenhum número de telefone válido encontrado.");
          return;
        }
      } else {
        if (audienceCount === null) {
          await calculateAudienceCount();
        }
        if (audienceCount === 0) {
          toast.error("Nenhum contato encontrado com os critérios selecionados.");
          return;
        }
      }
    } else if (step === 2) {
      if (!messageContent.trim()) {
        toast.error("Escreva o texto da mensagem.");
        return;
      }
    } else if (step === 3) {
      if (selectedInstanceIds.length === 0) {
        toast.error("Selecione ao menos 1 instância de WhatsApp conectada.");
        return;
      }
      if (scheduleMode === "schedule" && !scheduledDate) {
        toast.error("Selecione a data e hora do agendamento.");
        return;
      }
    }
    setStep((s) => (s < 4 ? ((s + 1) as any) : s));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Nova Campanha de Disparo em Massa
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              Passo {step} de 4
            </Badge>
          </div>
          <DialogDescription>
            Configure público, mensagem, rotação de chips e proteção anti-bloqueio.
          </DialogDescription>
        </DialogHeader>

        {/* Barra de Progresso das Etapas */}
        <div className="grid grid-cols-4 gap-2 py-2 border-b">
          <div
            className={`text-xs font-medium pb-1 border-b-2 text-center ${
              step >= 1 ? "border-primary text-primary font-bold" : "border-muted text-muted-foreground"
            }`}
          >
            1. Público-Alvo
          </div>
          <div
            className={`text-xs font-medium pb-1 border-b-2 text-center ${
              step >= 2 ? "border-primary text-primary font-bold" : "border-muted text-muted-foreground"
            }`}
          >
            2. Mensagem & Mídia
          </div>
          <div
            className={`text-xs font-medium pb-1 border-b-2 text-center ${
              step >= 3 ? "border-primary text-primary font-bold" : "border-muted text-muted-foreground"
            }`}
          >
            3. Canais & Anti-Ban
          </div>
          <div
            className={`text-xs font-medium pb-1 border-b-2 text-center ${
              step === 4 ? "border-primary text-primary font-bold" : "border-muted text-muted-foreground"
            }`}
          >
            4. Revisão da Lista
          </div>
        </div>

        {/* ===================== PASSO 1: AUDIÊNCIA ===================== */}
        {step === 1 && (
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Nome da Campanha *</Label>
                <Input
                  id="camp-name"
                  placeholder="Ex: Reativação Inativos - Novembro"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="camp-unit">Unidade Associada</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger id="camp-unit">
                    <SelectValue placeholder="Todas as Unidades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Unidades</SelectItem>
                    {accessibleUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Seletor de Tipo de Audiência */}
            <div className="space-y-2">
              <Label>Origem dos Contatos</Label>
              <div className="grid grid-cols-2 gap-3">
                <Card
                  onClick={() => setAudienceType("segment")}
                  className={`p-4 cursor-pointer transition-all border-2 ${
                    audienceType === "segment"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Filter className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold text-sm">Segmentar Base Atendi</div>
                      <div className="text-xs text-muted-foreground">
                        Por inatividade, tags e filtros inteligentes
                      </div>
                    </div>
                  </div>
                </Card>

                <Card
                  onClick={() => setAudienceType("import")}
                  className={`p-4 cursor-pointer transition-all border-2 ${
                    audienceType === "import"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Upload className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold text-sm">Importar Planilha</div>
                      <div className="text-xs text-muted-foreground">
                        Carregar lista de contatos (.csv, .xlsx)
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* Seção 1A: Segmentação Dinâmica da Base */}
            {audienceType === "segment" && (
              <Card className="p-4 bg-muted/20 border-dashed space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Critério de Inatividade</Label>
                    <p className="text-xs text-muted-foreground">
                      Contatar clientes sem interação com a empresa há um determinado número de dias
                    </p>
                  </div>
                  <Switch checked={useInactivity} onCheckedChange={setUseInactivity} />
                </div>

                {useInactivity && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Sem falar com a empresa há pelo menos:</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={inactivityDays}
                          onChange={(e) => setInactivityDays(Math.max(1, Number(e.target.value)))}
                          className="w-20 h-8 text-sm font-bold text-center"
                        />
                        <span className="text-xs font-semibold text-muted-foreground">dias</span>
                      </div>
                    </div>

                    <Slider
                      value={[inactivityDays]}
                      min={1}
                      max={180}
                      step={1}
                      onValueChange={(vals) => setInactivityDays(vals[0])}
                    />

                    {/* Botões Rápidos de Dias (Presets) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-muted-foreground mr-1">Atalhos rápidos:</span>
                      {INACTIVITY_PRESETS.map((days) => (
                        <Button
                          key={days}
                          type="button"
                          size="sm"
                          variant={inactivityDays === days ? "default" : "outline"}
                          className="h-6 px-2 text-xs rounded-full"
                          onClick={() => setInactivityDays(days)}
                        >
                          {days} dias
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtro por Tags */}
                {labels.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs">Filtrar por Tags da Base (opcional)</Label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border rounded-md bg-background">
                      {labels.map((lbl) => {
                        const isSelected = selectedTags.includes(lbl.name);
                        return (
                          <Badge
                            key={lbl.id}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={() => {
                              setSelectedTags((prev) =>
                                isSelected ? prev.filter((t) => t !== lbl.name) : [...prev, lbl.name]
                              );
                            }}
                          >
                            {lbl.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filtro de conversa aberta */}
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="no-open"
                    checked={onlyWithoutOpenConvs}
                    onCheckedChange={(c) => setOnlyWithoutOpenConvs(!!c)}
                  />
                  <Label htmlFor="no-open" className="text-xs cursor-pointer">
                    Apenas contatos sem conversas ativas ou aguardando no momento (evita duplicar com atendente)
                  </Label>
                </div>

                {/* Contador de Audiência em Tempo Real */}
                <div className="pt-2 flex items-center justify-between border-t">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={calculateAudienceCount}
                    disabled={isCalculatingCount}
                  >
                    {isCalculatingCount ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Recalcular
                  </Button>

                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-md">
                    <Users className="h-4 w-4" />
                    {isCalculatingCount ? (
                      <span className="text-xs text-muted-foreground animate-pulse">Calculando...</span>
                    ) : (
                      <span>{(audienceCount ?? 0).toLocaleString("pt-BR")} contatos selecionados</span>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Seção 1B: Importação de Planilha */}
            {audienceType === "import" && (
              <Card className="p-4 bg-muted/20 border-dashed space-y-4">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-background hover:bg-muted/30 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {importFileName || "Arraste ou selecione seu arquivo .CSV ou .XLSX"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Planilhas do Excel ou CSV exportadas de outros CRMs
                  </p>
                  <label className="mt-3 cursor-pointer">
                    <Button size="sm" variant="secondary" asChild>
                      <span>Selecionar Arquivo</span>
                    </Button>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                {columnHeaders.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Coluna do Telefone *</Label>
                        <Select value={phoneCol} onValueChange={setPhoneCol}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a coluna" />
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

                      <div className="space-y-1">
                        <Label className="text-xs">Coluna do Nome (opcional)</Label>
                        <Select value={nameCol} onValueChange={setNameCol}>
                          <SelectTrigger>
                            <SelectValue placeholder="Nenhuma / Padrão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhuma (usar 'Cliente')</SelectItem>
                            {columnHeaders.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <Checkbox
                        id="save-contacts"
                        checked={saveImportedToContacts}
                        onCheckedChange={(c) => setSaveImportedToContacts(!!c)}
                      />
                      <Label htmlFor="save-contacts" className="text-xs cursor-pointer">
                        Salvar novos contatos automaticamente na base de contatos do Atendi
                      </Label>
                    </div>

                    {importSummary.total > 0 && (
                      <div className="bg-background border rounded-lg p-3 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-emerald-600">
                            {importSummary.valid} números válidos
                          </span>{" "}
                          de {importSummary.total} linhas encontradas.
                        </div>
                        {importSummary.total - importSummary.valid > 0 && (
                          <span className="text-rose-500">
                            {importSummary.total - importSummary.valid} inválidos ignorados
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ===================== PASSO 2: MENSAGEM & MÍDIA ===================== */}
        {step === 2 && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Editor de Texto & Anexos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Texto da Mensagem</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-primary"
                    onClick={() => setTestSeed((s) => s + 1)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Testar Spintax
                  </Button>
                </div>

                <Textarea
                  rows={7}
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Escreva sua mensagem aqui..."
                  className="font-sans text-sm resize-none"
                />

                {/* Variáveis Clicáveis */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Inserir Variáveis:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: "Primeiro Nome", tag: "{{primeiro_nome}}" },
                      { label: "Nome Completo", tag: "{{cliente}}" },
                      { label: "Saudação", tag: "{{saudacao}}" },
                      { label: "Unidade", tag: "{{unidade}}" },
                      { label: "Telefone", tag: "{{telefone}}" },
                    ].map((v) => (
                      <Badge
                        key={v.tag}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary/20 text-xs"
                        onClick={() => setMessageContent((prev) => prev + " " + v.tag)}
                      >
                        {v.label}
                      </Badge>
                    ))}
                    {audienceType === "import" &&
                      columnHeaders
                        .filter((h) => h !== phoneCol && h !== nameCol)
                        .slice(0, 5)
                        .map((h) => (
                          <Badge
                            key={h}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/20 text-xs"
                            onClick={() => setMessageContent((prev) => `${prev} {{${h}}}`)}
                          >
                            coluna: {h}
                          </Badge>
                        ))}
                  </div>
                </div>

                {/* Dica de Spintax Anti-Bloqueio */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Dica Anti-Bloqueio (Spintax):</span> Use chaves e barras para
                    variar o texto automaticamente, ex: <br />
                    <code>{"{Olá|Oi|Oie} {{primeiro_nome}}, {tudo bem?|como vai?}"}</code>
                  </div>
                </div>

                {/* ANEXAR MÍDIA (UPLOAD DIRETO DE ARQUIVO) */}
                <Card className="p-3 bg-muted/20 border space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-primary" />
                      Anexar Arquivo de Mídia
                    </Label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMediaMode("upload")}
                        className={`text-[11px] px-2 py-0.5 rounded ${
                          mediaMode === "upload" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                        }`}
                      >
                        Enviar Arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaMode("url")}
                        className={`text-[11px] px-2 py-0.5 rounded ${
                          mediaMode === "url" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                        }`}
                      >
                        Por Link/URL
                      </button>
                    </div>
                  </div>

                  {mediaUrl ? (
                    <div className="flex items-center justify-between p-2.5 bg-background border rounded-lg">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {messageType === "image" && <ImageIcon className="h-4 w-4 text-emerald-500 shrink-0" />}
                        {messageType === "video" && <Video className="h-4 w-4 text-purple-500 shrink-0" />}
                        {messageType === "audio" && <Music className="h-4 w-4 text-amber-500 shrink-0" />}
                        {messageType === "document" && <FileText className="h-4 w-4 text-blue-500 shrink-0" />}
                        <div className="truncate text-xs">
                          <span className="font-semibold">{mediaName || "Arquivo Anexado"}</span>
                          <span className="text-[10px] text-muted-foreground block uppercase font-mono">
                            {messageType}
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-500 shrink-0"
                        onClick={handleRemoveMedia}
                        title="Remover anexo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : mediaMode === "upload" ? (
                    <div className="flex flex-col items-center justify-center p-4 border border-dashed rounded-lg bg-background hover:bg-muted/30 transition-colors">
                      {isUploadingMedia ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          Fazendo upload do arquivo...
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2 text-muted-foreground mb-1.5">
                            <ImageIcon className="h-4 w-4" />
                            <Video className="h-4 w-4" />
                            <Music className="h-4 w-4" />
                            <FileText className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-medium">Selecione uma Imagem, Vídeo, Áudio ou PDF</p>
                          <label className="mt-2 cursor-pointer">
                            <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                              <span>Escolher do Computador</span>
                            </Button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                              className="hidden"
                              onChange={handleMediaUpload}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Cole a URL pública da imagem, vídeo ou PDF"
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          className="text-xs flex-1"
                        />
                        <Select
                          value={messageType}
                          onValueChange={(val: any) => setMessageType(val)}
                        >
                          <SelectTrigger className="w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image">Imagem</SelectItem>
                            <SelectItem value="video">Vídeo</SelectItem>
                            <SelectItem value="audio">Áudio</SelectItem>
                            <SelectItem value="document">PDF</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Preview WhatsApp */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" />
                  Pré-visualização no WhatsApp
                </Label>

                <div className="bg-[#0b141a] dark:bg-[#111b21] rounded-xl p-4 min-h-[300px] flex flex-col justify-end border shadow-inner">
                  <div className="bg-[#005c4b] text-white p-3.5 rounded-lg max-w-[92%] self-end shadow-sm text-sm whitespace-pre-wrap font-sans relative">
                    {/* Renderizador de Mídia no Mockup */}
                    {mediaUrl && (
                      <div className="mb-2 rounded overflow-hidden">
                        {messageType === "image" ? (
                          <img
                            src={mediaUrl}
                            alt="Mídia"
                            className="max-h-48 w-full object-cover rounded"
                          />
                        ) : messageType === "audio" ? (
                          <div className="bg-black/30 rounded p-2 flex items-center gap-2 text-xs">
                            <Music className="h-4 w-4 text-emerald-300 shrink-0" />
                            <span>Mensagem de Voz (Áudio)</span>
                          </div>
                        ) : messageType === "video" ? (
                          <div className="bg-black/40 rounded p-4 flex flex-col items-center justify-center text-xs">
                            <Video className="h-6 w-6 text-emerald-300 mb-1" />
                            <span>Vídeo anexado</span>
                          </div>
                        ) : (
                          <div className="bg-black/30 rounded p-2.5 flex items-center gap-2 text-xs">
                            <FileText className="h-5 w-5 text-blue-300 shrink-0" />
                            <div className="truncate">
                              <span className="font-semibold block truncate">{mediaName || "documento.pdf"}</span>
                              <span className="text-[10px] text-emerald-200">PDF</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {messagePreview || "Digite seu texto ao lado..."}
                    <div className="text-[10px] text-emerald-200 text-right mt-1.5">
                      14:32 ✓✓
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Variáveis e Spintax são resolvidos dinamicamente para cada destinatário.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PASSO 3: CANAIS & ANTI-BAN ===================== */}
        {step === 3 && (
          <div className="space-y-5 pt-2">
            {/* Seleção de Conexões */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Instâncias de WhatsApp (Canais de Envio)</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedInstanceIds.length} selecionada(s)
                </span>
              </div>

              {connectedInstances.length === 0 ? (
                <div className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Nenhuma instância de WhatsApp conectada no momento. Conecte um canal no menu de Configurações antes de disparar.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {connectedInstances.map((inst) => {
                    const isChecked = selectedInstanceIds.includes(inst.id);
                    return (
                      <Card
                        key={inst.id}
                        onClick={() => {
                          setSelectedInstanceIds((prev) =>
                            isChecked ? prev.filter((id) => id !== inst.id) : [...prev, inst.id]
                          );
                        }}
                        className={`p-3 cursor-pointer border transition-all flex items-center justify-between ${
                          isChecked
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox checked={isChecked} />
                          <div>
                            <div className="text-sm font-semibold">{inst.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {inst.instance_name}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                          Conectado
                        </Badge>
                      </Card>
                    );
                  })}
                </div>
              )}

              {selectedInstanceIds.length > 1 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Rotação de Chips Ativada!</strong> Os envios serão distribuídos igualmente entre as{" "}
                    {selectedInstanceIds.length} instâncias em modo Round-Robin.
                  </span>
                </div>
              )}
            </div>

            {/* Delays Aleatórios & Proteção Anti-Bloqueio */}
            <Card className="p-4 bg-muted/20 border-dashed space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  Intervalo Humano Aleatório (Jitter Anti-Ban)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Simula pausas humanas irregulares entre uma mensagem e outra para não ser bloqueado pela Meta.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Intervalo Mínimo (segundos)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    value={minDelay}
                    onChange={(e) => setMinDelay(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Intervalo Máximo (segundos)</Label>
                  <Input
                    type="number"
                    min={20}
                    max={300}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Math.max(minDelay, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Enviar em lotes de (mensagens)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={50}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pausa de respiro entre lotes (segundos)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={600}
                    value={batchCooldown}
                    onChange={(e) => setBatchCooldown(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Janela de Horário */}
              <div className="pt-2 border-t space-y-2">
                <Label className="text-xs font-semibold">Janela de Horário Permitido (Brasília)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="time"
                    value={allowedStart}
                    onChange={(e) => setAllowedStart(e.target.value)}
                    className="w-32 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={allowedEnd}
                    onChange={(e) => setAllowedEnd(e.target.value)}
                    className="w-32 text-xs"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se a campanha não terminar até o horário limite, ela pausa sozinha e retoma no dia seguinte.
                </p>
              </div>
            </Card>

            {/* Agendamento */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Momento do Disparo</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === "now"}
                    onChange={() => setScheduleMode("now")}
                  />
                  <span>Iniciar imediatamente após salvar</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === "schedule"}
                    onChange={() => setScheduleMode("schedule")}
                  />
                  <span>Agendar para data e hora</span>
                </label>
              </div>

              {scheduleMode === "schedule" && (
                <div className="pt-1">
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-64 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== PASSO 4: REVISÃO & LISTA COMPLETA ===================== */}
        {step === 4 && (
          <div className="space-y-4 pt-2">
            {/* Cards de Resumo */}
            <Card className="p-4 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h3 className="text-base font-bold">{campaignName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {audienceType === "segment" ? "Segmentação da Base Atendi" : "Importação de Planilha"}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {scheduleMode === "now" ? "Disparo Imediato" : "Agendada"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block">Destinatários:</span>
                  <span className="font-bold text-sm text-foreground">
                    {audienceType === "import"
                      ? `${importSummary.valid} contatos`
                      : `${audienceCount || 0} contatos`}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block">Instâncias WhatsApp:</span>
                  <span className="font-bold text-sm text-foreground">
                    {selectedInstanceIds.length} chip(s)
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block">Delays Anti-Ban:</span>
                  <span className="font-bold text-sm text-foreground">
                    {minDelay}s a {maxDelay}s
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block">Tempo Estimado:</span>
                  <span className="font-bold text-sm text-emerald-600 font-mono">
                    {estimatedTime}
                  </span>
                </div>
              </div>
            </Card>

            {/* TABELA COM TODOS OS CONTATOS DA LISTA */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  Lista de Destinatários ({filteredReviewContacts.length}{" "}
                  {audienceType === "segment" && previewContacts.length > 0 && `de ${previewContacts.length}`} contatos)
                </Label>

                <div className="relative w-48">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={reviewSearchTerm}
                    onChange={(e) => setReviewSearchTerm(e.target.value)}
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>

              {isLoadingPreviewContacts ? (
                <div className="py-8 text-center text-xs text-muted-foreground border rounded-lg flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Carregando lista completa de contatos da audiência...
                </div>
              ) : filteredReviewContacts.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border rounded-lg">
                  Nenhum contato encontrado.
                </div>
              ) : (
                <div className="border rounded-lg max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1">Contato</TableHead>
                        <TableHead className="text-xs py-1">Telefone</TableHead>
                        {audienceType === "segment" ? (
                          <>
                            <TableHead className="text-xs py-1">Última Interação</TableHead>
                            <TableHead className="text-xs py-1">Tags</TableHead>
                          </>
                        ) : (
                          <TableHead className="text-xs py-1">Dados Extras</TableHead>
                        )}
                        <TableHead className="text-xs py-1 text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviewContacts.slice(0, 150).map((c: any, idx: number) => {
                        const name = c.name || "Sem nome";
                        const phone = c.phone || "";
                        const isValid = audienceType === "import" ? c.isValid !== false : true;

                        return (
                          <TableRow key={idx} className="h-8 text-xs">
                            <TableCell className="py-1 font-medium">{name}</TableCell>
                            <TableCell className="py-1 font-mono text-[11px]">{phone}</TableCell>
                            {audienceType === "segment" ? (
                              <>
                                <TableCell className="py-1 text-muted-foreground text-[11px]">
                                  {c.last_interaction ? (
                                    formatDistanceToNow(new Date(c.last_interaction), {
                                      addSuffix: true,
                                      locale: ptBR,
                                    })
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                                <TableCell className="py-1">
                                  <div className="flex gap-1 overflow-hidden">
                                    {(c.tags || []).slice(0, 2).map((t: string) => (
                                      <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0">
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                              </>
                            ) : (
                              <TableCell className="py-1 text-[11px] text-muted-foreground truncate max-w-[140px]">
                                {Object.entries(c.extras || {})
                                  .filter(([k]) => k !== phoneCol && k !== nameCol)
                                  .slice(0, 2)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(", ") || "-"}
                              </TableCell>
                            )}
                            <TableCell className="py-1 text-right">
                              {isValid ? (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                                  Pronto
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  Inválido
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filteredReviewContacts.length > 150 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Exibindo os primeiros 150 contatos de {filteredReviewContacts.length}. Todos os {filteredReviewContacts.length} serão disparados.
                </p>
              )}
            </div>

            {/* Amostra da Mensagem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amostra do Texto:</Label>
              <div className="bg-background border rounded-lg p-3 text-xs whitespace-pre-wrap">
                {messagePreview}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => ((s - 1) as any))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button type="button" onClick={handleNext}>
              Avançar
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Criando Fila de Disparo...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  {scheduleMode === "now" ? "Iniciar Disparos Agora" : "Agendar Campanha"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
