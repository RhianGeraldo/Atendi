# Provedor e canais — como A Jornada resolve, e como fica no Atendi multi-tenant

Leitura do modelo real de `/home/rhiangeraldo/Desenvolvimentos/A Jornada`
(`api/_lib/canais/*`, `supabase/migrations/*`) contra o do Atendi, com a diferença
que muda tudo: **A Jornada é mono-tenant; o Atendi é multi-tenant por empresa e por
unidade.**

Isso não é detalhe de implementação. O desenho de lá é bom e vale copiar quase
inteiro — mas há **três pontos onde a resposta certa para um negócio só é a resposta
errada para vinte clientes na mesma base**, e são justamente os pontos onde moram as
credenciais. Este documento marca quais são.

---

## 1. O modelo de A Jornada, em três níveis

### 1.1. A frase que sustenta o desenho

De `api/_lib/canais/tipos.ts:5`:

> **A conversa carrega o canal, o canal carrega o provedor.** Quem envia nunca
> escolhe por onde — pergunta ao motor, e o motor resolve pela conversa.

E o corolário, de `tipos.ts:16`:

> O tipo é do **provedor**, não do canal: quem sabe falar com o mundo lá fora é a
> integração. Um canal é uma instância dentro de um provedor.

É exatamente o inverso do que o Atendi faz hoje, onde `provider` é coluna do canal
(`whatsapp_instances.provider`) e o envio ainda deduz o provedor a partir do
`channel` da conversa (`message-sender.ts:48`).

### 1.2. `admin.providers` — a conta ou o servidor

```sql
create table admin.providers (
  id, kind, name, base_url,
  secret_sealed,           -- credencial de administração (Bearer, System User token)
  webhook_secret_sealed,   -- hub.verify_token / o ?k= da URL
  assinatura_selada,       -- com o que ELE assina o corpo (app secret, HMAC)
  config jsonb,            -- app_id, api_version, business_account_id…
  status, status_detail, last_seen_at, active
);
-- kind: 'evogo' | 'meta_whatsapp' | 'meta_instagram' | 'zernio'
```

**Três segredos, três funções distintas** — e é a distinção que o Atendi não tem:

| Segredo | Para quê |
|---|---|
| `secret_sealed` | falar com o provedor (envia, cria instância, consulta) |
| `webhook_secret_sealed` | autenticar quem **nos** chama (o `?k=`, o `hub.verify_token`) |
| `assinatura_selada` | conferir que o **corpo** veio mesmo de lá (HMAC) |

Todos selados com AES-256-GCM (`api/_lib/crypto.ts:35`), abertos só dentro do
servidor (`motor.ts:202` `selarSegredo`, e `abrir()` no `montarCanal`). Nada disso
atravessa a fronteira do HTTP.

### 1.3. `admin.channels` — o número

Canal é o **número/perfil**: `network` (`whatsapp`|`instagram`), `name`,
`department_id`, perfil, assinatura, espaçamento. E, desde a fusão,
`papel_preferido` + `auto_switch`.

A rede é **coluna do canal e validada contra o tipo do provedor** — em
`admin_channel_upsert` (`20260828100000_a_perna_nasce.sql`):

```sql
v_network := coalesce(nullif(trim(p_network),''),
             case when v_kind = 'meta_instagram' then 'instagram' else 'whatsapp' end);
if v_kind = 'evogo'         and v_network <> 'whatsapp'  then raise 'O EvoGo só atende WhatsApp.';
if v_kind = 'meta_whatsapp' and v_network <> 'whatsapp'  then raise 'A Cloud API só atende WhatsApp.';
if v_kind = 'meta_instagram'and v_network <> 'instagram' then raise 'Este provedor só atende Instagram.';
```

O Zernio é o único tipo que **não** aparece nessas guardas: é o provedor de duas
redes, e ali a rede é escolha livre. É a §1.1 do guia virando três linhas de SQL.

### 1.4. `admin.channel_legs` — a perna

O terceiro nível, e o mais interessante:

> Um canal é o número; cada API por onde se alcança esse número é uma perna.

