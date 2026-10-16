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
  { key: "todoo", label: "Meu Todoo", description: "CRM de execução comercial diária, listas quentes e metas" },
  { key: "campaigns", label: "Campanhas", description: "Disparos em massa e campanhas ativas" },
  { key: "reports", label: "Relatórios", description: "Relatórios de desempenho e SLA de atendimento" },
  { key: "training", label: "Treinamento & IA", description: "Simulador de vendas às cegas e mineração de objeções com Sales Coach" },
  { key: "units", label: "Gestão de Unidades", description: "Gerenciamento das filiais/unidades da empresa" },
  { key: "settings", label: "Configurações", description: "Configurações gerais, conexões e equipe" },
];

export const DEFAULT_ROLE_MENUS: Record<string, string[]> = {
  super_admin: ALL_MENU_PERMISSIONS.map(m => m.key).concat(["companies"]),
  admin_company: ALL_MENU_PERMISSIONS.map(m => m.key),
  manager: ["dashboard", "conversations", "calls", "contacts", "pipeline", "tasks", "todoo", "campaigns", "reports", "training", "settings"],
  agent: ["conversations", "calls", "contacts", "tasks", "todoo", "training"],
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

/**
 * Abas do Meu Todoo. Ficam na mesma lista de menus do cargo/perfil, com o prefixo "todoo:".
 * Só valem para quem tem o menu "todoo".
 */
export const TODOO_TAB_PERMISSIONS: MenuItemPermission[] = [
  { key: "todoo:my_day", label: "Meu Dia", description: "Tarefas comerciais do dia da consultora" },
  { key: "todoo:queue", label: "Quadro Comercial", description: "Cadência de prospecção dos contatos" },
  { key: "todoo:team", label: "Painel da Equipe", description: "Andamento do dia de cada pessoa" },
  { key: "todoo:referrals", label: "Cadastros & Metas", description: "Lista de cadastros e metas da equipe" },
  { key: "todoo:campaigns", label: "Ações Comerciais", description: "Criar e editar ações comerciais" },
  { key: "todoo:gincana", label: "Gincana & Ranking", description: "Pontuação e ranking da equipe" },
  { key: "todoo:metrics", label: "Indicadores", description: "Funil da cadência e indicadores" },
];

export type TodooTab = "my_day" | "queue" | "team" | "referrals" | "campaigns" | "gincana" | "metrics";

/** Abas padrão por nível, para cargos que ainda não escolheram as abas do Todoo. */
export const DEFAULT_TODOO_TABS: Record<string, string[]> = {
  super_admin: TODOO_TAB_PERMISSIONS.map((t) => t.key),
  admin_company: TODOO_TAB_PERMISSIONS.map((t) => t.key),
  manager: TODOO_TAB_PERMISSIONS.map((t) => t.key),
  agent: ["todoo:my_day", "todoo:queue"],
};

const isTodooTabKey = (key: string) => key.startsWith("todoo:");

/** Abas do Meu Todoo que o usuário pode ver (vazio se não tem o menu). */
export function getTodooTabs(profile: Profile | null): TodooTab[] {
  if (!profile || !canAccessMenu("todoo", profile)) return [];
  if (profile.role === "super_admin") return TODOO_TAB_PERMISSIONS.map((t) => t.key.slice(6) as TodooTab);

  // Abas do cargo; se o cargo ainda não escolheu nenhuma, as padrão do nível
  const roleMenus =
    profile.custom_role && Array.isArray(profile.custom_role.allowed_menus)
      ? profile.custom_role.allowed_menus
      : [];
  let tabs = roleMenus.filter(isTodooTabKey);
  if (tabs.length === 0) tabs = DEFAULT_TODOO_TABS[profile.role] || DEFAULT_TODOO_TABS.agent;

  // + abas extras do perfil individual
  const extras = (Array.isArray(profile.allowed_menus) ? profile.allowed_menus : []).filter(isTodooTabKey);
  const allowed = new Set([...tabs, ...extras]);
  return TODOO_TAB_PERMISSIONS.filter((t) => allowed.has(t.key)).map((t) => t.key.slice(6) as TodooTab);
}

export function canAccessTodooTab(tab: TodooTab, profile: Profile | null) {
  return getTodooTabs(profile).includes(tab);
}

/** Quantos menus principais (sem as abas do Todoo) há na lista. */
export function countMainMenus(menus: string[] | null | undefined) {
  return (menus || []).filter((m) => ALL_MENU_PERMISSIONS.some((p) => p.key === m)).length;
}
