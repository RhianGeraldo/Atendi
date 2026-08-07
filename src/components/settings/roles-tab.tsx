import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { ALL_MENU_PERMISSIONS, DEFAULT_ROLE_MENUS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Shield, Plus, Edit2, Trash2, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";

export interface CompanyRole {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  base_role: "admin_company" | "manager" | "agent";
  allowed_menus: string[];
  created_at: string;
}

export function RolesTab() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CompanyRole | null>(null);

  // Form State
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [baseRole, setBaseRole] = useState<"admin_company" | "manager" | "agent">("agent");
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);

  // Auto-seed initial 3 roles if company has none
  const seedDefaultRolesMutation = useMutation({
    mutationFn: async () => {
      const defaultRolesToInsert = [
        {
          company_id: activeCompanyId!,
          name: "Administrador",
          description: "Acesso total a todas as configurações, relatórios e métricas da empresa.",
          base_role: "admin_company",
          allowed_menus: ALL_MENU_PERMISSIONS.map((m) => m.key),
        },
        {
          company_id: activeCompanyId!,
          name: "Gerente",
          description: "Gestão da unidade, acompanhamento de equipe, relatórios e CRM.",
          base_role: "manager",
          allowed_menus: [
            "dashboard",
            "conversations",
            "calls",
            "contacts",
            "pipeline",
            "tasks",
            "campaigns",
            "reports",
            "settings",
          ],
        },
        {
          company_id: activeCompanyId!,
          name: "Agente",
          description: "Atendimento operacional (Conversas, Ligações, Contatos e Tarefas).",
          base_role: "agent",
          allowed_menus: ["conversations", "calls", "contacts", "tasks"],
        },
      ];

      const { error } = await supabase.from("company_roles" as any).insert(defaultRolesToInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-roles", activeCompanyId] });
    },
  });

  // Fetch Company Roles
  const { data: roles, isLoading } = useQuery({
    queryKey: ["company-roles", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_roles" as any)
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      if ((!data || data.length === 0) && activeCompanyId) {
        seedDefaultRolesMutation.mutate();
      }

      return (data as CompanyRole[]) ?? [];
    },
  });

  const openCreateModal = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setBaseRole("agent");
    setSelectedMenus([...(DEFAULT_ROLE_MENUS.agent || [])]);
    setModalOpen(true);
  };

  const openEditModal = (role: CompanyRole) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setBaseRole(role.base_role);
    setSelectedMenus(Array.isArray(role.allowed_menus) ? [...role.allowed_menus] : []);
    setModalOpen(true);
  };

  const handleToggleMenu = (key: string) => {
    setSelectedMenus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllMenus = () => {
    setSelectedMenus(ALL_MENU_PERMISSIONS.map((m) => m.key));
  };

  const handleDeselectAllMenus = () => {
    setSelectedMenus([]);
  };

  // Create / Update Mutation
  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      if (!roleName.trim()) throw new Error("O nome do cargo é obrigatório.");

      if (editingRole) {
        const { error } = await supabase
          .from("company_roles" as any)
          .update({
            name: roleName.trim(),
            description: roleDescription.trim() || null,
            base_role: baseRole,
            allowed_menus: selectedMenus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingRole.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_roles" as any).insert({
          company_id: activeCompanyId!,
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          base_role: baseRole,
          allowed_menus: selectedMenus,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingRole ? "Cargo atualizado com sucesso!" : "Novo cargo criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["company-roles", activeCompanyId] });
      setModalOpen(false);
    },
    onError: (err) => {
      toast.error("Erro ao salvar cargo", { description: (err as Error).message });
    },
  });

  // Delete Mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("company_roles" as any).delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["company-roles", activeCompanyId] });
    },
    onError: (err) => {
      toast.error("Erro ao remover cargo", { description: (err as Error).message });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cargos e Permissões de Menu</h2>
          <p className="text-sm text-muted-foreground">
            Defina os cargos da sua empresa e configure exatamente quais menus do sistema cada cargo pode acessar.
          </p>
        </div>
        <Button onClick={openCreateModal} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Novo Cargo
        </Button>
      </div>

      {/* Grid of All Roles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
            Carregando cargos...
          </div>
        ) : !roles || roles.length === 0 ? (
          <Card className="col-span-full border-dashed p-8 text-center">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
            <h3 className="font-semibold">Nenhum cargo cadastrado</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
              Crie cargos para a sua empresa e defina exatamente quais menus do sistema cada cargo pode visualizar.
            </p>
            <Button onClick={openCreateModal} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Cargo
            </Button>
          </Card>
        ) : (
          roles.map((role) => {
            const menuCount = role.allowed_menus?.length || 0;
            return (
              <Card key={role.id} className="relative flex flex-col justify-between overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">{role.name}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2 mt-0.5">
                        {role.description || "Sem descrição"}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                      {role.base_role === "admin_company"
                        ? "Admin"
                        : role.base_role === "manager"
                        ? "Gerente"
                        : "Atendente"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary/70" />
                    <span>
                      {menuCount === ALL_MENU_PERMISSIONS.length
                        ? "Acesso Total aos Menus"
                        : `${menuCount} de ${ALL_MENU_PERMISSIONS.length} Menus Permitidos`}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {ALL_MENU_PERMISSIONS.filter((m) => role.allowed_menus?.includes(m.key)).map(
                      (m) => (
                        <Badge key={m.key} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {m.label}
                        </Badge>
                      )
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(role)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja excluir o cargo "${role.name}"?`)) {
                          deleteRoleMutation.mutate(role.id);
                        }
                      }}
                      className="h-8 text-xs gap-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal Create / Edit Role */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? `Editar Cargo: ${editingRole.name}` : "Novo Cargo"}</DialogTitle>
            <DialogDescription>
              Configure o nome do cargo e selecione os menus aos quais os usuários desse cargo terão acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome do Cargo</label>
              <Input
                placeholder="Ex: Vendedor, Supervisor de Vendas, Atendente N1"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea
                placeholder="Ex: Responsável por atendimentos e gestão de oportunidades de venda."
                rows={2}
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nível Base de Permissão do Sistema</label>
              <Select value={baseRole} onValueChange={(val: any) => setBaseRole(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Atendente (Operacional)</SelectItem>
                  <SelectItem value="manager">Gerente / Supervisor (Gestão da Unidade)</SelectItem>
                  <SelectItem value="admin_company">Administrador da Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkbox Menu Permissions */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Menus Permitidos para este Cargo
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSelectAllMenus}>
                    Marcar Todos
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDeselectAllMenus}>
                    Desmarcar Todos
                  </Button>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 rounded-lg border border-border p-3 bg-muted/30">
                {ALL_MENU_PERMISSIONS.map((menu) => {
                  const isChecked = selectedMenus.includes(menu.key);
                  return (
                    <div
                      key={menu.key}
                      onClick={() => handleToggleMenu(menu.key)}
                      className={`flex items-start gap-3 p-2.5 rounded-md border transition-colors cursor-pointer ${
                        isChecked
                          ? "bg-primary/10 border-primary/40 text-foreground"
                          : "bg-background border-border hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleMenu(menu.key)}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold">{menu.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">
                          {menu.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveRoleMutation.mutate()} disabled={saveRoleMutation.isPending}>
              {saveRoleMutation.isPending ? "Salvando..." : "Salvar Cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
