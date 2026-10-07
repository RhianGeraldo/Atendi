import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { supabase } from "@/integrations/supabase/client";
import { playClientMessageSound, playTeamMessageSound } from "@/lib/sounds";
import { toast } from "sonner";

interface CachedConversation {
  companyId: string;
  contactName: string;
  avatarUrl: string | null;
  channel: string;
}

interface CachedTeamChannel {
  companyId: string;
  name: string | null;
  type: string;
}

interface CachedProfile {
  name: string;
  avatarUrl: string | null;
}

// Registro em memória de IDs de mensagens enviadas por este usuário no frontend (expiram em 45 segundos)
const recentlySentMessageIds = new Set<string>();

/**
 * Registra que uma mensagem foi enviada pelo próprio usuário localmente,
 * garantindo que nenhum eco em tempo real (Supabase Realtime ou Webhook) dispare som ao enviar.
 */
export function markMessageAsSentByMe(msgId?: string | null) {
  if (!msgId) return;
  recentlySentMessageIds.add(String(msgId));
  setTimeout(() => {
    recentlySentMessageIds.delete(String(msgId));
  }, 45_000);
}

/**
 * Disparador nativo de Notificações do Sistema Operacional (Web Notification API)
 */
function triggerBrowserNotification({
  title,
  body,
  icon,
  tag,
  onClick,
}: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(title, {
      body,
      icon: icon || "/favicon.ico",
      tag: tag || `atendi-msg-${Date.now()}`,
      badge: "/favicon.ico",
    });

    notif.onclick = () => {
      try {
        window.focus();
      } catch {}
      onClick?.();
      notif.close();
    };

    setTimeout(() => {
      try {
        notif.close();
      } catch {}
    }, 9000);
  } catch (err) {
    console.warn("[GlobalNotifications] Erro ao disparar notificação nativa:", err);
  }
}

/**
 * Hook Centralizado de Notificações Globais Personalizadas por Usuário
 * 
 * Regras Estritas:
 * 1. Mensagens de Clientes:
 *    - Se estiver no "Aguardando" (status = waiting ou sem atendente atribuído): notifica todos os operadores da unidade/empresa.
 *    - Se estiver com algum atendente (assigned_agent_id): notifica SOMENTE o atendente responsável.
 * 2. Mensagens da Equipe (Chat Interno):
 *    - Se for grupo/canal: notifica SOMENTE os usuários que forem membros do grupo (internal_channel_members) e não o silenciaram.
 *    - Se for DM: notifica apenas o outro participante.
 * 3. Mensagens enviadas pelo próprio operador NUNCA tocam som.
 */
