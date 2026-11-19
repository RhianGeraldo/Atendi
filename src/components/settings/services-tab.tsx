import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit,
  Tag,
  Search,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Gift,
  Lightbulb,
  Check,
  CreditCard,
  Building2,
  ShoppingBag,
  Calculator,
  Zap,
  Copy,
  MessageCircle,
  HelpCircle,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ServicePackage {
  id: string;
  company_id: string;
  unit_id: string | null;
  name: string;
  description: string | null;
  type: "combo" | "single_area" | "addon";
  category: "laser" | "clareamento" | "facial" | "corporal";
  strategic_role: "intermediate" | "upsell" | "downsell" | "cross_sell";
  areas: string[];
  sessions_count: number;
  anchor_price: number | null;
  cash_price: number | null;
  installments_count: number | null;
  installment_value: number | null;
  installment_text: string | null;
  payment_methods: string[];
  bonus_gift: string | null;
  sales_pitch: string | null;
  is_active: boolean;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

// Categorias de áreas organizadas por perfil
const AREA_CATEGORIES = [
  {
    category: "Mais Pedidas",
    areas: ["Virilha Completa", "Perianal", "Axilas", "Meia Perna", "Buço"],
  },
  {
    category: "Corpo Feminino",
    areas: ["Perna Completa", "Glúteos", "Abdômen", "Braços", "Linha Alba", "Seios"],
  },
  {
    category: "Masculino",
    areas: ["Barba Completa", "Contorno da Barba", "Pescoço", "Peito", "Costas", "Ombros", "Abdômen"],
  },
  {
    category: "Facial & Clareamento",
    areas: ["Buço", "Queixo/Mento", "Rosto Completo", "Virilha Íntima", "Axilas Clareamento"],
  },
];

// Modelos prontos de clínicas de estética para cadastro em 1 clique
const PACKAGE_TEMPLATES = [
  {
    label: "⭐ Combo Trio (Âncora / Carro-Chefe)",
    badge: "Mais Vendido",
    name: "Combo Trio: Virilha Completa + Perianal + Axilas",
    description: "Nosso combo favorito das clientes para liberdade e pele lisinha.",
    type: "combo" as const,
    category: "laser" as const,
    strategic_role: "intermediate" as const,
    areas: ["Virilha Completa", "Perianal", "Axilas"],
    sessions_count: 10,
    anchor_price: "1200.00",
    cash_price: "599.00",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 59,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "10 sessões de Buço de presente + brinde exclusivo no fechamento",
    sales_pitch:
      "Oferecer como primeira opção recomendada. Enfatizar o pagamento recorrente no cartão sem comprometer o limite total.",
  },
  {
    label: "🚀 Combo Pernas + Virilha (Upsell)",
    badge: "Ticket Maior",
    name: "Combo Pernas Livres: Perna Completa + Virilha + Axilas",
    description: "Pacote completo para quem quer se ver livre das lâminas de ponta a ponta.",
    type: "combo" as const,
    category: "laser" as const,
    strategic_role: "upsell" as const,
    areas: ["Perna Completa", "Virilha Completa", "Axilas"],
    sessions_count: 10,
    anchor_price: "2400.00",
    cash_price: "1198.00",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 99,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "10 sessões de Buço + 1 sessão facial revitalizante de presente",
    sales_pitch:
      "Apresentar quando a cliente perguntar de pernas ou mais áreas para garantir maior economia por área.",
  },
  {
    label: "🛡️ Área Única / Salva-Venda (Downsell)",
    badge: "Entrada Suave",
    name: "Pacote Axilas Livres (10 Sessões)",
    description: "Ideal para começar a depilação a laser com um valor super acessível.",
    type: "single_area" as const,
    category: "laser" as const,
    strategic_role: "downsell" as const,
    areas: ["Axilas"],
    sessions_count: 10,
    anchor_price: "600.00",
    cash_price: "299.00",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 29,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "Avaliação gratuita da pele inclusa",
    sales_pitch:
      "Usar com empatia se a cliente achar o combo pesado para o momento. Ajuda a cliente a fechar e começar hoje.",
  },
  {
    label: "✨ Clareamento a Laser (Cross-sell)",
    badge: "Venda Cruzada",
    name: "Protocolo Clareamento a Laser: Axilas & Virilha",
    description: "Tratamento seguro contra manchas e foliculite sem efeito rebote.",
    type: "combo" as const,
    category: "clareamento" as const,
    strategic_role: "cross_sell" as const,
    areas: ["Virilha Íntima", "Axilas Clareamento"],
    sessions_count: 6,
    anchor_price: "980.00",
    cash_price: "499.00",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 49,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "Avaliação fotográfica e acompanhamento dermatofuncional incluso",
    sales_pitch:
      "Oferecer com 50% de desconto adicional se a cliente mencionar manchas escuras, foliculite ou queixas de pele.",
  },
  {
    label: "🧔 Barba Completa Masculina",
    badge: "Linha Man",
    name: "Barba Desenhada: Barba Completa + Pescoço",
    description: "Elimina a foliculite da lâmina e mantém o desenho perfeito.",
    type: "combo" as const,
    category: "laser" as const,
    strategic_role: "intermediate" as const,
    areas: ["Barba Completa", "Pescoço"],
    sessions_count: 10,
    anchor_price: "950.00",
    cash_price: "499.00",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 49,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "Acabamento de costeletas incluso",
    sales_pitch:
      "Ideal para homens com foliculite da lâmina. Enfatizar a praticidade de nunca mais precisar usar gilete.",
  },
];

export function ServicesCatalogTab() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ServicePackage | null>(null);
  const [customAreaInput, setCustomAreaInput] = useState("");
  const [activeTab, setActiveTab] = useState("info");

  // Formulário State
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: "combo" | "single_area" | "addon";
    category: "laser" | "clareamento" | "facial" | "corporal";
    strategic_role: "intermediate" | "upsell" | "downsell" | "cross_sell";
    areas: string[];
    sessions_count: number;
    anchor_price: string;
    cash_price: string;
    installments_count: string;
    is_recurrent: boolean;
    installment_text: string;
    payment_methods: string[];
    bonus_gift: string;
    sales_pitch: string;
    unit_id: string;
    is_active: boolean;
  }>({
    name: "",
    description: "",
    type: "combo",
    category: "laser",
    strategic_role: "intermediate",
    areas: ["Virilha Completa", "Perianal", "Axilas"],
    sessions_count: 10,
    anchor_price: "",
    cash_price: "",
    installments_count: "12",
    is_recurrent: true,
    installment_text: "12x de R$ 59,90",
    payment_methods: ["recorrente", "cartao", "pix"],
    bonus_gift: "",
    sales_pitch: "",
    unit_id: "all",
    is_active: true,
  });

  // 1. Busca unidades da empresa
  const { data: units = [] } = useQuery({
    queryKey: ["units", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("units")
        .select("id, name")
        .eq("company_id", activeCompanyId)
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompanyId,
  });

  // 2. Busca catálogo de serviços/combos
  const { data: packages = [], isLoading } = useQuery<ServicePackage[]>({
    queryKey: ["company_services_packages", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("company_services_packages")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data as unknown as ServicePackage[]) || [];
    },
    enabled: !!activeCompanyId,
  });

  // 3. Mutação: Salvar (Criar ou Editar)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Empresa não selecionada");
      if (!formData.name.trim()) throw new Error("Nome do serviço/combo é obrigatório");

      const payload = {
        company_id: activeCompanyId,
        unit_id: formData.unit_id === "all" ? null : formData.unit_id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        type: formData.type,
        category: formData.category,
        strategic_role: formData.strategic_role,
        areas: formData.areas,
        sessions_count: Number(formData.sessions_count) || 1,
        anchor_price: formData.anchor_price
          ? parseFloat(formData.anchor_price.replace(",", "."))
          : null,
        cash_price: formData.cash_price ? parseFloat(formData.cash_price.replace(",", ".")) : null,
        installment_text: formData.installment_text.trim() || null,
        payment_methods: formData.payment_methods,
        bonus_gift: formData.bonus_gift.trim() || null,
        sales_pitch: formData.sales_pitch.trim() || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from("company_services_packages")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_services_packages").insert({
          ...payload,
          order_index: packages.length + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_services_packages", activeCompanyId] });
      toast.success(
        editingItem ? "Pacote atualizado com sucesso!" : "Novo pacote adicionado com sucesso!",
      );
      setIsDialogOpen(false);
      setEditingItem(null);
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar pacote", { description: err.message });
    },
  });

  // 4. Mutação: Toggle Ativo/Inativo
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("company_services_packages")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_services_packages", activeCompanyId] });
      toast.success("Status atualizado!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao atualizar status", { description: err.message });
    },
  });

  // 5. Mutação: Excluir
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_services_packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_services_packages", activeCompanyId] });
      toast.success("Pacote removido com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao remover pacote", { description: err.message });
    },
  });

  // Abertura do Modal de Criação com Valores Padrão
  const handleOpenCreate = () => {
    setEditingItem(null);
    setActiveTab("info");
    setFormData({
      name: "",
      description: "",
      type: "combo",
      category: "laser",
      strategic_role: "intermediate",
      areas: ["Virilha Completa", "Perianal", "Axilas"],
      sessions_count: 10,
      anchor_price: "",
      cash_price: "",
      installments_count: "12",
      is_recurrent: true,
      installment_text: "12x de R$ ",
      payment_methods: ["recorrente", "cartao", "pix"],
      bonus_gift: "",
      sales_pitch: "",
      unit_id: "all",
      is_active: true,
    });
    setCustomAreaInput("");
    setIsDialogOpen(true);
  };

  // Abertura do Modal de Edição
  const handleOpenEdit = (item: ServicePackage) => {
    setEditingItem(item);
    setActiveTab("info");
    const instCount = item.installment_text?.match(/(\d+)x/)?.[1] || "12";
    const hasRecurrent = item.payment_methods?.includes("recorrente");

    setFormData({
      name: item.name,
      description: item.description || "",
      type: item.type,
      category: item.category,
      strategic_role: item.strategic_role,
      areas: item.areas || [],
      sessions_count: item.sessions_count || 10,
      anchor_price: item.anchor_price != null ? String(item.anchor_price) : "",
      cash_price: item.cash_price != null ? String(item.cash_price) : "",
      installments_count: instCount,
      is_recurrent: hasRecurrent,
      installment_text: item.installment_text || "",
      payment_methods: item.payment_methods || ["recorrente", "cartao", "pix"],
      bonus_gift: item.bonus_gift || "",
      sales_pitch: item.sales_pitch || "",
      unit_id: item.unit_id || "all",
      is_active: item.is_active,
    });
    setCustomAreaInput("");
    setIsDialogOpen(true);
  };

  // Duplicar Pacote (Clonar com 1 clique)
  const handleDuplicate = (item: ServicePackage) => {
    setEditingItem(null);
    setActiveTab("info");
    setFormData({
      name: `${item.name} (Cópia)`,
      description: item.description || "",
      type: item.type,
      category: item.category,
      strategic_role: item.strategic_role,
      areas: [...(item.areas || [])],
      sessions_count: item.sessions_count || 10,
      anchor_price: item.anchor_price != null ? String(item.anchor_price) : "",
      cash_price: item.cash_price != null ? String(item.cash_price) : "",
      installments_count: "12",
      is_recurrent: item.payment_methods?.includes("recorrente") ?? true,
      installment_text: item.installment_text || "",
      payment_methods: [...(item.payment_methods || ["recorrente", "cartao", "pix"])],
      bonus_gift: item.bonus_gift || "",
      sales_pitch: item.sales_pitch || "",
      unit_id: item.unit_id || "all",
      is_active: true,
    });
    setIsDialogOpen(true);
    toast.info("Pacote duplicado! Ajuste os detalhes e clique em Salvar.");
  };

  // Aplicar Template Pronto com 1 Clique
  const handleApplyTemplate = (tpl: (typeof PACKAGE_TEMPLATES)[0]) => {
    setFormData((prev) => ({
      ...prev,
      name: tpl.name,
      description: tpl.description,
      type: tpl.type,
      category: tpl.category,
      strategic_role: tpl.strategic_role,
      areas: [...tpl.areas],
      sessions_count: tpl.sessions_count,
      anchor_price: tpl.anchor_price,
      cash_price: tpl.cash_price,
      installments_count: tpl.installments_count,
      is_recurrent: tpl.is_recurrent,
      installment_text: tpl.installment_text,
      payment_methods: [...tpl.payment_methods],
      bonus_gift: tpl.bonus_gift,
      sales_pitch: tpl.sales_pitch,
    }));
    toast.success(`Modelo "${tpl.label}" aplicado com sucesso!`);
  };

  // Calculadora Automática de Parcela Recorrente
  const calculateInstallment = (cash: string, countStr: string, recurrent: boolean) => {
    const total = parseFloat(cash.replace(",", "."));
    const count = parseInt(countStr) || 12;
    if (!total || total <= 0 || count <= 0) return;

    const val = (total / count).toFixed(2).replace(".", ",");
    const text = `${count}x de R$ ${val}${recurrent ? "" : ""}`;
    setFormData((prev) => ({
      ...prev,
      installment_text: text,
      cash_price: cash,
      installments_count: countStr,
      is_recurrent: recurrent,
    }));
  };

  // Toggle de Área Selecionada no Form
  const toggleArea = (area: string) => {
    setFormData((prev) => {
      const exists = prev.areas.includes(area);
      return {
        ...prev,
        areas: exists ? prev.areas.filter((a) => a !== area) : [...prev.areas, area],
      };
    });
  };

  // Adicionar Área Customizada
  const handleAddCustomArea = () => {
    const trimmed = customAreaInput.trim();
    if (!trimmed) return;
    if (!formData.areas.includes(trimmed)) {
      setFormData((prev) => ({ ...prev, areas: [...prev.areas, trimmed] }));
    }
    setCustomAreaInput("");
  };

  // Toggle de Método de Pagamento
  const togglePaymentMethod = (method: string) => {
    setFormData((prev) => {
      const exists = prev.payment_methods.includes(method);
      return {
        ...prev,
        payment_methods: exists
          ? prev.payment_methods.filter((m) => m !== method)
          : [...prev.payment_methods, method],
      };
    });
  };

  // Filtros aplicados
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (roleFilter !== "all" && pkg.strategic_role !== roleFilter) return false;
      if (categoryFilter !== "all" && pkg.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const inName = pkg.name.toLowerCase().includes(query);
        const inAreas = (pkg.areas || []).some((a) => a.toLowerCase().includes(query));
        const inPitch = (pkg.sales_pitch || "").toLowerCase().includes(query);
        if (!inName && !inAreas && !inPitch) return false;
      }
      return true;
    });
  }, [packages, roleFilter, categoryFilter, searchTerm]);

  // Contadores de estatísticas
  const stats = useMemo(() => {
    return {
      total: packages.length,
      intermediate: packages.filter((p) => p.strategic_role === "intermediate").length,
      upsell: packages.filter((p) => p.strategic_role === "upsell").length,
      downsell: packages.filter((p) => p.strategic_role === "downsell").length,
      cross_sell: packages.filter((p) => p.strategic_role === "cross_sell").length,
    };
  }, [packages]);

  // Simulação Dinâmica da Mensagem da Helena no WhatsApp
  const liveWhatsAppSimulation = useMemo(() => {
    const areasStr = formData.areas.length > 0 ? formData.areas.join(" + ") : "suas áreas desejadas";
    const parcelas = formData.installment_text || "12x de R$ 59,90";
    const bonus = formData.bonus_gift ? ` e você ainda ganha ${formData.bonus_gift}!` : "!";
    const recurrentNote = formData.is_recurrent ? " no cartão recorrente (sem travar o limite do seu cartão)" : "";

    if (formData.strategic_role === "upsell") {
      return `Patrícia, se você quiser fechar o pacote completo de ${formData.name || areasStr} com ${formData.sessions_count} sessões, temos uma condição incrível: fica por apenas ${parcelas}${recurrentNote}${bonus} Vale muito mais a pena pela economia por área! Quer garantir essa condição? ✨`;
    }
    if (formData.strategic_role === "downsell") {
      return `Super entendo, Patrícia! Para não deixar você sem começar a se ver livre das lâminas hoje, que tal fazermos apenas ${formData.name || areasStr}? Sai por apenas ${parcelas}${recurrentNote}${bonus} Fica bem suave para você! Vamos iniciar? 🥰`;
    }
    if (formData.strategic_role === "cross_sell") {
      return `Patrícia, como você mencionou incômodo com manchas e foliculite, temos o protocolo especial de ${formData.name || areasStr}! Hoje consigo liberar para você com 50% de desconto adicional por apenas ${parcelas}${recurrentNote}${bonus} O que acha? 🌸`;
    }
    // Intermediário / Âncora Padrão
    return `Patrícia, o nosso pacote mais procurado na clínica é o ${formData.name || `Combo (${areasStr})`} com ${formData.sessions_count} sessões! Ele sai por apenas ${parcelas}${recurrentNote}${bonus} Vamos aproveitar e garantir essa condição especial para sua avaliação? 💖`;
  }, [formData]);

  return (
    <div className="space-y-6">
      {/* Header & Estatísticas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-emerald-500" />
            Catálogo Comercial de Serviços & Combos
            <Badge
              variant="outline"
              className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
            >
              MCP / IA Vendas
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Tabela oficial de pacotes e combos consultada pela <strong>Helena (Vendas)</strong> e pelo{" "}
            <strong>SDR</strong> via MCP. A IA negocia valores no WhatsApp utilizando a estratégia de
            4 degraus (Âncora, Upsell, Downsell e Cross-sell).
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs shrink-0"
        >
          <Plus className="h-4 w-4" />
          Novo Pacote / Combo
        </Button>
      </div>

      {/* Cards de Métricas dos 4 Degraus Estratégicos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={`cursor-pointer transition-all border ${roleFilter === "intermediate" ? "border-emerald-500 bg-emerald-500/5 shadow-xs" : "border-border/60 hover:border-emerald-500/40"}`}
          onClick={() => setRoleFilter(roleFilter === "intermediate" ? "all" : "intermediate")}
        >
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                ⭐ Intermediário (Âncora)
              </p>
              <p className="text-2xl font-bold mt-0.5">{stats.intermediate}</p>
              <p className="text-[10px] text-muted-foreground">Carro-chefe ofertado 1º</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${roleFilter === "upsell" ? "border-blue-500 bg-blue-500/5 shadow-xs" : "border-border/60 hover:border-blue-500/40"}`}
          onClick={() => setRoleFilter(roleFilter === "upsell" ? "all" : "upsell")}
        >
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                🚀 Upsell (Ticket Maior)
              </p>
              <p className="text-2xl font-bold mt-0.5">{stats.upsell}</p>
              <p className="text-[10px] text-muted-foreground">Perna ou corpo todo</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${roleFilter === "downsell" ? "border-amber-500 bg-amber-500/5 shadow-xs" : "border-border/60 hover:border-amber-500/40"}`}
          onClick={() => setRoleFilter(roleFilter === "downsell" ? "all" : "downsell")}
        >
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                🛡️ Downsell (Salva-Venda)
              </p>
              <p className="text-2xl font-bold mt-0.5">{stats.downsell}</p>
              <p className="text-[10px] text-muted-foreground">Área única ou avulsa</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${roleFilter === "cross_sell" ? "border-purple-500 bg-purple-500/5 shadow-xs" : "border-border/60 hover:border-purple-500/40"}`}
          onClick={() => setRoleFilter(roleFilter === "cross_sell" ? "all" : "cross_sell")}
        >
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-purple-600 dark:text-purple-400">
                ✨ Cross-sell (Venda Cruzada)
              </p>
              <p className="text-2xl font-bold mt-0.5">{stats.cross_sell}</p>
              <p className="text-[10px] text-muted-foreground">Clareamento / Manchas</p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600">
              <Tag className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-muted/40 p-2 rounded-xl border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por pacote ou área (ex: virilha, axilas, perna)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 text-xs w-[170px] bg-background">
              <SelectValue placeholder="Papel Estratégico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Papéis</SelectItem>
              <SelectItem value="intermediate">⭐ Intermediário (Âncora)</SelectItem>
              <SelectItem value="upsell">🚀 Upsell (Ticket Maior)</SelectItem>
              <SelectItem value="downsell">🛡️ Downsell (Salva-Venda)</SelectItem>
              <SelectItem value="cross_sell">✨ Cross-sell (Venda Cruzada)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-xs w-[140px] bg-background">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Categorias</SelectItem>
              <SelectItem value="laser">Depilação Laser</SelectItem>
              <SelectItem value="clareamento">Clareamento</SelectItem>
              <SelectItem value="facial">Facial</SelectItem>
              <SelectItem value="corporal">Corporal</SelectItem>
            </SelectContent>
          </Select>

          {(roleFilter !== "all" || categoryFilter !== "all" || searchTerm) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRoleFilter("all");
                setCategoryFilter("all");
                setSearchTerm("");
              }}
              className="text-xs h-9 px-2"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Pacotes Cadastrados */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-muted-foreground">
          Carregando catálogo de pacotes...
        </div>
      ) : filteredPackages.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2.5" />
          <h3 className="text-sm font-semibold text-foreground">Nenhum serviço/combo encontrado</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            {searchTerm || roleFilter !== "all" || categoryFilter !== "all"
              ? "Tente ajustar os filtros ou a busca acima."
              : "Cadastre o primeiro pacote ou combo promocional para a IA consultar."}
          </p>
          <Button size="sm" onClick={handleOpenCreate} className="text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Adicionar Novo Pacote
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg) => {
            const roleBadge = {
              intermediate: {
                label: "⭐ Intermediário (Âncora)",
                color:
                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
              },
              upsell: {
                label: "🚀 Upsell (Ticket Maior)",
                color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
              },
              downsell: {
                label: "🛡️ Downsell (Salva-Venda)",
                color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
              },
              cross_sell: {
                label: "✨ Cross-sell (Venda Cruzada)",
                color: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
              },
            }[pkg.strategic_role];

            const unitName = pkg.unit_id
              ? units.find((u) => u.id === pkg.unit_id)?.name || "Unidade Específica"
              : "Todas as Unidades (Rede)";

            return (
              <Card
                key={pkg.id}
                className={`border transition-all flex flex-col justify-between hover:shadow-xs ${!pkg.is_active ? "opacity-60 bg-muted/20" : "bg-card"}`}
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold px-2 py-0.5 ${roleBadge.color}`}
                    >
                      {roleBadge.label}
                    </Badge>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch
                        checked={pkg.is_active}
                        onCheckedChange={(val) =>
                          toggleActiveMutation.mutate({ id: pkg.id, is_active: val })
                        }
                        title={pkg.is_active ? "Ativo para a IA vender" : "Pausado"}
                      />
                    </div>
                  </div>

                  <div>
                    <CardTitle className="text-sm font-bold line-clamp-2">{pkg.name}</CardTitle>
                    {pkg.description && (
                      <CardDescription className="text-xs mt-1 line-clamp-2">
                        {pkg.description}
                      </CardDescription>
                    )}
                  </div>

                  {/* Chips das Áreas */}
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    <Badge variant="secondary" className="text-[10px] bg-muted/80">
                      {pkg.sessions_count} {pkg.sessions_count === 1 ? "sessão" : "sessões"}
                    </Badge>
                    {pkg.areas?.map((area) => (
                      <Badge
                        key={area}
                        variant="outline"
                        className="text-[10px] bg-background border-border/80"
                      >
                        {area}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Bloco de Preço */}
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 space-y-1">
                    {pkg.anchor_price && (
                      <p className="text-[11px] text-muted-foreground line-through">
                        De R$ {Number(pkg.anchor_price).toFixed(2)}
                      </p>
                    )}
                    <div className="flex items-baseline justify-between">
                      <p className="text-base font-extrabold text-foreground tracking-tight">
                        {pkg.installment_text ||
                          (pkg.cash_price
                            ? `R$ ${Number(pkg.cash_price).toFixed(2)}`
                            : "Sob Consulta")}
                      </p>
                      {pkg.cash_price && pkg.installment_text && (
                        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          ou R$ {Number(pkg.cash_price).toFixed(2)} à vista
                        </p>
                      )}
                    </div>
                    {pkg.payment_methods?.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span>{pkg.payment_methods.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Brinde / Bônus */}
                  {pkg.bonus_gift && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                      <Gift className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <span className="text-[11px] font-medium leading-tight">
                        {pkg.bonus_gift}
                      </span>
                    </div>
                  )}

                  {/* Dica para a IA */}
                  {pkg.sales_pitch && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border/40">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                      <span className="text-[11px] leading-tight line-clamp-3">
                        {pkg.sales_pitch}
                      </span>
                    </div>
                  )}

                  {/* Rodapé do Card com Unidade e Ações */}
                  <div className="pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 truncate max-w-[140px]">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {unitName}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Duplicar pacote"
                        onClick={() => handleDuplicate(pkg)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Editar pacote"
                        onClick={() => handleOpenEdit(pkg)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Excluir pacote"
                        onClick={() => {
                          if (confirm(`Deseja realmente remover o pacote "${pkg.name}"?`)) {
                            deleteMutation.mutate(pkg.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal / Dialog Reformulado com Alta UI/UX */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
          {/* Header do Dialog */}
          <div className="p-5 pb-3 border-b bg-muted/20">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-emerald-500" />
                  {editingItem ? "Editar Pacote / Combo" : "Cadastrar Serviço ou Combo para a IA"}
                </DialogTitle>
                <Badge variant="outline" className="text-[10px] bg-background">
                  {formData.strategic_role === "intermediate" && "⭐ Carro-Chefe"}
                  {formData.strategic_role === "upsell" && "🚀 Ticket Maior"}
                  {formData.strategic_role === "downsell" && "🛡️ Salva-Venda"}
                  {formData.strategic_role === "cross_sell" && "✨ Venda Cruzada"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Configure os dados, valores e dicas que a consultora de IA (Helena) usará nas vendas.
              </DialogDescription>
            </DialogHeader>

            {/* Carrossel de Templates Rápidos em 1 Clique */}
            {!editingItem && (
              <div className="mt-3.5 pt-3 border-t border-border/60">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 mb-2">
                  <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  Preencher com Modelo Pronto (1 clique):
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {PACKAGE_TEMPLATES.map((tpl) => (
                    <Button
                      key={tpl.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTemplate(tpl)}
                      className="text-[11px] h-7 px-2.5 shrink-0 bg-background hover:bg-emerald-500/10 hover:border-emerald-500/40 border-dashed"
                    >
                      <span className="font-semibold text-emerald-600 mr-1">[{tpl.badge}]</span>
                      {tpl.label.split("(")[0].trim()}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-5 space-y-5">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-3 w-full h-9">
                <TabsTrigger value="info" className="text-xs gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  1. O que é o Pacote
                </TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  2. Valores & Parcelamento
                </TabsTrigger>
                <TabsTrigger value="strategy" className="text-xs gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  3. Estratégia da IA
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: Informações e Áreas */}
              <TabsContent value="info" className="space-y-4 pt-4 mt-0">
                {/* Nome do Pacote */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nome Comercial do Serviço / Combo *</Label>
                  <Input
                    placeholder="Ex: Combo Trio: Virilha Completa + Perianal + Axilas"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Papel Estratégico & Categoria */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center justify-between">
                      <span>Papel Estratégico nas Vendas *</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Função da IA</span>
                    </Label>
                    <Select
                      value={formData.strategic_role}
                      onValueChange={(val: "intermediate" | "upsell" | "downsell" | "cross_sell") =>
                        setFormData({ ...formData, strategic_role: val })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="intermediate">
                          ⭐ Intermediário (Carro-Chefe / Âncora Ideal)
                        </SelectItem>
                        <SelectItem value="upsell">🚀 Upsell (Ticket Maior / Mais Áreas)</SelectItem>
                        <SelectItem value="downsell">
                          🛡️ Downsell (Salva-Venda / Menor Valor)
                        </SelectItem>
                        <SelectItem value="cross_sell">
                          ✨ Cross-sell (Venda Cruzada / Clareamento)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Categoria do Tratamento</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(val: "laser" | "clareamento" | "facial" | "corporal") =>
                        setFormData({ ...formData, category: val })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="laser">Depilação a Laser</SelectItem>
                        <SelectItem value="clareamento">Clareamento a Laser</SelectItem>
                        <SelectItem value="facial">Tratamentos Faciais</SelectItem>
                        <SelectItem value="corporal">Estética Corporal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linha: Tipo, Qtd Sessões e Unidade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Formato</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val: "combo" | "single_area" | "addon") =>
                        setFormData({ ...formData, type: val })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="combo">Combo Multiaéreas</SelectItem>
                        <SelectItem value="single_area">Área Única</SelectItem>
                        <SelectItem value="addon">Adicional / Complementar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Qtd. de Sessões</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={formData.sessions_count}
                      onChange={(e) =>
                        setFormData({ ...formData, sessions_count: parseInt(e.target.value) || 1 })
                      }
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Unidade Aplicável</Label>
                    <Select
                      value={formData.unit_id}
                      onValueChange={(val) => setFormData({ ...formData, unit_id: val })}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Unidades (Rede)</SelectItem>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Seleção de Áreas por Grupos */}
                <div className="space-y-3 p-3.5 bg-muted/20 rounded-xl border">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-semibold">Áreas Inclusas no Pacote *</Label>
                      <p className="text-[10px] text-muted-foreground">
                        Clique nos botões para adicionar ou remover as regiões corporais.
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">
                      {formData.areas.length} {formData.areas.length === 1 ? "área" : "áreas"}
                    </Badge>
                  </div>

                  {/* Grupos Categorizados */}
                  <div className="space-y-2.5">
                    {AREA_CATEGORIES.map((cat) => (
                      <div key={cat.category} className="space-y-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {cat.category}:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.areas.map((area) => {
                            const isSelected = formData.areas.includes(area);
                            return (
                              <Button
                                key={area}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleArea(area)}
                                className={`text-[11px] h-6 px-2.5 rounded-lg transition-all ${
                                  isSelected
                                    ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                    : "bg-background hover:bg-muted"
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 mr-1" />}
                                {area}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Adicionar área personalizada */}
                  <div className="flex gap-2 pt-2 border-t border-border/50">
                    <Input
                      placeholder="Outra área personalizada (ex: Nariz, Orelhas)..."
                      value={customAreaInput}
                      onChange={(e) => setCustomAreaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomArea();
                        }
                      }}
                      className="h-8 text-xs bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleAddCustomArea}
                      className="h-8 text-xs px-3"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ABA 2: Valores & Calculadora Recorrente */}
              <TabsContent value="pricing" className="space-y-4 pt-4 mt-0">
                {/* Calculadora Automática de Parcela */}
                <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Calculator className="h-4 w-4 text-emerald-600" />
                      Calculadora de Parcelamento Inteligente
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-background text-emerald-600 border-emerald-500/30">
                      Gera o texto falado pela IA
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Valor Total / À Vista (R$)</Label>
                      <Input
                        placeholder="Ex: 599.00"
                        value={formData.cash_price}
                        onChange={(e) => {
                          const val = e.target.value;
                          calculateInstallment(val, formData.installments_count, formData.is_recurrent);
                        }}
                        className="h-9 text-xs bg-background font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Número de Parcelas</Label>
                      <Select
                        value={formData.installments_count}
                        onValueChange={(val) => {
                          calculateInstallment(formData.cash_price, val, formData.is_recurrent);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12">12x Parcelas</SelectItem>
                          <SelectItem value="10">10x Parcelas</SelectItem>
                          <SelectItem value="6">6x Parcelas</SelectItem>
                          <SelectItem value="3">3x Parcelas</SelectItem>
                          <SelectItem value="1">1x (À vista)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Preço Âncora de Tabela (De R$)</Label>
                      <Input
                        placeholder="Ex: 1200.00"
                        value={formData.anchor_price}
                        onChange={(e) => setFormData({ ...formData, anchor_price: e.target.value })}
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {/* Switch de Cartão Recorrente */}
                  <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
                    <div>
                      <Label className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                        Cobrança no Cartão Recorrente
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        A IA sempre destaca que <strong>não compromete o limite total</strong> do cartão.
                      </p>
                    </div>
                    <Switch
                      checked={formData.is_recurrent}
                      onCheckedChange={(val) => {
                        calculateInstallment(formData.cash_price, formData.installments_count, val);
                      }}
                    />
                  </div>
                </div>

                {/* Texto Exato da Parcela */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Texto da Parcela Informado ao Cliente *</Label>
                    <span className="text-[10px] text-muted-foreground">Você pode editar manualmente</span>
                  </div>
                  <Input
                    placeholder="Ex: 12x de R$ 59,90"
                    value={formData.installment_text}
                    onChange={(e) => setFormData({ ...formData, installment_text: e.target.value })}
                    className="h-9 text-xs font-bold text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Exatamente como a Helena falará na proposta: <em>"sai por apenas {formData.installment_text || '12x de R$ 59,90'}"</em>.
                  </p>
                </div>

                {/* Formas de Pagamento Suportadas */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold">Formas de Pagamento Aceitas</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "recorrente", label: "Cartão Recorrente (Sem travar limite)" },
                      { id: "cartao", label: "Cartão de Crédito até 12x" },
                      { id: "pix", label: "PIX à vista" },
                      { id: "boleto", label: "Boleto Bancário" },
                    ].map((item) => {
                      const isChecked = formData.payment_methods.includes(item.id);
                      return (
                        <Button
                          key={item.id}
                          type="button"
                          variant={isChecked ? "default" : "outline"}
                          size="sm"
                          onClick={() => togglePaymentMethod(item.id)}
                          className={`text-xs h-8 px-3 rounded-lg ${isChecked ? "bg-primary text-primary-foreground" : ""}`}
                        >
                          {isChecked && <Check className="h-3 w-3 mr-1.5" />}
                          {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* ABA 3: Estratégia de Fechamento da IA */}
              <TabsContent value="strategy" className="space-y-4 pt-4 mt-0">
                {/* Brinde / Bônus no Fechamento */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 text-amber-500" />
                    Brinde / Benefício Exclusivo no Fechamento (Opcional)
                  </Label>
                  <Input
                    placeholder="Ex: Ganha 10 sessões de Buço de presente + brinde exclusivo no fechamento"
                    value={formData.bonus_gift}
                    onChange={(e) => setFormData({ ...formData, bonus_gift: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    O brinde é o maior acelerador de fechamento no WhatsApp. A IA usa para criar urgência.
                  </p>
                </div>

                {/* Dica de Venda / Gatilho para a IA */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    Instrução & Gatilho Mental para o Agente de Vendas (Opcional)
                  </Label>
                  <Textarea
                    placeholder="Ex: Oferecer sempre que a cliente demonstrar interesse em virilha ou axilas. Enfatizar o pagamento recorrente suave no cartão que não consome o limite bancário."
                    value={formData.sales_pitch}
                    onChange={(e) => setFormData({ ...formData, sales_pitch: e.target.value })}
                    className="text-xs min-h-[75px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Orientação confidencial repassada no prompt da IA para ela saber a hora certa de ofertar este pacote.
                  </p>
                </div>

                {/* Switch de Ativo */}
                <div className="flex items-center justify-between p-3.5 bg-muted/20 rounded-xl border">
                  <div>
                    <Label className="text-xs font-semibold">Pacote Ativo no Catálogo da IA</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Quando desligado, a IA não oferecerá este pacote nem aplicará esta condição.
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(val) => setFormData({ ...formData, is_active: val })}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Simulação em Tempo Real no WhatsApp (Live Preview) */}
            <div className="p-3.5 rounded-xl bg-emerald-950/10 dark:bg-emerald-950/30 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  Como a Helena (IA de Vendas) vai falar este pacote no WhatsApp:
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">Preview ao vivo</span>
              </div>

              {/* Balão de Mensagem Realista */}
              <div className="bg-emerald-500/15 dark:bg-emerald-900/40 p-3 rounded-2xl rounded-tl-xs text-xs text-foreground/90 border border-emerald-500/30 shadow-xs relative">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400 text-[11px] mb-1">
                  *Helena - Consultora de Vendas*
                </p>
                <p className="leading-relaxed text-[11px]">{liveWhatsAppSimulation}</p>
                <div className="flex items-center justify-end gap-1 text-[9px] text-muted-foreground pt-1">
                  <span>14:32</span>
                  <Check className="h-2.5 w-2.5 text-blue-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer com Botões */}
          <div className="p-4 border-t bg-muted/20 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !formData.name.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 px-4 shadow-xs"
              >
                {saveMutation.isPending ? (
                  "Salvando..."
                ) : editingItem ? (
                  "Salvar Alterações"
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Cadastrar Pacote
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
