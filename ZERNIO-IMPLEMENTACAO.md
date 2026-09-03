# Zernio — guia de implementação

Documento de portabilidade: tudo o que a integração com o Zernio faz nesta base,
descrito de forma independente do código daqui, para ser reimplementado em outro
sistema.

Base de referência: `api/_lib/canais/zernio.ts` (adaptador), `api/_lib/canais/tipos.ts`
(contrato), `api/webhooks/[...route].ts` (recepção), `supabase/migrations/20260817060000_*`
e `20260817060100_*` (modelo de dados). Especificação: `zernio-api-openapi.yaml` v1.0.4.

---

## 1. O que o Zernio é, e as quatro coisas que ele quebra

O Zernio é um **intermediário para a Meta**: por baixo é a mesma Cloud API do
WhatsApp e a mesma Graph API do Instagram. O que muda é a forma, e ela muda em
quatro pontos que atravessam a implementação inteira.

### 1.1. Uma chave, duas redes

O **provedor** é a conta Zernio — uma credencial Bearer. O **canal** é uma conta
social conectada lá dentro: um número de WhatsApp *ou* um perfil de Instagram,
sob a mesma chave.

Consequência: a rede **não pode ser deduzida do tipo do provedor**. Nos provedores
de rede única (EvoGo, Cloud API, Instagram direto) `rede = f(tipo)`. Aqui a rede
tem de ser **escolhida** no cadastro do canal e gravada na coluna. Se você deduzir,
todo canal nasce `whatsapp`, e um Direct de Instagram vai procurar o contato entre
os telefones, não achar, e criar um contato novo a cada mensagem.

O identificador da conta social (`accountId`, um hexadecimal de 24 caracteres) vai
em **toda** chamada — no corpo, na query ou no multipart, conforme a rota.

### 1.2. O envio é endereçado à thread, não à pessoa

Toda rota de envio é `POST /v1/inbox/conversations/{conversationId}/messages`.
Não existe "manda para este número/id" a não ser abrindo conversa nova — e abrir
conversa nova no Instagram devolve `PLATFORM_NOT_SUPPORTED`.

Consequência: **a thread do provedor precisa virar coluna**. Sem guardá-la, o
Instagram fica somente-leitura: a mensagem chega e não há como responder.

Guardar é barato — o webhook manda `conversation.id` em **todo** evento, de graça.
A alternativa seria varrer `GET /v1/inbox/conversations` a cada envio, procurando
o participante entre até cem threads por página.

### 1.3. Um webhook para a conta inteira

A assinatura de webhook é do **usuário Zernio**, não da conta social. Um endereço
serve todas as contas conectadas, e cada evento diz a que conta pertence em
`account.accountId` / `account.id`.

É o modelo da Meta (`phone_number_id` no corpo), e não o do EvoGo (um webhook por
instância, canal na URL). Consequência: a rota resolve o canal **evento a evento**,
depois de traduzir — não antes, pela URL.

### 1.4. Mídia tem dois contratos opostos, e os dois expiram

- **WhatsApp**: o `url` do anexo aponta para um endpoint **do próprio Zernio que
  exige Bearer** (`/v1/whatsapp/media/{mediaId}?accountId=`). A Meta descarta o
  arquivo em poucos dias; depois disso ele responde 400 para sempre.
- **Instagram**: é link de CDN da Meta — **público** e efêmero. Mandar o Bearer
  ali é recusado.

Consequência: baixar **durante a ingestão**, sempre, e carregar junto do
identificador a informação de qual dos dois casos é (ver §7.3).

---

## 2. Pré-requisitos da conta Zernio

| Item | Detalhe |
|---|---|
| Credencial | Chave Bearer da conta Zernio. Header `Authorization: Bearer <chave>`. |
| Add-on Inbox | **Obrigatório no plano.** Sem ele, o inbox inteiro responde 403 com a chave válida e a conta conectada. É a pegadinha própria deste provedor. |
| Chaves restritas (`zrk_`) | Podem ter grupos de recurso desligados. Aí só **parte** das rotas cai: `messages` passa e `engagement` (curtir) leva 403. Ver §3.3. |
| Conexão das contas sociais | Feita **no painel do Zernio**, por OAuth. Não há QR e não há fluxo de conexão do nosso lado — aqui só se **escolhe** qual conta já conectada atende. |
| Base URL | `https://zernio.com/api` por padrão. Deve ser configurável por provedor (nunca cravar o host em caminho nenhum). |

---

## 3. Cliente HTTP

### 3.1. A chamada

```
função chamar(provedor, caminho, método, corpo?):
  se não provedor.segredo → erro "Falta a chave de API"

  url = caminho começa com "http" ? caminho : base(provedor) + caminho
  multipart = corpo é FormData

  headers:
    authorization: "Bearer " + provedor.segredo
    content-type: "application/json"   ← SÓ se não for multipart e houver corpo

  timeout: 30 s
```

Dois cuidados que quebram de jeito difícil de ver:

- **Nunca escrever `content-type` à mão no multipart.** O `FormData` monta o
  próprio com o separador (`boundary`); sobrescrevê-lo quebra o upload.
- **`base(provedor)` sem barra final** — normalizar com `replace(/\/+$/, '')`.
- **30 s de timeout** porque o envio com anexo sobe o arquivo nesta mesma chamada.

### 3.2. A forma do erro

O corpo de erro traz um `code` estável ao lado da frase:

```json
{ "error": "…", "message": "…", "code": "PLATFORM_LIMITATION", "required_group": "engagement" }
```

Guarde os quatro numa exceção própria: `mensagem`, `status`, `codigo`, `grupo`.
Guardar só o texto obriga a adivinhar de novo lá na frente.

### 3.3. Tradução dos erros para o atendente

| Condição | Mensagem |
|---|---|
| `401` | "A chave de API do Zernio é inválida ou foi revogada." |
| `403` + `code = insufficient_permissions` + `required_group` | "A chave do Zernio não tem o grupo `<grupo>`. Crie uma chave com esse grupo ligado na aba API keys do painel e troque a credencial do provedor." |
| `403` + `insufficient_permissions` sem grupo | "O Zernio recusou esta operação para esta chave: `<mensagem dele>`" |
| `403` com mensagem | "O Zernio recusou: `<mensagem dele>`" |
| `403` sem mensagem | "O Zernio recusou o acesso ao inbox. Confirme se o add-on Inbox está ativo no plano." |
| `code = PLATFORM_LIMITATION` | "Esta rede não faz isso: `<mensagem>`" |
| `code = MISSING_PARTICIPANT` | "O Zernio não sabe para quem enviar nesta conversa." |
| `code = TEMPLATE_REQUIRED` | "Passaram mais de 24 horas desde a última mensagem do cliente. Só é possível retomar com um modelo aprovado pela Meta." |
| resto | a mensagem dele, verbatim |

