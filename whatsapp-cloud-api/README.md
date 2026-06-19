# Guia Completo: WhatsApp Cloud API (API Oficial da Meta)

> Passo a passo para conectar seu WhatsApp Business usando a API oficial da Meta.
> Nenhum conhecimento técnico necessário — siga cada etapa na ordem.

---

## O que você vai precisar antes de começar

- Uma conta pessoal no Facebook
- Uma Conta Comercial Meta (Meta Business Suite) — se não tem, vamos criar
- Um número de telefone que **NÃO esteja vinculado ao WhatsApp** (nem pessoal nem Business). Pode ser um chip novo ou número fixo que receba SMS ou ligação
- Um computador com navegador Chrome

---

## PARTE 1 — Conta Comercial Meta (Meta Business Suite)

### Passo 1.1 — Verificar se já tem uma conta comercial

1. Abra o navegador e acesse: **business.facebook.com**
2. Faça login com seu Facebook pessoal
3. Se aparecer seu painel do Meta Business Suite, você já tem uma conta. Pule para a Parte 2
4. Se pedir para criar, siga o passo 1.2

### Passo 1.2 — Criar conta comercial (se não tem)

1. Acesse **business.facebook.com/overview**
2. Clique em **"Criar conta"**
3. Preencha:
   - **Nome da conta comercial**: Nome da sua empresa
   - **Seu nome**: Seu nome completo
   - **E-mail comercial**: Um e-mail que você acessa
4. Clique **"Enviar"**
5. Confirme o e-mail que a Meta vai enviar pra caixa de entrada

---

## PARTE 2 — Criar o App na Meta (Meta for Developers)

### Passo 2.1 — Acessar o painel de desenvolvedores

1. Abra uma nova aba e acesse: **developers.facebook.com**
2. No canto superior direito, clique em **"Começar"** ou **"Log In"**
3. Faça login com o mesmo Facebook da Parte 1
4. Se for sua primeira vez, vai pedir para aceitar os termos de desenvolvedor. **Aceite todos**

### Passo 2.2 — Criar o App

1. No menu superior, clique em **"Meus Apps"**
2. Clique no botão verde **"Criar App"**
3. Na tela "O que você deseja que seu app faça?":
   - Selecione **"Outro"**
   - Clique **"Avançar"**
4. Na tela "Selecione um tipo de app":
   - Selecione **"Empresa"** (Business)
   - Clique **"Avançar"**
5. Preencha os dados do app:
   - **Nome do app**: Pode ser o nome da sua empresa (ex: "Minha Empresa WhatsApp")
   - **E-mail de contato**: Seu e-mail
   - **Conta comercial**: Selecione a conta que criou na Parte 1
6. Clique **"Criar app"**
7. Pode pedir sua senha do Facebook novamente. Digite e confirme

### Passo 2.3 — Adicionar o WhatsApp ao App

1. Você vai cair no **Painel do App**
2. Role a página para baixo até a seção de produtos
3. Procure **"WhatsApp"** e clique em **"Configurar"**
4. Na tela seguinte, selecione sua **Conta Comercial Meta** e clique **"Continuar"**

Pronto! O WhatsApp foi adicionado ao seu app.

---

## PARTE 3 — Configurar o número de telefone

### Passo 3.1 — Acessar a configuração do WhatsApp

1. No menu lateral esquerdo do seu app, clique em **"WhatsApp"** > **"Configuração da API"** (ou "API Setup")
2. Você vai ver uma seção chamada **"Enviar e receber mensagens"**

### Passo 3.2 — Adicionar seu número de telefone

1. Na seção "De", clique em **"Adicionar número de telefone"**
2. Preencha os dados da sua empresa:
   - **Nome de exibição do perfil comercial**: O nome que vai aparecer no WhatsApp (ex: "Minha Empresa")
   - **Categoria**: Selecione a categoria do seu negócio
   - **Descrição** (opcional): Uma descrição curta
