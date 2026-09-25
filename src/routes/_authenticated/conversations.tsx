import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Filter, Search, Phone, CheckCircle2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ProviderIcon } from "@/components/common/provider-icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { cn } from "@/lib/utils";
import { useUnit } from "@/lib/unit-context";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger, 
  DropdownMenuSeparator, 
  DropdownMenuSub, 
  DropdownMenuSubContent, 
  DropdownMenuSubTrigger, 
  DropdownMenuPortal 
} from "@/components/ui/dropdown-menu";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { WavoipDialer } from "@/components/whatsapp/wavoip-dialer";

import { 
  ConvRow, 
  MessageRow, 
  Status, 
  TabType, 
  fetchConversationMessages 
} from "@/components/chat/conversation-types";
import { ConversationItem } from "@/components/chat/conversation-item";
import { ContactSidebar } from "@/components/chat/contact-sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { EmptyChat } from "@/components/chat/empty-chat";
import { useSlaSettings } from "@/lib/use-sla";
import { calculateConversationSla } from "@/lib/sla";

export type { ConvRow, MessageRow, Status, TabType };

export const Route = createFileRoute("/_authenticated/conversations")({
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      c: search.c as string | undefined,
      tab: search.tab as "waiting" | "active" | "resolved" | "groups" | undefined,
    };
  }
});

