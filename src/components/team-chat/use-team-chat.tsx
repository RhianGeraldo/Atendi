import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { InternalChannel, InternalMessage, TeamMember } from "./team-chat-types";
import { markMessageAsSentByMe } from "@/lib/hooks/use-global-notifications";
import { showStackedMessageToast } from "@/components/common/stacked-message-toast";

// Disparador de Notificação Nativa do Navegador (Web Notification API)
function notifyBrowser({
  title,
  body,
  icon,
  onClick,
}: {
  title: string;
  body: string;
  icon?: string | null;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(title, {
      body,
      icon: icon || "/favicon.ico",
      badge: "/favicon.ico",
      tag: "atendi-team-message",
    });

    notif.onclick = () => {
      try {
        window.focus();
      } catch {}
      if (onClick) onClick();
      notif.close();
    };
  } catch (e) {
    console.error("[Notification] Erro ao disparar notificação:", e);
  }
}

interface UseTeamChatOptions {
  onSelectChannel?: (channelId: string) => void;
}

export function useTeamChat(
  activeChannelId: string | null,
  options?: UseTeamChatOptions
) {
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = activeCompanyId || profile?.company_id;
  const isAdmin = profile?.role === "admin_company" || profile?.role === "super_admin";

  // Ref para activeChannelId para callbacks sem reiniciar o canal de realtime
  const activeChannelIdRef = useRef<string | null>(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // Ref para o canal Realtime da empresa
  const channelRtRef = useRef<any>(null);

  // IDs detectados via Supabase Realtime Presence
  const [presenceOnlineIds, setPresenceOnlineIds] = useState<string[]>([]);

  // Heartbeat do usuário logado: mantém status online: true no banco de dados e CRM
  useEffect(() => {
    if (!profile?.id) return;
    const markOnline = () => {
      supabase
        .from("profiles")
        .update({ online: true, last_seen_at: new Date().toISOString() })
        .eq("id", profile.id)
        .then();
    };

    markOnline();
    const heartbeat = setInterval(markOnline, 40000);
    return () => clearInterval(heartbeat);
  }, [profile?.id]);

  // Estados do Indicador de Digitando (Typing Indicator)
  const [typingMap, setTypingMap] = useState<
    Record<string, { userName: string; channelId: string; timestamp: number }>
  >({});

  // Permissão de Notificações do Navegador
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    () => {
      if (typeof window !== "undefined" && "Notification" in window) {
        return Notification.permission;
      }
      return "default";
    }
  );

  // Solicitar permissão de Notificação do Navegador
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Notificações não são suportadas neste navegador.");
      return false;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === "granted") {
        toast.success("Notificações da área de trabalho ativadas com sucesso!");
        return true;
      } else {
        toast.info("Permissão de notificações não concedida.");
        return false;
      }
    } catch (err) {
      console.error("[Notification] Erro ao solicitar permissão:", err);
      return false;
    }
  }, []);

  // Limpeza periódica de usuários digitando (após 3.5s de inatividade)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        let changed = false;
        const next: typeof prev = {};
        Object.entries(prev).forEach(([uid, entry]) => {
          if (now - entry.timestamp < 3500) {
            next[uid] = entry;
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Lista dos nomes dos colegas digitando no canal ativo no momento
  const typingUserNames = useMemo(() => {
    if (!activeChannelId) return [];
    return Object.values(typingMap)
      .filter((entry) => entry.channelId === activeChannelId)
      .map((entry) => entry.userName);
  }, [typingMap, activeChannelId]);

  // Disparadores de Broadcast para Digitando
  const sendTyping = useCallback(() => {
    if (!activeChannelId || !profile?.id || !channelRtRef.current) return;
    try {
      channelRtRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: {
          userId: profile.id,
          userName: profile.name || "Colega",
          channelId: activeChannelId,
        },
      });
    } catch {}
  }, [activeChannelId, profile?.id, profile?.name]);

  const sendStopTyping = useCallback(() => {
    if (!activeChannelId || !profile?.id || !channelRtRef.current) return;
    try {
      channelRtRef.current.send({
        type: "broadcast",
        event: "stop_typing",
        payload: {
          userId: profile.id,
          channelId: activeChannelId,
        },
      });
    } catch {}
  }, [activeChannelId, profile?.id]);

  // 1. Unidades que o usuário tem acesso
  const { data: userUnits } = useQuery({
    queryKey: ["team-user-units", profile?.id],
    enabled: !!profile?.id && !isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_units")
        .select("unit_id")
        .eq("user_id", profile!.id);
      if (error) throw error;
      return data?.map((u: any) => u.unit_id) || [];
    },
  });

  // 2. Membros da equipe da empresa (para DMs e informações de perfil)
  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ["team-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, active, role, online, last_seen_at, user_units(unit_id, units(id, name))")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        avatar_url: p.avatar_url || null,
        role: p.role,
        active: p.active,
        online: Boolean(p.online),
        last_seen_at: p.last_seen_at || null,
        units: p.user_units?.map((uu: any) => uu.units).filter(Boolean) || [],
      }));
    },
  });

  // 3. Canais e DMs do usuário
  const { data: channels, isLoading: isLoadingChannels } = useQuery<InternalChannel[]>({
    queryKey: ["internal-channels", companyId, profile?.id, selectedUnitId],
    enabled: !!companyId && !!profile?.id,
    queryFn: async () => {
      // Busca os canais com relacionamentos
      const { data, error } = await (supabase as any)
        .from("internal_channels")
        .select(
          `id, company_id, unit_id, department_id, name, description, type, scope, avatar_url, created_by, is_announcement, last_message_preview, last_message_at, created_at, updated_at,
           unit:units(id, name, color),
           members:internal_channel_members(id, channel_id, user_id, role, last_read_at, unread_count, is_muted, profile:profiles(id, name, role, avatar_url, online, last_seen_at))`
        )
        .eq("company_id", companyId!)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      // Obtém unidades permitidas se não for admin
      let allowedUnits: string[] = [];
      if (!isAdmin && !profile?.has_matriz_access) {
        const { data: uData } = await supabase
          .from("user_units")
          .select("unit_id")
          .eq("user_id", profile!.id);
        allowedUnits = uData?.map((u: any) => u.unit_id) || [];
      }

      let list = (data || []) as unknown as InternalChannel[];

      // Formata DMs (identifica o outro usuário) e calcula não lidas para o usuário logado
      list = list.map((ch) => {
        const myMemberInfo = ch.members?.find((m) => m.user_id === profile?.id);
        const unreadCount = myMemberInfo?.unread_count || 0;

        let otherUser = null;
        if (ch.type === "direct") {
          const otherMember =
            ch.members?.find((m) => m.user_id !== profile?.id) ||
            ch.members?.find((m) => m.user_id === profile?.id);

          if (otherMember?.profile) {
            const memberMeta = teamMembers?.find((tm) => tm.id === otherMember.user_id);
            const isSelf = otherMember.user_id === profile?.id;
            otherUser = {
              id: otherMember.profile.id,
              name: otherMember.profile.name,
              avatar_url: (otherMember.profile as any).avatar_url || null,
              role: otherMember.profile.role,
              unit_name: memberMeta?.units?.[0]?.name || null,
              online: isSelf
                ? true
                : Boolean((otherMember.profile as any).online || memberMeta?.online),
            };
          }
        }

        return {
          ...ch,
          unread_count: unreadCount,
          other_user: otherUser,
        };
      });

      // Filtra por permissão se o usuário não for admin
      if (!isAdmin && !profile?.has_matriz_access) {
        list = list.filter((ch) => {
          if (ch.scope === "company") return true;
          if (ch.scope === "unit" && ch.unit_id && allowedUnits.includes(ch.unit_id)) return true;
          // Se for custom ou direct, deve ser membro explícito
          return ch.members?.some((m) => m.user_id === profile?.id);
        });
      }

      // Busca remetente da última mensagem de cada canal
      const channelIds = list.map((c) => c.id);
      if (channelIds.length > 0) {
        try {
          const { data: latestMsgs } = await (supabase as any)
            .from("internal_messages")
            .select("channel_id, sender_id, created_at")
            .in("channel_id", channelIds)
            .order("created_at", { ascending: false });

          if (latestMsgs && latestMsgs.length > 0) {
            const senderByChannel = new Map<string, string>();
            latestMsgs.forEach((m: any) => {
              if (!senderByChannel.has(m.channel_id)) {
                senderByChannel.set(m.channel_id, m.sender_id);
              }
            });

            list = list.map((ch) => ({
              ...ch,
              last_message_sender_id:
                senderByChannel.get(ch.id) || (ch as any).last_message_sender_id || null,
            }));
          }
        } catch {}
      }

      return list;
    },
  });

  // Lista consolidada de IDs de usuários online (Realtime Presence + Colaboradores logados no CRM)
  const onlineUserIds = useMemo(() => {
    const set = new Set<string>(presenceOnlineIds);
    // Usuário logado sempre está online
    if (profile?.id) set.add(profile.id);

    // Membros com online: true no CRM
    teamMembers?.forEach((tm) => {
      if ((tm as any).online) set.add(tm.id);
    });

    // Membros dos canais
    channels?.forEach((ch) => {
      ch.members?.forEach((m) => {
        if ((m.profile as any)?.online) set.add(m.user_id);
      });
      if (ch.other_user?.online && ch.other_user.id) {
        set.add(ch.other_user.id);
      }
    });

    return Array.from(set);
  }, [presenceOnlineIds, profile?.id, teamMembers, channels]);

  // Total de mensagens não lidas de toda a equipe
  const totalTeamUnread = (channels || []).reduce(
    (acc, curr) => acc + (curr.unread_count || 0),
    0
  );

  // 4. Mensagens do canal ativo
  const { data: messages, isLoading: isLoadingMessages } = useQuery<InternalMessage[]>({
    queryKey: ["internal-messages", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internal_messages")
        .select(
          `id, channel_id, sender_id, content, media_type, media_url, file_name, file_size, reply_to_id, metadata, is_edited, is_deleted, is_pinned, pinned_at, pinned_by, created_at, updated_at,
           sender:profiles!sender_id(id, name, role, avatar_url),
           reply_to:internal_messages!reply_to_id(id, content, sender:profiles!sender_id(name)),
           reactions:internal_message_reactions(id, message_id, user_id, emoji, created_at, profile:profiles(name))`
        )
        .eq("channel_id", activeChannelId!)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return (data || []).map((m: any) => {
        const pinUser = m.pinned_by ? teamMembers?.find((tm) => tm.id === m.pinned_by) : null;
        return {
          ...m,
          pinned_by_user: pinUser ? { id: pinUser.id, name: pinUser.name } : null,
          reply_to:
            m.reply_to_id && m.reply_to?.content
              ? {
                  id: m.reply_to.id,
                  content: m.reply_to.content,
                  sender_name: m.reply_to.sender?.name || null,
                }
              : null,
          reactions: m.reactions || [],
        };
      });
    },
  });

  // 5. Marcar canal como lido ao abrir
  const markAsRead = useCallback(
    async (channelId: string) => {
      if (!profile?.id || !channelId) return;

      // Zera no cache imediatamente
      qc.setQueryData<InternalChannel[]>(
        ["internal-channels", companyId, profile?.id, selectedUnitId],
        (old) => {
          if (!old) return old;
          return old.map((ch) =>
            ch.id === channelId
              ? { ...ch, unread_count: 0, has_mention: false, mention_count: 0 }
              : ch
          );
        }
      );

      // Atualiza no banco
      await (supabase as any)
        .from("internal_channel_members")
        .update({ unread_count: 0, last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", profile.id);
    },
    [profile?.id, qc, companyId, selectedUnitId]
  );

  // 6. Enviar mensagem
  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      mediaType = "text",
      mediaUrl = null,
      fileName = null,
      fileSize = null,
      replyToId = null,
    }: {
      content: string;
      mediaType?: "text" | "image" | "audio" | "video" | "document";
      mediaUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      replyToId?: string | null;
    }) => {
      if (!activeChannelId || !profile?.id) throw new Error("Sem canal ativo");

      // Extrai menções do texto (apenas para canais de grupo)
      const currentChannel = channels?.find((c) => c.id === activeChannelId);
      const isGroupChannel = currentChannel ? currentChannel.type !== "direct" : true;

      const mentionedUserIds: string[] = [];
      let hasAllMention = false;

      if (isGroupChannel) {
        const lowerText = content.toLowerCase();

        if (lowerText.includes("@todos") || lowerText.includes("@canal")) {
          hasAllMention = true;
        }

        if (teamMembers) {
          teamMembers.forEach((tm) => {
            if (tm.name && lowerText.includes(`@${tm.name.toLowerCase()}`)) {
              if (!mentionedUserIds.includes(tm.id)) {
                mentionedUserIds.push(tm.id);
              }
            }
          });
        }
      }

      const metadata = {
        mentions: mentionedUserIds,
        has_all_mention: hasAllMention,
      };

      const { data, error } = await (supabase as any)
        .from("internal_messages")
        .insert({
          channel_id: activeChannelId,
          sender_id: profile.id,
          content: content.trim(),
          media_type: mediaType,
          media_url: mediaUrl,
          file_name: fileName,
          file_size: fileSize,
          reply_to_id: replyToId,
          metadata,
        })
        .select(
          `id, channel_id, sender_id, content, media_type, media_url, file_name, file_size, reply_to_id, metadata, is_edited, is_deleted, created_at, updated_at,
           sender:profiles!sender_id(id, name, role, avatar_url)`
        )
        .single();

      if (error) throw error;
      if (data?.id) markMessageAsSentByMe(data.id);
      return data;
    },
    onSuccess: (newMsg) => {
      // Interrompe o indicador de digitando
      sendStopTyping();

      // Adiciona mensagem ao cache do canal
      qc.setQueryData<InternalMessage[]>(
        ["internal-messages", activeChannelId],
        (old) => {
          if (!old) return [newMsg];
          if (old.some((m) => m.id === newMsg.id)) return old;
          return [...old, newMsg];
        }
      );

      // Atualiza prévia do canal e reordena para o topo
      qc.setQueryData<InternalChannel[]>(
        ["internal-channels", companyId, profile?.id, selectedUnitId],
        (old) => {
          if (!old) return old;
          const updated = old.map((ch) =>
            ch.id === activeChannelId
              ? {
                  ...ch,
                  last_message_preview: newMsg.content || "Anexo",
                  last_message_sender_id: profile.id,
                  last_message_at: newMsg.created_at,
                }
              : ch
          );
          return updated.sort(
            (a, b) =>
              new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
        }
      );
    },
  });

  // Upload de arquivo para o bucket media
  const uploadFile = async (file: File) => {
    if (!companyId) throw new Error("Empresa não selecionada");
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `team-chat/${companyId}/${Date.now()}_${cleanFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from("media")
      .getPublicUrl(filePath);

    let mediaType: "image" | "audio" | "document" = "document";
    if (file.type.startsWith("image/")) mediaType = "image";
    else if (file.type.startsWith("audio/")) mediaType = "audio";

    return {
      url: publicData.publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mediaType,
    };
  };

  // Alternar reação de emoji em uma mensagem
  const toggleReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!profile?.id) throw new Error("Não autorizado");

      const { data: existing } = await (supabase as any)
        .from("internal_message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", profile.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        await (supabase as any)
          .from("internal_message_reactions")
          .delete()
          .eq("id", existing.id);
        return { action: "removed", messageId, emoji, userId: profile.id };
      } else {
        const { data: inserted, error } = await (supabase as any)
          .from("internal_message_reactions")
          .insert({
            message_id: messageId,
            user_id: profile.id,
            emoji,
          })
          .select("id, message_id, user_id, emoji, created_at")
          .single();
        if (error) throw error;
        return {
          action: "added",
          reaction: { ...inserted, profile: { name: profile.name } },
        };
      }
    },
    onSuccess: (result) => {
      qc.setQueryData<InternalMessage[]>(
        ["internal-messages", activeChannelId],
        (old) => {
          if (!old) return old;
          return old.map((m) => {
            const targetId = result.messageId || (result as any).reaction?.message_id;
            if (m.id !== targetId) return m;
            const current = m.reactions || [];
            if (result.action === "removed") {
              return {
                ...m,
                reactions: current.filter(
                  (r) => !(r.user_id === result.userId && r.emoji === result.emoji)
                ),
              };
            } else {
              return {
                ...m,
                reactions: [...current, (result as any).reaction],
              };
            }
          });
        }
      );
    },
  });

  // 7. Fixar / Desfixar Mensagem Importante (Pin)
  const togglePinMessage = useMutation({
    mutationFn: async ({ messageId, isPinned }: { messageId: string; isPinned: boolean }) => {
      if (!profile?.id) throw new Error("Não autorizado");
      const nextPinned = !isPinned;

      const { error } = await (supabase as any)
        .from("internal_messages")
        .update({
          is_pinned: nextPinned,
          pinned_at: nextPinned ? new Date().toISOString() : null,
          pinned_by: nextPinned ? profile.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;
      return {
        messageId,
        isPinned: nextPinned,
        pinnedBy: nextPinned ? profile.id : null,
        pinnedAt: nextPinned ? new Date().toISOString() : null,
      };
    },
    onSuccess: ({ messageId, isPinned, pinnedBy, pinnedAt }) => {
      qc.setQueryData<InternalMessage[]>(
        ["internal-messages", activeChannelId],
        (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_pinned: isPinned,
                  pinned_at: pinnedAt,
                  pinned_by: pinnedBy,
                  pinned_by_user: isPinned ? { id: profile!.id, name: profile!.name } : null,
                }
              : m
          );
        }
      );
      toast.success(isPinned ? "Mensagem fixada no canal 📌" : "Mensagem desfixada");
    },
    onError: (err: any) => {
      toast.error("Erro ao fixar/desfixar mensagem", {
        description: err?.message || "Tente novamente",
      });
    },
  });

  // 8. Editar Mensagem (autor)
  const editMessage = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!profile?.id) throw new Error("Não autorizado");
      const trimmed = content.trim();
      if (!trimmed) throw new Error("A mensagem não pode ficar vazia");

      const { error } = await (supabase as any)
        .from("internal_messages")
        .update({
          content: trimmed,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageId)
        .eq("sender_id", profile.id);

      if (error) throw error;
      return { messageId, content: trimmed };
    },
    onSuccess: ({ messageId, content }) => {
      qc.setQueryData<InternalMessage[]>(
        ["internal-messages", activeChannelId],
        (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content,
                  is_edited: true,
                  updated_at: new Date().toISOString(),
                }
              : m
          );
        }
      );
      toast.success("Mensagem editada com sucesso");
    },
    onError: (err: any) => {
      toast.error("Erro ao editar mensagem", {
        description: err?.message || "Tente novamente",
      });
    },
  });

  // 9. Apagar Mensagem (autor ou admin/gestor) - Soft delete
  const deleteMessage = useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      if (!profile?.id) throw new Error("Não autorizado");

      const { error } = await (supabase as any)
        .from("internal_messages")
        .update({
          is_deleted: true,
          is_pinned: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;
      return { messageId };
    },
    onSuccess: ({ messageId }) => {
      qc.setQueryData<InternalMessage[]>(
        ["internal-messages", activeChannelId],
        (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted: true,
                  is_pinned: false,
                  updated_at: new Date().toISOString(),
                }
              : m
          );
        }
      );
      toast.success("Mensagem apagada");
    },
    onError: (err: any) => {
      toast.error("Erro ao apagar mensagem", {
        description: err?.message || "Tente novamente",
      });
    },
  });

  // 10. Criar ou Obter Canal Direto (DM) com um colega
  const getOrCreateDirectChannel = async (targetUserId: string) => {
    if (!profile?.id || !companyId) return null;

    // 1. Procura no cache se já existe uma DM entre esses dois usuários
    const existing = channels?.find(
      (c) =>
        c.type === "direct" &&
        c.members?.some((m) => m.user_id === targetUserId)
    );

    if (existing) {
      return existing.id;
    }

    // 2. Consulta no banco se já existe canal compartilhado entre ambos
    const { data: myMemberships } = await (supabase as any)
      .from("internal_channel_members")
      .select("channel_id")
      .eq("user_id", profile.id);

    if (myMemberships && myMemberships.length > 0) {
      const channelIds = myMemberships.map((m: any) => m.channel_id);
      const { data: commonMemberships } = await (supabase as any)
        .from("internal_channel_members")
        .select("channel_id")
        .eq("user_id", targetUserId)
        .in("channel_id", channelIds);

      if (commonMemberships && commonMemberships.length > 0) {
        const commonIds = commonMemberships.map((m: any) => m.channel_id);
        const { data: directCh } = await (supabase as any)
          .from("internal_channels")
          .select("id")
          .eq("type", "direct")
          .in("id", commonIds)
          .maybeSingle();

        if (directCh?.id) {
          await qc.invalidateQueries({ queryKey: ["internal-channels"] });
          return directCh.id;
        }
      }
    }

    // 3. Cria um novo canal direto
    const { data: newChannel, error: chError } = await (supabase as any)
      .from("internal_channels")
      .insert({
        company_id: companyId,
        type: "direct",
        scope: "direct",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (chError) {
      console.error("[getOrCreateDirectChannel] Erro ao criar canal:", chError);
      throw chError;
    }

    // Adiciona os dois usuários como membros
    const { error: memError } = await (supabase as any).from("internal_channel_members").insert([
      { channel_id: newChannel.id, user_id: profile.id, role: "admin" },
      { channel_id: newChannel.id, user_id: targetUserId, role: "member" },
    ]);

    if (memError) {
      console.error("[getOrCreateDirectChannel] Erro ao adicionar membros:", memError);
      throw memError;
    }

    await qc.invalidateQueries({ queryKey: ["internal-channels"] });
    return newChannel.id;
  };

  // 11. Criar Novo Canal / Grupo
  const createChannel = async ({
    name,
    description,
    scope,
    unitId,
    memberIds,
    isAnnouncement = false,
  }: {
    name: string;
    description?: string;
    scope: "company" | "unit" | "custom";
    unitId?: string | null;
    memberIds?: string[];
    isAnnouncement?: boolean;
  }) => {
    if (!profile?.id || !companyId) throw new Error("Não autorizado");

    const { data: newChannel, error: chError } = await (supabase as any)
      .from("internal_channels")
      .insert({
        company_id: companyId,
        name: name.trim(),
        description: description?.trim() || null,
        type: "group",
        scope,
        unit_id: scope === "unit" ? unitId : null,
        is_announcement: isAnnouncement,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (chError) throw chError;

    // Adiciona o criador como admin
    const membersToInsert = [
      { channel_id: newChannel.id, user_id: profile.id, role: "admin" },
    ];

    if (memberIds && memberIds.length > 0) {
      memberIds.forEach((uid) => {
        if (uid !== profile.id) {
          membersToInsert.push({
            channel_id: newChannel.id,
            user_id: uid,
            role: "member",
          });
        }
      });
    }

    await (supabase as any)
      .from("internal_channel_members")
      .insert(membersToInsert);

    await qc.invalidateQueries({ queryKey: ["internal-channels"] });
    return newChannel.id;
  };

  // Refs de sincronização para garantir canal de Realtime 100% estável e persistente
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const teamMembersRef = useRef(teamMembers);
  teamMembersRef.current = teamMembers;

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const markAsReadRef = useRef(markAsRead);
  markAsReadRef.current = markAsRead;

  const selectedUnitIdRef = useRef(selectedUnitId);
  selectedUnitIdRef.current = selectedUnitId;

  // 9. Realtime Subscriptions (Presença, Digitando, Mensagens e Notificações)
  useEffect(() => {
    if (!companyId || !profile?.id) return;

    const channelRt = supabase
      .channel(`team-chat-realtime-${companyId}`, {
        config: {
          presence: {
            key: profile.id,
          },
        },
      })
      // Rastreamento de Presença Online via Supabase Presence
      .on("presence", { event: "sync" }, () => {
        const state = channelRt.presenceState();
        const found = new Set<string>();
        Object.entries(state).forEach(([key, presences]: [string, any]) => {
          if (key) found.add(key);
          if (Array.isArray(presences)) {
            presences.forEach((p: any) => {
              if (p?.user_id) found.add(p.user_id);
              if (p?.id) found.add(p.id);
            });
          }
        });
        setPresenceOnlineIds(Array.from(found));
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        setPresenceOnlineIds((prev) => {
          const newIds = newPresences.map((p: any) => p.user_id || p.key || p.id).filter(Boolean);
          return Array.from(new Set([...prev, ...newIds]));
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        const leftIds = new Set(leftPresences.map((p: any) => p.user_id || p.key || p.id));
        setPresenceOnlineIds((prev) => prev.filter((id) => !leftIds.has(id)));
      })
      // Escuta mudanças de status de colaboradores (login/logout no CRM)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updated = payload.new as any;
          if (updated?.id) {
            qc.setQueryData<TeamMember[]>(["team-members", companyId], (old) => {
              if (!old) return old;
              return old.map((m) =>
                m.id === updated.id
                  ? { ...m, online: Boolean(updated.online), last_seen_at: updated.last_seen_at }
                  : m
              );
            });
            qc.setQueryData<InternalChannel[]>(
              ["internal-channels", companyId, profile?.id, selectedUnitId],
              (old) => {
                if (!old) return old;
                return old.map((ch) => ({
                  ...ch,
                  members: ch.members?.map((mem) =>
                    mem.user_id === updated.id
                      ? {
                          ...mem,
                          profile: mem.profile
                            ? { ...mem.profile, online: Boolean(updated.online) }
                            : mem.profile,
                        }
                      : mem
                  ),
                  other_user:
                    ch.other_user?.id === updated.id
                      ? { ...ch.other_user, online: Boolean(updated.online) }
                      : ch.other_user,
                }));
              }
            );
          }
        }
      )
      // Broadcast: Indicador de Digitando (Typing Indicator)
      .on("broadcast", { event: "typing" }, (payload) => {
        const data = payload.payload as { userId: string; userName: string; channelId: string };
        if (!data?.userId || data.userId === profile.id) return;
        setTypingMap((prev) => ({
          ...prev,
          [data.userId]: {
            userName: data.userName,
            channelId: data.channelId,
            timestamp: Date.now(),
          },
        }));
      })
      .on("broadcast", { event: "stop_typing" }, (payload) => {
        const data = payload.payload as { userId: string; channelId: string };
        if (!data?.userId) return;
        setTypingMap((prev) => {
          if (!prev[data.userId]) return prev;
          const copy = { ...prev };
          delete copy[data.userId];
          return copy;
        });
      })
      // Novas Mensagens do Chat Interno
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_messages" },
        (payload) => {
          const newMsg = payload.new as any;

          // Remove do status de digitando se enviou mensagem
          if (newMsg.sender_id) {
            setTypingMap((prev) => {
              if (!prev[newMsg.sender_id]) return prev;
              const copy = { ...prev };
              delete copy[newMsg.sender_id];
              return copy;
            });
          }

          // Enriquecimento do sender para mensagens em tempo real
          const senderMember = teamMembersRef.current?.find((m) => m.id === newMsg.sender_id);
          const enrichedMsg: InternalMessage = {
            ...newMsg,
            sender:
              newMsg.sender ||
              (senderMember
                ? {
                    id: senderMember.id,
                    name: senderMember.name,
                    role: senderMember.role,
                    avatar_url: senderMember.avatar_url,
                  }
                : newMsg.sender_id === profile?.id
                ? {
                    id: profile.id,
                    name: profile.name,
                    role: profile.role,
                    avatar_url: profile.avatar_url,
                  }
                : null),
          };

          // Detecta se a mensagem recebida menciona o usuário logado (apenas em canais de grupo)
          const targetChannel = channelsRef.current?.find((c) => c.id === newMsg.channel_id);
          const isGroupChannel = targetChannel ? targetChannel.type !== "direct" : true;
          const isFromMe = newMsg.sender_id === profile?.id;
          const mentionsMe =
            !isFromMe &&
            isGroupChannel &&
            (newMsg.metadata?.has_all_mention ||
              newMsg.metadata?.mentions?.includes(profile?.id) ||
              (profile?.name &&
                newMsg.content?.toLowerCase().includes(`@${profile.name.toLowerCase()}`)) ||
              newMsg.content?.toLowerCase().includes("@todos"));

          // Dispara Notificação Push no navegador se em segundo plano ou em outro canal
          if (!isFromMe) {
            const isHidden = typeof document !== "undefined" && document.hidden;
            const isDifferentChannel = newMsg.channel_id !== activeChannelIdRef.current;

            if (isHidden || isDifferentChannel) {
              const senderName = enrichedMsg.sender?.name || "Colega de equipe";
              const channelObj = channelsRef.current?.find((c) => c.id === newMsg.channel_id);
              const channelTitle =
                channelObj?.type === "direct"
                  ? senderName
                  : channelObj?.name || "Chat da Equipe";

              notifyBrowser({
                title:
                  channelObj?.type === "direct"
                    ? senderName
                    : `#${channelTitle} • ${senderName}`,
                body:
                  newMsg.content ||
                  (newMsg.media_type ? `[${newMsg.media_type}]` : "Novo anexo"),
                icon: enrichedMsg.sender?.avatar_url || "/favicon.ico",
                onClick: () => {
                  optionsRef.current?.onSelectChannel?.(newMsg.channel_id);
                  navigate({
                    to: "/conversations",
                    search: { mode: "team", channelId: newMsg.channel_id } as any,
                  });
                },
              });
            }
          }

          if (mentionsMe) {
            const senderName = enrichedMsg.sender?.name || "Colega de equipe";
            const channelObj = channelsRef.current?.find((c) => c.id === newMsg.channel_id);
            const isDirect = channelObj?.type === "direct";
            const basePreview = newMsg.content || "Mencionou você em uma mensagem";
            showStackedMessageToast({
              key: `team-${newMsg.channel_id}`,
              messageId: String(newMsg.id),
              type: "team",
              senderName: isDirect ? senderName : `#${channelObj?.name || "Canal"}`,
              avatarUrl: isDirect ? enrichedMsg.sender?.avatar_url : null,
              isMention: true,
              badgeLabel: isDirect ? "Conversa direta" : "Canal da equipe",
              previewText: isDirect ? basePreview : `${senderName}: ${basePreview}`,
              onOpen: () => {
                optionsRef.current?.onSelectChannel?.(newMsg.channel_id);
                navigate({
                  to: "/conversations",
                  search: { mode: "team", channelId: newMsg.channel_id } as any,
                });
              },
            });
          }

          // Se for mensagem do canal que o usuário está visualizando
          const currentViewingId = activeChannelIdRef.current;
          if (newMsg.channel_id === currentViewingId && currentViewingId) {
            qc.setQueryData<InternalMessage[]>(
              ["internal-messages", currentViewingId],
              (old) => {
                const replyTarget = old?.find((m) => m.id === newMsg.reply_to_id);
                const completeMsg: InternalMessage = {
                  ...enrichedMsg,
                  reply_to:
                    newMsg.reply_to_id && replyTarget?.content
                      ? {
                          id: replyTarget.id,
                          content: replyTarget.content,
                          sender_name: replyTarget.sender?.name || null,
                        }
                      : null,
                };
                if (!old) return [completeMsg];
                if (old.some((m) => m.id === completeMsg.id)) return old;
                return [...old, completeMsg];
              }
            );
            // Marca como lido automaticamente
            markAsReadRef.current(currentViewingId);
          }

          // Atualiza o card e prévia do canal na barra lateral para todas as mensagens
          let found = false;
          qc.setQueryData<InternalChannel[]>(
            ["internal-channels", companyId, profile?.id, selectedUnitIdRef.current],
            (old) => {
              if (!old) return old;
              const isCurrentActive = newMsg.channel_id === activeChannelIdRef.current;
              const updated = old.map((ch) => {
                if (ch.id === newMsg.channel_id) {
                  found = true;
                  return {
                    ...ch,
                    last_message_preview:
                      newMsg.content || (newMsg.media_type ? `[${newMsg.media_type}]` : "Anexo"),
                    last_message_sender_id: newMsg.sender_id,
                    last_message_at: newMsg.created_at,
                    unread_count: isCurrentActive
                      ? 0
                      : (ch.unread_count || 0) + (isFromMe ? 0 : 1),
                    has_mention: isCurrentActive ? false : (ch.has_mention || mentionsMe),
                    mention_count: isCurrentActive
                      ? 0
                      : (ch.mention_count || 0) + (mentionsMe ? 1 : 0),
                  };
                }
                return ch;
              });
              return updated.sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
              );
            }
          );

          // Se o canal não estava ainda no cache, invalida para buscar com dados completos
          if (!found) {
            qc.invalidateQueries({ queryKey: ["internal-channels"] });
          }
        }
      )
      // Atualizações de Mensagens (Edição, Moderação/Exclusão e Fixação/Pin)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "internal_messages" },
        (payload) => {
          const updated = payload.new as any;
          if (updated && updated.channel_id === activeChannelIdRef.current) {
            qc.setQueryData<InternalMessage[]>(
              ["internal-messages", activeChannelIdRef.current],
              (old) => {
                if (!old) return old;
                return old.map((m) => {
                  if (m.id !== updated.id) return m;
                  const pinUser = updated.pinned_by
                    ? teamMembers?.find((tm) => tm.id === updated.pinned_by)
                    : null;
                  return {
                    ...m,
                    content: updated.content,
                    media_url: updated.media_url,
                    is_edited: Boolean(updated.is_edited),
                    is_deleted: Boolean(updated.is_deleted),
                    is_pinned: Boolean(updated.is_pinned),
                    pinned_at: updated.pinned_at,
                    pinned_by: updated.pinned_by,
                    pinned_by_user: pinUser
                      ? { id: pinUser.id, name: pinUser.name }
                      : m.pinned_by_user,
                    updated_at: updated.updated_at,
                  };
                });
              }
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_channels" },
        () => {
          qc.invalidateQueries({ queryKey: ["internal-channels"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_message_reactions" },
        () => {
          if (activeChannelIdRef.current) {
            qc.invalidateQueries({
              queryKey: ["internal-messages", activeChannelIdRef.current],
            });
          }
        }
      );

    channelRtRef.current = channelRt;

    channelRt.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channelRt.track({
            user_id: profile.id,
            name: profile.name,
            avatar_url: profile.avatar_url,
            online_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[Realtime] Erro ao rastrear presença:", err);
        }
      }
    });

    return () => {
      channelRtRef.current = null;
      try {
        channelRt.untrack();
        supabase.removeChannel(channelRt);
      } catch {}
    };
  }, [companyId, profile?.id, profile?.name, profile?.avatar_url, qc]);

  return {
    channels: channels || [],
    isLoadingChannels,
    totalTeamUnread,
    messages: messages || [],
    isLoadingMessages,
    sendMessage,
    uploadFile,
    toggleReaction,
    markAsRead,
    teamMembers: teamMembers || [],
    getOrCreateDirectChannel,
    createChannel,
    // Pilar 3: Presença, Digitando e Notificações
    onlineUserIds,
    typingUserNames,
    sendTyping,
    sendStopTyping,
    notificationPermission,
    requestNotificationPermission,
    // Pilar 4: Gestão, Avisos & Moderação
    togglePinMessage,
    editMessage,
    deleteMessage,
  };
}
