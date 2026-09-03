# Mapeamento Técnico de Webhooks e Mídias no EvoGo — Plataforma Atendi

Este documento descreve detalhadamente como a plataforma **Atendi** recebe, descriptografa, processa e renderiza no chat cada evento e tipo de mídia enviado pelos webhooks do **EvoGo** (`src/lib/server/evogo-webhook.ts`).

---

## 🏗️ 1. Arquitetura Geral de Tratamento do Webhook

Quando um evento chega em `POST /api/webhooks/evogo`:
1. O servidor lê o payload em formato WhatsMeow/EvoGo Nascendo (`Message`, `SendMessage`, `PushName`) ou Baileys (`messages.upsert`).
2. Trata eventos de sistema sem travar o Node.js (omite strings grandes de base64 dos logs do servidor para otimizar performance).
3. Processa a unificação de identificadores temporários (`@lid` -> `@s.whatsapp.net`).
4. Extrai a mídia (via base64 nativo ou via **Fallback de Descriptografia Nativa AES-CBC**).
5. Salva no banco de dados e notifica a interface em tempo real via **Supabase Realtime**.

---

## 🎥 2. Mapeamento de Tipos de Mídias e Eventos Especiais

---

### 🟢 2.1 Recado de Vídeo / Vídeo em Bolinha (`ptvMessage`)

O recado de vídeo em formato circular é uma das mídias mais populares do WhatsApp.

#### Detecção no Webhook:
* Identificado por `msg.ptvMessage` (WhatsMeow) ou `msgType.ptvMessage` (Baileys).

#### Processamento no Codebase:
```typescript
else if (msg.ptvMessage) {
  mediaType = 'video';
  textContent = '🎥 Vídeo Instantâneo';
  metadata.is_ptv = true; // Flag identificadora no banco de dados

  if (msg.base64) {
    mediaUrl = `data:${msg.ptvMessage.mimetype || 'video/mp4'};base64,${msg.base64}`;
  } else if (msg.ptvMessage.jpegThumbnail) {
    mediaUrl = `data:image/jpeg;base64,${msg.ptvMessage.jpegThumbnail}`;
  }
}
```

#### Visualização e Comportamento no Chat:
* A flag `metadata.is_ptv = true` faz o componente de mídia do chat renderizar um **Player Circular de Vídeo** com bordas arredondadas (estilo "bolinha"), idêntico ao aplicativo oficial do WhatsApp, ativando a reprodução ao clicar.

---

### 🖼️ 2.2 Figurinhas e Figurinhas Animadas (`stickerMessage`)

Suporte a stickers estáticos e stickers animados em formato WebP.

#### Detecção no Webhook:
* Identificado por `msg.stickerMessage`.

#### Processamento no Codebase:
```typescript
else if (msg.stickerMessage) {
  mediaType = 'image';
  textContent = '🖼️ Figurinha';

  if (msg.base64) {
    // Preserva animação se o mimetype for image/webp
    mediaUrl = `data:${msg.stickerMessage.mimetype || 'image/webp'};base64,${msg.base64}`;
  } else if (msg.stickerMessage.jpegThumbnail) {
    mediaUrl = `data:image/jpeg;base64,${msg.stickerMessage.jpegThumbnail}`;
  }
}
```

#### Visualização no Chat:
* Exibição transparente sem bordas de cartão ou fundos cinzas, permitindo a reprodução de figurinhas estáticas ou animadas WebP diretamente no balão da conversa.

---

### 📷 2.3 Imagens (`imageMessage`)

#### Detecção no Webhook:
* Identificado por `msg.imageMessage`.

#### Processamento no Codebase:
```typescript
else if (msg.imageMessage) {
  mediaType = 'image';
  textContent = msg.imageMessage.caption || '📷 Imagem';

  if (msg.base64) {
    mediaUrl = `data:${msg.imageMessage.mimetype || 'image/jpeg'};base64,${msg.base64}`;
  } else if (msg.imageMessage.jpegThumbnail) {
    mediaUrl = `data:image/jpeg;base64,${msg.imageMessage.jpegThumbnail}`;
  }
}
```

#### Visualização no Chat:
* Imagem em alta definição com legenda, suporte a expansão em modal lightbox (zoom) e download.

---

### 🎥 2.4 Vídeos Normais (`videoMessage`)

#### Detecção no Webhook:
* Identificado por `msg.videoMessage`.

#### Processamento no Codebase:
```typescript
else if (msg.videoMessage) {
  mediaType = 'video';
  textContent = msg.videoMessage.caption || '🎥 Vídeo';

  if (msg.base64) {
    mediaUrl = `data:${msg.videoMessage.mimetype || 'video/mp4'};base64,${msg.base64}`;
  } else if (msg.videoMessage.jpegThumbnail) {
    mediaUrl = `data:image/jpeg;base64,${msg.videoMessage.jpegThumbnail}`;
  }
}
```