> **A lição do 403.** Ele tem duas causas que se consertam em lugares diferentes —
> o add-on do plano e o grupo da chave. Em produção, a resposta privada a um
> comentário (grupo `messages`) passou e o curtir daquele mesmo comentário (grupo
> `engagement`) levou 403 — com a nossa frase mandando conferir o add-on, que
> estava certo o tempo todo. **Quando o provedor explica, a explicação basta**:
> palpite depois de explicação é ruído que manda procurar no lugar errado.

---

## 4. Modelo de dados mínimo

### 4.1. Provedor

| Campo | Uso |
|---|---|
| `tipo` | `'zernio'` — precisa entrar no `check` da coluna se houver um. |
| `servidor` | Base URL. Nulo = padrão `https://zernio.com/api`. |
| `segredo` (selado) | A chave Bearer. |
| `webhookSegredo` (selado) | Segredo da **URL** (`?k=`). **Gerado por nós**, aleatório de 32 bytes. |
| `assinaturaSegredo` (selado) | Segredo com que o Zernio **assina o corpo**. Também **gerado por nós** e informado a ele no cadastro da assinatura. |
| `ativo` | Desativar o provedor cala todos os canais dele. |

> Diferença importante em relação à Meta: lá os dois segredos vêm do painel dela e
> são digitados pela pessoa. **No Zernio os dois são nossos para escolher** — a
> assinatura é criada por API. Pedi-los na tela seria pedir que alguém inventasse
> duas senhas que ninguém mais vai ver. Gere-os automaticamente ao criar o provedor.

### 4.2. Canal

| Campo | Uso |
|---|---|
| `rede` | `'whatsapp'` \| `'instagram'` — **escolhida**, não deduzida (§1.1). |
| `instancia` | O `accountId` da conta social no Zernio. |
| `webhook_base` | Origem pública alternativa ao `APP_URL` (desenvolvimento com túnel). **Só a origem** — `https://host[:porta]`, sem caminho e sem query. Validar isso: alguém já colou aqui a URL inteira do webhook e o resultado foi um endereço com dois caminhos e dois segredos grudados, sem erro em lugar nenhum, só mensagem que nunca chegava. |

### 4.3. Conversa

```sql
alter table conversations add column provider_thread_id text;

comment on column conversations.provider_thread_id is
  'Identificador da conversa no provedor, quando é por ele que se envia. '
  'Nulo em provedor que endereça pelo destinatário.';

-- Uma thread do provedor é de uma conversa só. Parcial porque a coluna é nula
-- na esmagadora maioria das linhas, e um único nulo não deve impedir o próximo.
create unique index conversations_provider_thread_uk
  on conversations (channel_id, provider_thread_id)
  where provider_thread_id is not null;
```

**Gravar a thread em toda passagem, e não só ao criar a conversa.** Conversa aberta
antes de o canal existir precisa ganhar como ser respondida na primeira mensagem
nova. Padrão: `provider_thread_id = coalesce(provider_thread_id, nullif(nova, ''))`
ou substituição quando divergir — mas nunca só no `insert`.

### 4.4. Janela de 24 h

A janela é da Meta, e o Zernio é um intermediário para a Meta: o WhatsApp dele
recusa texto livre depois de 24 h exatamente como a Cloud API. **Calcular
`janela_ate` para canais Zernio de rede WhatsApp.** No Instagram a janela existe
mas tem a saída do `HUMAN_AGENT` — por isso ali não se calcula.

Cuidado com o nulo ambíguo: `janela_ate = null` quer dizer duas coisas opostas —
"esta rede não tem janela" e "o cliente nunca escreveu, a janela nunca abriu".
Guarde um booleano `tem_janela` separado. Conflar os dois faz o sistema mandar
texto livre para quem nunca falou.

---

## 5. Capacidades declaradas

O adaptador declara o que sabe fazer; a interface pergunta antes de oferecer. É a
**interseção honesta das duas redes**, porque a declaração é do adaptador e não do
canal — onde elas divergem, quem trata é o método.

```
midia: true      audio: true      reacao: true
edicao: false    exclusao: false  citacao: true
qr: false        template: true   janela24h: true
```

- `edicao` e `exclusao` falsas: o Zernio só edita no Telegram e só apaga em
  Telegram, X, Bluesky e Reddit. WhatsApp e Instagram respondem 400.
- `citacao` verdadeira porque funciona no WhatsApp; no Instagram o próprio Zernio
  ignora `replyTo` em silêncio (a Send API da Meta o recusa lá). **Perder a citação
  é melhor que recusar a mensagem.**
- `qr` falsa: quem conecta a conta é o painel do Zernio, por OAuth.
- `janela24h` verdadeira porque é verdade no WhatsApp.

---

## 6. Endpoints usados

Todos com `Authorization: Bearer <chave>`. `{acc}` = `accountId` do canal.

### 6.1. Credencial e contas

| Método | Rota | Corpo / Query | Devolve |
|---|---|---|---|
| GET | `/v1/auth/verify` | — | `{ valid: boolean }` |
| GET | `/v1/accounts` | `?platform=whatsapp\|instagram` (opcional) | `{ accounts: [...] }` |

Forma de uma conta:

```json
{
  "_id": "…24 hex…", "platform": "instagram",
  "username": "…", "displayName": "…", "profilePicture": "https://…",
  "isActive": true, "needsReconnection": false,
  "metadata": {
    "displayPhoneNumber": "+55 …",
    "qualityRating": "GREEN",
    "messagingLimitTier": "TIER_1K"
  }
}
```

Filtrar por `platform ∈ {whatsapp, instagram}` — o Zernio serve dezesseis redes e
as outras não são do produto. O id pode vir em `_id` **ou** `id`; aceite os dois.
Descartar conta sem id.

### 6.2. Envio

| Método | Rota | Formato |
|---|---|---|
| POST | `/v1/inbox/conversations/{threadId}/messages` | JSON **ou** multipart |
| POST | `/v1/inbox/conversations` | JSON — abre conversa com modelo |

**Texto (JSON):**
```json
{ "accountId": "{acc}", "message": "…", "replyTo": "<externalId citado>",
  "buttons": [{ "type": "url", "title": "≤20 chars", "url": "https://…" }] }
```

**Mídia (multipart obrigatório):** o caminho JSON pediria um `attachmentUrl`
público, e o arquivo está em base64 na memória do processo.
```
accountId  = {acc}
message    = legenda (ou o texto da mensagem)
replyTo    = <externalId citado>            (opcional)
attachment = Blob(bytes, type=mime), nome do arquivo
voiceNote  = "true"    ← SÓ para áudio em WhatsApp
```

