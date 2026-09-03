# Zernio no Atendi — análise de encaixe e plano de implementação

Leitura do `ZERNIO-IMPLEMENTACAO.md` contra a base real (`main`, análise de
2026-08-31). O guia descreve a integração como ela existe **em outro sistema**, com
outro modelo de dados: ele fala em `provedor`, `canal`, `provider_thread_id`,
`interpretar()` puro e adaptadores declarando capacidades. Nada disso existe aqui.

Este documento responde a três perguntas: **o que falta na base para o Zernio caber**,
**quais decisões têm de ser tomadas antes da primeira linha**, e **em que ordem
implementar**.

---

## 1. Veredito curto

A integração é viável e o guia é bom o bastante para guiar o código quase linha a
linha. O trabalho **não está no Zernio** — está em três lacunas da base que o Zernio
é o primeiro provedor a exigir de verdade:

1. **Não existe autenticação de webhook.** O Zernio pressupõe `?k=` + HMAC
   condicional (§7.1). Aqui os webhooks aceitam qualquer POST
   (`PLANO-MELHORIAS.md`, item 1). Não dá para implementar §7.1 sem construir a
   infraestrutura que hoje não existe para provedor nenhum.
2. **O provedor é deduzido do canal.** `message-sender.ts:48` e
   `chat.functions.ts:47` fazem `if (conv.channel === 'instagram') provider = 'instagram'`.
   É exatamente a armadilha nº 1 do guia (§1.1), já materializada no código — e um
   canal Instagram do Zernio seria roteado para o provedor Instagram direto.
3. **Não há onde guardar a thread do provedor.** `conversations.remote_id` guarda o
   identificador **do contato** (telefone, LID ou IGSID — ver `instagram-webhook.ts:318`),
   não a conversa no provedor. Sem uma coluna nova, o Instagram via Zernio nasce
   somente-leitura (armadilha nº 2).

Some-se a isso que o caminho de envio está **duplicado** — `sendMessageAction`
(`chat.functions.ts:9-540`, para humano) e `sendPlatformMessage`
(`message-sender.ts:9-509`, para IA) resolvem provedor e enviam por conta própria.
Adicionar Zernio sem unificar significa escrever o adaptador duas vezes e manter as
duas em sincronia para sempre.

---

## 2. O descompasso, item a item

| O guia pressupõe | O que existe aqui | Consequência |
|---|---|---|
| `provedor` (credencial) e `canal` (conta social) como entidades separadas | Só `whatsapp_instances`, que é o canal; credenciais ora globais em `companies` (`evogo_global_token`, `stevo_global_token`), ora por instância (`evogo_api_key`, `oficial_access_token`) | Decisão nº 1 da §3 |
| `rede` **escolhida** no canal | `channel` é fixado pelo webhook (`channel: 'whatsapp'` em `evogo-webhook.ts:869`) e o envio deduz o provedor a partir dele | Precisa inverter a dedução |
| `provider_thread_id` na conversa, com índice parcial único | Não existe | Migration nova |
| `janela_ate` + `tem_janela` separados | Nenhuma lógica de janela de 24 h em lugar nenhum da base (nem para o provedor `oficial`, que já sofre disso hoje) | Ganho colateral: resolve também a Cloud API |
| Webhook por provedor, `?k=` + HMAC condicional | Webhooks sem autenticação; Meta só valida `hub.verify_token` no `GET` | Construir a base |
| `interpretar()` puro, sem I/O, testável | Tradução e ingestão entrelaçadas em ~1.400 linhas por provedor, duplicadas entre EvoGo e Stevo | Escrever o Zernio já no formato novo |
| 200 primeiro, mídia depois (`waitUntil`) | `await processEvogoWebhookBody(body)` antes do 200 (`evogo-webhook.ts:12`), com download de mídia dentro | Zernio aborta em ~5 s e desativa a assinatura após 10 abortos (armadilha nº 11) |
| Capacidades declaradas pelo adaptador | UI decide por `provider === 'x'` espalhado (`instance-settings-modal.tsx:43-52`, `settings.tsx:358+`) | Zernio precisa de `qr: false`, `edicao: false`, `exclusao: false` |
| Uma conta Zernio serve WhatsApp **e** Instagram | `whatsapp_instances.provider` tem CHECK fechado em `('evogo','oficial','stevo','instagram','messenger','facebook')` | Alterar a constraint |

O que **já existe e serve** — e é mais do que parece:

- `channel_type` já tem `whatsapp` e `instagram`. **Nenhuma mudança de enum.**
- `contacts` já tem `instagram_id`, `instagram_username`, `messenger_id`,
  `whatsapp_lid`, `merged_into_id`. A identidade omnichannel do §8.7 tem onde morar.
