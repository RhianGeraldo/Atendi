# Plano de Ação e Checklist de Otimização de Performance • Atendi

> **Diagnóstico:** Instância Supabase Compute **Small (2GB RAM / 2 vCPUs)** operando com **Compute a 90%**, **CPU a 89%** e **Disk IO Balance em 99%** (saldo de IOPS burst praticamente esgotado).
> **Objetivo:** Reduzir drasticamente o consumo de Disk I/O e CPU, eliminar travamentos e garantir escalabilidade estável.

---

## 📋 Checklist de Execução

- [ ] **Fase 1: Intervenção Imediata no Banco de Dados (SQL)**
  - [ ] 1.1 Alterar `REPLICA IDENTITY` de `messages` e `conversations` de `FULL` para `DEFAULT`.
  - [ ] 1.2 Criar índices compostos para listagem e ordenação de conversas por empresa (`company_id`).
  - [ ] 1.3 Criar índice composto de mensagens para cálculo de SLA e histórico recente.
  - [ ] 1.4 Criar índices parciais para crons de alta frequência (`call_logs` e `scheduled_messages`).
  - [ ] 1.5 Criar RPC `get_conversation_unread_counts` para contagem agregada de abas.

- [ ] **Fase 2: Blindagem de Realtime e Redução de Queries (Frontend)**
  - [ ] 2.1 Adicionar cache em memória e debounce no `use-global-notifications.tsx`.
  - [ ] 2.2 Trocar o canal compartilhado `"schema-db-changes"` no `app-header.tsx` por canal individual do usuário.
  - [ ] 2.3 Eliminar as queries paralelas N+1 de mensagens em `conversations.tsx`.
  - [ ] 2.4 Substituir o loop `fetchAllPages` de contadores de abas pela nova RPC agregada.

- [ ] **Fase 3: Otimizações de Métricas e Dashboard**
  - [ ] 3.1 Substituir o download em massa de mensagens no `dashboard.tsx` por consulta agregada.
  - [ ] 3.2 Implementar cache local curto com staleTime adequado para dados do painel.

- [ ] **Fase 4: Governança de Conexões e Validação**
  - [ ] 4.1 Confirmar uso da porta do Pooler transacional (Supavisor porta `6543`) nas APIs backend.
  - [ ] 4.2 Monitorar o comportamento do Disk IO Balance e uso de CPU no painel do Supabase.

---

## 🚀 Fase 1: Script SQL para Executar no Supabase

Execute o script abaixo diretamente no **SQL Editor** do Supabase Dashboard (ou via migração):

```sql
-- =========================================================================
-- SCRIPT DE OTIMIZAÇÃO CRÍTICA DE DISCO E CPU - SUPABASE SMALL (2GB)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. CORREÇÃO DE REPLICA IDENTITY EM CONVERSATIONS
-- Como a tabela tem PRIMARY KEY (id), deve usar DEFAULT.
-- O FULL gravava a linha inteira a cada mensagem recebida/lida, exaurindo o disco/WAL.
-- MANTEMOS 'messages' com FULL para garantir que filtros realtime com conversation_id
-- continuem recebendo UPDATE e DELETE sem risco de falha na recepção de mensagens.
-- -------------------------------------------------------------------------
ALTER TABLE public.conversations REPLICA IDENTITY DEFAULT;

-- -------------------------------------------------------------------------
-- 2. ÍNDICES COMPOSTOS PARA CONVERSAS (Index-Only Scans para listagens e abas)
-- Permite que o Postgres filtre por empresa/unidade e ordene sem ler a tabela toda do disco.
-- -------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_status_last_msg 
  ON public.conversations (company_id, status, last_message_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_unit_status_last_msg 
  ON public.conversations (company_id, unit_id, status, last_message_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_assigned_status
  ON public.conversations (company_id, assigned_agent_id, status, last_message_at DESC);

-- -------------------------------------------------------------------------
-- 3. ÍNDICES COMPOSTOS PARA MENSAGENS E SLA
-- Acelera dramaticamente a busca de últimas mensagens para o SLA e filtros de cliente.
-- -------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_sla 
  ON public.messages (conversation_id, is_internal, sender_type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_created 
  ON public.messages (sender_type, created_at DESC);

-- -------------------------------------------------------------------------
-- 4. ÍNDICES PARCIAIS PARA PROCESSOS DE BACKGROUND E CRONS
-- -------------------------------------------------------------------------
-- Cron de limpeza de chamadas travadas (executa a cada minuto)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_cleanup 
  ON public.call_logs (status, started_at) 
  WHERE status IN ('ACTIVE', 'RINGING');

-- Cron de mensagens agendadas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_messages_pending_queue 
  ON public.scheduled_messages (status, scheduled_for) 
  WHERE status = 'pending';

-- -------------------------------------------------------------------------
-- 5. RPC AGREGADA PARA CONTAGEM DAS ABAS DE CONVERSAS (Substitui fetchAllPages)
-- Retorna os totais em uma única consulta agregada ultra rápida direto no banco.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(
  p_company_id UUID,
  p_unit_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Validação de acesso à empresa
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_super_admin() OR p_company_id = public.current_company_id(), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  WITH counts AS (
    SELECT 
      CASE 
        WHEN c.channel = 'whatsapp_group' OR ct.phone LIKE '%@g.us' OR ct.phone LIKE '120363%' THEN 'groups'
        ELSE c.status::TEXT
      END AS status_group,
      COUNT(*)::INT AS total,
      COALESCE(SUM(c.unread_count), 0)::INT AS unread
    FROM public.conversations c
    JOIN public.contacts ct ON ct.id = c.contact_id
    WHERE c.company_id = p_company_id
      AND ct.is_blocked IS NOT TRUE
      AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'waiting', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'waiting'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'waiting'), 0)
    ),
    'active', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'active'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'active'), 0)
    ),
    'resolved', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'resolved'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'resolved'), 0)
    ),
    'groups', jsonb_build_object(
      'total', COALESCE((SELECT total FROM counts WHERE status_group = 'groups'), 0),
      'unread', COALESCE((SELECT unread FROM counts WHERE status_group = 'groups'), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(UUID, UUID) TO authenticated, service_role;
```

