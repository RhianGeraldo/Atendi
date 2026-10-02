import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Plus, ChevronsUpDown, Check, Pencil, UserX, UserCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MENU_PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

function MultiSelectUnits({ units, selected, onChange }: { units: any[], selected: string[], onChange: (selected: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const allSelected = selected.length === units.length && units.length > 0;

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(units.map(u => u.id));
  };

  const toggleUnit = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(u => u !== id));
    else onChange([...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">
            {selected.length === 0 ? "Selecionar unidades..." : 
             allSelected ? "Todas as unidades selecionadas" : 
             `${selected.length} unidade(s) selecionada(s)`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar unidade..." />
          <CommandList>
            <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={toggleAll} className="cursor-pointer">
                <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", allSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                  <Check className={cn("h-3 w-3")} />
                </div>
                Selecionar Todas
              </CommandItem>
              {units.map(unit => {
                const isSelected = selected.includes(unit.id);
                return (
                  <CommandItem key={unit.id} onSelect={() => toggleUnit(unit.id)} className="cursor-pointer">
                    <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                      <Check className={cn("h-3 w-3")} />
                    </div>
                    {unit.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function UsersTab() {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState<string>("none");
  const [editRoleValue, setEditRoleValue] = useState<string>("agent");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editExtraMenus, setEditExtraMenus] = useState<string[]>([]);
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  
  // Create User State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("agent");
  const [newUserCustomRole, setNewUserCustomRole] = useState<string>("none");
  const [newUserUnits, setNewUserUnits] = useState<string[]>([]);
  const [newUserDepartment, setNewUserDepartment] = useState<string>("none");
  const [isCreating, setIsCreating] = useState(false);

  // Fetches ALL profiles of the company
  const { data: users, isLoading } = useQuery({
    queryKey: ["users", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, online, active, department_id, has_matriz_access, custom_role_id, allowed_menus, custom_role:company_roles(id, name, allowed_menus, base_role), departments!profiles_department_id_fkey(name), user_units(unit_id, role)")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
    }
  });

  const { data: companyRoles } = useQuery({
    queryKey: ["company-roles", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("company_roles" as any).select("id, name, base_role, allowed_menus").eq("company_id", activeCompanyId!).order("name");
      return (data as any[]) ?? [];
    }
  });

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditDepartment(u.department_id || "none");
    setEditRoleValue(u.custom_role_id || u.role);
    setEditActive(u.active !== false);
    setEditExtraMenus(Array.isArray(u.allowed_menus) ? [...u.allowed_menus] : []);
    const userUnitIds = [
      ...(u.has_matriz_access ? ["matriz"] : []),
      ...(u.user_units?.map((uu: any) => uu.unit_id) || [])
    ];
    setEditUnits(userUnitIds);
  };

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const customRole = companyRoles?.find((cr: any) => cr.id === editRoleValue);
      const isCustomRole = !!customRole;
      const baseRole = isCustomRole ? customRole.base_role : editRoleValue;
      const customRoleId = isCustomRole ? customRole.id : null;
      const departmentId = editDepartment === "none" ? null : editDepartment;
      const hasMatrizAccess = editUnits.includes("matriz");

      // 1. Atualizar profiles (nome, cargo, custom_role_id, allowed_menus, department_id, matriz, active)
      const updates: Record<string, any> = {
        name: editName.trim(),
        role: baseRole as any,
        active: editActive,
        custom_role_id: customRoleId,
        allowed_menus: editExtraMenus.length > 0 ? editExtraMenus : null,
        department_id: departmentId,
        has_matriz_access: hasMatrizAccess
      };
      if (!editActive) {
        updates.online = false;
      }

      const { error: profileErr } = await supabase.from("profiles").update(updates).eq("id", editingUser.id);
      if (profileErr) throw profileErr;

      // 2. Sincronizar user_departments
      await supabase.from("user_departments").delete().eq("user_id", editingUser.id);
      if (departmentId) {
        await supabase.from("user_departments").insert({ user_id: editingUser.id, department_id: departmentId });
      }

      // 3. Sincronizar user_units
      const standardUnits = editUnits.filter(id => id !== "matriz");
      await supabase.from("user_units").delete().eq("user_id", editingUser.id);
      if (standardUnits.length > 0) {
        const unitInserts = standardUnits.map(uid => ({
          user_id: editingUser.id,
          unit_id: uid,
          role: "agent"
        }));
        await supabase.from("user_units").insert(unitInserts);
      }
    },
    onSuccess: () => {
      toast.success("Membro da equipe atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
    },
    onError: (e: any) => {
      toast.error("Erro ao salvar alterações", { description: e.message });
    }
  });

  const { data: units } = useQuery({
    queryKey: ["units", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").eq("company_id", activeCompanyId!);
      return data ?? [];
    }
  });

  const { data: companyName } = useQuery({
    queryKey: ["company-name", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("name").eq("id", activeCompanyId!).single();
      return data?.name;
    }
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("company_id", activeCompanyId!);
      return data ?? [];
    }
  });

  const toggleUserActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const updates: Record<string, any> = { active };
      if (!active) {
        updates.online = false;
      }
      const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(variables.active ? "Membro da equipe reativado com sucesso!" : "Membro da equipe desativado.");
    },
    onError: (e) => toast.error("Erro ao alterar status do usuário", { description: (e as Error).message })
  });

  const handleCopyLink = () => {
    const link = `${window.location.origin}/auth?company=${activeCompanyId}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompanyId) return;
    setIsCreating(true);

    try {
      // Criamos um cliente secundário que NÃO persiste a sessão localmente.
      // Assim, o signUp não desloga o administrador atual.
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL, 
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data, error } = await tempClient.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            name: newUserName,
            company_id: activeCompanyId,
            department_id: newUserDepartment === "none" ? null : newUserDepartment,
          }
        }
      });

      if (error) throw error;

      // Se o usuário foi criado ou já existia (mas a senha falhou por já existir, nós tentaremos vinculá-lo caso o signUp dê erro de 'already registered', mas como aqui assumimos que signUp deu certo, garantimos o vinculo)
      if (data.user?.id) {
        // Aguarda 1.5 segundo para garantir que a trigger handle_new_user criou o perfil no Supabase
        await new Promise(r => setTimeout(r, 1500));
        
        // Usa a RPC que tem permissão de SECURITY DEFINER para enxergar o usuário sem empresa e vinculá-lo
        const { error: linkError } = await supabase.rpc('link_user_to_company', {
          p_email: newUserEmail,
          p_company_id: activeCompanyId
        });

        if (linkError) {
          throw new Error("Erro de Banco de Dados: A função 'link_user_to_company' não foi encontrada. Você PRECISA rodar as migrations (npx supabase db push) para poder criar novos usuários sem falhas de RLS.");
        }

        if (newUserRole !== "agent" || newUserUnits.includes("matriz")) {
          const { error: pErr } = await supabase.rpc("update_user_profile_admin", {
            p_user_id: data.user.id,
            p_role: newUserRole,
            p_has_matriz_access: newUserUnits.includes("matriz"),
            p_company_id: null
          });
          if (pErr) throw pErr;
        }

        // Persiste custom_role_id e department_id no perfil caso tenham sido selecionados
        const profileUpdates: Record<string, any> = {};
        if (newUserCustomRole && newUserCustomRole !== "none") {
          profileUpdates.custom_role_id = newUserCustomRole;
        }
        if (newUserDepartment && newUserDepartment !== "none") {
          profileUpdates.department_id = newUserDepartment;
        }
        if (Object.keys(profileUpdates).length > 0) {
          const { error: profErr } = await supabase
            .from("profiles")
            .update(profileUpdates)
            .eq("id", data.user.id);
          if (profErr) console.warn("[UsersTab] Erro ao atualizar perfil complementar:", profErr);
        }

        if (newUserDepartment && newUserDepartment !== "none") {
          await supabase.from("user_departments").delete().eq("user_id", data.user.id);
          await supabase.from("user_departments").insert({ user_id: data.user.id, department_id: newUserDepartment });
        }

        const standardUnits = newUserUnits.filter(id => id !== "matriz");
        if (standardUnits.length > 0) {
          const unitInserts = standardUnits.map(uid => ({
            user_id: data.user!.id,
            unit_id: uid,
            role: "agent"
          }));
          const { error: uErr } = await supabase.from("user_units").insert(unitInserts);
          if (uErr) throw uErr;
        }
      }

      toast.success("Usuário criado com sucesso!");
      setIsCreateModalOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("agent");
      setNewUserCustomRole("none");
      setNewUserUnits([]);
      setNewUserDepartment("none");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e: any) {
      // Se o erro for que o usuário já existe, tentamos vinculá-lo
      if (e.message?.includes("already registered") || e.message?.includes("User already exists")) {
        try {
          const { data: existingProfile } = await supabase.from("profiles").select("id").eq("email", newUserEmail).single();
          
          if (existingProfile) {
            const { error: pErr } = await supabase.rpc("update_user_profile_admin", {
              p_user_id: existingProfile.id,
              p_role: newUserRole,
              p_has_matriz_access: newUserUnits.includes("matriz"),
              p_company_id: activeCompanyId!
            });
            if (pErr) throw pErr;

            const existingUpdates: Record<string, any> = {};
            if (newUserCustomRole && newUserCustomRole !== "none") {
              existingUpdates.custom_role_id = newUserCustomRole;
            }
            if (newUserDepartment && newUserDepartment !== "none") {
              existingUpdates.department_id = newUserDepartment;
            }
            if (Object.keys(existingUpdates).length > 0) {
              await supabase.from("profiles").update(existingUpdates).eq("id", existingProfile.id);
            }

            if (newUserDepartment && newUserDepartment !== "none") {
              await supabase.from("user_departments").delete().eq("user_id", existingProfile.id);
              await supabase.from("user_departments").insert({ user_id: existingProfile.id, department_id: newUserDepartment });
            }

            const standardUnits = newUserUnits.filter(id => id !== "matriz");
            if (standardUnits.length > 0) {
              const unitInserts = standardUnits.map(uid => ({
                user_id: existingProfile.id,
                unit_id: uid,
                role: "agent"
              }));
              await supabase.from("user_units").upsert(unitInserts);
            }
          }

          toast.success("O usuário já existia e foi vinculado à sua empresa com os acessos definidos!");
          setIsCreateModalOpen(false);
          setNewUserName("");
          setNewUserEmail("");
          setNewUserPassword("");
          setNewUserRole("agent");
          setNewUserCustomRole("none");
          setNewUserUnits([]);
          setNewUserDepartment("none");
          qc.invalidateQueries({ queryKey: ["users"] });
          return;
        } catch (linkError: any) {
          toast.error("Falha ao vincular usuário existente", { description: linkError.message });
        }
      } else {
        toast.error("Falha ao criar", { description: e.message });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const unitsWithMatriz = units ? [{ id: "matriz", name: companyName || "Empresa Mãe (Sede)" }, ...units] : [];
  const isCompanyAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Somente a matriz e administradores podem gerar o link de convite para a empresa */}
      {!selectedUnitId && isCompanyAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Convite de Usuários</CardTitle>
            <CardDescription>
              Envie o link de convite abaixo para que novos funcionários criem suas contas vinculadas diretamente à sua empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm flex-1 truncate">
                {window.location.origin}/auth?company={activeCompanyId}
              </code>
              <Button variant="secondary" onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
              <div className="w-px h-8 bg-border mx-2" />
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Usuário
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Membros da Equipe</CardTitle>
            <CardDescription>
              {selectedUnitId
                ? "Gerencie quais funcionários da empresa possuem acesso a esta Unidade."
                : "Lista de todos os usuários da empresa. Aqui você define os níveis de acesso e status de atividade."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 self-start sm:self-auto bg-muted/60 p-1 rounded-lg text-xs border">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={cn("px-2.5 py-1 rounded-md transition-colors", statusFilter === "active" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              Ativos ({users?.filter(u => u.active !== false).length || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={cn("px-2.5 py-1 rounded-md transition-colors", statusFilter === "inactive" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              Inativos ({users?.filter(u => u.active === false).length || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn("px-2.5 py-1 rounded-md transition-colors", statusFilter === "all" ? "bg-background text-foreground shadow-xs font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              Todos ({users?.length || 0})
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando usuários...</div>
          ) : users?.length ? (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium min-w-[200px]">Nome / E-mail</th>
                    <th className="h-10 px-4 text-left font-medium min-w-[100px]">Status</th>
                    <th className="h-10 px-4 text-left font-medium min-w-[150px]">Departamento</th>
                    <th className="h-10 px-4 text-left font-medium min-w-[160px]">Cargo</th>
                    <th className="h-10 px-4 text-left font-medium min-w-[180px]">Unidades</th>
                    {!selectedUnitId && <th className="h-10 px-4 text-right font-medium min-w-[120px] whitespace-nowrap">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => {
                      if (selectedUnitId) {
                        const inUnit = u.role === 'admin_company' || u.user_units?.some((uu: any) => uu.unit_id === selectedUnitId);
                        if (!inUnit) return false;
                      }
                      if (statusFilter === "active") return u.active !== false;
                      if (statusFilter === "inactive") return u.active === false;
                      return true;
                    })
                    .map(u => {
                    const isSelf = u.id === profile?.id;
                    const isActive = u.active !== false;

                    return (
                      <tr key={u.id} className={cn("border-b last:border-0 hover:bg-muted/50 transition-colors", !isActive && "opacity-60 bg-muted/20")}>
                        <td className="p-4">
                          <div className="font-medium flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                (u as any).online && isActive
                                  ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                                  : "bg-muted-foreground/30"
                              }`}
                              title={(u as any).online && isActive ? "Online" : "Offline"}
                            />
                            <span>{u.name}</span>
                            {isSelf && <Badge variant="outline" className="ml-1 text-[10px]">Você</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground pl-3.5">{u.email}</div>
                        </td>
                        <td className="p-4">
                          {isActive ? (
                            <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25 text-xs font-normal">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground bg-muted/60 border-muted text-xs font-normal">
                              Inativo
                            </Badge>
                          )}
                        </td>
                        <td className="p-4">
                          {u.departments?.name ? (
                            <Badge variant="outline" className="font-normal text-xs">
                              {u.departments.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sem departamento</span>
                          )}
                        </td>
                        <td className="p-4">
                          <Badge
                            variant={u.role === 'super_admin' || u.role === 'admin_company' ? 'default' : 'secondary'}
                            className="font-normal text-xs"
                          >
                            {u.role === 'super_admin' ? 'Super Admin' : u.custom_role?.name || (u.role === 'admin_company' ? 'Administrador' : u.role === 'manager' ? 'Gerente' : 'Agente')}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {u.role === 'admin_company' || u.role === 'super_admin' ? (
                            <Badge variant="secondary" className="text-xs font-normal bg-primary/10 text-primary border-primary/20">
                              Todas as unidades
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[280px]">
                              {u.has_matriz_access && (
                                <Badge variant="outline" className="text-[11px] font-normal">
                                  {companyName || "Matriz"}
                                </Badge>
                              )}
                              {u.user_units?.map((uu: any) => {
                                const uName = units?.find(un => un.id === uu.unit_id)?.name || "Filial";
                                return (
                                  <Badge key={uu.unit_id} variant="outline" className="text-[11px] font-normal">
                                    {uName}
                                  </Badge>
                                );
                              })}
                              {!u.has_matriz_access && (!u.user_units || u.user_units.length === 0) && (
                                <span className="text-xs text-muted-foreground italic">Nenhuma</span>
                              )}
                            </div>
                          )}
                        </td>
                        {!selectedUnitId && (
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs gap-1.5"
                                onClick={() => openEditModal(u)}
                                title="Editar membro"
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Editar</span>
                              </Button>
                              {isCompanyAdmin && (
                                isActive ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={isSelf || toggleUserActive.isPending}
                                    className="h-8 w-8 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10"
                                    title="Desativar usuário (preserva histórico)"
                                    onClick={() => {
                                      if (window.confirm(`Tem certeza que deseja desativar o acesso de ${u.name}?\n\nO usuário não conseguirá mais entrar no sistema, mas todo o seu histórico de atendimentos, conversas e negócios continuará intacto.`)) {
                                        toggleUserActive.mutate({ userId: u.id, active: false });
                                      }
                                    }}
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={toggleUserActive.isPending}
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                    title="Reativar usuário"
                                    onClick={() => {
                                      if (window.confirm(`Deseja reativar o acesso de ${u.name}?`)) {
                                        toggleUserActive.mutate({ userId: u.id, active: true });
                                      }
                                    }}
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="text-sm text-muted-foreground italic">Nenhum usuário cadastrado.</div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Criação de Usuário */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie uma conta para um funcionário. Ele já será vinculado à sua empresa.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input required value={newUserName} onChange={e => setNewUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Senha Temporária</Label>
              <Input type="password" required minLength={6} value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">O funcionário poderá alterar depois (mínimo 6 caracteres).</p>
            </div>
            <div className="space-y-2">
              <Label>Departamento Principal</Label>
              <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um departamento (Opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem departamento</SelectItem>
                  {departments?.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cargo / Nível de Acesso</Label>
              <Select
                value={newUserCustomRole !== "none" ? newUserCustomRole : newUserRole}
                onValueChange={(val) => {
                  const customRole = companyRoles?.find((cr: any) => cr.id === val);
                  if (customRole) {
                    setNewUserCustomRole(customRole.id);
                    setNewUserRole(customRole.base_role);
                  } else {
                    setNewUserCustomRole("none");
                    setNewUserRole(val);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profile?.role === "super_admin" && (
                    <SelectItem value="super_admin">Super Administrador</SelectItem>
                  )}
                  <SelectItem value="agent">Agente (Padrão)</SelectItem>
                  <SelectItem value="manager">Gerente (Padrão)</SelectItem>
                  <SelectItem value="admin_company">Administrador (Padrão)</SelectItem>
                  {companyRoles && companyRoles.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground border-t mt-1">Cargos Customizados</div>
                      {companyRoles.map((cr: any) => (
                        <SelectItem key={cr.id} value={cr.id}>
                          {cr.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {newUserRole !== "admin_company" && unitsWithMatriz.length > 0 && (
              <div className="space-y-2 border-t pt-4 mt-2">
                <Label>Acesso às Unidades</Label>
                <MultiSelectUnits 
                  units={unitsWithMatriz}
                  selected={newUserUnits}
                  onChange={setNewUserUnits}
                />
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button type="button" variant="ghost" className="mr-2" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Unificado de Edição de Usuário */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Membro da Equipe
            </DialogTitle>
            <DialogDescription>
              Altere as informações cadastrais, departamento, cargo e permissões de acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                value={editingUser?.email || ""}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground">O endereço de e-mail é a chave de login e não pode ser alterado.</p>
            </div>

            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select value={editDepartment} onValueChange={setEditDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem departamento</SelectItem>
                  {departments?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCompanyAdmin && (
              <div className="space-y-2">
                <Label>Cargo / Nível de Acesso</Label>
                <Select
                  disabled={editingUser?.id === profile?.id}
                  value={editRoleValue}
                  onValueChange={setEditRoleValue}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(profile?.role === "super_admin" || editingUser?.role === "super_admin") && (
                      <SelectItem value="super_admin">Super Administrador</SelectItem>
                    )}
                    <SelectItem value="agent">Agente (Padrão)</SelectItem>
                    <SelectItem value="manager">Gerente (Padrão)</SelectItem>
                    <SelectItem value="admin_company">Administrador (Padrão)</SelectItem>
                    {companyRoles && companyRoles.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground border-t mt-1">
                          Cargos Customizados
                        </div>
                        {companyRoles.map((cr: any) => (
                          <SelectItem key={cr.id} value={cr.id}>
                            {cr.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {editingUser?.id === profile?.id && (
                  <p className="text-[11px] text-amber-500">
                    Você não pode alterar seu próprio nível de acesso administrativo.
                  </p>
                )}
              </div>
            )}

            {/* Acesso às Unidades */}
            <div className="space-y-2">
              <Label>Acesso às Unidades</Label>
              {editRoleValue === "admin_company" || editRoleValue === "super_admin" ? (
                <div className="rounded-md border p-3 bg-muted/40 text-xs text-muted-foreground">
                  Administradores possuem acesso automático a todas as filiais e à Matriz da empresa.
                </div>
              ) : unitsWithMatriz.length > 0 ? (
                <MultiSelectUnits
                  units={unitsWithMatriz}
                  selected={editUnits}
                  onChange={setEditUnits}
                />
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada na empresa.</p>
              )}
            </div>

            {/* Permissões Adicionais de Menu (Exceções) */}
            {isCompanyAdmin && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label className="text-sm font-semibold">Permissões Adicionais de Menu (Exceções)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Marque os menus adicionais que este membro específico poderá acessar além dos permitidos por seu Cargo.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-border p-3 bg-muted/30 max-h-52 overflow-y-auto">
                  {ALL_MENU_PERMISSIONS.map((menu) => {
                    const isChecked = editExtraMenus.includes(menu.key);
                    const toggleExtraMenu = (key: string) => {
                      setEditExtraMenus((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                      );
                    };

                    return (
                      <div
                        key={menu.key}
                        onClick={() => toggleExtraMenu(menu.key)}
                        className={`flex items-start gap-2.5 p-2 rounded-md border transition-colors cursor-pointer ${
                          isChecked
                            ? "bg-primary/10 border-primary/40 text-foreground"
                            : "bg-background border-border hover:bg-accent/50"
                        }`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleExtraMenu(menu.key)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold">{menu.label}</div>
                          <div className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                            {menu.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status do Acesso (Ativo / Desativado) */}
            {isCompanyAdmin && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Status do Acesso</Label>
                  <p className="text-xs text-muted-foreground">
                    {editActive
                      ? "Conta ativa: o usuário tem acesso ao sistema e recebe atendimentos."
                      : "Conta desativada: login bloqueado, histórico de conversas e negócios 100% preservado."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={editActive ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25" : "text-muted-foreground bg-muted"}>
                    {editActive ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={editingUser?.id === profile?.id}
                    onClick={() => setEditActive(!editActive)}
                  >
                    {editActive ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingUser(null)}
              disabled={saveUserMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveUserMutation.mutate()}
              disabled={saveUserMutation.isPending || !editName.trim()}
            >
              {saveUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