function ConversationsPage() {
  const { c: searchConvId, tab: searchTab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useState<TabType>(searchTab && searchTab !== "groups" ? searchTab : "waiting");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchConvId || null);

  const handleCloseChat = () => {
    setSelectedId(null);
    setLastSelectedConv(null);
    navigate({ search: (prev: any) => ({ ...prev, c: undefined }) });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const [showSidebar, setShowSidebar] = useState(false);
  const { selectedUnitId } = useUnit();
  const [instanceFilter, setInstanceFilter] = useState<string | null>(null);
  const [lastSelectedConv, setLastSelectedConv] = useState<ConvRow | null>(null);

  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [slaFilter, setSlaFilter] = useState<"all" | "breached" | "warning" | "ok">("all");
  const { slaSettings } = useSlaSettings();
  
  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances_filter", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let query = supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider, network, unit_id, units(id, name, color)")
        .eq("company_id", activeCompanyId);
      
      if (selectedUnitId && selectedUnitId !== "all") {
        query = query.eq("unit_id", selectedUnitId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_filter", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents_filter", activeCompanyId, selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, active, role, has_matriz_access, user_units(unit_id)")
        .eq("company_id", activeCompanyId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      let list = (data ?? []) as any[];
      if (selectedUnitId && selectedUnitId !== "all") {
        list = list.filter((a: any) =>
          a.role === "admin_company" ||
          a.role === "super_admin" ||
          (selectedUnitId === "matriz"
            ? a.has_matriz_access
            : a.user_units?.some((uu: any) => uu.unit_id === selectedUnitId))
        );
      }
      return list;
    },
    enabled: !!activeCompanyId,
  });

  const PAGE_SIZE = 20;

  const {
    data: conversationsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isConvFetching,
  } = useInfiniteQuery({
    queryKey: ["conversations", activeCompanyId, tab, selectedUnitId, profile?.id, profile?.role, profile?.department_id, debouncedSearch, instanceFilter, departmentFilter, agentFilter],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;

      const selectString = "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, current_session_id, ai_active, ai_agent_id, contact:contacts!inner(id,name,phone,email,avatar_url:profile_picture_url,tags,instagram_username,whatsapp_lid,instagram_id,company_id,is_blocked,source,source_details,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), ai_agent:ai_agents(name), unit:units(name,color,custom_variables), whatsapp_instance:whatsapp_instances(name), last_message:messages(sender_type, created_at, is_internal)";

      let query = supabase
        .from("conversations")
        .select(selectString)
        .order("last_message_at", { ascending: false })
        .order("created_at", { foreignTable: "messages", ascending: false })
        .limit(1, { foreignTable: "messages" })
        .range(from, to);

      if (activeCompanyId) {
        query = query.eq("contact.company_id", activeCompanyId);
      }
      query = query.not("contact.is_blocked", "is", true);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }
      
      if (instanceFilter && instanceFilter !== "all") {
        query = query.eq("whatsapp_instance_id", instanceFilter);
      }

      if (departmentFilter && departmentFilter !== "all") {
        query = query.eq("department_id", departmentFilter);
      }

      if (agentFilter && agentFilter !== "all") {
        if (agentFilter === "unassigned") {
          query = query.is("assigned_agent_id", null);
        } else {
          query = query.eq("assigned_agent_id", agentFilter);
        }
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`, { foreignTable: "contact" });
      }

      if (tab === "groups") {
        query = query.or("phone.like.120363%,phone.like.%-%", { foreignTable: "contact" });
      }

      // Server-side status filter for non-group tabs
      if (tab === "waiting") {
        query = query.eq("status", "waiting");
        if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
          if (profile?.department_id) {
            query = query.or(`assigned_agent_id.eq.${profile.id},and(assigned_agent_id.is.null,or(department_id.eq.${profile.department_id},department_id.is.null))`);
          } else {
            query = query.or(`assigned_agent_id.eq.${profile?.id},and(assigned_agent_id.is.null,department_id.is.null)`);
          }
        }
      } else if (tab === "active" || tab === "resolved") {
        query = query.eq("status", tab);
        if (profile?.role === "manager") {
          if (profile?.department_id) {
            query = query.or(`department_id.eq.${profile.department_id},assigned_agent_id.eq.${profile.id}`);
          } else {
            query = query.or(`assigned_agent_id.eq.${profile.id},department_id.is.null`);
          }
        } else if (profile?.role !== "admin_company" && profile?.role !== "super_admin") {
          if (tab === "active") {
            // Em andamento: atendente vê conversas atribuídas a ele OU sem atendente (ex: disparos/outbound)
            if (profile?.department_id) {
              query = query.or(`assigned_agent_id.eq.${profile.id},and(assigned_agent_id.is.null,or(department_id.eq.${profile.department_id},department_id.is.null))`);
            } else {
              query = query.or(`assigned_agent_id.eq.${profile?.id},assigned_agent_id.is.null`);
            }
          } else {
            query = query.eq("assigned_agent_id", profile?.id ?? "");
          }
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as unknown as ConvRow[];

      // Client-side: separate groups from regular convs
      if (tab === "groups") {
        rows = rows.filter(c =>
          c.contact?.phone && (c.contact.phone.startsWith("120363") || (c.contact.phone.includes("-") && c.contact.phone.length > 18))
        );
      } else {
        // Exclude groups from all other tabs
        rows = rows.filter(c =>
          !(c.contact?.phone && (c.contact.phone.startsWith("120363") || (c.contact.phone.includes("-") && c.contact.phone.length > 18)))
        );
      }

      // Deduplicate by contact (phone or id) + instance to ensure no duplicate cards appear
      const seen = new Set<string>();
      rows = rows.filter(c => {
        const contactIdentifier = c.contact?.phone || c.contact?.id || "no-contact";
        const key = `${contactIdentifier}__${c.whatsapp_instance_id ?? "no-instance"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { rows, rawCount: (data ?? []).length };
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rawCount === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !!profile,
  });

  const conversations = useMemo(
    () => conversationsData?.pages.flatMap(p => {
      const rows = Array.isArray(p) ? p : p?.rows;
      return (rows ?? []).filter(Boolean);
    }) ?? [],
    [conversationsData]
  );

  const handleTabChange = useCallback((newTab: TabType) => {
    setTab(newTab);
    navigate({ search: (prev: any) => ({ ...prev, tab: newTab }) });
  }, [navigate]);

  useEffect(() => {
    if (searchTab && searchTab !== tab && searchTab !== "groups") {
      setTab(searchTab as TabType);
    }
  }, [searchTab]);

  useEffect(() => {
    if (searchConvId && searchConvId !== selectedId) {
      setSelectedId(searchConvId);
      supabase
        .from("notifications" as any)
        .update({ is_read: true })
        .eq("link", `/conversations?id=${searchConvId}`)
        .eq("is_read", false)
        .then(() => {});
    }
  }, [searchConvId, selectedId]);

  // Consulta direta da conversa selecionada caso ela não esteja na primeira página ou aba atual da lista
  const { data: directSelectedConv, isLoading: isLoadingDirectConv } = useQuery({
    queryKey: ["direct-conversation", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      if (!selectedId) return null;
      const selectString = "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, current_session_id, ai_active, ai_agent_id, contact:contacts!inner(id,name,phone,email,avatar_url:profile_picture_url,tags,instagram_username,whatsapp_lid,instagram_id,company_id,is_blocked,source,source_details,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), ai_agent:ai_agents(name), unit:units(name,color,custom_variables), whatsapp_instance:whatsapp_instances(name), last_message:messages(sender_type, created_at, is_internal)";
      const { data, error } = await supabase
        .from("conversations")
        .select(selectString)
        .eq("id", selectedId)
        .order("created_at", { foreignTable: "messages", ascending: false })
        .limit(1, { foreignTable: "messages" })
        .maybeSingle();

      if (error || !data) return null;
      return data as unknown as ConvRow;
    },
    staleTime: 30 * 1000,
  });

  // Se a conversa aberta estiver em outra aba ou instância/departamento filtrado, sincroniza automaticamente ao abrir
  useEffect(() => {
    if (directSelectedConv && selectedId === directSelectedConv.id) {
      const isGroup = !!(directSelectedConv.contact?.phone && (directSelectedConv.contact.phone.startsWith("120363") || (directSelectedConv.contact.phone.includes("-") && directSelectedConv.contact.phone.length > 18)));
      const convTab = isGroup ? "groups" : (directSelectedConv.status as TabType);
      if (convTab && !searchTab) {
        setTab(convTab);
      }
      if (instanceFilter && instanceFilter !== "all" && directSelectedConv.whatsapp_instance_id !== instanceFilter) {
        setInstanceFilter("all");
      }
      if (departmentFilter && departmentFilter !== "all" && directSelectedConv.department_id !== departmentFilter) {
        setDepartmentFilter("all");
      }
      if (agentFilter && agentFilter !== "all") {
        if (agentFilter === "unassigned" && directSelectedConv.assigned_agent_id) {
          setAgentFilter("all");
        } else if (agentFilter !== directSelectedConv.assigned_agent_id) {
          setAgentFilter("all");
        }
      }
    }
  }, [directSelectedConv?.id, selectedId]);

  const { data: unreadCounts } = useQuery({
    queryKey: ["unread-counts", activeCompanyId, selectedUnitId, profile?.id, profile?.department_id, instanceFilter, debouncedSearch, departmentFilter, agentFilter],
    queryFn: async () => {
      let selectString = "id, status, unread_count, department_id, assigned_agent_id, whatsapp_instance_id, contact:contacts!inner(id, phone, name, company_id, is_blocked), unit_id";

      if (debouncedSearch) {
        selectString = selectString.replace("contact:contacts(", "contact:contacts!inner(");
      }

      let query = supabase
        .from("conversations")
        .select(selectString);

      if (activeCompanyId) {
        query = query.eq("contact.company_id", activeCompanyId);
      }
      query = query.not("contact.is_blocked", "is", true);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }

      if (instanceFilter && instanceFilter !== "all") {
        query = query.eq("whatsapp_instance_id", instanceFilter);
      }

      if (departmentFilter && departmentFilter !== "all") {
        query = query.eq("department_id", departmentFilter);
      }

      if (agentFilter && agentFilter !== "all") {
        if (agentFilter === "unassigned") {
          query = query.is("assigned_agent_id", null);
        } else {
          query = query.eq("assigned_agent_id", agentFilter);
        }
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`, { foreignTable: "contact" });
      }

      const { data, error } = await query.order("last_message_at", { ascending: false });
      if (error) throw error;
      
      const counts = { 
        waiting: { total: 0, unread: 0 }, 
        active: { total: 0, unread: 0 }, 
        resolved: { total: 0, unread: 0 }, 
        groups: { total: 0, unread: 0 } 
      };

      const seenWaiting = new Set<string>();
      const seenActive = new Set<string>();
      const seenResolved = new Set<string>();
      
      data.forEach(c => {
        if (instanceFilter && instanceFilter !== "all" && c.whatsapp_instance_id !== instanceFilter) {
          return;
        }

        const isGroup = c.contact?.phone && (c.contact.phone.startsWith("120363") || (c.contact.phone.includes("-") && c.contact.phone.length > 18));
        if (isGroup) {
          counts.groups.total++;
          counts.groups.unread += c.unread_count || 0;
        } else {
          const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";
          const isManager = profile?.role === "manager";
          const isMyDept = c.department_id === profile?.department_id;
          const isGeneral = !c.department_id;
          const isAssignedToMe = c.assigned_agent_id === profile?.id;
          const contactIdentifier = c.contact?.phone || (c.contact as any)?.id || "no-contact";
          const key = `${contactIdentifier}__${c.whatsapp_instance_id ?? "no-instance"}`;

          if (c.status === "waiting") {
            const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
            if (canSeeWaiting) {
              if (isAdmin || isManager || !c.assigned_agent_id || c.assigned_agent_id === profile?.id) {
                if (!seenWaiting.has(key)) {
                  seenWaiting.add(key);
                  counts.waiting.total++;
                  counts.waiting.unread += c.unread_count || 0;
                }
              }
            }
          }
          if (c.status === "active") {
            const canSeeActive = isAdmin || (isManager && isMyDept) || isAssignedToMe || !c.assigned_agent_id;
            if (canSeeActive) {
              if (!seenActive.has(key)) {
                seenActive.add(key);
                counts.active.total++;
                counts.active.unread += c.unread_count || 0;
              }
            }
          }
          if (c.status === "resolved") {
            const canSeeResolved = isAdmin || (isManager && isMyDept) || isAssignedToMe;
            if (canSeeResolved) {
              if (!seenResolved.has(key)) {
                seenResolved.add(key);
                counts.resolved.total++;
                counts.resolved.unread += c.unread_count || 0;
              }
            }
          }
        }
      });
      
      return counts;
    }
  });

  const updateConversationInCache = useCallback((
    convId: string, 
    updates: Partial<ConvRow>, 
    options?: { moveToTop?: boolean; status?: TabType }
  ) => {
    const moveToTop = options?.moveToTop ?? false;
    const targetStatus = options?.status;

    const queries = qc.getQueriesData({ queryKey: ["conversations"] });

    queries.forEach(([queryKey, oldData]: any) => {
      if (!oldData || !oldData.pages) return;
      
      const queryTab = queryKey[2] as TabType;
      let targetConv: ConvRow | null = null;
      let wasFound = false;

      const updatedPages = oldData.pages.map((page: any) => {
        if (!page || !page.rows) return page;

        if (moveToTop) {
          const filteredRows = page.rows.filter((c: ConvRow) => {
            if (c.id === convId) {
              targetConv = { ...c, ...updates } as ConvRow;
              wasFound = true;
              return false;
            }
            return true;
          });
          return { ...page, rows: filteredRows };
        } else {
          const updatedRows = page.rows.map((c: ConvRow) => {
            if (c.id === convId) {
              targetConv = { ...c, ...updates } as ConvRow;
              wasFound = true;
              return targetConv;
            }
            return c;
          });
          return { ...page, rows: updatedRows };
        }
      });

      let nextData = oldData;

      if (targetConv) {
        const isGroup = !!((targetConv as ConvRow).contact?.phone && ((targetConv as ConvRow).contact.phone!.startsWith("120363") || ((targetConv as ConvRow).contact.phone!.includes("-") && (targetConv as ConvRow).contact.phone!.length > 18)));
        const matchesTab = isGroup ? (queryTab === "groups") : ((targetConv as ConvRow).status === queryTab);
        
        if (matchesTab) {
          if (moveToTop) {
            if (updatedPages.length > 0 && updatedPages[0]) {
              const firstPage = updatedPages[0];
              const updatedFirstPage = {
                ...firstPage,
                rows: [targetConv, ...(firstPage.rows || [])]
              };
              nextData = {
                ...oldData,
                pages: [updatedFirstPage, ...updatedPages.slice(1)]
              };
            } else {
              nextData = {
                ...oldData,
                pages: [{ rows: [targetConv], rawCount: 1 }]
              };
            }
          } else {
            nextData = { ...oldData, pages: updatedPages };
          }
        } else {
          nextData = { ...oldData, pages: updatedPages };
        }
      } else if (targetStatus === queryTab && !wasFound) {
        setTimeout(() => qc.invalidateQueries({ queryKey: queryKey }), 0);
      }
      
      qc.setQueryData(queryKey, nextData);
    });
  }, [qc]);

  const updateUnreadCountsInCache = useCallback((tabKey: "waiting" | "active" | "resolved" | "groups", totalDiff: number, unreadDiff: number) => {
    qc.setQueriesData({ queryKey: ["unread-counts"] }, (oldData: any) => {
      if (!oldData) return oldData;
      const newData = { ...oldData };
      if (newData[tabKey]) {
        newData[tabKey] = {
          total: Math.max(0, newData[tabKey].total + totalDiff),
          unread: Math.max(0, newData[tabKey].unread + unreadDiff)
        };
      }
      return newData;
    });
  }, [qc]);

  const handleConversationStatusChangeInCache = useCallback((conv: ConvRow, oldStatus: "waiting" | "active" | "resolved", newStatus: "waiting" | "active" | "resolved") => {
    const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith("120363") || (conv.contact.phone.includes("-") && conv.contact.phone.length > 18)));
    if (isGroup) return;

    updateUnreadCountsInCache(oldStatus, -1, -(conv.unread_count || 0));
    updateUnreadCountsInCache(newStatus, 1, conv.unread_count || 0);
  }, [updateUnreadCountsInCache]);

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const [, setRealtimeConnected] = useState<boolean>(true);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    let ch: any = null;

    const connectRealtime = () => {
      if (!isMounted) return;
      if (ch) {
        try { supabase.removeChannel(ch); } catch (_e) { /* ignore */ }
        ch = null;
      }

      const channelId = `conversations-rt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      ch = supabase
        .channel(channelId)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
          if (payload.eventType === "UPDATE") {
            const updatedConv = payload.new as ConvRow;
            const convId = updatedConv.id;

            let oldConv: ConvRow | null = null;
            qc.getQueriesData({ queryKey: ["conversations"] }).forEach(([key, oldData]: any) => {
              if (oldData?.pages) {
                for (const page of oldData.pages) {
                  const found = page.rows?.find((c: any) => c.id === convId);
                  if (found) {
                    oldConv = found;
                    break;
                  }
                }
              }
            });

            if (oldConv) {
              const isGroup = !!((oldConv as ConvRow).contact?.phone && ((oldConv as ConvRow).contact.phone!.startsWith("120363") || ((oldConv as ConvRow).contact.phone!.includes("-") && (oldConv as ConvRow).contact.phone!.length > 18)));
              const targetStatus = isGroup ? "groups" : (updatedConv.status || "active");
              updateConversationInCache(convId, updatedConv, { moveToTop: false, status: targetStatus });

              if (
                updatedConv.assigned_agent_id !== (oldConv as ConvRow).assigned_agent_id ||
                updatedConv.department_id !== (oldConv as ConvRow).department_id ||
                updatedConv.whatsapp_instance_id !== (oldConv as ConvRow).whatsapp_instance_id
              ) {
                supabase
                  .from("conversations")
                  .select("assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), department:departments(name), whatsapp_instance:whatsapp_instances(name)")
                  .eq("id", convId)
                  .single()
                  .then(({ data, error }) => {
                    if (data && !error && isMounted) {
                      updateConversationInCache(convId, data as any);
                    }
                  });
              }

              if ((oldConv as ConvRow).status !== updatedConv.status) {
                handleConversationStatusChangeInCache(oldConv as ConvRow, (oldConv as ConvRow).status, updatedConv.status);
              }
              
              const unreadDiff = (updatedConv.unread_count || 0) - ((oldConv as ConvRow).unread_count || 0);
              if (unreadDiff !== 0) {
                const tabKey = isGroup ? "groups" : (updatedConv.status || "active");
                updateUnreadCountsInCache(tabKey, 0, unreadDiff);
              }
            } else {
              qc.invalidateQueries({ queryKey: ["conversations"] });
              qc.invalidateQueries({ queryKey: ["unread-counts"] });
            }
          } 
          
          else if (payload.eventType === "INSERT") {
            qc.invalidateQueries({ queryKey: ["conversations"] });
            qc.invalidateQueries({ queryKey: ["unread-counts"] });
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as any;
            const convId = newMsg.conversation_id;

            qc.setQueryData(["messages", convId], (old: any) => {
              if (!old) return old;
              if (old.some((m: any) => m.id === newMsg.id)) return old;

              const optIndex = old.findIndex((m: any) => m.isOptimistic && m.sender_type === newMsg.sender_type && m.content === newMsg.content);
              if (optIndex !== -1) {
                const copy = [...old];
                copy[optIndex] = newMsg;
                return copy;
              }

              return [...old, newMsg];
            });

            if (selectedIdRef.current === convId) {
              qc.invalidateQueries({ queryKey: ["messages", convId] });
            }

            let previewText = newMsg.content || "";
            if (newMsg.media_type === "image") previewText = "📷 Foto";
            else if (newMsg.media_type === "video") previewText = "🎥 Vídeo";
            else if (newMsg.media_type === "audio") previewText = "🎵 Áudio";
            else if (newMsg.media_type === "document") previewText = "📄 Documento";

            const isFromContact = newMsg.sender_type === "contact";
            const isNotOpened = selectedIdRef.current !== convId;
            const unreadIncrement = (isFromContact && isNotOpened) ? 1 : 0;

            let existingConv: ConvRow | null = null;
            qc.getQueriesData({ queryKey: ["conversations"] }).forEach(([key, oldData]: any) => {
              if (oldData?.pages) {
                for (const page of oldData.pages) {
                  const found = page.rows?.find((c: any) => c.id === convId);
                  if (found) {
                    existingConv = found;
                    break;
                  }
                }
              }
            });

            if (existingConv) {
              const nextUnread = ((existingConv as ConvRow).unread_count || 0) + unreadIncrement;
              const isGroup = !!((existingConv as ConvRow).contact?.phone && ((existingConv as ConvRow).contact.phone!.startsWith("120363") || ((existingConv as ConvRow).contact.phone!.includes("-") && (existingConv as ConvRow).contact.phone!.length > 18)));
              const becameActive = !isFromContact && (existingConv as ConvRow).status === "waiting";
              const targetStatus = isGroup ? "groups" : (becameActive ? "active" : ((existingConv as ConvRow).status || "active"));

              updateConversationInCache(convId, {
                status: targetStatus === "groups" ? (existingConv as ConvRow).status : targetStatus,
                last_message_preview: previewText,
                last_message_at: newMsg.created_at,
                unread_count: nextUnread,
                last_message: [{
                  sender_type: newMsg.sender_type,
                  created_at: newMsg.created_at,
                  is_internal: newMsg.is_internal || false
                }]
              }, { moveToTop: true, status: targetStatus });

              if (becameActive) {
                handleConversationStatusChangeInCache(existingConv as ConvRow, "waiting", "active");
              }

              if (unreadIncrement > 0) {
                const tabKey = isGroup ? "groups" : ((existingConv as ConvRow).status || "active");
                updateUnreadCountsInCache(tabKey, 0, unreadIncrement);
              }
            } else {
              qc.invalidateQueries({ queryKey: ["conversations"] });
              qc.invalidateQueries({ queryKey: ["unread-counts"] });
            }
          } 
          
          else if (payload.eventType === "UPDATE") {
            const updatedMsg = payload.new as any;
            const convId = updatedMsg.conversation_id;

            qc.setQueryData(["messages", convId], (old: any) => {
              if (!old) return old;
              return old.map((m: any) => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m);
            });

            if (selectedIdRef.current === convId) {
              qc.invalidateQueries({ queryKey: ["messages", convId] });
            }
          } 
          
          else if (payload.eventType === "DELETE") {
            const oldMsg = payload.old as any;
            const convId = oldMsg.conversation_id;
            
            qc.setQueryData(["messages", convId], (old: any) => {
              if (!old) return old;
              return old.filter((m: any) => m.id !== oldMsg.id);
            });
          }
        })
        .subscribe((status) => {
          if (!isMounted) return;
          
          if (status === "SUBSCRIBED") {
            setRealtimeConnected(true);
            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeConnected(false);
            if (!reconnectTimerRef.current) {
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (isMounted) {
                  connectRealtime();
                }
              }, 4000);
            }
          }
        });
    };

    connectRealtime();

    let lastHidden = 0;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHidden = Date.now();
      } else if (document.visibilityState === "visible") {
        const timeAway = Date.now() - lastHidden;
        if (timeAway > 20000) {
          if (!ch || ch.state !== "joined") {
            connectRealtime();
          }
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["unread-counts"] });
          if (selectedIdRef.current) {
            qc.invalidateQueries({ queryKey: ["messages", selectedIdRef.current] });
          }
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (ch) {
        try { supabase.removeChannel(ch); } catch (_e) { /* ignore */ }
      }
    };
  }, [qc, activeCompanyId, updateConversationInCache, updateUnreadCountsInCache, handleConversationStatusChangeInCache]);

  const filtered = useMemo(() => {
    let list = conversations.filter(c => !!c?.id);
    if (slaFilter !== "all") {
      list = list.filter(c => {
        const sla = calculateConversationSla(c, slaSettings);
        return sla.status === slaFilter;
      });
    }
    return list;
  }, [conversations, slaFilter, slaSettings]);

  useEffect(() => {
    const current = filtered.find((c) => c.id === selectedId) || (directSelectedConv?.id === selectedId ? directSelectedConv : null);
    if (current) setLastSelectedConv(current);
  }, [filtered, selectedId, directSelectedConv]);

  const selected = useMemo(() => {
    const current = filtered.find((c) => c.id === selectedId);
    if (current) return current;
    if (directSelectedConv && directSelectedConv.id === selectedId) {
      return directSelectedConv;
    }
    if (selectedId && lastSelectedConv?.id === selectedId) {
      return lastSelectedConv;
    }
    return null;
  }, [filtered, directSelectedConv, selectedId, lastSelectedConv]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <aside className={cn(
        "flex w-full md:w-[360px] shrink-0 flex-col border-r border-border bg-card",
        selectedId ? "hidden md:flex" : "flex"
      )}>
        {/* Loading bar */}
        <div className="relative h-0.5 w-full overflow-hidden bg-transparent">
          {isConvFetching && (
            <div
              className="absolute inset-0 bg-primary"
              style={{
                animation: "conv-loading-bar 1.2s ease-in-out infinite",
              }}
            />
          )}
        </div>
        <style>{`
          @keyframes conv-loading-bar {
            0%   { transform: translateX(-100%); }
            50%  { transform: translateX(0%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
        <div className="border-b border-border p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou número"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant={(instanceFilter && instanceFilter !== "all") || (departmentFilter && departmentFilter !== "all") || (agentFilter && agentFilter !== "all") || (slaFilter !== "all") ? "default" : "outline"} className="h-9 w-9 shrink-0">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {((instanceFilter && instanceFilter !== "all") || (departmentFilter && departmentFilter !== "all") || (agentFilter && agentFilter !== "all") || (slaFilter !== "all")) && (
                  <>
                    <DropdownMenuItem 
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer font-medium"
                      onClick={() => {
                        setInstanceFilter("all");
                        setDepartmentFilter("all");
                        setAgentFilter("all");
                        setSlaFilter("all");
                      }}
                    >
                      Limpar Filtros
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Status do SLA
                    {slaFilter !== "all" && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuItem onClick={() => setSlaFilter("all")} className="cursor-pointer">
                        Todos os status
                        {slaFilter === "all" && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSlaFilter("breached")} className="cursor-pointer text-destructive font-medium">
                        Estourados (Crítico)
                        {slaFilter === "breached" && <CheckCircle2 className="ml-auto h-4 w-4 text-destructive" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSlaFilter("warning")} className="cursor-pointer text-amber-600 dark:text-amber-400 font-medium">
                        Atenção (Alerta)
                        {slaFilter === "warning" && <CheckCircle2 className="ml-auto h-4 w-4 text-amber-600" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSlaFilter("ok")} className="cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium">
                        No Prazo
                        {slaFilter === "ok" && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Instâncias
                    {instanceFilter && instanceFilter !== "all" && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64">
                      <ScrollArea className="h-[300px] w-full p-1">
                        <DropdownMenuItem onClick={() => setInstanceFilter("all")} className="cursor-pointer">
                          Todas as instâncias
                          {(!instanceFilter || instanceFilter === "all") && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        {instances?.map((inst: any) => {
                          const unitName = inst.units?.name || (!inst.unit_id ? "Sede" : "");
                          return (
                            <DropdownMenuItem key={inst.id} onClick={() => setInstanceFilter(inst.id)} className="flex items-center justify-between gap-2 cursor-pointer">
                              <div className="flex items-center gap-2 truncate min-w-0">
                                <ProviderIcon provider={inst.provider} network={inst.network} className="h-4 w-4 shrink-0" />
                                <span className="truncate">{inst.name || inst.instance_name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {unitName && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal text-muted-foreground bg-muted/30">
                                    {unitName}
                                  </Badge>
                                )}
                                {instanceFilter === inst.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </ScrollArea>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Departamentos
                    {departmentFilter && departmentFilter !== "all" && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64">
                      <ScrollArea className="h-[300px] w-full p-1">
                        <DropdownMenuItem onClick={() => setDepartmentFilter("all")} className="cursor-pointer">
                          Todos os departamentos
                          {(!departmentFilter || departmentFilter === "all") && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        {departments?.map(dept => (
                          <DropdownMenuItem key={dept.id} onClick={() => setDepartmentFilter(dept.id)} className="cursor-pointer">
                            <span className="truncate">{dept.name}</span>
                            {departmentFilter === dept.id && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </ScrollArea>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Atendentes
                    {agentFilter && agentFilter !== "all" && <CheckCircle2 className="ml-auto h-3 w-3 text-primary" />}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64">
                      <ScrollArea className="h-[300px] w-full p-1">
                        <DropdownMenuItem onClick={() => setAgentFilter("all")} className="cursor-pointer">
                          Todos os atendentes
                          {(!agentFilter || agentFilter === "all") && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAgentFilter("unassigned")} className="cursor-pointer">
                          Sem Atendente (Fila Geral)
                          {agentFilter === "unassigned" && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        {agents?.map(agent => (
                          <DropdownMenuItem key={agent.id} onClick={() => setAgentFilter(agent.id)} className="cursor-pointer flex items-center justify-between gap-2">
                            <span className="truncate flex-1">{agent.name}</span>
                            {agentFilter === agent.id && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </ScrollArea>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <StartConversationDialog onCreated={(id) => {
              setTab("active");
              setSelectedId(id);
              navigate({ search: (prev: any) => ({ ...prev, c: id, tab: "active" }) });
            }} />
            <Button 
              size="icon" 
              variant="outline" 
              className="h-9 w-9 shrink-0" 
              title="Discar / Ligar para novo número"
              onClick={() => setDialerOpen(true)}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <WavoipDialer open={dialerOpen} onOpenChange={setDialerOpen} />
          </div>
          <Tabs value={tab} onValueChange={(v) => handleTabChange(v as TabType)} className="mt-3">
            <TabsList className="grid w-full grid-cols-3 h-auto py-1">
              <TabsTrigger value="waiting" className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5">
                <span>Aguardando</span>
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                  {unreadCounts?.waiting?.total || 0}
                </span>
                {unreadCounts && unreadCounts.waiting?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.waiting.unread > 99 ? "99+" : unreadCounts.waiting.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5">
                <span>Andamento</span>
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                  {unreadCounts?.active?.total || 0}
                </span>
                {unreadCounts && unreadCounts.active?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.active.unread > 99 ? "99+" : unreadCounts.active.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="group px-1 py-1.5 text-xs relative flex items-center justify-center gap-1.5">
                <span>Resolvido</span>
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary transition-colors">
                  {unreadCounts?.resolved?.total || 0}
                </span>
                {unreadCounts && unreadCounts.resolved?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.resolved.unread > 99 ? "99+" : unreadCounts.resolved.unread}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              selected={selectedId === c.id}
              onClick={() => {
                setSelectedId(c.id);
                setLastSelectedConv(c);
                navigate({ search: (prev: any) => ({ ...prev, c: c.id, tab }) });
              }}
              onPrefetch={() => {
                qc.prefetchQuery({
                  queryKey: ["messages", c.id],
                  queryFn: () => fetchConversationMessages(c.id),
                  staleTime: 1000 * 60 * 5,
                });
              }}
              currentUserId={profile?.id}
              showUnitInfo={!selectedUnitId}
              slaSettings={slaSettings}
            />
          ))}
          {!filtered.length && !isConvFetching && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          )}
          {isFetchingNextPage && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-3 border-b border-border animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3 w-32 rounded bg-muted" />
                      <div className="h-3 w-16 rounded bg-muted" />
                    </div>
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="flex gap-1">
                      <div className="h-4 w-14 rounded-full bg-muted" />
                      <div className="h-4 w-14 rounded-full bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {hasNextPage && !isFetchingNextPage && (
            <div className="flex justify-center p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => fetchNextPage()}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className={cn(
        "flex min-w-0 flex-1 flex-col bg-background h-full min-h-0 overflow-hidden",
        !selectedId ? "hidden md:flex" : "flex"
      )}>
        {selected ? (
          <ChatPanel 
            key={selected.id}
            conv={selected} 
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onAssigned={() => setTab("active")}
            onBack={handleCloseChat}
            onClose={handleCloseChat}
          />
        ) : selectedId && isLoadingDirectConv ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Carregando conversa...</p>
          </div>
        ) : (
          <EmptyChat />
        )}
      </section>

      {/* Contact Info Sidebar - Desktop */}
      {selected && showSidebar && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card md:flex xl:w-[380px] 2xl:w-[420px] overflow-hidden">
          <ContactSidebar conv={selected} onClose={() => setShowSidebar(false)} />
        </aside>
      )}

      {/* Contact Info Sidebar - Mobile */}
      {selected && !isDesktop && (
        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
          <SheetContent className="w-full sm:w-[400px] p-0 flex flex-col md:hidden">
            <SheetTitle className="sr-only">Informações do Contato</SheetTitle>
            <SheetDescription className="sr-only">Detalhes e histórico do contato selecionado</SheetDescription>
            <ContactSidebar conv={selected} onClose={() => setShowSidebar(false)} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
