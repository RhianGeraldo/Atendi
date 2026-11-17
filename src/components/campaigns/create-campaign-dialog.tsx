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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
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
  UserCheck,
  UserPlus,
  Ban,
  Tag,
  Target,
  MapPin,
  Briefcase,
  MessageSquare,
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
  ChevronDown,
  ChevronUp,
  Sliders,
  Zap,
  Check,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccessibleUnits } from "@/lib/hooks/use-accessible-units";
import { useContactSources, getSourceIcon } from "@/lib/use-contact-sources";
import {
  createCampaignAction,
  previewAudienceCountAction,
  previewAudienceContactsAction,
} from "@/lib/api/campaigns.functions";
import { renderCampaignMessage, sanitizeCampaignPhone } from "@/lib/campaign-template";

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

  // Wizard Step: 1 = Informações Básicas, 2 = Segmentação Avançada, 3 = Mensagem & Variações, 4 = Canais & Anti-Ban, 5 = Revisão da Lista
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Informações Básicas
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [unitId, setUnitId] = useState<string>("all");

  // Audiência
  const [audienceType, setAudienceType] = useState<"segment" | "import">("segment");

  // Módulo de Origem no Atendi (Passo 2): CRM, Atendimentos (chat), Base Geral ou Todoo
  const [targetModule, setTargetModule] = useState<"crm" | "chat" | "general" | "todoo">("crm");

  // Critérios de Segmentação - Base Geral & Ciclo
  const [contactType, setContactType] = useState<"all" | "lead" | "client">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedDdds, setSelectedDdds] = useState<string[]>([]);
  const [dddInput, setDddInput] = useState<string>("");

  // Critérios de Segmentação - Atendimentos (Chat)
  const [inactivityDays, setInactivityDays] = useState<number>(30);
  const [useInactivity, setUseInactivity] = useState<boolean>(true);
  const [onlyWithoutOpenConvs, setOnlyWithoutOpenConvs] = useState<boolean>(true);

  // Critérios de Segmentação - CRM (Funis & Etapas)
  const [crmScope, setCrmScope] = useState<"all_funnel" | "specific_stages">("all_funnel");
  const [crmMode, setCrmMode] = useState<"with" | "without">("with");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedCrmStatuses, setSelectedCrmStatuses] = useState<string[]>(["open"]);

  // Critérios de Segmentação - Meu Todoo (Ações Comerciais & Cadência)
  const [todooMode, setTodooMode] = useState<"with" | "without">("with");
  const [selectedTodooCampaignIds, setSelectedTodooCampaignIds] = useState<string[]>([]);
  const [selectedTodooStageIds, setSelectedTodooStageIds] = useState<string[]>([]);
  const [selectedTodooLeadStatuses, setSelectedTodooLeadStatuses] = useState<string[]>([]);

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [isCalculatingCount, setIsCalculatingCount] = useState(false);

  // Consulta origens configuradas da empresa
  const { data: contactSources = [] } = useContactSources();

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
  const [unitCol, setUnitCol] = useState<string>("");
  const [saveImportedToContacts, setSaveImportedToContacts] = useState(true);

  const selectedUnit = useMemo(
    () => accessibleUnits.find((u) => u.id === unitId),
    [accessibleUnits, unitId],
  );

  // Mensagens & Variações (Teste A/B)
  interface CampaignVariationDraft {
    id: string;
    name: string;
    messageType: "text" | "image" | "video" | "audio" | "document";
    content: string;
    mediaUrl: string;
    mediaName: string;
    mediaMode: "upload" | "url";
  }

  const [variations, setVariations] = useState<CampaignVariationDraft[]>([
    {
      id: "v-1",
      name: "Variação 1",
      messageType: "text",
      content:
        "{Olá|Oi|Oie} {{primeiro_nome}}, tudo bem? Estamos com condições especiais na {{unidade}} este mês para você!",
      mediaUrl: "",
      mediaName: "",
      mediaMode: "upload",
    },
  ]);
  const [activeVariationId, setActiveVariationId] = useState<string>("v-1");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [testSeed, setTestSeed] = useState(0);

  const activeVariation = useMemo(
    () => variations.find((v) => v.id === activeVariationId) || variations[0],
    [variations, activeVariationId],
  );

  const updateActiveVariation = (updates: Partial<CampaignVariationDraft>) => {
    setVariations((prev) =>
      prev.map((v) => (v.id === activeVariation.id ? { ...v, ...updates } : v)),
    );
  };

  const addVariation = () => {
    const nextIdx = variations.length + 1;
    const newId = `v-${Date.now()}`;
    setVariations((prev) => [
      ...prev,
      {
        id: newId,
        name: `Variação ${nextIdx}`,
        messageType: "text",
        content: `Oi {{primeiro_nome}}! Confira nossa novidade na {{unidade}}.`,
        mediaUrl: "",
        mediaName: "",
        mediaMode: "upload",
      },
    ]);
    setActiveVariationId(newId);
  };

  const removeVariation = (idToRemove: string) => {
    if (variations.length <= 1) return;
    const updated = variations.filter((v) => v.id !== idToRemove);
    setVariations(updated);
    if (activeVariationId === idToRemove) {
      setActiveVariationId(updated[0].id);
    }
  };

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

  // Estados para UI/UX aprimorada
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [enableAbTesting, setEnableAbTesting] = useState(false);
  const [speedPreset, setSpeedPreset] = useState<"safe" | "moderate" | "custom">("safe");
  const [showFullReviewList, setShowFullReviewList] = useState(false);

  const applySpeedPreset = (preset: "safe" | "moderate" | "custom") => {
    setSpeedPreset(preset);
    if (preset === "safe") {
      setMinDelay(15);
      setMaxDelay(45);
      setBatchSize(20);
      setBatchCooldown(60);
    } else if (preset === "moderate") {
      setMinDelay(10);
      setMaxDelay(25);
      setBatchSize(30);
      setBatchCooldown(45);
    }
  };

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

  const availableTags = useMemo(() => {
    return (labels || []).map((l: any) => l.name);
  }, [labels]);

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
    [instances],
  );

  // Busca funis e etapas do CRM da empresa
  const { data: pipelines = [] } = useQuery({
    queryKey: ["campaign-pipelines", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data: pipes, error: pErr } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      if (pErr) {
        console.error("[campaign-pipelines] Erro ao buscar funis:", pErr);
        return [];
      }
      if (!pipes || pipes.length === 0) return [];

      const pipeIds = pipes.map((p) => p.id);
      const { data: stages, error: sErr } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, order, pipeline_id")
        .in("pipeline_id", pipeIds)
        .order("order", { ascending: true });

      if (sErr) {
        console.error("[campaign-pipelines] Erro ao buscar etapas:", sErr);
      }

      return pipes.map((p: any) => ({
        ...p,
        pipeline_stages: (stages || []).filter((s: any) => s.pipeline_id === p.id),
      }));
    },
  });

  // Funis com etapas devidamente ordenadas por posição (order ASC)
  const sortedPipelines = useMemo(() => {
    return (pipelines || []).map((p: any) => ({
      ...p,
      pipeline_stages: [...(p.pipeline_stages || [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      ),
    }));
  }, [pipelines]);

  // Pré-seleciona o primeiro funil assim que carregado se não houver um selecionado
  useEffect(() => {
    if (sortedPipelines.length > 0) {
      const exists = sortedPipelines.some((p: any) => p.id === selectedPipelineId);
      if (!exists) {
        setSelectedPipelineId(sortedPipelines[0].id);
      }
    }
  }, [sortedPipelines, selectedPipelineId]);

  const currentPipeline = useMemo(() => {
    if (!selectedPipelineId) return sortedPipelines[0] || null;
    return (
      sortedPipelines.find((p: any) => p.id === selectedPipelineId) || sortedPipelines[0] || null
    );
  }, [sortedPipelines, selectedPipelineId]);

  // Etapas disponíveis conforme o funil selecionado
  const availablePipelineStages = useMemo(() => {
    if (currentPipeline) {
      return currentPipeline.pipeline_stages || [];
    }
    return [];
  }, [currentPipeline]);

  // Busca contagem exata de oportunidades abertas por etapa para exibir na esteira do funil
  const { data: stageOppCounts = {} } = useQuery({
    queryKey: ["campaign-stage-opp-counts", companyId, selectedPipelineId],
    enabled:
      open && !!companyId && targetModule === "crm" && !!currentPipeline?.pipeline_stages?.length,
    queryFn: async () => {
      if (!currentPipeline?.pipeline_stages?.length) return {};
      const stageIds = currentPipeline.pipeline_stages.map((s: any) => s.id);
      const map: Record<string, { total: number; open: number }> = {};

      await Promise.all(
        stageIds.map(async (sId: string) => {
          const { count } = await supabase
            .from("opportunities")
            .select("*", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("stage_id", sId)
            .eq("status", "open");

          map[sId] = { total: count ?? 0, open: count ?? 0 };
        }),
      );

      return map;
    },
  });

  // Busca ações comerciais do Meu Todoo
  const { data: todooCampaigns = [] } = useQuery({
    queryKey: ["campaign-todoo-campaigns", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("todoo_campaigns") as any)
        .select("id, title, status, unit_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  // Busca etapas da cadência do Todoo
  const { data: todooStages = [] } = useQuery({
    queryKey: ["campaign-todoo-stages", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data } = await (supabase.from("todoo_stages") as any)
        .select("id, name, color, kind, position")
        .eq("company_id", companyId)
        .order("position");
      return (data || []) as any[];
    },
  });

  // Manipuladores de Filtros Avançados
  const handleAddDdd = (dddToAdd?: string) => {
    const raw = dddToAdd || dddInput;
    if (!raw.trim()) return;
    const chunks = raw
      .split(/[\s,;-]+/)
      .map((s) => s.replace(/\D/g, ""))
      .filter((s) => s.length >= 2 && s.length <= 3);
    if (chunks.length === 0) {
      const cleaned = raw.replace(/\D/g, "");
      if (cleaned.length >= 2) chunks.push(cleaned.slice(0, 2));
    }
    if (chunks.length > 0) {
      setSelectedDdds((prev) => Array.from(new Set([...prev, ...chunks])));
      setDddInput("");
    }
  };

  const handleRemoveDdd = (ddd: string) => {
    setSelectedDdds((prev) => prev.filter((d) => d !== ddd));
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName],
    );
  };

  const toggleExcludedTag = (tagName: string) => {
    setExcludedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName],
    );
  };

  const toggleSource = (sourceName: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceName) ? prev.filter((s) => s !== sourceName) : [...prev, sourceName],
    );
  };

  const toggleStageId = (stageId: string) => {
    setSelectedStageIds((prev) =>
      prev.includes(stageId) ? prev.filter((s) => s !== stageId) : [...prev, stageId],
    );
  };

  const toggleCrmStatus = (statusKey: string) => {
    setSelectedCrmStatuses((prev) =>
      prev.includes(statusKey) ? prev.filter((s) => s !== statusKey) : [...prev, statusKey],
    );
  };

  const toggleTodooCampaign = (campId: string) => {
    setSelectedTodooCampaignIds((prev) =>
      prev.includes(campId) ? prev.filter((id) => id !== campId) : [...prev, campId],
    );
  };

  const toggleTodooStage = (stageId: string) => {
    setSelectedTodooStageIds((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId],
    );
  };

  const toggleTodooStatus = (st: string) => {
    setSelectedTodooLeadStatuses((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st],
    );
  };

  // Helper centralizado para montar o payload de filtros da audiência
  const getAudienceFiltersPayload = () => {
    const isCrm = targetModule === "crm";
    const isChat = targetModule === "chat";
    const isTodoo = targetModule === "todoo";

    return {
      // Refinamento de perfil comum
      contact_type: contactType,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      excluded_tags: excludedTags.length > 0 ? excludedTags : undefined,
      sources: selectedSources.length > 0 ? selectedSources : undefined,
      ddds: selectedDdds.length > 0 ? selectedDdds : undefined,
      unit_ids: unitId && unitId !== "all" ? [unitId] : undefined,

      // Módulo Atendimentos (Chat)
      inactivity_days: isChat && useInactivity ? inactivityDays : null,
      only_without_open_conversations: isChat ? onlyWithoutOpenConvs : false,

      // Módulo CRM (Funis & Etapas)
      crm_enabled: isCrm,
      crm_mode: isCrm ? "with" : undefined,
      crm_pipeline_ids: (() => {
        if (!isCrm) return undefined;
        const pId =
          selectedPipelineId && selectedPipelineId !== "all"
            ? selectedPipelineId
            : currentPipeline?.id && currentPipeline.id !== "all"
              ? currentPipeline.id
              : undefined;
        return pId ? [pId] : undefined;
      })(),
      crm_stage_ids:
        isCrm && crmScope === "specific_stages" && selectedStageIds.length > 0
          ? selectedStageIds
          : undefined,
      crm_statuses: isCrm && selectedCrmStatuses.length > 0 ? selectedCrmStatuses : undefined,

      // Módulo Meu Todoo
      todoo_enabled: isTodoo,
      todoo_mode: isTodoo ? "with" : undefined,
      todoo_campaign_ids:
        isTodoo && selectedTodooCampaignIds.length > 0 ? selectedTodooCampaignIds : undefined,
      todoo_stage_ids:
        isTodoo && selectedTodooStageIds.length > 0 ? selectedTodooStageIds : undefined,
      todoo_lead_statuses:
        isTodoo && selectedTodooLeadStatuses.length > 0 ? selectedTodooLeadStatuses : undefined,
    };
  };

  // Cálculo automático da audiência com debounce quando os filtros mudam
  useEffect(() => {
    if (!open || audienceType !== "segment" || !companyId) return;

    const timer = setTimeout(() => {
      calculateAudienceCount();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    targetModule,
    crmScope,
    selectedPipelineId,
    selectedStageIds,
    selectedCrmStatuses,
    inactivityDays,
    useInactivity,
    onlyWithoutOpenConvs,
    contactType,
    selectedTags,
    excludedTags,
    selectedSources,
    selectedDdds,
    unitId,
    selectedTodooCampaignIds,
    selectedTodooStageIds,
    selectedTodooLeadStatuses,
    open,
    audienceType,
    companyId,
  ]);

  const calculateAudienceCount = async () => {
    setIsCalculatingCount(true);
    try {
      const res = await previewAudienceCountAction({
        data: {
          companyId,
          filters: getAudienceFiltersPayload(),
        },
      });
      setAudienceCount(res.count);
    } catch (e: any) {
      console.error("[campaigns] Erro ao calcular audiência:", e);
    } finally {
      setIsCalculatingCount(false);
    }
  };

  // Carrega contatos detalhados ao entrar no Passo 5 (Revisão)
  useEffect(() => {
    if (step === 5 && audienceType === "segment" && companyId) {
      setIsLoadingPreviewContacts(true);
      previewAudienceContactsAction({
        data: {
          companyId,
          filters: getAudienceFiltersPayload(),
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
  }, [
    step,
    audienceType,
    companyId,
    targetModule,
    crmScope,
    selectedPipelineId,
    selectedStageIds,
    selectedCrmStatuses,
    inactivityDays,
    useInactivity,
    onlyWithoutOpenConvs,
    contactType,
    selectedTags,
    excludedTags,
    selectedSources,
    selectedDdds,
    unitId,
    selectedTodooCampaignIds,
    selectedTodooStageIds,
    selectedTodooLeadStatuses,
  ]);

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

      updateActiveVariation({
        mediaUrl: publicData.publicUrl,
        mediaName: file.name,
        messageType: detectedType,
      });
      toast.success(`Arquivo "${file.name}" anexado à ${activeVariation.name}!`);
    } catch (err: any) {
      toast.error("Falha ao enviar arquivo: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveMedia = () => {
    updateActiveVariation({
      mediaUrl: "",
      mediaName: "",
      messageType: "text",
    });
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
    const phoneIdx = lower.findIndex(
      (h) =>
        h.includes("tel") ||
        h.includes("cel") ||
        h.includes("phone") ||
        h.includes("whatsapp") ||
        h.includes("contato"),
    );
    if (phoneIdx !== -1) setPhoneCol(headers[phoneIdx]);

    const nameIdx = lower.findIndex(
      (h) =>
        h.includes("nome") || h.includes("name") || h.includes("cliente") || h.includes("lead"),
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
      activeVariation?.content || "",
      {
        clientName: dummyClient,
        phone: dummyPhone,
        companyName: "Nossa Empresa",
        unitName: "Unidade Central",
        customVariables: importSummary.rows[0]?.extras || {},
      },
      true,
    );
  }, [activeVariation?.content, audienceType, importSummary, previewContacts, testSeed]);

  // Tempo estimado de disparo
  const estimatedTime = useMemo(() => {
    const totalRecipients = audienceType === "import" ? importSummary.valid : audienceCount || 0;
    const avgDelaySec = (minDelay + maxDelay) / 2;
    const numInstances = Math.max(selectedInstanceIds.length, 1);

    const totalSeconds = (totalRecipients * avgDelaySec) / numInstances;
    const minutes = Math.ceil(totalSeconds / 60);

    if (minutes < 60) return `~${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `~${hours}h ${remMin}min`;
  }, [
    audienceType,
    importSummary.valid,
    audienceCount,
    minDelay,
    maxDelay,
    selectedInstanceIds.length,
  ]);

  // Filtro de busca na tabela de revisão
  const filteredReviewContacts = useMemo(() => {
    const term = reviewSearchTerm.toLowerCase().trim();
    if (audienceType === "import") {
      if (!term) return importSummary.rows;
      return importSummary.rows.filter(
        (r) =>
          String(r.name || "")
            .toLowerCase()
            .includes(term) ||
          String(r.phone || "")
            .toLowerCase()
            .includes(term),
      );
    } else {
      if (!term) return previewContacts;
      return previewContacts.filter(
        (c) =>
          String(c.name || "")
            .toLowerCase()
            .includes(term) ||
          String(c.phone || "")
            .toLowerCase()
            .includes(term),
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

          let matchedUnitId: string | null = null;
          if (unitCol && r[unitCol]) {
            const rawUnitStr = String(r[unitCol])
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            const found = accessibleUnits.find((u) => {
              const uNorm = u.name
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
              return rawUnitStr.includes(uNorm) || uNorm.includes(rawUnitStr);
            });
            if (found) matchedUnitId = found.id;
          }
          if (!matchedUnitId && unitId !== "all") {
            matchedUnitId = unitId;
          }

          const { [phoneCol]: _, [nameCol]: __, [unitCol]: ___, ...rest } = r;
          return {
            phone: rawPhone,
            name: rawName,
            unitId: matchedUnitId,
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
          audienceFilters: audienceType === "segment" ? getAudienceFiltersPayload() : undefined,
          importedRecipients: importedRecipientsList,
          saveImportedToContacts,
          messages: variations.map((v) => ({
            name: v.name.trim() || "Variação",
            messageType: v.messageType,
            content: v.content,
            mediaUrl: v.mediaUrl.trim() || null,
            mediaName: v.mediaName.trim() || null,
          })),
          messageType: variations[0]?.messageType || "text",
          content: variations[0]?.content || "",
          mediaUrl: variations[0]?.mediaUrl.trim() || null,
          mediaName: variations[0]?.mediaName.trim() || null,
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
    setUnitId("all");
    setUnitCol("");
    setSelectedTags([]);
    setExcludedTags([]);
    setContactType("all");
    setSelectedSources([]);
    setSelectedDdds([]);
    setDddInput("");
    setInactivityDays(30);
    setUseInactivity(true);
    setOnlyWithoutOpenConvs(true);
    setTargetModule("crm");

    // CRM
    setCrmScope("all_funnel");
    setCrmMode("with");
    setSelectedPipelineId("");
    setSelectedStageIds([]);
    setSelectedCrmStatuses(["open"]);

    // Todoo
    setTodooMode("with");
    setSelectedTodooCampaignIds([]);
    setSelectedTodooStageIds([]);
    setSelectedTodooLeadStatuses([]);

    setSelectedInstanceIds([]);
    setScheduleMode("now");
    setScheduledDate("");
    setShowAdvancedFilters(false);
    setEnableAbTesting(false);
    setSpeedPreset("safe");
    setShowFullReviewList(false);
    setVariations([
      {
        id: "v-1",
        name: "Variação 1",
        messageType: "text",
        content:
          "{Olá|Oi|Oie} {{primeiro_nome}}, tudo bem? Estamos com condições especiais na {{unidade}} este mês para você!",
        mediaUrl: "",
        mediaName: "",
        mediaMode: "upload",
      },
    ]);
    setActiveVariationId("v-1");
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!campaignName.trim()) {
        toast.error("Informe um nome para a campanha.");
        return;
      }
      setStep(2);
      return;
    } else if (step === 2) {
      if (audienceType === "import") {
        if (parsedRows.length === 0 || !phoneCol) {
          toast.error("Importe uma planilha e selecione a coluna do telefone.");
          return;
        }
        if (importSummary.valid === 0) {
          toast.error("Nenhum número de telefone válido encontrado na planilha.");
          return;
        }
      } else {
        if (
          targetModule === "crm" &&
          crmScope === "specific_stages" &&
          selectedStageIds.length === 0
        ) {
          toast.error("Selecione ao menos 1 etapa do funil ou marque 'O Funil Todo'.");
          return;
        }
        if (audienceCount === null) {
          await calculateAudienceCount();
        }
        if (audienceCount === 0) {
          toast.error("Nenhum contato qualificado encontrado com os critérios selecionados.");
          return;
        }
      }
      setStep(3);
      return;
    } else if (step === 3) {
      const emptyVariation = variations.find((v) => !v.content.trim());
      if (emptyVariation) {
        toast.error(`A "${emptyVariation.name}" não possui texto configurado.`);
        setActiveVariationId(emptyVariation.id);
        return;
      }
      setStep(4);
      return;
    } else if (step === 4) {
      if (selectedInstanceIds.length === 0) {
        toast.error("Selecione ao menos 1 instância de WhatsApp conectada.");
        return;
      }
      if (scheduleMode === "schedule" && !scheduledDate) {
        toast.error("Selecione a data e hora do agendamento.");
        return;
      }
      setStep(5);
      return;
    }
  };

  const handleBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as any) : s));
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
              Passo {step} de 5
            </Badge>
          </div>
          <DialogDescription>
            Configure público, mensagens personalizadas e canais de envio da campanha.
          </DialogDescription>
        </DialogHeader>

        {/* Barra de Progresso das Etapas (Sempre 5 passos previsíveis) */}
        <div className="grid grid-cols-5 gap-1.5 py-2 border-b">
          {[
            { num: 1, label: "1. Identificação" },
            { num: 2, label: "2. Destinatários" },
            { num: 3, label: "3. Mensagem" },
            { num: 4, label: "4. Disparo" },
            { num: 5, label: "5. Revisão" },
          ].map((st) => (
            <div
              key={st.num}
              className={`text-xs pb-1.5 border-b-2 text-center transition-all ${
                step >= st.num
                  ? "border-primary text-primary font-bold"
                  : "border-muted text-muted-foreground font-medium"
              }`}
            >
              {st.label}
            </div>
          ))}
        </div>

        {/* ===================== PASSO 1: IDENTIFICAÇÃO & FONTE ===================== */}
        {step === 1 && (
          <div className="space-y-6 pt-2">
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
                <Label htmlFor="camp-unit">Unidade da Campanha</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger id="camp-unit">
                    <SelectValue placeholder="Todas as Unidades (Geral da Empresa)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Unidades (Geral da Empresa)</SelectItem>
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
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-semibold">
                De onde virão os destinatários desta campanha?
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Card
                  onClick={() => setAudienceType("segment")}
                  className={`p-4 cursor-pointer transition-all border-2 ${
                    audienceType === "segment"
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-background"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        audienceType === "segment"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Filter className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Base de Clientes & CRM Atendi</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Filtre por funis e etapas do CRM, inatividade em atendimentos, Meu Todoo ou
                        base geral de contatos.
                      </div>
                    </div>
                  </div>
                </Card>

                <Card
                  onClick={() => setAudienceType("import")}
                  className={`p-4 cursor-pointer transition-all border-2 ${
                    audienceType === "import"
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "border-border hover:border-primary/40 bg-background"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        audienceType === "import"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Importar Planilha Externa</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Faça upload de uma lista de contatos em formato Excel (.xlsx) ou CSV de
                        outro sistema.
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PASSO 2: DESTINATÁRIOS (PLANILHA) ===================== */}
        {step === 2 && audienceType === "import" && (
          <div className="space-y-4 pt-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Importar Lista de Contatos
              </h3>
              <p className="text-xs text-muted-foreground">
                Carregue um arquivo Excel (.xlsx) ou CSV com os telefones dos destinatários.
              </p>
            </div>

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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                    <div className="space-y-1">
                      <Label className="text-xs">Coluna da Unidade (opcional)</Label>
                      <Select value={unitCol} onValueChange={setUnitCol}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhuma / Padrão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">
                            {unitId !== "all"
                              ? `Padrão: ${selectedUnit?.name || "Unidade"}`
                              : "Nenhuma (Geral da Empresa)"}
                          </SelectItem>
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
                </div>
              )}
            </Card>

            {/* Barra de Contatos Válidos da Planilha */}
            <div className="p-3 bg-muted/40 border rounded-lg flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {importSummary.total > 0 ? (
                  <span>
                    Arquivo: <strong>{importFileName}</strong> &bull; {importSummary.valid} válidos
                    de {importSummary.total} linhas
                  </span>
                ) : (
                  <span>Faça o upload do arquivo acima para continuar</span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-500/10 px-3.5 py-1 rounded-md border border-emerald-500/20">
                <Users className="h-4 w-4" />
                <span>{importSummary.valid.toLocaleString("pt-BR")} contatos válidos</span>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PASSO 2: DESTINATÁRIOS (BASE ATENDI) ===================== */}
        {step === 2 && audienceType === "segment" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  Segmentação do Público-Alvo
                </h3>
                <p className="text-xs text-muted-foreground">
                  Filtre por dados da base geral, funis do CRM ou ações comerciais do Meu Todoo.
                </p>
              </div>

              {/* Botão de reset rápido */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground h-7"
                onClick={() => {
                  setContactType("all");
                  setSelectedTags([]);
                  setExcludedTags([]);
                  setSelectedSources([]);
                  setSelectedDdds([]);
                  setUseInactivity(true);
                  setInactivityDays(30);
                  setTargetModule("crm");
                  setCrmScope("all_funnel");
                  setSelectedPipelineId(sortedPipelines[0]?.id || "");
                  setSelectedStageIds([]);
                  setSelectedCrmStatuses(["open"]);
                  setSelectedTodooCampaignIds([]);
                  setSelectedTodooStageIds([]);
                  setSelectedTodooLeadStatuses([]);
                }}
              >
                Limpar filtros
              </Button>
            </div>

            {/* SELETOR PRINCIPAL DE MÓDULO DE ORIGEM (4 GRANDES OPÇÕES) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                1. De onde você deseja extrair o público no Atendi?
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* 1. Funis do CRM */}
                <button
                  type="button"
                  onClick={() => setTargetModule("crm")}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    targetModule === "crm"
                      ? "bg-blue-500/10 border-blue-600 text-blue-950 dark:text-blue-100 ring-1 ring-blue-500 shadow-sm"
                      : "bg-background border-border hover:border-border/80 text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Briefcase
                      className={`h-4 w-4 ${targetModule === "crm" ? "text-blue-600" : "text-muted-foreground"}`}
                    />
                    {targetModule === "crm" && (
                      <Badge className="bg-blue-600 text-white text-[9px] h-4 px-1.5 font-mono">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Funis do CRM</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">
                      Funil completo ou etapa específica (Etapa X)
                    </div>
                  </div>
                </button>

                {/* 2. Atendimentos */}
                <button
                  type="button"
                  onClick={() => setTargetModule("chat")}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    targetModule === "chat"
                      ? "bg-amber-500/10 border-amber-600 text-amber-950 dark:text-amber-100 ring-1 ring-amber-500 shadow-sm"
                      : "bg-background border-border hover:border-border/80 text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <MessageSquare
                      className={`h-4 w-4 ${targetModule === "chat" ? "text-amber-600" : "text-muted-foreground"}`}
                    />
                    {targetModule === "chat" && (
                      <Badge className="bg-amber-600 text-white text-[9px] h-4 px-1.5 font-mono">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Atendimentos</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">
                      Inativos no chat e histórico de conversas
                    </div>
                  </div>
                </button>

                {/* 3. Base Geral */}
                <button
                  type="button"
                  onClick={() => setTargetModule("general")}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    targetModule === "general"
                      ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary shadow-sm"
                      : "bg-background border-border hover:border-border/80 text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Users
                      className={`h-4 w-4 ${targetModule === "general" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    {targetModule === "general" && (
                      <Badge className="bg-primary text-primary-foreground text-[9px] h-4 px-1.5 font-mono">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Base Geral</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">
                      Todos os contatos cadastrados da empresa
                    </div>
                  </div>
                </button>

                {/* 4. Meu Todoo */}
                <button
                  type="button"
                  onClick={() => setTargetModule("todoo")}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    targetModule === "todoo"
                      ? "bg-emerald-500/10 border-emerald-600 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500 shadow-sm"
                      : "bg-background border-border hover:border-border/80 text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Target
                      className={`h-4 w-4 ${targetModule === "todoo" ? "text-emerald-600" : "text-muted-foreground"}`}
                    />
                    {targetModule === "todoo" && (
                      <Badge className="bg-emerald-600 text-white text-[9px] h-4 px-1.5 font-mono">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-xs">Meu Todoo</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">
                      Ações comerciais e cadências ativas
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* PAINEL ESPECÍFICO DO MÓDULO SELECIONADO */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                2. Configurações da Origem (
                {targetModule === "crm"
                  ? "CRM"
                  : targetModule === "chat"
                    ? "Atendimentos"
                    : targetModule === "general"
                      ? "Base Geral"
                      : "Meu Todoo"}
                )
              </Label>

              {/* OPÇÃO 1: CRM (FUNIS & ETAPAS) */}
              {targetModule === "crm" && (
                <Card className="p-4 bg-muted/20 border-blue-500/30 space-y-4">
                  {/* Seleção de Funil */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-blue-600" />
                        Funil de Vendas
                      </Label>
                      {currentPipeline && (
                        <span className="text-[11px] text-muted-foreground">
                          {currentPipeline.pipeline_stages?.length || 0} etapa(s) no funil
                        </span>
                      )}
                    </div>
                    <Select
                      value={selectedPipelineId || currentPipeline?.id || ""}
                      onValueChange={(val) => {
                        setSelectedPipelineId(val);
                        setSelectedStageIds([]);
                      }}
                    >
                      <SelectTrigger className="text-xs bg-background">
                        <SelectValue placeholder="Selecione o Funil de Vendas" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedPipelines.length === 0 && (
                          <SelectItem value="none" disabled>
                            Nenhum funil cadastrado
                          </SelectItem>
                        )}
                        {sortedPipelines.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Escopo do Disparo neste Funil: Funil Todo vs Etapa X */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <Label className="text-xs font-semibold">
                      O que você deseja enviar deste funil?
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCrmScope("all_funnel");
                          setSelectedStageIds([]);
                        }}
                        className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-left flex items-start gap-2.5 ${
                          crmScope === "all_funnel"
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-background hover:bg-muted/50 border-border text-foreground"
                        }`}
                      >
                        <div
                          className={`mt-0.5 rounded-full p-1 shrink-0 ${
                            crmScope === "all_funnel" ? "bg-white/20" : "bg-muted"
                          }`}
                        >
                          <Users className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">O Funil Todo</div>
                          <div
                            className={`text-[10px] ${
                              crmScope === "all_funnel" ? "text-blue-100" : "text-muted-foreground"
                            }`}
                          >
                            Dispara para todas as oportunidades deste funil, independentemente da
                            etapa.
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCrmScope("specific_stages")}
                        className={`p-2.5 rounded-lg border text-xs font-medium transition-all text-left flex items-start gap-2.5 ${
                          crmScope === "specific_stages"
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                            : "bg-background hover:bg-muted/50 border-border text-foreground"
                        }`}
                      >
                        <div
                          className={`mt-0.5 rounded-full p-1 shrink-0 ${
                            crmScope === "specific_stages" ? "bg-white/20" : "bg-muted"
                          }`}
                        >
                          <Target className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">Etapas Específicas (Etapa X)</div>
                          <div
                            className={`text-[10px] ${
                              crmScope === "specific_stages"
                                ? "text-blue-100"
                                : "text-muted-foreground"
                            }`}
                          >
                            Dispara exclusivamente para quem está na(s) etapa(s) selecionada(s).
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Se escolheu Etapas Específicas: Esteira Kanban Visual */}
                  {crmScope === "specific_stages" && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-xs font-semibold flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-blue-600" />
                            Selecione a(s) Etapa(s) do Funil:
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Clique na etapa desejada na esteira abaixo para direcionar o disparo
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedStageIds(availablePipelineStages.map((s: any) => s.id))
                            }
                            className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                          >
                            Selecionar Todas
                          </button>
                          {selectedStageIds.length > 0 && (
                            <>
                              <span className="text-muted-foreground text-xs">•</span>
                              <button
                                type="button"
                                onClick={() => setSelectedStageIds([])}
                                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                              >
                                Limpar ({selectedStageIds.length})
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Esteira de Cards das Etapas */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1 max-h-52 overflow-y-auto pr-1">
                        {availablePipelineStages.map((stage: any, idx: number) => {
                          const isSelected = selectedStageIds.includes(stage.id);
                          const oppCount = stageOppCounts[stage.id]?.open ?? 0;
                          return (
                            <div
                              key={stage.id}
                              onClick={() => toggleStageId(stage.id)}
                              className={`p-2.5 rounded-lg border cursor-pointer transition-all flex flex-col justify-between gap-1.5 text-left ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-1 ring-blue-500"
                                  : "bg-background hover:bg-muted/50 border-border text-foreground"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-[9px] font-mono px-1 py-0.2 rounded font-semibold ${
                                    isSelected
                                      ? "bg-white/20 text-white"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  Etapa {idx + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span
                                    className="w-2 h-2 rounded-full ring-1 ring-white/50"
                                    style={{ backgroundColor: stage.color || "#3b82f6" }}
                                  />
                                  {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                                </div>
                              </div>

                              <div className="font-semibold text-xs line-clamp-2">{stage.name}</div>

                              <div
                                className={`flex items-center justify-between text-[10px] pt-1 border-t ${
                                  isSelected
                                    ? "border-white/20 text-blue-100"
                                    : "border-border/50 text-muted-foreground"
                                }`}
                              >
                                <span>No Kanban:</span>
                                <span className="font-bold font-mono">
                                  {oppCount} {oppCount === 1 ? "oportunidade" : "oportunidades"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {selectedStageIds.length === 0 ? (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          ⚠️ Nenhuma etapa selecionada. Clique em uma ou mais etapas acima para
                          definir o público.
                        </p>
                      ) : (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                          ✓ {selectedStageIds.length} etapa(s) selecionada(s) para o disparo.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Status das Oportunidades no CRM */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        Status das Oportunidades no CRM
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        (Padrão: Apenas Em Aberto)
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "open", label: "Em Aberto (Ativas)" },
                        { key: "won", label: "Ganhas (Vendas)" },
                        { key: "lost", label: "Perdidas" },
                      ].map((st) => {
                        const isSelected = selectedCrmStatuses.includes(st.key);
                        return (
                          <button
                            key={st.key}
                            type="button"
                            onClick={() => toggleCrmStatus(st.key)}
                            className={`p-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? st.key === "won"
                                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                  : st.key === "lost"
                                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                                    : "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-background hover:bg-muted/50 border-border text-muted-foreground"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="h-3 w-3" />}
                            <span>{st.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              )}

              {/* OPÇÃO 2: ATENDIMENTOS (CHAT & CONVERSAS) */}
              {targetModule === "chat" && (
                <Card className="p-4 bg-muted/20 border-amber-500/30 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-amber-600" />
                          Critério de Inatividade no Atendimento
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Contatar clientes sem interação com a empresa há um determinado número de
                          dias
                        </p>
                      </div>
                      <Switch checked={useInactivity} onCheckedChange={setUseInactivity} />
                    </div>

                    {useInactivity && (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            Sem falar com a empresa há pelo menos:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              value={inactivityDays}
                              onChange={(e) =>
                                setInactivityDays(Math.max(1, Number(e.target.value)))
                              }
                              className="w-20 h-8 text-sm font-bold text-center bg-background"
                            />
                            <span className="text-xs font-semibold text-muted-foreground">
                              dias
                            </span>
                          </div>
                        </div>

                        <Slider
                          value={[inactivityDays]}
                          min={1}
                          max={180}
                          step={1}
                          onValueChange={(vals) => setInactivityDays(vals[0])}
                        />

                        {/* Presets Rápidos */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-muted-foreground mr-1">Atalhos:</span>
                          {INACTIVITY_PRESETS.map((days) => (
                            <button
                              key={days}
                              type="button"
                              onClick={() => setInactivityDays(days)}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                                inactivityDays === days
                                  ? "bg-amber-600 text-white border-amber-600 font-bold"
                                  : "bg-background hover:bg-muted border-border text-muted-foreground"
                              }`}
                            >
                              {days} dias
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Proteção de conversas em andamento */}
                  <div className="flex items-center space-x-2 pt-2 border-t border-border/50">
                    <Checkbox
                      id="no-open"
                      checked={onlyWithoutOpenConvs}
                      onCheckedChange={(c) => setOnlyWithoutOpenConvs(!!c)}
                    />
                    <Label htmlFor="no-open" className="text-xs cursor-pointer">
                      Apenas contatos sem conversas ativas ou aguardando no momento (evita duplicar
                      com atendente)
                    </Label>
                  </div>
                </Card>
              )}

              {/* OPÇÃO 3: BASE GERAL DE CONTATOS */}
              {targetModule === "general" && (
                <Card className="p-4 bg-muted/20 border-primary/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-semibold">Toda a Base de Contatos</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O disparo será direcionado a todos os contatos cadastrados da sua empresa na
                    base do Atendi. Você pode refinar por perfil (Leads vs Clientes), Tags ou DDDs
                    logo abaixo.
                  </p>
                </Card>
              )}

              {/* OPÇÃO 4: MEU TODOO */}
              {targetModule === "todoo" && (
                <Card className="p-4 bg-muted/20 border-emerald-500/30 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-emerald-600" />
                        Ações Comerciais / Campanhas do Todoo
                      </Label>
                      {selectedTodooCampaignIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedTodooCampaignIds([])}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Limpar ações ({selectedTodooCampaignIds.length})
                        </button>
                      )}
                    </div>
                    {todooCampaigns.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 border rounded-md bg-background">
                        {todooCampaigns.map((camp: any) => {
                          const isSelected = selectedTodooCampaignIds.includes(camp.id);
                          return (
                            <Badge
                              key={camp.id}
                              variant={isSelected ? "default" : "outline"}
                              className="cursor-pointer text-xs flex items-center gap-1.5"
                              onClick={() => toggleTodooCampaign(camp.id)}
                            >
                              <span>{camp.title}</span>
                              {camp.status && (
                                <span className="text-[10px] opacity-75 font-mono">
                                  ({camp.status})
                                </span>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Nenhuma ação comercial encontrada no Meu Todoo.
                      </p>
                    )}
                  </div>

                  {/* Etapas do Todoo */}
                  {todooStages.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          Etapas da Cadência (opcional)
                        </Label>
                        {selectedTodooStageIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedTodooStageIds([])}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          >
                            Limpar etapas ({selectedTodooStageIds.length})
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 border rounded-md bg-background">
                        {todooStages.map((st: any) => {
                          const isSelected = selectedTodooStageIds.includes(st.id);
                          return (
                            <Badge
                              key={st.id}
                              variant={isSelected ? "default" : "outline"}
                              className="cursor-pointer text-xs flex items-center gap-1.5"
                              style={{
                                backgroundColor: isSelected ? st.color || undefined : undefined,
                              }}
                              onClick={() => toggleTodooStage(st.id)}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: st.color || "#10b981" }}
                              />
                              <span>{st.name}</span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Status do Lead no Todoo */}
                  <div className="space-y-1.5 pt-1 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Status do Lead no Todoo</Label>
                      {selectedTodooLeadStatuses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedTodooLeadStatuses([])}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Limpar status ({selectedTodooLeadStatuses.length})
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: "pending", label: "Aguardando Contato" },
                        { key: "contacted", label: "Em Contato / Cadência" },
                        { key: "scheduled", label: "Agendou Avaliação" },
                        { key: "quoted", label: "Enviou Orçamento" },
                        { key: "won", label: "Fechou Contrato" },
                        { key: "lost", label: "Sem Interesse / Perdido" },
                        { key: "callback", label: "Pediu Retorno" },
                      ].map((st) => {
                        const isSelected = selectedTodooLeadStatuses.includes(st.key);
                        return (
                          <Badge
                            key={st.key}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleTodooStatus(st.key)}
                          >
                            {st.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* SEÇÃO 3: PERFIL DO CONTATO (LEAD VS CLIENTE) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  3. Perfil do Contato
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {contactType === "all"
                    ? "Toda a base qualificada"
                    : contactType === "lead"
                      ? "Apenas prospectos que ainda não converteram"
                      : "Apenas clientes com histórico de compra"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setContactType("all")}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    contactType === "all"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm ring-1 ring-primary"
                      : "bg-background hover:bg-muted/50 border-border text-muted-foreground"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>Todos os Contatos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContactType("lead")}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    contactType === "lead"
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-1 ring-blue-500"
                      : "bg-background hover:bg-muted/50 border-border text-muted-foreground"
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Apenas Leads</span>
                </button>
                <button
                  type="button"
                  onClick={() => setContactType("client")}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    contactType === "client"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm ring-1 ring-emerald-500"
                      : "bg-background hover:bg-muted/50 border-border text-muted-foreground"
                  }`}
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Apenas Clientes</span>
                </button>
              </div>
            </div>

            {/* SEÇÃO 4: FILTROS ADICIONAIS OPCIONAIS (TAGS E REGIÃO) EM ACORDEÃO */}
            <div className="border rounded-lg bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full p-3 flex items-center justify-between text-xs font-semibold hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-muted-foreground" />
                  <span>Filtros Adicionais: Tags e Região (Opcional)</span>
                  {(selectedTags.length > 0 ||
                    excludedTags.length > 0 ||
                    selectedDdds.length > 0) && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                      {[
                        selectedTags.length > 0 && `${selectedTags.length} tag(s)`,
                        excludedTags.length > 0 && `${excludedTags.length} excluída(s)`,
                        selectedDdds.length > 0 && `${selectedDdds.length} DDD(s)`,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </Badge>
                  )}
                </div>
                {showAdvancedFilters ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {showAdvancedFilters && (
                <div className="p-4 border-t space-y-4 bg-muted/10">
                  {/* Tags de Inclusão e Exclusão */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-primary" />
                          Incluir Tags (Contato precisa ter ao menos uma)
                        </Label>
                        {selectedTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedTags([])}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          >
                            Limpar ({selectedTags.length})
                          </button>
                        )}
                      </div>
                      {availableTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 border rounded-md bg-background">
                          {availableTags.map((tag) => {
                            const isSelected = selectedTags.includes(tag);
                            return (
                              <Badge
                                key={tag}
                                variant={isSelected ? "default" : "outline"}
                                className="cursor-pointer text-xs"
                                onClick={() => toggleTag(tag)}
                              >
                                {tag}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Nenhuma etiqueta cadastrada nos contatos.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5 text-rose-600">
                          <Ban className="h-3.5 w-3.5" />
                          Excluir Tags (Contatos com essas tags NUNCA receberão)
                        </Label>
                        {excludedTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExcludedTags([])}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          >
                            Limpar ({excludedTags.length})
                          </button>
                        )}
                      </div>
                      {availableTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 border rounded-md bg-background">
                          {availableTags.map((tag) => {
                            const isExcluded = excludedTags.includes(tag);
                            return (
                              <Badge
                                key={tag}
                                variant={isExcluded ? "destructive" : "outline"}
                                className="cursor-pointer text-xs"
                                onClick={() => toggleExcludedTag(tag)}
                              >
                                {tag}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* DDDs */}
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        Filtro Regional por DDDs Telefônicos
                      </Label>
                      {selectedDdds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedDdds([])}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Limpar ({selectedDdds.length})
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: 11, 21, 31 ou digite e aperte Enter"
                        value={dddInput}
                        onChange={(e) => setDddInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddDdd();
                          }
                        }}
                        className="text-xs h-8 bg-background"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAddDdd()}
                        className="h-8 text-xs shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Adicionar DDD
                      </Button>
                    </div>
                    {selectedDdds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedDdds.map((ddd) => (
                          <Badge
                            key={ddd}
                            variant="secondary"
                            className="text-xs font-mono flex items-center gap-1 pl-2 pr-1 py-0.5"
                          >
                            <span>DDD ({ddd})</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDdd(ddd)}
                              className="hover:bg-muted rounded p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* BARRA INFERIOR DE CÁLCULO EM TEMPO REAL */}
            <div className="p-3 bg-muted/40 border rounded-lg flex items-center justify-between">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={calculateAudienceCount}
                disabled={isCalculatingCount}
                className="h-8 text-xs bg-background"
              >
                {isCalculatingCount ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Recalcular
              </Button>

              <div className="text-right">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-500/10 px-3.5 py-1 rounded-md border border-emerald-500/20">
                  <Users className="h-4 w-4" />
                  {isCalculatingCount ? (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Calculando audiência...
                    </span>
                  ) : (
                    <span>
                      {(audienceCount ?? 0).toLocaleString("pt-BR")} contatos qualificados
                    </span>
                  )}
                </div>
                {!isCalculatingCount && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {targetModule === "crm" && (
                      <span>
                        CRM: {currentPipeline?.name || "Funil"} &bull;{" "}
                        {crmScope === "specific_stages"
                          ? `${selectedStageIds.length} etapa(s) selecionada(s)`
                          : "Funil Completo"}
                      </span>
                    )}
                    {targetModule === "chat" && (
                      <span>
                        Atendimentos &bull;{" "}
                        {useInactivity
                          ? `Sem falar há ${inactivityDays}+ dias`
                          : "Sem filtro de dias"}
                      </span>
                    )}
                    {targetModule === "general" && <span>Base Geral de Contatos</span>}
                    {targetModule === "todoo" && <span>Meu Todoo (Ações Comerciais)</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== PASSO 3: MENSAGEM & MÍDIA ===================== */}
        {step === 3 && (
          <div className="space-y-4 pt-2">
            {/* Toggle Opcional de Teste A/B */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  Teste A/B de Mensagem (Opcional)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Crie variações de texto ou mídias diferentes para avaliar qual tem maior
                  engajamento.
                </p>
              </div>
              <Switch
                checked={enableAbTesting}
                onCheckedChange={(checked) => {
                  setEnableAbTesting(checked);
                  if (!checked && variations.length > 1) {
                    setVariations([variations[0]]);
                    setActiveVariationId(variations[0].id);
                  }
                }}
              />
            </div>

            {/* Gerenciador de Variações de Mensagem (Aparece somente com Teste A/B ativo) */}
            {enableAbTesting && (
              <div className="space-y-2 p-3 border rounded-lg bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">
                    Variações Ativas ({variations.length})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addVariation}
                    className="h-7 text-xs bg-background"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Nova Variação
                  </Button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {variations.map((v, idx) => {
                    const isCurrent = v.id === activeVariation.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => setActiveVariationId(v.id)}
                        className={`cursor-pointer px-3 py-1 rounded-md text-xs font-medium border flex items-center gap-2 transition-all shrink-0 ${
                          isCurrent
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background hover:bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {v.messageType === "image" && <ImageIcon className="h-3 w-3 shrink-0" />}
                        {v.messageType === "video" && <Video className="h-3 w-3 shrink-0" />}
                        {v.messageType === "audio" && <Music className="h-3 w-3 shrink-0" />}
                        {v.messageType === "document" && <FileText className="h-3 w-3 shrink-0" />}
                        <span>{v.name || `Variação ${idx + 1}`}</span>
                        {variations.length > 1 && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeVariation(v.id);
                            }}
                            className="hover:text-rose-300 ml-1 p-0.5 rounded"
                            title="Remover esta variação"
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Editor de Texto & Anexos da Variação Ativa */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs font-semibold">Nome da Variação</Label>
                    <Input
                      value={activeVariation.name}
                      onChange={(e) => updateActiveVariation({ name: e.target.value })}
                      placeholder="Ex: Variação 1 (Vídeo Curto)"
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">&nbsp;</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-primary"
                      onClick={() => setTestSeed((s) => s + 1)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Testar Spintax
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Texto / Legenda</Label>
                  <Textarea
                    rows={6}
                    value={activeVariation.content}
                    onChange={(e) => updateActiveVariation({ content: e.target.value })}
                    placeholder="Escreva sua mensagem aqui..."
                    className="font-sans text-sm resize-none"
                  />
                </div>

                {/* Variáveis Clicáveis */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Inserir Variáveis:
                  </span>
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
                        onClick={() =>
                          updateActiveVariation({
                            content:
                              (activeVariation.content ? activeVariation.content + " " : "") +
                              v.tag,
                          })
                        }
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
                            onClick={() =>
                              updateActiveVariation({
                                content:
                                  (activeVariation.content ? activeVariation.content + " " : "") +
                                  `{{${h}}}`,
                              })
                            }
                          >
                            coluna: {h}
                          </Badge>
                        ))}
                  </div>
                </div>

                {/* Dica de Spintax Anti-Bloqueio */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-2 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Spintax Suportado:</span> Use chaves e barras para
                    variações no texto, ex: <code>{"{Olá|Oi|Oie} {{primeiro_nome}}"}</code>
                  </div>
                </div>

                {/* ANEXAR MÍDIA DA VARIAÇÃO ATIVA */}
                <Card className="p-3 bg-muted/20 border space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-primary" />
                      Mídia desta Variação (Opcional)
                    </Label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateActiveVariation({ mediaMode: "upload" })}
                        className={`text-[11px] px-2 py-0.5 rounded ${
                          activeVariation.mediaMode === "upload"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        Enviar Arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveVariation({ mediaMode: "url" })}
                        className={`text-[11px] px-2 py-0.5 rounded ${
                          activeVariation.mediaMode === "url"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        Por Link/URL
                      </button>
                    </div>
                  </div>

                  {activeVariation.mediaUrl ? (
                    <div className="flex items-center justify-between p-2.5 bg-background border rounded-lg">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {activeVariation.messageType === "image" && (
                          <ImageIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                        )}
                        {activeVariation.messageType === "video" && (
                          <Video className="h-4 w-4 text-purple-500 shrink-0" />
                        )}
                        {activeVariation.messageType === "audio" && (
                          <Music className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        {activeVariation.messageType === "document" && (
                          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                        <div className="truncate text-xs">
                          <span className="font-semibold block truncate">
                            {activeVariation.mediaName || "Arquivo Anexado"}
                          </span>
                          <span className="text-[10px] text-muted-foreground block uppercase font-mono">
                            {activeVariation.messageType}
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
                  ) : activeVariation.mediaMode === "upload" ? (
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
                          <p className="text-xs font-medium">
                            Selecione uma Imagem, Vídeo, Áudio ou PDF
                          </p>
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
                          value={activeVariation.mediaUrl}
                          onChange={(e) => updateActiveVariation({ mediaUrl: e.target.value })}
                          className="text-xs flex-1"
                        />
                        <Select
                          value={activeVariation.messageType}
                          onValueChange={(val: any) => updateActiveVariation({ messageType: val })}
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

              {/* Preview WhatsApp da Variação Ativa */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4" />
                    Pré-visualização: {activeVariation.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {activeVariation.messageType}
                  </Badge>
                </Label>

                <div className="bg-[#0b141a] dark:bg-[#111b21] rounded-xl p-4 min-h-[300px] flex flex-col justify-end border shadow-inner">
                  <div className="bg-[#005c4b] text-white p-3.5 rounded-lg max-w-[92%] self-end shadow-sm text-sm whitespace-pre-wrap font-sans relative">
                    {/* Renderizador de Mídia no Mockup */}
                    {activeVariation.mediaUrl && (
                      <div className="mb-2 rounded overflow-hidden">
                        {activeVariation.messageType === "image" ? (
                          <img
                            src={activeVariation.mediaUrl}
                            alt="Mídia"
                            className="max-h-48 w-full object-cover rounded"
                          />
                        ) : activeVariation.messageType === "audio" ? (
                          <div className="bg-black/30 rounded p-2 flex items-center gap-2 text-xs">
                            <Music className="h-4 w-4 text-emerald-300 shrink-0" />
                            <span>Mensagem de Voz (Áudio)</span>
                          </div>
                        ) : activeVariation.messageType === "video" ? (
                          <div className="bg-black/40 rounded p-4 flex flex-col items-center justify-center text-xs">
                            <Video className="h-6 w-6 text-emerald-300 mb-1" />
                            <span>Vídeo anexado</span>
                          </div>
                        ) : (
                          <div className="bg-black/30 rounded p-2.5 flex items-center gap-2 text-xs">
                            <FileText className="h-5 w-5 text-blue-300 shrink-0" />
                            <div className="truncate">
                              <span className="font-semibold block truncate">
                                {activeVariation.mediaName || "documento.pdf"}
                              </span>
                              <span className="text-[10px] text-emerald-200">PDF</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {messagePreview || "Digite seu texto ao lado..."}
                    <div className="text-[10px] text-emerald-200 text-right mt-1.5">14:32 ✓✓</div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Variáveis e Spintax desta variação são resolvidos dinamicamente no momento do
                  envio.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PASSO 4: CANAIS & ANTI-BAN ===================== */}
        {step === 4 && (
          <div className="space-y-5 pt-2">
            {/* Seleção de Conexões */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <Label className="text-sm font-semibold">
                    Instâncias de WhatsApp (Canais de Envio da Empresa)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selecione as instâncias que farão os disparos. Estão listadas todas as
                    instâncias da empresa.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2 text-primary"
                    onClick={() => setSelectedInstanceIds(connectedInstances.map((i) => i.id))}
                  >
                    Marcar Todas
                  </Button>
                  {unitId !== "all" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 text-primary"
                      onClick={() => {
                        const unitInstances = connectedInstances.filter(
                          (i) => i.unit_id === unitId,
                        );
                        if (unitInstances.length > 0) {
                          setSelectedInstanceIds(unitInstances.map((i) => i.id));
                        } else {
                          toast.info(
                            `Nenhum chip conectado diretamente à "${selectedUnit?.name}". Você pode selecionar qualquer outro chip da empresa.`,
                          );
                        }
                      }}
                    >
                      Desta Unidade
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedInstanceIds([])}
                  >
                    Limpar
                  </Button>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-muted rounded">
                    {selectedInstanceIds.length} selecionada(s)
                  </span>
                </div>
              </div>

              {connectedInstances.length === 0 ? (
                <div className="p-4 border rounded-lg bg-amber-500/10 border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Nenhuma instância de WhatsApp conectada no momento. Conecte um canal no menu de
                  Configurações antes de disparar.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {connectedInstances.map((inst) => {
                    const isChecked = selectedInstanceIds.includes(inst.id);
                    const instUnit = accessibleUnits.find((u) => u.id === inst.unit_id);
                    return (
                      <Card
                        key={inst.id}
                        onClick={() => {
                          setSelectedInstanceIds((prev) =>
                            isChecked ? prev.filter((id) => id !== inst.id) : [...prev, inst.id],
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
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono">
                                {inst.instance_name}
                              </span>
                              {instUnit ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-normal"
                                >
                                  📍 {instUnit.name}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                                >
                                  🏢 Geral / Matriz
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] text-emerald-600 border-emerald-500/30"
                        >
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
                    <strong>Rotação de Chips Ativada!</strong> Os envios serão distribuídos
                    igualmente entre as {selectedInstanceIds.length} instâncias em modo Round-Robin.
                  </span>
                </div>
              )}
            </div>

            {/* Presets de Velocidade & Proteção Anti-Ban */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Velocidade do Disparo (Proteção Anti-Ban)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Card
                  onClick={() => applySpeedPreset("safe")}
                  className={`p-3 cursor-pointer border-2 transition-all ${
                    speedPreset === "safe"
                      ? "border-emerald-600 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30"
                      : "border-border hover:border-emerald-500/40 bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                      Modo Seguro
                    </span>
                    <Badge className="bg-emerald-600 text-white text-[9px] h-4 px-1.5 font-mono">
                      Recomendado
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    15s a 45s entre mensagens. Pausas humanas regulares para proteger seus números
                    contra bloqueios.
                  </p>
                </Card>

                <Card
                  onClick={() => applySpeedPreset("moderate")}
                  className={`p-3 cursor-pointer border-2 transition-all ${
                    speedPreset === "moderate"
                      ? "border-blue-600 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30"
                      : "border-border hover:border-blue-500/40 bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                      <Zap className="h-4 w-4" />
                      Modo Moderado
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    10s a 25s entre mensagens. Recomendado para listas ativas que já conversam
                    frequentemente.
                  </p>
                </Card>

                <Card
                  onClick={() => setSpeedPreset("custom")}
                  className={`p-3 cursor-pointer border-2 transition-all ${
                    speedPreset === "custom"
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Sliders className="h-4 w-4" />
                      Personalizado
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Ajuste fino manual dos tempos de intervalo, tamanho dos lotes e tempo de
                    cooldown.
                  </p>
                </Card>
              </div>

              {/* Ajuste Fino Manual (Aparece somente no modo Personalizado) */}
              {speedPreset === "custom" && (
                <Card className="p-4 bg-muted/20 border-dashed space-y-3 mt-2">
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
                </Card>
              )}

              {/* Janela de Horário */}
              <div className="p-3 bg-muted/20 border rounded-lg space-y-2 mt-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Janela de Horário Comercial Permitido (Horário de Brasília)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="time"
                    value={allowedStart}
                    onChange={(e) => setAllowedStart(e.target.value)}
                    className="w-32 text-xs bg-background"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="time"
                    value={allowedEnd}
                    onChange={(e) => setAllowedEnd(e.target.value)}
                    className="w-32 text-xs bg-background"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se a campanha não concluir até o horário limite, ela pausa sozinha e retoma no dia
                  seguinte.
                </p>
              </div>
            </div>

            {/* Agendamento */}
            <div className="space-y-2 pt-1 border-t">
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

        {/* ===================== PASSO 5: REVISÃO & CONFIRMAÇÃO ===================== */}
        {step === 5 && (
          <div className="space-y-4 pt-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Checklist de Pré-Voo da Campanha
              </h3>
              <p className="text-xs text-muted-foreground">
                Confira os parâmetros antes de iniciar os disparos.
              </p>
            </div>

            {/* 4 Cards de Resumo Executivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="p-3.5 bg-background border flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Público-Alvo
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {audienceType === "import"
                      ? `${importSummary.valid.toLocaleString("pt-BR")} contatos`
                      : `${(audienceCount ?? 0).toLocaleString("pt-BR")} contatos`}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {audienceType === "import"
                      ? `Planilha: ${importFileName}`
                      : targetModule === "crm"
                        ? `CRM: ${currentPipeline?.name || "Funil"} • ${
                            crmScope === "specific_stages"
                              ? `${selectedStageIds.length} etapa(s)`
                              : "Funil Todo"
                          }`
                        : targetModule === "chat"
                          ? `Atendimentos • ${
                              useInactivity ? `${inactivityDays}+ dias` : "Sem inatividade"
                            }`
                          : targetModule === "general"
                            ? "Base Geral de Contatos"
                            : "Meu Todoo (Ações Comerciais)"}
                  </div>
                </div>
              </Card>

              <Card className="p-3.5 bg-background border flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Canais de Envio
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {selectedInstanceIds.length} chip(s) de WhatsApp
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedInstanceIds.length > 1
                      ? "Rotação Round-Robin ativada"
                      : "Envio por canal único"}
                  </div>
                </div>
              </Card>

              <Card className="p-3.5 bg-background border flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Velocidade Anti-Ban
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {speedPreset === "safe"
                      ? "Modo Seguro"
                      : speedPreset === "moderate"
                        ? "Modo Moderado"
                        : "Personalizado"}{" "}
                    ({minDelay}s a {maxDelay}s)
                  </div>
                  <div className="text-xs text-emerald-600 font-semibold truncate">
                    Tempo estimado: {estimatedTime}
                  </div>
                </div>
              </Card>

              <Card className="p-3.5 bg-background border flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Agendamento
                  </div>
                  <div className="text-base font-bold text-foreground">
                    {scheduleMode === "now" ? "Disparo Imediato" : "Disparo Agendado"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {scheduleMode === "now"
                      ? "Inicia logo após confirmação"
                      : scheduledDate || "Data agendada"}
                  </div>
                </div>
              </Card>
            </div>

            {/* Badges de Filtros Detalhados */}
            {audienceType === "segment" && (
              <div className="p-2.5 bg-muted/20 border rounded-lg flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground text-[11px] font-semibold mr-1">
                  Critérios:
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {contactType === "all"
                    ? "Todos os Contatos"
                    : contactType === "lead"
                      ? "Apenas Leads"
                      : "Apenas Clientes"}
                </Badge>
                {unitId !== "all" && (
                  <Badge variant="secondary" className="text-[10px]">
                    📍 {selectedUnit?.name}
                  </Badge>
                )}
                {selectedTags.length > 0 && (
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    Tags: {selectedTags.join(", ")}
                  </Badge>
                )}
                {excludedTags.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    Excluindo: {excludedTags.join(", ")}
                  </Badge>
                )}
                {selectedDdds.length > 0 && (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    DDDs: {selectedDdds.join(", ")}
                  </Badge>
                )}
              </div>
            )}

            {/* Variações de Mensagem */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Mensagem da Campanha ({variations.length})</span>
                {variations.length > 1 && (
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    Teste A/B Ativado
                  </Badge>
                )}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {variations.map((v, i) => (
                  <Card key={v.id} className="p-3 bg-background border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          #{i + 1}
                        </Badge>
                        {v.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {v.messageType}
                        {v.mediaUrl ? " + mídia" : ""}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap font-sans bg-muted/30 p-2 rounded border">
                      {v.content}
                    </p>
                  </Card>
                ))}
              </div>
            </div>

            {/* Amostra dos Destinatários */}
            <div className="space-y-2 pt-1 border-t">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" />
                    Amostra de Destinatários ({filteredReviewContacts.length} contatos qualificados)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Confira uma prévia dos primeiros contatos da fila de envio.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-40">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar prévia..."
                      value={reviewSearchTerm}
                      onChange={(e) => setReviewSearchTerm(e.target.value)}
                      className="h-7 text-xs pl-7"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={() => setShowFullReviewList(!showFullReviewList)}
                  >
                    {showFullReviewList ? "Recolher Lista" : "Ver Lista Completa"}
                  </Button>
                </div>
              </div>

              {isLoadingPreviewContacts ? (
                <div className="py-6 text-center text-xs text-muted-foreground border rounded-lg flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Carregando lista de destinatários...
                </div>
              ) : filteredReviewContacts.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground border rounded-lg">
                  Nenhum contato encontrado para esta prévia.
                </div>
              ) : (
                <div className="border rounded-lg max-h-52 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1">Contato</TableHead>
                        <TableHead className="text-xs py-1">Telefone</TableHead>
                        {audienceType === "segment" && (
                          <>
                            <TableHead className="text-xs py-1">Perfil</TableHead>
                            <TableHead className="text-xs py-1">Origem</TableHead>
                          </>
                        )}
                        <TableHead className="text-xs py-1 text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviewContacts
                        .slice(0, showFullReviewList ? 150 : 5)
                        .map((c: any, idx: number) => {
                          const name = c.name || "Sem nome";
                          const phone = c.phone || "";
                          const isValid = audienceType === "import" ? c.isValid !== false : true;

                          return (
                            <TableRow key={idx} className="h-8 text-xs">
                              <TableCell className="py-1 font-medium">{name}</TableCell>
                              <TableCell className="py-1 font-mono text-[11px]">{phone}</TableCell>
                              {audienceType === "segment" && (
                                <>
                                  <TableCell className="py-1">
                                    {c.contact_type === "client" ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                                      >
                                        Cliente
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] text-blue-600 border-blue-500/30 bg-blue-500/10"
                                      >
                                        Lead
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-1 text-[11px] text-muted-foreground">
                                    {c.source || "-"}
                                  </TableCell>
                                </>
                              )}
                              <TableCell className="py-1 text-right">
                                {isValid ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] text-emerald-600 border-emerald-500/30"
                                  >
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
              {!showFullReviewList && filteredReviewContacts.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Exibindo 5 contatos de amostra. Clique em <strong>Ver Lista Completa</strong>{" "}
                  acima para auditar mais contatos.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
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
