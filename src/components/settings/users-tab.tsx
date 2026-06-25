import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Shield, Trash2, UserPlus, UserMinus, Building, Plus, ChevronsUpDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [manageAccessUser, setManageAccessUser] = useState<any>(null);
  
  // Create User State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("agent");
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
        .select("id, name, email, role, department_id, has_matriz_access, departments!profiles_department_id_fkey(name), user_units(unit_id, role)")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return data;
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

  const updateGlobalRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string, role: string }) => {
      const { error } = await supabase.rpc("update_user_profile_admin", {
        p_user_id: userId,
        p_role: role,
        p_has_matriz_access: null,
        p_company_id: null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nível de acesso atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: (e as Error).message })
  });

  const updateUserDepartment = useMutation({
    mutationFn: async ({ userId, departmentId }: { userId: string, departmentId: string | null }) => {
      const { error } = await supabase.from("profiles").update({ department_id: departmentId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro ao atualizar departamento", { description: (e as Error).message })
  });

  const toggleUnitAccess = useMutation({
    mutationFn: async ({ userId, hasAccess }: { userId: string, hasAccess: boolean }) => {
      if (!selectedUnitId) return;
      if (hasAccess) {
        // Remover
        const { error } = await supabase.from("user_units").delete().eq("user_id", userId).eq("unit_id", selectedUnitId);
        if (error) throw error;
      } else {
        // Adicionar
        const { error } = await supabase.from("user_units").insert({ user_id: userId, unit_id: selectedUnitId, role: "agent" });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      toast.success(variables.hasAccess ? "Acesso revogado da unidade." : "Usuário adicionado à unidade.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
  });

  const toggleSpecificUnitAccess = useMutation({
    mutationFn: async ({ userId, unitId, hasAccess }: { userId: string, unitId: string, hasAccess: boolean }) => {
      if (unitId === "matriz") {
        const { error } = await supabase.rpc("toggle_matriz_access_rpc", { p_user_id: userId, p_has_access: hasAccess });
        if (error) throw error;
        return;
      }

      if (!hasAccess) {
        const { error } = await supabase.from("user_units").delete().eq("user_id", userId).eq("unit_id", unitId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_units").upsert({ user_id: userId, unit_id: unitId, role: "agent" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error("Erro", { description: (e as Error).message })
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

  return (
    <div className="space-y-6">
      {/* Somente a matriz pode gerar o link de convite para a empresa */}
      {!selectedUnitId && (
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
        <CardHeader>
          <CardTitle>Membros da Equipe</CardTitle>
          <CardDescription>
            {selectedUnitId 
              ? "Gerencie quais funcionários da empresa possuem acesso a esta Unidade."
              : "Lista de todos os usuários da empresa. Aqui você define os níveis globais de acesso."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando usuários...</div>
          ) : users?.length ? (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium">Nome / E-mail</th>
                    <th className="h-10 px-4 text-left font-medium">Departamento</th>
                    <th className="h-10 px-4 text-left font-medium">Nível Global</th>
                    {!selectedUnitId && <th className="h-10 px-4 text-right font-medium">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {(selectedUnitId 
                    ? users.filter(u => u.role === 'admin_company' || u.user_units.some((uu: any) => uu.unit_id === selectedUnitId))
                    : users
                  ).map(u => {
                    const isSelf = u.id === profile?.id;

                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4">
                          <div className="font-medium">{u.name} {isSelf && <Badge variant="outline" className="ml-2 text-[10px]">Você</Badge>}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="p-4">
                          {!selectedUnitId ? (
                            <Select 
                              disabled={updateUserDepartment.isPending} 
                              value={u.department_id || "none"} 
                              onValueChange={(val) => updateUserDepartment.mutate({ userId: u.id, departmentId: val === "none" ? null : val })}
                            >
                              <SelectTrigger className="h-8 w-[160px]">
                                <SelectValue placeholder="Sem departamento" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {departments?.map(dept => (
                                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{u.departments?.name || "Nenhum"}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {!selectedUnitId ? (
                            <Select 
                              disabled={isSelf || updateGlobalRole.isPending} 
                              defaultValue={u.role} 
                              onValueChange={(val) => updateGlobalRole.mutate({ userId: u.id, role: val })}
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="agent">Agente</SelectItem>
                                <SelectItem value="manager">Gerente</SelectItem>
                                <SelectItem value="admin_company">Administrador</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={u.role === 'admin_company' ? 'default' : 'secondary'}>
                              {u.role === 'admin_company' ? 'Admin' : u.role === 'manager' ? 'Gerente' : 'Agente'}
                            </Badge>
                          )}
                        </td>
                        {!selectedUnitId && (
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8"
                                disabled={u.role === 'admin_company'} // Admins têm acesso global a todas
                                onClick={() => setManageAccessUser(u)}
                              >
                                <Building className="h-4 w-4 mr-2" />
                                Acessos às Unidades
                              </Button>
                              <Button variant="ghost" size="icon" disabled={isSelf} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

      <Dialog open={!!manageAccessUser} onOpenChange={(open) => !open && setManageAccessUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acessos de {manageAccessUser?.name}</DialogTitle>
            <DialogDescription>
              Selecione em quais Unidades este usuário pode atuar.
              Usuários administradores têm acesso automático a todas as unidades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Acesso às Unidades</Label>
            {unitsWithMatriz.length > 0 ? (
              <MultiSelectUnits 
                units={unitsWithMatriz}
                selected={[
                  ...(manageAccessUser?.has_matriz_access ? ["matriz"] : []),
                  ...(manageAccessUser?.user_units?.map((uu: any) => uu.unit_id) || [])
                ]}
                onChange={(newSelected) => {
                  const currentSelected = [
                    ...(manageAccessUser?.has_matriz_access ? ["matriz"] : []),
                    ...(manageAccessUser?.user_units?.map((uu: any) => uu.unit_id) || [])
                  ];
                  
                  const added = newSelected.filter(id => !currentSelected.includes(id));
                  const removed = currentSelected.filter((id: string) => !newSelected.includes(id));
                  
                  added.forEach(unitId => {
                    toggleSpecificUnitAccess.mutate({ userId: manageAccessUser.id, unitId, hasAccess: true });
                  });
                  
                  removed.forEach(unitId => {
                    toggleSpecificUnitAccess.mutate({ userId: manageAccessUser.id, unitId, hasAccess: false });
                  });
                  
                  setManageAccessUser((prev: any) => ({
                    ...prev,
                    has_matriz_access: newSelected.includes("matriz"),
                    user_units: newSelected.filter(id => id !== "matriz").map(unit_id => ({ unit_id, role: 'agent' }))
                  }));
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada na empresa.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
              <Label>Nível de Acesso (Matriz)</Label>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agente</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="admin_company">Administrador</SelectItem>
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
    </div>
  );
}