> **`voiceNote` pelo multipart transcodifica.** O próprio Zernio converte para
> ogg/Opus, que é o único formato que a Meta aceita como PTT. Pelo JSON o arquivo
> já teria que chegar convertido. É o que faz o áudio virar recado de voz com onda,
> em vez de anexo.

**Modelo / abrir conversa:**
```json
{ "accountId": "{acc}", "participantId": "5511999999999",
  "templateName": "…", "templateLanguage": "pt_BR",
  "templateParams": ["valor1", "valor2"] }
```
Telefone **só com dígitos**. Devolve o `messageId` e o **`conversationId`** — que é
a thread que faltava, e o que faz o envio seguinte parar de falhar com "esta
conversa ainda não existe".

**Resposta de envio** — o id vem em dois lugares conforme a rota:
`data.messageId` ou `messageId` na raiz. Nulo é resposta legítima: o Zernio não
devolve id em toda rede, e a mensagem foi enviada de todo jeito.

**Botões:** só `type: "url"`. O de `postback` voltaria por um webhook de postbacks
que este provedor não emite — botão que responde para o vazio é pior que botão
nenhum. Máximo 3. Rótulo cortado em 20 caracteres (a Meta recusa o que passa, e
recusar o envio inteiro por causa de uma letra a mais seria pior). Descartar botão
com rótulo ou URL vazios.

### 6.3. Reação

| Método | Rota | Corpo / Query |
|---|---|---|
| POST | `/v1/inbox/conversations/{thread}/messages/{msgId}/reactions` | `{ accountId, emoji }` |
| DELETE | `…/reactions?accountId={acc}` | — |

Emoji vazio = desfazer, e é `DELETE` com a conta na **query** — não um `POST` de
emoji vazio.

### 6.4. Comentários, menções e moderação (Instagram/Facebook)

| Ação | Método | Rota | Corpo |
|---|---|---|---|
| Resposta pública | POST | `/v1/inbox/comments/{postId}` | `{ accountId, message, commentId }` |
| Resposta privada | POST | `/v1/inbox/comments/{postId}/{commentId}/private-reply` | `{ accountId, message, buttons? }` |
| Responder menção | POST | `/v1/inbox/mentions/reply` | `{ accountId, mediaId, commentId?, message }` |
| Esconder | POST | `/v1/inbox/comments/{postId}/{commentId}/hide` | `{ accountId }` |
| Mostrar | DELETE | `/v1/inbox/comments/{postId}/{commentId}/hide` | `{ accountId }` |
| Curtir comentário | POST | `/v1/inbox/comments/{postId}/{commentId}/like` | `{ accountId }` |
| Curtir post | POST | `/v1/inbox/posts/{postId}/like` | `{ accountId }` |

Detalhes que custam caro:

- **`commentId` no corpo da resposta pública.** Na rota pública o comentário é
  corpo, não caminho: sem ele, a resposta sai como comentário solto no post e não
  embaixo de quem escreveu.
- **Botões só na privada.** Comentário público não tem botão em rede nenhuma; o
  provedor devolve 400 pelo campo a mais.
- **A resposta privada é a única porta para quem só comentou.** A Meta não deixa o
  negócio abrir Direct com quem nunca escreveu. Vale **uma vez por comentário** e
  expira em **sete dias**. É o que faz o "comente EU QUERO" funcionar.
- **Botões convertem no alcance frio.** A Meta manda o DM de quem só comentou para
  a caixa de "Solicitações de mensagem", onde os chips de resposta rápida não
  aparecem — os botões, sim.
- **Menção é outra porta.** Quando alguém marca a conta num post que é **dele**, o
  comentário não é nosso e a rota de comentário recusa. Com `commentId`, a resposta
  sai embaixo do comentário; sem ele, vira um comentário na mídia da pessoa (a
  forma da menção feita na legenda). **Menção em story não tem resposta pública** —
  chega como mensagem, e responder é mandar um direct.
- **Apagar comentário não existe** aqui: é irreversível, e a API nem oferece para o
  Instagram. `esconder` tira da vista de todos **menos de quem escreveu** — é o que
  faz o gesto não gerar briga.

### 6.5. Posts

| Método | Rota | Query / Corpo |
|---|---|---|
| GET | `/v1/posts` | `?source=external&accountId={acc}&limit=1..50&sortBy=created-desc&search=` |
| POST | `/v1/posts/sync-external` | `{ accountId, url }` |

- **`source=external` é o que serve, e não é o padrão.** O padrão devolve o que foi
  publicado *pelo Zernio* — normalmente nenhum, porque os reels saem do aplicativo
  do Instagram. `external` é a coleção sincronizada da plataforma.
- **`sync-external` é a saída do post recém-publicado.** O Zernio revarre cada conta
  a cada ~90 minutos; quem acabou de postar e veio montar a automação não espera.
  É também a porta para o que caiu fora dos ~12 meses da listagem. Resposta em duas
  formas: `{ post: {...} }` ou `{ posts: [...] }`; `found: false` é resposta, não
  erro — quem colou link de outra conta merece a frase, não uma falha.

**Duas formas de post, e a documentação só descreve uma:**

- `sync-external` devolve o resumo chapado — `platformPostId` na raiz.
- A listagem devolve o documento interno do Zernio, onde o post é *um* e os alvos
  são vários: o id da rede mora em `platforms[]`, um por conta publicada. **Ler só
  a raiz ali dá zero posts, com 200 na resposta e nada na tela.**

Escolha do alvo: **a conta deste canal**, não o primeiro de `platforms[]`. Um post
cruzado para Instagram e Facebook tem dois ids, e o do Facebook não casaria com
comentário nenhum do Instagram — daria uma automação que nunca dispara e não diz
por quê. O `accountId` dentro de `platforms[]` pode ser string **ou** objeto com
`_id`; aceite os dois.

Sem `platformPostId` **não há post**: agendado e ainda não publicado não tem id na
rede, e oferecê-lo é oferecer um filtro que nunca casa.

Miniatura: `thumbnailUrl` → `mediaItems[0].thumbnail` → `mediaItems[0].url` **só se
`type === 'image'`**. No vídeo a `url` é o próprio arquivo, e uma grade de `.mp4`
num `<img>` é uma grade de quadrados vazios. Miniaturas **expiram** — buscar na
hora em que o painel abre, nunca guardar. O `platformPostUrl` é estável e vale
guardar.

### 6.6. Contatos (recuperação de `@`)

| Método | Rota | Query |
|---|---|---|
| GET | `/v1/contacts` | `?platform=&limit=200&skip=&accountId=` |

