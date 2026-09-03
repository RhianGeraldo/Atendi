# Guia Técnico — Conexão, Geração de QR Code e Gestão de Status do WhatsApp na Plataforma Atendi

Este documento explica detalhadamente o funcionamento da integração para **conexão de instâncias do WhatsApp**, incluindo o processo de criação de instâncias, a geração e exibição do **QR Code**, o método alternativo de **Código de Pareamento (Pairing Code)** e o monitoramento em tempo real do **Status de Conexão**.

---

## 📐 1. Arquitetura da Conexão

A conexão entre o número do WhatsApp do cliente e a plataforma **Atendi** é gerenciada via API do **EvoGo** (ou Stevo/Cloud API) e persistida no banco de dados Supabase na tabela `whatsapp_instances`.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador (Painel Atendi)
    participant Modal as Modal QR Code (Frontend)
    participant DB as Banco de Dados (Supabase)
    participant EvoGo as Engine EvoGo API
    actor Celular as WhatsApp (Celular)

    Note over Admin, EvoGo: 1. CRIAÇÃO DA INSTÂNCIA E REGISTRO DE WEBHOOK
    Admin->>DB: Solicita nova conexão de WhatsApp
    DB->>EvoGo: POST /instance/create (Gera token da instância)
    DB->>EvoGo: POST /instance/connect (Registra URL do Webhook)

    Note over Admin, Celular: 2. GERAÇÃO E POLLING DO QR CODE (A CADA 3 SEG)
    Admin->>Modal: Abre Modal de Conexão
    loop Polling a cada 3 segundos
        Modal->>EvoGo: GET /instance/qr
        alt Retorna String/Base64 de QR Code
            EvoGo-->>Modal: { qrcode: "data:image/png;base64,..." }
            Modal-->>Admin: Exibe QR Code atualizado na tela
        else Retorna Conectado (connected = true)
            EvoGo-->>Modal: { connected: true }
            Modal->>EvoGo: GET /instance/all (Busca telefone/JID conectado)
            Modal->>DB: Update whatsapp_instances (status = 'connected', owner_jid)
            Modal-->>Admin: Exibe "WhatsApp Conectado com Sucesso!"
        end
    end

    Note over Celular, EvoGo: 3. LEITURA PELO CELULAR
    Celular->>Modal: Escaneia o QR Code na tela
    EvoGo-->>Celular: Valida a sessão de pareamento
