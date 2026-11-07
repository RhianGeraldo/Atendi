import { getPhoneVariants } from "./utils";

type SendMessageParams = {
  host: string;
  token: string;
  instanceName: string;
  number: string;
  text: string;
  delay?: number;
  isRetryVariant?: boolean;
};

function getAlternativePhoneVariant(number: string): string | null {
  const isJid = number.includes("@");
  const cleanNumber = number.replace(/@.*$/, "").replace(/\D/g, "");
  const variants = getPhoneVariants(cleanNumber).filter((v) => v !== cleanNumber);
  if (variants.length > 0) {
    return isJid ? `${variants[0]}@s.whatsapp.net` : variants[0];
  }
  return null;
}

function parseStevoError(status: number, statusText: string, errorText: string) {
  let errorMessage = `Failed to send message via Stevo: ${status} ${statusText}`;
  try {
    const json = JSON.parse(errorText);
    if (json.error) errorMessage = json.error;
    else if (json.message) errorMessage = json.message;
  } catch (e) {
    // keep default
  }
  return errorMessage;
}

export type QuotedParams = {
  messageId: string;
  participant?: string;
};

export async function sendStevoText({
  host,
  token,
  instanceName,
  number,
  text,
  delay = 0,
  quoted,
  isRetryVariant = false,
}: SendMessageParams & { quoted?: QuotedParams }) {
  // Normalize host URL
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/text`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number,
      text,
      ...(delay > 0 ? { delay } : {}),
      ...(quoted && { quoted }),
    }),
    // Aparelho desconectado faz o provedor segurar a requisição sem responder.
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo API Error:', errorText);

    if (
      !isRetryVariant &&
      (errorText.toLowerCase().includes("not registered on whatsapp") ||
        errorText.toLowerCase().includes("not registered"))
    ) {
      const altNumber = getAlternativePhoneVariant(number);
      if (altNumber) {
        console.warn(
          `[sendStevoText] Número ${number} não está registrado no WhatsApp. Tentando variante de 9º dígito: ${altNumber}...`,
        );
        return await sendStevoText({
          host,
          token,
          instanceName,
          number: altNumber,
          text,
          delay,
          quoted,
          isRetryVariant: true,
        });
      }
    }

    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function sendStevoLink({
  host,
  token,
  instanceName,
  number,
  text,
  delay = 0,
  quoted,
  isRetryVariant = false,
}: SendMessageParams & { quoted?: QuotedParams }) {
  // Normalize host URL
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/link`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number,
      text,
      ...(delay > 0 ? { delay } : {}),
      ...(quoted && { quoted }),
    }),
    // Aparelho desconectado faz o provedor segurar a requisição sem responder.
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo API Error (link):', errorText);

    if (
      !isRetryVariant &&
      (errorText.toLowerCase().includes("not registered on whatsapp") ||
        errorText.toLowerCase().includes("not registered"))
    ) {
      const altNumber = getAlternativePhoneVariant(number);
      if (altNumber) {
        console.warn(
          `[sendStevoLink] Número ${number} não está registrado no WhatsApp. Tentando variante de 9º dígito: ${altNumber}...`,
        );
        return await sendStevoLink({
          host,
          token,
          instanceName,
          number: altNumber,
          text,
          delay,
          quoted,
          isRetryVariant: true,
        });
      }
    }

    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

type SendMediaParams = {
  host: string;
  token: string;
  instanceName: string;
  number: string;
  base64: string;
  mediatype: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  delay?: number;
  isRetryVariant?: boolean;
};