Devolve `{ contacts: [{ platformIdentifier, displayIdentifier }], pagination: { hasMore } }`.

**Por que existe:** o `@` da pessoa só chega no **webhook** (`participantUsername`),
e nenhuma rota do inbox o devolve depois. Quem já estava na base antes de o sistema
aprender a ler o campo ficaria para sempre com o IGSID cru e nada legível ao lado.

**A especificação não promete que `displayIdentifier` seja o `@`.** Três peneiras
antes de virar identidade:

1. vazio, ou igual ao próprio `platformIdentifier` — é o id repetido;
2. fora de `[a-z0-9._]{1,30}` depois de tirar `@` e baixar a caixa — telefone
   formatado, nome com espaço;
3. **só dígitos** — `5544991529987` passa pela peneira do formato sem esforço e
   viraria um "usuário" que é o telefone. É o erro que o filtro de caracteres não
   pega sozinho.

Paginação: `limit=200` é o teto; **ponha um teto próprio de páginas** (25 aqui).
Provedor que responda `hasMore: true` para sempre giraria eternamente dentro de uma
requisição HTTP.

**Devolva o porquê de cada descarte**, não só a lista: zero achados tem quatro
causas diferentes, e uma tela que só sabe dizer "não deu" deixa quem lê sem por
onde começar. Estrutura de retorno:

```
{ contatos: n, achados: [{identificador, usuario}],
  recusados: { sem_display, igual_ao_id, formato, so_digitos },
  escopo: 'canal' | 'plataforma',
  chaves?: [...]  ← as chaves da resposta, quando `contacts` não estava lá }
```

`chaves` é a diferença entre "não há contatos" e "estou lendo o campo errado" — as
duas chegam como zero.

**Repetição sem filtro de conta:** se a varredura com `accountId` devolve zero
contatos, repita sem ele. O filtro de conta resolve por **canal de contato**, não
pelo perfil, e o `accountId` guardado pode não ser o que o CRM do provedor usa.
Não pode sujar nada: o encontro é pelo `platformIdentifier` contra as identidades
locais, e contato de outra conta simplesmente não casa com ninguém. "Achei zero na
conta e cem na plataforma" é um diagnóstico — daí o campo `escopo`.

### 6.7. Modelos de WhatsApp

| Método | Rota | Query |
|---|---|---|
| GET | `/v1/whatsapp/templates` | `?accountId={acc}` |

Só para canal de rede WhatsApp. Devolve `{ templates: [{ id, name, language, category, status, components }] }`.

Achatar os componentes em: texto do corpo, formato do cabeçalho e **quantas
variáveis** o modelo espera.

**A contagem vem de contar os `{{n}}`** — a Meta não devolve o número pronto, e a
estrutura de componentes muda de forma entre versões da API dela. Contar marcadores
é a leitura que sobrevive a isso.

Ordem em que a Meta numera as variáveis: **cabeçalho, corpo, botões de URL**.
Contar por marcador **distinto** (`Set`): `{{1}} … {{1}}` no mesmo texto é uma
variável, não duas — pedir dois valores por ela faria o envio ser recusado.
Cabeçalho só conta quando `format === 'TEXT'`.

### 6.8. Foto do participante

| Método | Rota |
|---|---|
| GET | `/v1/inbox/conversations/{thread}?accountId={acc}` |

O Zernio **não tem cadastro de contato** para consultar: quem carrega
`participantPicture` é o objeto da conversa. Por isso esta é a única leitura de
perfil que **exige** a thread.

No Instagram costuma vir; no WhatsApp costuma ser nula, porque a Cloud API não
expõe avatar de contato. **Nulo é resposta, não falha** — toda saída ruim vira
`null`, e nenhuma falha aqui pode atrapalhar a entrega de uma mensagem que já
chegou. Ler o corpo tolerando três formas: `conversation`, `data` ou a própria raiz.

O endereço é assinado e temporário. Guardar sabendo disso é o que justifica um
botão de atualizar — e é por isso que não vale copiar a imagem para o Storage sem
alguém pedir: seriam milhares de arquivos para um enfeite que muda sozinho.

### 6.9. Assinatura de webhook

| Método | Rota | Corpo / Query |
|---|---|---|
| GET | `/v1/webhooks/settings` | — |
| POST | `/v1/webhooks/settings` | `{ name, url, secret, events, isActive }` |
| PUT | `/v1/webhooks/settings` | `{ _id, name, url, secret, events, isActive }` |
| DELETE | `/v1/webhooks/settings?id={id}` | — |

**Atualizar é `PUT` no mesmo caminho, com o `_id` no corpo** — não há
`/settings/{id}` nesta API. Escrever o id na URL dá 404, e a consequência
silenciosa é criar uma assinatura nova a cada conexão até estourar o limite de
cinquenta por usuário.

---

## 7. Webhook — recepção

### 7.1. Endereço e trancas

```
POST {base}/api/webhooks/zernio/{provedorId}?k={webhookSegredo}
```

Duas trancas, em ordem:

1. **`?k=` na URL** — segredo aleatório de 32 bytes, gerado por nós, comparado em
   **tempo constante**. É a primeira e é a que sempre está lá.
2. **`X-Zernio-Signature`** — HMAC-SHA256 do **corpo cru** com o `secret` que nós
   informamos ao registrar a assinatura. Prova que o corpo veio de lá.

> **A regra que salva o webhook:** o Zernio aceita o `secret` no cadastro **e mesmo
> assim entrega sem cabeçalho nenhum**. Exigir a assinatura devolvia 403 em toda
> entrega, com o cadastro inteiro correto — o webhook ficava mudo. Então:
> **quando vem assinatura, ela tem de bater; quando não vem, vale o segredo da
> URL.** No dia em que o Zernio começar a assinar, isso passa a conferir sozinho
> sem mudar uma linha.

Detecção de "veio assinatura": varra **todos** os cabeçalhos que casem
`/signature|signed|hmac|hub\.|digest/i`, não só o nome esperado. Quando um provedor
usa outro nome, a ausência é justamente a informação que importa.

**Codificação da assinatura:** a especificação diz o algoritmo e o cabeçalho, e
**não diz a codificação**. Aceite as três formas que os provedores usam — prefixo
`sha256=`, hexadecimal puro, base64 — e compare em tempo constante. Adivinhar uma
só e errar dá 403 em todo evento, com o segredo certo cadastrado.

```
recebida = header.replace(/^sha256=/i, '').trim()
esperado = HMAC-SHA256(secret, corpoBruto)
para forma em [esperado.hex, esperado.base64]:
    se timingSafeEqual(recebida, forma) → válida
```

**Ler os bytes crus antes de qualquer parse.** Assinatura é sobre bytes, e
`JSON.parse` seguido de `stringify` já não reproduz o que foi assinado — basta um
espaço ou um acento escapado de outro jeito.

