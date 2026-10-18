# Todoo — Plano de correções

> Base: análise de 17/10/2026 (banco, front e produto) na branch `feat/todoo-layout`.
> Cada causa abaixo foi conferida no código antes de entrar no plano.

## Status (17/10/2026)

| Fase | Situação |
|---|---|
| 1 | ✅ Commit `a5f7093`. Falta o teste manual no app (roteiro abaixo). |
| 2 | ✅ Aplicada em produção (`20261017120000_todoo_cadence_guard`). Verificação prévia: 0 leads reciclados por engano, 0 empresas com etapas duplicadas. |
| 3 | ✅ 3.1: proteções nas 5 migrations antigas (validadas com parser). 3.2 + 3.3: aplicadas em produção (`20261017130000_todoo_register_and_notifications_guard`). A policy de INSERT em `notifications` foi removida, porque só o servidor cria notificações. O índice em `contacts(phone)` não foi criado: são 5,7 mil linhas e é tabela quente. |
| 4 | ✅ Aplicada em produção (`20261017140000_todoo_metrics_rpcs`). Funções testadas: 271 leads, 188 com 1º contato no prazo e 82 atrasados. Ficaram de fora a 4.5 (tsc) e a 4.6 (RPC única de criação). A cadência roda no cron do servidor (`src/lib/server/cron.ts`). |
| 5 | Código no commit da Fase 5. A migration `20261017150000_todoo_phase5_rules.sql` ainda falta aplicar. Decisões: redistribuição por SLA implementada (uma vez por lead, só prazos que vencerem depois de ligar, sem Indicações/Prospecção); ação pausada sai da fila; quarentena devolve só quem esgotou as tentativas ("Sem interesse" fica para ações próprias); Gincana −2 por atraso; textos padronizados. |

## Visão geral

| Fase | O quê | Onde | Risco | Entrega |
|---|---|---|---|---|
| 1 | Bugs que corrompem dados (front) | 6 arquivos `.tsx` + `format.ts` | Baixo | 1 commit |
| 2 | Cadência que "apaga" vendas + etapas duplicadas | 1 migration (só funções) | Baixo | 1 commit + aplicar em prod |
| 3 | Migrations antigas não-reexecutáveis + `notifications` | migrations antigas + 1 nova | Médio | 1 commit |
| 4 | Métricas no servidor + cadência agendada | RPCs + pg_cron + front | Médio | 1–2 commits |
| 5 | Decisões de produto e padronização de textos | front | Baixo | depende das decisões |

Regras que valem para todas as fases (incidente de 14/10):
- Toda migration começa com `SET lock_timeout = '3s'; SET statement_timeout = '30s';`.
- Nunca `supabase db push --include-all`. Aplicar o arquivo único e depois `supabase migration repair --status applied <versão>`.
- Nada de DDL em `messages`, `conversations` ou `contacts` neste plano.

---

## Fase 1 — Front: bugs que corrompem dados

### 1.1 Valor em reais lido errado
- **Problema:** "1.500,00" vira R$ 1,50 (`parseFloat(v.replace(",", "."))`).
- **Onde:** `src/components/todoo/todoo-outcome-dialog.tsx:60` e `todoo-create-campaign-dialog.tsx:450`.
- **Correção:**
  - Criar `parseBRL(input: string): number | null` em `src/lib/format.ts`, ao lado de `formatBRL`. Ela tira "R$" e os espaços e trata os formatos assim:
    - com ponto **e** vírgula: o ponto é milhar e a vírgula é decimal;
    - só com vírgula: a vírgula é decimal;
    - só com ponto: se ele vier seguido de exatamente 3 dígitos é milhar ("1.500"); senão é decimal ("1500.5").
  - Devolve `null` quando o texto não for um número.
  - Nos dois diálogos, se o valor for inválido, mostrar o erro "Valor inválido" e não salvar.
- **Testar:** "1.500,00" dá 1500; "1500,5" dá 1500.5; "1500" dá 1500; "1.500" dá 1500; "abc" dá erro.

### 1.2 Assistente de Nova Ação reabre no passo 4 e duplica a campanha
- **Causa:** `todoo-create-campaign-dialog.tsx` não tem nenhum `useEffect` de reset; o estado sobrevive ao fechar.
- **Correção:**
  - Criar uma função `resetForm()` que volta todos os `useState` aos valores iniciais: passo 1, primeiro modelo, filtros do CRM, dados da planilha, consultoras e `crmLeadsData`.
  - Chamar `resetForm()` num `useEffect` quando `open` mudar para `true`, seguindo o padrão de `todoo-create-referral-dialog.tsx:83`.
  - Garantir que o botão "Criar Lista" fica `disabled={submitting}`.