- `whatsapp_templates` já existe com `(instance, name, language)` único e
  `components JSONB` — encaixa direto no §6.7.
- O bucket `media` do Storage e o padrão de upload
  (`whatsapp-cloud-webhook.ts:355-370`) servem sem alteração.
- `messages.metadata` (JSONB), `reactions`, `quoted_message_id`, `remote_msg_id`,
  `participant_jid` cobrem quase todo o §8.7.

---

## 3. Três decisões antes de codar

### Decisão 1 — Onde mora a credencial Zernio

O guia separa provedor de canal porque **a assinatura de webhook é do usuário
Zernio, não da conta social** (§1.3), e porque o `?k=` da URL tem de ser o segredo
*do provedor* (§9.1, armadilha nº 8). Aqui não há essa camada. Duas saídas:

**(a) No nível da empresa** — colunas em `companies`, seguindo o precedente de
`evogo_global_token` / `stevo_global_token`:

```
companies.zernio_api_key          text   -- Bearer
companies.zernio_base_url         text   -- default https://zernio.com/api
companies.zernio_webhook_secret   text   -- 32 bytes, gerado por nós  (?k=)
companies.zernio_signature_secret text   -- 32 bytes, gerado por nós  (HMAC)
```

Rota: `/api/webhooks/zernio/{companyId}?k=…`. Uma conta Zernio por empresa.

**(b) Tabela `provider_accounts`** — a modelagem que o guia pressupõe, reaproveitável
depois por EvoGo/Stevo:

```
provider_accounts(id, company_id, type, base_url, api_key,
                  webhook_secret, signature_secret, active)
```

Rota: `/api/webhooks/zernio/{providerAccountId}?k=…`.

> **Revisto em `ZERNIO-PROVEDOR-E-CANAIS.md` §2.2: a recomendação passou a ser (b).**
> O motivo é de RLS, não de elegância: `settings.tsx` lê `companies` direto do
> cliente com a chave anônima, então toda coluna de credencial ali fica legível por
> qualquer usuário autenticado da empresa — inclusive `agent`. Uma tabela
> `message_providers` sem policy de `SELECT` para `authenticated` resolve por
> construção, e serve de casa para migrar EvoGo, Stevo e Meta depois. A migration
> re-inquilinada (empresa + unidade) está naquele documento, §4.

### Decisão 2 — Como a rede deixa de ser deduzida

O canal ganha a rede explícita, e o **envio passa a despachar pelo provedor da
instância, não pelo `channel` da conversa**:

```
whatsapp_instances.provider   = 'zernio'
whatsapp_instances.network    = 'whatsapp' | 'instagram'   -- coluna nova
whatsapp_instances.zernio_account_id text                  -- o accountId de 24 hex
```

E a inversão, nos dois caminhos de envio:

```ts
// hoje (message-sender.ts:48, chat.functions.ts:47)
if (conv.channel === 'instagram') provider = 'instagram';

// depois
const instance = await carregarInstancia(conv.whatsapp_instance_id);
const provider = instance.provider;          // 'zernio' | 'instagram' | 'evogo' | …
```

`conversations.channel` continua sendo preenchido — `whatsapp` ou `instagram`,
conforme `instance.network` — porque é o que a interface usa para ícone e filtro. Ele
só deixa de decidir **por onde se envia**.

> Esta mudança tem alcance maior que o Zernio: hoje, uma conversa de Instagram cuja
> instância foi apagada ou trocada cai num `.eq("provider","instagram")` que não acha
> nada, e o envio falha com mensagem genérica. A inversão conserta isso de passagem.

### Decisão 3 — O escopo da v1

O guia cobre onze frentes (§13). Quatro delas — **comentários, resposta privada,
menções e posts** (§6.4, §6.5) — não têm onde aparecer: o Atendi não tem tela de
comentários, nem de posts, nem entidade para "automação por palavra-chave em
comentário". Implementá-las seria construir um produto novo junto com a integração.

**Recomendação:** v1 = mensagens ponta a ponta (receber, enviar, mídia, reação,
citação, modelos, recibos, situação da conta). Comentários e posts entram quando
existir a tela que os justifique. A `recuperação de @` (§6.6) e a `foto do
participante` (§6.8) são baratas e ficam para a v1.1.

---

## 4. Modelo de dados — a migration