**Teto de corpo maior que o padrão.** Anexo em base64 estoura os 256 kB usuais.

### 7.2. Regras da rota

1. **Sempre responder 200.** Provedor que recebe erro reenvia, e reenviar em laço
   um payload que não entendemos vira tempestade. Falha nossa é registrada e
   engolida; a idempotência por `external_id` cuida da reentrega legítima.
2. **Nada de CSRF nem de checagem de origem** — as duas pressupõem navegador com
   nossa sessão, e aqui quem chama é um servidor de terceiro.
3. **Rate limit por IP mesmo assim** — o segredo protege contra quem não o tem, não
   contra quem o tem e resolveu inundar. Falha aberta.
4. **Agrupar por instância antes de escrever.** Um POST pode trazer eventos de
   várias contas; cada uma vai para o seu canal, resolvido por
   `(provedorId, accountId)`.
5. **Instância desconhecida não é erro** — é o caso normal de quem tem outras
   contas sociais ligadas na mesma conta Zernio. Registre a linha e siga.
6. **Registre o corpo aceito que não virou evento nenhum.** Quase sempre é normal,
   mas é também o rastro de um payload que devíamos entender e não entendemos. Sem
   essa linha os dois casos são idênticos vistos de fora: 200, e nada acontece.
   Registre **o que é**, nunca o que a pessoa escreveu — o nome do evento e as
   chaves de primeiro nível bastam.
7. **Nunca engula erro de gravação em silêncio.** Foi o que escondeu uma referência
   a coluna inexistente por uma tarde inteira: o Zernio entregava, a rota aceitava,
   o log ficava limpo e a caixa de entrada, vazia.
8. **Não há handshake.** A assinatura é criada por API, não confirmada por desafio
   (ao contrário da Meta, que exige `GET` com `hub.challenge`).

### 7.3. O cronômetro — e por que a mídia não pode segurar a resposta

**O Zernio aborta por volta dos cinco segundos, e dez abortos seguidos desativam a
assinatura dele** — o que quer dizer que o atendimento inteiro para de receber.

Baixar o arquivo e subi-lo ao Storage custa o tamanho do arquivo, e um vídeo de dez
megas gasta o orçamento sozinho. Gravar a mensagem é rápido: uma chamada. Então:

1. a bolha nasce **agora**, marcada como `baixando`;
2. a resposta 200 sai;
3. o arquivo alcança a bolha **depois**, dentro da mesma invocação (`waitUntil` /
   equivalente do runtime).

**Não vira fila de tabela, e a razão é o conteúdo:** o base64 vive no corpo da
requisição e o endereço do provedor expira em minutos. Uma fila teria que copiar
megabytes para dentro do banco só para copiá-los para fora um minuto depois.

O estado `baixando` importa: sem ele, os segundos entre a mensagem e o arquivo
pareceriam anexo quebrado.

---

## 8. Tradução dos eventos

### 8.1. Eventos assinados

Lista curta de propósito: o Zernio oferece quase cinquenta, e assinar o que não se
lê só enche o log de entregas e gasta a cota de reentrega. Publicação, anúncios,
avaliações e telefonia ficam de fora.

```
message.received      message.sent        message.delivered
message.read          message.failed      message.edited
message.deleted       reaction.received   comment.received
conversation.started  referral.received
account.connected     account.disconnected
```

(`whatsapp.template.status_updated` é interpretado quando chega, mesmo fora da
lista assinada.)

### 8.2. Forma comum do payload

```json
{
  "event": "message.received",
  "account":      { "accountId": "…", "id": "…", "platform": "whatsapp" },
  "conversation": { "id": "…", "participantId": "…", "participantName": "…",
                    "participantUsername": "…", "platform": "…" },
  "message":      { "platform": "…", "platformMessageId": "…", "text": "…",
                    "direction": "incoming|outgoing", "source": "cloud_api|whatsapp_business_app",
                    "sender": { "id": "…", "name": "…", "phoneNumber": "…",
                                "businessScopedUserId": "…", "username": "…",
                                "whatsappUsername": "…", "instagramProfile": {…} },
                    "attachments": [ { "type": "image", "url": "…", "refreshUrl": "…",
                                       "filename": "…", "payload": { "mime_type": "…" } } ] },
  "metadata":     { … },
  "error":        { "title": "…", "message": "…", "explanation": "…" }
}
```

**Regras transversais:**

- `account.accountId ?? account.id` é a instância. **Sem ela o evento é descartado**
  — não há canal para escrever, e escrever no canal errado é pior que não escrever.
- A rede sai de `message.platform ?? account.platform`. **Fora de
  `{whatsapp, instagram}`, ignore em silêncio**: não é erro, é assunto de outro
  produto.
- `conversation.id` é a **thread**, e vem de graça em todo evento. Carregue-a em
  todo evento traduzido.

### 8.3. Tabela de tradução

| Evento | Vira | Notas |
|---|---|---|
| `account.connected` / `.disconnected` | situação do canal | `conectado` / `desconectado` |
| `comment.received` | comentário | ver §8.4 |
| `conversation.started` | fato "conversa nasceu" | não vira bolha nem atendimento — existe para o fluxo de boas-vindas acordar sem depender de palavra-chave |
| `referral.received` | fato "veio de link/anúncio" | é a **única** forma de saber de um clique que não veio acompanhado de texto |
| `reaction.received` | reação | ver §8.5 |
| `whatsapp.template.status_updated` | mudança de estado do modelo | ver §8.6 |
| `message.delivered` / `.read` / `.failed` | recibo | `entregue` / `lida` / `falhou`; detalhe de `error.explanation ?? .message ?? .title` |
| `message.deleted` | exclusão | alvo = `platformMessageId` |
| `message.edited` | edição | alvo + novo texto |
| `message.received` / `.sent` | mensagem | ver §8.7 |

> **Ordem importa:** trate `whatsapp.template.status_updated` **antes** do bloco de
> mensagem. Esse evento **não tem `message`**: ele fala de um modelo, não de uma
> conversa. Cair no guarda `if (!message) return []` o descartaria em silêncio.

### 8.4. Comentário

Campos: `comment.id`, `comment.platformPostId` (reserva: `post.platformPostId`),
`comment.author.{id,name,username}`, `comment.text`, `comment.isReply`,
`post.permalink`.

- O id do post vem do **comentário**; o do bloco `post` é reserva — o primeiro
  sempre existe, o segundo pode faltar em post que não foi publicado por aqui.
- **Só `platform ∈ {instagram, facebook}`.** Comentário de outra rede entraria como
  fato que nenhum passo sabe responder.
