# Plano de Implementação: Chat Interno da Equipe Multiunidades

> **Módulo:** Comunicação Interna & Colaboração Multiunidades  
> **Localização:** Integrado diretamente na tela de Atendimentos (`/conversations`)  
> **Data:** 06/10/2026  
> **Status:** Pronto para Execução  

---

## 1. Visão Geral e Objetivos

O **Chat Interno da Equipe** tem como finalidade permitir a comunicação instantânea entre atendentes, supervisores e gestores sem sair da plataforma Atendi e sem misturar conversas de clientes com conversas internas.

### Principais Benefícios:
* **Foco contínuo:** O atendente não precisa trocar de tela nem usar aplicativos externos (WhatsApp pessoal, Slack, Teams) para tirar dúvidas ou receber avisos.
* **Multiunidades nativo:** Suporte completo a empresas com múltiplas unidades (filiais), permitindo canais globais (todas as unidades) e canais restritos por unidade, além de mensagens diretas (1:1).
* **Alerta visual em tempo real:** Badge e contador de mensagens não lidas no alternador de modo Clientes/Equipe.

---

## 2. Arquitetura Multiunidades & Escopos de Visibilidade

O sistema respeita a hierarquia de empresas (`companies`), unidades (`units`) e permissões (`user_units` / `profiles`):

```text
                                  ┌──────────────────────────────┐
                                  │       EMPRESA (Tenant)       │
                                  └──────────────┬───────────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────────────────────┐
                  │                                                             │
        ┌─────────▼──────────┐                                        ┌─────────▼──────────┐
        │   CANAIS GLOBAIS   │                                        │ CANAIS DE UNIDADE  │
        │ (Todas as Unidades)│                                        │  (Unidade Centro)  │
        │  scope = 'company' │                                        │  scope = 'unit'    │
        │  unit_id = NULL    │                                        │  unit_id = <UUID>  │
        └────────────────────┘                                        └────────────────────┘
                  │                                                             │
                  ▼                                                             ▼
     Todos os colaboradores da empresa                          Colaboradores vinculados a essa
                                                                 unidade via `user_units` + Admins
```

### Tipos de Canais Suportados:

1. **🌐 Globais da Empresa (`scope: 'company'`):**
   * Exemplos: `#anúncios-gerais`, `#diretoria-e-gestão`, `#social`.
   * Visíveis para todos os colaboradores de todas as filiais.
2. **🏢 Por Unidade (`scope: 'unit'`):**
   * Exemplos: `#equipe-matriz`, `#vendas-centro`, `#suporte-zona-sul`.
   * Vinculados a uma unidade específica (`unit_id`). Apenas os membros com acesso àquela unidade participam.
3. **👥 Grupos Personalizados (`scope: 'custom'`):**
   * Criados por usuários convidando membros específicos (inclusive entre unidades diferentes).
4. **💬 Mensagens Diretas 1:1 (`scope: 'direct'`):**
   * Conversa privada entre 2 colaboradores quaisquer da empresa, exibindo a unidade e status online de cada colega.

---

## 3. Modelagem de Dados no Supabase (SQL)

### 3.1. Tabelas

```sql
-- 1. Canais / Conversas Internas
CREATE TABLE public.internal_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE, -- NULL se for canal geral
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  name TEXT, -- Nome do canal (ex: "Geral", "Equipe Centro") - NULL para DMs
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  scope TEXT NOT NULL DEFAULT 'unit' CHECK (scope IN ('company', 'unit', 'custom', 'direct')),
  avatar_url TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_internal_channels_company ON public.internal_channels(company_id);
CREATE INDEX idx_internal_channels_unit ON public.internal_channels(unit_id);
CREATE INDEX idx_internal_channels_last_msg ON public.internal_channels(last_message_at DESC);

-- 2. Membros do Canal
CREATE TABLE public.internal_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.internal_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT DEFAULT 0,
  is_muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_internal_channel_members_user ON public.internal_channel_members(user_id);
CREATE INDEX idx_internal_channel_members_channel ON public.internal_channel_members(channel_id);

-- 3. Mensagens do Chat Interno
CREATE TABLE public.internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.internal_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_type TEXT CHECK (media_type IN ('text', 'image', 'audio', 'video', 'document')),
  media_url TEXT,
  file_name TEXT,
  file_size INT,
  reply_to_id UUID REFERENCES public.internal_messages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- Referência a clientes, cards, tags @mencionadas
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_internal_messages_channel ON public.internal_messages(channel_id, created_at DESC);
```

### 3.2. Políticas de Segurança (Row Level Security - RLS)

```sql
ALTER TABLE public.internal_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- Regra de leitura de canais:
-- Um usuário pode ver o canal se:
-- 1. É da mesma empresa E
-- 2. (É canal de escopo 'company' OU faz parte da unidade do canal OU é membro explícito)
CREATE POLICY "internal_channels_select" ON public.internal_channels
FOR SELECT TO authenticated
USING (
  company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  AND (
    scope = 'company'
    OR (
      unit_id IS NOT NULL 
      AND (
        EXISTS (SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = internal_channels.unit_id)
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('super_admin', 'admin_company') OR has_matriz_access = true))
      )
    )
    OR EXISTS (SELECT 1 FROM public.internal_channel_members WHERE channel_id = internal_channels.id AND user_id = auth.uid())
  )
);

-- Regra para mensagens:
-- Usuário só vê mensagens dos canais que tem permissão de ver
CREATE POLICY "internal_messages_select" ON public.internal_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.internal_channels
    WHERE internal_channels.id = internal_messages.channel_id
  )
);

-- Inserção de mensagens:
CREATE POLICY "internal_messages_insert" ON public.internal_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.internal_channels
    WHERE internal_channels.id = internal_messages.channel_id
  )
);
```

