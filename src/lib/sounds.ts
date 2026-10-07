/**
 * Utilitários de áudio / efeitos sonoros do sistema Atendi
 * 
 * - Mensagens recebidas de clientes: Toque clássico iPhone Notification
 * - Mensagens recebidas da equipe (chat interno): Toque clássico ICQ ("Uh-oh!")
 * - Mensagens enviadas: Silencioso (sem som)
 */

let audioUnlocked = false;
let lastTeamSoundTimestamp = 0;
let lastClientSoundTimestamp = 0;

let cachedIcqAudio: HTMLAudioElement | null = null;
let cachedClientAudio: HTMLAudioElement | null = null;

// Desbloqueia o contexto de áudio na primeira interação do usuário com o site (evita bloqueio de Autoplay do navegador)
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    try {
      if (!cachedIcqAudio) {
        cachedIcqAudio = new Audio("/sounds/icq-uh-oh.mp3");
        cachedIcqAudio.volume = 0.8;
        cachedIcqAudio.load();
      }
      if (!cachedClientAudio) {
        cachedClientAudio = new Audio("/sounds/iphone-notification.mp3");
        cachedClientAudio.volume = 0.85;
        cachedClientAudio.load();
      }
    } catch {}

    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };

  window.addEventListener("pointerdown", unlockAudio, { passive: true, once: true });
  window.addEventListener("keydown", unlockAudio, { passive: true, once: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true, once: true });
}

/**
 * Fallback sintético via Web Audio API para o ICQ "Uh-oh" (D5 ~587Hz -> A5 ~880Hz)
 */
function playSyntheticIcqSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";

    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {}
}

/**
 * Reproduz o som de nova mensagem RECEBIDA DA EQUIPE (Chat Interno)
 * Som: Clássico ICQ ("Uh-oh!")
 */
export function playTeamMessageSound() {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastTeamSoundTimestamp < 400) return;
  lastTeamSoundTimestamp = now;

  try {
    const audio = new Audio("/sounds/icq-uh-oh.mp3");
    audio.volume = 0.8;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        playSyntheticIcqSound();
      });
    }
  } catch {
    playSyntheticIcqSound();
  }
}

/**
 * Reproduz o som de nova mensagem RECEBIDA DE CLIENTES (Atendimentos CRM / WhatsApp / Canais)
 * Som: Clássico iPhone Notification
 */
export function playClientMessageSound() {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastClientSoundTimestamp < 400) return;
  lastClientSoundTimestamp = now;

  try {
    const audio = new Audio("/sounds/iphone-notification.mp3");
    audio.volume = 0.85;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("[Audio] Não foi possível reproduzir som de cliente:", err);
      });
    }
  } catch (err) {
    console.warn("[Audio] Erro ao instanciar som de cliente:", err);
  }
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
