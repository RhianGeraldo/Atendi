import crypto from 'crypto';
import fs from 'fs';

async function decryptWhatsAppMedia() {
  const url = "https://mmg.whatsapp.net/v/t62.7118-24/717478900_27529461160006755_8384103830594638242_n.enc?ccb=11-4&oh=01_Q5Aa4wGy4-ZNhnVqoR5L0MdrWy2HViHGSmwkyLKpo6Iid7ZiCg&oe=6A4D579E&_nc_sid=5e03e0&mms3=true";
  const mediaKeyBase64 = "YFtwWphxVy/+PKxnk3nqjeBVzVk8kGk+VsOhqgrQdzM=";
  
  const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
  
  // HKDF expansion for WhatsApp media
  const type = "WhatsApp Image Keys"; // "WhatsApp Image Keys", "WhatsApp Video Keys", "WhatsApp Audio Keys", "WhatsApp Document Keys"
  const info = Buffer.from(type);
  
  // standard hkdf
  const salt = Buffer.alloc(32); // 32 bytes of zeros
  const prk = crypto.createHmac('sha256', salt).update(mediaKey).digest();
  
  const expandLength = 112;
  const expanded = Buffer.alloc(expandLength);
  let mix = Buffer.alloc(0);
  let offset = 0;
  for (let i = 1; offset < expandLength; i++) {
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(mix);
    hmac.update(info);
    hmac.update(Buffer.from([i]));
    mix = hmac.digest();
    mix.copy(expanded, offset);
    offset += mix.length;
  }
  
  const iv = expanded.subarray(0, 16);
  const cipherKey = expanded.subarray(16, 48);
  const macKey = expanded.subarray(48, 80);
  
  console.log("Fetching media...");
  const res = await fetch(url);
  const encryptedBuffer = Buffer.from(await res.arrayBuffer());
  
  console.log("Decrypting...");
  // Decrypt AES-CBC
  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  decipher.setAutoPadding(false);
  
  let decrypted = Buffer.concat([
    decipher.update(encryptedBuffer.subarray(0, encryptedBuffer.length - 10)),
    decipher.final()
  ]);
  
  // Remove padding if PKCS7
  const pad = decrypted[decrypted.length - 1];
  if (pad > 0 && pad <= 16) {
    decrypted = decrypted.subarray(0, decrypted.length - pad);
  }
  
  fs.writeFileSync('test.jpg', decrypted);
  console.log("Saved test.jpg!");
}

decryptWhatsAppMedia().catch(console.error);