---

### 🎵 2.5 Áudios e Mensagens de Voz (`audioMessage`)

#### Detecção no Webhook:
* Identificado por `msg.audioMessage`.

#### Processamento no Codebase:
```typescript
else if (msg.audioMessage) {
  mediaType = 'audio';
  textContent = '🎵 Áudio';

  if (msg.base64) {
    audioBase64 = msg.base64;
    mediaUrl = `data:${msg.audioMessage.mimetype || 'audio/ogg'};base64,${msg.base64}`;
  }
}
```

#### Transcrição Automática por IA:
* Se o áudio possuir `audioBase64`, o Atendi chama o serviço de transcrição (Whisper AI) em segundo plano, preenchendo a coluna `transcription` da mensagem para que os atendentes leiam o texto do áudio e a IA consiga responder.

---

### 📄 2.6 Documentos e Arquivos (`documentMessage`)

#### Detecção no Webhook:
* Identificado por `msg.documentMessage`.

#### Processamento no Codebase:
```typescript
else if (msg.documentMessage) {
  mediaType = 'document';
  textContent = msg.documentMessage.fileName || '📄 Documento';

  if (msg.base64) {
    mediaUrl = `data:${msg.documentMessage.mimetype || 'application/pdf'};base64,${msg.base64}`;
  }
}
```

---

### 👤 2.7 Contatos VCard (`contactMessage` / `contactsArrayMessage`)

#### Detecção no Webhook:
* Identificado por `msg.contactMessage` ou `msg.contactsArrayMessage`.

#### Parsing de VCard no Codebase:
```typescript
mediaType = 'text';
textContent = '👤 Contato(s) recebido(s)';

const parsedContacts = [];
for (const c of contactsList) {
  if (c.vcard) {
    const nameMatch = c.vcard.match(/FN:(.+)/);
    const waidMatch = c.vcard.match(/waid=(\d+)/);
    const phoneMatch = c.vcard.match(/TEL.*:(.+)/);
    const photoMatch = c.vcard.match(/PHOTO.*?BASE64:([^\n\r]+)/i);

    const name = nameMatch ? nameMatch[1].trim() : c.displayName;
    const waid = waidMatch ? waidMatch[1].trim() : null;
    const phone = phoneMatch ? phoneMatch[1].trim() : null;
    const photo = photoMatch ? photoMatch[1].trim() : null;

    if (name || waid || phone) {
      parsedContacts.push({ name, waid, phone, photo });
    }
  }
}
metadata.contacts = parsedContacts;
```

---

### 📍 2.8 Localização GPS (`locationMessage` / `liveLocationMessage`)

#### Processamento no Codebase:
```typescript
if (msg.locationMessage || msg.liveLocationMessage) {
  mediaType = 'text';
  textContent = '📍 Localização recebida';
  const locMsg = msg.locationMessage || msg.liveLocationMessage;

  if (locMsg.degreesLatitude && locMsg.degreesLongitude) {
    metadata.location = {
      lat: locMsg.degreesLatitude,
      lng: locMsg.degreesLongitude,
      name: locMsg.name || null,
      address: locMsg.address || null,
      thumbnail: locMsg.jpegThumbnail || locMsg.JPEGThumbnail || null
    };
  }
}
```

---

### 📊 2.9 Enquetes (`pollCreationMessage`)

#### Processamento no Codebase:
```typescript
if (msg.pollCreationMessage || msg.pollCreationMessageV2) {
  mediaType = 'text';
  const pollObj = msg.pollCreationMessage || msg.pollCreationMessageV2;
  textContent = '📊 Enquete: ' + (pollObj?.name || 'Votação');

  if (pollObj?.options) {
    metadata.poll = {
      name: pollObj.name,
      options: pollObj.options.map((o: any) => o.optionName)
    };
  }
}
```

---

### 📞 2.10 Chamadas Perdidas de Voz/Vídeo (`call` / stub 40/41)

```typescript
else if (info?.Type === 'call' || msg.messageStubType === 'CALL_MISSED_VOICE' || msg.messageStubType === 'CALL_MISSED_VIDEO' || msg.messageStubType === 40 || msg.messageStubType === 41) {
  mediaType = 'text';
  textContent = '📞 Chamada de voz/vídeo perdida';
}
```

---

### 👍 2.11 Reações com Emoji (`reactionMessage`)

```typescript
else if (info.Type === 'reaction' || msg.reactionMessage) {
  const targetId = msg.reactionMessage?.key?.ID || msg.reactionMessage?.key?.id;
  const emoji = msg.reactionMessage?.text || '';
  if (targetId) {
    return await handleReaction(targetId, emoji);
  }
}
```

