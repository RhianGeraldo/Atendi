import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useInfiniteQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef, useMemo, Fragment } from "react";
import { Filter, Send, Paperclip, Smile, MoreVertical, Search, MessageCircle, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Mail, Tag, MessageSquarePlus, Loader2, Mic, Square, X, Image as ImageIcon, SmilePlus, Plus, PanelRight, Users, User, RefreshCw, Undo2, CheckCircle2, CornerUpLeft, Pencil, Trash2, FileText, Sparkles, Folder, FolderOpen, Video, Headphones, Bot, MapPin, List, Hash, Smartphone, LayoutTemplate, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendMessageAction, sendProactiveMessageAction, reactToMessageAction, fetchContactInfoAction, toggleContactLabelAction, createLabelAction, assignConversationAction, transferConversationAction, updateContactFromWhatsappAction, editMessageAction, deleteMessageAction, transcribeAudioAction, fixMessageTextAction, salesCoachAction, salesCoachSuggestAction } from "@/lib/api/chat.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ProviderIcon } from "@/components/common/provider-icon";

let ffmpegInstance: FFmpeg | null = null;
const getFFmpeg = async () => {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm'
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
};
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/common/channel-icon";
import { StatusBadge } from "@/components/common/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { cn } from "@/lib/utils";
import { formatRelative, initials, formatPhone, formatMessageTime } from "@/lib/format";
import { useUnit } from "@/lib/unit-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import EmojiPicker from "emoji-picker-react";
import TextareaAutosize from "react-textarea-autosize";
import { TransferDialog } from "@/components/chat/transfer-dialog";
import { LinkPreview } from "@/components/chat/link-preview";
import { ContactDetailsTabs, ContactEditDialog } from "@/components/contacts/contact-details-sheet";
import { ContactBlockDialog } from "@/components/contacts/contact-block-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { WavoipCallOverlay } from "@/components/whatsapp/wavoip-call-overlay";
import { WavoipDialer } from "@/components/whatsapp/wavoip-dialer";
import { useWavoip } from "@/hooks/use-wavoip";
import { WhatsappTemplateSender } from "@/components/whatsapp/whatsapp-template-sender";
import { resolveConversationAction } from "@/lib/api/chat.functions";

export const Route = createFileRoute("/_authenticated/conversations")({
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      c: search.c as string | undefined,
      tab: search.tab as "waiting" | "active" | "resolved" | "groups" | undefined,
    }
  }
});

type Status = "waiting" | "active" | "resolved";
type TabType = Status | "groups";

interface ConvRow {
  id: string;
  channel: "whatsapp" | "instagram";
  status: Status;
  last_message_at: string;
  started_at: string;
  tags: string[];
  unread_count?: number;
  last_message_preview?: string | null;
  contact: { 
    id: string; 
    name: string; 
    phone: string | null; 
    email: string | null; 
    tags: string[];
    contact_labels?: { labels: { id: string; name: string; color: string | null } }[];
  };
  department: { name: string } | null;
  assigned_agent?: { name: string } | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  ai_active?: boolean;
  ai_agent_id?: string | null;
  ai_agent?: { name: string } | null;
  unit_id: string;
  whatsapp_instance_id: string | null;
  unit?: { name: string; color?: string | null; custom_variables?: any } | null;
  whatsapp_instance?: { name: string } | null;
}

