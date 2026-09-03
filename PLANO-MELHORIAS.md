# Plano de melhorias — Atendi

Diagnóstico técnico da base em 2026-08-31 (branch `main`, commit `07b44bd`) e o
que fazer com cada achado. Ordenado por gravidade: os itens de segurança abrem o
documento porque qualquer um deles, isolado, expõe dados entre clientes.

Cada item traz **onde está** (arquivo:linha), **o que quebra** e **como corrigir**.

---

## Sumário de prioridade

| # | Item | Tipo | Gravidade | Esforço |
|---|---|---|---|---|
| 1 | Webhooks aceitam qualquer POST, sem autenticação | Segurança | Crítica | M |
| 2 | Duas server functions sem `requireSupabaseAuth` | Segurança | Crítica | P |
| 3 | Actions autenticadas sem checagem de posse (IDOR entre tenants) | Segurança | Alta | M |
| 4 | Segredo de cron hardcoded no código | Segurança | Alta | P |
| 5 | Credenciais de provedor e chaves de LLM em texto plano | Segurança | Alta | G |
| 6 | Policy `USING (true)` em `opportunity_history` | Segurança | Média | P |
| 7 | Ingestão sem idempotência — mensagem duplica no retry | Correção | Alta | P |
| 8 | Busca de mensagem citada sem escopo de empresa | Correção | Alta | P |
| 9 | Round-robin com race condition | Correção | Média | M |
| 10 | `setInterval` de cron no entry SSR não funciona em serverless | Correção | Média | P |
| 11 | Realtime sem filtro + logs por evento e por render | Performance | Média | P |
| 12 | ~2.900 linhas duplicadas entre EvoGo e Stevo | Manutenção | Alta | G |
| 13 | Arquivos gigantes (`conversations.tsx` com 3.355 linhas) | Manutenção | Média | G |
| 14 | Zero testes, 307 `: any`, 132 `console.log` | Manutenção | Média | G |
| 15 | 54 arquivos de scratch/patch versionados na raiz | Higiene | Baixa | P |

Esforço: P = até meio dia · M = 1–3 dias · G = mais de uma semana.

---

# Segurança

## 1. Webhooks aceitam qualquer POST, sem autenticação

**Onde:** `src/lib/server/evogo-webhook.ts:8` (`handleEvogoWebhook`),
`src/lib/server/stevo-webhook.ts` (mesma função copiada), e o roteamento em
`src/server.ts:63-103`.

**O que quebra.** O handler faz `await request.json()` e confia no corpo inteiro.
Não há apikey, não há HMAC, não há allowlist de IP. O campo `instance` do payload
resolve a empresa, e tudo é gravado com `supabaseAdmin` — que ignora RLS por
definição. Quem descobrir a URL (ela aparece na configuração do provedor, em log
de proxy, em print de suporte) consegue:

- inserir mensagem em conversa de qualquer empresa;
- criar contato e conversa novos em qualquer empresa;
- disparar o agente de IA — que consome a chave de LLM do cliente;
- alterar contato via evento `PushName` (`evogo-webhook.ts:44-79` reescreve
  `phone` e `name` de um contato existente a partir do corpo).

Nos webhooks da Meta a situação é parecida por outro caminho: o `hub.verify_token`
é validado só no `GET` de verificação
(`whatsapp-cloud-webhook.ts:14`, `instagram-webhook.ts:10`,
`messenger-webhook.ts:10`, `facebook-webhook.ts:9`). O `POST` que carrega as
mensagens não valida `x-hub-signature-256`.

**Como corrigir.**

*EvoGo / Stevo* — provedores sem assinatura. Use um segredo por instância na
própria URL do webhook, que é o que se registra no painel do provedor:

```
/api/webhooks/evogo/:webhookSecret
```

Guarde o segredo em `whatsapp_instances.webhook_secret` (gerado no cadastro da
instância), resolva a instância **pelo segredo** e valide que o `instance` do
corpo bate com a instância resolvida. Compare com `crypto.timingSafeEqual`.

```ts
// src/lib/server/webhook-auth.ts
import crypto from 'node:crypto';

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function resolveInstanceBySecret(secret: string) {
  const { data } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, company_id, instance_name, provider')
    .eq('webhook_secret', secret)
    .maybeSingle();
  return data;
}
```

