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
  remoteAudio: HTMLAudioElement;
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
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: params.micDeviceId ? { deviceId: { exact: params.micDeviceId } } : true,
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
  captureNode.connect(audioCtx.destination);

  // 2. Recepção do WhatsApp do cliente -> Toca nos fones/caixa do atendente
  const playbackNode = new AudioWorkletNode(audioCtx, PLAYBACK_PROCESSOR_NAME);
  const streamDest = audioCtx.createMediaStreamDestination();
  playbackNode.connect(streamDest);
  playbackNode.connect(audioCtx.destination);
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

  // Cria elemento de áudio no navegador e vincula ao stream recebido para reprodução
  const remoteAudio = new Audio();
  remoteAudio.srcObject = streamDest.stream;
  remoteAudio.autoplay = true;
  remoteAudio.play().catch((err) => {
    console.warn("[AtendiCalls WebRTC] Autoplay aguardando interação:", err);
  });

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
    remoteAudio,
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
        remoteAudio.pause();
        remoteAudio.srcObject = null;
      } catch {}
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
