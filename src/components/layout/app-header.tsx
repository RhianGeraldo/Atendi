import { useEffect } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { Bell, Menu, CheckSquare, Clock, Info, MessageSquare } from "lucide-react";
import { ChannelIcon } from "@/components/common/channel-icon";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/conversations": "Atendimentos",
  "/calls": "Histórico de Ligações",
  "/contacts": "Contatos",
  "/pipeline": "Funil de Vendas",
  "/tasks": "Tarefas",
  "/campaigns": "Campanhas",
  "/reports": "Relatórios",
  "/settings": "Configurações",
};

export function AppHeader({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] ?? "Omni";

  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();

  const { data: tasks } = useQuery({
    queryKey: ["pending-tasks-notifications", activeCompanyId, profile?.id],
    enabled: !!profile?.id && !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select(`*`)
        .eq("status", "pending")
        .eq("company_id", activeCompanyId)
        .order("due_date", { ascending: true })
        .limit(5);

      if (profile?.role !== "admin_company" && profile?.role !== "manager") {
        query = query.eq("assigned_to", profile!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: systemNotifications, refetch: refetchNotifications } = useQuery({
    queryKey: ["system-notifications", activeCompanyId, profile?.id],
    enabled: !!profile?.id && !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select(`*`)
        .eq("user_id", profile!.id)
        .eq("company_id", activeCompanyId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
         console.warn("Notifications table might not exist yet", error);
         return [];
      }
      return data || [];
    },
  });

  // Escutar notificações em tempo real
  useEffect(() => {
    if (!profile?.id || !activeCompanyId) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          refetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, activeCompanyId, refetchNotifications]);

  const markAsRead = async (id: string, link: string | null) => {
    await supabase.from("notifications" as any).update({ is_read: true }).eq("id", id);
    refetchNotifications();
    // Router Link is used in the UI, but we can also use window.location if it's external, for now let the Link handle navigation
  };

  const pendingTasksCount = tasks?.length || 0;
  const sysNotificationsCount = systemNotifications?.length || 0;
  const totalNotifications = pendingTasksCount + sysNotificationsCount;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-3">
        {onMobileMenuToggle && (
          <button 
            onClick={onMobileMenuToggle}
            className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground outline-none">
              <Bell className="h-4 w-4" />
              {totalNotifications > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-[300px]">
              {totalNotifications === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhuma notificação no momento.
                </div>
              ) : (
                <div className="flex flex-col gap-1 p-1">
                  {systemNotifications?.map((notif: any) => {
                    const isTransfer = notif.type.startsWith('transfer');
                    const channel = isTransfer ? notif.type.split('_')[1] || 'whatsapp' : null;
                    
                    return (
                      <DropdownMenuItem key={`notif-${notif.id}`} asChild className="cursor-pointer">
                        <Link to={notif.link || "#"} onClick={() => markAsRead(notif.id, notif.link)} className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-2 font-medium w-full">
                            {isTransfer ? <ChannelIcon channel={channel as any} className="h-5 w-5 shrink-0" /> : <Info className="h-5 w-5 text-primary shrink-0" />}
                            <span className="truncate">{notif.title}</span>
                          </div>
                          <div className="text-xs text-muted-foreground pl-6 line-clamp-2">
                            {notif.message}
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  
                  {tasks?.map((task: any) => {
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                    return (
                      <DropdownMenuItem key={`task-${task.id}`} asChild className="cursor-pointer">
                        <Link to="/tasks" className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-2 font-medium w-full">
                            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                            <span className="truncate">{task.title}</span>
                          </div>
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground pl-6">
                              <Clock className={`h-3 w-3 ${isOverdue ? 'text-destructive' : ''}`} />
                              <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                                {format(new Date(task.due_date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            {totalNotifications > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer justify-center text-primary font-medium">
                  <Link to="/tasks">Ver todas as tarefas</Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