---

### ✏️ 2.12 Edição de Mensagem (`protocolMessage.type === 14`)

```typescript
if (msg.protocolMessage.type === 14 || msg.protocolMessage.type === 'MESSAGE_EDIT') {
  const editedMsg = msg.protocolMessage.editedMessage;
  if (editedMsg) {
    textContent = editedMsg.conversation || editedMsg.extendedTextMessage?.text || '[Mensagem Editada]';
    textContent = `✏️ *Editado:* ${textContent}`;
  }
}
```

---

### 🗑️ 2.13 Apagar Mensagem para Todos (`protocolMessage.type === 0` / `REVOKE`)

```typescript
else if (msg.protocolMessage.type === 0 || msg.protocolMessage.type === 'REVOKE') {
  const targetId = msg.protocolMessage.key?.id || msg.protocolMessage.key?.ID;
  if (targetId) {
    await supabaseAdmin
      .from('messages')
      .update({ is_deleted: true })
      .eq('remote_msg_id', targetId);
  }
}
```

---

## 🔐 3. Fallback de Descriptografia Nativa (`decryptWhatsAppMedia`)

Quando o servidor EvoGo envia uma mensagem multimídia sem a string `base64` já pronta, mas fornece a `URL` criptografada dos servidores da Meta e a chave `mediaKey`, o webhook do Atendi executa o fallback de **Descriptografia Nativa em Node.js (`whatsapp-decrypt.ts`)**:

```typescript
if (!msg.base64) {
  const mediaObj = msg.ptvMessage || msg.videoMessage || msg.imageMessage || msg.audioMessage || msg.documentMessage || msg.stickerMessage;
  if (mediaObj && mediaObj.URL && mediaObj.mediaKey) {
    const { decryptWhatsAppMedia } = await import('./whatsapp-decrypt');
    
    let typeKey = 'document';
    if (msg.ptvMessage || msg.videoMessage) typeKey = 'video';
    else if (msg.imageMessage || msg.stickerMessage) typeKey = 'image';
    else if (msg.audioMessage) typeKey = 'audio';

    // Descriptografa os bytes binários usando a mediaKey AES-CBC/HKDF
    const decryptedBuf = await decryptWhatsAppMedia(mediaObj.URL, mediaObj.mediaKey, typeKey);
    const mime = mediaObj.mimetype || 'application/octet-stream';
    
    mediaUrl = `data:${mime};base64,${decryptedBuf.toString('base64')}`;
  }
}
```

---

## 🔗 4. Unificação de Anúncios e LIDs (`PushName` Event)

Em campanhas de anúncios Click-to-WhatsApp (CTWA), a Meta envia a mensagem inicial do cliente utilizando um ID temporário (`@lid`). O webhook trata esse evento resolvendo o mapa entre o LID e o número de telefone real:

```typescript
if (body.event === 'PushName') {
  const jid = body.data?.JID;       // Ex: 123456789@lid
  const jidAlt = body.data?.JIDAlt; // Ex: 5511999998888@s.whatsapp.net
  const newPushName = body.data?.NewPushName;

  if (jid && jidAlt && jid.includes('@lid') && jidAlt.includes('@s.whatsapp.net')) {
    const lidNumber = jid.split('@')[0];
    const realNumber = jidAlt.split('@')[0];

    // Atualiza o contato no banco unificando o whatsapp_lid ao número real
    await supabaseAdmin
      .from('contacts')
      .update({ whatsapp_lid: lidNumber, phone: realNumber, name: newPushName })
      .eq('id', contact.id);
  }
}
```

---

## 📊 5. Resumo Geral de Mapeamento no Banco de Dados

| Tipo de Mensagem | `media_type` no Banco | Atributo Especial em `metadata` | Ação Visual no Chat |
|---|---|---|---|
| **Recado de Vídeo** | `video` | `is_ptv: true` | Renderiza o Player Circular de Vídeo em Bolinha |
| **Figurinha Animada/Estática** | `image` | - | Exibe o sticker WebP sem fundo rígido |
| **Imagem** | `image` | - | Exibe imagem HD com modal lightbox |
| **Vídeo MP4** | `video` | - | Exibe player de vídeo comum |
| **Áudio / Voz** | `audio` | `transcription` (após Whisper) | Player OGG + texto transcrito por IA |
| **Documento** | `document` | - | Card de download com nome do arquivo |
| **Localização GPS** | `text` | `location: { lat, lng, name }` | Card clicável com mapa |
| **VCard** | `text` | `contacts: [{ name, phone }]` | Card de contato com salvar/iniciar conversa |
| **Enquete** | `text` | `poll: { name, options }` | Lista de votação estruturada |

---

*Mapeamento Técnico de Webhooks e Mídias — Plataforma Atendi*
