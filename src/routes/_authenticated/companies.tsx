import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  MapPin,
  Trash2,
  ChevronRight,
  Store,
  MoreVertical,
  Edit2,
  Users2,
  Search,
  X,
  Globe,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/companies")({
  component: CompaniesPage,
});

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Page ────────────────────────────────────────────────────────────────────
function CompaniesPage() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<any>(null);
  const [managingCompany, setManagingCompany] = useState<any>(null);

  // Fetch all companies via RPC (super_admin only)
  const { data: companies, isLoading } = useQuery({
    queryKey: ["all-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_companies");
      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
        created_at: string;
        unit_count: number;
      }>;
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("super_delete_company", { p_company_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa excluída!");
      setDeletingCompany(null);
      qc.invalidateQueries({ queryKey: ["all-companies"] });
    },
    onError: (e) => toast.error("Erro ao excluir", { description: (e as Error).message }),
  });

  if (profile?.role !== "super_admin") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">Acesso Restrito</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva para <strong>super_admin</strong>. Você não tem permissão para acessar o painel de empresas.
          </p>
        </div>
      </div>
    );
  }

  const filtered = (companies ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-violet-100 text-violet-700 border-violet-200">
              Super Admin
            </Badge>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Empresas Cadastradas</h2>
          <p className="text-muted-foreground mt-1">
            Gerencie todas as empresas e suas unidades no sistema.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 h-10 px-5 gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      {/* Search + Stats */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm shadow-sm">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">{companies?.length ?? 0}</span>
            <span className="text-muted-foreground">empresas</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm shadow-sm">
            <MapPin className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold">
              {companies?.reduce((sum, c) => sum + Number(c.unit_count), 0) ?? 0}
            </span>
            <span className="text-muted-foreground">unidades</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl border bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center text-muted-foreground bg-card/30">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold text-foreground">
            {search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
          </h3>
          <p className="text-sm mt-1">
            {search
              ? `Nenhum resultado para "${search}".`
              : 'Clique em "Nova Empresa" para começar.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              onManage={() => setManagingCompany(company)}
              onDelete={() => setDeletingCompany(company)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateCompanyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["all-companies"] })}
      />

      <AlertDialog open={!!deletingCompany} onOpenChange={(v) => !v && setDeletingCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCompany?.name}</strong>? Essa ação irá
              remover todas as unidades, departamentos, conversas e dados vinculados. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCompany.mutate(deletingCompany.id)}
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {managingCompany && (
        <CompanyUnitsSheet
          open={!!managingCompany}
          onOpenChange={(v) => !v && setManagingCompany(null)}
          company={managingCompany}
        />
      )}
    </div>
  );
}

