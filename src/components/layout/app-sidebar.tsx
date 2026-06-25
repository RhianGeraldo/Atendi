import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  KanbanSquare,
  CheckSquare,
  Megaphone,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut, Phone,
  Building2,
  Building,
  ChevronsUpDown,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/conversations", label: "Atendimentos", icon: MessageSquare },
  { to: "/calls", label: "Ligações", icon: Phone },
  { to: "/contacts", label: "Contatos", icon: Users },
  { to: "/pipeline", label: "Funil de Vendas", icon: KanbanSquare },
  { to: "/tasks", label: "Tarefas", icon: CheckSquare },
  { to: "/campaigns", label: "Campanhas", icon: Megaphone },
  { to: "/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/units", label: "Gestão de Unidades", icon: Building2, globalOnly: true },
  { to: "/settings", label: "Configurações", icon: Settings },
  { to: "/companies", label: "Empresas", icon: Building, superAdminOnly: true },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: Props) {
  const { profile, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: companyName } = useQuery({
    queryKey: ["company-name", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("name").eq("id", profile!.company_id!).single();
      return data?.name || "Minha Empresa";
    }
  });

  const { data: departmentName } = useQuery({
    queryKey: ["department-name", profile?.department_id],
    enabled: !!profile?.department_id,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("name").eq("id", profile!.department_id!).single();
      return data?.name;
    }
  });

  const { selectedUnitId, setSelectedUnitId } = useUnit();
  
  // Super admin: seletor de empresa ativo no sidebar
  const isSuperAdmin = profile?.role === 'super_admin';
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    () => typeof window !== 'undefined' ? localStorage.getItem('omni_selected_company_id') : null
  );
  const handleSelectCompany = (id: string | null) => {
    setSelectedCompanyId(id);
    setSelectedUnitId(null); // reset unit when company changes
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('omni_selected_company_id', id);
      else localStorage.removeItem('omni_selected_company_id');
    }
  };

  // Todas as empresas (apenas super_admin)
  const { data: allCompanies } = useQuery({
    queryKey: ['all-companies-sidebar'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      return data ?? [];
    },
  });
  const selectedSuperCompany = allCompanies?.find(c => c.id === selectedCompanyId);

  // Para super_admin: unidades da empresa selecionada no sidebar
  const effectiveCompanyId = isSuperAdmin ? selectedCompanyId : profile?.company_id;

  const { data: units } = useQuery({
    queryKey: ["sidebar-units", effectiveCompanyId, profile?.id, isSuperAdmin],
    enabled: !!effectiveCompanyId,
    queryFn: async () => {
      const { data: allUnits } = await supabase
        .from("units")
        .select("id, name")
        .eq("company_id", effectiveCompanyId!)
        .order("created_at", { ascending: true });

      if (isSuperAdmin || profile!.role === 'admin_company') {
        return allUnits || [];
      }

      // Usuário comum: filtra pelas unidades vinculadas
      const { data: userUnits } = await supabase.from("user_units").select("unit_id").eq("user_id", profile!.id);
      const allowedIds = userUnits?.map(u => u.unit_id) || [];
      return (allUnits || []).filter(u => allowedIds.includes(u.id));
    }
  });

  useEffect(() => {
    if (!selectedUnitId && profile && profile.role !== 'admin_company' && profile.role !== 'super_admin' && units && units.length > 0) {
      setSelectedUnitId(units[0].id);
    }
  }, [selectedUnitId, profile, units, setSelectedUnitId]);

  const selectedUnit = units?.find(u => u.id === selectedUnitId);

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-[64px]" : "w-[240px]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-sidebar-border px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Omni</div>
            <div className="truncate text-xs text-sidebar-foreground/60">
              Painel de Gestão
            </div>
          </div>
        )}
      </div>

      {/* Super Admin: Company selector */}
      {!collapsed && isSuperAdmin && (
        <div className="px-3 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1.5 px-1">Empresa</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-left text-sm transition-colors hover:bg-violet-500/20">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Building className="h-4 w-4 shrink-0 text-violet-400" />
                  <span className="font-medium truncate text-sidebar-foreground">
                    {selectedSuperCompany?.name ?? 'Selecionar Empresa'}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[216px]" align="start" alignOffset={-12}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Todas as Empresas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allCompanies?.map(company => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => handleSelectCompany(company.id)}
                  className={cn('cursor-pointer', selectedCompanyId === company.id && 'bg-accent text-accent-foreground')}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="truncate">{company.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Unit selector — para todos os usuários */}
      {!collapsed && effectiveCompanyId && (
        <div className="px-3 pt-2">
          {isSuperAdmin && <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 mb-1.5 px-1">Unidade</p>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <div className="flex items-center gap-2 overflow-hidden">
                  {selectedUnit ? <MapPin className="h-4 w-4 shrink-0" /> : <Building2 className="h-4 w-4 shrink-0" />}
                  <span className="font-medium truncate">
                    {selectedUnit ? selectedUnit.name : (companyName || 'Empresa Mãe')}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[216px]" align="start" alignOffset={-12}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Alternar Contexto</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(profile?.role === 'admin_company' || profile?.has_matriz_access || isSuperAdmin) && (
                <DropdownMenuItem
                  onClick={() => setSelectedUnitId(null)}
                  className={cn('cursor-pointer', !selectedUnitId && 'bg-accent text-accent-foreground')}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="truncate">
                    {isSuperAdmin ? (selectedSuperCompany?.name ?? 'Empresa') : (companyName || 'Empresa Mãe')} (Sede)
                  </span>
                </DropdownMenuItem>
              )}
              {units && units.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Unidades / Filiais</DropdownMenuLabel>
                  {units.map(unit => (
                    <DropdownMenuItem
                      key={unit.id}
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={cn('cursor-pointer', selectedUnitId === unit.id && 'bg-accent text-accent-foreground')}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      <span className="truncate">{unit.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Fallback: unit selector sem empresa selecionada (usuários normais sem company_id) */}
      {!collapsed && !isSuperAdmin && !effectiveCompanyId && (
        <div className="px-3 pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="font-medium truncate">{companyName || 'Empresa Mãe'}</span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[216px]" align="start" alignOffset={-12}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sem unidades disponíveis</DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-0.5 px-2">
        {items.filter(item => {
          if (item.superAdminOnly) return profile?.role === 'super_admin';
          if (item.globalOnly) return !selectedUnitId;
          return true;
        }).map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center",
          )}
        >
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-foreground">
                {initials(profile?.name)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile?.name ?? "—"}</div>
              <div className="flex items-center gap-1 truncate text-xs text-sidebar-foreground/60">
                <span className="shrink-0">
                  {profile?.role === "admin_company"
                    ? "Admin"
                    : profile?.role === "manager"
                      ? "Gerente"
                      : "Agente"}
                </span>
                {departmentName && (
                  <>
                    <span>•</span>
                    <span className="truncate">{departmentName}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => signOut()}
              className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={onToggle}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-1 rounded-md bg-sidebar-accent/40 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" /> Recolher
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