```sql
-- 1. Credencial do provedor (Decisão 1a)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS zernio_api_key          TEXT,
  ADD COLUMN IF NOT EXISTS zernio_base_url         TEXT,
  ADD COLUMN IF NOT EXISTS zernio_webhook_secret   TEXT,
  ADD COLUMN IF NOT EXISTS zernio_signature_secret TEXT;

-- 2. O canal
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS network           TEXT,
  ADD COLUMN IF NOT EXISTS zernio_account_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_base      TEXT;   -- §4.2, só origem

ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_provider
  CHECK (provider IN ('evogo','oficial','stevo','instagram','messenger','facebook','zernio'));

ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_network
  CHECK (network IS NULL OR network IN ('whatsapp','instagram'));

-- Zernio sem rede escolhida é cadastro pela metade (§1.1)
ALTER TABLE public.whatsapp_instances ADD CONSTRAINT zernio_requires_network
  CHECK (provider <> 'zernio' OR network IS NOT NULL);

-- 3. A thread (§4.3)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS provider_thread_id TEXT;

COMMENT ON COLUMN public.conversations.provider_thread_id IS
  'Identificador da conversa no provedor, quando é por ele que se envia. '
  'Nulo em provedor que endereça pelo destinatário (EvoGo, Cloud API).';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_provider_thread_uk
  ON public.conversations (whatsapp_instance_id, provider_thread_id)
  WHERE provider_thread_id IS NOT NULL;

-- 4. Janela de 24 h (§4.4) — o nulo ambíguo resolvido com o booleano separado
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_window        BOOLEAN NOT NULL DEFAULT false;
```

Três observações sobre isso:

- **`provider_thread_id` grava em toda passagem, nunca só no `insert`** (§4.3). Uma
  conversa aberta antes do canal existir precisa ganhar como ser respondida na
  primeira mensagem nova.
- O índice único é **parcial** porque a coluna é nula na esmagadora maioria das
  linhas, e um nulo não pode impedir o próximo.
- `has_window = false` como padrão é o correto: as conversas existentes são de
  EvoGo, onde a janela não se aplica.

---

## 5. Onde cada peça encaixa

```
src/lib/canais/                      ← novo
  tipos.ts          contrato: enviar, baixarMidia, capacidades, situacao
  zernio/
    client.ts       §3 — Bearer, base configurável, 30 s, erro tipado
    interpretar.ts  §8 — PURO, sem I/O. É o pedaço testável.
    adaptador.ts    §10 — envio, multipart, voiceNote, botões, replyTo
    webhook-setup.ts §9 — registro idempotente pela rota
src/lib/server/
  zernio-webhook.ts §7 — recepção: ?k=, HMAC condicional, 200 sempre
  webhook-auth.ts   compartilhado: timingSafeEqual, HMAC nas três codificações
src/server.ts       + rota /api/webhooks/zernio/:companyId
```

Pontos de contato com o que já existe:

| Peça | Arquivo atual | O que muda |
|---|---|---|
| Despacho de envio | `message-sender.ts:44-197`, `chat.functions.ts:40-540` | Inverter a dedução (Decisão 2) e chamar o adaptador |
| Criação de instância | `settings.tsx:354-430` | Opção "Zernio", escolha da rede, seleção da conta via `GET /v1/accounts` |
| Tela da instância | `instance-settings-modal.tsx:43-52` | `qr: false` — sem QR, sem "conectar"; só situação (§10.2) |
| Modelos | `whatsapp-templates-tab.tsx`, `whatsapp.functions.ts:5` | Sincronizar de `/v1/whatsapp/templates`, contar `{{n}}` (§6.7) |
| Mídia | padrão de `whatsapp-cloud-webhook.ts:355-370` | Reusar o upload; o que muda é o prefixo `auth:`/`open:` (§8.7, §11) |
| Ingestão | `instagram-webhook.ts:277-380` é o análogo mais próximo | Reusar a lógica de contato/conversa; **não** copiar o arquivo |

**Sobre a duplicação do envio.** Antes de escrever o adaptador, faça
`sendMessageAction` delegar a `sendPlatformMessage` em vez de reimplementá-la. É meio
dia de trabalho e evita que o Zernio nasça duplicado como o Stevo. Se essa unificação
não couber agora, o adaptador tem de ficar **atrás de uma função só**, chamada dos
dois lados — nunca dois blocos `if (provider === 'zernio')`.

---

## 6. Fases

**Fase 0 — pré-requisitos (2–3 dias).**
Autenticação de webhook compartilhada (`webhook-auth.ts`: `timingSafeEqual`, HMAC em
hex/base64/prefixo, varredura de cabeçalhos por `/signature|signed|hmac|hub\.|digest/i`).
Inversão da dedução provedor↔canal. Unificação do caminho de envio.
*Nada disso é Zernio — é o que o Zernio exige e a base não tem.*

**Fase 1 — dados e leitura (1–2 dias).**
A migration da §4. Cliente HTTP com erro tipado (`code`, `required_group`) e o
tradutor de mensagens da §3.3 — as frases importam, e a lição do 403 (duas causas,
consertadas em lugares diferentes) é a diferença entre o suporte achar o problema em
minutos ou em uma tarde. `GET /v1/auth/verify` e `GET /v1/accounts` já permitem
cadastrar o provedor e escolher a conta na tela.