export function useGlobalNotifications() {
  const { profile, session } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  const pathnameRef = useRef(location.pathname);
  const searchRef = useRef(location.search);
  pathnameRef.current = location.pathname;
  searchRef.current = location.search;

  // Refs de autenticação sempre sincronizadas (evita stale closure no Realtime)
  const profileRef = useRef(profile);
  const sessionRef = useRef(session);
  profileRef.current = profile;
  sessionRef.current = session;

  // Título original da aba e contador de mensagens não lidas em segundo plano
  const originalTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "Atendi");
  const unreadBackgroundCountRef = useRef<number>(0);

  // Unidades permitidas do usuário (se não for admin global)
  const allowedUnitsRef = useRef<Set<string>>(new Set());
  const isSuperOrAdminCompany =
    profile?.role === "super_admin" ||
    profile?.role === "admin_company" ||
    Boolean(profile?.has_matriz_access);

  // Canais que o usuário logado é membro (channel_id -> { isMuted: boolean })
  const myChannelMembershipsRef = useRef<Map<string, { isMuted: boolean }>>(new Map());

  // Caches em memória para evitar queries repetitivas
  const convCacheRef = useRef<Map<string, CachedConversation>>(new Map());
  const channelCacheRef = useRef<Map<string, CachedTeamChannel>>(new Map());
  const profileCacheRef = useRef<Map<string, CachedProfile>>(new Map());

  // 1. Carrega unidades permitidas para operadores não-admin
  useEffect(() => {
    if (!profile?.id) return;
    if (isSuperOrAdminCompany) return;

    supabase
      .from("user_units")
      .select("unit_id")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        if (data) {
          allowedUnitsRef.current = new Set(data.map((u: any) => u.unit_id));
        }
      });
  }, [profile?.id, isSuperOrAdminCompany]);

  // 2. Carrega canais onde o usuário é membro
  useEffect(() => {
    if (!profile?.id) return;

    const loadMemberships = () => {
      supabase
        .from("internal_channel_members")
        .select("channel_id, is_muted")
        .eq("user_id", profile.id)
        .then(({ data }) => {
          if (data) {
            const map = new Map<string, { isMuted: boolean }>();
            data.forEach((m: any) => {
              map.set(m.channel_id, { isMuted: Boolean(m.is_muted) });
            });
            myChannelMembershipsRef.current = map;
          }
        });
    };

    loadMemberships();
  }, [profile?.id]);

  // Salva o título base caso a rota mude
  useEffect(() => {
    if (typeof document !== "undefined" && !document.title.startsWith("(")) {
      originalTitleRef.current = document.title;
    }
  }, [location.pathname]);

  // Restaura o título padrão ao focar na janela
  useEffect(() => {
    if (typeof window === "undefined") return;

    const resetTitleOnFocus = () => {
      unreadBackgroundCountRef.current = 0;
      if (document.title.startsWith("(")) {
        document.title = originalTitleRef.current || "Atendi";
      }
    };

    window.addEventListener("focus", resetTitleOnFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        resetTitleOnFocus();
      }
    });

    return () => {
      window.removeEventListener("focus", resetTitleOnFocus);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const userCompanyId = activeCompanyId || profile.company_id;

    // Helper para atualizar o título da aba quando em segundo plano
    const handleBackgroundTitle = (senderLabel: string) => {
      const isHidden = typeof document !== "undefined" && document.hidden;
      if (isHidden) {
        unreadBackgroundCountRef.current += 1;
        document.title = `(${unreadBackgroundCountRef.current}) 💬 ${senderLabel} • Atendi`;
      }
    };

    // Subscrição Supabase Realtime Global
    const channel = supabase
      .channel("atendi-global-msg-notifications")
      // 1. Mensagens de Clientes (tabela 'messages')
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg) return;

          // REGRA ESTRITA: Apenas mensagens RECEBIDAS do cliente (sender_type === 'contact')
          // Mensagens do atendente ('agent'), do bot ('bot') ou do sistema ('system') NUNCA tocam som
          if (newMsg.sender_type !== "contact") return;
          if (newMsg.is_internal) return;

          // Se a mensagem foi enviada pelo próprio usuário ou ecoada, NUNCA toca som
          if (recentlySentMessageIds.has(String(newMsg.id))) return;

          const currentUserId = profileRef.current?.id || sessionRef.current?.user?.id;
          if (
            currentUserId &&
            newMsg.sender_id &&
            String(newMsg.sender_id).trim().toLowerCase() === String(currentUserId).trim().toLowerCase()
          ) {
            return;
          }

          const convId = newMsg.conversation_id;
          if (!convId) return;

          // Busca dados atuais da conversa para validar status e atendente atribuído
          let convDetail: {
            id: string;
            unit_id: string | null;
            channel: string | null;
            status: string | null;
            assigned_agent_id: string | null;
            contact: {
              id: string;
              company_id: string;
              name: string | null;
              phone: string | null;
              profile_picture_url: string | null;
            } | null;
          } | null = null;

          try {
            const { data } = await supabase
              .from("conversations")
              .select("id, unit_id, channel, status, assigned_agent_id, contact:contacts(id, company_id, name, phone, profile_picture_url)")
              .eq("id", convId)
              .single();
            convDetail = data as any;
          } catch (e) {
            console.warn("[GlobalNotifications] Falha ao consultar conversa:", e);
          }

          if (!convDetail || !convDetail.contact) return;

          // Valida tenant da empresa
          if (convDetail.contact.company_id && userCompanyId && convDetail.contact.company_id !== userCompanyId) {
            return;
          }

          // REGRA DE DIRECIONAMENTO POR USUÁRIO:
          // Se o cliente mandou mensagem e está no aguardando (status = waiting ou sem atendente), aparece para todos da unidade.
          // Se estiver com algum atendente (assigned_agent_id), aparece SOMENTE para o atendente responsável.
          const assignedId = convDetail.assigned_agent_id;
          const isWaiting = convDetail.status === "waiting" || !assignedId;

          if (assignedId && !isWaiting) {
            // Conversa atribuída a um atendente específico
            const isAssignedToMe =
              Boolean(currentUserId) &&
              String(assignedId).trim().toLowerCase() === String(currentUserId).trim().toLowerCase();

            if (!isAssignedToMe) {
              // Pertence a outro atendente -> NÃO notifica
              return;
            }
          } else {
            // Conversa no Aguardando (fila geral) -> Notifica quem atende aquela unidade
            if (!isSuperOrAdminCompany && convDetail.unit_id) {
              if (!allowedUnitsRef.current.has(convDetail.unit_id)) {
                // Operador não tem permissão para essa filial -> NÃO notifica
                return;
              }
            }
          }

          const contactName = convDetail.contact.name || convDetail.contact.phone || "Cliente";
          let previewText = newMsg.content || "";
          if (newMsg.media_type === "image") previewText = "📷 Foto";
          else if (newMsg.media_type === "video") previewText = "🎥 Vídeo";
          else if (newMsg.media_type === "audio") previewText = "🎵 Áudio";
          else if (newMsg.media_type === "document") previewText = "📄 Documento";

          // Checa se o usuário já está visualizando exatamente esta conversa com a janela focada
          const currentPath = pathnameRef.current;
          const currentSearch = (searchRef.current as any)?.c;
          const isViewingThisChat =
            currentPath === "/conversations" &&
            currentSearch === convId &&
            typeof document !== "undefined" &&
            !document.hidden &&
            document.hasFocus();

          // Se já está com o chat aberto na tela e focado, não precisa disparar alertas externos
          if (isViewingThisChat) return;

          // 1. Toca o som clássico do iPhone SOMENTE quando recebemos mensagem do cliente
          playClientMessageSound();

          // 2. Atualiza o título da aba do navegador (se em segundo plano)
          handleBackgroundTitle(contactName);

          // 3. Dispara Notificação de Desktop nativa
          const channelName = convDetail.channel ? convDetail.channel.toUpperCase() : "WHATSAPP";
          triggerBrowserNotification({
            title: `💬 ${contactName} • ${channelName}`,
            body: previewText || "Nova mensagem recebida",
            icon: convDetail.contact.profile_picture_url || "/favicon.ico",
            tag: `client-msg-${convId}`,
            onClick: () => {
              navigate({
                to: "/conversations",
                search: { c: convId } as any,
              });
            },
          });

          // 4. Se o usuário estiver navegando em outra página (ex: Dashboard, Funil), exibe Toast in-app
          if (currentPath !== "/conversations") {
            toast.info(`💬 ${contactName}`, {
              description: previewText || "Nova mensagem recebida",
              duration: 7000,
              action: {
                label: "Abrir",
                onClick: () => {
                  navigate({
                    to: "/conversations",
                    search: { c: convId } as any,
                  });
                },
              },
            });
          }
        }
      )
      // 2. Mensagens da Equipe (tabela 'internal_messages')
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_messages" },
        async (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg) return;

          // Se foi enviada recentemente por este cliente, NUNCA toca som
          if (recentlySentMessageIds.has(String(newMsg.id))) return;

          // REGRA ESTRITA: Mensagem enviada pelo próprio usuário NUNCA toca som
          const currentUserId = profileRef.current?.id || sessionRef.current?.user?.id;
          if (
            currentUserId &&
            newMsg.sender_id &&
            String(newMsg.sender_id).trim().toLowerCase() === String(currentUserId).trim().toLowerCase()
          ) {
            return;
          }

          const channelId = newMsg.channel_id;
          if (!channelId || !currentUserId) return;

          // REGRA DE DIRECIONAMENTO POR USUÁRIO NA EQUIPE:
          // Se for no grupo e o usuário estiver nele (ou for DM dele), notifica o usuário.
          // Se o usuário NÃO for membro do grupo, NÃO notifica.
          let membership = myChannelMembershipsRef.current.get(channelId);
          if (membership === undefined) {
            // Consulta no banco caso tenha sido adicionado recentemente ao canal
            try {
              const { data: mem } = await supabase
                .from("internal_channel_members")
                .select("channel_id, is_muted")
                .eq("channel_id", channelId)
                .eq("user_id", currentUserId)
                .maybeSingle();

              if (mem) {
                membership = { isMuted: Boolean(mem.is_muted) };
                myChannelMembershipsRef.current.set(channelId, membership);
              } else {
                myChannelMembershipsRef.current.set(channelId, null as any);
              }
            } catch (err) {
              console.warn("[GlobalNotifications] Erro ao validar filiação ao canal:", err);
            }
          }

          // Se não é membro ou silenciou o canal: NÃO notifica
          if (!membership || membership.isMuted) {
            return;
          }

          // Busca dados do canal interno
          let channelData = channelCacheRef.current.get(channelId);
          if (!channelData) {
            try {
              const { data: ch } = await supabase
                .from("internal_channels")
                .select("id, company_id, name, type")
                .eq("id", channelId)
                .single();
              if (ch) {
                channelData = {
                  companyId: ch.company_id,
                  name: ch.name,
                  type: ch.type,
                };
                channelCacheRef.current.set(channelId, channelData);
              }
            } catch (e) {
              console.warn("[GlobalNotifications] Falha ao consultar canal interno:", e);
            }
          }

          // Valida tenant
          if (channelData && channelData.companyId && userCompanyId && channelData.companyId !== userCompanyId) {
            return;
          }

          // Busca remetente
          let senderData = profileCacheRef.current.get(newMsg.sender_id);
          if (!senderData) {
            try {
              const { data: p } = await supabase
                .from("profiles")
                .select("name, avatar_url")
                .eq("id", newMsg.sender_id)
                .single();
              if (p) {
                senderData = {
                  name: p.name || "Colega de equipe",
                  avatarUrl: p.avatar_url,
                };
                profileCacheRef.current.set(newMsg.sender_id, senderData);
              }
            } catch (e) {
              console.warn("[GlobalNotifications] Falha ao consultar perfil:", e);
            }
          }

          const senderName = senderData?.name || "Colega de equipe";
          let previewText = newMsg.content || "";
          if (newMsg.media_type === "image") previewText = "📷 Foto";
          else if (newMsg.media_type === "audio") previewText = "🎵 Áudio";
          else if (newMsg.media_type === "document") previewText = "📄 Documento";

          const currentPath = pathnameRef.current;
          const currentSearch = searchRef.current as any;
          const isViewingThisTeamChannel =
            currentPath === "/conversations" &&
            currentSearch?.channelId === channelId &&
            typeof document !== "undefined" &&
            !document.hidden &&
            document.hasFocus();

          // 1. Toca o som do ICQ ("Uh-oh!") SOMENTE para mensagens RECEBIDAS da equipe
          playTeamMessageSound();

          // Se já está com o canal aberto na tela e a janela focada, não precisa poluir com Desktop Push e Toast
          if (isViewingThisTeamChannel) return;

          // 2. Atualiza o título da aba se em segundo plano
          handleBackgroundTitle(senderName);

          // 3. Notificação nativa de desktop
          const channelTitle =
            channelData?.type === "direct"
              ? senderName
              : `#${channelData?.name || "Chat da Equipe"} • ${senderName}`;

          triggerBrowserNotification({
            title: `👥 ${channelTitle}`,
            body: previewText || "Nova mensagem da equipe",
            icon: senderData?.avatarUrl || "/favicon.ico",
            tag: `team-msg-${channelId}`,
            onClick: () => {
              navigate({
                to: "/conversations",
                search: { tab: "team", channelId } as any,
              });
            },
          });

          // 4. Toast in-app se estiver em outra página ou fora do chat da equipe
          if (currentPath !== "/conversations" || currentSearch?.tab !== "team") {
            toast.info(`👥 ${channelTitle}`, {
              description: previewText || "Nova mensagem da equipe",
              duration: 7000,
              action: {
                label: "Ver",
                onClick: () => {
                  navigate({
                    to: "/conversations",
                    search: { tab: "team", channelId } as any,
                  });
                },
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, activeCompanyId, navigate, isSuperOrAdminCompany]);
}
