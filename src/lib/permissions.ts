import type { Profile } from "./auth-context";

export interface MenuItemPermission {
  key: string;
  label: string;
  description: string;
}

export const ALL_MENU_PERMISSIONS: MenuItemPermission[] = [
  { key: "dashboard", label: "Dashboard", description: "Métricas gerais e visão panorâmica da empresa" },
  { key: "conversations", label: "Atendimentos", description: "Inbox de conversas WhatsApp e Instagram" },
  { key: "calls", label: "Ligações", description: "Softphone e histórico de chamadas de voz" },
  { key: "contacts", label: "Contatos", description: "Gestão da base de contatos de clientes" },
  { key: "pipeline", label: "Funil de Vendas", description: "Kanban do CRM e gestão de oportunidades" },
  { key: "tasks", label: "Tarefas", description: "Lista de tarefas e acompanhamento de equipe" },
  { key: "campaigns", label: "Campanhas", description: "Disparos em massa e campanhas ativas" },
  { key: "reports", label: "Relatórios", description: "Relatórios de desempenho e SLA de atendimento" },
  { key: "units", label: "Gestão de Unidades", description: "Gerenciamento das filiais/unidades da empresa" },
  { key: "settings", label: "Configurações", description: "Configurações gerais, conexões e equipe" },
];

export const DEFAULT_ROLE_MENUS: Record<string, string[]> = {
  super_admin: ALL_MENU_PERMISSIONS.map(m => m.key).concat(["companies"]),
  admin_company: ALL_MENU_PERMISSIONS.map(m => m.key),
  manager: ["dashboard", "conversations", "calls", "contacts", "pipeline", "tasks", "campaigns", "reports", "settings"],
  agent: ["conversations", "calls", "contacts", "tasks"],
};

/**
 * Retorna a lista efetiva de menus que um perfil/usuário pode visualizar.
 * Combina: Permissões do Cargo (Company Role) + Permissões Extras do Perfil (allowed_menus).
 */
export function getUserEffectiveMenus(profile: Profile | null): string[] {
  if (!profile) return [];
  if (profile.role === "super_admin") {
    return ALL_MENU_PERMISSIONS.map(m => m.key).concat(["companies"]);
  }

  // 1. Permissões do cargo (se possuir um cargo customizado com allowed_menus definido)
  let roleMenus: string[] = [];
  if (profile.custom_role && Array.isArray(profile.custom_role.allowed_menus)) {
    roleMenus = profile.custom_role.allowed_menus;
  } else {
    // Fallback para as permissões padrão do cargo nativo (role)
    roleMenus = DEFAULT_ROLE_MENUS[profile.role] || DEFAULT_ROLE_MENUS.agent;
  }

  // 2. Adiciona permissões extras/customizadas do perfil individual
  const userExtraMenus: string[] = Array.isArray(profile.allowed_menus) ? profile.allowed_menus : [];

  // União das permissões sem duplicatas
  return Array.from(new Set([...roleMenus, ...userExtraMenus]));
}

/**
 * Verifica se um usuário pode visualizar determinado menu
 */
export function canAccessMenu(menuKey: string, profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.role === "super_admin") return true;
  if (menuKey === "companies") return profile.role === "super_admin";

  const allowed = getUserEffectiveMenus(profile);
  return allowed.includes(menuKey);
}
