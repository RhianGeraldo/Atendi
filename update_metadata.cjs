require('dotenv').config({ path: '.env.local' });
if (!process.env.SUPABASE_URL) require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error("No url/key"); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('messages')
    .update({
      metadata: {
        externalAdReply: {
            "adContextPreviewDismissed": false,
            "automatedGreetingMessageShown": true,
            "body": "O presente mais bonito que você pode dar é confiança. \nNeste Dia dos Namorados, presenteie quem você ama com autoestima de verdade. ✨\n\nVocê compra, ela ganha, e ainda leva um bônus pra você!\n\n💛 10 sessões de virilha completa + 10 sessões de perianal\n🎁 Você ganha: 10 sessões de axilas ou buço\n💙 O namorado ganha: 10 sessões de faixa da barba ou axilas\nTudo isso em 12x de R$64,90. \n\nCorre antes que esgote!\n\n👇 Clique agora e garanta agora!",
            "clickToWhatsappCall": true,
            "containsAutoReply": false,
            "containsCtwaFlowsAutoReply": false,
            "ctwaClid": "AfhudrTIGzV8XA0cI1KrlpGBGfByCmJ13IyVQMPE9rSbClmT6jNbCzHCnlVTq14t6dT6PD-thg5uIjVxofRI-lnfTYffnFrxZX2QEQ3v9m4LLECqlQJnNMnQxisgiNjml78mwoxtuA",
            "disableNudge": false,
            "greetingMessageBody": "🟢Olá! Bem-vinda(o) à Estética & Laser, diga como podemos ajudar você.",
            "mediaType": 1,
            "originalImageURL": "https://www.facebook.com/ads/image/?d=AQJpNSKSmGHVx5wOPDyX01wifFyaKV26TD2YqhvevoREd2LYF7gxAGd82TQpD9wLtkS1DyzPv4R5sWpQk6yErSm-FViAYSjH2vMvBLAaaEsKelnjrqQ83KQaxayVqwtteAfXiCiy5ZVtNiLl6lVbEq8N",
            "renderLargerThumbnail": true,
            "showAdAttribution": true,
            "sourceApp": "instagram",
            "sourceID": "120248638348740706",
            "sourceType": "ad",
            "sourceURL": "https://www.instagram.com/p/DZcidUsAGj8/",
            "thumbnailURL": "https://scontent.xx.fbcdn.net/v/t45.1600-4/719216622_122166363962715386_365854192584806524_n.png?stp=c3.3.300.300a_dst-png_p306x306&_nc_cat=101&ccb=1-7&_nc_sid=e37a05&_nc_ohc=e4Ym2ywEsfUQ7kNvwEVBoyY&_nc_oc=Adp_r5da5_fZ9qdXlDwFrilA5rqs2t38Lu5Nz28MmdiqAHrtRVf9gvdJjYzdJ29dsIJ9R24Th6YUAI3iSjkFpsiA&_nc_ad=z-m&_nc_cid=0&_nc_zt=1&_nc_ht=scontent.xx&_nc_gid=vaQd3FL9ufwRQtRg9l3ioQ&oh=00_Af_-Y-VNzbTqZMH9Tbwazz2f2lIoT6ry_abbEgtg6iqrfg&oe=6A321CEF",
            "title": "📍 Estética & Laser - Aracruz",
            "wtwaAdFormat": false
          }
      }
    })
    .eq('remote_msg_id', 'A5E4C04AC8B6AB200A8877AD6FA3ECAF');
    
  console.log(data, error);
}
run();