*Meta (WhatsApp Cloud, Instagram, Messenger, Facebook)* — valide a assinatura
antes de ler o corpo como JSON:

```ts
function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(rawBody, 'utf8')
    .digest('hex');
  return safeEqual(header.slice(7), expected);
}
```

Atenção: é preciso ler `await request.text()` **uma vez** e usar a mesma string
para o HMAC e para o `JSON.parse` — reserializar muda os bytes e a assinatura
nunca fecha.

*Migração sem downtime.* Manter as rotas antigas por um período, mas: registrar
`console.warn` a cada chegada sem segredo, e trocar as URLs no painel de cada
provedor antes de remover. Rotas legadas hoje ativas: `/api/evogo/webhook`
(`src/server.ts:69`) e `/api/webhooks/stevochat` (`src/server.ts:92`).

---

## 2. Duas server functions sem `requireSupabaseAuth`

**Onde:** `src/lib/api/whatsapp.functions.ts:5` (`syncCloudTemplatesAction`) e
`src/lib/api/whatsapp.functions.ts:17` (`exchangeMetaCodeAction`).

**O que quebra.** Toda action de `chat.functions.ts` encadeia
`.middleware([requireSupabaseAuth])` — estas duas não. `createServerFn` publica um
endpoint HTTP; sem middleware ele é público.

`exchangeMetaCodeAction` é a pior das duas: recebe `companyId` do cliente, troca o
código pelo token da Meta e grava:

```ts
await supabaseAdmin
  .from("companies")
  .update({ meta_system_user_token: userAccessToken })
  .eq("id", data.companyId);          // companyId vem do corpo, sem validação
```

Ou seja: endpoint público que sobrescreve a credencial Meta de qualquer empresa
cujo UUID o atacante conheça — e o UUID circula em URL e em payload do front.

**Como corrigir.**

```ts
export const exchangeMetaCodeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ code: z.string(), redirectUri: z.string().url() }))
  .handler(async ({ data, context }) => {
    // companyId NÃO vem do cliente: sai do perfil do usuário autenticado
    const { data: profile } = await context.supabase
      .from('profiles').select('company_id, role').eq('id', context.userId).single();
    if (!profile?.company_id) throw new Error('Perfil sem empresa.');
    if (!['admin_company', 'super_admin'].includes(profile.role))
      throw new Error('Sem permissão para conectar contas Meta.');
    // ...
  });
```

O mesmo para `syncCloudTemplatesAction`: autenticar e conferir que a
`instanceId` pertence à empresa do usuário.

**Regra geral:** `companyId`, `unitId` e afins nunca devem vir do cliente quando
podem ser derivados do perfil autenticado. O que vem do cliente é o *alvo* da
operação, e ele tem de ser validado (item 3).

---

## 3. Actions autenticadas sem checagem de posse (IDOR entre tenants)

**Onde:** `transferConversationAction` (`src/lib/api/chat.functions.ts:1274`),
`salesCoachAction` (`:2109`), `fixMessageTextAction` (`:1890`),
`salesCoachSuggestAction` (`:2259`), `transcribeCallAction` (`:1994`).

**O que quebra.** O padrão correto existe e está em `sendMessageAction`
(`chat.functions.ts:25`): ler primeiro pelo cliente **com RLS** do contexto e só
depois usar `supabaseAdmin`.

```ts
const { data: conv, error: convErr } = await supabase   // ← cliente com RLS
  .from("conversations").select(...).eq("id", data.conversationId).single();
if (convErr || !conv) throw new Error("Conversation not found or access denied.");
```

As actions listadas pulam essa etapa e vão direto ao `supabaseAdmin` com o UUID
recebido:

```ts
// transferConversationAction — nenhuma validação de posse antes do update
const { userId } = context;
const { data: convInfo } = await supabaseAdmin
  .from("conversations").select("company_id, whatsapp_instances(unit_id)")
  .eq("id", data.conversationId).maybeSingle();
```

Resultado: um agente autenticado do cliente A transfere, analisa ou reescreve
conversa do cliente B, bastando o UUID.

**Como corrigir.** Extrair um guard único e usá-lo no topo de toda action que
recebe um id de recurso:

```ts
// src/lib/api/guards.ts
export async function assertConversationAccess(
  supabase: SupabaseClient<Database>,   // cliente COM RLS, vindo do context
  conversationId: string,
) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, company_id, unit_id, contact_id, status, channel, whatsapp_instance_id')
    .eq('id', conversationId)
    .single();
  if (error || !data) throw new Error('Conversa não encontrada ou acesso negado.');
  return data;
}
```