// ─── Company Card ─────────────────────────────────────────────────────────────
function CompanyCard({
  company,
  onManage,
  onDelete,
}: {
  company: any;
  onManage: () => void;
  onDelete: () => void;
}) {
  const unitCount = Number(company.unit_count);
  const createdAt = new Date(company.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Card className="group overflow-hidden flex flex-col transition-all hover:shadow-lg border-border/60 hover:border-border">
      {/* Top accent bar with gradient */}
      <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />

      <CardHeader className="pb-3 flex flex-row justify-between items-start gap-2">
        <div className="min-w-0">
          <CardTitle className="text-lg truncate">{company.name}</CardTitle>
          <CardDescription className="font-mono text-xs mt-0.5 truncate">
            /{company.slug}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-2 h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onManage}>
              <Edit2 className="mr-2 h-4 w-4" />
              Gerenciar Unidades
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir Empresa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="pb-4 flex-1">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 bg-muted/40 px-3 py-1.5 rounded-full">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-medium text-foreground">{unitCount}</span>
            <span>{unitCount === 1 ? "unidade" : "unidades"}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/40 px-3 py-1.5 rounded-full">
            <Globe className="h-3.5 w-3.5" />
            <span className="text-xs">{createdAt}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-0 border-t border-border/40 mt-auto bg-muted/10 px-0">
        <Button
          variant="ghost"
          className="w-full rounded-none h-11 justify-between px-6 hover:bg-muted/30 text-sm"
          onClick={onManage}
        >
          <span className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-muted-foreground" />
            Gerenciar Unidades
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Create Company Dialog ────────────────────────────────────────────────────
function CreateCompanyDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [firstUnit, setFirstUnit] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const slug = slugify(name);
      if (!slug) throw new Error("Nome inválido para gerar slug.");
      const { error } = await supabase.rpc("super_create_company", {
        p_name: name,
        p_slug: slug,
        p_first_unit_name: firstUnit || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa criada com sucesso!");
      setName("");
      setFirstUnit("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (e) => toast.error("Erro ao criar empresa", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Nova Empresa
          </DialogTitle>
          <DialogDescription>
            Cadastre uma nova empresa no sistema. Você poderá adicionar unidades depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome da Empresa *</label>
            <Input
              placeholder="Ex: Rede Clínicas Norte"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name && create.mutate()}
            />
            {name && (
              <p className="text-xs text-muted-foreground font-mono">
                Slug: <span className="text-foreground">{slugify(name)}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Primeira Unidade <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Input
              placeholder="Ex: Unidade Centro"
              value={firstUnit}
              onChange={(e) => setFirstUnit(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cria automaticamente a primeira unidade junto com a empresa.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name || create.isPending}
          >
            {create.isPending ? "Criando..." : "Criar Empresa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Company Units Sheet ──────────────────────────────────────────────────────
function CompanyUnitsSheet({
  open,
  onOpenChange,
  company,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: any;
}) {
  const qc = useQueryClient();
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitColor, setNewUnitColor] = useState("#6366f1");
  const [deletingUnit, setDeletingUnit] = useState<any>(null);

  const { data: units, isLoading, error: unitsError } = useQuery({
    queryKey: ["company-units-admin", company.id],
    queryFn: async () => {
      // Usa query direta — RLS já permite super_admin via policy atualizada
      const { data, error } = await supabase
        .from("units")
        .select("id, company_id, name, slug, color, active, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createUnit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("units").insert({
        company_id: company.id,
        name: newUnitName,
        slug: newUnitName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
        color: newUnitColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade criada!");
      setNewUnitName("");
      setNewUnitColor("#6366f1");
      qc.invalidateQueries({ queryKey: ["company-units-admin", company.id] });
      qc.invalidateQueries({ queryKey: ["all-companies"] });
    },
    onError: (e) => toast.error("Erro ao criar unidade", { description: (e as Error).message }),
  });

  const deleteUnit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade excluída!");
      setDeletingUnit(null);
      qc.invalidateQueries({ queryKey: ["company-units-admin", company.id] });
      qc.invalidateQueries({ queryKey: ["all-companies"] });
    },
    onError: (e) => toast.error("Não foi possível excluir", { description: (e as Error).message }),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[580px] w-full overflow-y-auto p-0 flex flex-col h-full bg-background">
          {/* Top accent */}
          <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />

          <SheetHeader className="p-6 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-xl">{company.name}</SheetTitle>
                <SheetDescription className="font-mono text-xs">/{company.slug}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="px-6 flex-1 space-y-6 pb-8">
            {/* Add Unit Form */}
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <h4 className="text-sm font-semibold">Adicionar Nova Unidade</h4>
              <div className="flex gap-2">
                <div className="relative group shrink-0">
                  <Input
                    type="color"
                    className="w-10 h-9 p-0 border-0 rounded-md cursor-pointer overflow-hidden shadow-sm"
                    value={newUnitColor}
                    onChange={(e) => setNewUnitColor(e.target.value)}
                    title="Cor da unidade"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-md pointer-events-none" />
                </div>
                <Input
                  placeholder="Nome da unidade (ex: Filial Sul)"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newUnitName && createUnit.mutate()}
                  className="flex-1 h-9"
                />
                <Button
                  size="sm"
                  className="h-9 px-4 shrink-0"
                  onClick={() => createUnit.mutate()}
                  disabled={!newUnitName || createUnit.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Criar
                </Button>
              </div>
            </div>

            {/* Units List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Unidades Cadastradas</h4>
                <Badge variant="secondary" className="font-mono text-xs">
                  {units?.length ?? 0}
                </Badge>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 rounded-lg border bg-card/50 animate-pulse" />
                  ))}
                </div>
              ) : unitsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  <p className="font-medium">Erro ao carregar unidades:</p>
                  <p className="text-xs mt-1 opacity-80">{(unitsError as Error).message}</p>
                </div>
              ) : units?.length ? (
                <div className="space-y-2">
                  {units.map((unit) => (
                    <div
                      key={unit.id}
                      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 hover:border-border transition-all hover:shadow-sm"
                    >
                      {/* Color dot */}
                      <div
                        className="h-3 w-3 rounded-full shrink-0 ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: unit.color || "#6366f1" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{unit.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">
                          {unit.slug}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={unit.active ? "default" : "secondary"}
                          className={`text-[10px] h-5 font-medium ${unit.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ""}`}
                        >
                          {unit.active ? "Ativa" : "Inativa"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                          onClick={() => setDeletingUnit(unit)}
                          title="Excluir unidade"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground bg-card/30">
                  <Store className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium text-foreground">Nenhuma unidade cadastrada</p>
                  <p className="text-xs mt-1">Adicione a primeira unidade acima.</p>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete unit dialog */}
      <AlertDialog open={!!deletingUnit} onOpenChange={(v) => !v && setDeletingUnit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Unidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingUnit?.name}</strong>? Esta ação falhará se houver instâncias ou usuários vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUnit.mutate(deletingUnit.id)}
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
