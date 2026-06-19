# Conceito de Coexistência (COEX) no WhatsApp

## O que é COEX?
A **Coexistência (COEX)** é o estado em que um único número de telefone do WhatsApp está simultaneamente conectado à **API Oficial (WhatsApp Cloud API)** e ativo no aplicativo nativo (WhatsApp Messenger ou WhatsApp Business App) ou conectado através de uma **API Não Oficial**.

## Por que usar COEX?
A arquitetura do Atendi permite usar múltiplas APIs para aproveitar os pontos fortes de cada uma:

1. **API Oficial (Cloud API):**
   - **Vantagens:** Alta entregabilidade, segurança contra banimentos, capacidade de envio de grandes volumes de mensagens (10k, 100k, ilimitado). Ideal para campanhas de marketing em massa, automação de funis e notificações críticas de sistema utilizando **Templates Oficiais**.
   - **Limitações:** Custos por conversa (janela de 24 horas), restrições rígidas de templates e impossibilidade de iniciar conversas de texto livre sem um template pré-aprovado fora da janela de 24 horas.

2. **API Não Oficial (EvoGo/Baileys, etc.) / WhatsApp Business App:**
   - **Vantagens:** Não há custo por envio de mensagens, flexibilidade total para iniciar conversas de texto livre a qualquer momento, e integração com todo o histórico do aparelho do usuário de forma orgânica.
   - **Limitações:** Baixa tolerância para envios em massa (alto risco de banimento se utilizado para marketing disparado).

## Desafios Técnicos no CRM
A implementação do COEX no CRM traz alguns desafios técnicos que devem ser mapeados na nossa infraestrutura:

### 1. Duplicação de Mensagens Recebidas
Como o número estará ativo em duas fontes (Oficial via Webhooks da Meta e Não-Oficial via Webhooks EvoGo), uma mensagem enviada por um cliente chegará **duas vezes** no backend do Atendi.
- **Solução Planejada:** Utilizar o ID da mensagem remota (`remote_msg_id`) e a data/hora para realizar *deduplicação* na tabela de mensagens (`messages`), ou dar preferência de escuta a uma API específica enquanto o COEX estiver ativo.

### 2. Sincronização de Status de Leitura
As confirmações de leitura (ticks azuis) também chegarão duplicadas.
- **Solução Planejada:** O sistema deve tratar `status_updates` de forma idempotente.

### 3. Roteamento de Envio
Quando o atendente humano digitar uma mensagem na tela do Chat e clicar em "Enviar", por qual API o CRM deverá disparar?
- **Solução Planejada:** O envio 1:1 humano utilizará, preferencialmente, a API Não Oficial para economizar custos da Cloud API, exceto quando a sessão da Não Oficial estiver desconectada. Disparos em massa (Marketing) ou AI transacional utilizarão sempre a API Oficial com Templates.

---

*Este documento reflete a arquitetura planejada e serve como base para a implementação do controle de Coexistência no módulo do WhatsApp do CRM Atendi.*
