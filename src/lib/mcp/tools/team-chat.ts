/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { McpContext, McpToolDefinition, McpToolSecurity } from "../types";

// Chat interno da equipe (internal_channels / internal_channel_members / internal_messages).
// Tudo roda como a pessoa por trás do token (context.userId): o usuário conectado via OAuth
// ou o "Assistente IA" de uma chave com identidade própria. O supabaseAdmin ignora o RLS,
// então as regras de acesso ficam aqui, iguais às da tela: canais dos quais a pessoa é membro
// e, sem ser membro, grupos da empresa e grupos das unidades dela (todas, para admin/Matriz).

const db = supabaseAdmin as any;

const READ_SECURITY: McpToolSecurity = { requiredMenu: "conversations", category: "team_chat" };
const WRITE_SECURITY: McpToolSecurity = { ...READ_SECURITY, isWriteAction: true };

const MESSAGE_FIELDS = `id, channel_id, sender_id, content, media_type, media_url, file_name, reply_to_id, metadata, is_edited, is_deleted, is_pinned, created_at,
  sender:profiles!sender_id(id, name),
  reply_to:internal_messages!reply_to_id(id, content, sender:profiles!sender_id(name))`;

const MAX_CONTENT_LENGTH = 4000;

function requireChatUser(context: McpContext): string {
  if (!context.userId) {
    throw new Error(
      "O chat interno precisa saber quem está falando. Conecte o MCP com a sua conta (OAuth) ou use uma chave do Assistente IA criada em Configurações > MCP.",
    );
  }
  return context.userId;
}

