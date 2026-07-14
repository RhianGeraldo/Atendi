# Análise do Sistema de Realtime (Subida de Conversas para o Topo)

O comportamento de mover uma conversa para o topo da lista assim que uma nova mensagem chega é gerenciado no frontend utilizando **Supabase Realtime** em conjunto com a manipulação de cache do **React Query (TanStack Query)**. 

O código que orquestra essa lógica encontra-se no arquivo `src/routes/_authenticated/conversations.tsx`.

---

## Passo a Passo do Funcionamento

### 1. Inscrição no Canal Realtime
O componente utiliza um `useEffect` para criar uma inscrição (`supabase.channel`) e escutar eventos `postgres_changes` nas tabelas `conversations` e `messages`.

### 2. Evento de Nova Mensagem (`INSERT` em `messages`)
Quando uma nova mensagem é criada no banco, o frontend recebe o payload via WebSocket e realiza as seguintes ações:
- **Atualiza o chat aberto:** Adiciona a nova mensagem ao cache de mensagens (se o chat estiver aberto).
- **Gera o Preview:** Cria o texto que vai aparecer na lista (ex: o próprio texto, ou "📷 Foto", "🎵 Áudio", etc).
- **Controle de Leitura:** Verifica se a mensagem foi enviada pelo contato e se a conversa não está atualmente focada (`selectedId`) para incrementar o `unread_count`.
- **Busca no Cache:** Localiza a conversa inteira que já está carregada no cache das listas.
- **Chamada de Atualização:** Dispara a função interna `updateConversationInCache` passando as novas informações e a flag explícita `moveToTop: true`.

### 3. A Função `updateConversationInCache` (Como sobe para o topo)
Esta função é o coração do sistema de reposicionamento. Ela atua diretamente no cache paginado (*InfiniteQuery*) do React Query para evitar um novo fetch demorado:
1. **Remoção:** Ela varre todas as páginas cacheadas, localiza a conversa e a **remove** do array original (não importa em qual página ela estava).
2. **Inserção no Topo:** Se a conversa ainda pertencer à aba atual (ex: continua em "Andamento"), ela recria a *primeira página* do cache e insere essa conversa no índice `0` (`rows: [targetConv, ...firstPage.rows]`).
3. **Persistência Visual:** O `qc.setQueryData` é chamado, e o React instantaneamente re-renderiza a lista na interface, agora com a conversa na primeira posição.

### 4. Sistema de Fallback (Recarga)
Caso a mensagem chegue para uma conversa que é tão antiga que **não está** no cache de nenhuma página atualmente carregada, a função `updateConversationInCache` não encontrará a conversa para manipular.
Neste cenário, ela dispara um `qc.invalidateQueries`, forçando o React Query a fazer uma nova busca no banco de dados para a primeira página, que naturalmente trará a conversa no topo, pois a query SQL ordena por `last_message_at DESC`.

---

## Pontos Chave para Implementação em Outro Sistema
Se for replicar esse padrão em outra stack ou sistema:
- **Não dependa apenas do Banco de Dados para a UI em tempo real:** Fazer um novo `SELECT` na listagem inteira a cada mensagem é custoso. 
- **Mute o estado local:** Ao receber o evento via WebSocket/Realtime, tire o item do array e coloque-o na posição `0`.
- **Lide com a Paginação:** Se usar paginação, certifique-se de remover o item da página onde ele estava antes de colocá-lo no topo da página 1, senão ele aparecerá duplicado.
