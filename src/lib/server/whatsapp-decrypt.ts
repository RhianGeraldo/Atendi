import crypto from 'crypto';

export async function decryptWhatsAppMedia(url: string, mediaKeyBase64: string, type: 'video' | 'image' | 'audio' | 'document' | 'ptv'): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch media from WhatsApp: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
  
  let infoStr = '';
  switch (type) {
    case 'video':
    case 'ptv':
      infoStr = 'WhatsApp Video Keys';
      break;
    case 'image':
      infoStr = 'WhatsApp Image Keys';
      break;
    case 'audio':
      infoStr = 'WhatsApp Audio Keys';
      break;
    case 'document':
      infoStr = 'WhatsApp Document Keys';
      break;
    default:
      infoStr = 'WhatsApp Document Keys';
  }

  // HKDF
  const prk = crypto.createHmac('sha256', Buffer.alloc(32)).update(mediaKey).digest();
  let okm = Buffer.alloc(0);
  let t = Buffer.alloc(0);
  let i = 1;
  while (okm.length < 112) {
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, Buffer.from(infoStr), Buffer.from([i])])).digest();
    okm = Buffer.concat([okm, t]);
    i++;
  }
  const expandedKey = okm.slice(0, 112);

  const iv = expandedKey.slice(0, 16);
  const cipherKey = expandedKey.slice(16, 48);

  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  decipher.setAutoPadding(false);

  // WhatsApp appends a 10 byte mac to the file.
  const fileBytes = buffer.slice(0, buffer.length - 10);
  let decrypted = decipher.update(fileBytes);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted;
}