function clampLimit(value: any, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

const CHANNEL_FIELDS =
  "id, company_id, name, description, type, scope, is_announcement, unit_id, created_by, last_message_preview, last_message_at";

/** Grupo visível sem ser membro (mesmo filtro da lista de canais em use-team-chat). */
function canSeeWithoutMembership(channel: any, context: McpContext): boolean {
  if (channel.type === "direct") return false;
  if (channel.created_by === context.userId) return true;
  if (channel.scope === "company") return true;
  if (channel.scope === "unit" && channel.unit_id) {
    return (
      Boolean(context.hasMatrizAccess) || (context.userUnitIds || []).includes(channel.unit_id)
    );
  }
  return false;
}

/** Canal da empresa que a pessoa pode ver; senão, erro. memberRole é null se não for membro. */
async function loadAccessibleChannel(channelId: string, userId: string, context: McpContext) {
  const { data: channel } = await db
    .from("internal_channels")
    .select(CHANNEL_FIELDS)
    .eq("id", channelId)
    .eq("company_id", context.companyId)
    .maybeSingle();

  const { data: membership } = channel
    ? await db
        .from("internal_channel_members")
        .select("role")
        .eq("channel_id", channelId)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  if (!channel || (!membership && !canSeeWithoutMembership(channel, context))) {
    throw new Error("Canal não encontrado ou você não tem acesso a ele.");
  }
  return { channel, memberRole: (membership?.role || null) as "admin" | "member" | null };
}

/** Grupos visíveis sem ser membro, fora os de excludeIds. */
async function loadVisibleGroupsWithoutMembership(context: McpContext, excludeIds: Set<string>) {
  const { data } = await db
    .from("internal_channels")
    .select(CHANNEL_FIELDS)
    .eq("company_id", context.companyId)
    .eq("type", "group");

  return (data || []).filter(
    (ch: any) => !excludeIds.has(ch.id) && canSeeWithoutMembership(ch, context),
  );
}

/** Pessoa ativa da mesma empresa. */
async function loadTeamProfile(profileId: string, context: McpContext) {
  const { data: target } = await db
    .from("profiles")
    .select("id, name, active, company_id")
    .eq("id", profileId)
    .maybeSingle();

  if (!target || target.company_id !== context.companyId || target.active === false) {
    throw new Error("Pessoa não encontrada na equipe desta empresa.");
  }
  return target as { id: string; name: string };
}

/** Conversa direta (1:1) já existente entre as duas pessoas (a mais recente, se houver duplicada). */
async function findDirectChannelId(
  userId: string,
  otherId: string,
  context: McpContext,
): Promise<string | null> {
  const { data: direct } = await db
    .from("internal_channels")
    .select(
      "id, me:internal_channel_members!inner(user_id), other:internal_channel_members!inner(user_id)",
    )
    .eq("company_id", context.companyId)
    .eq("type", "direct")
    .eq("me.user_id", userId)
    .eq("other.user_id", otherId)
    .order("last_message_at", { ascending: false })
    .limit(1);

  return direct?.[0]?.id || null;
}

/** Mesma criação de DM da tela (use-team-chat getOrCreateDirectChannel). */
async function getOrCreateDirectChannelId(userId: string, otherId: string, context: McpContext) {
  const existing = await findDirectChannelId(userId, otherId, context);
  if (existing) return existing;

  const { data: created, error } = await db
    .from("internal_channels")
    .insert({
      company_id: context.companyId,
      type: "direct",
      scope: "direct",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Erro ao criar conversa direta: ${error?.message || "desconhecido"}`);
  }

  const { error: memErr } = await db.from("internal_channel_members").insert([
    { channel_id: created.id, user_id: userId, role: "admin" },
    { channel_id: created.id, user_id: otherId, role: "member" },
  ]);

  if (memErr) {
    await db.from("internal_channels").delete().eq("id", created.id);
    throw new Error(`Erro ao adicionar membros na conversa direta: ${memErr.message}`);
  }

  // Duas mensagens ao mesmo tempo podem criar duas DMs: fica a mais antiga, a outra sai
  const { data: pair } = await db
    .from("internal_channels")
    .select(
      "id, me:internal_channel_members!inner(user_id), other:internal_channel_members!inner(user_id)",
    )
    .eq("company_id", context.companyId)
    .eq("type", "direct")
    .eq("me.user_id", userId)
    .eq("other.user_id", otherId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  const keeper = pair?.[0]?.id as string | undefined;
  if (keeper && keeper !== created.id) {
    await db.from("internal_channels").delete().eq("id", created.id);
    return keeper;
  }

  return created.id as string;
}

/** Resolve canal_id ou usuario_id (DM) num canal que a pessoa pode ver. */
async function resolveTargetChannel(
  args: any,
  userId: string,
  context: McpContext,
  { createDirect }: { createDirect: boolean },
) {
  if (args?.canal_id && args?.usuario_id) {
    throw new Error("Informe canal_id ou usuario_id, não os dois.");
  }

  if (args?.canal_id) {
    return loadAccessibleChannel(String(args.canal_id), userId, context);
  }

  if (args?.usuario_id) {
    const otherId = String(args.usuario_id);
    if (otherId === userId) throw new Error("Não é possível conversar com você mesmo.");
    await loadTeamProfile(otherId, context);

    const channelId = createDirect
      ? await getOrCreateDirectChannelId(userId, otherId, context)
      : await findDirectChannelId(userId, otherId, context);
    if (!channelId) return null;
    return loadAccessibleChannel(channelId, userId, context);
  }

  throw new Error("Informe canal_id (grupo ou conversa) ou usuario_id (conversa direta).");
}

/** Membros ativos de cada canal, com nome. */
async function loadActiveMembers(channelIds: string[]) {
  const byChannel = new Map<string, Array<{ id: string; name: string }>>();
  if (channelIds.length === 0) return byChannel;

  const { data } = await db
    .from("internal_channel_members")
    .select("channel_id, user_id, profile:profiles(id, name, active)")
    .in("channel_id", channelIds);

  for (const m of data || []) {
    if (!m.profile || m.profile.active === false) continue;
    const list = byChannel.get(m.channel_id) || [];
    list.push({ id: m.user_id, name: m.profile.name });
    byChannel.set(m.channel_id, list);
  }
  return byChannel;
}

function channelDisplayName(
  channel: any,
  members: Array<{ id: string; name: string }>,
  userId: string,
) {
  if (channel.type !== "direct") return channel.name || "Grupo sem nome";
  const other = members.find((m) => m.id !== userId);
  return other ? other.name : "Conversa direta";
}

function formatMessage(m: any, userId: string) {
  return {
    id: m.id,
    canal_id: m.channel_id,
    remetente: { id: m.sender_id, nome: m.sender?.name || null, sou_eu: m.sender_id === userId },
    conteudo: m.is_deleted ? "(mensagem apagada)" : m.content,
    tipo: m.media_type || "text",
    midia: !m.is_deleted && m.media_url ? { url: m.media_url, arquivo: m.file_name || null } : null,
    em_resposta_a:
      m.reply_to_id && m.reply_to
        ? {
            id: m.reply_to.id,
            conteudo: m.reply_to.content,
            remetente: m.reply_to.sender?.name || null,
          }
        : null,
    me_menciona: Boolean(
      m.sender_id !== userId &&
      (m.metadata?.has_all_mention || (m.metadata?.mentions || []).includes(userId)),
    ),
    editada: Boolean(m.is_edited),
    fixada: Boolean(m.is_pinned),
    enviada_em: m.created_at,
  };
}

async function markChannelRead(channelId: string, userId: string) {
  await db
    .from("internal_channel_members")
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", userId);
}

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const teamChatTools: McpToolDefinition[] = [
  {
    name: "listar_canais_equipe",
    description:
      "Chat interno da equipe: lista suas conversas diretas e os grupos que você vê (os seus, os da empresa e os da sua unidade), com mensagens não lidas, menções e a última mensagem. Use apenas_nao_lidas=true para ver quem está esperando resposta.",
    security: READ_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["todos", "direto", "grupo"],
          description: "Filtrar por conversas diretas (1:1), grupos ou todos. Padrão: todos.",
          default: "todos",
        },
        apenas_nao_lidas: {
          type: "boolean",
          description: "Se true, retorna só canais com mensagens não lidas. Padrão: false.",
          default: false,
        },
        limite: {
          type: "number",
          description: "Máximo de canais retornados (padrão 30, máximo 100).",
          default: 30,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const tipo = args?.tipo || "todos";
      const limit = clampLimit(args?.limite, 30, 100);

      const { data: memberships, error } = await db
        .from("internal_channel_members")
        .select(
          `unread_count, last_read_at, is_muted, role, channel:internal_channels(${CHANNEL_FIELDS})`,
        )
        .eq("user_id", userId);

      if (error) throw new Error(`Erro ao listar canais: ${error.message}`);

      let rows = (memberships || []).filter(
        (m: any) => m.channel && m.channel.company_id === context.companyId,
      );
      // Grupos que a tela mostra sem a pessoa ser membro (sem contador de não lidas)
      const memberIds = new Set<string>(rows.map((m: any) => m.channel.id));
      const visibleGroups = await loadVisibleGroupsWithoutMembership(context, memberIds);
      rows = rows.concat(
        visibleGroups.map((ch: any) => ({
          unread_count: 0,
          last_read_at: null,
          is_muted: false,
          role: null,
          channel: ch,
        })),
      );
      if (tipo === "direto") rows = rows.filter((m: any) => m.channel.type === "direct");
      if (tipo === "grupo") rows = rows.filter((m: any) => m.channel.type === "group");
      if (args?.apenas_nao_lidas) rows = rows.filter((m: any) => (m.unread_count || 0) > 0);

      rows.sort(
        (a: any, b: any) =>
          new Date(b.channel.last_message_at || 0).getTime() -
          new Date(a.channel.last_message_at || 0).getTime(),
      );
      rows = rows.slice(0, limit);

      const channelIds = rows.map((m: any) => m.channel.id);
      const membersByChannel = await loadActiveMembers(channelIds);

      // Menções ainda não lidas (mesma regra da tela: metadata.mentions / has_all_mention)
      const mentionCount = new Map<string, number>();
      const unreadRows = rows.filter((m: any) => (m.unread_count || 0) > 0);
      if (unreadRows.length > 0) {
        const oldestRead = unreadRows
          .map((m: any) => m.last_read_at || "1970-01-01T00:00:00Z")
          .sort()[0];
        const { data: mentions } = await db
          .from("internal_messages")
          .select("channel_id, created_at, sender_id")
          .in(
            "channel_id",
            unreadRows.map((m: any) => m.channel.id),
          )
          .gt("created_at", oldestRead)
          .neq("sender_id", userId)
          .or(`metadata->mentions.cs.["${userId}"],metadata->>has_all_mention.eq.true`);

        const lastReadByChannel = new Map(
          unreadRows.map((m: any) => [m.channel.id, m.last_read_at || "1970-01-01T00:00:00Z"]),
        );
        for (const msg of mentions || []) {
          if (msg.created_at > (lastReadByChannel.get(msg.channel_id) as string)) {
            mentionCount.set(msg.channel_id, (mentionCount.get(msg.channel_id) || 0) + 1);
          }
        }
      }

      return {
        voce: { id: userId, nome: context.userName || null },
        total: rows.length,
        canais: rows.map((m: any) => {
          const members = membersByChannel.get(m.channel.id) || [];
          const other = m.channel.type === "direct" ? members.find((x) => x.id !== userId) : null;
          return {
            canal_id: m.channel.id,
            nome: channelDisplayName(m.channel, members, userId),
            tipo: m.channel.type === "direct" ? "direto" : "grupo",
            com_usuario: other ? { id: other.id, nome: other.name } : null,
            canal_de_avisos: Boolean(m.channel.is_announcement),
            membros: m.channel.type === "direct" ? undefined : members.length,
            nao_lidas: m.unread_count || 0,
            mencoes_nao_lidas: mentionCount.get(m.channel.id) || 0,
            silenciado: Boolean(m.is_muted),
            ultima_mensagem: m.channel.last_message_preview || null,
            ultima_mensagem_em: m.channel.last_message_at,
          };
        }),
      };
    },
  },
  {
    name: "ler_mensagens_equipe",
    description:
      "Chat interno da equipe: lê o histórico de um grupo (canal_id) ou da sua conversa direta com uma pessoa (usuario_id), da mais antiga para a mais recente. Por padrão marca o canal como lido.",
    security: READ_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        canal_id: {
          type: "string",
          description: "ID (UUID) do grupo ou conversa (de listar_canais_equipe).",
        },
        usuario_id: {
          type: "string",
          description: "ID (UUID) da pessoa para ler a conversa direta com ela.",
        },
        limite: {
          type: "number",
          description: "Quantidade de mensagens mais recentes (padrão 30, máximo 100).",
          default: 30,
        },
        antes_de: {
          type: "string",
          description:
            "Data ISO 8601 para paginar: traz mensagens anteriores a ela (use enviada_em da mais antiga já lida).",
        },
        marcar_como_lida: {
          type: "boolean",
          description: "Zera as não lidas do canal após ler. Padrão: true.",
          default: true,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const target = await resolveTargetChannel(args, userId, context, { createDirect: false });
      if (!target) {
        return { canal_id: null, total: 0, mensagens: [], aviso: "Vocês ainda não conversaram." };
      }

      const limit = clampLimit(args?.limite, 30, 100);
      let query = db
        .from("internal_messages")
        .select(MESSAGE_FIELDS)
        .eq("channel_id", target.channel.id)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (args?.antes_de) query = query.lt("created_at", String(args.antes_de));

      const { data, error } = await query;
      if (error) throw new Error(`Erro ao ler mensagens: ${error.message}`);

      const rows = data || [];
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();

      if (args?.marcar_como_lida !== false && !args?.antes_de) {
        await markChannelRead(target.channel.id, userId);
      }

      const members = (await loadActiveMembers([target.channel.id])).get(target.channel.id) || [];
      return {
        canal: {
          id: target.channel.id,
          nome: channelDisplayName(target.channel, members, userId),
          tipo: target.channel.type === "direct" ? "direto" : "grupo",
          descricao: target.channel.description || null,
          canal_de_avisos: Boolean(target.channel.is_announcement),
          membros: members.map((m) => ({ id: m.id, nome: m.name })),
        },
        total: page.length,
        ha_mensagens_anteriores: hasMore,
        mensagens: page.map((m: any) => formatMessage(m, userId)),
      };
    },
  },
  {
    name: "buscar_mensagens_equipe",
    description:
      "Chat interno da equipe: busca mensagens por texto nas suas conversas e nos grupos que você vê. Pode restringir a um canal, à conversa direta com uma pessoa, a um remetente ou a um período.",
    security: READ_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Texto a procurar (sem diferenciar maiúsculas)." },
        canal_id: { type: "string", description: "Restringir a um grupo ou conversa (UUID)." },
        usuario_id: {
          type: "string",
          description: "Restringir à sua conversa direta com esta pessoa (UUID).",
        },
        remetente_id: {
          type: "string",
          description: "Só mensagens enviadas por esta pessoa (UUID).",
        },
        desde: { type: "string", description: "Data ISO 8601 inicial." },
        ate: { type: "string", description: "Data ISO 8601 final." },
        limite: {
          type: "number",
          description: "Máximo de resultados (padrão 20, máximo 50).",
          default: 20,
        },
      },
      required: ["termo"],
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const term = String(args?.termo || "").trim();
      if (term.length < 2) throw new Error("Informe um termo com pelo menos 2 caracteres.");

      const limit = clampLimit(args?.limite, 20, 50);
      const search = (scope: (q: any) => any, extraSelect = "") => {
        let q = db
          .from("internal_messages")
          .select(
            `${MESSAGE_FIELDS}, channel:internal_channels!inner(id, name, type${extraSelect})`,
          )
          .eq("is_deleted", false)
          .ilike("content", `%${escapeLike(term)}%`)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (args?.remetente_id) q = q.eq("sender_id", String(args.remetente_id));
        if (args?.desde) q = q.gte("created_at", String(args.desde));
        if (args?.ate) q = q.lte("created_at", String(args.ate));
        return scope(q);
      };

      let results: any[];
      if (args?.canal_id || args?.usuario_id) {
        const target = await resolveTargetChannel(args, userId, context, { createDirect: false });
        if (!target) return { termo: term, total: 0, resultados: [] };
        const { data, error } = await search((q) => q.eq("channel_id", target.channel.id));
        if (error) throw new Error(`Erro ao buscar mensagens: ${error.message}`);
        results = data || [];
      } else {
        // Canais em que é membro (join, sem lista de IDs na URL) + grupos visíveis sem ser membro
        const { data: memberships } = await db
          .from("internal_channel_members")
          .select("channel_id")
          .eq("user_id", userId);
        const memberIds = new Set<string>((memberships || []).map((m: any) => m.channel_id));
        const visibleIds = (await loadVisibleGroupsWithoutMembership(context, memberIds)).map(
          (ch: any) => ch.id,
        );

        const [mine, visible] = await Promise.all([
          search(
            (q) => q.eq("channel.company_id", context.companyId).eq("channel.me.user_id", userId),
            ", company_id, me:internal_channel_members!inner(user_id)",
          ),
          visibleIds.length > 0
            ? search((q) => q.in("channel_id", visibleIds))
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (mine.error || visible.error) {
          throw new Error(`Erro ao buscar mensagens: ${(mine.error || visible.error).message}`);
        }
        results = [...(mine.data || []), ...(visible.data || [])]
          .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, limit);
      }

      const rows = results;
      const membersByChannel = await loadActiveMembers(
        Array.from(new Set(rows.map((m: any) => m.channel_id))),
      );

      return {
        termo: term,
        total: rows.length,
        resultados: rows.map((m: any) => ({
          ...formatMessage(m, userId),
          canal_nome: channelDisplayName(
            m.channel || {},
            membersByChannel.get(m.channel_id) || [],
            userId,
          ),
        })),
      };
    },
  },
  {
    name: "enviar_mensagem_equipe",
    description:
      "Chat interno da equipe: envia uma mensagem de texto num grupo (canal_id) ou numa conversa direta com uma pessoa (usuario_id; a conversa é criada se ainda não existir). A equipe recebe a notificação normalmente. Em grupos, '@todos' ou mencionar_ids destacam a mensagem para as pessoas.",
    security: WRITE_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        canal_id: { type: "string", description: "ID (UUID) do grupo ou conversa." },
        usuario_id: {
          type: "string",
          description: "ID (UUID) da pessoa para mandar mensagem direta.",
        },
        conteudo: { type: "string", description: "Texto da mensagem." },
        responder_a_id: {
          type: "string",
          description: "ID da mensagem que está sendo respondida (do mesmo canal).",
        },
        mencionar_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs de membros do grupo a mencionar (só em grupos).",
        },
      },
      required: ["conteudo"],
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const content = String(args?.conteudo || "").trim();
      if (!content) throw new Error("O conteúdo da mensagem não pode ser vazio.");
      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error(`Mensagem muito longa (máximo ${MAX_CONTENT_LENGTH} caracteres).`);
      }

      const target = await resolveTargetChannel(args, userId, context, { createDirect: true });
      if (!target) throw new Error("Não foi possível abrir a conversa.");
      const { channel, memberRole } = target;

      // Canal de avisos: só gestão ou admin do canal (mesma regra da tela)
      const isManager = ["manager", "admin_company", "super_admin"].includes(
        context.userRole || "",
      );
      if (channel.is_announcement && !isManager && memberRole !== "admin") {
        throw new Error("Este é um canal de avisos: só a gestão pode enviar mensagens.");
      }

      if (args?.responder_a_id) {
        const { data: original } = await db
          .from("internal_messages")
          .select("id, channel_id")
          .eq("id", String(args.responder_a_id))
          .maybeSingle();
        if (!original || original.channel_id !== channel.id) {
          throw new Error("A mensagem respondida não pertence a este canal.");
        }
      }

      // Menções (a tela extrai @nome / @todos no navegador; aqui fazemos o mesmo)
      const mentions: string[] = [];
      let hasAllMention = false;
      if (channel.type !== "direct") {
        const members = (await loadActiveMembers([channel.id])).get(channel.id) || [];
        const lower = content.toLowerCase();
        hasAllMention = lower.includes("@todos") || lower.includes("@canal");
        for (const m of members) {
          if (m.id !== userId && m.name && lower.includes(`@${m.name.toLowerCase()}`)) {
            mentions.push(m.id);
          }
        }
        const memberIds = new Set(members.map((m) => m.id));
        for (const id of Array.isArray(args?.mencionar_ids) ? args.mencionar_ids : []) {
          if (memberIds.has(id) && id !== userId && !mentions.includes(id)) mentions.push(id);
        }
      }

      const { data: msg, error } = await db
        .from("internal_messages")
        .insert({
          channel_id: channel.id,
          sender_id: userId,
          content,
          media_type: "text",
          reply_to_id: args?.responder_a_id || null,
          metadata: { mentions, has_all_mention: hasAllMention, sent_via: "mcp" },
        })
        .select(MESSAGE_FIELDS)
        .single();

      if (error || !msg) {
        throw new Error(`Erro ao enviar mensagem: ${error?.message || "desconhecido"}`);
      }

      // Quem responde já leu o que veio antes
      await markChannelRead(channel.id, userId);

      return { sucesso: true, mensagem: formatMessage(msg, userId) };
    },
  },
  {
    name: "marcar_canal_equipe_como_lido",
    description: "Chat interno da equipe: zera as mensagens não lidas de um grupo ou conversa.",
    security: WRITE_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        canal_id: { type: "string", description: "ID (UUID) do grupo ou conversa." },
      },
      required: ["canal_id"],
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const { channel } = await loadAccessibleChannel(String(args.canal_id), userId, context);
      await markChannelRead(channel.id, userId);
      return { sucesso: true, canal_id: channel.id };
    },
  },
  {
    name: "buscar_pessoas_equipe",
    description:
      "Chat interno da equipe: encontra colegas ativos da empresa pelo nome, para iniciar ou ler uma conversa direta (use o id retornado como usuario_id).",
    security: READ_SECURITY,
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Parte do nome (vazio lista todos)." },
        limite: {
          type: "number",
          description: "Máximo de pessoas (padrão 20, máximo 100).",
          default: 20,
        },
      },
    },
    handler: async (args: any, context: McpContext) => {
      const userId = requireChatUser(context);
      const limit = clampLimit(args?.limite, 20, 100);

      let query = db
        .from("profiles")
        .select("id, name, role, online, last_seen_at, user_units(units(name))")
        .eq("company_id", context.companyId)
        .eq("active", true)
        .neq("id", userId)
        .order("name", { ascending: true })
        .limit(limit);
      const name = String(args?.nome || "").trim();
      if (name) query = query.ilike("name", `%${escapeLike(name)}%`);

      const { data, error } = await query;
      if (error) throw new Error(`Erro ao buscar pessoas: ${error.message}`);

      return {
        total: data?.length || 0,
        pessoas: (data || []).map((p: any) => ({
          id: p.id,
          nome: p.name,
          cargo: p.role,
          online: Boolean(
            p.online &&
            p.last_seen_at &&
            Date.now() - new Date(p.last_seen_at).getTime() < 3 * 60 * 1000,
          ),
          unidades: (p.user_units || []).map((u: any) => u.units?.name).filter(Boolean),
        })),
      };
    },
  },
];