---

## 🛠️ Fase 2: Otimizações no Frontend / Realtime

### 2.1 Cache e Debounce em `use-global-notifications.tsx`
* **Problema:** Cada mensagem nova recebida no banco aciona um evento de realtime em todas as abas abertas. Cada aba dispara um `SELECT ... FROM conversations` imediatamente.
* **Ação:**
  1. Manter um cache local em memória (Map com TTL de 30 a 60 segundos) para detalhes de conversas recentemente consultadas.
  2. Se outra mensagem chegar para a mesma conversa em poucos segundos, usar o dado em cache em vez de fazer nova requisição SQL ao Supabase.

### 2.2 Isolamento de Canais no `app-header.tsx`
* **Problema:** Todos os clientes usavam o canal com nome estático `"schema-db-changes"`.
* **Ação:**
  Alterar para canal exclusivo por usuário:
  ```tsx
  const channel = supabase.channel(`notifications-user-${profile.id}`)
  ```

### 2.3 Eliminar N+1 Queries em `conversations.tsx`
* **Problema:** O carregamento inicial disparava um `Promise.all(missingIds.map(...))` para conversas sem mensagem no lote.
* **Ação:**
  Agrupar a busca de mensagens faltantes em uma única requisição com operador `.in('conversation_id', missingIds)` em vez de múltiplos `.map()`.

### 2.4 Substituição de `fetchAllPages` de Contagem
* **Problema:** O cálculo de badges das abas fazia um loop de até 50 páginas de 1.000 linhas puxando objetos completos de conversas para a memória do browser.
* **Ação:**
  Chamar diretamente a RPC `get_conversation_tab_counts(companyId, unitId)`.

---

## 📊 Fase 3: Otimização do Painel de Métricas (`dashboard.tsx`)

* **Problema:** O gráfico de distribuição por horário baixa todas as mensagens dos últimos 6 dias com JOIN triplo (`messages` → `conversations` → `contacts`) sem paginação nem agregação no banco.
* **Ação:**
  1. Criar função SQL RPC que devolve o array agregado por hora (`EXTRACT(HOUR FROM created_at)`).
  2. Reduzir a transferência de milhares de registros na rede para apenas 24 linhas JSON.

---

## 🛡️ Fase 4: Governança de Conexões (Supavisor)

Para instâncias **Compute Small (2GB RAM)**:
1. **Evitar Conexão Direta (porta 5432) em Serverless/Webhooks:**
   - Funções serverless criam e destroem conexões rapidamente. Conexões diretas consomem cerca de 10MB de RAM cada no PostgreSQL. Com dezenas de webhooks simultâneos, isso causa OOM (*Out Of Memory*).
   - Utilizar a porta do **Transaction Pooler (porta 6543 / Supavisor)** para todas as conexões backend via string de conexão.
2. **Definir Statement Timeout Seguro:**
   - Garantir que queries travem em no máximo 15 a 30 segundos, impedindo que consultas lentas fiquem presas consumindo CPU indefinidamente.

---

## 📈 Resultados Esperados

| Métrica | Situação Atual | Meta Pós-Otimização |
| :--- | :--- | :--- |
| **Compute / Memória** | ~90% constante | 35% - 50% |
| **Uso de CPU** | 89% (picos frequentes) | 20% - 35% |
| **Disk I/O Balance** | 99% (estrangulado) | Recuperação gradual para 0% - 20% |
| **Tempo de Resposta da Listagem** | 1.8s - 4.5s | < 350ms |