```sql
create table admin.channel_legs (
  channel_id, provider_id,
  external_id, secret_sealed, webhook_secret_sealed, webhook_base,
  status, status_detail, last_seen_at,
  papel text check (papel in ('oficial','nao_oficial')),
  constraint channel_legs_papel_unico unique (channel_id, papel)
);
create unique index channel_legs_instancia
    on admin.channel_legs (provider_id, external_id) where external_id is not null;
```

Resolve "o mesmo número alcançado por duas APIs" (EvoGo + Cloud API) sem tabela de
fusão nem reconciliação: é um canal com duas pernas. E o que a rota lê é o **papel**,
nunca o nome do provedor —

> `oficial` tem janela de 24 h e modelos; `nao_oficial` tem grupos. Trocar a Zernio
> por outro BSP amanhã não pode mexer em regra de rota — e mexeria, se a regra
> perguntasse o nome do provedor.

O `unique (provider_id, external_id)` é o índice pelo qual o **webhook** encontra o
canal: provedor da URL + `accountId` do corpo.

### 1.5. O contrato e o motor

- `tipos.ts` — `Adaptador` com `capacidades` declaradas (`midia`, `audio`, `reacao`,
  `edicao`, `exclusao`, `citacao`, `qr`, `template`, `janela24h`). A interface
  **pergunta antes de oferecer**, em vez de um botão de reação que não reage.
- `motor.ts:37` — registro `ADAPTADORES = { evogo, meta_whatsapp: meta, zernio }`,
  e `adaptadorDe(tipo)`. Tipo sem adaptador dá erro claro, não some da tela.
- `motor.ts:96` `abrirCanal(id, papel?)` e `motor.ts:136`
  `abrirCanalPorInstancia(provedorId, instancia)` — a segunda existe porque na Meta
  e no Zernio o webhook é da **conta**, não do número: o canal só pode ser resolvido
  *depois* de traduzir o evento. Devolve `null` para instância desconhecida, que é
  o caso normal de quem tem outras contas ligadas.
- `rota.ts` — função **pura**, cinco degraus, testável sem banco: grupo → escolha
  explícita → grudada na conversa → preferida do canal → queda automática. Com a
  distinção `tem_janela` × `janela_ate` que o guia insiste (§4.4).

---

## 2. A diferença que mais importa

**A Jornada não tem inquilino.** A varredura por `tenant`, `unit_id`, `company_id`
nas migrations não devolve nada: é um negócio só, com N provedores e N canais, e
`department_id` no canal para dizer quem atende.

O Atendi tem três níveis de escopo — `companies` → `units` → `departments` — e o
canal (`whatsapp_instances`) carrega `company_id` **e** `unit_id`. A convenção da
base, visível em `settings.tsx:344`, é:

```ts
if (selectedUnitId) q = q.eq("unit_id", selectedUnitId);
else                q = q.is("unit_id", null);     // null = sede/matriz
```

Trazer `providers` de lá sem re-inquilinar é o erro que produz vazamento entre
clientes. Os três pontos:

### 2.1. O provedor é da empresa, o canal é da unidade

A credencial Zernio é contratada pela **empresa** (o add-on Inbox é do plano da conta
Zernio). O número/perfil atende uma **unidade**. Então:

```
providers    → company_id NOT NULL, unit_id NULL
                 unit_id nulo  = a conta serve a empresa inteira
                 unit_id cheio = conta exclusiva daquela unidade
whatsapp_instances (o canal) → company_id + unit_id, como já é hoje
```

O `unit_id` anulável no provedor não é enfeite: uma rede de franquias em que cada
filial contrata a própria conta Zernio é o caso real, e sem a coluna a única saída
seria uma empresa por filial — o que quebra o CRM, os relatórios e a matriz.

E a regra de uso, que precisa ser explícita: **um canal só pode apontar para um
provedor da sua empresa, e da sua unidade ou da empresa toda.** É um `check` por
trigger ou uma guarda na RPC de cadastro; sem ela, um `provider_id` digitado à mão
liga o canal de um cliente à credencial de outro.

### 2.2. Os segredos não podem estar onde o cliente lê

Aqui eu corrijo a recomendação que dei no `ZERNIO-PLANO-ATENDI.md` §3. Lá eu sugeri
colunas `zernio_*` em `companies`, por ser uma migration contra cinco. Vendo o modelo
de A Jornada e pensando no multi-tenant, **a tabela separada é a decisão certa**, e a
razão não é elegância:

