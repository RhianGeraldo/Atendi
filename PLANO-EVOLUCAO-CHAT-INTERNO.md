# Roadmap de Evolução: Chat Interno da Equipe (Multiunidades) 🚀

Este documento define o plano completo de melhorias e funcionalidades para o Chat Interno do **Atendi**, permitindo comunicação fluida entre matriz, filiais, equipes de atendimento e gestão.

---

## 📋 Checklist Geral dos 5 Pilares

- [ ] **Pilar 1: Integração Nativa com Atendimentos & Leads (CRM)**
  - [ ] Compartilhamento de Lead/Conversa via Card Interativo (Nome, Telefone, Unidade, Botão "Abrir Atendimento").
  - [ ] Envio de Notas Internas de um ticket para o chat da equipe em 1 clique.
  - [ ] Transferência assistida de atendimento com notificação no chat.

- [x] **Pilar 2: Recursos Modernos de Mensageria (CONCLUÍDO)**
  - [x] Menções com `@` (`@Nome`, autocompletar membros do canal com dropdown).
  - [x] Envio de Mídias e Arquivos (Fotos, PDFs, Documentos) pelo botão de anexo.
  - [x] Colar imagens da área de transferência com `Ctrl + V`.
  - [x] Gravação e Envio de Áudio Rápido Interno (microfone com player integrado).
  - [x] Reações com Emojis nas mensagens (👍, ❤️, 🚀, 👀, ✅, etc.) em tempo real.

- [x] **Pilar 3: Tempo Real, Presença & Notificações (CONCLUÍDO)**
  - [x] Presença Online (Bolinha verde pulsante de colaboradores logados no CRM, status na sidebar e cabeçalho).
  - [x] Indicador de Digitando (*Typing indicator* com 3 pontinhos saltitantes via Supabase Broadcast).
  - [x] Alertas sonoros clássicos do ICQ ("Uh-oh!") ao receber nova mensagem e toasts para menções.
  - [x] Notificações Push nativas no navegador (Web Notification API) para DMs e mensagens em segundo plano.

- [x] **Pilar 4: Gestão, Avisos & Moderação da Diretoria (CONCLUÍDO)**
  - [x] Fixar Mensagens Importantes no topo do canal (Pin com banner suspenso, atalho de scroll e desfixação).
  - [x] Canais de "Avisos da Matriz" com bloqueio somente-leitura para operadores e permissão para reações de emoji.
  - [x] Moderação completa: Exclusão com soft delete (`🚫 Esta mensagem foi apagada`) e edição com indicador `(editada)`.

- [x] **Pilar 5: Produtividade, Busca & Mídias (CONCLUÍDO)**
  - [x] Busca textual no histórico do canal ativo com atalho `Ctrl + F`, navegação entre resultados e destaque luminoso.
  - [x] Galeria consolidada de arquivos e mídias compartilhadas no canal (Fotos, Documentos e Áudios com mini-player).

---

## 🎯 Fase Atual: Pilar 2 — Recursos Modernos de Mensageria

### 1. Menções com `@`
* Ao digitar `@`, renderiza popup suspenso com lista de membros do canal/empresa.
* Destaque visual (estilização de badge) na mensagem enviada.

### 2. Mídias, Anexos e Colar com `Ctrl + V`
* Suporte a upload para o bucket `media` do Supabase.
* Renderização elegante de imagens com visualizador expandido.
* Renderização de cards de documento/PDF com botão de download.
* Interceptação de `onPaste` para colar prints de tela diretamente no chat.

### 3. Gravação de Áudio
* Microfone no painel de digitação com indicador de gravação (tempo decorrido, cancelar e enviar).
* Player de áudio moderno dentro do balão de mensagem.

### 4. Reações Rápidas com Emojis
* Hover na mensagem com barra de reações rápidas (👍, ❤️, 😂, 🚀, 👀, ✅).
* Contador de reações agrupadas no rodapé do balão, atualizado via Realtime.
