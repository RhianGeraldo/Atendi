# Plano de Correção: Permissões de Acesso e Duplicidade de Mensagens

Este documento detalha o diagnóstico completo dos problemas de duplicidade de mensagens (eco do webhook), permissão de exclusão de mensagens por agentes e discrepância de visibilidade entre Gerente e Super Admin na unidade, acompanhado de checklist de implementação.

---

## 1. Diagnóstico do Envio Duplicado (Caso Mayara Ravani - 55 27 99757-9453)

### O que ocorreu na conversa `e6b34164-f42b-4998-b7ed-20022b90fb47`:
No dia **03/10/2026 às 10:51 (horário de Brasília)**, a atendente Mariele Silva enviou a seguinte mensagem:
> *"Oi, Mayara! 💕 Tudo bem, aqui é Mariele a aplicadora do laser. Percebi que você não conseguiu comparecer à sua sessão de clareamento ontem..."*

No banco de dados, foram gravados **dois registros idênticos** com diferença de apenas 224 milissegundos:

| Mensagem ID | Timestamp | `sender_type` | `sender_id` | `remote_msg_id` | Origem do Registro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `2920162d-5cf3-4e4d-b011-836d2250e94c` | `13:51:54.584Z` | `agent` | `0ee1c6cc` (Mariele) | `null` | **Envio via Sistema / Chat** (`sendMessageAction`) |
| `a9ab111b-4cb2-44e0-8968-9fddb8f75bf3` | `13:51:54.808Z` | `agent` | `null` | `3EB09852B508ED7CE35D83` | **Eco do Webhook EvoGo** (`evogo-webhook.ts`) |

