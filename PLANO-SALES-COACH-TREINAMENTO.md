# Plano de Implementação: Arena de Treinamento de Vendas (Sales Coach)

## 📌 1. Visão Geral do Projeto

Criar uma **Arena de Treinamento e Simulação de Vendas com IA** integrada ao Atendi, onde consultoras de vendas praticam atendimentos realistas "às cegas" (sem temas prévios) contra leads virtuais gerados por IA. 

O sistema é alimentado por um **Minerador de Objeções com IA**, que lê as conversas reais do WhatsApp e Instagram da empresa para identificar e ranquear as maiores objeções e motivos de perda da semana/mês. As simulações usam essas objeções reais em tempo de execução. Ao final de cada atendimento, um **Sales Coach com IA** analisa o desempenho e entrega um **Scorecard de Performance (0 a 10)** dinâmico e parametrizável no prompt, além da comparação prática: **"O que a consultora falou vs O que ela poderia ter falado"**.

---

## 🎯 2. Objetivos Principais

1. **Simulação Realista "Às Cegas" (Blind Roleplay):**
   - A consultora não vê rótulos como *"Hoje é objeção de preço"*. Ela inicia um atendimento como se fosse um lead normal chegando pelo WhatsApp/Instagram.
   - A IA do lead se comporta com base no perfil da empresa, conduzindo a conversa organicamente e soltando objeções reais no momento oportuno.
2. **Minerador de Objeções Reais (Painel do Administrador):**
   - A IA varre o histórico recente de conversas reais (`conversations` e `messages`) da empresa.
   - Identifica os padrões de objeção mais frequentes (ex: *preço alto*, *falar com cônjuge*, *falta de tempo*, *concorrente*).
   - Exibe métricas semanais/mensais para a diretoria comercial e alimenta automaticamente os cenários de simulação.
3. **Scorecard de Performance Dinâmico (Parametrizável no Prompt):**
   - Avaliação em critérios personalizáveis (padrão):
     - **Condução do Funil:** [0 a 10]
     - **Investigação de Dor:** [0 a 10]
     - **Construção de Valor:** [0 a 10]
     - **Ancoragem de Preço:** [0 a 10]
     - **Contorno de Objeções:** [0 a 10]
     - **Chance de Conversão:** [0 a 10]
     - **NOTA GERAL:** [0 a 10]
   - O gestor pode alterar ou adicionar critérios facilmente editando o prompt nas configurações da empresa.
4. **Análise Comparativa ("O que falou vs O que poderia ter falado"):**
   - Destaque dos pontos de inflexão da conversa, mostrando a mensagem real enviada pela consultora, a alternativa recomendada pelo Coach e a justificativa tática.
5. **Dashboard do Gestor Comercial:**
   - Mapa de calor de competências da equipe (onde as consultoras mais erram).
   - Ranking de notas por consultora e histórico de evolução.

---

## 🏗️ 3. Arquitetura Técnica

### 3.1 Banco de Dados (Supabase Migration)

#### Tabela `public.sales_objection_insights`
Armazena a inteligência de objeções mineradas das conversas reais da empresa.
* `id` (UUID, PK, default gen_random_uuid())
* `company_id` (UUID, FK companies, CASCADE)
* `period_type` (TEXT: `'week' | 'month'`)
* `period_start` (TIMESTAMPTZ)
* `period_end` (TIMESTAMPTZ)
* `objections_data` (JSONB): Array de objetos `{ category: string, percentage: number, description: string, sample_quotes: string[], count: number }`
* `total_analyzed_conversations` (INTEGER)
* `created_at` (TIMESTAMPTZ, default now())
* `created_by` (UUID, FK profiles)

#### Tabela `public.sales_training_sessions`
Armazena as sessões de treino executadas pelas consultoras.
* `id` (UUID, PK, default gen_random_uuid())
* `company_id` (UUID, FK companies, CASCADE)
* `user_id` (UUID, FK profiles, SET NULL)
* `lead_name` (TEXT)
* `lead_channel` (TEXT: `'whatsapp' | 'instagram'`)
* `hidden_scenario` (TEXT) - Objeção/comportamento sorteado nos bastidores
* `status` (TEXT: `'in_progress' | 'completed' | 'abandoned'`)
* `scorecard_json` (JSONB) - Critérios dinâmicos avaliados, notas e feedbacks
* `overall_score` (NUMERIC(4,2))
* `outcome` (TEXT: `'won' | 'lost' | 'in_progress'`)
* `feedback_markdown` (TEXT)
* `started_at` (TIMESTAMPTZ, default now())
* `completed_at` (TIMESTAMPTZ)

