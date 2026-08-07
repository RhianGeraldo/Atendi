import fs from 'fs';

async function run() {
  const host = 'https://evogo.erriesse.com';
  const apikey = '54085360-e3d8-4d64-9b21-00bd8ea1a6e3';
  const instanceName = 'esteticaelaser-aracruz-comercial';
  
  const ptvMessage = {
      "URL": "https://mmg.whatsapp.net/v/t62.7161-24/679504966_1764138394900299_1721306752626868121_n.enc?ccb=11-4&oh=01_Q5Aa5AEt-Urswd5x6bRIdE8sVKhiWMBdLMLpi3oPrvoQ1rK5Bg&oe=6A818FB3&_nc_sid=5e03e0&mms3=true",
      "directPath": "/v/t62.7161-24/679504966_1764138394900299_1721306752626868121_n.enc?ccb=11-4&oh=01_Q5Aa5AEt-Urswd5x6bRIdE8sVKhiWMBdLMLpi3oPrvoQ1rK5Bg&oe=6A818FB3&_nc_sid=5e03e0",
      "fileEncSHA256": "z/81KxSRyuYUl6WLJZnM7wg70JzGHMacZkw5dypJ2H4=",
      "fileLength": 4685011,
      "fileSHA256": "1tJKwM+8tmD61qAcWyNDktgzsiBMRc7y29zWlv0zhyo=",
      "height": 720,
      "mediaKey": "MjCOb9DETV8qFOxq7TWuRU1Xue54hOhi/J+Be4Trn9I=",
      "mediaKeyTimestamp": 1784294757,
      "mimetype": "video/mp4",
      "seconds": 20,
      "width": 720
  };
  
  const toBufferArray = (b64) => Array.from(Buffer.from(b64, 'base64'));

  const payload = {
    directPath: ptvMessage.directPath,
    fileEncSHA256: toBufferArray(ptvMessage.fileEncSHA256),
    fileLength: ptvMessage.fileLength,
    fileSHA256: toBufferArray(ptvMessage.fileSHA256),
    mediaKey: toBufferArray(ptvMessage.mediaKey),
    mimetype: ptvMessage.mimetype,
    url: ptvMessage.URL
  };

  const response = await fetch(`${host}/message/downloadimage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apikey },
    body: JSON.stringify(payload)
  });
  
  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text.substring(0, 500));
}

run();