3. Clique **"Avançar"**
4. Digite seu número de telefone:
   - Selecione **Brasil (+55)**
   - Digite o número **SEM** o zero (ex: 11999887766)
5. Escolha como quer receber o código de verificação:
   - **SMS** — se o número recebe mensagens de texto
   - **Ligação** — se é um fixo ou prefere receber por chamada
6. Clique **"Avançar"**
7. Digite o código de 6 dígitos que recebeu
8. Clique **"Verificar"**

**IMPORTANTE**: Uma vez vinculado, esse número **sai** do WhatsApp normal. Ele passa a funcionar APENAS pela API. Se quiser voltar, terá que desvincular.

---

## PARTE 4 — Criar um Token Permanente (System User)

O token temporário que aparece no painel expira em 24h. Vamos criar um que não expira.

### Passo 4.1 — Criar um System User

1. Abra uma nova aba: **business.facebook.com/settings**
2. No menu lateral esquerdo, clique em **"Usuários"** > **"Usuários do sistema"**
3. Se não aparecer essa opção, clique em **"Configurações da empresa"** primeiro
4. Clique em **"Adicionar"**
5. Preencha:
   - **Nome do usuário do sistema**: Use algo como "whatsapp-api" ou "api-user"
   - **Função**: Selecione **"Administrador"**
6. Clique **"Criar usuário do sistema"**

### Passo 4.2 — Atribuir o App ao System User

1. Na lista de usuários do sistema, clique no que acabou de criar
2. Clique em **"Atribuir ativos"**
3. Na coluna da esquerda, selecione **"Apps"**
4. Encontre o app que criou na Parte 2 e selecione
5. Marque **"Controle total"**
6. Clique **"Salvar alterações"**

### Passo 4.3 — Atribuir o WhatsApp Business Account (WABA)

1. Ainda na mesma tela, clique em **"Atribuir ativos"** novamente
2. Na coluna da esquerda, selecione **"Contas do WhatsApp"**
3. Selecione sua conta do WhatsApp Business
4. Marque **"Controle total"**
5. Clique **"Salvar alterações"**

### Passo 4.4 — Gerar o Token Permanente

1. Na página do System User, clique em **"Gerar novo token"**
2. Selecione o **app** que você criou
3. Na lista de permissões, marque:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Clique **"Gerar token"**
5. **COPIE E SALVE ESTE TOKEN EM UM LUGAR SEGURO** (Notepad, Google Docs, etc.)
   - Ele aparece apenas UMA VEZ. Se perder, terá que gerar outro
   - O token começa com algo tipo `EAAS...` e é bem longo

---

## PARTE 5 — Criar um Template de Mensagem

A API oficial **NÃO permite** enviar a primeira mensagem como texto livre. Você precisa de um template aprovado pela Meta.

### Passo 5.1 — Acessar os templates

1. Volte para **developers.facebook.com** > seu app
2. No menu lateral, clique em **"WhatsApp"** > **"Gerenciar templates"**
   - Ou acesse diretamente: **business.facebook.com/wa/manage/message-templates**
3. Selecione sua Conta do WhatsApp Business

### Passo 5.2 — Criar o template

1. Clique em **"Criar template"**
2. Preencha:
   - **Categoria**: Selecione **"Utilitário"** (mais fácil de aprovar) ou **"Marketing"** (se for venda)
   - **Nome do template**: Use letras minúsculas e underline, sem espaço (ex: `primeiro_contato`)
   - **Idioma**: Selecione **"Português (BR)"**
3. Clique **"Continuar"**

### Passo 5.3 — Montar a mensagem do template

1. Na seção **"Corpo"**, escreva sua mensagem. Exemplo:

```
Olá {{1}}! Tudo bem? Aqui é a equipe da [Sua Empresa].

Estamos entrando em contato para entender melhor o seu momento e como podemos te ajudar.

Quando seria um bom horário para conversarmos?
```

- O `{{1}}` é uma variável — será substituído pelo nome do lead
- Você pode adicionar mais variáveis: `{{2}}`, `{{3}}`, etc.