- Sem `id`, `postId` ou autor → descartar.
- **Os dois identificadores viajam juntos.** Comentário não é mensagem, e a
  diferença não é de forma, é de permissão: a única porta legal para falar com quem
  comentou é a resposta privada, endereçada pelo par post + comentário. Sem eles, o
  comentário vira um texto sem como responder.

### 8.5. Reação

- `reaction.platformMessageId` é o alvo. Sem ele, descartar.
- `action === 'removed'` → emoji vazio (é como se modela "desfiz", o mesmo contrato
  do WhatsApp).
- **`minha = (reaction.sender.id !== conversation.participantId)`.** O negócio
  reagindo pelo aplicativo nativo chega com o id dele, não o do participante. Sem
  essa comparação, a reação da equipe apareceria como a do cliente.

### 8.6. Modelo revisado pela Meta

Campos: `template.{name, language, status, reason}`.

Chega dias depois de o modelo ser criado, e volta a chegar sozinho quando a Meta
pausa por reclamação de quem recebe. Sem ouvir isso, a tela ofereceria um modelo
pausado até alguém sincronizar à mão — e a recusa apareceria como erro de envio,
longe da causa.

`reason === 'NONE'` é como a Meta diz "sem motivo" na aprovação. Guardá-lo
literalmente poria a palavra NONE na tela ao lado do modelo → normalizar para nulo.

### 8.7. Mensagem — o caminho longo

**Descartes, nesta ordem:**

1. **O eco do que nós acabamos de enviar:**
   `event === 'message.sent' && message.source === 'cloud_api'` → descartar.
   Já está no banco, gravado pelo caminho do envio; ingeri-lo de novo dependeria de
   o id da resposta do envio ser exatamente este — o que a especificação não
   promete. Descartar pelo `source` é determinístico; a alternativa era arriscar
   bolha dobrada.
   **`source === 'whatsapp_business_app'` é o caso oposto e o motivo de assinar
   `message.sent`:** alguém respondeu pelo celular, e isso a plataforma não sabe de
   outro jeito.
2. **`metadata.unsupported` presente** → descartar. Tipo que a Cloud API não sabe
   representar (enquete, ver-uma-vez, o que a Meta inventar). Ela entrega o erro
   131051 e o texto fixo `[Unsupported message]`, em inglês, que não é conteúdo de
   ninguém. Não vira bolha de sistema porque a bolha não ajudaria a decidir nada —
   quem atende não pode pedir para reenviar em outro formato sem saber qual era.
   **Ler por `metadata.unsupported`, nunca pelo texto:** o texto é inglês fixo hoje
   e casar por ele quebra no dia em que a Meta o traduzir.
3. **Sem texto e sem mídia** → descartar. Bolha vazia suja a conversa e não informa.
4. **Sem `de` resolvido** → descartar.

**Identidade de quem falou:**

```
saindo = message.direction === 'outgoing'

se saindo:
    de   = conversation.participantId
    nome = conversation.participantName
senão, por rede:
    instagram → de = sender.id (o IGSID; não há outra forma)
    whatsapp  → fone  = sender.phoneNumber com só dígitos
                bsuid = sender.businessScopedUserId
                de    = fone ?? sender.id
                outros = únicos([sender.id, bsuid]) menos o principal
```

- **Em mensagem que sai, quem fala é o negócio** — e o contato da conversa continua
  sendo a outra pessoa. Sem isso, o eco criaria um contato chamado "a nossa própria
  conta".
- O `+` do E.164 sai porque é assim que o resto do sistema guarda número.
- O BSUID vem junto como identidade extra: a Meta está migrando para ele, e o
  telefone já pode faltar em quem adotou nome de usuário. `sender.id` **é** o BSUID
  quando a Meta não manda telefone — use `Set` ou a mesma identidade vira duas
  linhas (ou uma tentativa de inserir chave repetida).

**O `@` da pessoa:**

```
usuario = conversation.participantUsername
       ?? (saindo ? undefined : sender.whatsappUsername ?? sender.username)
```

`participantUsername` é o único que serve nas duas direções: em mensagem que sai,
`sender` é o **negócio**, e `sender.username` gravaria o nosso próprio usuário na
ficha de cada cliente. **Não é identificador de envio** — é nome legível por gente.
E **muda**: guarde um por rede e substitua, em vez de acumular.

**Conteúdo:**

```
texto = message.text ?? escolha
escolha = metadata.postbackTitle ?? metadata.interactiveId ?? metadata.buttonPayload
       ?? metadata.quickReplyPayload ?? metadata.postbackPayload ?? metadata.callbackData
```

Toque em botão, linha de lista ou envio de Flow. O que importa para o histórico é o
que a pessoa escolheu, não que veio de um componente interativo — mas quando o
rótulo não vem, o id serve.

**Anexo** (`attachments[0]`):

| `type` | tipo interno |
|---|---|
| `image` | imagem |
| `video` | video |
| `audio` | audio |
| `sticker` | figurinha |
| `file` | documento |
| `share` | documento |

`share` é publicação compartilhada no Direct. Não há como saber se é foto ou vídeo,
e um tocador que não toca é pior que um anexo que se baixa.

Endereço: **`refreshUrl` antes de `url`** — no Instagram e no Facebook o `url`
assinado da Meta expira, e `refreshUrl` existe justamente para remintá-lo.
Mime: `payload.mime_type ?? payload.mimeType ?? 'application/octet-stream'`.

**O prefixo de credencial** (a peça-chave de §1.4): o identificador da mídia guarda
como buscá-la, porque é lá que cabe.

```
id = (rede === 'whatsapp' ? 'auth:' : 'open:') + endereço
```

É a única coisa que a ingestão precisa saber e não consegue deduzir: se aquele
endereço abre com a nossa credencial ou sem ela. Errar dá 401 num caso e 403 no
outro. **Nunca guardar o endereço como URL final** — os dois contratos expiram, e a
bolha apontaria para o vazio dias depois.

**Outros campos:**

| Campo | Origem | Notas |
|---|---|---|
| `citando` | `metadata.quotedMessageId` | |
| `story` | `metadata.storyReply.{storyId, storyUrl}` | resposta a um story **nosso**; só quando entra |
| `mencaoEmStory` | `metadata.isStoryMention === true` | a pessoa marcou a conta no story **dela**; a Meta entrega como mensagem, não como comentário nem menção — é a única forma de saber |
| `perfil` | `sender.instagramProfile` | só quando entra: em mensagem que sai, `sender` é o negócio |
| `origem` | `metadata.referral` | ver abaixo |

**Origem de anúncio.** O Zernio repassa o `referral` da Meta como veio, e as chaves
diferem por superfície: no WhatsApp o anúncio é `source_id`, no Instagram é `ad_id`.
É o que liga verba de mídia a matrícula, e **só chega na primeira mensagem**.