E então, em cada handler:

```ts
const conv = await assertConversationAccess(context.supabase, data.conversationId);
// só a partir daqui é legítimo usar supabaseAdmin
```

Vale o mesmo para `contactId`, `messageId`, `opportunityId`, `instanceId`.
Uma varredura útil: procurar por `supabaseAdmin` cuja primeira operação do handler
seja um `.eq('id', data.<algumId>)` sem um `context.supabase` antes.

---

## 4. Segredo de cron hardcoded

**Onde:** `src/lib/server/cron.ts:7` e `src/server.ts:22`.

```ts
const cronSecret = process.env.CRON_SECRET || 'atendi-cron-secret-123';
if (url.hostname !== 'localhost' && authHeader !== `Bearer ${cronSecret}`
    && url.searchParams.get('secret') !== cronSecret) { /* 401 */ }
```

**O que quebra.** O fallback está no código versionado, e o mesmo literal aparece
na URL de `src/server.ts:22`. Sem `CRON_SECRET` no ambiente, o endpoint está
aberto a quem leu o repositório. O bypass por `hostname === 'localhost'` também
depende do `Host` recebido, que pode ser forjado atrás de proxy.

**Como corrigir.** Sem fallback, sem exceção de host, e segredo pelo header:

```ts
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret) return new Response('Cron não configurado', { status: 503 });
const header = request.headers.get('authorization') ?? '';
if (!header.startsWith('Bearer ') || !safeEqual(header.slice(7), cronSecret)) {
  return new Response('Unauthorized', { status: 401 });
}
```

Trocar o valor atual: ele já vazou para o histórico do git. E remover o segredo da
query string — query string entra em log de acesso.

---

## 5. Credenciais em texto plano no banco

**Onde:** `companies.evogo_global_token`, `companies.stevo_global_token`,
`companies.meta_system_user_token`, `whatsapp_instances.oficial_access_token`,
`whatsapp_instances.wavoip_token`, e as chaves de LLM em
`companies.ai_settings.keys` (lidas em `src/lib/server/ai-generator.ts:100`).
Todas `TEXT` puro.

**O que quebra.** Um vazamento de leitura (RLS mal configurada, dump, backup,
credencial de service role exposta) entrega junto o acesso ao WhatsApp de todos os
clientes e as chaves de OpenAI/Groq — estas com custo direto.

**Como corrigir.** Em ordem de custo-benefício:

1. Garantir que **nenhuma policy** exponha essas colunas ao cliente. Hoje o front
   lê `companies` diretamente; conferir se o `select` do front não traz os tokens.
   O caminho robusto é mover os segredos para uma tabela `company_secrets` sem
   policy de `SELECT` para `authenticated` — só o service role lê.
2. Cifrar com Supabase Vault (`vault.create_secret` / `vault.decrypted_secrets`),
   guardando na coluna apenas o id do segredo.
3. Registrar em `ai_settings` só o *nome* do provedor; a chave em Vault.

Como o item 1 já corta a maior parte do risco e custa pouco, comece por ele.

---

## 6. Policy `USING (true)`

**Onde:** `supabase/migrations/20260807182000_create_opportunity_history.sql:13`

```sql
CREATE POLICY "opportunity_history_select" ON public.opportunity_history
  FOR SELECT USING (true);
```

**O que quebra.** Qualquer usuário autenticado — de qualquer empresa — lê o
histórico de oportunidades de todo mundo: valores, etapas, datas.

**Como corrigir.** Nova migration alinhando com a policy de `opportunities`:

```sql
DROP POLICY IF EXISTS "opportunity_history_select" ON public.opportunity_history;
CREATE POLICY "opportunity_history_select" ON public.opportunity_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_history.opportunity_id
        AND o.company_id = public.current_company_id()
    )
  );
```

Aproveitar a mesma migration para auditar as 121 policies em busca de outros
predicados largos.

---

# Correção e robustez

## 7. Ingestão sem idempotência

**Onde:** inserts em `messages` no `evogo-webhook.ts` (linhas 333, 545, 743, 761,
955, 1040) e os equivalentes em `stevo-webhook.ts`.