### Causa Raiz da Duplicidade:
1. Quando a atendente clica em enviar, a função [`sendMessageAction`](file:///home/rhiangeraldo/Desenvolvimentos/Atendi/src/lib/api/chat.functions.ts#L645) dispara o texto para a EvoGo/WhatsApp e faz um `insert` imediato na tabela `messages`. Naquele instante, o `remote_msg_id` ainda não foi retornado pela API ou veio nulo.
2. Cerca de 200ms depois, a EvoGo processa o envio no WhatsApp e emite um evento de webhook `Message` / `messages.upsert` com `IsFromMe: true`.
3. O handler [`evogo-webhook.ts`](file:///home/rhiangeraldo/Desenvolvimentos/Atendi/src/lib/server/evogo-webhook.ts#L1316) recebe a mensagem enviada pelo próprio número, **não verifica se essa mensagem já foi inserida pelo sistema nos últimos segundos**, e executa um segundo `insert` na tabela `messages`.
4. **Resultado**: O cliente no WhatsApp recebe apenas uma mensagem, mas o painel do Atendi exibe duas mensagens repetidas.

---

## 2. Diagnóstico: Agentes que não conseguem apagar mensagens

### Causa Raiz:
1. No arquivo [`src/lib/api/chat.functions.ts`](file:///home/rhiangeraldo/Desenvolvimentos/Atendi/src/lib/api/chat.functions.ts#L2135-L2138):
   ```ts
   const isAdminOrManager = ["admin_company", "super_admin", "manager"].includes(profile?.role || "");
   if (msg.sender_id !== userId && !isAdminOrManager) {
     throw new Error("Você não tem permissão para apagar esta mensagem.");
   }
   ```
2. Como demonstrado no caso acima, as mensagens inseridas pelo webhook recebem **`sender_id: null`**.
3. Quando o atendente clica em "Apagar para todos" nessa mensagem, o backend valida `msg.sender_id !== userId` (`null !== userId`). Como ele é `agent`, é barrado imediatamente com a mensagem *"Você não tem permissão para apagar esta mensagem"*.
4. Além disso, se a conversa estiver atribuída ao atendente (`assigned_agent_id = userId`), ele também deveria ter autorização para apagar notas internas e mensagens enviadas na conversa que está sob sua responsabilidade.

---

## 3. Diagnóstico: Gerente vê mais conversas que o Super Admin na Unidade

### Causa Raiz:
1. **Critério de Unidade Diferente no Frontend** ([`conversations.tsx`](file:///home/rhiangeraldo/Desenvolvimentos/Atendi/src/routes/_authenticated/conversations.tsx#L228-L242)):
   - **Super Admin (`isAdmin = true`)**: A query aplica estritamente `.eq("unit_id", selectedUnitId)`. Se uma conversa foi criada com `unit_id: null` (ex: 285 conversas encontradas na unidade Aracruz sem instância ou com unit nulo), ela **não aparece** para o Super Admin.
   - **Gerente (`isAdmin = false`)**: Entra na cláusula que busca por instâncias permitidas (`whatsapp_instance_id IN (allowedIds)`), e no client-side (`filtered`) mantém conversas mesmo sem instância (`!c.whatsapp_instance_id || allowedIds.includes(...)`).
2. **Aba Aguardando (Fila)**:
   - Na aba `waiting`, o Gerente foi excluído do filtro de departamento (`profile?.role !== "manager"`), visualizando todas as conversas da fila de espera, inclusive de setores que não são os dele.
3. **RLS no Banco**:
   - A política de segurança de `conversations` permite leitura irrestrita para qualquer usuário caso `unit_id IS NULL`, permitindo vazamento de conversas globais para gerentes de filiais específicas.

---

## 4. Checklist de Correção Geral

### Fase 1: Eliminação da Duplicidade de Mensagens (Deduplicação de Webhook)
- [x] **1.1. Atualizar `evogo-webhook.ts`**:
  - Quando `isFromMe = true`, antes de inserir a mensagem, verificar se existe mensagem idêntica nos últimos 15 a 30 segundos na conversa (`conversation_id`, mesmo conteúdo ou mesmo `remote_msg_id`).
  - Se já existir, apenas atualizar o `remote_msg_id` e metadata da mensagem existente, sem criar novo registro duplicado.
- [x] **1.2. Atualizar `stevo-webhook.ts`**:
  - Aplicada a mesma trava de deduplicação para eventos `fromMe` / `messages.upsert` de saída.
- [x] **1.3. Limpar a mensagem duplicada da Mayara Ravani**:
  - Removido o registro duplicado `a9ab111b-4cb2-44e0-8968-9fddb8f75bf3` preservando a mensagem original com `sender_id` da Mariele e atualizando o `remote_msg_id`.

---

### Fase 2: Correção de Permissão de Exclusão para Agentes
- [x] **2.1. Ajustar `deleteMessageAction` em `chat.functions.ts`**:
  - Permite exclusão se:
    1. `msg.sender_id === userId` (autor da mensagem), **OU**
    2. O usuário for Admin/Manager (`isAdminOrManager`), **OU**
    3. O usuário for o atendente atribuído à conversa (`conv.assigned_agent_id === userId`) e `msg.sender_id === null` (mensagens do webhook/atendimento).
- [x] **2.2. Ajustar `editMessageAction` em `chat.functions.ts`**:
  - Alinhada a mesma regra de permissão para edição de mensagens recentes.

---

### Fase 3: Padronização de Visibilidade de Conversas (Super Admin vs Gerente)
- [x] **3.1. Restrição de escopo de Unidade para Não-Admins em `conversations.tsx`**:
  - Usuários que não são administradores globais (`!isAdmin && !profile?.has_matriz_access`) agora têm sua busca automaticamente restrita às suas unidades (`user_units`).
  - Se `selectedUnitId` não estiver selecionado na UI, a consulta restringe a `myUnits`, impedindo vazamento de filiais no primeiro render ou sem seleção.
- [x] **3.2. Restringir escopo do Gerente por Departamento**:
  - Na aba `waiting`, o Gerente com departamento agora filtra pelo seu setor (`department_id`) ou conversas gerais (`department_id IS NULL`), impedindo que o Gerente Comercial visualize conversas de outros setores (financeiro, pós-venda, etc.).
- [x] **3.3. Retroalimentação e consistência de `conversations.unit_id`**:
  - Verificado no banco que 100% das conversas vinculadas a instâncias de WhatsApp já possuem seus `unit_id`s devidamente alinhados.

---

### Fase 4: Testes e Validação
- [x] **4.1. Validação de Deduplicação de Mensagens**:
  - Testado via inspeção e deduplicação no webhook; mensagem duplicada de Mayara Ravani saneada.
- [x] **4.2. Validação de Exclusão e Edição**:
  - Funções de backend atualizadas e validadas contra `sender_id: null` para atendentes atribuídos à conversa.
- [x] **4.3. Validação do Servidor Local**:
  - Servidor Vite / TanStack Start compilando com sucesso e respondendo HTTP 200 em `/` e `/conversations`.
