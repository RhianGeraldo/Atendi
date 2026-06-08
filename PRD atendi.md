# PRD — Plataforma de Atendimento Omnichannel + CRM

**Versão:** 1.0 | **Data:** Junho 2025 | **Classificação:** Confidencial — Uso Interno

---

## Índice

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Objetivos de Negócio](#2-objetivos-de-negócio)
3. [Arquitetura Multi-Empresa](#3-arquitetura-multi-empresa)
4. [Perfis de Usuário e Permissões](#4-perfis-de-usuário-e-permissões)
5. [Módulo de Atendimento](#5-módulo-de-atendimento)
6. [Módulo CRM](#6-módulo-crm)
7. [Módulo de Relatórios e Métricas](#7-módulo-de-relatórios-e-métricas)
8. [Módulo de Configurações](#8-módulo-de-configurações)
9. [Requisitos Não-Funcionais](#9-requisitos-não-funcionais)
10. [Fluxos Principais](#10-fluxos-principais)
11. [Roadmap de Entrega Sugerido](#11-roadmap-de-entrega-sugerido)
12. [Integrações Externas](#12-integrações-externas)
13. [Glossário](#13-glossário)

---

## 1. Visão Geral do Produto

| | |
|---|---|
| **Objetivo** | Construir uma plataforma de atendimento multicanal (WhatsApp + Instagram Direct) integrada a um CRM próprio, com arquitetura multi-empresa e multi-unidade, que centralize a gestão de conversas, oportunidades de venda, agendamentos e pós-venda. |
| **Público-alvo** | Empresas com múltiplas unidades/franquias que precisam de controle centralizado e visibilidade consolidada dos atendimentos de todas as unidades. |
| **Escopo v1** | Aplicação web responsiva. App mobile e funcionalidades de IA ficam fora do escopo desta versão, mas a arquitetura deve suportá-los. |
| **Modelo de negócio** | Uso interno nesta versão. Arquitetura preparada para evolução futura como SaaS multi-tenant. |

---

## 2. Objetivos de Negócio

A plataforma deve suportar os seguintes objetivos de forma integrada:

- **Vendas e conversão** — captura e gestão de leads via WhatsApp e Instagram com funil visual de oportunidades
- **Suporte ao cliente** — atendimento organizado por departamentos com filas e SLA monitorados
- **Pós-venda e fidelização** — histórico completo do cliente acessível ao agente, tags de segmentação e follow-ups
- **Agendamentos** — criação e gestão de agendamentos diretamente no atendimento

---

## 3. Arquitetura Multi-Empresa

### 3.1 Hierarquia Organizacional

A plataforma segue uma hierarquia de três níveis:

| Nível | Entidade | Descrição |
|---|---|---|
| 1 | Empresa Mãe | Entidade raiz. Gerencia todas as unidades, usuários e conexões globais. |
| 2 | Unidade / Filial | Entidade operacional com seus próprios números de WhatsApp, departamentos e agentes. |
| 3 | Departamento / Setor | Divisão dentro de uma unidade. Possui fila própria e agentes designados. |

### 3.2 Conexões WhatsApp e Instagram

Cada nível pode ter múltiplas conexões de canal:

- A Empresa Mãe pode ter N conexões WhatsApp/Instagram que recebem contatos e os redirecionam para unidades filhas
- Cada Unidade pode ter N conexões WhatsApp/Instagram independentes
- Dentro de cada conexão, configura-se quais Departamentos atendem aquele número
- O roteamento entre conexões é configurável por regras (horário, palavra-chave, menu de opções)

### 3.3 Regras de Visibilidade

| Perfil | O que pode ver/fazer |
|---|---|
| Admin Empresa Mãe | Todas as unidades, todos os atendimentos, todos os relatórios, configurações globais e de qualquer unidade |
| Gerente de Unidade | Somente a(s) unidade(s) às quais foi associado. Pode atender ou apenas supervisionar (configurável). Acessa relatórios da sua unidade. |
| Atendente | Somente os atendimentos do(s) departamento(s) ao(s) qual(is) foi designado na(s) sua(s) unidade(s). |

---

## 4. Perfis de Usuário e Permissões

Todos os usuários são cadastrados na Empresa Mãe e recebem acesso a unidades específicas.

### 4.1 Admin da Empresa Mãe

- Criar, editar e desativar unidades e departamentos
- Criar e gerenciar todos os usuários da plataforma
- Definir quais unidades/departamentos cada usuário acessa
- Configurar conexões de WhatsApp e Instagram globais
- Visualizar relatórios consolidados de todas as unidades
- Configurar regras de roteamento entre unidades
- Acesso total ao CRM de qualquer unidade

### 4.2 Gerente de Unidade

- Supervisionar atendimentos em tempo real da(s) sua(s) unidade(s)
- Pode ser configurado para: **somente visualizar** OU **visualizar + atender**
- Criar e gerenciar departamentos dentro de sua unidade
- Gerenciar agentes da sua unidade (adicionar, remover, editar)
- Acessar e configurar conexões WhatsApp/Instagram da unidade
- Visualizar relatórios e métricas da unidade
- Transferir atendimentos entre agentes/departamentos
- Acessar histórico completo de atendimentos da unidade

### 4.3 Atendente

- Visualizar e responder atendimentos da sua fila / departamento
- Criar e atualizar oportunidades no CRM
- Registrar tarefas e follow-ups
- Transferir atendimentos para outro agente ou departamento
- Visualizar histórico de contato do cliente
- Enviar arquivos, áudios, vídeos, imagens e documentos
- Criar agendamentos vinculados ao atendimento

### 4.4 Configuração de Departamentos por Usuário

Um usuário pode ser associado a múltiplos departamentos dentro de uma ou mais unidades. A configuração é feita pelo Admin da Empresa Mãe ou pelo Gerente de Unidade. Cada associação define:

- Unidade de atuação
- Departamento(s) dentro da unidade
- Perfil de atuação naquele departamento (atendente ou gerente)

---

## 5. Módulo de Atendimento

### 5.1 Inbox / Caixa de Atendimentos

- Visão unificada de todas as conversas da fila do agente
- Filtros: status (aguardando, em atendimento, resolvido), departamento, agente, canal, data, tags
- Indicadores visuais de: tempo de espera, SLA, canal de origem (WhatsApp / Instagram)
- Busca por nome, número ou conteúdo de mensagem
- Notificações em tempo real de novas mensagens e transferências
- Indicador de quem está atendendo o contato (presença)

### 5.2 Tela de Atendimento

- Histórico completo da conversa com suporte a texto, imagem, áudio, vídeo e documento
- Painel lateral com dados do contato e histórico de atendimentos anteriores
- Oportunidade(s) vinculada(s) ao contato exibidas no painel lateral
- Tarefas e follow-ups vinculados
- Campo de texto com suporte a emojis, formatação básica e templates de resposta rápida
- Envio de arquivos multimídia (imagem, áudio, vídeo, documento)
- Ações: transferir, encerrar, adicionar tag, criar oportunidade, criar agendamento
- Notas internas visíveis apenas para a equipe (não enviadas ao cliente)

### 5.3 Gestão de Filas e Departamentos

- Cada departamento possui sua fila de atendimentos
- Roteamento configurável: manual (agente aceita da fila) ou automático por round-robin
- Limite de atendimentos simultâneos por agente (configurável)
- Tempo máximo de espera com alerta e possibilidade de redistribuição automática
- Transferência entre departamentos com registro do motivo

### 5.4 Canais Suportados (v1)

- **WhatsApp Business API** — texto, imagem, áudio, vídeo, documento, localização, contatos
- **Instagram Direct** — texto, imagem, vídeo, stories reply
- Identificação automática do canal na conversa
- Um contato pode ter conversas em múltiplos canais — histórico unificado

### 5.5 Templates e Respostas Rápidas

- Biblioteca de templates de mensagem por departamento ou global
- Templates aprovados para WhatsApp Business (HSM) para iniciar conversas
- Respostas rápidas acionadas por atalho de texto (ex: `/saudacao`)
- Variáveis dinâmicas nos templates: `{{nome}}`, `{{unidade}}`, `{{agente}}`

### 5.6 Preparação para IA (Fase Futura)

- Arquitetura de webhook para integração com APIs externas de IA (OpenAI, Claude, etc.)
- Ponto de extensão no fluxo de triagem: antes de atribuir a um agente humano, a mensagem pode ser processada por um bot
- A IA poderá: responder perguntas frequentes, coletar dados iniciais, criar oportunidades e encaminhar para o departamento correto
- Estrutura de "handoff" bot → humano com contexto preservado

---

## 6. Módulo CRM

### 6.1 Gestão de Contatos

- Cadastro unificado com: nome, telefone(s), e-mail, empresa, tags, canal de origem
- Histórico completo de atendimentos, oportunidades, tarefas e agendamentos por contato
- Deduplicação automática por número de telefone
- Segmentação por tags e campos customizados
- Importação de contatos via CSV
- Busca e filtro avançado de contatos

### 6.2 Funil de Vendas (Pipeline)

- Visualização **Kanban** com colunas de estágios configuráveis por unidade ou global
- Criação de oportunidades vinculadas a um contato e a uma conversa
- Campos da oportunidade: título, valor estimado, responsável, data prevista de fechamento, tags, notas
- Histórico de movimentações entre estágios com timestamp e usuário
- Múltiplos funis por unidade (ex: funil de vendas, funil de pós-venda)
- Drag-and-drop para mover oportunidades entre estágios

### 6.3 Tarefas e Follow-ups

- Criação de tarefas vinculadas a contato, oportunidade ou atendimento
- Campos: título, descrição, responsável, data de vencimento, prioridade, status
- Notificação de tarefas vencidas ou próximas do vencimento
- Visualização em lista e calendário
- Filtro por responsável, status, prioridade e data

### 6.4 Agendamentos

- Criação de agendamento diretamente no atendimento ou no CRM
- Campos: contato, data/hora, tipo de serviço, agente/responsável, unidade, observações
- Calendário de agendamentos por agente e por unidade
- Envio de confirmação automática via WhatsApp (template pré-aprovado)
- Cancelamento e reagendamento com notificação ao cliente

### 6.5 Segmentação e Tags

- Tags livres aplicáveis a contatos, conversas e oportunidades
- Tags padronizadas configuradas pelo admin (ex: Lead Quente, Cliente VIP)
- Filtro e busca por tag em qualquer módulo
- Relatório de volume por tag

### 6.6 Campanhas e Disparo em Massa

- Criação de lista de contatos por filtro (tag, unidade, status, etc.)
- Seleção de template HSM aprovado no WhatsApp
- Agendamento de disparo com data e hora
- Controle de status por contato: enviado, entregue, lido, respondeu
- Limitação de envio para respeitar políticas do WhatsApp Business
- Relatório de performance da campanha

---

## 7. Módulo de Relatórios e Métricas

### 7.1 Painel em Tempo Real

- Atendimentos abertos, em espera e finalizados (por unidade, departamento e agente)
- Agentes online e suas cargas atuais
- Tempo médio de espera na fila
- Alertas de SLA ultrapassado

### 7.2 Relatórios Históricos

| Relatório | Métricas Incluídas |
|---|---|
| Volume de Atendimentos | Total por período, por unidade, por departamento, por agente, por canal |
| TMA — Tempo Médio de Atendimento | Tempo médio de resolução por agente, departamento e unidade |
| SLA e Tempo de Resposta | % de atendimentos dentro do SLA, tempo médio de primeira resposta |
| Conversão do Funil | Taxa de conversão por estágio, valor total, número de oportunidades |
| NPS / Satisfação | Avaliação de encerramento de atendimento (CSAT), média por agente |
| Desempenho por Agente | Volume, TMA, SLA, conversões, tarefas concluídas |
| Campanhas | Disparos enviados, entregues, lidos, respondidos, conversões |

### 7.3 Filtros dos Relatórios

- Período: hoje, esta semana, este mês, período customizado
- Unidade(s), departamento(s), agente(s)
- Canal (WhatsApp, Instagram)
- Exportação em CSV e PDF

---

## 8. Módulo de Configurações

### 8.1 Configurações Globais (Admin Empresa Mãe)

- Gerenciar unidades: criar, editar, ativar/desativar
- Gerenciar usuários: criar, editar, associar a unidades/departamentos, definir perfil
- Configurar conexões de canais da Empresa Mãe
- Definir regras de roteamento entre Empresa Mãe e Unidades
- Configurar horários de atendimento globais
- Gerenciar templates e respostas rápidas globais

### 8.2 Configurações de Unidade (Gerente)

- Gerenciar departamentos: criar, editar, ordenar, ativar/desativar
- Adicionar e configurar conexões WhatsApp e Instagram da unidade
- Definir agentes por departamento
- Configurar filas: round-robin ou manual, limite de atendimentos por agente
- Definir horários de atendimento por departamento
- Mensagens automáticas: saudação inicial, fora do horário, tempo de espera
- Configurar estágios do funil de vendas
- Gerenciar templates e respostas rápidas da unidade
- Configurar campos de SLA por departamento

### 8.3 Conexões de Canal

- Suporte a múltiplas conexões WhatsApp Business API por unidade
- Suporte a múltiplas conexões Instagram Direct por unidade
- Por conexão: definir nome, departamentos que atendem, mensagem de boas-vindas
- Status da conexão em tempo real (ativa, desconectada, limitada)
- Log de eventos da conexão

---

## 9. Requisitos Não-Funcionais

| Categoria | Requisito |
|---|---|
| **Desempenho** | Mensagens entregues ao agente em < 2s. Interface responsiva com carregamento inicial < 3s. |
| **Escalabilidade** | Arquitetura preparada para suportar centenas de unidades e milhares de conversas simultâneas. |
| **Disponibilidade** | SLA de 99,5% de uptime. Rollback em < 15 min em caso de falha crítica. |
| **Segurança** | Autenticação segura (JWT + refresh token). Dados criptografados em trânsito (TLS) e em repouso. Isolamento total de dados entre empresas. |
| **Multi-tenancy** | Isolamento completo de dados por empresa. Um bug em uma empresa não afeta outra. |
| **Auditoria** | Log de ações críticas: acesso, alterações de configuração, transferências, encerramentos. |
| **LGPD** | Suporte a exclusão de dados de contato a pedido. Registro de consentimento. |
| **Extensibilidade** | API REST documentada para integração futura com IA, ERPs e sistemas externos. |

---

## 10. Fluxos Principais

### 10.1 Fluxo de Recebimento de Mensagem

1. Cliente envia mensagem pelo WhatsApp ou Instagram
2. Webhook recebe a mensagem e identifica a conexão (número/conta)
3. Sistema verifica horário de atendimento da conexão/departamento
4. Se fora do horário → envia mensagem automática de ausência
5. Se dentro do horário → exibe menu de departamentos (se configurado) ou roteia diretamente
6. Contato é identificado ou criado no CRM
7. Conversa é colocada na fila do departamento
8. Agente disponível recebe a conversa (automático ou aceita manualmente)
9. Atendimento ocorre. Agente registra informações no CRM
10. Encerramento: agente finaliza → sistema solicita avaliação ao cliente (opcional)

### 10.2 Fluxo de Roteamento Empresa Mãe → Unidade

1. Mensagem chega em número da Empresa Mãe
2. Sistema exibe menu de seleção de unidade (ex: "Digite 1 para Unidade SP, 2 para Unidade RJ")
3. Cliente seleciona unidade
4. Conversa é transferida para a fila da unidade selecionada
5. A partir daí segue o fluxo padrão da unidade

### 10.3 Fluxo de Criação de Oportunidade

1. Durante ou após atendimento, agente clica em "Criar Oportunidade"
2. Preenche: título, valor estimado, estágio inicial, data prevista
3. Oportunidade é vinculada ao contato e à conversa
4. Aparece no Kanban do funil da unidade
5. Agente move a oportunidade entre estágios conforme avança a negociação

---

## 11. Roadmap de Entrega Sugerido

| Fase | Prazo Est. | Escopo |
|---|---|---|
| **1** | MVP — 8 semanas | Estrutura multi-empresa/unidade, perfis de usuário, conexão WhatsApp, inbox de atendimentos, chat em tempo real (texto + mídia), filas por departamento |
| **2** | +4 semanas | CRM: contatos, funil Kanban, histórico por contato, transferências, tags, notas internas, templates e respostas rápidas |
| **3** | +3 semanas | Relatórios e métricas, painel em tempo real, exportação CSV/PDF, avaliação de atendimento (CSAT) |
| **4** | +3 semanas | Instagram Direct, agendamentos, campanhas e disparo em massa, tarefas e follow-ups |
| **5** | Futuro | App mobile, integração de IA via API, SaaS multi-tenant, novos canais |

---

## 12. Integrações Externas

| Integração | Fase | Descrição |
|---|---|---|
| WhatsApp Business API | Fase 1 | Envio e recebimento de mensagens, templates HSM, webhooks de status |
| Instagram Graph API | Fase 4 | Recebimento e envio de Direct Messages via webhooks |
| API de IA (OpenAI / Claude / outro) | Fase 5 | Chatbot de triagem inicial com handoff para agente humano |
| Webhooks de saída | Fase 2 | Notificar sistemas externos sobre eventos (nova mensagem, encerramento, etc.) |

---

## 13. Glossário

| Termo | Definição |
|---|---|
| **Empresa Mãe** | Entidade raiz do sistema. Proprietária de todas as unidades. |
| **Unidade / Filial** | Entidade operacional vinculada à Empresa Mãe com seus próprios canais e equipes. |
| **Departamento / Setor** | Subdivisão dentro de uma unidade com fila própria. |
| **Conexão** | Número de WhatsApp ou conta Instagram vinculado a uma unidade ou à Empresa Mãe. |
| **Oportunidade** | Registro de uma negociação em andamento no funil de vendas. |
| **HSM** | Highly Structured Message — template de mensagem aprovado pelo WhatsApp para iniciar conversas. |
| **SLA** | Service Level Agreement — prazo máximo para resposta ou resolução de atendimento. |
| **TMA** | Tempo Médio de Atendimento — duração média de um atendimento do início ao encerramento. |
| **CSAT** | Customer Satisfaction Score — avaliação de satisfação do cliente ao final do atendimento. |
| **Handoff** | Transferência do atendimento de um bot de IA para um agente humano. |

---

*PRD — Plataforma de Atendimento Omnichannel + CRM | v1.0 | Junho 2025 | Confidencial*
