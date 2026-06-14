type SendMessageParams = {
  host: string;
  token: string;
  instanceName: string;
  number: string;
  text: string;
  delay?: number;
};

export async function sendEvogoText({
  host,
  token,
  instanceName,
  number,
  text,
  delay = 1000,
  quoted,
}: SendMessageParams & { quoted?: { messageId: string, participant?: string } }) {
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
      delay,
      preview: true,
      linkPreview: true,
      ...(quoted && { quoted }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('EvoGo API Error:', errorText);
    throw new Error(`Failed to send message via EvoGo: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function sendEvogoLink({
  host,
  token,
  instanceName,
  number,
  text,
  delay = 1000,
  quoted,
}: SendMessageParams & { quoted?: { messageId: string, participant?: string } }) {
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
      delay,
      ...(quoted && { quoted }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('EvoGo API Error (link):', errorText);
    throw new Error(`Failed to send link via EvoGo: ${response.status} ${response.statusText}`);
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
};

export async function sendEvogoMedia({
  host,
  token,
  instanceName,
  number,
  base64,
  mediatype,
  caption = '',
  delay = 1000,
  quoted,
}: SendMediaParams & { quoted?: { messageId: string, participant?: string } }) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/media`;

  // EvoGo expects raw base64 WITHOUT the data:...;base64, prefix
  const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const body: any = {
    number,
    url: rawBase64,
    caption,
    type: mediatype, // "image", "video", "audio", "document"
    delay,
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('EvoGo Media API Error:', errorText);
    throw new Error(`Failed to send media via EvoGo: ${response.status} ${response.statusText}`);
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
};

export async function sendEvogoReaction({
  host,
  token,
  number,
  remoteMsgId,
  emoji,
  fromMe,
}: SendReactionParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/react`;

  const body = {
    number: number.includes('@') ? number : `${number}@s.whatsapp.net`,
    id: remoteMsgId,
    reaction: emoji,
    ...(fromMe !== undefined ? { fromMe } : {}),
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
    console.error('EvoGo Reaction API Error:', errorText);
    throw new Error(`Failed to send reaction via EvoGo: ${response.status} ${response.statusText}`);
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

export async function editEvogoMessage({
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
    console.error('EvoGo Edit API Error:', errorText);
    throw new Error(`Failed to edit message via EvoGo: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export type DeleteMessageParams = {
  host: string;
  token: string;
  number: string;
  remoteMsgId: string;
};

export async function deleteEvogoMessage({
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
    console.error('EvoGo Delete API Error:', errorText);
    throw new Error(`Failed to delete message via EvoGo: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