### 3.3. Habilitação do Realtime

```sql
-- Adiciona tabelas na publicação realtime do Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_channel_members;
```

---

## 4. Design de Interface (UX/UI na Tela de Atendimentos)

Na página [`conversations.tsx`](file:///home/rhiangeraldo/Desenvolvimentos/Atendi/src/routes/_authenticated/conversations.tsx):

### 4.1. Seletor de Modo na Barra Superior da Lista

Logo acima da barra de busca e das abas de tickets:

```text
┌─────────────────────────────────────────────────────────┐
│  [ 👥 Clientes (14) ]          [ 💬 Equipe (2) 🔴 ]     │  ← Toggle Segmented Control
├─────────────────────────────────────────────────────────┤
│  🔍 Buscar canal ou colega...                           │
└─────────────────────────────────────────────────────────┘
```

* **Estado:** `const [chatMode, setChatMode] = useState<"clients" | "team">("clients");`
* **Preservação de Estado:** Ao alternar de `Clientes` para `Equipe` e voltar, a conversa do cliente que estava aberta **não é perdida**.

### 4.2. Coluna Esquerda no Modo Equipe

Quando `chatMode === "team"`:
* **Grupos Globais da Empresa:** `#anúncios`, `#geral`.
* **Grupos da Minha Unidade:** `#equipe-matriz`, `#vendas`.
* **Mensagens Diretas (DMs):** Lista de colegas de trabalho da empresa com:
  * Avatar com indicador de status online 🟢.
  * Nome do colega + Badge da unidade (ex: `Lucas Silva` `[Filial Centro]`).
  * Prévia da última mensagem e contador de não lidas.
* **Botão de Criar Canal / Nova DM:** Ícone `+` no topo para iniciar uma nova conversa interna.

### 4.3. Painel Central no Modo Equipe

Substitui o `ChatPanel` de clientes por `TeamChatPanel`:
* Cabeçalho: Nome do canal/colega, ícone da unidade/escopo, lista de membros online.
* Área de Mensagens: Mensagens em tempo real, suporte a texto, emojis, áudio gravado e envio de imagens/arquivos.
* Citação/Resposta a mensagens anteriores (`reply_to_id`).
* Barra inferior de digitação com upload e emoji picker.

---

## 5. Estrutura de Componentes no Código

Arquivos criados na pasta `src/components/team-chat/`:

| Arquivo | Função |
| :--- | :--- |
| `src/components/team-chat/team-chat-types.ts` | Tipos TypeScript (`InternalChannel`, `InternalMessage`, `ChannelMember`). |
| `src/components/team-chat/team-channels-list.tsx` | Lista de canais globais, por unidade e DMs para a barra lateral. |
| `src/components/team-chat/team-chat-panel.tsx` | Painel central do chat da equipe com histórico, rolagem e envio. |
| `src/components/team-chat/team-message-bubble.tsx` | Balão de mensagem de cada colega (com avatar, horário, anexo). |
| `src/components/team-chat/create-channel-dialog.tsx` | Modal para criar canais ou grupos entre unidades. |
| `src/components/team-chat/start-direct-chat-dialog.tsx` | Modal para buscar um colega pelo nome/unidade e iniciar conversa direta. |
| `src/hooks/use-team-chat.tsx` | Hook com queries do TanStack Query + listeners do Supabase Realtime. |

---

## 6. Fases de Execução

### Fase 1: Banco de Dados & Scripts
- [ ] Criar script DDL das tabelas `internal_channels`, `internal_channel_members` e `internal_messages`.
- [ ] Aplicar no Supabase e gerar/atualizar os tipos TypeScript.
- [ ] Criar canais padrão automáticos para empresas existentes (`#geral` e canal por unidade).

### Fase 2: Hook e Lógica de Dados
- [ ] Implementar `useTeamChat` com buscas otimizadas:
  - Listar canais do usuário (Globais + Unidades permitidas + DMs).
  - Listar mensagens com paginação e cache inteligente.
  - Inserir/enviar mensagem com atualização otimista.
  - Escutar canais e mensagens no Realtime.

### Fase 3: Componentes de Interface
- [ ] Desenvolver `TeamChannelsList` (sidebar de canais/colegas).
- [ ] Desenvolver `TeamChatPanel` e `TeamMessageBubble`.
- [ ] Desenvolver diálogos de criação de canal e início de DM.

### Fase 4: Integração com a Tela de Atendimentos
- [ ] Adicionar o alternador `[ Clientes ]` / `[ Equipe ]` em `conversations.tsx`.
- [ ] Integrar contadores de mensagens não lidas no badge do botão `Equipe`.
- [ ] Testar transição suave entre o atendimento de lead e a conversa da equipe.

---

## 7. Critérios de Sucesso & Testes

1. Atendente consegue conversar em tempo real com colegas da mesma unidade e de outras unidades.
2. Mensagens enviadas em um canal aparecem instantaneamente para todos os membros sem refresh.
3. Notificação e contadores não lidos funcionam ao receber mensagem de colega estando na aba de clientes.
4. Nenhuma conversa de cliente é afetada ou perdida ao alternar entre os modos.
5. Permissões de RLS testadas para garantir isolamento entre empresas e unidades.
