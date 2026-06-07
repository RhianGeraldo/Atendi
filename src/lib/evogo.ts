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
}: SendMessageParams) {
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
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('EvoGo API Error:', errorText);
    throw new Error(`Failed to send message via EvoGo: ${response.status} ${response.statusText}`);
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
}: SendMediaParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/send/media`;

  // EvoGo expects raw base64 WITHOUT the data:...;base64, prefix
  // FileReader.readAsDataURL() returns "data:image/jpeg;base64,/9j/4AAQ..."
  // We need to strip everything up to and including the comma
  const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  // EvoGo expects {number, url (base64 or URL), caption, type, delay}
  // Passing 'filename' for an image often forces WhatsApp to send it as a document attachment.
  const body: any = {
    number,
    url: rawBase64,
    media: rawBase64, // fallback for older Evolution API
    caption,
    type: mediatype,
    mediatype: mediatype, // fallback
    mimetype: mediatype === 'audio' ? 'audio/ogg' : mediatype === 'image' ? 'image/jpeg' : mediatype === 'video' ? 'video/mp4' : 'application/pdf',
    delay,
  };

  // Only pass filename for documents or audio
  if (mediatype === 'document' || mediatype === 'audio') {
    body.filename = mediatype === 'audio' ? 'audio.ogg' : 'document.pdf';
    body.fileName = body.filename; // fallback
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
};

export async function sendEvogoReaction({
  host,
  token,
  number,
  remoteMsgId,
  emoji,
}: SendReactionParams) {
  const baseUrl = host.endsWith('/') ? host.slice(0, -1) : host;
  const url = `${baseUrl}/message/react`;

  const body = {
    number: number.includes('@') ? number : `${number}@s.whatsapp.net`,
    id: remoteMsgId,
    reaction: emoji,
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