```
fonte   = rede === 'whatsapp' ? 'WhatsApp Ads' : 'Instagram Ads'
anuncio = referral.ad_id ?? referral.source_id
titulo  = referral.ads_context_data.ad_title ?? referral.headline
corpo   = referral.body
url     = referral.source_url ?? referral.referer_uri
tipo, ref, source, ctwa_clid
```

No evento `referral.received` o `referral` vem **na raiz**; dentro da mensagem vem
em `metadata`. Embrulhe a primeira forma para reaproveitar o mesmo leitor, e tire a
rede de `account.platform ?? conversation.platform` — esse evento não tem mensagem.

**O perfil do Instagram** (`instagramProfile`): `isFollower`, `isFollowing`,
`followerCount`, `isVerified`. **Três estados, e o terceiro é o que importa:**
`true` segue, `false` não segue e **ausente é "não sei"** — a Meta só revela a
relação para quem já mandou mensagem à conta, e comentar não dá esse consentimento.
Tratar ausente como "não segue" negaria conteúdo a quem segue há dois anos. É o
mais perto de "novo seguidor" que se chega: evento de seguidor não existe para
conta business, em provedor nenhum.

---

## 9. Registro do webhook (`conectar`)

Acontece no nível do **provedor** — uma assinatura por conta Zernio, servindo todas
as contas sociais dela. É chamada com o canal só porque é do canal que sai o
endereço.

```
1. GET /v1/webhooks/settings
2. nossaRota = "/api/webhooks/zernio/" + provedor.id
   nossos = webhooks cujo `url` CONTÉM nossaRota
3. existente = nossos[0]
4. corpo = { name, url: urlDoWebhook, secret: assinaturaSegredo,
             events: [...], isActive: true }
5. se existente tem _id → PUT /v1/webhooks/settings { ...corpo, _id }
   senão               → POST /v1/webhooks/settings corpo
6. para cada sobra em nossos[1..]:
       DELETE /v1/webhooks/settings?id=<id>   (melhor esforço, ignora falha)
7. consultar situação e devolver
```

**Reconhecer os nossos pela rota, não pela URL inteira.** A rota
`/api/webhooks/zernio/<id do provedor>` é o que não muda; domínio e `?k=` mudam —
na troca de túnel, na ida para produção, na rotação do segredo. Comparando a URL
toda, cada mudança dessas deixava o antigo para trás e criava mais um. O resultado
foi um webhook cadastrado à mão, sem `secret`, convivendo com o nosso: o provedor
entregava pelo errado e todo evento voltava 403, com o cadastro parecendo certo dos
dois lados.

**Apagar as sobras é melhor esforço.** Deixá-las faz o provedor entregar por dois
caminhos e o registro de entregas encher de falha — sem contar a cota de cinquenta.
Falhar aqui não pode desfazer o registro que deu certo.

**Quando chamar:** a cada salvamento do canal, e **só quando a conta já foi
escolhida** (`instancia` preenchida) — sem ela não há o que registrar, e o canal
está pela metade. Não é erro: é cadastro incompleto.

**Melhor esforço na tela também.** Provedor fora do ar não pode impedir alguém de
salvar um canal; o que não pode é falhar calado — a falha vira aviso na resposta e
detalhe de status no canal.

### 9.1. Montagem da URL

```
base   = canal.webhookBase ?? APP_URL     (sem barra final)
url    = base + "/api/webhooks/zernio/" + provedor.id + "?k=" + encodeURIComponent(provedor.webhookSegredo)
```

O endereço do canal vence o do ambiente: em desenvolvimento o `APP_URL` é
`localhost`, que servidor nenhum lá fora alcança.

> **O `?k=` tem de ser o segredo que a rota confere, e quem confere é quem recebe.**
> Numa rota por conta, é o segredo do **provedor**. Escrever o do canal dava um
> endereço que devolvia 403 com o cadastro inteiro correto — e o erro só aparecia
> na primeira mensagem.

---

## 10. Envio — regras do adaptador

```
enviar(canal, mensagem):
  se !canal.instancia → erro "canal sem ID da conta no Zernio"

  se !mensagem.thread:
      instagram → "O Instagram só permite responder a quem escreveu primeiro —
                   esta conversa ainda não tem mensagem do cliente."
      whatsapp  → "Esta conversa ainda não existe no Zernio.
                   Só é possível iniciá-la com um modelo aprovado pela Meta."

  caminho = /v1/inbox/conversations/{thread}/messages

  com mídia   → multipart (§6.2), voiceNote em áudio+whatsapp
  sem mídia   → JSON { accountId, message, replyTo?, buttons? }
```

**A limitação do Instagram é da Meta, não do Zernio** — negócio não abre Direct. A
frase precisa dizer o que fazer, não só que falhou.

### 10.1. Abrir conversa com modelo

`POST /v1/inbox/conversations` é a porta da Meta para começar conversa e para
reabrir a que passou das 24 h. É também o que devolve o `conversationId` — que é a
thread que faltava e que fazia o envio comum parar com "esta conversa ainda não
existe".

Depois de enviar o modelo, **grave a thread devolvida na conversa**.

### 10.2. Consulta de situação

```
conta = GET /v1/accounts?platform={rede} → achar por _id ou id === instancia

sem conta                    → erro:        "O Zernio não conhece esta conta. Ela foi removida de lá?"
conta.needsReconnection      → erro:        "A conta precisa ser reconectada no Zernio."
conta.isActive === false     → desconectado:"A conta está inativa no Zernio."
senão                        → conectado, detalhe = username — qualidade X — tier Y
```

Qualidade e teto de disparo são da Meta e mudam sozinhos. Ficam no detalhe porque é
a linha que a tela mostra, e é onde se descobre que o número caiu de tier **antes**
de uma campanha travar.

---

## 11. Download de mídia

```
baixarMidia(canal, id):
  comChave = id começa com "auth:"
  endereço = id sem o prefixo (5 caracteres em ambos)
  se endereço não começa com "http" → null

  se comChave:
      endereço = garantir accountId na query          ← §11.1
      headers  = { authorization: Bearer <chave do provedor> }
  senão:
      sem headers                                     ← CDN da Meta recusaria

  timeout 30 s
  resposta não-ok → null
  bytes vazios    → null

  devolve { base64, mime: content-type, nome: de content-disposition }
```

### 11.1. O `accountId` na busca

`GET /v1/whatsapp/media/{mediaId}` **exige** a conta que recebeu o arquivo. O `url`
que vem no anexo já costuma trazê-la; quando não traz, acrescente-a sem sobrescrever
a existente. Sem isso o download responde 404 e a bolha fica sem o arquivo.