**O que quebra.** A tabela tem `remote_msg_id`, mas não há índice único sobre ele
e os inserts são `insert` simples. Provedor que não recebe o 200 no prazo reenvia
— e a mensagem aparece duas vezes na conversa. O risco é concreto porque
`handleEvogoWebhook` aguarda o processamento inteiro antes de responder
(`evogo-webhook.ts:12`), incluindo download de mídia, o que aumenta a chance de
timeout do lado do provedor.

**Como corrigir.**

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_remote_unique
  ON public.messages (conversation_id, remote_msg_id)
  WHERE remote_msg_id IS NOT NULL;
```

(Limpar duplicatas existentes antes, senão o índice não cria.)

E trocar os inserts por upsert idempotente:

```ts
await supabaseAdmin
  .from('messages')
  .upsert(payload, { onConflict: 'conversation_id,remote_msg_id', ignoreDuplicates: true });
```

Vale também guardar um marcador de evento já processado para os eventos que não
são mensagem (reação, edição, status), com a mesma lógica.

---

## 8. Busca de mensagem citada sem escopo de empresa

**Onde:** `src/lib/server/evogo-webhook.ts:954` (e o gêmeo no `stevo-webhook.ts`).

```ts
const { data: quotedMsg } = await supabaseAdmin
  .from('messages').select('id')
  .eq('remote_msg_id', quotedStanzaId)
  .single();
```

**O que quebra.** Varre a tabela inteira, sem `conversation_id` e sem empresa.
Dois problemas: `.single()` lança erro quando dois tenants têm o mesmo stanza id
(o provedor não garante unicidade global), derrubando o processamento do evento; e
quando não lança, pode vincular a citação a uma mensagem de outro cliente.

**Como corrigir.**

```ts
const { data: quotedMsg } = await supabaseAdmin
  .from('messages').select('id')
  .eq('conversation_id', conversationId)
  .eq('remote_msg_id', quotedStanzaId)
  .maybeSingle();
```

`maybeSingle()` em vez de `single()` em toda busca opcional — o mesmo padrão
aparece em outros pontos dos webhooks.

---

## 9. Round-robin com race condition

**Onde:** `src/lib/server/routing.ts:56-64`.

```ts
const lastIndex = config.last_assigned_index ?? -1;
const nextIndex = (lastIndex + 1) % agentIds.length;
await supabaseAdmin.from('lead_routing_configs')
  .update({ last_assigned_index: nextIndex }).eq('id', config.id);
```

**O que quebra.** Ler, calcular e gravar em três passos. Dois leads chegando junto
leem o mesmo `last_assigned_index` e caem no mesmo agente — enquanto o próximo da
fila é pulado. Em horário de pico é o caso comum, não o raro.

**Como corrigir.** Incremento atômico no banco, com uma RPC que devolve o índice
já reservado:

```sql
CREATE OR REPLACE FUNCTION public.next_routing_index(_config_id uuid, _count int)
RETURNS int LANGUAGE sql VOLATILE AS $$
  UPDATE public.lead_routing_configs
     SET last_assigned_index = (COALESCE(last_assigned_index, -1) + 1) % _count
   WHERE id = _config_id
  RETURNING last_assigned_index;
