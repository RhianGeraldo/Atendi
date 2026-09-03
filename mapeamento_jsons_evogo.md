# Mapeamento Completo de JSONs — EvoGo (API & Webhooks)

Este documento centraliza a referência técnica completa de **todos os payloads JSON** (Requisições, Respostas e Eventos de Webhook) mapeados e utilizados na integração do **EvoGo** com a plataforma **Atendi**.

---

## 🔑 1. Autenticação e Headers Globais da API EvoGo

Todas as chamadas para o servidor EvoGo devem conter o header de autenticação:

```http
apikey: {{token_da_instancia_ou_admin}}
Content-Type: application/json
```

---

## 📲 2. Payloads de Gestão de Instância e Conexão

### 2.1 Criar Instância (`POST /instance/create`)

#### Request Body:
```json
{
  "name": "unidade-sp-vendas",
  "token": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1014",
  "instanceId": "inst-12345"
}
```

#### Response Body (Sucesso):
```json
{
  "status": "SUCCESS",
  "message": "Instance created successfully",
  "data": {
    "name": "unidade-sp-vendas",
    "instanceId": "inst-12345",
    "token": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1014",
    "status": "disconnected"
  }
}
```

---

### 2.2 Conectar Instância & Registrar Webhook (`POST /instance/connect`)

#### Request Body:
```json
{
  "subscribe": ["ALL"],
  "webhookUrl": "https://seu-dominio.com.br/api/webhooks/evogo"
}
```

#### Response Body:
```json
{
  "status": "SUCCESS",
  "message": "Instance connecting...",
  "webhook": "https://seu-dominio.com.br/api/webhooks/evogo"
}
```

---

### 2.3 Obter QR Code (`GET /instance/qr`)

#### Response Body (Em Processo de Pareamento):
```json
{
  "connected": false,
  "qrcode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAR...",
  "status": "qrcode"
}
```

#### Response Body (Já Conectado):
```json
{
  "connected": true,
  "message": "Instance already logged in",
  "status": "connected"
}
```

---

### 2.4 Gerar Código de Pareamento por Telefone (`POST /instance/pair`)

#### Request Body:
```json
{
  "phone": "5511999998888"
}
```

#### Response Body:
```json
{
  "status": "SUCCESS",
  "code": "HD82-K9LP",
  "phone": "5511999998888"
}
```

---

### 2.5 Consultar Todas as Instâncias (`GET /instance/all`)

#### Response Body:
```json
{
  "status": "SUCCESS",
  "data": [
    {
      "name": "unidade-sp-vendas",
      "token": "2ef79c34-b6e1-4969-9e37-12b3d3a9d1014",
      "status": "connected",
      "jid": "5511999998888:12@s.whatsapp.net",
      "profileName": "Atendi Vendas",
      "profilePictureUrl": "https://pps.whatsapp.net/v/t61..."
    }
  ]
}
```

---

### 2.6 Status da Conexão (`GET /instance/status`)

#### Response Body:
```json
{
  "connected": true,
  "status": "connected",
  "jid": "5511999998888@s.whatsapp.net"
}
```

---

### 2.7 Desconectar Instância / Logout (`DELETE /instance/logout`)

#### Response Body:
```json
{
  "status": "SUCCESS",
  "message": "Instance logged out successfully"
}
```

---

## 📤 3. Payloads de Envio de Mensagens (APIs de Saída)

### 3.1 Enviar Mensagem de Texto (`POST /send/text`)

#### Request Body:
```json
{
  "number": "5511999998888",
  "text": "Olá! Seja bem-vindo ao atendimento.",
  "delay": 1000,
  "preview": true,
  "linkPreview": true,
  "quoted": {
    "messageId": "3EB00E86C964FE604AF39A",
    "participant": "5511999998888@s.whatsapp.net"
  }
}
```

#### Response Body:
```json
{
  "status": "SUCCESS",
  "messageId": "3EB00A12C881FE709BF12B",
  "timestamp": 1740000000
}
```

