# 🎟️ Manual de Integração — API de Tickets & SAC (Atendi)

Este documento descreve como integrar a abertura, acompanhamento e resolução de chamados da plataforma **Atendi** em sites externos, formulários de contato, portais do cliente, ERPs, e-commerces e ferramentas de automação (como n8n, Make ou Zapier).

---

## 📌 Sumário
1. [Visão Geral e URLs Base](#1-visão-geral-e-urls-base)
2. [CORS e Segurança](#2-cors-e-segurança)
3. [Módulo 1: SAC Público (Sites, Landing Pages e Widgets)](#3-módulo-1-sac-público-sites-landing-pages-e-widgets)
   - [3.1 Abrir Ticket de SAC](#31-abrir-ticket-de-sac)
   - [3.2 Rastrear Status do Ticket](#32-rastrear-status-do-ticket)
   - [3.3 Cliente Responder ao Ticket](#33-cliente-responder-ao-ticket)
4. [Módulo 2: API B2B Autenticada (ERPs, Backends e Sistemas Internos)](#4-módulo-2-api-b2b-autenticada-erps-backends-e-sistemas-internos)
   - [4.1 Autenticação](#41-autenticação)
   - [4.2 Listar Tickets](#42-listar-tickets)
   - [4.3 Obter Detalhes do Ticket](#43-obter-detalhes-do-ticket)
   - [4.4 Criar Ticket Programaticamente](#44-criar-ticket-programaticamente)
   - [4.5 Adicionar Mensagem ou Nota Interna](#45-adicionar-mensagem-ou-nota-interna)
   - [4.6 Atualizar Status ou Prioridade](#46-atualizar-status-ou-prioridade)
5. [Tabelas de Referência (Enums)](#5-tabelas-de-referência-enums)
6. [Exemplo Pronto de Formulário HTML + JS](#6-exemplo-pronto-de-formulário-html--js)

---

## 1. Visão Geral e URLs Base

- **Ambiente Local:** `http://localhost:3000`
- **Ambiente Produção:** `https://app.atendiai.com` *(ou o domínio da sua instância)*

Todas as requisições utilizam o formato **JSON** no corpo e cabeçalho `Content-Type: application/json`.

---

## 2. CORS e Segurança

- Os endpoints públicos de SAC (`/api/sac/...`) possuem cabeçalhos **CORS abertos** (`Access-Control-Allow-Origin: *`). Isso permite que scripts JavaScript executados no navegador em qualquer domínio consigam chamar a API sem bloqueios.
- Os endpoints de SAC nunca expõem notas internas ou dados de outros clientes.

---

## 3. Módulo 1: SAC Público (Sites, Landing Pages e Widgets)

Utilize estes endpoints diretamente no front-end do seu site, formulário de contato ou widget de suporte. **Não é necessário expor chaves de API secretas**.

### 3.1 Abrir Ticket de SAC

Cria o contato no Atendi (se ainda não existir), vincula à unidade da empresa e abre o chamado.

- **Método:** `POST`
- **Rota:** `/api/sac/tickets` (ou `/api/tickets/public`)

#### Parâmetros do Corpo (JSON):
| Campo | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `company_slug` | String | **Sim*** | Slug da empresa no Atendi (ex: `"minha-empresa"`). |
| `company_id` | UUID | **Sim*** | ID da empresa (se não passar o slug). |
| `name` | String | **Sim** | Nome completo do cliente/solicitante. |
| `phone` | String | Opcional** | WhatsApp ou telefone do cliente (ex: `"11999998888"`). |
| `email` | String | Opcional** | E-mail de contato do cliente. |
| `title` | String | **Sim** | Assunto ou título resumido do chamado. |
| `description` | String | **Sim** | Relato detalhado do problema ou solicitação. |
| `unit_slug` | String | Não | Slug da unidade/filial (se omitido, usa a padrão da empresa). |
| `department_name`| String | Não | Nome do setor desejado (ex: `"Suporte"`, `"Financeiro"`). |
| `priority` | String | Não | `"low"`, `"medium"`, `"high"` ou `"urgent"` (padrão: `"medium"`). |
| `tags` | Array | Não | Lista de tags (ex: `["site", "devolucao"]`). |

*\*Informe `company_slug` OU `company_id`.*  
*\*\*Informe ao menos `phone` OU `email`.*

#### Exemplo de Requisição (cURL):
```bash
curl -X POST https://app.atendiai.com/api/sac/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "company_slug": "sua-empresa",
    "name": "Mariana Souza",
    "phone": "11987654321",
    "email": "mariana@email.com",
    "title": "Atraso na entrega do pedido #1042",
    "description": "Comprei o produto há 5 dias e o código de rastreio não atualiza.",
    "priority": "high",
    "tags": ["loja-virtual", "entrega"]
  }'
```

#### Resposta de Sucesso (`201 Created`):
```json
{
  "success": true,
  "message": "Ticket de SAC registrado com sucesso!",
  "ticket": {
    "id": "2ec9f592-fade-4332-b5ff-38ad71c5c7c4",
    "ticket_number": 1045,
    "status": "new",
    "created_at": "2026-11-13T20:15:29.357Z"
  }
}
```

---

### 3.2 Rastrear Status do Ticket

Permite que o cliente final consulte o andamento de um chamado aberto digitando o protocolo e seu telefone ou e-mail.

- **Método:** `GET`
- **Rota:** `/api/sac/tickets/track`

#### Parâmetros de Query (URL):
| Parâmetro | Obrigatório? | Descrição |
| :--- | :--- | :--- |
| `ticket_number` | **Sim** | Número do protocolo recebido (ex: `1045`). |
| `phone` | Não* | Telefone informado na abertura (para validação de segurança). |
| `email` | Não* | E-mail informado na abertura (para validação de segurança). |

#### Exemplo de Requisição:
```bash
curl -X GET "https://app.atendiai.com/api/sac/tickets/track?ticket_number=1045&phone=11987654321"
```

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "ticket": {
    "number": 1045,
    "title": "Atraso na entrega do pedido #1042",
    "status": "in_progress",
    "priority": "high",
    "unit": "Matriz São Paulo",
    "department": "Expedição",
    "created_at": "2026-11-13T20:15:29.357Z",
    "resolved_at": null,
    "messages": [
      {
        "id": "msg-1",
        "content": "Comprei o produto há 5 dias e o código de rastreio não atualiza.",
        "created_at": "2026-11-13T20:15:29.400Z",
        "sender": "Mariana Souza"
      },
      {
        "id": "msg-2",
        "content": "Olá Mariana! Já acionamos a transportadora e estamos verificando o pacote.",
        "created_at": "2026-11-13T20:25:10.000Z",
        "sender": "Suporte Atendi"
      }
    ]
  }
}
```

---

### 3.3 Cliente Responder ao Ticket

Permite que o cliente acrescente informações ou responda ao atendente diretamente pela página de acompanhamento do chamado.

- **Método:** `POST`
- **Rota:** `/api/sac/tickets/reply`

#### Parâmetros do Corpo (JSON):
| Campo | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `ticket_number` | Número/String | **Sim** | Protocolo do ticket (ex: `1045`). |
| `phone` | String | Opcional* | Telefone para validação de identidade. |
| `email` | String | Opcional* | E-mail para validação de identidade. |
| `content` | String | **Sim** | Mensagem de resposta do cliente. |

#### Exemplo de Requisição:
```bash
curl -X POST https://app.atendiai.com/api/sac/tickets/reply \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_number": 1045,
    "phone": "11987654321",
    "content": "Obrigada! Fico no aguardo do retorno."
  }'
```

#### Resposta de Sucesso (`201 Created`):
```json
{
  "success": true,
  "message": "Resposta enviada com sucesso!",
  "message_data": {
    "id": "fa4df968-a0ca-4892-9572-ffd9f9367998",
    "content": "Obrigada! Fico no aguardo do retorno.",
    "created_at": "2026-11-13T20:30:00.000Z"
  }
}
```

---

## 4. Módulo 2: API B2B Autenticada (ERPs, Backends e Sistemas Internos)

Utilize estes endpoints em sistemas de back-end protegidos (APIs de servidor, integrações de webhook ou ERPs).

### 4.1 Autenticação

Envie sua chave de API através de um dos seguintes cabeçalhos HTTP:
- `x-api-key: SUA_CHAVE_DE_API`
- `Authorization: Bearer SUA_CHAVE_DE_API`

---

### 4.2 Listar Tickets

- **Método:** `GET`
- **Rota:** `/api/tickets`
- **Filtros por Query String:**
  - `status`: `"new"`, `"in_progress"`, `"pending"`, `"resolved"`, `"closed"`
  - `scope`: `"internal"` ou `"external"`
  - `unit_id`: UUID da unidade
  - `limit`: Quantidade máxima (padrão: 50, máx: 100)
  - `offset`: Paginação (padrão: 0)

#### Exemplo:
```bash
curl -X GET "https://app.atendiai.com/api/tickets?status=new&scope=external&limit=20" \
  -H "x-api-key: SUA_CHAVE_API"
```

---

### 4.3 Obter Detalhes do Ticket

- **Método:** `GET`
- **Rota:** `/api/tickets/:id` (onde `:id` é o UUID do ticket)

Retorna todos os dados do chamado, incluindo solicitante, unidade, departamento, atendente e **todas as mensagens (públicas e notas internas)**.

---

### 4.4 Criar Ticket Programaticamente

- **Método:** `POST`
- **Rota:** `/api/tickets`

#### Exemplo de Payload:
```json
{
  "unit_id": "0d2091fb-7cf6-444a-89a3-5c8e3e4a5d8b",
  "department_id": "b3e34b8c-5503-4f9e-a0e2-6d27457d3839",
  "scope": "external",
  "title": "Falha de faturamento no ERP",
  "description": "Nota fiscal rejeitada pelo SEFAZ com código 539.",
  "priority": "urgent",
  "requester_contact_id": "99ea7b9b-8e9a-4c54-946f-236b533e42ea",
  "tags": ["faturamento", "urgente"]
}
```

---

### 4.5 Adicionar Mensagem ou Nota Interna

- **Método:** `POST`
- **Rota:** `/api/tickets/:id/messages`

#### Exemplo de Payload:
```json
{
  "content": "Verificado no log do servidor: o certificado digital expirou.",
  "is_internal_note": true
}
```
> 💡 Quando `is_internal_note: true`, a mensagem só fica visível para os atendentes internos no Atendi e nunca é exposta no rastreamento do cliente.

---

### 4.6 Atualizar Status ou Prioridade

- **Método:** `PATCH`
- **Rota:** `/api/tickets/:id`

#### Exemplo de Payload:
```json
{
  "status": "resolved",
  "priority": "medium",
  "assigned_to_user_id": "user-uuid-do-atendente"
}
```

---

## 5. Tabelas de Referência (Enums)

### Status do Chamado (`status`):
| Status | Significado |
| :--- | :--- |
| `new` | Novo chamado criado, aguardando triagem ou 1ª resposta. |
| `in_progress` | Chamado assumido por um atendente / em investigação. |
| `pending` | Aguardando retorno de terceiros ou dados do cliente. |
| `resolved` | Problema solucionado (grava `resolved_at`). |
| `closed` | Chamado finalizado e arquivado definitivamente. |
| `cancelled` | Chamado descartado ou cancelado. |

### Prioridade (`priority`):
- `low`: Baixa (dúvidas simples, sugestões)
- `medium`: Média (comportamento padrão)
- `high`: Alta (impacto direto nas operações)
- `urgent`: Urgente / Crítico (interrupção total de serviço)

### Escopo (`scope`):
- `external`: Suporte a clientes / fornecedores externos.
- `internal`: Demandas internas entre colaboradores e setores (TI, RH, Facilities).

---

## 6. Exemplo Pronto de Formulário HTML + JS

Você pode copiar e colar este exemplo diretamente na página de "Fale Conosco" ou "SAC" do seu site:

```html
<form id="form-sac" style="max-width: 480px; display: flex; flex-direction: column; gap: 12px; font-family: sans-serif;">
  <h3>Fale com nosso Suporte (SAC)</h3>
  
  <input type="text" id="sac-nome" placeholder="Seu Nome Completo" required style="padding: 8px;" />
  <input type="tel" id="sac-whatsapp" placeholder="Seu WhatsApp (com DDD)" required style="padding: 8px;" />
  <input type="email" id="sac-email" placeholder="Seu E-mail" required style="padding: 8px;" />
  <input type="text" id="sac-assunto" placeholder="Assunto do Chamado" required style="padding: 8px;" />
  <textarea id="sac-mensagem" placeholder="Descreva sua solicitação com detalhes..." rows="4" required style="padding: 8px;"></textarea>

  <button type="submit" id="btn-enviar" style="padding: 10px; background: #0084ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
    Abrir Chamado
  </button>
  <div id="resultado" style="margin-top: 10px; font-size: 14px;"></div>
</form>

<script>
  document.getElementById("form-sac").addEventListener("submit", async function(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-enviar");
    const res = document.getElementById("resultado");
    
    btn.disabled = true;
    btn.innerText = "Enviando chamado...";
    res.innerText = "";

    try {
      const response = await fetch("https://app.atendiai.com/api/sac/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_slug: "sua-empresa", // Altere para o slug da sua empresa
          name: document.getElementById("sac-nome").value,
          phone: document.getElementById("sac-whatsapp").value,
          email: document.getElementById("sac-email").value,
          title: document.getElementById("sac-assunto").value,
          description: document.getElementById("sac-mensagem").value,
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        res.style.color = "green";
        res.innerHTML = `<strong>Chamado aberto com sucesso!</strong><br>Seu número de protocolo é: <strong>#${data.ticket.ticket_number}</strong>`;
        document.getElementById("form-sac").reset();
      } else {
        throw new Error(data.error || "Erro ao registrar chamado.");
      }
    } catch (err) {
      res.style.color = "red";
      res.innerText = err.message;
    } finally {
      btn.disabled = false;
      btn.innerText = "Abrir Chamado";
    }
  });
</script>
```