export async function sendStevoMedia({
  host,
  token,
  instanceName,
  number,
  base64,
  mediatype,
  caption = '',
  delay = 0,
  quoted,
  isRetryVariant = false,
}: SendMediaParams & { quoted?: QuotedParams }) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/media`;

  // Stevo expects raw base64 WITHOUT the data:...;base64, prefix
  const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const body: any = {
    number,
    url: rawBase64,
    caption,
    type: mediatype, // "image", "video", "audio", "document"
    ...(delay > 0 ? { delay } : {}),
    ...(quoted && { quoted }),
  };

  if (mediatype === 'image') {
    // NEVER pass filename for images, as Evolution API uses it to force 
    // the media to be sent as a Document (which causes the gray box).
    body.mimetype = 'image/jpeg';
  } else if (mediatype === 'document') {
    let mime = 'application/pdf';
    if (base64.startsWith('data:')) {
      mime = base64.split(';')[0].split(':')[1];
    }
    const ext = mime.split('/')[1] || 'pdf';
    body.filename = `document.${ext}`;
    body.fileName = `document.${ext}`;
    body.mimetype = mime;
  } else if (mediatype === 'audio') {
    body.filename = 'audio.ogg';
    body.fileName = 'audio.ogg';
    body.mimetype = 'audio/ogg';
  } else if (mediatype === 'video') {
    body.filename = 'video.mp4';
    body.fileName = 'video.mp4';
    body.mimetype = 'video/mp4';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // Aparelho desconectado faz o provedor segurar a requisição sem responder.
    signal: AbortSignal.timeout(50000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Media API Error:', errorText);

    if (
      !isRetryVariant &&
      (errorText.toLowerCase().includes("not registered on whatsapp") ||
        errorText.toLowerCase().includes("not registered"))
    ) {
      const altNumber = getAlternativePhoneVariant(number);
      if (altNumber) {
        console.warn(
          `[sendStevoMedia] Número ${number} não está registrado no WhatsApp. Tentando variante de 9º dígito: ${altNumber}...`,
        );
        return await sendStevoMedia({
          host,
          token,
          instanceName,
          number: altNumber,
          base64,
          mediatype,
          caption,
          delay,
          quoted,
          isRetryVariant: true,
        });
      }
    }

    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

type SendReactionParams = {
  host: string;
  token: string;
  number: string;
  remoteMsgId: string;
  emoji: string;
  fromMe?: boolean;
  participant?: string;
};

export async function sendStevoReaction({
  host,
  token,
  number,
  remoteMsgId,
  emoji,
  fromMe,
  participant,
}: SendReactionParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/react`;

  const body: any = {
    number: number.includes('@') ? number : `${number}@s.whatsapp.net`,
    id: remoteMsgId,
    reaction: emoji,
    ...(fromMe !== undefined ? { fromMe } : {}),
    ...(participant ? { participant } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Reaction API Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export type EditMessageParams = {
  host: string;
  token: string;
  number: string;
  remoteMsgId: string;
  message: string;
};

export async function editStevoMessage({
  host,
  token,
  number,
  remoteMsgId,
  message,
}: EditMessageParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/edit`;

  const body = {
    chat: number.includes('@') ? number : `${number}@s.whatsapp.net`,
    messageId: remoteMsgId,
    message: message,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Edit API Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export type DeleteMessageParams = {
  host: string;
  token: string;
  number: string;
  remoteMsgId: string;
};

export async function deleteStevoMessage({
  host,
  token,
  number,
  remoteMsgId,
}: DeleteMessageParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/delete`;

  const body = {
    chat: number.includes('@') ? number : `${number}@s.whatsapp.net`,
    messageId: remoteMsgId,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Delete API Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export type CheckUserParams = {
  host: string;
  token: string;
  numbers: string[];
};

export async function checkStevoUser({ host, token, numbers }: CheckUserParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/user/check`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number: numbers }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Check User API Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function getStevoGroupInfo({
  host,
  token,
  groupJid,
}: {
  host: string;
  token: string;
  groupJid: string;
}) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/group/info`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groupJid }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Get Group Info Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function updateStevoGroupName({
  host,
  token,
  groupJid,
  name,
}: {
  host: string;
  token: string;
  groupJid: string;
  name: string;
}) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/group/name`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groupJid, name }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Update Group Name Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function updateStevoGroupDescription({
  host,
  token,
  groupJid,
  description,
}: {
  host: string;
  token: string;
  groupJid: string;
  description: string;
}) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/group/description`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groupJid, description }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Update Group Description Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function updateStevoGroupPhoto({
  host,
  token,
  groupJid,
  image,
}: {
  host: string;
  token: string;
  groupJid: string;
  image: string;
}) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/group/photo`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ groupJid, image }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Update Group Photo Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}

export async function getStevoAvatar({
  host,
  token,
  number,
}: {
  host: string;
  token: string;
  number: string;
}) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/user/avatar`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number, preview: false }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stevo Get Avatar Error:', errorText);
    throw new Error(parseStevoError(response.status, response.statusText, errorText));
  }

  return response.json();
}