`settings.tsx` lê `companies` direto do cliente, com a chave anônima. Toda coluna que
entrar ali é legível por **qualquer usuário autenticado da empresa** que a RLS de
`companies` deixe passar — inclusive o `agent`. É o que já acontece hoje com
`evogo_global_token` e `meta_system_user_token` (item 5 do `PLANO-MELHORIAS.md`).
Somar a chave Zernio a esse conjunto é multiplicar um problema que já existe.

Uma tabela `providers` **sem policy de `SELECT` para `authenticated`** resolve por
construção: o service role lê, a tela recebe uma projeção mascarada por RPC
(`nome`, `tipo`, `status`, `••••1234`), e a credencial nunca sai do servidor. É o
que A Jornada faz com `admin_provider_raw` (`motor.ts:183`), que só o service role
pode executar.

E vale portar a selagem junto: `api/_lib/crypto.ts` de lá é AES-256-GCM em ~60
linhas, com `seal`/`open` sobre uma chave de ambiente. Num multi-tenant, um dump de
backup em texto puro é o WhatsApp de **todos** os clientes, não de um.

### 2.3. O `?k=` identifica o provedor, e o provedor identifica o inquilino

A rota de lá é `/api/webhooks/zernio/{provedorId}?k={webhookSegredo}`, e a conferência
(`api/webhooks/[...route].ts:864`) é: abrir o provedor pelo id da URL, comparar o
`?k=` com o `webhookSegredo` **dele**, em tempo constante.

No Atendi isso funciona igual e melhor do que a alternativa: **o inquilino sai da
linha do provedor, não da URL.** Duas consequências que valem escrever:

- **Não usar `companyId` na URL.** O id da empresa circula no front, aparece em log
  e em print; o id de uma linha de `providers` com um segredo de 32 bytes ao lado,
  não. Se o `?k=` é a tranca, o que está antes dele não deve ser adivinhável nem
  reutilizável.
- **Um POST pode trazer eventos de várias contas da mesma conta Zernio**, e no
  Atendi elas podem ser de **unidades diferentes**. A regra 4 da §7.2 do guia
  ("agrupar por instância antes de escrever") deixa de ser higiene e vira separação
  de escopo: cada evento resolve `(provider_id, zernio_account_id)` → canal → unidade,
  e é o canal que diz em que unidade a conversa nasce. Errar aqui põe a conversa de
  uma filial na caixa de entrada de outra.

---

## 3. O que trazer, o que adaptar, o que deixar

| Peça de A Jornada | Decisão | Por quê |
|---|---|---|
| `tipos.ts` — contrato + `capacidades` | **Trazer quase literal** | É a peça que faz o Atendi parar de ter `if (provider === 'x')` espalhado por seis arquivos |
| `motor.ts` — registro e `adaptadorDe` | **Trazer**, com `abrirCanal` lendo `whatsapp_instances` | Substitui a dedução `channel → provider` dos dois caminhos de envio |
| `providers` como tabela | **Trazer, re-inquilinado** (§2.1) | Três segredos com três funções; hoje o Atendi tem um campo por credencial, sem distinção |
| Selagem AES-256-GCM | **Trazer** (`api/_lib/crypto.ts`) | Multi-tenant torna o texto puro caro demais |
| `abrirCanalPorInstancia` | **Trazer** | É o caminho do webhook do Zernio e da Meta; resolve o canal depois de traduzir |
| `rota.ts` — escolha de perna | **Não trazer agora** | Responde "um número, duas APIs", que o Atendi não tem. Trazer a função sem o problema é complexidade sem uso |
| `channel_legs` — a perna | **Não trazer agora** | Idem. Mas deixar o caminho: se `providers` nascer certo, a perna depois é uma tabela e um gatilho, como foi lá |
| `tem_janela` × `janela_ate` | **Trazer** | O Atendi não tem janela nenhuma hoje, nem para o provedor `oficial`. Ganho colateral |
| `papel` (`oficial`/`nao_oficial`) | **Trazer só como coluna do provedor** | Barato, e é o que a rota vai ler no dia em que a perna existir. `zernio` e `oficial` são oficiais; `evogo` e `stevo`, não |