---

### 3.2 Enviar Mídia - Imagem, Vídeo, Áudio ou Documento (`POST /send/media`)

#### Request Body (Imagem/Vídeo/Áudio/Documento):
```json
{
  "number": "5511999998888",
  "url": "iVBORw0KGgoAAAANSUhEUgAA...",
  "type": "image",
  "caption": "Segue a foto solicitada",
  "mimetype": "image/jpeg",
  "delay": 1000
}
```

> **Nota**: Para áudio (`type: "audio"`), o EvoGo aceita `mimetype: "audio/ogg"` e `filename: "audio.ogg"`. Para documentos (`type: "document"`), aceita `filename: "contrato.pdf"`.

---

### 3.3 Enviar Reação com Emoji (`POST /message/react`)

#### Request Body:
```json
{
  "number": "5511999998888@s.whatsapp.net",
  "id": "3EB00E86C964FE604AF39A",
  "reaction": "👍",
  "fromMe": false
}
```

---

### 3.4 Editar Mensagem (`POST /message/edit`)

#### Request Body:
```json
{
  "chat": "5511999998888@s.whatsapp.net",
  "messageId": "3EB00A12C881FE709BF12B",
  "message": "Texto corrigido enviado ao cliente"
}
```

---

### 3.5 Apagar Mensagem para Todos (`POST /message/delete`)

#### Request Body:
```json
{
  "chat": "5511999998888@s.whatsapp.net",
  "messageId": "3EB00A12C881FE709BF12B"
}
```

---

### 3.6 Enviar Enquete (`POST /send/poll`)

#### Request Body:
```json
{
  "number": "5511999998888",
  "question": "Como você avalia nosso atendimento?",
  "maxAnswer": 1,
  "options": ["Excelente", "Bom", "Regular", "Ruim"],
  "delay": 1000
}
```

---

### 3.7 Enviar Localização (`POST /send/location`)

#### Request Body:
```json
{
  "number": "5511999998888",
  "name": "Sede Atendi",
  "address": "Av. Paulista, 1000 - São Paulo, SP",
  "latitude": -23.561414,
  "longitude": -46.655881,
  "delay": 1000
}
```

---

### 3.8 Enviar Contato VCard (`POST /send/contact`)

#### Request Body:
```json
{
  "number": "5511999998888",
  "vcard": {
    "fullName": "Suporte Técnico",
    "organization": "Atendi",
    "phone": "5511988887777"
  },
  "delay": 1000
}
```

---

## 📥 4. Payloads de Webhook de Entrada (`/api/webhooks/evogo`)

Estes são os JSONs que o servidor do EvoGo envia para o backend do Atendi em tempo real.

---

### 4.1 Evento `PushName` (Unificação de Anúncios CTWA / LID Resolution)

Disparado quando a Meta envia um identificador temporário `@lid`:

```json
{
  "event": "PushName",
  "instance": "unidade-sp-vendas",
  "data": {
    "JID": "123456789012345@lid",
    "JIDAlt": "5511999998888@s.whatsapp.net",
    "NewPushName": "João Silva"
  }
}
```

---

### 4.2 Evento `Message` — Texto Simples

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00E86C964FE604AF39A",
      "Chat": "5511999998888@s.whatsapp.net",
      "Sender": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva",
      "Timestamp": "2026-08-09T23:00:00Z",
      "Type": "text"
    },
    "Message": {
      "conversation": "Olá, gostaria de saber o valor do plano!"
    }
  }
}
```

---

### 4.3 Evento `Message` — Resposta Citada (Quoted Message)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00E86C964FE604AF39B",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva"
    },
    "Message": {
      "extendedTextMessage": {
        "text": "Sim, concordo com esse valor!",
        "contextInfo": {
          "stanzaId": "3EB00A12C881FE709BF12B",
          "quotedMessage": {
            "conversation": "O plano mensal custa R$ 150,00."
          }
        }
      }
    }
  }
}
```