#### Tabela `public.sales_training_messages`
Armazena o histórico do chat de cada treino.
* `id` (UUID, PK, default gen_random_uuid())
* `session_id` (UUID, FK sales_training_sessions, CASCADE)
* `sender_type` (TEXT: `'lead' | 'trainee' | 'coach_whisper'`)
* `content` (TEXT)
* `created_at` (TIMESTAMPTZ, default now())

---

### 3.2 Server Functions (`src/lib/api/training.functions.ts`)

1. **`mineCompanyObjectionsAction`**:
   - Varre as últimas mensagens/conversas reais da empresa no período selecionado.
   - Envia ao LLM para identificar as maiores hesitações e objeções dos clientes.
   - Salva em `sales_objection_insights`.
2. **`fetchObjectionInsightsAction`**:
   - Retorna as últimas objeções mineradas para a empresa ativa.
3. **`startBlindTrainingSessionAction`**:
   - Sorteia uma das objeções mineradas ativas (ou um fallback realista caso ainda não haja mineração).
   - Cria o registro na `sales_training_sessions`.
   - Gera a 1ª mensagem de abertura do cliente no chat.
4. **`sendTrainingMessageAction`**:
   - Recebe a mensagem da consultora.
   - Executa o LLM como "Lead Simulado" mantendo o papel estrito.
   - Salva e retorna a réplica do lead.
5. **`finishTrainingSessionAction`**:
   - Recupera a conversa completa.
   - Lê o prompt de avaliação customizado em `companies.ai_settings.sales_coach_evaluation_prompt` (ou usa o prompt padrão dos 6 pilares).
   - Executa a IA como Coach Avaliador.
   - Extrai o Scorecard JSON e a tabela comparativa.
   - Salva e finaliza a sessão.
6. **`fetchTrainingSessionsAction`**:
   - Lista os treinos realizados pela consultora ou por toda a equipe (com filtros de data e status).

---

### 3.3 Interface do Usuário (`/training`)

* **Menu Lateral:** Adição do item `Treinamento de Vendas` (ícone `GraduationCap` ou `Target`).
* **Tela Principal com 3 Abas:**
  1. **Aba "Arena de Treino":**
     - Interface de chat limpa e imersiva estilo WhatsApp.
     - Cabeçalho com foto e nome do lead fictício.
     - Balões de conversa dinâmicos com status "digitando...".
     - Botão em destaque: "Encerrar e Avaliar Atendimento".
  2. **Aba "Relatório de Avaliação":**
     - Scorecard visual interativo com barras de notas coloridas (Verde >= 8, Amarelo 6-7.9, Vermelho < 6).
     - Badge do resultado da venda (Venda Realizada 🎉 vs Venda Perdida ❌).
     - Tabela comparativa "O que você falou" vs "O que você poderia ter falado".
     - Feedback executivo e pontos fortes/a melhorar.
  3. **Aba "Gestão & Objeções" (Apenas Admins/Gestores):**
     - Botão para disparar nova mineração de dados reais.
     - Gráfico e cards com as maiores objeções da semana/mês com trechos reais anonimizados.
     - Ranking de consultoras por nota média e radar de gargalos da equipe.

---

### 3.4 Configurações de IA (`settings.tsx`)

* Adição na aba de configurações de IA:
  - **Prompt de Avaliação do Sales Coach:** Área de texto editável com os critérios de notas e instruções para o LLM.
  - **Modelo de IA do Treinamento:** Seleção de modelo (ex: GPT-4o-mini, Groq Llama 3 70B, etc.).

---

## 📋 4. Etapas de Execução

1. **[x] Planejamento e Especificação Técnica** (este documento).
2. **[ ] Migration do Banco de Dados:** Criar tabelas e políticas RLS no Supabase.
3. **[ ] Criação das Server Functions:** Implementar `training.functions.ts` com mineração, geração de lead e avaliação.
4. **[ ] Permissões & Navegação:** Atualizar `permissions.ts` e `app-sidebar.tsx`.
5. **[ ] Criação da Página `/training`:** Montar a interface completa com Chat, Scorecard e Painel de Objeções.
6. **[ ] Configuração no Painel de Configurações:** Permitir editar o prompt do scorecard.
7. **[ ] Testes e Validação:** Executar testes ponta a ponta e validar com build do projeto.