### 1.3 Criação de ação deixa campanha com parte dos leads quando falha
- **Causa:** o código insere a campanha e depois os leads em lotes de 100 (`:435-511`). Se um lote falha, a campanha fica no banco.
- **Correção (curta):** no `catch`, se a campanha já tiver sido criada, rodar `delete` em `todoo_campaigns` com o `id` dela. A FK `ON DELETE CASCADE` apaga os leads que entraram. Avisar no toast: "Nada foi criado: <erro>".
- **Correção definitiva:** uma RPC transacional `todoo_create_campaign`, que fica para a Fase 4.

### 1.4 Ação criada não aparece no Quadro por até 5 minutos
- **Causa:** `staleTime` global de 5 minutos (`src/router.tsx:10`). O `onSuccess` do assistente em `src/routes/_authenticated/todoo.tsx:115-117` só troca a aba.
- **Correção:** no `onSuccess`, invalidar as queries `todoo-leads`, `todoo-my-day`, `todoo-campaigns-list` e `todoo-campaigns-filter`.

### 1.5 Quadro grava "Comprou" por cima do desfecho escolhido
- **Causa:** a consultora escolhe o card "Comprou" e o diálogo abre com "won". Se ela troca para "Sem interesse" e salva, o `onSuccess` (`todoo-daily-queue.tsx:888-894`) grava `card_status_id = Comprou` mesmo assim. O trigger `todoo_leads_cadence` então força `status='won'`, e o lead fica com `outcome_type='lost'` e `status='won'`.
- **Correção:**
  - Mudar a assinatura para `onSuccess(type: TodooOutcomeType)` em `todoo-outcome-dialog.tsx` e passar o tipo salvo. A chamada da linha `:118` vira `onSuccess(outcomeType)`.
  - No Quadro, só gravar o card escolhido se `TODOO_CARD_BEHAVIORS[card.behavior].outcome === type`. Se o tipo mudou, não gravar nada: o trigger já sincroniza o card pelo status.
  - Checar `error` desse update e incluir `updated_at`.
  - Ajustar os outros chamadores. `todoo-my-day.tsx:580` e o banner podem continuar ignorando o argumento.

### 1.6 Banner da conversa: desfecho errado, permissão e cache
- **Causa 1:** `todoo-conversation-banner.tsx:300` não passa `initialType`. Quem escolhe "Agendou" vê "Fechou!" marcado.
  - **Correção:** guardar o tipo escolhido em `handleOpenOutcome` e passar `initialType`.
- **Causa 2:** o `onSuccess` invalida `["todoo-metrics"]`, que não existe.
  - **Correção:** invalidar `todoo-overall-metrics`, `todoo-my-day` e `todoo-leads`.
- **Causa 3:** `chat-panel.tsx:1449` renderiza o banner para todo mundo, inclusive quem não tem acesso ao Todoo.
  - **Correção:** envolver o banner em `canAccessMenu("todoo")`, com o mesmo helper que a sidebar usa.

### 1.7 Ajustes no diálogo de desfecho (mesmo arquivo da 1.5)
- "Retornar" sem data: desabilitar o salvar quando `outcomeType === "callback" && !callbackDate`.
- O insert em `todoo_events` e a tarefa de retorno ignoram o erro. Checar `error` e mostrar `toast.warning("Desfecho salvo, mas a tarefa de retorno não foi criada")` em vez de falhar em silêncio.

### Como validar a Fase 1
- `npx eslint` nos arquivos alterados. O `tsc` do projeto inteiro estoura memória; ver o item 4.5.
- Teste manual no app:
  1. Criar uma ação, fechar o assistente e reabrir: ele deve abrir no passo 1, e a ação nova deve aparecer no Quadro na hora.
  2. Card "Comprou" → trocar para "Sem interesse" no diálogo → o lead deve ir para Sem Sucesso com o status lost.
  3. Desfecho de R$ 1.500,00 → a Gincana e os Indicadores devem mostrar R$ 1.500,00.
  4. Na conversa, "Agendou Visita" deve abrir o diálogo marcado em "Agendou".
  5. Um usuário sem a permissão `todoo` não deve ver o banner na conversa.

---

## Fase 2 — Banco: cadência que "apaga" vendas + etapas duplicadas

Arquivo novo: `supabase/migrations/20261017120000_todoo_cadence_guard.sql`. Ele só faz `CREATE OR REPLACE FUNCTION`, sem DDL de tabela e sem update em massa.