$$;
```

O `UPDATE ... RETURNING` trava a linha, então chamadas concorrentes serializam.
Uma ressalva a documentar: a lista de agentes é ordenada por `id` a cada chamada
(`routing.ts:51`), então entrada/saída de agente reembaralha a sequência. Se a
distribuição justa importar, o critério melhor é "agente com menos conversas
abertas", não índice rotativo.

---

## 10. `setInterval` de cron no entry SSR

**Onde:** `src/server.ts:16-27`.

```ts
setInterval(() => {
  const mockReq = new Request('http://localhost/api/cron/follow-ups?secret=atendi-cron-secret-123');
  handleCronFollowUps(mockReq).catch(...);
}, 60 * 1000);
```

**O que quebra.** O build usa `preset: 'vercel'` (`vite.config.ts`). Em função
serverless o processo não sobrevive entre requisições: o intervalo ou nunca dispara
ou dispara de forma imprevisível. Num runtime que persista, dispara **uma vez por
instância** — N instâncias, N follow-ups para o mesmo cliente. E a URL embute o
segredo do item 4 mais o bypass de `localhost`.

**Como corrigir.** Remover o bloco do entry e agendar de fora:

```json
// vercel.json
{ "crons": [{ "path": "/api/cron/follow-ups", "schedule": "* * * * *" }] }
```

O cron da Vercel envia `Authorization: Bearer $CRON_SECRET`, que é exatamente o
formato do item 4. Alternativa, se o agendamento tiver de viver no banco:
`pg_cron` + `pg_net` chamando a rota.

Independentemente do agendador, o handler precisa ser reentrante: hoje ele varre
conversas e enfileira follow-up sem lock, então duas execuções sobrepostas mandam
a mesma mensagem duas vezes. Um `WHERE ai_last_followup_at < now() - interval` com
`UPDATE ... RETURNING` para reservar a conversa resolve.

---

## 11. Realtime sem filtro e logs em caminho quente

**Onde:** `src/routes/_authenticated/conversations.tsx:550-706`.

```ts
.on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, ...)
.on("postgres_changes", { event: "*", schema: "public", table: "messages" }, ...)
```

**O que quebra.** A assinatura não tem `filter`, então cada cliente conectado
recebe todo evento das duas tabelas que a RLS de realtime deixar passar — inclusive
de outras unidades da mesma empresa, que o usuário não vê na tela. Custo de banda e
de CPU no navegador proporcional ao movimento da plataforma inteira, não ao da tela.

Somam-se dois logs em caminho quente: `console.log("Realtime: messages updated",
payload)` a cada evento (`:620`) e `console.log("DEBUG_FILTERED:", filtered)`
(`:709`) que serializa a lista inteira **a cada render**.

**Como corrigir.**

```ts
.on("postgres_changes", {
  event: "*", schema: "public", table: "messages",
  filter: `company_id=eq.${companyId}`,     // ou unit_id, conforme a tela
}, ...)
```

`messages` hoje não tem `company_id`; ou se adiciona a coluna (desnormalizada,
preenchida por trigger) ou se assina por `conversation_id` da conversa aberta e se
usa a tabela `conversations` para o resto da lista. Remover o `DEBUG_FILTERED` e
trocar os logs de evento por um logger que só fala em desenvolvimento.

---

# Manutenção

## 12. ~2.900 linhas duplicadas entre EvoGo e Stevo

**Onde:**

| Par de arquivos | Linhas / bytes | Diferença real |
|---|---|---|
| `stevo-webhook.ts` × `evogo-webhook.ts` | 1.435 × 1.431 linhas | ~60 linhas após normalizar nomes |
| `src/lib/stevo.ts` × `src/lib/evogo.ts` | 7.125 B cada | idênticos, só o nome muda |
| `integrations/stevo/client.ts` × `integrations/evogo/client.ts` | 5.523 B cada | idênticos, só o nome muda |

**O que quebra.** Todo bugfix precisa ser aplicado duas vezes, e a segunda é a que
se esquece. Os itens 7 e 8 deste documento, por exemplo, existem em dobro. Quando
entrar um terceiro provedor, vira três.

**Como corrigir.** Um contrato de canal e um adaptador por provedor — a arquitetura
que o `ZERNIO-IMPLEMENTACAO.md` já descreve em detalhe:

```
src/lib/canais/
  tipos.ts        // contrato: enviar, baixarMidia, conectar, capacidades
  evogo.ts        // adaptador
  stevo.ts        // adaptador (Stevo é EvoGo com outra marca: herda quase tudo)
  cloud-api.ts
  instagram.ts
  index.ts        // registry: provider -> adaptador
