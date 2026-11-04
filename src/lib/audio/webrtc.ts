import { float32ToInt16LE, int16LEToFloat32 } from "./pcm";

export const SAMPLE_RATE = 16000;
export const PCM_CHANNEL_LABEL = "pcm";
export const CAPTURE_WORKLET_URL = "/worklets/capture-processor.js";
export const PLAYBACK_WORKLET_URL = "/worklets/playback-processor.js";
export const CAPTURE_PROCESSOR_NAME = "capture-processor";
export const PLAYBACK_PROCESSOR_NAME = "playback-processor";

export interface AtendiCallsWebRTCConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  micStream: MediaStream;
  remoteStream: MediaStream;
  audioCtx: AudioContext;
  close: () => void;
  mute: () => void;
  unmute: () => void;
  isMuted: () => boolean;
}

/**
 * Abre conexão de áudio bidirecional WebRTC com o motor AtendiCalls.
 * Permite ao atendente humano falar pelo microfone do computador e ouvir
 * o áudio da chamada do WhatsApp do cliente com baixíssima latência via DataChannel PCM.
 */
export async function openAtendiCallsWebRTC(params: {
  sdpAnswerCallback: (sdpOffer: string) => Promise<string>;
  micDeviceId?: string | null;
}): Promise<AtendiCallsWebRTCConnection> {
  // Ativa cancelamento de eco acústico, supressão de ruído e controle de ganho automático
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: params.micDeviceId ? { exact: params.micDeviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
    },
  });

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

  dc.onopen = () => {
    console.log("[AtendiCalls WebRTC] ✅ DataChannel 'pcm' aberto com sucesso! Áudio bidirecional ativo.");
  };

  dc.onclose = () => {
    console.log("[AtendiCalls WebRTC] ⏹️ DataChannel 'pcm' fechado.");
  };

  dc.onerror = (e) => {
    console.error("[AtendiCalls WebRTC] ⚠️ Erro no DataChannel 'pcm':", e);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[AtendiCalls WebRTC] ICE connection state: ${pc.iceConnectionState}`);
  };

  pc.onconnectionstatechange = () => {
    console.log(`[AtendiCalls WebRTC] Peer connection state: ${pc.connectionState}`);
  };

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: SAMPLE_RATE });

  await audioCtx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await audioCtx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  let isMuted = false;

  // 1. Captura do microfone -> Envia para o WhatsApp do cliente
  const micSource = audioCtx.createMediaStreamSource(micStream);
  const captureNode = new AudioWorkletNode(audioCtx, CAPTURE_PROCESSOR_NAME);
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!isMuted && dc.readyState === "open") {
      // Se o canal acumular mais de 100ms de áudio em trânsito, descarta para evitar atraso cumulativo
      if (dc.bufferedAmount < 4096) {
        dc.send(float32ToInt16LE(e.data));
      }
    }
  };
  micSource.connect(captureNode);
  // Conectar com ganho zero para manter o worklet ativo no scheduler Web Audio sem retorno do microfone nas caixas
  const zeroGain = audioCtx.createGain();
  zeroGain.gain.value = 0;
  captureNode.connect(zeroGain);
  zeroGain.connect(audioCtx.destination);

  // 2. Recepção do WhatsApp do cliente -> Filtros de áudio para clareza e redução de ruído -> Toca no destino
  // IMPORTANTE: Toca exclusivamente aqui para evitar tocar duplicado (o que causava eco)
  const playbackNode = new AudioWorkletNode(audioCtx, PLAYBACK_PROCESSOR_NAME);

  // Filtro passa-altas (85Hz): Elimina zumbido elétrico (50/60Hz), ruídos de manuseio e deslocamento DC
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(85, audioCtx.currentTime);
  highpass.Q.setValueAtTime(0.7, audioCtx.currentTime);

  // Filtro passa-baixas (7000Hz): Remove chiado de alta frequência e ruído digital de aliasing
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(7000, audioCtx.currentTime);
  lowpass.Q.setValueAtTime(0.7, audioCtx.currentTime);

  // Compressor de dinâmica suave para estabilizar o volume da fala e evitar estalos de pico
  const voiceCompressor = audioCtx.createDynamicsCompressor();
  voiceCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
  voiceCompressor.knee.setValueAtTime(10, audioCtx.currentTime);
  voiceCompressor.ratio.setValueAtTime(2.5, audioCtx.currentTime);
  voiceCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
  voiceCompressor.release.setValueAtTime(0.2, audioCtx.currentTime);

  // Encadeia: playbackNode -> highpass -> lowpass -> voiceCompressor -> destination
  playbackNode.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(voiceCompressor);
  voiceCompressor.connect(audioCtx.destination);

  // Também mantemos streamDest para expor como MediaStream caso seja necessário para visualização
  const streamDest = audioCtx.createMediaStreamDestination();
  voiceCompressor.connect(streamDest);

  dc.onmessage = async (e: MessageEvent) => {
    try {
      let buf: ArrayBuffer;
      if (e.data instanceof ArrayBuffer) {
        buf = e.data;
      } else if (e.data instanceof Blob) {
        buf = await e.data.arrayBuffer();
      } else {
        return;
      }
      playbackNode.port.postMessage(int16LEToFloat32(buf));
    } catch (err) {
      console.warn("[AtendiCalls WebRTC] Erro ao decodificar áudio recebido:", err);
    }
  };

  // 3. Negociação SDP Offer / Answer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
    } else {
      let timeoutId: NodeJS.Timeout | null = null;
      const checkIce = () => {
        if (pc.iceGatheringState === "complete") {
          if (timeoutId) clearTimeout(timeoutId);
          pc.removeEventListener("icegatheringstatechange", checkIce);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", checkIce);
      timeoutId = setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", checkIce);
        resolve();
      }, 3500);
    }
  });

  const sdpOffer = pc.localDescription?.sdp || "";
  const sdpAnswer = await params.sdpAnswerCallback(sdpOffer);

  await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
  console.log("[AtendiCalls WebRTC] SDP Answer aplicado. Aguardando estabelecimento do canal ICE/P2P...");

  return {
    pc,
    dc,
    micStream,
    remoteStream: streamDest.stream,
    audioCtx,
    mute: () => {
      isMuted = true;
      micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    },
    unmute: () => {
      isMuted = false;
      micStream.getAudioTracks().forEach((t) => (t.enabled = true));
    },
    isMuted: () => isMuted,
    close: () => {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        if (dc.readyState === "open" || dc.readyState === "connecting") {
          dc.close();
        }
      } catch {}
      try {
        if (audioCtx.state !== "closed") {
          audioCtx.close();
        }
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
}