```
url = new URL(endereço)
se !url.searchParams.has('accountId') → set('accountId', conta)
```

### 11.2. Ordem de tentativas na ingestão

1. base64 embutido no corpo (não é o caso do Zernio, mas o caminho é comum);
2. `.enc` + `mediaKey` (idem);
3. **`baixarMidia(canal, midia.id)`** — o caminho do Zernio e da Meta;
4. miniatura embutida, se houver: melhor a foto pequena que uma bolha vazia — desde
   que gravada como o que ela é (`image/jpeg`);
5. nada: gravar o erro `"O provedor não entregou o arquivo."` — mídia sem arquivo e
   sem erro é indistinguível de mídia que falhou, e foi essa ambiguidade que fez o
   áudio quebrado parecer normal por semanas.

O mime gravado é o **do arquivo que existe**, não o da mensagem: com só a miniatura
salva, um vídeo tem um JPEG guardado, e dizer `video/mp4` daria um tocador que não
toca. Normalize o mime antes de gravar — o `; codecs=opus` do recado de voz não
sobrevive ao upload.

---

## 12. Armadilhas — lista de conferência

| # | Armadilha | Sintoma se errar |
|---|---|---|
| 1 | Deduzir a rede do tipo do provedor | Direct de Instagram cria contato novo a cada mensagem |
| 2 | Não guardar `provider_thread_id` | Instagram somente-leitura |
| 3 | Gravar a thread só ao criar a conversa | Conversa antiga nunca ganha como ser respondida |
| 4 | `content-type` à mão no multipart | Upload quebra sem mensagem clara |
| 5 | Exigir assinatura de webhook sempre | 403 em toda entrega, cadastro inteiro correto |
| 6 | Adivinhar uma só codificação de assinatura | 403 em todo evento com o segredo certo |
| 7 | Parse antes de ler os bytes crus | Assinatura nunca bate |
| 8 | `?k=` com o segredo do canal em rota por provedor | 403 na primeira mensagem, cadastro parecendo certo |
| 9 | Comparar webhook pela URL inteira | Assinaturas duplicadas, entrega pelo webhook errado |
| 10 | `PUT /v1/webhooks/settings/{id}` | 404 → assinatura nova a cada conexão até estourar 50 |
| 11 | Baixar mídia antes de responder 200 | Zernio aborta aos ~5 s; 10 abortos desativam a assinatura |
| 12 | Guardar a URL da mídia em vez de baixar | Bolha aponta para o vazio dias depois |
| 13 | Mandar Bearer no CDN da Meta / omitir no endpoint do Zernio | 403 num caso, 401 no outro |
| 14 | Esquecer `accountId` na busca da mídia de WhatsApp | 404 no download |
| 15 | Não descartar `message.sent` com `source = cloud_api` | Bolha dobrada em tudo que enviamos |
| 16 | Ler `[Unsupported message]` pelo texto | Quebra no dia em que a Meta traduzir |
| 17 | Usar `sender.username` em mensagem que sai | Nosso próprio `@` na ficha de cada cliente |
| 18 | `platforms[]` ignorado na listagem de posts | Zero posts, 200 na resposta, nada na tela |
| 19 | Pegar o primeiro alvo de `platforms[]` | Automação que nunca dispara e não diz por quê |
| 20 | `source=external` esquecido nos posts | Lista vazia (só devolve o publicado pelo Zernio) |
| 21 | Tratar todo 403 como "add-on Inbox" | Manda a pessoa procurar no lugar errado |
| 22 | `displayIdentifier` sem a peneira de "só dígitos" | Telefone gravado como `@` |
| 23 | Laço de paginação sem teto próprio | Requisição infinita se `hasMore` mentir |
| 24 | `template.status_updated` depois do guarda de `message` | Evento descartado em silêncio |
| 25 | Comparar `reaction.sender.id` com nada | Reação da equipe aparece como a do cliente |
| 26 | `commentId` fora do corpo na resposta pública | Comentário solto no post, não embaixo de quem escreveu |
| 27 | Botões na resposta pública | 400 pelo campo a mais |
| 28 | `webhook_base` validado como `url()` genérica | Endereço com dois caminhos e dois segredos, sem erro |
| 29 | `janela_ate` nulo tratado como um caso só | Texto livre para quem nunca escreveu |
| 30 | Engolir erro de gravação em silêncio | Provedor entrega, log limpo, caixa vazia |

---

## 13. Roteiro de implementação

1. **Modelo de dados** — tipo de provedor, rede explícita no canal,
   `provider_thread_id` na conversa com índice parcial único, `tem_janela` separado
   de `janela_ate`.
2. **Cliente HTTP** — Bearer, base configurável, timeout 30 s, erro tipado com
   `code` e `required_group`, tradutor de mensagens (§3.3).
3. **Leitura** — `/v1/auth/verify`, `/v1/accounts`, situação do canal. Já dá para
   cadastrar provedor e escolher a conta na tela.
4. **Webhook: recepção** — rota por provedor, `?k=`, assinatura condicional,
   agrupamento por instância, sempre 200.
5. **Webhook: tradução** — `interpretar()` puro, sem I/O, testável por payload
   fixo. É o maior pedaço e onde estão quase todas as armadilhas.
6. **Ingestão** — bolha primeiro, mídia depois do 200.
7. **Envio** — texto, mídia multipart, `voiceNote`, botões, `replyTo`.
8. **Registro do webhook** — idempotente pela rota, limpeza de sobras.
9. **Modelos** — listagem, contagem de `{{n}}`, `enviarModelo` que devolve a thread.
10. **Instagram social** — comentários, resposta privada, menções, moderação, posts.
11. **Recuperação** — varredura de `@` em `/v1/contacts`, foto do participante.

### Cobertura de teste sugerida

Espelha os `describe` da suíte daqui (`tests/zernio.test.ts`, ~1.4k linhas):

- leitura de webhook (todos os tipos de evento, e os descartes);
- o eco do que nós enviamos (`source = cloud_api`);
- recibos, reações e ciclo de vida;
- assinatura do corpo (hex, base64, prefixo, ausência);
- capacidades declaradas;
- registro do webhook (criar, atualizar por `_id`, limpar sobras, reconhecer pela rota);
- o `@` da pessoa (as duas direções);
- a varredura dos `@` (as três peneiras, a paginação, o teto);
- a varredura sabe dizer por que não achou (os quatro contadores e `chaves`);
- os posts para escolher (as duas formas, o alvo certo em `platforms[]`).

`interpretar()` e a verificação de assinatura são funções puras — teste-as com
payloads fixos, sem rede e sem banco. É onde o retorno por linha de teste é maior.