```

E um pipeline de ingestão único, que recebe eventos **já traduzidos** para uma
forma comum. O webhook por provedor fica responsável só pela tradução; a criação de
contato, conversa, sessão e mensagem passa a existir uma vez só.

Sequência sugerida, para não parar a operação:

1. Extrair a forma comum do evento (`EventoCanal`) a partir do que os dois webhooks
   já produzem.
2. Escrever o pipeline único consumindo `EventoCanal`.
3. Reescrever `evogo-webhook.ts` como tradutor puro sobre esse pipeline.
4. Apagar `stevo-webhook.ts` e apontar o Stevo para o mesmo tradutor com
   configuração diferente (a diferença é a marca e o host).
5. Unificar `lib/evogo.ts` + `lib/stevo.ts` num só adaptador de envio.

---

## 13. Arquivos grandes demais

| Arquivo | Linhas |
|---|---|
| `src/routes/_authenticated/conversations.tsx` | 3.355 |
| `src/lib/api/chat.functions.ts` | 2.522 |
| `src/routes/_authenticated/settings.tsx` | 1.637 |
| `src/components/contacts/contact-details-sheet.tsx` | 1.610 |

`conversations.tsx` concentra 28 `useState`, 14 `useQuery` e 10 `useEffect` num
componente só. É a tela mais usada do produto e a mais arriscada de mexer.

**Como corrigir.** Sem reescrita: extrair por responsabilidade, uma fatia por vez,
começando pelas que já têm fronteira clara.

- `useConversationsRealtime()` — todo o bloco de `:545-706`.
- `useConversationList()` — query, filtros, paginação infinita.
- `useMessageThread(conversationId)` — mensagens, envio, otimismo de UI.
- `<ConversationListPanel>`, `<MessageThreadPanel>`, `<ContactPanel>`.

`chat.functions.ts` divide-se naturalmente em `messages.functions.ts`,
`conversations.functions.ts`, `contacts.functions.ts` e `ai.functions.ts`.

---

## 14. Testes, tipagem e logs

- **Zero testes** no repositório. Nada verifica os webhooks — que são o ponto de
  entrada mais complexo e o menos observável do sistema.
- **307 ocorrências de `: any`** em `src/`, apesar de `strict: true` no
  `tsconfig.json`. Concentram-se justamente nos payloads de webhook, onde a
  tipagem valeria mais.
- **132 `console.log`** em `src/`, vários em caminho quente (item 11).

**Como corrigir.** Não é candidato a mutirão; é candidato a regra de entrada:

1. Instalar Vitest e escrever o primeiro teste sobre a tradução de evento do
   EvoGo — payload real gravado em fixture, saída esperada em `EventoCanal`.
   Esse teste é a rede de segurança do item 12.
2. Tipar os payloads de webhook com Zod (`zod` já é dependência): `safeParse` na
   entrada, e o `any` desaparece por consequência em vez de por esforço.
3. Trocar `console.log` por um logger com nível, silenciado por padrão em produção.
4. Regra: código novo em `src/lib/server/` entra com teste.

---

## 15. Higiene do repositório

**O que há hoje na raiz:** 54 arquivos versionados de scratch, patch e debug
(`patch_*.cjs`, `scratch-patch9.sh`, `test_messenger3.mjs`, `check_conv.ts`,
`refactor.cjs`, …), mais `ptv_test.mp4` com 4,5 MB e `old_public_schema.sql` com
132 KB. Não há `README.md` nem `CLAUDE.md`.

**Como corrigir.**

1. Remover os arquivos de scratch do versionamento (eles seguem no histórico, se
   algum dia fizerem falta).
2. Ampliar o `.gitignore` para as famílias que hoje escapam (`scratch*`,
   `patch_*`, `*.mjs` de teste, `*.mp4`).
3. Escrever um `README.md` com: o que é o sistema, como subir local, quais
   variáveis de ambiente existem, como registrar os webhooks de cada provedor.
   Hoje esse conhecimento só existe nos `.md` avulsos da raiz e na cabeça de quem
   escreveu.
4. Mover a documentação avulsa (`documentacao_*.md`, `mapeamento_*.md`,
   `fluxo_atendimento.md`, `guia_*.md`, `ZERNIO-IMPLEMENTACAO.md`) para `docs/`.

---

# Ordem de execução sugerida

**Sprint 1 — fechar as portas (itens 1, 2, 3, 4, 6).**
São as falhas exploráveis por terceiro. Os itens 2, 4 e 6 são de poucas horas; o 1
e o 3 são o grosso. Nada disso muda comportamento visível ao usuário, então entra
sem coordenação com o time de atendimento.

**Sprint 2 — parar de duplicar e de perder mensagem (itens 7, 8, 10, 11).**
Índice único, `maybeSingle`, cron para fora do entry, filtro no realtime. Todos
pequenos, todos com efeito perceptível em produção.

**Sprint 3 — unificar EvoGo/Stevo (item 12), com o item 14.1 antes.**
Escrever o teste de tradução primeiro; a unificação sem rede de segurança é o tipo
de refatoração que devolve bug silencioso na ingestão.

**Contínuo — itens 5, 9, 13, 14, 15.**
O 15 é de meia hora e melhora a leitura do repositório desde o primeiro dia.