### 2.1 `todoo_refresh_cadence` recicla leads ganhos, agendados ou em conversa
- **Causa:** o lead vai para Sem Sucesso ("Sem interesse") com `next_action_at` em +30 dias. Depois o card vira "Comprou". O trigger só mexe na etapa quando o card vira *lost*, e `next_action_at` só é recalculado quando a etapa muda, então o lead fica em Sem Sucesso com o prazo antigo. A RPC (`20261016150000_todoo_cadence.sql:275-290`) olha só `s.kind = 'failed'` e devolve o lead para A Contatar com `status='pending'` e `outcome_type=NULL`. A venda some.
- **Correção:** no `UPDATE ... recycled`, juntar com o status do card e reciclar só os cards ativos ou perdidos (ou sem card):
  ```sql
  LEFT JOIN public.todoo_card_statuses cs ON cs.id = l.card_status_id
  ...
  AND (cs.behavior IS NULL OR cs.behavior IN ('active', 'lost'))
  ```
  Ficam incluídos os leads que chegaram a Sem Sucesso por esgotar as tentativas (card ativo) e os marcados "Sem interesse". Ficam de fora os cards won, scheduled e paused.
- **Por que não mexer no trigger:** se o trigger zerasse `next_action_at` quando o card sai de lost, um lead que voltasse para "Sem interesse" nunca mais reciclaria, porque a etapa não muda. O filtro na RPC basta e preserva o prazo.
- **Reparo de dados:** antes de aplicar, rodar uma consulta só de leitura para achar leads já reciclados por engano:
  ```sql
  SELECT h.lead_id FROM todoo_lead_history h
  WHERE h.event = 'recycled' AND h.from_card_behavior IN ('won','scheduled','paused');
  ```
  Se aparecer algum, decidir caso a caso se o lead volta para won. Isso fica fora da migration.

### 2.2 `todoo_ensure_pipeline` cria etapas em dobro com acessos simultâneos
- **Causa:** usa `IF NOT EXISTS ... INSERT` sem lock (`20261016170000_todoo_failed_30_days.sql:14-31`).
- **Correção:** adicionar na primeira linha do corpo:
  ```sql
  PERFORM pg_advisory_xact_lock(hashtext('todoo_pipeline:' || p_company_id::text));
  ```
  O lock é por empresa e vale só durante a transação da RPC. Sem índice novo e sem lock de tabela.
- **Verificação (só leitura):**
  ```sql
  SELECT company_id, count(*) FILTER (WHERE kind='start') AS starts,
         count(*) FILTER (WHERE kind='failed') AS fails
  FROM todoo_stages GROUP BY 1 HAVING count(*) FILTER (WHERE kind='start') > 1
                                   OR count(*) FILTER (WHERE kind='failed') > 1;
  ```

### Aplicação
1. Rodar as duas consultas de verificação acima em produção, só leitura.
2. Aplicar o arquivo único (SQL editor ou `psql -f`) e depois `supabase migration repair --status applied 20261017120000`.
3. Testar: lead em Sem Sucesso → card "Comprou" → forçar `next_action_at = now() - interval '1 min'` **num lead de teste** → abrir o Quadro → o lead tem que continuar "Comprou".

---

## Fase 3 — Migrations antigas e `notifications`

### 3.1 Neutralizar migrations que não aguentam rodar de novo
Se o histórico de migrations for reexecutado por engano, estas causam dano:

| Migration | Dano se rodar de novo | Correção |
|---|---|---|
| `20261008150000_create_todoo_system.sql` | Recria policies com `OR has_matriz_access()`, que **vazam dados entre empresas** | `CREATE TABLE IF NOT EXISTS` e trocar os `CREATE POLICY` por `DROP POLICY IF EXISTS` + policies atuais (ou remover o bloco de policies) |
| `20261008160000_add_todoo_referrals_and_goals.sql` | Falha no `CREATE POLICY` e pega lock em `contacts` sem timeout | `IF NOT EXISTS`, `DROP POLICY IF EXISTS` e `lock_timeout` |
| `20261016120000_todoo_stages.sql` | Recria o trigger `todoo_leads_sync_stage`, que **zera a etapa dos leads** | Remover a criação do trigger (ele foi dropado em `cadence.sql:19-20`) |
| `20261016150000_todoo_cadence.sql` | O backfill refaz SLA, etapa e histórico de todos os leads | Guardar o backfill com `WHERE stage_id IS NULL` |
| `20261016180000_todoo_lead_history.sql` | Duplica o histórico importado | `WHERE NOT EXISTS` nas duas importações |

