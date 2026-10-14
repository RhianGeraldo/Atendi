/**
 * Utilitários de áudio / efeitos sonoros do sistema Atendi
 *
 * - Mensagens recebidas de clientes: Toque clássico iPhone Notification
 * - Mensagens recebidas da equipe (chat interno, grupos e conversas diretas): Toque clássico ICQ ("Uh-oh!")
 * - Mensagens enviadas: Silencioso (sem som)
 *
 * Os mp3 são decodificados uma única vez em um AudioContext compartilhado, liberado na primeira
 * interação do usuário. Isso evita o bloqueio de autoplay que `new Audio().play()` sofre com a aba
 * em segundo plano. Se o Web Audio não estiver disponível, cai para HTMLAudioElement com o MESMO mp3.
 */

const SOUNDS = {
  team: { url: "/sounds/icq-uh-oh.mp3", volume: 0.8 },
  client: { url: "/sounds/iphone-notification.mp3", volume: 0.85 },
} as const;

type SoundKey = keyof typeof SOUNDS;

let audioCtx: AudioContext | null = null;
const buffers: Partial<Record<SoundKey, AudioBuffer>> = {};
const loading: Partial<Record<SoundKey, Promise<AudioBuffer | null>>> = {};
const lastPlayed: Record<SoundKey, number> = { team: 0, client: 0 };

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) return null;
  try {
    audioCtx = new AudioCtxClass();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function loadBuffer(key: SoundKey): Promise<AudioBuffer | null> {
  if (buffers[key]) return Promise.resolve(buffers[key]!);
  if (loading[key]) return loading[key]!;

  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve(null);

  loading[key] = fetch(SOUNDS[key].url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar ${SOUNDS[key].url}`);
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers[key] = buffer;
      return buffer;
    })
    .catch((err) => {
      console.warn(`[Audio] Falha ao carregar som "${key}":`, err);
      delete loading[key];
      return null;
    });

  return loading[key]!;
}

// Desbloqueia o contexto de áudio a cada interação até ele ficar "running" (evita bloqueio de Autoplay do navegador)
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    loadBuffer("team");
    loadBuffer("client");
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
      return;
    }
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
}

function playWithHtmlAudio(key: SoundKey) {
  try {
    const audio = new Audio(SOUNDS[key].url);
    audio.volume = SOUNDS[key].volume;
    audio.play().catch((err) => {
      console.warn(`[Audio] Navegador bloqueou o som "${key}" (interaja com a página para liberar):`, err);
    });
  } catch (err) {
    console.warn(`[Audio] Erro ao reproduzir som "${key}":`, err);
  }
}

async function playSound(key: SoundKey) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastPlayed[key] < 400) return;
  lastPlayed[key] = now;

  const ctx = getAudioContext();
  if (!ctx) {
    playWithHtmlAudio(key);
    return;
  }

  if (ctx.state !== "running") {
    await ctx.resume().catch(() => {});
  }

  const buffer = await loadBuffer(key);
  if (!buffer || ctx.state !== "running") {
    playWithHtmlAudio(key);
    return;
  }

  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = SOUNDS[key].volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch (err) {
    console.warn(`[Audio] Erro no Web Audio, usando fallback para "${key}":`, err);
    playWithHtmlAudio(key);
  }
}

/**
 * Reproduz o som de nova mensagem RECEBIDA DA EQUIPE (Chat Interno — grupos e conversas diretas)
 * Som: Clássico ICQ ("Uh-oh!")
 */
export function playTeamMessageSound() {
  void playSound("team");
}

/**
 * Reproduz o som de nova mensagem RECEBIDA DE CLIENTES (Atendimentos CRM / WhatsApp / Canais)
 * Som: Clássico iPhone Notification
 */
export function playClientMessageSound() {
  void playSound("client");
}

/**
 * Alias mantido para compatibilidade
 */
export const playMessageSound = playTeamMessageSound;

/**
 * Som de login de bom dia
 */
export function playLoginSound() {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio("/sounds/bom-dia.mp3");
    audio.volume = 0.85;
    audio.play().catch(() => {});
  } catch {}
}