---

### 4.4 Evento `Message` — Imagem com Base64

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00IMG12345",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva"
    },
    "Message": {
      "imageMessage": {
        "mimetype": "image/jpeg",
        "caption": "Comprovante de pagamento",
        "jpegThumbnail": "/9j/4AAQSkZJRg..."
      },
      "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
    }
  }
}
```

---

### 4.5 Evento `Message` — Áudio / Mensagem de Voz (Base64 OGG)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00AUD67890",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva"
    },
    "Message": {
      "audioMessage": {
        "mimetype": "audio/ogg; codecs=opus",
        "seconds": 12,
        "ptt": true
      },
      "base64": "T2dnUzACAAAAAAAAAAAA..."
    }
  }
}
```

---

### 4.6 Evento `Message` — Vídeo Instantâneo PTV (Recado de Vídeo Circular)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00PTV11223",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva"
    },
    "Message": {
      "ptvMessage": {
        "mimetype": "video/mp4",
        "seconds": 8,
        "jpegThumbnail": "/9j/4AAQSkZJRg..."
      },
      "base64": "AAAAIGZ0eXBpc29t..."
    }
  }
}
```

---

### 4.7 Evento `Message` — Documento (PDF / Arquivo)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00DOC44556",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false,
      "PushName": "João Silva"
    },
    "Message": {
      "documentMessage": {
        "fileName": "Contrato_Assinado.pdf",
        "mimetype": "application/pdf",
        "fileLength": "524288"
      },
      "base64": "JVBERi0xLjUNJ..."
    }
  }
}
```

---

### 4.8 Evento `Message` — Contato / VCard Recebido

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00CNT77889",
      "Chat": "5511999998888@s.whatsapp.net",
      "IsFromMe": false
    },
    "Message": {
      "contactMessage": {
        "displayName": "Maria Advogada",
        "vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:Maria Advogada\nTEL;waid=5511977776666:+55 11 97777-6666\nEND:VCARD"
      }
    }
  }
}
```

---

### 4.9 Evento `Message` — Reação com Emoji

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00RCT99000",
      "Chat": "5511999998888@s.whatsapp.net",
      "Type": "reaction"
    },
    "Message": {
      "reactionMessage": {
        "key": {
          "ID": "3EB00A12C881FE709BF12B"
        },
        "text": "❤️"
      }
    }
  }
}
```

---

### 4.10 Evento `protocolMessage` — Edição de Mensagem (`type: 14`)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00EDT123",
      "Chat": "5511999998888@s.whatsapp.net"
    },
    "Message": {
      "protocolMessage": {
        "type": 14,
        "key": {
          "id": "3EB00A12C881FE709BF12B"
        },
        "editedMessage": {
          "conversation": "Texto alterado pelo remetente"
        }
      }
    }
  }
}
```

---

### 4.11 Evento `protocolMessage` — Apagar para Todos (`type: 0` / `REVOKE`)

```json
{
  "event": "Message",
  "instance": "unidade-sp-vendas",
  "data": {
    "Info": {
      "ID": "3EB00DEL456",
      "Chat": "5511999998888@s.whatsapp.net"
    },
    "Message": {
      "protocolMessage": {
        "type": 0,
        "key": {
          "id": "3EB00A12C881FE709BF12B"
        }
      }
    }
  }
}
```

---

### 4.12 Formato Legado Baileys (`messages.upsert`)

Caso o servidor EvoGo esteja operando no modo Baileys legacy:

```json
{
  "event": "messages.upsert",
  "instance": "unidade-sp-vendas",
  "data": {
    "message": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false,
        "id": "BAE50A998877"
      },
      "pushName": "João Silva",
      "message": {
        "conversation": "Mensagem via formato Baileys"
      }
    }
  }
}
```

---

*Mapeamento de Payloads JSON EvoGo — Plataforma Atendi*