Editar migrations já aplicadas não muda produção: só protege contra uma reexecução acidental. Isso não substitui a regra de nunca usar `--include-all`.

### 3.2 Policy de INSERT em `notifications`
- **Problema:** `20260715001448_create_notifications_table.sql:24-29` só checa `company_id`. Qualquer usuário cria notificação com título e link arbitrários para qualquer `user_id`, e agora isso vira toast em tempo real.
- **Correção:** a nova policy exige que o destinatário seja da mesma empresa:
  ```sql
  WITH CHECK (company_id = current_company_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = user_id AND p.company_id = company_id))
  ```
  Antes, procurar quem insere notificações pelo cliente (`grep -rn "from(\"notifications\")" src`) para não quebrar nenhum fluxo. Se só triggers e o servidor inserem, melhor ainda: remover o INSERT para `authenticated`.

### 3.3 Itens menores do banco (mesma migration)
- **`todoo_register_contacts`:**
  - validar a unidade da indicadora; se o usuário não tiver acesso a ela, usar o nome digitado em vez do nome salvo;
  - adicionar `pg_advisory_xact_lock` pelo telefone normalizado contra cadastro em dobro.
- **Índices** em `todoo_referrals(referred_contact_id)`, `todoo_referrals(referrer_contact_id)`, `todoo_leads(stage_id)` e `todoo_leads(card_status_id)`.
  - Criar com `CREATE INDEX CONCURRENTLY`, fora de transação e um por vez.
  - Rodar num horário calmo, porque `todoo_referrals` aponta para `contacts`.

---

## Fase 4 — Métricas confiáveis

- **4.1 RPCs de agregação no banco.** Criar `todoo_ranking(period)`, `todoo_metrics(period)` e `todoo_campaign_stats()`. Hoje Gincana, Indicadores e lista de ações trazem todos os leads para o navegador, e o PostgREST corta em 1.000 linhas.
  - **Antes:** conferir o `max_rows` no painel do Supabase.
- **4.2 Gincana pelo histórico.** Pontuar por `todoo_lead_history` em vez do status atual: quem agendou e depois fechou mantém os +5. Aplicar o piso de zero só no total da pessoa, não lead a lead.
- **4.3 "SLA no prazo" correto.** O numerador e o denominador devem vir do mesmo conjunto; hoje a taxa pode dar negativa.
- **4.4 Cadência agendada.** Rodar `todoo_refresh_cadence` por pg_cron a cada 15 minutos para todas as empresas, e tirar a chamada a cada busca do front (`todoo-stages.ts:155`).
- **4.5 Typecheck.** Gerar os tipos do Supabase com as tabelas `todoo_*` (remove os ~124 `as any`) e adicionar o script `typecheck` com memória maior, ou checar só `src/components/todoo`.
- **4.6 Criação de ação numa RPC transacional** (`todoo_create_campaign`), substituindo a correção curta da 1.3.

---

## Fase 5 — Produto (precisa de decisão sua)

| Tema | Opções |
|---|---|
| "Redistribuir lead se o SLA expirar" não faz nada | Implementar no pg_cron da 4.4 **ou** esconder o checkbox |
| Pausar uma ação não tira os leads da fila | Filtrar `todoo_campaigns.status = 'active'` no Quadro e no Meu Dia? |
| Sem detalhe do lead | Gaveta com histórico (`todoo_lead_history`), notas, reatribuir e excluir |
| Script e oferta da campanha fora do "Enviar mensagem" | Oferecer o `message_template` no diálogo e unificar `{x}` e `{{x}}` no `fillQuickMessageVariables` |
| Metas da campanha invisíveis e `target_count` com dois sentidos | Separar `lead_count` de `target_conversions` e mostrar o progresso no card |
| "Sem interesse" volta sozinho depois de 30 dias | Confirmar se é a regra desejada |
| Textos | Padronizar: **Fechou** (ganho), **Sem interesse** (perdido), **Sem sucesso** (só a coluna de quarentena), **Orçamento** (quoted), **Ação Comercial** (nunca "campanha") |
| Permissões por cargo × aba | "Ajustar metas", "Etapas" e Painel da Equipe usam o cargo; decidir se passam a usar `todoo:<aba>` |

---

## Ordem de execução

1. **Fase 1:** um commit `fix(todoo): …` e teste manual.
2. **Fase 2:** consultas de verificação, migration, repair e teste com um lead de teste.
3. **Fase 3:** começar pela 3.2 (`notifications`, que é segurança); depois a 3.1 e a 3.3.
4. **Fases 4 e 5:** depois das suas decisões.