Sobre a perna, uma observação que vale guardar: a migration
`20260828100000_a_perna_nasce.sql` é um exemplo de como fazer essa mudança **sem
parar a caixa de entrada** — as escritas passam para a tabela nova, um gatilho
espelha de volta para a antiga, nenhuma leitura muda no dia, e as colunas caem numa
faxina posterior. Se o Atendi um dia unificar EvoGo/Stevo/Zernio sob um canal só,
esse é o roteiro.

---

## 4. A migration, re-inquilinada

```sql
-- ---------------------------------------------------------------- provedores
create table public.message_providers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- Nulo = serve a empresa inteira. Cheio = exclusivo daquela unidade.
  unit_id       uuid references public.units(id) on delete cascade,
  kind          text not null check (kind in ('evogo','stevo','oficial','instagram','messenger','zernio')),
  name          text not null,
  base_url      text,
  -- Os três segredos, selados. Nunca legíveis pelo cliente.
  secret_sealed         text,   -- falar com o provedor
  webhook_secret_sealed text,   -- o ?k= / hub.verify_token
  signature_secret_sealed text, -- o HMAC do corpo
  config        jsonb not null default '{}'::jsonb,
  status        text not null default 'desconectado',
  status_detail text,
  last_seen_at  timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.message_providers enable row level security;

-- A tranca que importa: NENHUMA policy de SELECT para `authenticated`.
-- A tela lê por RPC, que devolve o provedor mascarado.
grant all on public.message_providers to service_role;

-- ------------------------------------------------------------------- o canal
alter table public.whatsapp_instances
  add column if not exists provider_id  uuid references public.message_providers(id),
  add column if not exists network      text check (network in ('whatsapp','instagram')),
  add column if not exists zernio_account_id text,
  add column if not exists webhook_base text;

alter table public.whatsapp_instances drop constraint if exists valid_provider;
alter table public.whatsapp_instances add constraint valid_provider
  check (provider in ('evogo','oficial','stevo','instagram','messenger','facebook','zernio'));

alter table public.whatsapp_instances add constraint zernio_requires_network
  check (provider <> 'zernio' or network is not null);

-- O webhook acha o canal por provedor + conta, como o channel_legs_instancia de lá.
create unique index if not exists instances_provider_account
  on public.whatsapp_instances (provider_id, zernio_account_id)
  where zernio_account_id is not null;

-- ---------------------------------------- a guarda de escopo (§2.1)
create or replace function public.instance_provider_scope_ok()
returns trigger language plpgsql as $$
declare p record;
begin
  if new.provider_id is null then return new; end if;
  select company_id, unit_id into p from public.message_providers where id = new.provider_id;
  if p.company_id <> new.company_id then
    raise exception 'O provedor pertence a outra empresa.';
  end if;
  if p.unit_id is not null and p.unit_id is distinct from new.unit_id then
    raise exception 'O provedor é exclusivo de outra unidade.';
  end if;
  return new;
end $$;

create trigger instances_provider_scope
  before insert or update of provider_id, company_id, unit_id
  on public.whatsapp_instances
  for each row execute function public.instance_provider_scope_ok();

-- --------------------------------------------------------- conversa e janela
alter table public.conversations
  add column if not exists provider_thread_id text,
  add column if not exists window_expires_at  timestamptz,
  add column if not exists has_window         boolean not null default false;

create unique index if not exists conversations_provider_thread_uk
  on public.conversations (whatsapp_instance_id, provider_thread_id)
  where provider_thread_id is not null;
```

Rota do webhook: `/api/webhooks/zernio/{message_provider_id}?k={webhook_secret}`.

---

## 5. O que isso muda no plano anterior

O `ZERNIO-PLANO-ATENDI.md` continua valendo em fases, escopo e estimativa. Duas
correções:

1. **Decisão 1 passa a ser a tabela `message_providers`**, não colunas em
   `companies` — pela razão de RLS da §2.2, que eu não tinha pesado quando
   recomendei o caminho curto.
2. **Fase 1 cresce meio dia**: entram a selagem AES-256-GCM e a RPC de leitura
   mascarada. Em compensação, o item 5 do `PLANO-MELHORIAS.md` (credenciais em texto
   plano) passa a ter uma casa pronta para onde migrar EvoGo, Stevo e Meta depois.

Estimativa revista: **14–20 dias úteis** para a v1 de mensagens.