```

---

## 🛠️ 2. Estrutura de Dados da Instância (`whatsapp_instances`)

Cada número de WhatsApp vinculado a uma Unidade ou Empresa Mãe possui um registro na tabela `whatsapp_instances`:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `UUID` | Chave primária da instância no Atendi |
| `instance_name` | `TEXT` | Nome identificador da instância no servidor de WhatsApp |
| `evogo_api_key` / `token` | `TEXT` | Chave/Token individual de autenticação da instância no EvoGo |
| `status` | `TEXT` | Status atual (`disconnected`, `connecting`, `qrcode`, `connected`) |
| `owner_jid` | `TEXT` | Telefone/JID do número conectado após a leitura do QR Code |
| `provider` | `TEXT` | Provedor da conexão (`evogo`, `stevo`, `whatsapp_cloud`, etc.) |
| `company_id` | `UUID` | ID da empresa proprietária |
| `unit_id` | `UUID` | ID da unidade operacional vinculada (quando aplicável) |

---

## 🔲 3. Fluxo de Geração e Exibição do QR Code (`QrCodeModal.tsx`)

A exibição e atualização do QR Code é realizada pelo componente em React `QrCodeModal` (`src/components/whatsapp/qr-code-modal.tsx`).

### 3.1 Polling Dinâmico a Cada 3 Segundos
Ao abrir o modal, o frontend inicia um loop assíncrono de **polling**:

```typescript
const poll = async () => {
  if (!isPolling) return;
  try {
    // Requisita o QR Code para a engine EvoGo usando o token da instância
    const res: any = await client.getQrCode(instance.evogo_api_key);
    
    // Check 1: Se já estiver conectado no WhatsApp
    if (res.connected || res.data?.connected) {
      await handleConnected();
      return;
    }

    // Check 2: Se recebeu a string/base64 do QR Code
    const qr = res.qrcode || res.data?.qrcode;
    if (qr) {
      setStatus("qr");
      if (qr.startsWith("data:image/")) {
        setQrCodeUrl(qr); // Base64 direto
      } else {
        // Fallback: renderiza via gerador de QR Code
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qr)}`);
      }
    }
  } catch (err) {
    // Trata erros de já conectado ou aguardando QR
  }

  if (isPolling) {
    setTimeout(poll, 3000); // Repete o ciclo a cada 3s
  }
};
```

---

## 🔢 4. Alternativa: Conexão por Código de Pareamento (Pairing Code)

Caso o celular do cliente possua uma câmera com problemas ou esteja remoto, o Atendi oferece a conexão por **Código de Telefone (Pairing Code)**:

### 4.1 Como Funciona:
1. O usuário altera a aba no modal para **"Código de Pareamento"**.
2. Digita o número de telefone do WhatsApp (ex: `5511999998888`).
3. O sistema chama o método `getPairingCode(phone, instanceToken)` no EvoGo:
   * **Endpoint**: `POST /instance/pair`
   * **Payload**: `{ "phone": "5511999998888" }`
4. O EvoGo gera e retorna um código alfanumérico de 8 dígitos (ex: `HD82-K9LP`).
5. O usuário insere esse código no próprio WhatsApp do celular em:  
   *`Configurações > Aparelhos Conectados > Conectar com número de telefone`*.

---

## 🔄 5. Alteração e Detecção Automática do Status (`connected`)

Assim que a leitura do QR Code ou a digitação do Código de Pareamento é concluída no celular:

1. O endpoint de polling detecta `connected: true`.
2. O sistema interrompe o polling (`isPolling = false`).
3. O Atendi dispara uma consulta para capturar o número de telefone/JID proprietário da linha (`getAllInstances()`).
4. Atualiza o banco de dados Supabase:
   ```typescript
   await supabase
     .from("whatsapp_instances")
     .update({
       status: "connected",
       owner_jid: ownerJid // Ex: 5511999998888
     })
     .eq("id", instance.id);
   ```
5. A interface exibe o indicador visual de **"WhatsApp Conectado"** (selo verde) e fecha o modal automaticamente.

---

## 🚪 6. Logout e Desconexão de Instância

Se for necessário trocar de número ou desconectar a instância:

1. **Logout no WhatsApp**: O usuário clica em "Desconectar" na interface.
2. **Requisição ao EvoGo**: Chama o endpoint `DELETE /instance/logout` enviando o token da instância.
3. **Atualização no Banco**: O status da instância na tabela `whatsapp_instances` muda para **`disconnected`**.
4. **Pronto para Nova Conexão**: Ao reabrir o modal, um novo QR Code limpo será gerado para que outro número possa ser pareado.

---

## 📋 7. Resumo das APIs de Instância e QR Code

| Ação | Rota EvoGo | Método | Função no EvoGoClient |
|---|---|---|---|
| **Criar Instância** | `/instance/create` | `POST` | `createInstance(name, token)` |
| **Vincular Webhook** | `/instance/connect` | `POST` | `connectInstance(webhookUrl, token)` |
| **Obter QR Code** | `/instance/qr` | `GET` | `getQrCode(instanceToken)` |
| **Gerar Pairing Code** | `/instance/pair` | `POST` | `getPairingCode(phone, instanceToken)` |
| **Consultar Status** | `/instance/status` | `GET` | `getInstanceStatus(instanceToken)` |
| **Desconectar** | `/instance/logout` | `DELETE` | `logoutInstance(instanceToken)` |
| **Excluir Instância** | `/instance/delete/:id` | `DELETE` | `deleteInstance(instanceId)` |

---

*Guia Técnico de Conexão WhatsApp & QR Code — Plataforma Atendi*