2. Na seção **"Botões"** (opcional), você pode adicionar:
   - Botão de resposta rápida (ex: "Tenho interesse", "Agora não")
   - Botão de link (ex: link para seu site)

3. Clique **"Enviar"**

### Passo 5.4 — Aguardar aprovação

- A Meta analisa o template em até **24 horas** (geralmente minutos)
- O status vai mudar para **"Aprovado"** quando estiver pronto
- Se for rejeitado, ajuste o texto e reenvie (evite palavras promocionais agressivas)

---

## PARTE 6 — Configurar o Webhook (Receber mensagens)

O webhook é o que permite **receber** as respostas dos seus leads.

### Passo 6.1 — Criar a URL do webhook

Você precisa de uma URL pública que receba as mensagens. Opções:

- **Se você tem um CRM/sistema próprio**: Use a URL que seu desenvolvedor forneceu
- **Se usa Supabase**: Crie uma Edge Function (seu desenvolvedor faz isso)
- **Se usa n8n/Make/Zapier**: Crie um webhook trigger e use a URL gerada

### Passo 6.2 — Configurar no painel da Meta

1. No seu app em **developers.facebook.com**, vá em **"WhatsApp"** > **"Configuração"**
2. Na seção **"Webhook"**, clique em **"Editar"**
3. Preencha:
   - **URL de callback**: A URL do seu webhook (ex: `https://seudominio.com/webhook`)
   - **Token de verificação**: Crie uma senha qualquer e anote (ex: `meu_token_secreto_2026`)
4. Clique **"Verificar e salvar"**
   - A Meta vai fazer uma chamada de teste. Se sua URL estiver correta, vai funcionar

### Passo 6.3 — Assinar os campos do webhook

1. Após salvar, na seção Webhook, clique em **"Gerenciar"**
2. Marque a checkbox ao lado de **"messages"**
   - Isso faz a Meta enviar as mensagens recebidas para sua URL

### Passo 6.4 — PASSO CRUCIAL: Inscrever o App na WABA

**ATENÇÃO: Este passo é obrigatório e muita gente esquece!**

Sem ele, o webhook fica configurado mas a Meta **NÃO envia** as mensagens.

**Opção A — Pelo navegador (mais fácil):**

1. Abra uma nova aba no Chrome
2. Cole esta URL (substitua os valores):

```
https://developers.facebook.com/tools/explorer/
```

3. No Graph API Explorer:
   - No campo **"Token de acesso"**: Cole o token permanente que gerou na Parte 4
   - Mude o método de **GET** para **POST**
   - No campo da URL, digite: `{SEU_WABA_ID}/subscribed_apps`
     - O WABA ID é o ID da sua conta WhatsApp Business (encontre em Configurações da empresa > Contas do WhatsApp Business)
   - Clique **"Enviar"**
   - Deve retornar: `{ "success": true }`

**Opção B — Se preferir pedir para seu desenvolvedor:**

Passe para ele este comando:
```
curl -X POST "https://graph.facebook.com/v22.0/SEU_WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer SEU_TOKEN_PERMANENTE"
```

---

## PARTE 7 — Publicar o App (Sair do modo de desenvolvimento)

No modo de desenvolvimento, só números verificados no app podem receber mensagens. Para funcionar com qualquer número:

### Passo 7.1 — Configurar informações obrigatórias

1. No painel do app em **developers.facebook.com**, clique em **"Configurações do app"** > **"Básico"**
2. Preencha TODOS os campos obrigatórios:
   - **URL da Política de Privacidade**: Link para sua página de privacidade
     - Se não tem, crie uma página simples no seu site ou use geradores online gratuitos
   - **URL dos Termos de Serviço**: Link para seus termos
   - **Ícone do app**: Faça upload de um ícone (1024x1024 px)
   - **Categoria**: Selecione a categoria do app
3. Clique **"Salvar alterações"**

### Passo 7.2 — Solicitar permissões avançadas