function ConversationsPage() {
  const { c: searchConvId, tab: searchTab } = Route.useSearch();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [tab, setTab] = useState<TabType>(searchTab || "waiting");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchConvId || null);

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
  const { startCall } = useWavoip();
  const [dialerOpen, setDialerOpen] = useState(false);
  
  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances_filter", selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let query = supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider")
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
  
  const PAGE_SIZE = 20;

  const {
    data: conversationsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isConvFetching,
  } = useInfiniteQuery({
    queryKey: ["conversations", activeCompanyId, tab, selectedUnitId, profile?.id, profile?.role, profile?.department_id, debouncedSearch, instanceFilter],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;

      let selectString = "id, channel, status, last_message_at, started_at, tags, unread_count, last_message_preview, department_id, assigned_agent_id, unit_id, whatsapp_instance_id, current_session_id, ai_active, ai_agent_id, contact:contacts!inner(id,name,phone,email,tags,instagram_username,whatsapp_lid,instagram_id,company_id,is_blocked,contact_labels(labels(id,name,color))), department:departments(name), assigned_agent:profiles!conversations_assigned_agent_id_fkey(name), ai_agent:ai_agents(name), unit:units(name,color,custom_variables), whatsapp_instance:whatsapp_instances(name)";
      
      if (debouncedSearch || tab === "groups") {
        selectString = selectString; // No replacement needed, inner join is already default
      }

      let query = supabase
        .from("conversations")
        .select(selectString)
        .order("last_message_at", { ascending: false })
        .range(from, to);

      if (activeCompanyId) {
        query = query.eq("contact.company_id", activeCompanyId);
      }
      // Use neq instead of or so we don't overwrite the foreign table's or() filter later for search
      query = query.not('contact.is_blocked', 'is', true);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
      }
      
      if (instanceFilter && instanceFilter !== "all") {
        query = query.eq("whatsapp_instance_id", instanceFilter);
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`, { foreignTable: "contact" });
      }

      if (tab === "groups") {
        query = query.or('phone.like.120363%,phone.like.%-%', { foreignTable: "contact" });
      }

      // Server-side status filter for non-group tabs
      if (tab === "waiting") {
        query = query.eq("status", "waiting");
        // Non-admin: only see conversations in their dept or assigned to them
        if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
          if (profile?.department_id) {
            query = query.or(`department_id.eq.${profile.department_id},assigned_agent_id.eq.${profile.id},department_id.is.null`);
          } else {
            query = query.or(`assigned_agent_id.eq.${profile?.id},department_id.is.null`);
          }
        }
      } else if (tab === "active") {
        query = query.eq("status", "active");
        if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
          query = query.eq("assigned_agent_id", profile?.id ?? "");
        }
      } else if (tab === "resolved") {
        query = query.eq("status", "resolved");
        if (profile?.role !== "admin_company" && profile?.role !== "super_admin" && profile?.role !== "manager") {
          query = query.eq("assigned_agent_id", profile?.id ?? "");
        }
      }
      // "groups" tab: no status filter here — filtered client-side below

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as unknown as ConvRow[];

      // Client-side: separate groups from regular convs
      if (tab === "groups") {
        rows = rows.filter(c =>
          c.contact?.phone && (c.contact.phone.startsWith('120363') || c.contact.phone.includes('-'))
        );
      } else {
        // Exclude groups from all other tabs
        rows = rows.filter(c =>
          !(c.contact?.phone && (c.contact.phone.startsWith('120363') || c.contact.phone.includes('-')))
        );
      }

      // Resolved: deduplicate by contact+instance (keep most recent — already ordered DESC)
      if (tab === "resolved") {
        const seen = new Set<string>();
        rows = rows.filter(c => {
          const key = `${c.contact?.id ?? 'no-contact'}__${c.whatsapp_instance_id ?? 'no-instance'}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      return { rows, rawCount: (data ?? []).length };
    },
    getNextPageParam: (lastPage, allPages) =>
      // Use raw DB count (before client-side filtering) to detect more pages
      lastPage.rawCount === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !!profile,
  });

  // Flatten all pages into a single list — guard against stale cache pages in old format
  const conversations = useMemo(
    () => conversationsData?.pages.flatMap(p => {
      // p may be in old format (array) or new format ({rows, rawCount})
      const rows = Array.isArray(p) ? p : p?.rows;
      return (rows ?? []).filter(Boolean);
    }) ?? [],
    [conversationsData]
  );


  useEffect(() => {
    if (searchTab && searchTab !== tab) {
      setTab(searchTab as TabType);
    }
  }, [searchTab]);

  useEffect(() => {
    if (searchConvId && searchConvId !== selectedId) {
      setSelectedId(searchConvId);
    }
  }, [searchConvId]);

  const { data: unreadCounts } = useQuery({
    queryKey: ["unread-counts", activeCompanyId, selectedUnitId, profile?.id, profile?.department_id, instanceFilter, debouncedSearch],
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
      // Use neq instead of or so we don't overwrite the foreign table's or() filter later for search
      query = query.not('contact.is_blocked', 'is', true);

      if (selectedUnitId) {
        query = query.eq("unit_id", selectedUnitId);
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

      // Rastrear duplicatas de resolvidas por (contact_id, instance_id)
      const resolvedSeen = new Set<string>();
      
      data.forEach(c => {
        if (instanceFilter && instanceFilter !== "all" && c.whatsapp_instance_id !== instanceFilter) {
          return;
        }

        const isGroup = c.contact?.phone && (c.contact.phone.startsWith('120363') || c.contact.phone.includes('-'));
        if (isGroup) {
          counts.groups.total++;
          counts.groups.unread += c.unread_count || 0;
        } else {
          const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";
          const isManager = profile?.role === "manager";
          const isMyDept = c.department_id === profile?.department_id;
          const isGeneral = !c.department_id;
          const isAssignedToMe = c.assigned_agent_id === profile?.id;

          if (c.status === 'waiting') {
            const canSeeWaiting = isAdmin || isGeneral || isMyDept || isAssignedToMe;
            if (canSeeWaiting) {
              if (isAdmin || isManager || !c.assigned_agent_id || c.assigned_agent_id === profile?.id) {
                counts.waiting.total++;
                counts.waiting.unread += c.unread_count || 0;
              }
            }
          }
          if (c.status === 'active') {
            const canSeeActive = isAdmin || (isManager && isMyDept) || isAssignedToMe;
            if (canSeeActive) {
              counts.active.total++;
              counts.active.unread += c.unread_count || 0;
            }
          }
          if (c.status === 'resolved') {
            const canSeeResolved = isAdmin || (isManager && isMyDept) || isAssignedToMe;
            if (canSeeResolved) {
              // Contar apenas a conversa mais recente por contato + instância
              const key = `${(c.contact as any)?.id ?? 'no-contact'}__${c.whatsapp_instance_id ?? 'no-instance'}`;
              if (!resolvedSeen.has(key)) {
                resolvedSeen.add(key);
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

  const updateConversationInCache = (
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
      
      // Find the conversation across all pages
      const updatedPages = oldData.pages.map((page: any) => {
        if (!page || !page.rows) return page;
        const filteredRows = page.rows.filter((c: ConvRow) => {
          if (c.id === convId) {
            targetConv = { ...c, ...updates } as ConvRow;
            // Remove from current position so we can move it if appropriate
            return false;
          }
          return true;
        });
        return { ...page, rows: filteredRows };
      });

      let nextData = oldData;

      // Determine if this conversation belongs to the current queryTab
      if (targetConv) {
        const isGroup = !!((targetConv as ConvRow).contact?.phone && ((targetConv as ConvRow).contact.phone!.startsWith('120363') || (targetConv as ConvRow).contact.phone!.includes('-')));
        const matchesTab = isGroup ? (queryTab === "groups") : ((targetConv as ConvRow).status === queryTab);
        
        if (matchesTab) {
          // Prepend to the first page immutably
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
          // If status/tab changed and it no longer belongs here, it is removed from this tab
          nextData = { ...oldData, pages: updatedPages };
        }
      } else if (moveToTop && targetStatus === queryTab) {
        // If not found in cache and moveToTop was requested, and it belongs to this queryTab, trigger a refetch
        setTimeout(() => qc.invalidateQueries({ queryKey: queryKey }), 0);
      }
      
      qc.setQueryData(queryKey, nextData);
    });
  };

  const updateUnreadCountsInCache = (tabKey: "waiting" | "active" | "resolved" | "groups", totalDiff: number, unreadDiff: number) => {
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
  };

  const handleConversationStatusChangeInCache = (conv: ConvRow, oldStatus: "waiting" | "active" | "resolved", newStatus: "waiting" | "active" | "resolved") => {
    const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-')));
    if (isGroup) return; // groups tab doesn't split by status

    updateUnreadCountsInCache(oldStatus, -1, -(conv.unread_count || 0));
    updateUnreadCountsInCache(newStatus, 1, conv.unread_count || 0);
  };

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Realtime
  useEffect(() => {
    // Usando um ID aleatório para o canal para evitar problemas de desconexão silenciosa no Vite HMR
    const channelId = `conversations-rt-${Math.random()}`;
    const ch = supabase
      .channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        console.log("Realtime: conversations updated", payload);
        
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
            // Update conversation details in-cache
            const isGroup = !!((oldConv as ConvRow).contact?.phone && ((oldConv as ConvRow).contact.phone!.startsWith('120363') || (oldConv as ConvRow).contact.phone!.includes('-')));
            const targetStatus = isGroup ? "groups" : (updatedConv.status || "active");
            updateConversationInCache(convId, updatedConv, { moveToTop: false, status: targetStatus });

            // Handle status changes in-cache
            if ((oldConv as ConvRow).status !== updatedConv.status) {
              handleConversationStatusChangeInCache(oldConv as ConvRow, (oldConv as ConvRow).status, updatedConv.status);
            }
            
            // Handle unread counts bubble changes in-cache
            const unreadDiff = (updatedConv.unread_count || 0) - ((oldConv as ConvRow).unread_count || 0);
            if (unreadDiff !== 0) {
              const tabKey = isGroup ? "groups" : (updatedConv.status || "active");
              updateUnreadCountsInCache(tabKey, 0, unreadDiff);
            }
          } else {
            // Fallback: not in cache, refetch
            qc.invalidateQueries({ queryKey: ["conversations"] });
            qc.invalidateQueries({ queryKey: ["unread-counts"] });
          }
        } 
        
        else if (payload.eventType === "INSERT") {
          // New conversation created, full refetch
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["unread-counts"] });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        console.log("Realtime: messages updated", payload);
        
        if (payload.eventType === "INSERT") {
          const newMsg = payload.new as any;
          const convId = newMsg.conversation_id;

          // 1. Append message to cache if loaded
          qc.setQueryData(["messages", convId], (old: any) => {
            if (!old) return old;
            if (old.some((m: any) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });

          // 2. Update conversation preview and move it to top (guarded to prevent double updates)
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
            const isAlreadyUpdated = existingConv.last_message_at && new Date(existingConv.last_message_at).getTime() >= new Date(newMsg.created_at).getTime();
            
            if (!isAlreadyUpdated) {
              const nextUnread = ((existingConv as ConvRow).unread_count || 0) + unreadIncrement;
              const isGroup = !!((existingConv as ConvRow).contact?.phone && ((existingConv as ConvRow).contact.phone!.startsWith('120363') || (existingConv as ConvRow).contact.phone!.includes('-')));
              const targetStatus = isGroup ? "groups" : ((existingConv as ConvRow).status || "active");

              updateConversationInCache(convId, {
                last_message_preview: previewText,
                last_message_at: newMsg.created_at,
                unread_count: nextUnread
              }, { moveToTop: true, status: targetStatus });

              if (unreadIncrement > 0) {
                const tabKey = isGroup ? "groups" : ((existingConv as ConvRow).status || "active");
                updateUnreadCountsInCache(tabKey, 0, unreadIncrement);
              }
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
        console.log("Realtime subscription status:", status);
      });
    return () => { supabase.removeChannel(ch); };
  }, [qc]);


  const filtered = conversations.filter(c => !!c?.id);
  console.log("DEBUG_FILTERED:", filtered);

  useEffect(() => {
    const current = filtered.find((c) => c.id === selectedId);
    if (current) setLastSelectedConv(current);
  }, [filtered, selectedId]);

  const selected = useMemo(() => {
    const current = filtered.find((c) => c.id === selectedId) ?? null;
    if (current) return current;
    if (selectedId && lastSelectedConv?.id === selectedId) {
      return { ...lastSelectedConv, status: tab === "active" ? "active" : lastSelectedConv.status } as ConvRow;
    }
    return null;
  }, [filtered, selectedId, lastSelectedConv, tab]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <aside className={cn(
        "flex w-full md:w-[360px] shrink-0 flex-col border-r border-border bg-card",
        selectedId ? "hidden md:flex" : "flex"
      )}>
        {/* Loading bar — shows on any active fetch (initial, realtime refresh, next page) */}
        <div className="relative h-0.5 w-full overflow-hidden bg-transparent">
          {isConvFetching && (
            <div
              className="absolute inset-0 bg-primary"
              style={{
                animation: 'conv-loading-bar 1.2s ease-in-out infinite',
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
                <Button size="icon" variant={instanceFilter && instanceFilter !== "all" ? "default" : "outline"} className="h-9 w-9 shrink-0">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInstanceFilter("all")}>
                  Todas as instâncias
                  {(!instanceFilter || instanceFilter === "all") && <CheckCircle2 className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                {instances?.map(inst => (
                  <DropdownMenuItem key={inst.id} onClick={() => setInstanceFilter(inst.id)}>
                    {inst.name || inst.instance_name}
                    {instanceFilter === inst.id && <CheckCircle2 className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NewConversationDialog onCreated={(id) => {
              setTab("active");
              setSelectedId(id);
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
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabType)} className="mt-3">
            <TabsList className="grid w-full grid-cols-4 h-auto py-1">
              <TabsTrigger value="waiting" className="px-1 py-1.5 text-xs relative">
                Aguard. {unreadCounts?.waiting?.total || 0}
                {unreadCounts && unreadCounts.waiting?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.waiting.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="px-1 py-1.5 text-xs relative">
                Andam. {unreadCounts?.active?.total || 0}
                {unreadCounts && unreadCounts.active?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.active.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved" className="px-1 py-1.5 text-xs relative">
                Resolv. {unreadCounts?.resolved?.total || 0}
                {unreadCounts && unreadCounts.resolved?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.resolved.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="groups" className="px-1 py-1.5 text-xs relative">
                Grupos {unreadCounts?.groups?.total || 0}
                {unreadCounts && unreadCounts.groups?.unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCounts.groups.unread}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div
          className="flex-1 overflow-y-auto"
        >
          {filtered.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              selected={selectedId === c.id}
              onClick={() => setSelectedId(c.id)}
              currentUserId={profile?.id}
              showUnitInfo={!selectedUnitId}
            />
          ))}
          {!filtered.length && !isConvFetching && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          )}
          {/* Skeleton cards while loading next page */}
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
          {/* Load more button */}
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
        "flex min-w-0 flex-1 flex-col bg-background",
        !selectedId ? "hidden md:flex" : "flex"
      )}>
        {selected ? (
          <ChatPanel 
            conv={selected} 
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onAssigned={() => setTab("active")}
            onBack={() => setSelectedId(null)}
          />
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

function ContactSidebar({ conv, onClose }: { conv: ConvRow, onClose?: () => void }) {
  const qc = useQueryClient();
  const { selectedUnitId } = useUnit();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [searchLabel, setSearchLabel] = useState("");

  const { data: allLabels } = useQuery({
    queryKey: ["labels", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase.from('labels').select('*').eq('company_id', activeCompanyId);
      return data || [];
    },
    enabled: !!activeCompanyId
  });

  const toggleAi = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("conversations").update({ ai_active: active }).eq("id", conv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error("Erro ao alterar IA", { description: (e as Error).message })
  });

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, action }: { labelId: string, action: "add" | "remove" }) => {
      if (!selectedUnitId || !conv.contact?.id) return;
      const res = await toggleContactLabelAction({ data: { unitId: selectedUnitId, contactId: conv.contact?.id, labelId, action } });
      if (!res?.success) throw new Error("Falha na API do WhatsApp. O EvoGo rejeitou a ação.");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(e.message)
  });

  const createLabel = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedUnitId) return;
      const res = await createLabelAction({ data: { unitId: selectedUnitId, name } });
      if (!res?.success || !res.label) throw new Error(res?.error || "Falha ao criar etiqueta");
      return res.label;
    },
    onSuccess: async (label) => {
      qc.invalidateQueries({ queryKey: ["labels", activeCompanyId] });
      // Auto assign the newly created label
      if (conv.contact?.id && selectedUnitId) {
        toggleLabel.mutate({ labelId: label.id, action: "add" });
      }
      setSearchLabel("");
      toast.success("Etiqueta criada!");
    },
    onError: (e) => toast.error((e as Error).message)
  });
  
  const { data: profilePictureUrl } = useQuery({
    queryKey: ["contact-profile-pic", conv.contact?.id, selectedUnitId],
    queryFn: async () => {
      if (!conv.contact?.id || (!conv.unit_id && !conv.whatsapp_instance_id)) return null;
      return await fetchContactInfoAction({ data: { contactId: conv.contact?.id, unitId: conv.unit_id, whatsappInstanceId: conv.whatsapp_instance_id } });
    },
    enabled: !!conv.contact?.id && !!conv.unit_id,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      return await updateContactFromWhatsappAction({
        data: { contactId: conv.contact?.id, unitId: conv.unit_id, whatsappInstanceId: conv.whatsapp_instance_id }
      });
    },
    onSuccess: (data) => {
      if (data?.success) {
        if (data.updatedName === "Foto Encontrada") {
          toast.success(data.message || "Foto de perfil atualizada!");
        } else {
          toast.success(`Nome atualizado para: ${data.updatedName}`);
        }
      } else if (data?.message) {
        toast.info(data.message);
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
      if (conv.contact?.id) qc.invalidateQueries({ queryKey: ["contact-profile-pic", conv.contact?.id] });
    },
    onError: (e) => {
      toast.error(e.message || "Erro ao atualizar contato.");
    }
  });

  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <div className="flex h-full flex-col bg-background/50">
      <div className="flex justify-between items-center p-3 pb-0">
        <h3 className="text-sm font-semibold ml-2 text-muted-foreground">Perfil</h3>
        <Button variant="ghost" size="icon" className="hidden lg:flex h-8 w-8 text-muted-foreground rounded-full hover:bg-muted" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-5 pt-2 flex flex-col items-center justify-center relative">
        <div className="relative mb-4 group">
          <Avatar className="h-24 w-24 ring-4 ring-background shadow-xl">
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt={conv.contact?.name} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className={cn("text-3xl font-medium", isGroup ? "bg-primary/20 text-primary" : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary")}>
                {isGroup ? <Users className="h-10 w-10 opacity-80" /> : initials(contactName || "?")}
              </AvatarFallback>
            )}
          </Avatar>
          {conv.contact && (
            <Button 
              variant="secondary" 
              size="icon" 
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              title="Sincronizar foto do WhatsApp"
              onClick={() => updateContact.mutate()}
              disabled={updateContact.isPending}
            >
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${updateContact.isPending ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        <div className="text-center w-full space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 max-w-[90%] mx-auto">
            <h3 className="font-bold text-xl truncate">{contactName || "Desconhecido"}</h3>
            <ContactEditDialog contact={conv.contact} />
            {(profile?.role === "admin_company" || profile?.role === "super_admin" || profile?.role === "manager") && conv.contact && <ContactBlockDialog contact={conv.contact} />}
          </div>
          
          <div className="flex items-center justify-center">
            <Badge variant="secondary" className="font-mono text-xs font-normal text-muted-foreground bg-muted/50 hover:bg-muted/80 transition-colors px-2.5 py-0.5">
              {isGroup ? "Grupo" : (conv.contact?.phone ? formatPhone(conv.contact.phone) : "Sem número")}
            </Badge>
          </div>
          
          {conv.contact && !isGroup && (
            <div className="flex flex-col items-center gap-1 mt-2 text-xs text-muted-foreground">
              {conv.contact.instagram_username && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-pink-500" />
                  <span>@{conv.contact.instagram_username}</span>
                </div>
              )}
              {conv.contact.whatsapp_lid && (
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">ID/LID: {conv.contact.whatsapp_lid}</span>
                </div>
              )}
              {conv.contact.instagram_id && (
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-pink-400" />
                  <span className="truncate max-w-[200px]">Insta ID: {conv.contact.instagram_id}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="px-4 pb-6 space-y-4">
          {/* AI Status Container */}
          {!isGroup && (
            <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", conv.ai_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Inteligência Artificial</h4>
                  <p className="text-xs text-muted-foreground">
                    {conv.ai_active ? "A IA está respondendo" : "IA pausada neste ticket"}
                  </p>
                </div>
              </div>
              <Switch 
                checked={conv.ai_active || false} 
                onCheckedChange={(v) => toggleAi.mutate(v)} 
                disabled={toggleAi.isPending}
              />
            </div>
          )}

          {/* Etiquetas Container */}
          <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" /> 
                Etiquetas
              </h4>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary">
                    <Plus className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-56" align="end">
                  <Command>
                    <CommandInput 
                      placeholder="Buscar etiqueta..." 
                      className="h-8 text-xs" 
                      value={searchLabel}
                      onValueChange={setSearchLabel}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {searchLabel.length > 0 ? (
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start text-xs h-8 font-normal"
                            onClick={() => createLabel.mutate(searchLabel)}
                            disabled={createLabel.isPending}
                          >
                            Criar "{searchLabel}"
                          </Button>
                        ) : "Nenhuma etiqueta encontrada."}
                      </CommandEmpty>
                      <CommandGroup>
                        {allLabels?.map(label => {
                          const isSelected = conv.contact?.contact_labels?.some(cl => cl.labels?.id === label.id);
                          return (
                            <CommandItem
                              key={label.id}
                              onSelect={() => {
                                toggleLabel.mutate({ labelId: label.id, action: isSelected ? "remove" : "add" });
                              }}
                              className="text-xs"
                            >
                              <div 
                                className="w-2 h-2 rounded-full mr-2" 
                                style={{ backgroundColor: label.color || "#6b7280" }}
                              />
                              <span className="flex-1">{label.name}</span>
                              {isSelected && <Square className="h-3 w-3 opacity-50 bg-primary/20" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {conv.contact?.contact_labels?.map((cl) => {
                const label = cl.labels;
                if (!label) return null;
                const hexColor = label.color || "#6b7280";
                return (
                  <Badge 
                    key={label.id} 
                    variant="outline" 
                    className="font-normal text-[10px] px-2 py-0 h-5"
                    style={{ 
                      backgroundColor: `${hexColor}15`, 
                      color: hexColor, 
                      borderColor: `${hexColor}30` 
                    }}
                  >
                    {label.name}
                  </Badge>
                );
              })}
              {!conv.contact?.contact_labels?.length && (
                <span className="text-xs text-muted-foreground/70 italic">Nenhuma etiqueta atribuída.</span>
              )}
            </div>
          </div>

          {/* Ficha Completa */}
          {conv.contact?.id && (
            <div className="bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden">
              <ContactDetailsTabs contactId={conv.contact?.id} conversationId={conv.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewConversationDialog({ 
  onCreated,
  trigger,
  initialPhone
}: { 
  onCreated?: (id: string) => void;
  trigger?: React.ReactNode;
  initialPhone?: string;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(initialPhone || "");
  const [text, setText] = useState("");
  const [instanceName, setInstanceName] = useState("");

  useEffect(() => {
    if (open && initialPhone) setPhone(initialPhone);
  }, [open, initialPhone]);

  const { selectedUnitId } = useUnit();

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances", selectedUnitId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let query = supabase
        .from("whatsapp_instances")
        .select("id, name, instance_name, provider")
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

  const send = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Usuário sem empresa");
      const res = await sendProactiveMessageAction({
        data: {
          phone,
          text,
          instanceName,
          companyId: activeCompanyId,
        }
      });
      return res;
    },
    onSuccess: (res) => {
      if (res.conversationId && onCreated) {
        onCreated(res.conversationId);
      }
      setOpen(false);
      setPhone(initialPhone || "");
      setText("");
      setInstanceName("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Mensagem enviada com sucesso!");
    },
    onError: (e) => {
      toast.error("Erro ao enviar mensagem", { description: (e as Error).message });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Inicie um atendimento enviando uma mensagem ativa para o cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Instância (Remetente)</Label>
            <Select value={instanceName} onValueChange={setInstanceName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {instances?.map((inst) => (
                  <SelectItem key={inst.instance_name} value={inst.instance_name}>
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={inst.provider} />
                      <span>{inst.name || inst.instance_name}</span>
                    </div>
                  </SelectItem>
                ))}
                {!instances?.length && (
                  <SelectItem value="none" disabled>Nenhuma instância encontrada</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número do Cliente</Label>
            <Input 
              placeholder="Ex: 5511999999999" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
            <p className="text-[10px] text-muted-foreground">Inclua o DDI (55) e o DDD.</p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea 
              placeholder="Digite a primeira mensagem..." 
              value={text} 
              onChange={e => setText(e.target.value)} 
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            onClick={() => send.mutate()} 
            disabled={!phone || !text || !instanceName || send.isPending}
          >
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationItem({
  conv,
  selected,
  onClick,
  currentUserId,
  showUnitInfo,
}: {
  conv: ConvRow;
  selected: boolean;
  onClick: () => void;
  currentUserId?: string;
  showUnitInfo?: boolean;
}) {
  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full max-w-full overflow-hidden items-start gap-3 border-b border-border pl-3 pr-4 py-3 text-left transition-colors hover:bg-accent/40",
        selected && "bg-accent/60",
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className={cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted")}>
          {isGroup ? <Users className="h-4 w-4" /> : initials(conv.contact?.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 grid">
        <div className="flex items-center gap-2 min-w-0">
          <ChannelIcon channel={conv.channel} className="h-4 w-4 shrink-0" />
          <span className={cn("truncate text-sm font-medium flex-1 min-w-0", conv.unread_count && conv.unread_count > 0 && "font-bold text-foreground")}>
            {contactName}
          </span>
          <span className={cn("whitespace-nowrap shrink-0 text-[11px]", conv.unread_count && conv.unread_count > 0 ? "font-bold text-success" : "text-muted-foreground")}>
            {formatRelative(conv.last_message_at)}
          </span>
        </div>
        {conv.last_message_preview && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {conv.last_message_preview}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {showUnitInfo && conv.unit?.name ? (
            <div 
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50"
              style={{
                backgroundColor: conv.unit.color ? `${conv.unit.color}20` : 'var(--muted)',
                color: conv.unit.color || 'var(--muted-foreground)',
                borderColor: conv.unit.color ? `${conv.unit.color}40` : 'var(--border)'
              }}
            >
              <div 
                className="h-1.5 w-1.5 rounded-full" 
                style={{ backgroundColor: conv.unit.color || 'var(--muted-foreground)' }} 
              />
              <span className="font-medium">{conv.unit.name}</span>
              {conv.whatsapp_instance?.name && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="truncate">{conv.whatsapp_instance.name}</span>
                </>
              )}
            </div>
          ) : (
            conv.whatsapp_instance?.name ? (
              <div 
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded w-fit max-w-full truncate border border-border/50 bg-muted/50 text-muted-foreground"
              >
                <Phone className="h-2 w-2 opacity-70" />
                <span className="truncate">{conv.whatsapp_instance.name}</span>
              </div>
            ) : null
          )}
          {conv.department?.name && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {conv.department.name}
            </Badge>
          )}
          {conv.status === "active" && (conv.ai_active || conv.assigned_agent?.name) && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/30">
              {conv.ai_active ? `🤖 ${conv.ai_agent?.name || 'IA'}` : conv.assigned_agent?.name}
            </Badge>
          )}
          {conv.status === "waiting" && conv.assigned_agent_id && conv.assigned_agent_id === currentUserId && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px] font-normal bg-orange-500 hover:bg-orange-600">
              Transferido
            </Badge>
          )}
          {conv.tags?.map((t) => (
            <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {t}
            </Badge>
          ))}
          {conv.unread_count && conv.unread_count > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 py-0 text-[10px] font-bold text-white shadow-sm">
              {conv.unread_count}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
        <MessageCircle className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium">Selecione uma conversa</h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Escolha um atendimento na lista ao lado para visualizar as mensagens.
      </p>
    </div>
  );
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: "agent" | "contact" | "system";
  is_internal?: boolean;
  content: string | null;
  media_type: "text" | "image" | "audio" | "video" | "document";
  media_url?: string | null;
  created_at: string;
  quoted_content?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  reactions?: Record<string, string[]>;
  isOptimistic?: boolean;
  remote_msg_id?: string | null;
  profiles?: { name: string };
  metadata?: any;
  quoted_message_id?: string | null;
}

function ChatPanel({ 
  conv,
  showSidebar,
  onToggleSidebar,
  onAssigned,
  onBack
}: { 
  conv: ConvRow;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  onAssigned?: () => void;
  onBack?: () => void;
}) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const { startCall, instances } = useWavoip();
  const { selectedUnitId } = useUnit();
  const [text, setText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [isCoaching, setIsCoaching] = useState(false);
  const [editingMessage, setEditingMessage] = useState<MessageRow | null>(null);
  

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-chat", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("ai_settings")
        .eq("id", activeCompanyId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const aiSettings = companySettings?.ai_settings as any;
  const hasAiConfigured = aiSettings && (
    (aiSettings.engines?.chatbot && aiSettings.engines.chatbot !== 'none') ||
    (aiSettings.engines?.text && aiSettings.engines.text !== 'none') ||
    aiSettings.keys?.openai || aiSettings.keys?.openrouter || aiSettings.keys?.groq
  );

  const showCoach = hasAiConfigured && 
    (aiSettings?.sales_coach_active_instances?.includes(conv.whatsapp_instance_id!) || 
    !aiSettings?.sales_coach_active_instances?.length);

  useEffect(() => {
    const handleInsert = (e: any) => {
      if (e.detail) {
        setText(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + e.detail);
        setTimeout(() => {
          document.getElementById("chat-input")?.focus();
        }, 100);
      }
    };
    window.addEventListener("insert-chat-text", handleInsert);
    return () => window.removeEventListener("insert-chat-text", handleInsert);
  }, []);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [quickMsgIndex, setQuickMsgIndex] = useState(0);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [resolveObservation, setResolveObservation] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["messages", conv.id],
    queryFn: async () => {
      // 1. Get all conversation IDs for this contact on this instance
      // Fetch messages for this conversation
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_type, is_internal, content, media_type, media_url, created_at, quoted_content, quoted_message_id, is_edited, is_deleted, reactions, remote_msg_id, transcription, profiles(name), metadata")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
        
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const { data: quickMessageFolders } = useQuery({
    queryKey: ["quick-message-folders", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_message_folders")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: quickMessages } = useQuery({
    queryKey: ["quick-messages", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_messages")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("shortcut", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
      }
    };
    
    scrollToBottom();
    const timeout = setTimeout(scrollToBottom, 150);
    
    // Reset unread count when chat is opened
    if (conv.id && conv.unread_count && conv.unread_count > 0) {
      supabase.rpc('reset_unread_count', { conv_id: conv.id }).then(() => {
        // Update conversation in-cache
        qc.setQueriesData({ queryKey: ["conversations"] }, (oldData: any) => {
          if (!oldData || !oldData.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => {
              if (!page || !page.rows) return page;
              return {
                ...page,
                rows: page.rows.map((c: ConvRow) => c.id === conv.id ? { ...c, unread_count: 0 } : c)
              };
            })
          };
        });

        // Update unread counts in-cache
        const isGroup = !!(conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-')));
        const tabKey = isGroup ? 'groups' : (conv.status || 'active');
        qc.setQueriesData({ queryKey: ["unread-counts"] }, (oldData: any) => {
          if (!oldData) return oldData;
          const newData = { ...oldData };
          if (newData[tabKey]) {
            newData[tabKey] = {
              total: newData[tabKey].total,
              unread: Math.max(0, newData[tabKey].unread - conv.unread_count!)
            };
          }
          return newData;
        });
      });
    }

    return () => clearTimeout(timeout);
  }, [messages?.length, conv.id, conv.unread_count, qc]);

  const send = useMutation({
    mutationFn: async (payload: { content: string; isInternal?: boolean; mediaType?: "text"|"image"|"video"|"audio"|"document"; mediaBase64?: string; quotedMessageId?: string; quotedParticipant?: string; quotedInternalId?: string; quotedContent?: string }) => {
      return await sendMessageAction({ data: { conversationId: conv.id, text: payload.content, mediaType: payload.mediaType, mediaBase64: payload.mediaBase64, quotedMessageId: payload.quotedMessageId, quotedParticipant: payload.quotedParticipant, quotedInternalId: payload.quotedInternalId, quotedContent: payload.quotedContent, isInternal: payload.isInternal } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      const optimisticMsg: MessageRow = {
        id: crypto.randomUUID(),
        conversation_id: conv.id,
        sender_type: "agent",
        is_internal: payload.isInternal,
        content: payload.content,
        media_type: payload.mediaType || "text",
        media_url: payload.mediaBase64 || null,
        created_at: new Date().toISOString(),
        isOptimistic: true,
        profiles: profile?.name ? { name: profile.name } : undefined
      };

      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => [...(old || []), optimisticMsg]);
      setText("");
      setSelectedFile(null);
      setReplyingTo(null);
      setIsInternalNote(false);
      
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);

      return { previousMessages, content: payload.content };
    },
    onError: (e, variables, context) => {
      if (context?.previousMessages) {
        qc.setQueryData(["messages", conv.id], context.previousMessages);
      }
      setText(context?.content || "");
      if (e.message.includes('WINDOW_24H_EXPIRED')) {
        setTemplateDialogOpen(true);
      } else {
        toast.error("Erro ao enviar", { description: (e as Error).message });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const deleteMsg = useMutation({
    mutationFn: async (messageId: string) => {
      await deleteMessageAction({ data: { messageId } });
    },
    onMutate: async (messageId) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === messageId ? { ...m, is_deleted: true } : m);
      });
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao apagar mensagem", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const editMsg = useMutation({
    mutationFn: async (payload: { messageId: string; content: string }) => {
      await editMessageAction({ data: { conversationId: conv.id, messageId: payload.messageId, newContent: payload.content } });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === payload.messageId ? { ...m, content: payload.content, is_edited: true } : m);
      });
      setText("");
      setEditingMessage(null);
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao editar", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const transcribeAudio = useMutation({
    mutationFn: async (messageId: string) => {
      return transcribeAudioAction({ data: { messageId } });
    },
    onSuccess: (data, variables) => {
      toast.success("Transcrição concluída com sucesso!");
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === variables ? { ...m, transcription: data.text } : m);
      });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e) => toast.error("Erro na transcrição", { description: (e as Error).message })
  });

  const fixTextMutation = useMutation({
    mutationFn: async (textToFix: string) => {
      return fixMessageTextAction({ data: { conversationId: conv.id, text: textToFix } });
    },
    onSuccess: (data) => {
      setText(data.text);
      toast.success("Texto corrigido!");
    },
    onError: (e) => {
      toast.error("Erro ao corrigir texto", { description: (e as Error).message });
    }
  });

  const react = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
      await reactToMessageAction({ data: { conversationId: conv.id, messageId, emoji } });
    },
    onMutate: async ({ messageId, emoji }) => {
      await qc.cancelQueries({ queryKey: ["messages", conv.id] });
      const previousMessages = qc.getQueryData(["messages", conv.id]);
      
      qc.setQueryData(["messages", conv.id], (old: MessageRow[] | undefined) => {
        if (!old) return old;
        return old.map(m => m.id === messageId ? { ...m, reactions: emoji ? { [emoji]: 1 } : {} } : m);
      });
      return { previousMessages };
    },
    onError: (e, v, context) => {
      if (context?.previousMessages) qc.setQueryData(["messages", conv.id], context.previousMessages);
      toast.error("Erro ao reagir", { description: (e as Error).message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", conv.id] });
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("audio/")) type = "audio";
    
    if (type === "image") {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 800;
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Fill white background in case of transparent PNGs
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL("image/jpeg", 0.8);
          setSelectedFile({ file, base64, type });
        }
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setSelectedFile({ file, base64, type });
      };
      reader.readAsDataURL(file);
    }
    
    e.target.value = ""; // reset
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        const toastId = toast.loading("Processando áudio...");
        try {
          const webmBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          const ffmpeg = await getFFmpeg();
          await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
          
          const isInstagram = conv.channel === 'instagram';
          const outputName = isInstagram ? 'output.mp4' : 'output.ogg';
          const mimeType = isInstagram ? 'audio/mp4' : 'audio/ogg';

          if (isInstagram) {
            await ffmpeg.exec(['-i', 'input.webm', '-c:a', 'aac', '-b:a', '128k', outputName]);
          } else {
            await ffmpeg.exec(['-i', 'input.webm', '-c:a', 'libopus', outputName]);
          }
          
          const data = await ffmpeg.readFile(outputName);
          
          const audioBlob = new Blob([data], { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            send.mutate({ content: "", isInternal: isInternalNote, mediaType: "audio", mediaBase64: base64data });
            toast.dismiss(toastId);
          };
          reader.readAsDataURL(audioBlob);
        } catch (error) {
          console.error("Erro na conversão de áudio:", error);
          toast.dismiss(toastId);
          toast.error("Erro ao processar áudio", { description: String(error) });
        } finally {
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Erro ao acessar microfone", { description: String(err) });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // prevent onstop from sending
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const insertQuickMessage = (qm: { content: string, media_url?: string | null, media_type?: string | null }) => {
    const now = new Date();
    let t = qm.content || "";
    t = t.replace(/\{\{atendente\}\}/g, profile?.name || "Atendente");
    t = t.replace(/\{\{cliente\}\}/g, conv.contact?.name && conv.contact.name !== "Desconhecido" ? conv.contact.name : "Cliente");
    t = t.replace(/\{\{saudacao\}\}/g, getGreeting());
    t = t.replace(/\{\{telefone\}\}/g, conv.contact?.phone || "");
    t = t.replace(/\{\{protocolo\}\}/g, conv.id.substring(0, 8).toUpperCase());
    t = t.replace(/\{\{data\}\}/g, now.toLocaleDateString('pt-BR'));
    t = t.replace(/\{\{hora\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

    if (conv.unit?.custom_variables && typeof conv.unit.custom_variables === 'object') {
      Object.entries(conv.unit.custom_variables).forEach(([key, val]) => {
        if (typeof key === 'string' && val) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          t = t.replace(regex, String(val));
        }
      });
    }

    setText(t);
    
    if (qm.media_url && qm.media_type) {
      setSelectedFile({
        file: null, // No raw file, we will send base64 directly
        base64: qm.media_url,
        type: qm.media_type as any
      });
    }

    document.getElementById('chat-input')?.focus();
  };

  const handleSend = () => {
    if (editingMessage) {
      if (text.trim() && text.trim() !== editingMessage.content) {
        editMsg.mutate({ messageId: editingMessage.id, content: text.trim() });
      } else {
        setEditingMessage(null);
        setText("");
      }
      return;
    }

    const participant = replyingTo ? (replyingTo.participant_jid || (replyingTo.sender_type === "contact" ? (replyingTo.sender_id ? undefined : (conv.contact?.phone ? `${conv.contact.phone}@s.whatsapp.net` : undefined)) : undefined)) : undefined;

    const quotedPayload = replyingTo ? {
      quotedMessageId: replyingTo.remote_msg_id || undefined,
      quotedParticipant: participant,
      quotedInternalId: replyingTo.id,
      quotedContent: replyingTo.content || (replyingTo.media_type !== "text" ? `[${replyingTo.media_type}]` : "Anexo"),
    } : {};

    if (selectedFile) {
      send.mutate({ content: text.trim(), isInternal: isInternalNote, mediaType: selectedFile.type as any, mediaBase64: selectedFile.base64, ...quotedPayload });
    } else if (text.trim()) {
      send.mutate({ content: text.trim(), isInternal: isInternalNote, ...quotedPayload });
    }
  };

  const startEdit = (msg: MessageRow) => {
    setEditingMessage(msg);
    let textToEdit = msg.content || "";
    const hasSignature = textToEdit.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      textToEdit = hasSignature[2];
    }
    setText(textToEdit);
    setReplyingTo(null);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const { data: resolutionReasons } = useQuery({
    queryKey: ["resolution-reasons", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resolution_reasons" as any)
        .select("id, label, order")
        .eq("company_id", activeCompanyId!)
        .eq("active", true)
        .order("order", { ascending: true });
      if (error && error.code !== '42P01') throw error;
      return (data || []) as { id: string; label: string; order: number }[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ reasonId, observation }: { reasonId: string; observation: string }) => {
      await resolveConversationAction({ 
        data: { 
          conversationId: conv.id, 
          reasonId: reasonId || null, 
          observation: observation.trim() || null 
        } 
      });
    },
    onSuccess: () => {
      toast.success("Atendimento encerrado");
      setResolveDialogOpen(false);
      setSelectedReasonId("");
      setResolveObservation("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["contact-conversations"] });
    },
    onError: (e) => {
      toast.error("Erro ao encerrar atendimento", { description: (e as Error).message });
    }
  });

  const returnToQueue = useMutation({
    mutationFn: async () => {
      await supabase
        .from("conversations")
        .update({ status: "waiting", assigned_agent_id: null })
        .eq("id", conv.id);
        
      // 2. Atualiza TODAS as sessões em andamento (zumbis)
      const { data: openSessions } = await supabase.from('conversation_sessions' as any)
         .select('id')
         .eq('conversation_id', conv.id)
         .is('resolved_at', null);

      if (openSessions && openSessions.length > 0) {
         for (const session of openSessions) {
            await supabase.from("conversation_sessions" as any).update({ assigned_agent_id: null }).eq("id", session.id);
            await supabase.from("session_events" as any).insert({ session_id: session.id, event_type: 'returned_to_queue', actor_id: profile?.id });
         }
         // Update conversation to point to one of them
         await supabase.from("conversations").update({ current_session_id: openSessions[0].id }).eq("id", conv.id);
      } else {
         const { data: newSession } = await supabase.from("conversation_sessions" as any).insert({
             conversation_id: conv.id, contact_id: conv.contact?.id, whatsapp_instance_id: conv.whatsapp_instance_id,
             assigned_agent_id: null, department_id: conv.department_id, started_at: conv.started_at || new Date().toISOString()
         }).select().single();
         if (newSession) {
            await supabase.from("conversations").update({ current_session_id: newSession.id }).eq("id", conv.id);
            await supabase.from("session_events" as any).insert({ session_id: newSession.id, event_type: 'returned_to_queue', actor_id: profile?.id });
         }
      }
    },
    onSuccess: () => {
      toast.success("Atendimento retornado para a fila");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const assignConv = useMutation({
    mutationFn: async () => {
      await assignConversationAction({ data: { conversationId: conv.id } });
      await supabase.from("conversations").update({ ai_active: false }).eq("id", conv.id);
    },
    onSuccess: () => {
      toast.success("Atendimento puxado para você.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onAssigned?.();
    },
    onError: (e) => {
      toast.error("Erro ao puxar atendimento", { description: (e as Error).message });
    }
  });

  const toggleAi = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("conversations").update({ ai_active: active }).eq("id", conv.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error("Erro ao alterar IA", { description: (e as Error).message })
  });

  const isGroup = conv.contact?.phone && (conv.contact.phone.startsWith('120363') || conv.contact.phone.includes('-'));
  const contactName = isGroup && conv.contact?.name === "Desconhecido" ? "Grupo do WhatsApp" : conv.contact?.name;

  const quickMsgItems = useMemo(() => {
    if (!text.startsWith('/') || !quickMessages) return { items: [], focusableCount: 0 };
    const search = text === '/' ? '' : text.toLowerCase().substring(1);
    const isSearch = search.length > 0;

    let items: any[] = [];
    let focusCount = 0;

    if (isSearch) {
      const filtered = quickMessages.filter(qm => 
        qm.shortcut.toLowerCase().includes(search) || 
        (qm.name && qm.name.toLowerCase().includes(search))
      ).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
      
      items = filtered.map(qm => ({ type: 'message', id: qm.id, qm, index: focusCount++ }));
    } else {
      const rootMsgs = quickMessages.filter(qm => !qm.folder_id).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
      if (rootMsgs.length > 0) {
        items.push({ type: 'header', id: 'root', name: 'Raiz', folderId: null, isExpanded: true, count: rootMsgs.length });
        rootMsgs.forEach(qm => items.push({ type: 'message', id: qm.id, qm, index: focusCount++ }));
      }

      const sortedFolders = [...(quickMessageFolders || [])].sort((a, b) => a.name.localeCompare(b.name));
      sortedFolders.forEach(folder => {
        const folderMsgs = quickMessages.filter(qm => qm.folder_id === folder.id).sort((a, b) => a.shortcut.localeCompare(b.shortcut));
        if (folderMsgs.length > 0) {
          const isExpanded = expandedFolders.has(folder.id);
          items.push({ type: 'header', id: folder.id, name: folder.name, folderId: folder.id, isExpanded, count: folderMsgs.length });
          if (isExpanded) {
            folderMsgs.forEach(qm => items.push({ type: 'message', id: qm.id, qm, index: focusCount++ }));
          }
        }
      });
    }

    return { items, focusableCount: focusCount };
  }, [text, quickMessages, quickMessageFolders, expandedFolders]);

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card px-3 md:px-5 py-3 shadow-sm z-10 min-w-0 w-full">
          <div 
            className="flex items-center gap-2 md:gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-1 -ml-1 transition-colors"
            onClick={onToggleSidebar}
          >
            {onBack && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => { e.stopPropagation(); onBack(); }}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10 ring-2 ring-primary/10 ring-offset-2">
                <AvatarFallback className={cn("text-xs", isGroup ? "bg-primary/20 text-primary" : "bg-muted")}>
                  {isGroup ? <Users className="h-4 w-4" /> : initials(conv.contact?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-success" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                {contactName}
              </div>
              <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-0.5">
                <ChannelIcon channel={conv.channel} className="h-3.5 w-3.5" />
                {conv.department?.name && <span>{conv.department.name}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {conv.status === "active" && !isGroup && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-10 w-10 text-muted-foreground hover:bg-muted/50 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (conv.contact?.phone) {
                      const name = conv.contact.name !== "Desconhecido" ? conv.contact.name : undefined;
                      const currentInstance = instances?.find((i: any) => i.id === conv.whatsapp_instance_id);
                      startCall(conv.contact.phone, name, currentInstance?.wavoip_token);
                    }
                  }}
                  title="Ligar para contato"
                >
                  <Phone className="h-5 w-5" />
                </Button>
                <TransferDialog conv={conv} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:bg-muted/50 rounded-full"
                  onClick={(e) => { e.stopPropagation(); setResolveDialogOpen(true); }}
                  title="Encerrar Atendimento"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </Button>

                {/* Resolve Dialog */}
                <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        Encerrar Atendimento
                      </DialogTitle>
                      <DialogDescription>
                        Informe o motivo do encerramento para registrar no histórico do contato.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="resolve-reason">
                          Motivo do Encerramento <span className="text-destructive">*</span>
                        </Label>
                        {(!resolutionReasons || resolutionReasons.length === 0) ? (
                          <div className="text-sm text-muted-foreground border border-dashed rounded-md p-3 text-center">
                            Nenhum motivo cadastrado. Configure os motivos em <strong>Configurações</strong>.
                          </div>
                        ) : (
                          <Select value={selectedReasonId} onValueChange={setSelectedReasonId}>
                            <SelectTrigger id="resolve-reason">
                              <SelectValue placeholder="Selecione um motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                              {resolutionReasons.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="resolve-observation">
                          Observação <span className="text-xs text-muted-foreground">(opcional)</span>
                        </Label>
                        <Textarea
                          id="resolve-observation"
                          placeholder="Adicione uma observação sobre este atendimento..."
                          value={resolveObservation}
                          onChange={(e) => setResolveObservation(e.target.value)}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                    </div>

                    <DialogFooter className="gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setResolveDialogOpen(false);
                          setSelectedReasonId("");
                          setResolveObservation("");
                        }}
                        disabled={resolve.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => resolve.mutate({ reasonId: selectedReasonId, observation: resolveObservation })}
                        disabled={!selectedReasonId || resolve.isPending || (!resolutionReasons || resolutionReasons.length === 0)}
                      >
                        {resolve.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Confirmar Encerramento
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            <button 
              className={cn("rounded-md p-2 text-muted-foreground hover:bg-accent transition-colors ml-1", showSidebar && "bg-accent text-foreground")}
              onClick={onToggleSidebar}
              title="Informações do Contato"
            >
              <PanelRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-6 py-4"
        >
          {messages?.map((m) => (
            <MessageBubble 
              key={m.id} 
              m={m} 
              isGroup={isGroup}
              onReact={(emoji) => react.mutate({ messageId: m.id, emoji })} 
              onReply={(msg) => { setReplyingTo(msg); document.getElementById('chat-input')?.focus(); }}
              onEdit={startEdit}
              onDelete={(msg) => deleteMsg.mutate(msg.id)}
              onTranscribe={(id) => transcribeAudio.mutate(id)}
              isTranscribingId={transcribeAudio.isPending ? transcribeAudio.variables : null}
            />
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-3 flex flex-col gap-2 relative">
          {(conv.status === 'waiting' || (conv.status === 'active' && ((conv.assigned_agent_id && conv.assigned_agent_id !== profile?.id) || (conv.ai_active && !conv.assigned_agent_id)))) && !isGroup && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card gap-2">
              {(!conv.assigned_agent_id || conv.assigned_agent_id === profile?.id || profile?.role === 'admin_company' || profile?.role === 'super_admin' || profile?.role === 'manager') ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground text-center px-4">
                    {(!conv.assigned_agent_id && !conv.ai_active)
                      ? "Esta conversa está na fila e aguardando um agente." 
                      : conv.assigned_agent_id === profile?.id 
                        ? "Esta conversa foi transferida para você." 
                        : conv.status === 'active'
                          ? `Esta conversa está sendo atendida por ${conv.ai_active ? `🤖 ${conv.ai_agent?.name || 'IA'}` : conv.assigned_agent?.name || 'outro agente'}.`
                          : `Esta conversa foi transferida para ${conv.assigned_agent?.name || 'outro agente'}.`}
                  </p>
                  <Button onClick={() => assignConv.mutate()} disabled={assignConv.isPending}>
                    {assignConv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {(!conv.assigned_agent_id && !conv.ai_active) ? "Atender Cliente" : (conv.assigned_agent_id === profile?.id ? "Aceitar Transferência" : "Assumir Conversa")}
                  </Button>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  {conv.status === 'active' 
                    ? `Em atendimento por ${conv.ai_active ? `🤖 ${conv.ai_agent?.name || 'IA'}` : conv.assigned_agent?.name || 'outro agente'}.` 
                    : `Aguardando aceite de ${conv.assigned_agent?.name || 'outro agente'}.`}
                </p>
              )}
            </div>
          )}
          {selectedFile && (
            <div className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/50 w-fit relative pr-8">
              <button 
                onClick={() => setSelectedFile(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              {selectedFile.type === 'image' ? (
                <img src={selectedFile.base64} alt="preview" className="h-12 w-12 object-cover rounded-md" />
              ) : (
                <div className="h-12 w-12 bg-muted rounded-md flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="text-xs truncate max-w-[150px]">
                {selectedFile.file?.name || "Anexo"}
              </div>
            </div>
          )}
          
          {replyingTo && (
            <div className="flex items-center gap-3 p-2 border-l-4 border-l-primary rounded-md bg-muted/30 relative pr-8 text-sm">
              <button 
                onClick={() => setReplyingTo(null)} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block mb-0.5 text-[10px] uppercase opacity-70">Respondendo a</span>
                <span className="line-clamp-2 opacity-90 text-xs">{replyingTo.content || `[${replyingTo.media_type}]`}</span>
              </div>
            </div>
          )}

          {editingMessage && (
            <div className="flex items-center gap-3 p-2 border-l-4 border-l-amber-500 rounded-md bg-amber-500/10 relative pr-8 text-sm">
              <button 
                onClick={() => { setEditingMessage(null); setText(""); }} 
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background border border-border hover:bg-accent text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block mb-0.5 text-[10px] uppercase text-amber-600 opacity-90">Editando mensagem</span>
                <span className="line-clamp-2 opacity-90 text-xs">{editingMessage.content?.replace(/^\*(.+?)\*:\s*/, '')}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {!isRecording ? (
              <>
                <div className={cn(
                  "flex-1 flex items-end bg-muted/50 rounded-3xl border border-transparent shadow-sm px-1 py-1 focus-within:border-border transition-colors",
                  isInternalNote && "bg-amber-100/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
                )}>
                  
                  {/* Left Side: Emoji */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-full p-2.5 text-muted-foreground hover:text-foreground mb-0.5 shrink-0 transition-colors" title="Emoji">
                        <Smile className="h-6 w-6" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="p-0 border-none w-auto shadow-xl" sideOffset={10}>
                      <EmojiPicker onEmojiClick={(e) => setText(prev => prev + e.emoji)} />
                    </PopoverContent>
                  </Popover>

                  {/* Left Side: Sales Coach */}
                  {showCoach && (
                    <button 
                      className="rounded-full p-2.5 text-amber-500 hover:text-amber-600 mb-0.5 shrink-0 transition-colors bg-amber-500/10 hover:bg-amber-500/20" 
                      title="Sales Coach (Analisar com IA)"
                      disabled={isCoaching}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isCoaching) return;
                        setIsCoaching(true);
                        try {
                          toast.loading("Sales Coach analisando a conversa...", { id: "coach" });
                          await salesCoachAction({ data: { conversationId: conv.id } });
                          const res = await salesCoachSuggestAction({ data: { conversationId: conv.id } });
                          if (res?.success && res.text) {
                            await send.mutateAsync({ 
                              content: `🤖 **Guia Tático do Coach**\n\n${res.text}`,
                              isInternal: true
                            });
                            toast.success("Guia Tático adicionado às notas internas!", { id: "coach" });
                          } else {
                            toast.dismiss("coach");
                          }
                        } catch (err: any) {
                          toast.error(err.message || "Falha ao gerar análise", { id: "coach" });
                        } finally {
                          setIsCoaching(false);
                        }
                      }}
                    >
                      {isCoaching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
                    </button>
                  )}

                  {/* Text Input */}
                  <TextareaAutosize
                    id="chat-input"
                    spellCheck={true}
                    autoCorrect="on"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setQuickMsgIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (quickMsgItems.focusableCount > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setQuickMsgIndex(prev => Math.min(prev + 1, quickMsgItems.focusableCount - 1));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setQuickMsgIndex(prev => Math.max(prev - 1, 0));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const selectedItem = quickMsgItems.items.find(i => i.type === 'message' && i.index === quickMsgIndex);
                          if (selectedItem) insertQuickMessage(selectedItem.qm);
                          setQuickMsgIndex(0);
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Mensagem"
                    minRows={1}
                    maxRows={6}
                    className={cn(
                      "flex-1 w-full bg-transparent px-1 py-2.5 pb-2.5 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none resize-none leading-relaxed",
                      isInternalNote && "placeholder:text-amber-700/50 dark:placeholder:text-amber-400/50"
                    )}
                  />

                  {/* Right Side: Attach Menu */}
                  <input type="file" id="file-upload" hidden onChange={handleFileChange} />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded-full p-2.5 text-muted-foreground hover:text-foreground mb-0.5 shrink-0 transition-colors" title="Anexos e Ações">
                        <Paperclip className="h-5 w-5 -rotate-45" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" sideOffset={16}>
                      <DropdownMenuItem asChild>
                        <label htmlFor="file-upload" className="cursor-pointer flex items-center w-full">
                          <ImageIcon className="mr-2 h-4 w-4 text-blue-500" />
                          Galeria / Arquivo
                        </label>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />

                      <DropdownMenuItem onClick={() => setText(prev => prev.startsWith('/') ? prev : '/' + prev)}>
                        <MessageSquarePlus className="mr-2 h-4 w-4 text-violet-500" />
                        Mensagens Rápidas
                      </DropdownMenuItem>
                      
                      {conv.channel === 'whatsapp' && (
                        <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
                          <LayoutTemplate className="mr-2 h-4 w-4 text-emerald-500" />
                          Enviar Template
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem onClick={() => setIsInternalNote(!isInternalNote)}>
                        <FileText className={cn("mr-2 h-4 w-4", isInternalNote ? "text-amber-500" : "text-amber-500")} />
                        {isInternalNote ? "Desativar Nota Interna" : "Nota Interna"}
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => fixTextMutation.mutate(text)}
                        disabled={!text.trim()}
                      >
                        <Sparkles className="mr-2 h-4 w-4 text-sky-500" />
                        Corrigir texto com IA
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* We can include quick messages popover invisibly or tied to the trigger above */}
                  <Popover open={quickMsgItems.items.length > 0} onOpenChange={() => {}}>
                    <PopoverTrigger className="sr-only" />
                    <PopoverContent 
                      side="top" 
                      align="start" 
                      className="w-80 p-0 shadow-lg border-border"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onCloseAutoFocus={(e) => {
                        e.preventDefault();
                        document.getElementById('chat-input')?.focus();
                      }}
                    >
                      <div className="max-h-[300px] overflow-y-auto p-1 relative">
                        {quickMsgItems.items.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">Nenhum atalho encontrado.</div>
                        )}
                        {quickMsgItems.items.map((item) => {
                          if (item.type === 'header') {
                            return (
                              <div 
                                key={`header-${item.id}`}
                                onClick={() => {
                                  if (item.folderId) {
                                    setExpandedFolders(prev => {
                                      const next = new Set(prev);
                                      if (next.has(item.folderId)) next.delete(item.folderId);
                                      else next.add(item.folderId);
                                      return next;
                                    });
                                  }
                                }}
                                className={cn(
                                  "px-2 py-1.5 mt-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/50 sticky top-0 backdrop-blur-md z-10 flex items-center justify-between rounded-sm",
                                  item.folderId ? "cursor-pointer hover:bg-muted/80 transition-colors" : ""
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  {item.folderId === null ? <MessageSquarePlus className="h-3 w-3" /> : (item.isExpanded ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />)}
                                  {item.name}
                                </div>
                              </div>
                            );
                          }

                          const { qm, index } = item;
                          return (
                            <div
                              key={qm.id}
                              onClick={() => {
                                insertQuickMessage(qm);
                                setQuickMsgIndex(0);
                              }}
                              className={cn(
                                "flex flex-col items-start gap-1 p-2 cursor-pointer rounded-sm mb-0.5", 
                                index === quickMsgIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 text-foreground"
                              )}
                            >
                              <div className="flex items-center gap-2 w-full">
                                <span className="font-semibold text-xs flex-1 truncate">{qm.name || "Mensagem sem nome"}</span>
                                <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{qm.shortcut}</span>
                                {qm.media_url && (
                                  <span className="shrink-0 text-muted-foreground ml-1">
                                    {qm.media_type === 'image' ? <ImageIcon className="h-3 w-3" /> :
                                     qm.media_type === 'audio' ? <Headphones className="h-3 w-3" /> :
                                     qm.media_type === 'video' ? <Video className="h-3 w-3" /> :
                                     <Paperclip className="h-3 w-3" />}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground line-clamp-1">{qm.content || "Contém apenas anexo"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                </div>

                {/* Outside Pill: Send / Mic */}
                {(text.trim() || selectedFile) ? (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={send.isPending}
                    className={cn(
                      "mb-0.5 rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all",
                      isInternalNote && "bg-amber-500 hover:bg-amber-600 text-amber-950"
                    )}
                  >
                    <Send className="h-5 w-5 ml-1" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "mb-0.5 rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all",
                      isInternalNote && "bg-amber-500 hover:bg-amber-600 text-amber-950"
                    )}
                    onClick={startRecording}
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between flex-1 bg-destructive/10 text-destructive px-4 py-2 rounded-md border border-destructive/20 h-[40px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
                  <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 hover:bg-destructive/20 hover:text-destructive text-destructive/80" onClick={cancelRecording}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 px-3 bg-destructive hover:bg-destructive/90 text-white" onClick={stopRecording}>
                    <Send className="h-3 w-3 mr-1" />
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeCompanyId && conv.whatsapp_instance_id && (
        <WhatsappTemplateSender 
          open={templateDialogOpen} 
          onOpenChange={setTemplateDialogOpen} 
          companyId={activeCompanyId} 
          instanceId={conv.whatsapp_instance_id} 
          onSend={async (payload) => {
            await send.mutateAsync({ 
              content: JSON.stringify(payload), 
              mediaType: "template" 
            });
          }}
          isSending={send.isPending}
        />
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="break-all">{value}</div>
    </div>
  );
}

function FormattedText({ text, mine }: { text: string, mine?: boolean }) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*|_{1}[^_]+_{1}|~[^~]+~|https?:\/\/[^\s]+)/g);
  
  const firstUrlMatch = text.match(/https?:\/\/[^\s]+/);
  let firstUrl = firstUrlMatch ? firstUrlMatch[0] : null;
  if (firstUrl) {
    firstUrl = firstUrl.replace(/[*_~.)\]>]+$/, '');
  }

  return (
    <div className="whitespace-pre-wrap break-words flex flex-col gap-1">
      {firstUrl && <LinkPreview url={firstUrl} mine={mine} />}
      <div>
        {parts.map((part, i) => {
          if (part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
          if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
          if (part.startsWith('~') && part.endsWith('~')) return <del key={i}>{part.slice(1, -1)}</del>;
          if (part.match(/^https?:\/\//)) {
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 font-medium opacity-90 hover:opacity-100">
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const openMediaInNewTab = (mediaUrl: string) => {
  if (!mediaUrl) return;
  
  if (mediaUrl.startsWith('data:')) {
    try {
      const [header, base64] = mediaUrl.split(',');
      const mimeString = header.split(':')[1].split(';')[0];
      
      const byteCharacters = atob(base64);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      console.error("Failed to open data URI in new tab", e);
      window.open(mediaUrl, '_blank');
    }
  } else {
    window.open(mediaUrl, '_blank');
  }
};

function PdfViewer({ url }: { url: string }) {
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    if (!url) return;
    if (url.startsWith("data:")) {
      try {
        const [header, base64] = url.split(',');
        const mimeString = header.split(':')[1].split(';')[0];
        
        const byteCharacters = atob(base64);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
          const slice = byteCharacters.slice(offset, offset + 512);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          byteArrays.push(byteArray);
        }
        
        const blob = new Blob(byteArrays, { type: mimeString });
        const newUrl = URL.createObjectURL(blob);
        setBlobUrl(newUrl);
        return () => URL.revokeObjectURL(newUrl);
      } catch (e) {
        console.error("Failed to parse data URI", e);
        setBlobUrl(url);
      }
    } else {
      setBlobUrl(url);
    }
  }, [url]);

  if (!blobUrl) return <div className="flex items-center justify-center h-full p-10 text-muted-foreground">Carregando PDF...</div>;

  return <iframe src={blobUrl} className="w-full h-full rounded-md border-0 min-h-[70vh]" title="PDF Viewer" />;
}

function MessageBubble({ m, isGroup, onReact, onReply, onEdit, onDelete, onTranscribe, isTranscribingId }: { m: MessageRow, isGroup?: boolean, onReact?: (emoji: string) => void, onReply?: (m: MessageRow) => void, onEdit?: (m: MessageRow) => void, onDelete?: (m: MessageRow) => void, onTranscribe?: (id: string) => void, isTranscribingId?: string | null }) {
  if (m.sender_type === "system") {
    const SYSTEM_LABELS: Record<string, string> = {
      "SYSTEM_FOLLOW_UP_1": "🤖 IA enviou follow-up automático (1º aviso)",
      "SYSTEM_FOLLOW_UP_2": "🤖 IA enviou follow-up automático (2º aviso)",
      "SYSTEM_RESOLVE_INACTIVE": "🤖 IA encerrou por inatividade do cliente",
    };
    const rawContent = m.content || "";
    // Check for known instruction codes inside the content
    const matchedKey = Object.keys(SYSTEM_LABELS).find((k) => rawContent.includes(k));
    const displayContent = matchedKey ? SYSTEM_LABELS[matchedKey] : rawContent;
    return (
      <div className="flex justify-center my-4 w-full">
        <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs px-4 py-1.5 rounded-full text-center border border-amber-200 dark:border-amber-800/50 font-medium">
          {displayContent}
        </div>
      </div>
    );
  }

  const mine = m.sender_type === "agent";
  const isInternal = m.is_internal;
  
  let senderName = null;
  let displayContent = m.content || "";

  if (isGroup && m.sender_type === "contact") {
    const match = displayContent.match(/^(.+?):\n([\s\S]*)$/);
    if (match) {
      senderName = match[1];
      displayContent = match[2];
    }
  } else if (mine) {
    if (m.profiles?.name) {
      senderName = m.profiles.name;
    } else if (m.metadata?.ai_agent_name) {
      senderName = m.metadata.ai_agent_name;
    }
    
    // Check if user has signature enabled (it would be manually inserted as *Name*:\n...)
    const hasSignature = displayContent.match(/^\*(.+?)\*:\s*([\s\S]*)$/);
    if (hasSignature) {
      // Strip signature visually so it doesn't duplicate the header
      displayContent = hasSignature[2];
      if (!senderName) {
        senderName = hasSignature[1];
      }
    }
  }
  
  const isSticker = displayContent === "🖼️ Figurinha";

  const adReply = m.metadata?.externalAdReply;

  return (
    <div className={cn("flex relative", mine ? "justify-end" : "justify-start")} id={`msg-${m.id}`}>
      <div
        className={cn(
          "max-w-[70%] flex flex-col rounded-2xl px-3.5 py-2 text-sm shadow-sm relative group",
          mine
            ? (isInternal ? "rounded-br-sm bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800/50" : "rounded-br-sm bg-primary text-primary-foreground")
            : "rounded-bl-sm bg-card text-foreground border border-border",
          m.is_deleted && "opacity-60",
          m.isOptimistic && "opacity-70"
        )}
      >
        {isInternal && (
          <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            <FileText className="h-3 w-3" />
            Nota Interna
          </div>
        )}
        {senderName && (
          <div className={cn(
            "mb-1 text-xs font-bold",
            mine ? (isInternal ? "text-amber-700 dark:text-amber-300" : "text-primary-foreground/90") : "text-primary/80 dark:text-primary/90"
          )}>
            {senderName}
          </div>
        )}
        {onReact && !m.isOptimistic && !m.is_deleted && (
          <div className={cn(
            "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 p-0.5 rounded-full bg-background border border-border shadow-sm text-muted-foreground z-10",
            mine ? "-left-20" : "-right-20"
          )}>
            {onReply && (
              <button 
                onClick={() => onReply(m)}
                className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors"
                title="Responder"
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {onEdit && mine && m.media_type === "text" && m.remote_msg_id && (
              <button 
                onClick={() => onEdit(m)}
                className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && mine && m.remote_msg_id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button 
                    className="hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-full transition-colors"
                    title="Apagar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar Mensagem</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deseja realmente apagar esta mensagem para todos? Esta ação não pode ser desfeita e a mensagem será removida do WhatsApp do cliente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(m)} className="bg-red-500 hover:bg-red-600">
                      Apagar para todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button className="hover:text-foreground hover:bg-accent p-1.5 rounded-full transition-colors" title="Reagir">
                  <SmilePlus className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2 flex gap-1 rounded-full shadow-lg border-border">
                {QUICK_EMOJIS.map(e => (
                  <button 
                    key={e} 
                    onClick={() => onReact(e)} 
                    className="hover:bg-accent rounded-full p-2 text-xl transition-transform hover:scale-125"
                  >
                    {e}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}

        {m.quoted_content && !m.is_deleted && (
          <div 
            className="mb-2 rounded bg-black/10 dark:bg-white/10 p-2 text-xs border-l-4 opacity-90 border-l-current cursor-pointer hover:opacity-100 transition-opacity"
            onClick={() => {
              if (m.quoted_message_id) {
                const el = document.getElementById(`msg-${m.quoted_message_id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-primary/20', 'transition-colors', 'duration-500');
                  setTimeout(() => el.classList.remove('bg-primary/20', 'transition-colors', 'duration-500'), 2000);
                }
              }
            }}
          >
            <span className="font-semibold flex items-center gap-1 mb-0.5 text-[10px] uppercase opacity-70">
              <CornerUpLeft className="h-3 w-3" />
              Mensagem Respondida
            </span>
            <span className="line-clamp-3 opacity-90">{m.quoted_content}</span>
          </div>
        )}

        {adReply && !m.is_deleted && (
          <div className="mb-2 w-full max-w-sm rounded-lg border border-border/60 bg-black/5 dark:bg-white/5 overflow-hidden">
            {adReply.thumbnailURL ? (
              <a href={adReply.sourceURL || '#'} target="_blank" rel="noopener noreferrer" className="block relative h-40 w-full bg-black/10 dark:bg-white/5 overflow-hidden flex items-center justify-center group/ad">
                {/* Blurred background for aspect ratio differences */}
                <div 
                  className="absolute inset-0 w-full h-full bg-cover bg-center blur-sm opacity-40 scale-110 transition-transform group-hover/ad:scale-125" 
                  style={{ backgroundImage: `url(${adReply.thumbnailURL})` }} 
                />
                <img src={adReply.thumbnailURL} alt="Ad Thumbnail" className="relative z-10 w-full h-full object-contain drop-shadow-md transition-transform group-hover/ad:scale-105" />
                <div className="absolute top-2 left-2 z-20 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                  Anúncio
                </div>
              </a>
            ) : (
              <div className="bg-black/60 text-white text-[10px] font-bold px-2 py-1 flex justify-between items-center w-full">
                <span>Anúncio</span>
                {adReply.sourceApp && <span className="capitalize">{adReply.sourceApp}</span>}
              </div>
            )}
            <div className="p-2.5">
              <h4 className="font-bold text-xs truncate mb-1">{adReply.title || "Anúncio do Meta"}</h4>
              {adReply.body && (
                <p className="text-[11px] opacity-80 line-clamp-3 whitespace-pre-wrap">{adReply.body}</p>
              )}
            </div>
          </div>
        )}

        {m.media_type === "image" && m.media_url ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-w-[200px] cursor-pointer rounded-lg hover:opacity-90 transition-opacity" 
                />
              </DialogTrigger>
              <DialogContent className="max-w-3xl p-6 flex flex-col items-center justify-center">
                <img 
                  src={m.media_url} 
                  alt={displayContent || "Imagem recebida"} 
                  className="max-h-[75vh] w-auto rounded-md object-contain shadow-sm" 
                />
              </DialogContent>
            </Dialog>
            {displayContent && displayContent !== "📷 Imagem" && displayContent !== "🖼️ Figurinha" && (
              <div className="mt-2"><FormattedText text={displayContent} mine={mine} /></div>
            )}
          </div>
        ) : m.media_type === "audio" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <audio controls src={m.media_url} className="h-12 w-[260px]" />
            {m.transcription ? (
              <div className="mt-1 pt-1 border-t border-border/50 text-xs italic flex flex-col gap-0.5 w-[260px] opacity-90">
                <span className="flex items-center gap-1 font-semibold text-[10px] text-primary">
                  <Sparkles className="h-3 w-3" /> Transcrição Automática
                </span>
                <span className="whitespace-pre-wrap leading-tight">{m.transcription}</span>
              </div>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-1 h-6 text-[10px] w-[260px] border border-border/50 bg-background/50 text-muted-foreground hover:text-primary"
                onClick={() => onTranscribe?.(m.id)}
                disabled={isTranscribingId === m.id}
              >
                {isTranscribingId === m.id ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                Transcrever Áudio
              </Button>
            )}
            {displayContent && displayContent !== "🎵 Áudio" && <div className="text-xs"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.media_type === "video" && m.media_url ? (
          <div className="mb-2 flex flex-col gap-1">
            <video controls src={m.media_url} className="max-w-[200px] rounded-lg" />
            {displayContent && displayContent !== "🎥 Vídeo" && <div className="text-xs"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.media_type === "document" ? (
          <div className="mb-2">
            <Dialog>
              <DialogTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border max-w-[260px] transition-opacity",
                    m.media_url ? "hover:opacity-90 cursor-pointer" : "cursor-default opacity-90",
                    mine ? "bg-black/10 dark:bg-white/10 border-transparent" : "bg-muted/80 border-border"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-500 text-white shadow-sm">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="truncate text-sm font-semibold leading-tight">{displayContent || "Documento"}</p>
                    <p className={cn("mt-1 truncate text-[10px] font-medium uppercase opacity-70")}>
                      {m.media_url ? "Documento PDF" : "Documento (sem arquivo)"}
                    </p>
                  </div>
                </div>
              </DialogTrigger>
              {m.media_url && (
                <DialogContent className="max-w-4xl p-0 bg-white dark:bg-zinc-900 border-none shadow-xl flex flex-col h-[85vh]">
                  <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-sm font-semibold truncate pr-4 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-red-500" />
                      {displayContent || "Documento.pdf"}
                    </h2>
                    <a 
                      href={m.media_url} 
                      download={displayContent || "Documento.pdf"}
                      onClick={(e) => {
                        // Se for base64, o download direto pode falhar em alguns cenários, mas como é atributo download, deve funcionar.
                      }}
                      className="text-sm text-blue-500 hover:underline px-4 font-medium"
                    >
                      Baixar
                    </a>
                  </div>
                  <div className="flex-1 w-full relative bg-muted/30">
                    <PdfViewer url={m.media_url} />
                  </div>
                </DialogContent>
              )}
            </Dialog>
          </div>
        ) : m.metadata?.type === "call" ? (
          <div className="mb-1 flex flex-col gap-1 w-full max-w-[280px]">
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border w-full",
                mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-card text-foreground"
              )}
            >
              <div 
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm",
                  m.metadata.status === "missed" && m.metadata.direction === "incoming" 
                    ? "bg-red-500/10 text-red-500" 
                    : mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                )}
              >
                {m.metadata.direction === "incoming" ? (
                  m.metadata.status === "missed" ? (
                    <PhoneMissed className="h-5 w-5" />
                  ) : (
                    <PhoneIncoming className="h-5 w-5" />
                  )
                ) : (
                  <PhoneOutgoing className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-left">
                  {m.metadata.direction === "incoming" 
                    ? (m.metadata.status === "missed" ? "Ligação de voz perdida" : "Ligação de voz")
                    : (m.metadata.status === "missed" ? "Ligação de voz não atendida" : "Ligação de voz")
                  }
                </p>
                <p className={cn("mt-1 text-[11px] opacity-75 font-normal leading-none text-left")}>
                  {m.metadata.status === "completed" && m.metadata.duration !== undefined && m.metadata.duration !== null ? (
                    `Duração: ${(() => {
                      const secs = Number(m.metadata.duration);
                      const min = Math.floor(secs / 60);
                      const sec = secs % 60;
                      return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
                    })()}`
                  ) : (
                    "Retorne as ligações no seu celular"
                  )}
                </p>
              </div>
            </div>

            {/* Se houver gravação da ligação (media_url ou metadata.recording_url) */}
            {(m.media_url || m.metadata.recording_url) && (
              <div className={cn(
                "p-2.5 rounded-lg border mt-1 flex flex-col gap-1.5 w-full",
                mine ? "border-transparent bg-black/10 dark:bg-white/10" : "border-border bg-muted/30"
              )}>
                <audio 
                  controls 
                  src={m.media_url || m.metadata.recording_url} 
                  className="h-9 w-full max-w-[260px] scale-95 origin-left" 
                />
                
                {m.transcription ? (
                  <div className="mt-1.5 pt-1.5 border-t border-border/50 text-xs italic flex flex-col gap-1 opacity-95 text-left w-full">
                    <span className="flex items-center gap-1 font-semibold text-[10px] text-primary">
                      <Sparkles className="h-3 w-3" /> Transcrição Automática
                    </span>
                    <span className="whitespace-pre-wrap leading-tight text-[11px] font-medium">{m.transcription}</span>
                  </div>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] w-full border border-border/40 bg-background/40 hover:bg-background/80 text-muted-foreground hover:text-primary mt-1"
                    onClick={() => onTranscribe?.(m.id)}
                    disabled={isTranscribingId === m.id}
                  >
                    {isTranscribingId === m.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3 w-3" />
                    )}
                    Transcrever Gravação
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : m.metadata?.location ? (
          <div className="mb-1">
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${m.metadata.location.lat},${m.metadata.location.lng}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "mt-1 flex flex-col overflow-hidden rounded-md border transition-opacity hover:opacity-90 group w-full sm:w-[350px]",
                mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border/50 bg-card/50 text-foreground"
              )}
            >
              {m.metadata.location.thumbnail && (
                <div className="h-40 w-full overflow-hidden bg-black/5">
                  <img src={`data:image/jpeg;base64,${m.metadata.location.thumbnail}`} alt="Mapa" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </div>
              )}
              <div className="flex flex-col p-3 text-left">
                <span className="font-semibold text-sm mb-1 truncate">{m.metadata.location.name || "Localização"}</span>
                <span className={cn(
                  "text-xs mb-2 truncate opacity-90",
                  mine ? "text-white/80" : "text-muted-foreground"
                )}>{m.metadata.location.address || "Ver no mapa"}</span>
                
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] opacity-70 mt-1",
                  mine ? "text-white/70" : "text-muted-foreground"
                )}>
                  <MapPin className="h-3 w-3" />
                  <span>Google Maps</span>
                </div>
              </div>
            </a>
            {displayContent && displayContent !== "📍 Localização recebida" && <div className="text-xs mt-2"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.metadata?.contacts ? (
          <div className="mb-1 flex flex-col gap-2">
            {m.metadata.contacts.map((contact: any, i: number) => (
              <div 
                key={i}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border max-w-[260px]",
                  mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-background text-foreground"
                )}
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm overflow-hidden", mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}>
                  {contact.photo ? (
                    <img src={`data:image/jpeg;base64,${contact.photo}`} alt={contact.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="font-semibold text-[13px] leading-tight truncate">{contact.name || "Contato"}</span>
                  {(contact.phone || contact.waid) && (
                    <div className="flex flex-col items-start gap-1.5 mt-0.5">
                      <a 
                        href={`https://wa.me/${contact.waid || (contact.phone || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer" 
                        className="text-[11px] opacity-70 truncate hover:underline"
                      >
                        {contact.phone || contact.waid}
                      </a>
                      <NewConversationDialog 
                        initialPhone={contact.waid || (contact.phone || '').replace(/\D/g, '')}
                        trigger={
                          <Button size="sm" variant="secondary" className={cn("h-6 text-[10px] px-2 w-fit", mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-primary/10 text-primary hover:bg-primary/20")}>
                            <MessageSquarePlus className="h-3 w-3 mr-1.5" />
                            Iniciar Conversa
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {displayContent && displayContent !== "👤 Contato(s) recebido(s)" && <div className="text-xs mt-1"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : m.metadata?.poll ? (
          <div className="mb-1 flex flex-col gap-2">
            <div className={cn(
              "p-3 rounded-lg border min-w-[200px] max-w-[280px]",
              mine ? "border-transparent bg-black/10 dark:bg-white/10 text-white" : "border-border bg-background text-foreground"
            )}>
              <div className="flex items-start gap-2.5 mb-3 pb-3 border-b border-border/20">
                <div className={cn("p-1.5 rounded-full shrink-0", mine ? "bg-white/20 text-white" : "bg-primary/10 text-primary")}>
                  <List className="h-4 w-4" />
                </div>
                <span className="font-semibold text-[13px] leading-snug break-words mt-0.5">{m.metadata.poll.name}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {m.metadata.poll.options?.map((opt: string, i: number) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-[13px] border transition-colors",
                    mine ? "bg-black/20 border-white/10 hover:bg-black/30" : "bg-muted/50 border-border/50 hover:bg-muted"
                  )}>
                    <div className="h-3.5 w-3.5 rounded-full border border-current opacity-40 shrink-0" />
                    <span className="truncate opacity-90">{opt}</span>
                  </div>
                ))}
              </div>
            </div>
            {displayContent && !displayContent.startsWith("📊 Enquete:") && <div className="text-xs mt-1"><FormattedText text={displayContent} mine={mine} /></div>}
          </div>
        ) : (
          <FormattedText text={displayContent} mine={mine} />
        )}

        {m.is_deleted && (
          <div className={cn(
            "mt-1.5 pt-1.5 border-t text-xs flex items-center gap-1.5 italic opacity-80",
            mine ? "border-primary-foreground/20" : "border-border"
          )}>
            <span className="text-[14px]">🚫</span>
            Mensagem apagada
          </div>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
            mine ? (isInternal ? "text-amber-700/70 dark:text-amber-300/70" : "text-primary-foreground/70") : "text-muted-foreground",
          )}
        >
          {m.is_edited && <span className="italic">Editado</span>}
          <span>{formatMessageTime(m.created_at)}</span>
        </div>
        
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className="absolute -bottom-3 right-2 flex gap-1 bg-background border border-border rounded-full px-1.5 py-0.5 text-xs shadow-sm">
            {Object.entries(m.reactions).map(([emoji, count]) => (
              <span key={emoji}>{emoji} {count > 1 ? count : ''}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
