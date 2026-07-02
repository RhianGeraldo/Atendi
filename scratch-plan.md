# Redesign do Sales Coach IA - Melhoria de UX/UI

O problema atual é que a barra lateral direita (`ContactSidebar`) tem um limite rígido de `320px`. Tentar espremer uma Tabela de Análise de IA (com colunas como "Item", "Avaliação" e "Trecho de Referência") junto com botões de ação e outras abas (CRM, Jornada, etc.) dentro desse espaço minúsculo resulta em um layout claustrofóbico, quebrado ou ilegível.

A UX ideal para um "Co-piloto" de vendas não deve competir por espaço com informações básicas do contato.

## Proposta de Novo Layout (UX/UI)

### 1. Remover o Sales Coach da Sidebar (Ficha do Contato)
A ficha do contato deve ser reservada para CRM, Etiquetas e Jornada. O Sales Coach precisa de mais espaço para exibir as análises detalhadas e as sugestões táticas sem poluir a tela.

### 2. O Sales Coach como um "Drawer" (Painel Deslizante) Inferior ou Sobreposto
Em vez de uma aba espremida, o clique no botão do "Bot" no painel de chat pode abrir um painel sobreposto (Sheet) elegante, ou expandir uma área dedicada que cubra parcialmente o histórico de mensagens, mas não quebre o layout lateral.
*Alternativa recomendada*: Usar um **Sheet** (modal lateral) que se sobrepõe à interface vindo da direita, mas com largura generosa (`w-[500px]` ou `w-[600px]`), dando respiro total para a leitura da análise.

### 3. Foco na "Sugestão Prática" (Micro-UI)
A tabela de análise é importante para o gestor, mas o vendedor precisa de agilidade.
Na interface do Chat, podemos ter um componente flutuante (Tooltip ou Banner logo acima do input) mostrando apenas a **Sugestão de Resposta** (o "O que falar agora"). Se o vendedor quiser ler a análise completa, ele clica para expandir.

## Plano de Ação Técnico

1. **Reverter a aba**: Remover o `SalesCoachTab` de dentro do `ContactDetailsTabs`.
2. **Nova Interface Ampla**: Transformar o `SalesCoachTab` em um `Sheet` dedicado (ou painel expansível) que é ativado pelo ícone do Bot no ChatPanel, com largura de 500px.
3. **Restaurar Sidebar Original**: Garantir que a barra lateral volte ao seu estado limpo original de 320px apenas para CRM/Notas.
4. **UX do Input**: Manter o evento de injetar o texto no input quando o usuário clicar em "Usar sugestão", fechando o painel automaticamente.