1. No menu lateral, clique em **"Permissões e recursos"** (ou "App Review")
2. Procure estas permissões e solicite acesso:
   - `whatsapp_business_management` — Clique em **"Obter acesso avançado"**
   - `whatsapp_business_messaging` — Clique em **"Obter acesso avançado"**
3. Algumas permissões são aprovadas automaticamente, outras pedem verificação

### Passo 7.3 — Publicar o app

1. No topo do painel, procure o toggle que diz **"Em desenvolvimento"**
2. Clique nele para mudar para **"Ativo"**
3. Confirme na janela que aparecer
4. O app agora está publicado e pode enviar mensagens para qualquer número

---

## PARTE 8 — Testar o envio

### Passo 8.1 — Testar pelo painel (simples)

1. No painel do app, vá em **"WhatsApp"** > **"Configuração da API"**
2. Na seção "Enviar mensagens", selecione:
   - **De**: Seu número verificado
   - **Para**: Um número de teste (pode ser o seu pessoal)
3. No campo de template, selecione o template que criou
4. Clique **"Enviar mensagem"**
5. Verifique se recebeu no WhatsApp

### Passo 8.2 — Testar o webhook (receber respostas)

1. Envie uma mensagem do seu WhatsApp pessoal para o número da API
2. Verifique se sua URL de webhook recebeu a mensagem
   - Se usa n8n/Make: veja no histórico de execuções
   - Se usa Supabase: veja nos logs da Edge Function
   - Se usa sistema próprio: verifique os logs

---

## Resumo das informações que você precisa salvar

Após completar todo o processo, guarde estas informações:

| Dado | Onde encontrar | Exemplo |
|------|---------------|---------|
| **App ID** | Configurações do App > Básico | 1234567890 |
| **Phone Number ID** | WhatsApp > Config da API > seção "De" | 663196283535436 |
| **WABA ID** | Config empresa > Contas WhatsApp Business | 542862978508028 |
| **Token permanente** | O que gerou na Parte 4 | EAAS... (muito longo) |
| **Verify Token** | O que definiu na Parte 6.2 | meu_token_secreto_2026 |
| **Template name** | WhatsApp > Templates | primeiro_contato |

---

## Problemas comuns

### "Enviei mas o lead não recebeu"
- Verifique se o app está **publicado** (modo Ativo, não Desenvolvimento)
- Verifique se está usando um **template aprovado** para a primeira mensagem
- Dentro de uma janela de 24h após o lead responder, você pode enviar texto livre

### "O lead respondeu mas não recebi no meu sistema"
- Verifique se fez o **Passo 6.4** (inscrever app na WABA via API)
- Verifique se o campo **"messages"** está marcado no webhook
- Verifique se a URL do webhook está correta e acessível

### "Template foi rejeitado"
- Evite: "grátis", "promoção", "oferta imperdível", links encurtados
- Seja claro e profissional no texto
- Templates de utilidade (confirmação, lembrete) são aprovados mais rápido

### "Token expirou"
- Se usou o token temporário do painel, ele expira em 24h
- Use o token permanente do System User (Parte 4)

### "Número já está no WhatsApp"
- O número precisa ser **desvinculado** do WhatsApp/WhatsApp Business antes
- Desinstale o WhatsApp do celular com esse número, ou
- No WhatsApp Business: Configurações > Conta > Excluir minha conta

---

## Limites importantes

| Limite | Conta nova | Após verificação |
|--------|-----------|-----------------|
| Mensagens/dia | 250 | 1.000 → 10.000 → 100.000 |
| Templates | Até 250 | Até 250 |
| Números | 2 | Até 20 |
| Janela de conversa | 24h após última msg do cliente | 24h |

O limite de mensagens aumenta automaticamente conforme você envia e mantém boa qualidade (poucas denúncias/bloqueios).

---

## Precisa de ajuda?

Se travou em algum passo, tire um print da tela e envie para o suporte.
O erro mais comum é esquecer o **Passo 6.4** (inscrever app na WABA) — 90% dos problemas de "não recebo mensagem" são resolvidos com isso.