**Fase 2 — recepção (2–3 dias).**
Rota por empresa, `?k=` em tempo constante, assinatura **condicional** (quando vem,
tem de bater; quando não vem, vale o `?k=` — §7.1), bytes crus antes do parse,
agrupamento por instância, sempre 200. Instância desconhecida é linha de log, não erro.

**Fase 3 — tradução (3–5 dias, o maior pedaço).**
`interpretar()` puro, testável por payload fixo. É onde moram quase todas as 30
armadilhas: a ordem dos descartes, o eco de `source = cloud_api`, `metadata.unsupported`,
a identidade nas duas direções, o `@` que só vem de `participantUsername`, o prefixo
`auth:`/`open:` da mídia, `template.status_updated` **antes** do guarda de `message`.
**Escreva os testes junto** — a base tem zero, e esta é a função que mais paga por eles.

**Fase 4 — ingestão e envio (3–4 dias).**
Bolha primeiro com estado `baixando`, 200, mídia depois. Envio: texto JSON, mídia
multipart, `voiceNote` para áudio de WhatsApp, botões `url` (máx. 3, rótulo em 20),
`replyTo`. Gravar a thread devolvida.

**Fase 5 — registro do webhook e modelos (2 dias).**
`conectar` idempotente reconhecendo os nossos **pela rota** (`PUT` com `_id` no corpo,
nunca `/settings/{id}`), limpeza de sobras em melhor esforço. Modelos: listagem,
contagem por marcador distinto, `enviarModelo` que devolve a thread.

**Total: 13–19 dias úteis** para a v1 de mensagens, incluindo a Fase 0.
Sem a Fase 0, o Zernio não sai — e com ela, EvoGo, Stevo e os quatro webhooks da Meta
ganham autenticação de brinde.

---

## 7. As armadilhas em que esta base cairia hoje

Das 30 da §12, estas são as que os padrões atuais do Atendi produzem **por inércia** —
alguém que implemente "seguindo o que já está lá" erra nelas:

| Nº | Armadilha | Por que aqui é provável |
|---|---|---|
| 1 | Deduzir a rede do tipo do provedor | O código já faz isso, em dois arquivos |
| 2 | Não guardar a thread | Não há coluna; `remote_id` parece servir e não serve |
| 3 | Gravar a thread só no `insert` | Os webhooks atuais montam `updatePayload` só em alguns ramos |
| 11 | Baixar mídia antes do 200 | É literalmente o que `evogo-webhook.ts:12` faz hoje |
| 15 | Não descartar o eco `source = cloud_api` | Não há dedup por `remote_msg_id` (item 7 do `PLANO-MELHORIAS`) — o eco duplicaria de verdade |
| 29 | `janela_ate` nulo tratado como um caso só | Não existe janela nenhuma; o instinto é uma coluna só |
| 30 | Engolir erro de gravação em silêncio | `catch (err) { console.error(...) }` e segue é o padrão dos webhooks atuais |

As outras 23 são do provedor e o guia já as descreve bem — vale imprimir a tabela e
usá-la como checklist de revisão da Fase 3.

---

## 8. Achado colateral

`merge_contacts` (`supabase/migrations/20260620104000_add_omnichannel_identity.sql`)
faz `UPDATE public.messages SET contact_id = target_id`, mas `messages` **não tem
`contact_id`** (ver `supabase/full_schema.sql`). A RPC é chamada pela interface em
`src/components/contacts/merge-contact-dialog.tsx:63` e deve estar falhando em toda
execução.

Importa aqui porque o Zernio traz WhatsApp e Instagram sob a mesma conta, e a mesma
pessoa nos dois canais é o caso comum: a fusão de contatos passa a ser usada de
verdade. Vale conferir antes da Fase 4 — remover a linha, ou criar a coluna, conforme
a intenção original.

---

## 9. O que fica de fora da v1, e por quê

| Frente | Por quê |
|---|---|
| Comentários, resposta privada, menções (§6.4) | Não há tela de comentários no produto. A resposta privada é a peça mais valiosa do Zernio para marketing ("comente EU QUERO"), mas exige a entidade "automação por comentário", que não existe |
| Posts (§6.5) | Só faz sentido acompanhando a frente acima |
| Recuperação de `@` (§6.6) | Útil só depois de haver base de contatos de Instagram vinda do Zernio |
| Foto do participante (§6.8) | Enfeite; entra na v1.1 com o botão de atualizar |
| Edição e exclusão | O provedor não suporta em WhatsApp nem Instagram — `edicao: false`, `exclusao: false` |
